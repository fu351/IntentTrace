# IntentTrace Weather Demo

This demo uses the prompt:

> Make a bar chart of average temperature by state.

The confirmed intent in `intent_weather.json` expects:

- group by `state`
- measure `temperature`
- aggregation `mean`
- chart type `bar`

The generated script in `analysis_bad.py` intentionally does the wrong thing:

- it counts temperature values instead of averaging them
- it uses `plt.plot(...)` instead of `plt.bar(...)`
- it includes vestigial work: `backup`, `print(df.head())`, and an unrelated humidity analysis

## Quick confidence check

From the repository root:

```powershell
python analyzer/main.py verify --code demo/analysis_bad.py --intent demo/intent_weather.json
```

Expected result:

- `slice.relevantNodeIds` includes the CSV read, `dropna`, the `summary` groupby/count, `plt.plot`, and `plt.show`
- `slice.irrelevantNodeIds` includes `backup`, `print(df.head())`, and `humidity`
- `warnings` includes `wrong_aggregation` and `wrong_chart_type`
- `flowGraph.nodes` marks relevant computation nodes as active and vestigial operations as dimmed

For a short check:

```powershell
python analyzer/main.py verify --code demo/analysis_bad.py --intent demo/intent_weather.json | python -c "import json,sys; p=json.load(sys.stdin); print([w['kind'] for w in p['warnings']]); print([(n['title'], n['status']) for n in p['flowGraph']['nodes']])"
```

You should see `wrong_aggregation`, `wrong_chart_type`, and at least one `vestigial` node.

## Run the VS Code demo

1. Open this repository in VS Code.
2. Run `npm install` if dependencies are not installed.
3. Run `npm run compile:all`.
4. Open `demo/intent_weather.json` and point out the confirmed intent:
   - `groupBy`: `state`
   - `measure`: `temperature`
   - `aggregation`: `mean`
   - `chartType`: `bar`
5. Open `demo/analysis_bad.py` and point out the generated code:
   - `count()` on line 9 is the wrong aggregation
   - the humidity analysis on line 10 is unrelated
   - `plt.plot(...)` on line 11 is the wrong chart type
6. Set the VS Code setting `intenttrace.intentPath` to `demo/intent_weather.json`.
7. With `demo/analysis_bad.py` active, run `IntentTrace: Run Verifier` from the command palette.

The IntentTrace webview should open with the semantic flowchart. Click nodes or warnings to jump to the matching source lines. Error nodes should point to the count aggregation and line chart. Vestigial nodes should be visibly dimmed.

## Presentation path

Use this order for a clean mid-project walkthrough:

1. Show the intent JSON as the user-confirmed specification.
2. Show the Python file as the generated analysis code.
3. Run `IntentTrace: Run Verifier`.
4. In the flowchart, explain the green/relevant path: load data, remove missing values, group by state, count temperature, draw a line chart.
5. Open the Issues panel and show:
   - Wrong calculation: the code counts temperature instead of averaging it.
   - Wrong chart type: the code draws a line chart instead of a bar chart.
6. Expand the extra-code notes to show vestigial code.
7. Click the wrong calculation warning to jump to the `count()` line.
8. Click the wrong chart type warning to jump to the `plt.plot(...)` line.
