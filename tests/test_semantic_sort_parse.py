from pathlib import Path
import json
import sys


def test_sort_and_parse_date_detected(tmp_path: Path):
    code = """
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv('data.csv', parse_dates=['d1'])
df['d2'] = pd.to_datetime(df['s'])
df = df.sort_values(by=['x'], ascending=False)
plt.plot(df['x'], df['y'])
"""

    code_path = tmp_path / "sample2.py"
    code_path.write_text(code, encoding="utf-8")

    analyzer_dir = Path(__file__).resolve().parents[1] / "analyzer"
    sys.path.insert(0, str(analyzer_dir))

    from parser import parse_program
    from sinks import detect_visualization_sinks, select_sink
    from slicer import build_slicing_criterion, slice_program
    from semantic import lower_to_semantic_operations
    from schemas import SliceResult

    program_nodes = parse_program(code_path)
    sinks = detect_visualization_sinks(program_nodes)
    selected = select_sink(sinks, {"chartType": "line"})
    criterion = build_slicing_criterion(selected)
    slice_result = slice_program(program_nodes, criterion)

    semantic_ops = lower_to_semantic_operations(
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

    kinds = [op.kind for op in semantic_ops]
    assert "Sort" in kinds, "Expected Sort operation to be detected"
    assert "ParseDate" in kinds, "Expected ParseDate operation to be detected"
