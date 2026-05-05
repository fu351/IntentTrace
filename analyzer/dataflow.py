"""
analyzer.dataflow
-----------------

Design and API for a lightweight dataflow/def-use + taint propagation pass
used to robustly identify plotting sinks and trace DataFrame/Series provenance.

This file contains data structures, function signatures, and algorithm
pseudocode for an SSA-lite def-use graph with taint propagation. It is
intentionally written as a clear design artifact and a minimal, importable
module to be implemented incrementally.

Goal:
- Provide `DataflowAnalyzer` which builds a DefUseGraph from an AST, seeds
  taints (e.g. DataFrame, Series), propagates taints through assignments and
  call results, and offers backward-slicing utilities for sink identification.

Notes:
- Keep analysis top-level-only (no full interprocedural SSA) for MVP.
- Use conservative heuristics for unknown constructs and return confidence
  scores for each provenance result.
"""
from __future__ import annotations

import ast
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Set, Tuple, Optional, Any


class TaintKind(Enum):
    DATAFRAME = "DataFrame"
    SERIES = "Series"
    NUMERIC = "NumericSeries"
    INDEX = "Index"
    PLOT_ARGS = "PlotArgs"
    UNKNOWN = "Unknown"


@dataclass
class VarDef:
    """Represents a variable definition (assignment target)."""

    name: str
    node: ast.AST
    lineno: int


@dataclass
class UseSite:
    """Represents a use of a variable/name in an expression."""

    name: str
    node: ast.AST
    lineno: int


@dataclass
class DefUseGraph:
    """Lightweight def-use structure.

    - `defs`: var name -> list of VarDef (multiple defs possible)
    - `uses`: var name -> list of UseSite
    - `assign_nodes`: list of assignment AST nodes encountered (for traversal)
    """

    defs: Dict[str, List[VarDef]] = field(default_factory=dict)
    uses: Dict[str, List[UseSite]] = field(default_factory=dict)
    assign_nodes: List[ast.AST] = field(default_factory=list)


@dataclass
class Provenance:
    """Provenance summary for a variable/expression.

    - `origins`: set of human-readable origin labels (e.g., 'read_csv', 'groupby')
    - `taints`: set of `TaintKind`
    - `confidence`: float 0..1 representing certainty of the provenance
    """

    origins: Set[str] = field(default_factory=set)
    taints: Set[TaintKind] = field(default_factory=set)
    confidence: float = 0.0


@dataclass
class DataflowResult:
    graph: DefUseGraph
    taint_map: Dict[str, Provenance]  # var name -> provenance
    node_provenance: Dict[int, Provenance] = field(default_factory=dict)
    # node_provenance maps ast.AST.lineno to provenance for easy lookup


class DataflowAnalyzer:
    """Main analysis entrypoint.

    Usage:
        analyzer = DataflowAnalyzer()
        result = analyzer.analyze(ast_tree)

    The `result` provides the def-use graph, a variable->provenance map,
    and helpers to compute backward slices and find candidate plot sinks.
    """

    def __init__(self) -> None:
        # options/config knobs can be added here later (e.g., max_worklist_size)
        self.max_slice_nodes = 1000

    def analyze(self, tree: ast.AST) -> DataflowResult:
        """Perform full analysis: build def-use graph, seed taints, propagate.

        Steps (high-level):
        1. build_def_use(tree)
        2. seed initial taints (pd.read_csv, pd.DataFrame constructors, literal lists)
        3. propagate_taints across assignments and call returns
        4. compute node-level provenance for interesting nodes

        Returns a DataflowResult suitable for downstream slicing.
        """

        graph = self.build_def_use(tree)
        taint_map = self.propagate_taints(tree, graph)
        node_prov = self._compute_node_provenance(tree, graph, taint_map)
        return DataflowResult(graph=graph, taint_map=taint_map, node_provenance=node_prov)

    def build_def_use(self, tree: ast.AST) -> DefUseGraph:
        """Traverse AST and record defs/uses.

        Algorithm sketch:
        - Walk AST with ast.NodeVisitor
        - For Assign/AnnAssign/AugAssign: extract target variable names and record VarDef
        - For Name nodes in Load context: record UseSite
        - For Attribute/Name in calls: record uses of base names

        Implementation note: treat attribute accesses like `df.col` as uses of `df` and
        a 'virtual' name `df.col` for column-level defs when assigned via `df['col'] = ...`.
        """

        graph = DefUseGraph()

        class _DUVisitor(ast.NodeVisitor):
            def visit_Assign(self, node: ast.Assign) -> None:
                graph.assign_nodes.append(node)
                # Record defs for simple Name targets
                for target in node.targets:
                    if isinstance(target, ast.Name):
                        name = target.id
                        graph.defs.setdefault(name, []).append(VarDef(name, node, getattr(node, 'lineno', -1)))
                    elif isinstance(target, ast.Attribute):
                        # record base attribute as def candidate (e.g., df.col)
                        base = self._attr_to_str(target)
                        if base:
                            graph.defs.setdefault(base, []).append(VarDef(base, node, getattr(node, 'lineno', -1)))
                self.generic_visit(node)

            def visit_Name(self, node: ast.Name) -> None:
                if isinstance(node.ctx, ast.Load):
                    graph.uses.setdefault(node.id, []).append(UseSite(node.id, node, getattr(node, 'lineno', -1)))

            def _attr_to_str(self, node: ast.Attribute) -> Optional[str]:
                parts: List[str] = []
                cur: ast.AST = node
                while isinstance(cur, ast.Attribute):
                    parts.insert(0, cur.attr)
                    cur = cur.value
                if isinstance(cur, ast.Name):
                    parts.insert(0, cur.id)
                    return '.'.join(parts)
                return None

        _DUVisitor().visit(tree)
        return graph

    def propagate_taints(self, tree: ast.AST, graph: DefUseGraph) -> Dict[str, Provenance]:
        """Seed and propagate taints across defs/uses.

        Seeding rules (examples):
        - If an Assign value is a Call and its func is `pd.read_csv`, seed assigned var with DATAFRAME and origin 'read_csv'.
        - If an Assign value is a Call and its func is `DataFrame(...)`, similarly seed DATAFRAME.
        - If an expression is `df['col']` or `df.col` used on RHS, propagate SERIES taint.

        Propagation rules (examples):
        - x = y => x inherits provenance(y)
        - x = y.method(...) => attempt to derive provenance from y and method name
        - For binary expressions, merge taints and reduce confidence as needed

        Returns a mapping varname -> Provenance.
        """

        taint_map: Dict[str, Provenance] = {}

        # Seed pass: scan assignments for obvious producers
        for node in graph.assign_nodes:
            # handle simple pattern: name = call(...)
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                func = node.value.func
                func_name = self._get_full_name(func)
                targets = [t for t in node.targets if isinstance(t, ast.Name)]
                if func_name and targets:
                    target_name = targets[0].id
                    prov = Provenance(origins=set(), taints=set(), confidence=0.5)
                    if func_name.endswith('read_csv'):
                        prov.origins.add('read_csv')
                        prov.taints.add(TaintKind.DATAFRAME)
                        prov.confidence = 0.95
                    elif func_name.endswith('DataFrame'):
                        prov.origins.add('DataFrame')
                        prov.taints.add(TaintKind.DATAFRAME)
                        prov.confidence = 0.8
                    else:
                        # leave unseeded for now
                        pass
                    if prov.origins:
                        taint_map[target_name] = prov

            # handle pattern: name = df['col']  -> seed SERIES taint
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Subscript):
                sub = node.value
                # detect simple df['col'] or df[col_const]
                if isinstance(sub.value, ast.Name):
                    base_name = sub.value.id
                    # single Name target only (conservative)
                    targets = [t for t in node.targets if isinstance(t, ast.Name)]
                    if targets:
                        target_name = targets[0].id
                        # check for constant string slice
                        slice_node = sub.slice
                        col_name = None
                        if isinstance(slice_node, ast.Constant) and isinstance(slice_node.value, str):
                            col_name = slice_node.value

                        prov = Provenance(origins=set(), taints=set(), confidence=0.0)
                        prov.origins.add(f"column:{col_name}" if col_name else "column:unknown")
                        prov.taints.add(TaintKind.SERIES)
                        prov.confidence = 0.9
                        taint_map[target_name] = prov

        # Conservative propagation pass: simple worklist over defs
        worklist: List[str] = list(taint_map.keys())
        while worklist:
            var = worklist.pop()
            prov = taint_map.get(var)
            if not prov:
                continue
            # Look at uses of var and propagate to defs that directly assign from uses
            for use in graph.uses.get(var, []):
                # find defs that are assignment targets in the same lineno neighborhood
                # (a simple heuristic for x = y)
                defs = graph.defs.get(var, [])
                for d in defs:
                    # Find LHS names that assign from this var (very conservative)
                    # For now, mark defs' name with same provenance
                    if d.name not in taint_map:
                        taint_map[d.name] = Provenance(origins=set(prov.origins), taints=set(prov.taints), confidence=prov.confidence * 0.9)
                        worklist.append(d.name)

        # Heuristic propagation: examine all assigns to propagate known taints
        for node in graph.assign_nodes:
            if not isinstance(node, ast.Assign):
                continue
            # single target conservative handling
            targets = [t for t in node.targets if isinstance(t, ast.Name)]
            if not targets:
                continue
            target_name = targets[0].id

            # RHS is a Name -> inherit provenance
            val = node.value
            if isinstance(val, ast.Name):
                src = val.id
                src_prov = taint_map.get(src)
                if src_prov:
                    existing = taint_map.get(target_name)
                    merged = Provenance(origins=set(src_prov.origins), taints=set(src_prov.taints), confidence=src_prov.confidence * 0.95)
                    if existing:
                        merged.origins.update(existing.origins)
                        merged.taints.update(existing.taints)
                        merged.confidence = max(merged.confidence, existing.confidence)
                    taint_map[target_name] = merged
                    worklist.append(target_name)

            # RHS is a Call on a known base: e.g., df.groupby(...), df.dropna()
            if isinstance(val, ast.Call) and isinstance(val.func, ast.Attribute):
                base = val.func.value
                method = val.func.attr
                base_name = base.id if isinstance(base, ast.Name) else None
                base_prov = taint_map.get(base_name) if base_name else None
                if base_prov:
                    # propagate taint with reduced confidence and record the method
                    prov = Provenance(origins=set(base_prov.origins), taints=set(base_prov.taints), confidence=base_prov.confidence * 0.85)
                    prov.origins.add(f"method:{method}")
                    # some methods return Series (e.g., df['col'] handled earlier), groupby returns DataFrameGroupBy (treat as DataFrame)
                    if method in {"plot", "plotly", "hist", "bar", "scatter"}:
                        prov.taints.add(TaintKind.PLOT_ARGS)
                    if method in {"groupby", "resample"}:
                        prov.taints.add(TaintKind.DATAFRAME)
                    if method in {"mean", "sum", "min", "max", "std", "median", "agg", "apply"}:
                        prov.taints.add(TaintKind.SERIES)
                    # merge into existing
                    existing = taint_map.get(target_name)
                    if existing:
                        prov.origins.update(existing.origins)
                        prov.taints.update(existing.taints)
                        prov.confidence = max(prov.confidence, existing.confidence)
                    taint_map[target_name] = prov
                    worklist.append(target_name)

            # RHS is an Attribute access that may reference a column (df.col) or property
            if isinstance(val, ast.Attribute):
                base = val.value
                if isinstance(base, ast.Name):
                    base_name = base.id
                    base_prov = taint_map.get(base_name)
                    if base_prov:
                        prov = Provenance(origins=set(base_prov.origins), taints=set(base_prov.taints), confidence=base_prov.confidence * 0.9)
                        # attribute access likely yields Series
                        prov.taints.add(TaintKind.SERIES)
                        prov.origins.add(f"attr:{val.attr}")
                        taint_map[target_name] = prov
                        worklist.append(target_name)

        return taint_map

    def _compute_node_provenance(self, tree: ast.AST, graph: DefUseGraph, taint_map: Dict[str, Provenance]) -> Dict[int, Provenance]:
        """Map AST lineno -> provenance by inspecting calls and expressions.

        This produces a compact summary used by the semantic lowering step to
        attach provenance and confidence to semantic operations.
        """

        node_prov: Dict[int, Provenance] = {}

        # Map taint_map entries to their VarDef nodes (assignment lineno)
        for varname, prov in taint_map.items():
            defs = graph.defs.get(varname, [])
            for d in defs:
                lineno = getattr(d.node, 'lineno', -1)
                existing = node_prov.get(lineno)
                if existing:
                    # merge conservatively
                    merged = Provenance(origins=set(existing.origins), taints=set(existing.taints), confidence=max(existing.confidence, prov.confidence))
                    merged.origins.update(prov.origins)
                    merged.taints.update(prov.taints)
                    node_prov[lineno] = merged
                else:
                    node_prov[lineno] = Provenance(origins=set(prov.origins), taints=set(prov.taints), confidence=prov.confidence)

        # Also compute provenance for Call nodes by inspecting args (Names, Subscript, Attribute)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                combined = Provenance(origins=set(), taints=set(), confidence=0.0)
                for arg in node.args:
                    if isinstance(arg, ast.Name):
                        p = taint_map.get(arg.id)
                        if p:
                            combined.origins.update(p.origins)
                            combined.taints.update(p.taints)
                            combined.confidence = max(combined.confidence, p.confidence)
                    elif isinstance(arg, ast.Subscript):
                        # e.g., df['col'] -> seed from base df and include column origin if available
                        if isinstance(arg.value, ast.Name):
                            base = arg.value.id
                            p = taint_map.get(base)
                            if p:
                                combined.origins.update(p.origins)
                                combined.taints.update(p.taints)
                                combined.confidence = max(combined.confidence, p.confidence * 0.9)
                        # attempt to capture constant column name
                        slice_node = arg.slice
                        if isinstance(slice_node, ast.Constant) and isinstance(slice_node.value, str):
                            combined.origins.add(f"column:{slice_node.value}")
                            combined.taints.add(TaintKind.SERIES)
                            combined.confidence = max(combined.confidence, 0.9)
                    elif isinstance(arg, ast.Attribute):
                        # e.g., df.col -> treat as series from base
                        if isinstance(arg.value, ast.Name):
                            base = arg.value.id
                            p = taint_map.get(base)
                            if p:
                                combined.origins.update(p.origins)
                                combined.taints.update(p.taints)
                                combined.confidence = max(combined.confidence, p.confidence * 0.9)

                if combined.origins or combined.taints:
                    node_prov[getattr(node, 'lineno', -1)] = combined

        return node_prov

    def find_plot_sinks(self, tree: ast.AST, df_result: DataflowResult) -> List[Tuple[ast.Call, Provenance]]:
        """Return list of candidate plot sinks with aggregated provenance and confidence.

        Heuristics used:
        - Any Call whose function name endswith 'plot' or whose attribute base is 'plt' or 'ax'
        - DataFrame.plot calls (df.plot)
        For each candidate, compute a backward slice of its arguments and merge provenance.
        """

        candidates: List[Tuple[ast.Call, Provenance]] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func_name = self._get_full_name(node.func)
                if not func_name:
                    continue
                if func_name.endswith('.plot') or func_name.endswith('plot') or func_name.startswith('plt.') or func_name.startswith('ax.'):
                    # compute provenance by looking at node_provenance + backward slice
                    lineno = getattr(node, 'lineno', -1)
                    prov = df_result.node_provenance.get(lineno, Provenance(origins=set(), taints=set(), confidence=0.0))
                    # augment provenance by slicing argument names
                    slice_nodes = self.backward_slice([node], df_result.graph)
                    # merge node-level provenances for slice (simple heuristic)
                    merged = Provenance(origins=set(prov.origins), taints=set(prov.taints), confidence=prov.confidence)
                    for n in slice_nodes:
                        p = df_result.node_provenance.get(getattr(n, 'lineno', -1))
                        if p:
                            merged.origins.update(p.origins)
                            merged.taints.update(p.taints)
                            merged.confidence = max(merged.confidence, p.confidence * 0.9)
                    candidates.append((node, merged))
        return candidates

    def backward_slice(self, target_nodes: List[ast.AST], graph: DefUseGraph) -> Set[ast.AST]:
        """Compute a backward slice: AST nodes contributing to target expressions.

        Algorithm (worklist):
        - Initialize worklist with variable names referenced directly by `target_nodes`.
        - For each var in worklist, add its VarDef nodes and any nodes that use those vars.
        - Continue until worklist empty or node limit reached.
        - Return set of AST nodes discovered.
        """

        result: Set[ast.AST] = set()
        vars_worklist: List[str] = []

        # seed: collect Name nodes from target_nodes
        for t in target_nodes:
            for child in ast.walk(t):
                if isinstance(child, ast.Name):
                    vars_worklist.append(child.id)

        visited_vars: Set[str] = set()
        nodes_found: Set[ast.AST] = set()
        while vars_worklist and len(nodes_found) < self.max_slice_nodes:
            v = vars_worklist.pop()
            if v in visited_vars:
                continue
            visited_vars.add(v)
            # add defs for v
            for d in graph.defs.get(v, []):
                nodes_found.add(d.node)
                # find uses inside the def's value and seed more vars
                if isinstance(d.node, ast.Assign):
                    val = d.node.value
                    # collect names used by the RHS expression to continue slicing
                    for sub in ast.walk(val):
                        if isinstance(sub, ast.Name):
                            if sub.id not in visited_vars:
                                vars_worklist.append(sub.id)
                        # if RHS contains a Subscript like df['col'], seed the base name
                        if isinstance(sub, ast.Subscript):
                            if isinstance(sub.value, ast.Name):
                                base = sub.value.id
                                if base not in visited_vars:
                                    vars_worklist.append(base)
                        # include calls on attributes: df.groupby(...)
                        if isinstance(sub, ast.Attribute) and isinstance(sub.value, ast.Name):
                            base = sub.value.id
                            if base not in visited_vars:
                                vars_worklist.append(base)

        return nodes_found

    def _get_full_name(self, node: ast.AST) -> Optional[str]:
        """Return dotted name for Name/Attribute nodes, e.g. `pd.read_csv` or `df.plot`.

        Returns `None` for complex expressions.
        """

        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            parts: List[str] = []
            cur: ast.AST = node
            while isinstance(cur, ast.Attribute):
                parts.insert(0, cur.attr)
                cur = cur.value
            if isinstance(cur, ast.Name):
                parts.insert(0, cur.id)
                return '.'.join(parts)
        return None


__all__ = [
    'DataflowAnalyzer',
    'DataflowResult',
    'DefUseGraph',
    'Provenance',
    'TaintKind',
]
