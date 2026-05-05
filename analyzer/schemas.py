from __future__ import annotations

from dataclasses import dataclass, field, fields, is_dataclass
from typing import Any, Literal


JsonValue = dict[str, Any] | list[Any] | str | int | float | bool | None


@dataclass(frozen=True)
class SourceSpan:
  file_path: str
  start_line: int
  start_column: int
  end_line: int
  end_column: int


@dataclass(frozen=True)
class ProgramNode:
  node_id: str
  kind: str
  start_line: int
  end_line: int
  code_snippet: str
  defines: list[str] = field(default_factory=list)
  uses: list[str] = field(default_factory=list)
  ast_type: str = "Unknown"
  source_path: str = field(default="", metadata={"serialize": False})
  start_column: int = field(default=0, metadata={"serialize": False})
  end_column: int = field(default=0, metadata={"serialize": False})
  ast_node: Any = field(default=None, compare=False, metadata={"serialize": False})

  @property
  def span(self) -> SourceSpan:
    return SourceSpan(
      file_path=self.source_path,
      start_line=self.start_line,
      start_column=self.start_column,
      end_line=self.end_line,
      end_column=self.end_column,
    )


@dataclass(frozen=True)
class VisualizationSink:
  sink_id: str
  node_id: str
  source_span: SourceSpan
  call_name: str
  variables_used: list[str]
  columns_used: list[str]
  inferred_chart_type: Literal["line", "bar", "scatter", "histogram"]
  provenance_origins: list[str] = field(default_factory=list)
  provenance_confidence: float = 0.0

  @property
  def span(self) -> SourceSpan:
    return self.source_span


@dataclass(frozen=True)
class SlicingCriterion:
  target_node_id: str | None = None
  target_line: int | None = None
  variables: list[str] = field(default_factory=list)
  sink: VisualizationSink | None = None


@dataclass(frozen=True)
class DependencyEdge:
  source: str
  target: str
  variable: str


@dataclass(frozen=True)
class SliceResult:
  criterion: SlicingCriterion
  nodes: list[ProgramNode] = field(default_factory=list)
  spans: list[SourceSpan] = field(default_factory=list)
  relevant_node_ids: list[str] = field(default_factory=list)
  irrelevant_node_ids: list[str] = field(default_factory=list)
  dependency_edges: list[DependencyEdge] = field(default_factory=list)


@dataclass(frozen=True)
class SemanticOperation:
  op_id: str
  kind: Literal[
    "ReadCSV",
    "SelectColumns",
    "DropNA",
    "FilterRows",
    "GroupBy",
    "Aggregate",
    "Sort",
    "ParseDate",
    "Plot",
    "PlotFormatting",
    "Unknown",
  ]
  label: str
  lay_description: str
  source_node_ids: list[str]
  source_spans: list[SourceSpan]
  params: dict[str, Any] = field(default_factory=dict)
  in_slice: bool = False

  @property
  def id(self) -> str:
    return self.op_id

  @property
  def type(self) -> str:
    return self.kind


@dataclass(frozen=True)
class VerificationWarning:
  warning_id: str
  kind: Literal[
    "wrong_aggregation",
    "wrong_chart_type",
    "wrong_grouping",
    "wrong_measure",
    "wrong_x_label",
    "wrong_y_label",
    "wrong_title",
    "vestigial_code",
    "ambiguous_target_output",
    "unsupported_pattern",
  ]
  severity: Literal["info", "warning", "error"]
  op_id: str
  node_ids: list[str]
  source_spans: list[SourceSpan]
  title: str
  user_message: str
  technical_message: str
  expected: Any = None
  actual: Any = None

  @property
  def id(self) -> str:
    return self.warning_id

  @property
  def related_operation_ids(self) -> list[str]:
    return [self.op_id]


@dataclass(frozen=True)
class FlowNode:
  node_id: str
  op_id: str
  kind: str
  title: str
  description: str
  status: Literal["relevant", "vestigial", "warning", "error", "unsupported"]
  source_node_ids: list[str]
  source_spans: list[SourceSpan]
  warning_ids: list[str] = field(default_factory=list)
  params: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FlowEdge:
  edge_id: str
  source: str
  target: str
  label: str | None = None


@dataclass(frozen=True)
class FlowGraph:
  graph_id: str
  intent_id: str
  code_id: str
  nodes: list[FlowNode] = field(default_factory=list)
  edges: list[FlowEdge] = field(default_factory=list)
  warnings: list[VerificationWarning] = field(default_factory=list)


@dataclass(frozen=True)
class AnalyzerResult:
  program_nodes: list[ProgramNode]
  sinks: list[VisualizationSink]
  selected_sink: VisualizationSink | None
  slicing_criterion: SlicingCriterion
  slice: SliceResult
  semantic_ops: list[SemanticOperation]
  warnings: list[VerificationWarning]
  flow_graph: FlowGraph


def to_jsonable(value: Any) -> JsonValue:
  if is_dataclass(value):
    return {
      to_camel_case(item.name): to_jsonable(getattr(value, item.name))
      for item in fields(value)
      if item.metadata.get("serialize", True)
    }

  if isinstance(value, dict):
    return {to_camel_case(str(key)): to_jsonable(item) for key, item in value.items()}

  if isinstance(value, list):
    return [to_jsonable(item) for item in value]

  return value


def to_camel_case(value: str) -> str:
  parts = value.split("_")
  return parts[0] + "".join(part.capitalize() for part in parts[1:])
