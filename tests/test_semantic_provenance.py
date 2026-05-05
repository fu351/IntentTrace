from pathlib import Path
import json

import sys

# Ensure analyzer package modules that import top-level names (e.g. `from schemas import`) resolve
ANALYZER_DIR = Path(__file__).resolve().parents[1] / "analyzer"
sys.path.insert(0, str(ANALYZER_DIR))

import parser
import sinks as sinks_mod
import slicer
import semantic
from schemas import SliceResult


def test_plot_semantic_includes_provenance(tmp_path: Path):
    code = """
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv('data.csv')
plt.plot(df['x'], df['y'])
"""

    code_path = tmp_path / "sample.py"
    intent_path = tmp_path / "intent.json"

    code_path.write_text(code, encoding="utf-8")
    intent_path.write_text(json.dumps({"chartType": "line"}), encoding="utf-8")

    program_nodes = parser.parse_program(code_path)
    sinks = sinks_mod.detect_visualization_sinks(program_nodes)
    selected = sinks_mod.select_sink(sinks)
    criterion = slicer.build_slicing_criterion(selected)
    slice_result = slicer.slice_program(program_nodes, criterion)

    semantic_ops = semantic.lower_to_semantic_operations(
        SliceResult(
            criterion=slice_result.criterion,
            nodes=[node for node in program_nodes if node.kind != "import"],
            spans=[node.span for node in program_nodes if node.kind != "import"],
            relevant_node_ids=slice_result.relevant_node_ids,
            irrelevant_node_ids=slice_result.irrelevant_node_ids,
            dependency_edges=slice_result.dependency_edges,
        ),
        sinks,
    )

    plots = [op for op in semantic_ops if op.kind == "Plot"]
    assert plots, "Expected at least one Plot semantic operation"

    params = plots[0].params
    assert "provenanceOrigins" in params, "Plot params should include provenanceOrigins"
    assert isinstance(params["provenanceOrigins"], list)
    assert "provenanceConfidence" in params, "Plot params should include provenanceConfidence"
    assert isinstance(params["provenanceConfidence"], float)
    assert params["provenanceConfidence"] > 0.0, "Expected positive provenance confidence from dataflow analyzer"
