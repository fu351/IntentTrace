from __future__ import annotations

import ast
from pathlib import Path

from schemas import ProgramNode


def parse_program(code_path: Path) -> list[ProgramNode]:
  source = code_path.read_text(encoding="utf-8")
  source_lines = source.splitlines()
  tree = ast.parse(source, filename=str(code_path))

  nodes: list[ProgramNode] = []
  for index, statement in enumerate(tree.body, start=1):
    start_line = getattr(statement, "lineno", 1)
    end_line = getattr(statement, "end_lineno", start_line)
    start_column = getattr(statement, "col_offset", 0)
    end_column = getattr(statement, "end_col_offset", 0)

    nodes.append(
      ProgramNode(
        node_id=f"node-{index}",
        kind=_statement_kind(statement),
        start_line=start_line,
        end_line=end_line,
        code_snippet=_code_snippet(source, source_lines, statement, start_line, end_line),
        defines=_defined_names(statement),
        uses=_used_names(statement),
        ast_type=statement.__class__.__name__,
        source_path=str(code_path),
        start_column=start_column,
        end_column=end_column,
        ast_node=statement,
      )
    )

  return nodes


def _statement_kind(statement: ast.stmt) -> str:
  if isinstance(statement, ast.Assign):
    return "assignment"
  if isinstance(statement, ast.AnnAssign):
    return "assignment"
  if isinstance(statement, ast.AugAssign):
    return "assignment"
  if isinstance(statement, ast.Expr):
    return "expression"
  if isinstance(statement, (ast.Import, ast.ImportFrom)):
    return "import"
  return "unknown"


def _code_snippet(
  source: str,
  source_lines: list[str],
  statement: ast.stmt,
  start_line: int,
  end_line: int,
) -> str:
  segment = ast.get_source_segment(source, statement)
  if segment:
    return segment

  if start_line < 1 or end_line < start_line:
    return ""

  return "\n".join(source_lines[start_line - 1:end_line])


def _defined_names(statement: ast.stmt) -> list[str]:
  names: set[str] = set()

  if isinstance(statement, ast.Assign):
    for target in statement.targets:
      names.update(_names_from_assignment_target(target))
  elif isinstance(statement, ast.AnnAssign):
    names.update(_names_from_assignment_target(statement.target))
  elif isinstance(statement, ast.AugAssign):
    names.update(_names_from_assignment_target(statement.target))

  return sorted(names)


def _names_from_assignment_target(target: ast.expr) -> set[str]:
  if isinstance(target, ast.Name):
    return {target.id}

  if isinstance(target, (ast.Tuple, ast.List)):
    names: set[str] = set()
    for element in target.elts:
      names.update(_names_from_assignment_target(element))
    return names

  return set()


def _used_names(statement: ast.stmt) -> list[str]:
  names: set[str] = set()

  for node in ast.walk(statement):
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
      names.add(node.id)

  return sorted(names)
