# IntentTrace Project Instructions

## Project goal
Build a VS Code extension that verifies LLM-generated Python data-analysis code against a user-confirmed intent spec. The prototype targets CSV + pandas + matplotlib scripts.

## Core workflow
1. User enters an analysis prompt.
2. User selects a CSV.
3. System infers dataset schema.
4. System creates an editable IntentDSL.
5. User confirms IntentDSL.
6. System generates Python code from confirmed IntentDSL.
7. Analyzer parses the generated code.
8. Analyzer detects target visualization sink.
9. Analyzer performs backward slicing from target line and variables.
10. Analyzer lowers sliced code into semantic operations.
11. Verifier compares semantic operations against IntentDSL.
12. VS Code UI displays semantic flowchart with highlighted slice and mismatch annotations.

## Important design constraints
- Do not build a generic GPT wrapper.
- Do not use regex as the main verification mechanism.
- The core verifier must use structured program analysis.
- The analyzer should return JSON consumed by the VS Code extension.
- The flowchart should use semantic operation nodes, not one node per source line.
- The MVP supports only top-level Python scripts using pandas and matplotlib.
- CSV is the only required data format.

## Supported semantic operations
- ReadCSV
- SelectColumns
- DropNA
- FilterRows
- GroupBy
- Aggregate
- Sort
- ParseDate
- Plot
- Unknown

## Supported warnings
- wrong_aggregation
- wrong_chart_type
- wrong_grouping
- wrong_measure
- vestigial_code
- ambiguous_target_output
- unsupported_pattern

## Testing expectations
- Add tests for analyzer functions.
- Add fixture Python files under analyzer/fixtures.
- Each Codex task should leave the repo runnable.
- Prefer small, focused changes over large rewrites.