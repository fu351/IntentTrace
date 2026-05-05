from __future__ import annotations

import ast

from analyzer.dataflow import DataflowAnalyzer


def test_dataflow_detects_simple_plot_call():
    code = """
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv('data.csv')
plt.plot(df['x'], df['y'])
"""

    tree = ast.parse(code)
    analyzer = DataflowAnalyzer()
    result = analyzer.analyze(tree)
    sinks = analyzer.find_plot_sinks(tree, result)

    assert len(sinks) >= 1, "Expected at least one plot sink to be detected"
    # ensure the detected sink has non-zero provenance/confidence and reference to read_csv
    found_confident = False
    found_read_csv = False
    for _call, prov in sinks:
        if prov.confidence > 0:
            found_confident = True
        if any(o for o in prov.origins if 'read_csv' in o or o.startswith('column:')):
            found_read_csv = True

    assert found_confident, "Expected at least one sink to carry provenance confidence"
    assert found_read_csv, "Expected provenance to reference read_csv or column origin"
