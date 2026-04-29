from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from flowgraph import build_flow_graph
from parser import parse_program
from schemas import AnalyzerResult, to_jsonable
from semantic import lower_to_semantic_operations
from sinks import detect_visualization_sinks, select_sink
from slicer import build_slicing_criterion, slice_program
from verifier import verify_semantics


def main(argv: list[str] | None = None) -> int:
  parser = build_arg_parser()
  args = parser.parse_args(argv)

  try:
    result = run_verify(
      code_path=args.code,
      intent_path=args.intent,
      schema_path=args.schema,
    )
    print(json.dumps(to_jsonable(result), indent=2))
    return 0
  except Exception as exc:
    error_result = {
      "error": {
        "type": exc.__class__.__name__,
        "message": str(exc),
      }
    }
    print(json.dumps(error_result, indent=2))
    return 1


def build_arg_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(prog="intenttrace-analyzer")
  subcommands = parser.add_subparsers(dest="command", required=True)

  verify_parser = subcommands.add_parser("verify", help="Verify generated code against an intent JSON file.")
  verify_parser.add_argument("--code", required=True, type=Path, help="Path to the Python code file to analyze.")
  verify_parser.add_argument("--intent", required=True, type=Path, help="Path to the intent JSON file.")
  verify_parser.add_argument("--schema", required=False, type=Path, default=None, help="Optional dataset schema JSON file.")

  return parser


def run_verify(
  code_path: Path,
  intent_path: Path,
  schema_path: Path | None = None,
) -> AnalyzerResult:
  intent = _read_json(intent_path)
  schema = _read_json(schema_path) if schema_path else None

  program_nodes = parse_program(code_path)
  sinks = detect_visualization_sinks(program_nodes)
  selected_sink = select_sink(sinks, intent)
  slicing_criterion = build_slicing_criterion(selected_sink)
  slice_result = slice_program(program_nodes, slicing_criterion)
  semantic_ops = lower_to_semantic_operations(slice_result)
  warnings = verify_semantics(semantic_ops, intent, schema)
  flow_graph = build_flow_graph(
    semantic_ops,
    warnings,
    intent_id=_intent_id(intent_path, intent),
    code_id=str(code_path),
    graph_id=f"flowgraph:{code_path.name}",
  )

  return AnalyzerResult(
    program_nodes=program_nodes,
    sinks=sinks,
    selected_sink=selected_sink,
    slicing_criterion=slicing_criterion,
    slice=slice_result,
    semantic_ops=semantic_ops,
    warnings=warnings,
    flow_graph=flow_graph,
  )


def _read_json(path: Path) -> dict[str, Any]:
  with path.open("r", encoding="utf-8") as file:
    value = json.load(file)

  if not isinstance(value, dict):
    raise ValueError(f"Expected JSON object in {path}")

  return value


def _intent_id(intent_path: Path, intent: dict[str, Any]) -> str:
  explicit_id = intent.get("id") or intent.get("intentId")
  if isinstance(explicit_id, str) and explicit_id.strip():
    return explicit_id

  return str(intent_path)


if __name__ == "__main__":
  raise SystemExit(main(sys.argv[1:]))
