import type { AnalysisPayload } from './vscodeApi';

const sourceSpan = {
  filePath: 'analyzer/fixtures/semantic_example.py',
  startLine: 8,
  startColumn: 0,
  endLine: 8,
  endColumn: 72
};

export const fixturePayload: AnalysisPayload = {
  flowGraph: {
    graphId: 'fixture-graph',
    intentId: 'fixture-intent',
    codeId: 'semantic_example.py',
    nodes: [
      {
        nodeId: 'flow-node-1',
        opId: 'op-1',
        kind: 'ReadCSV',
        title: 'Read CSV',
        description: 'Load rows from weather.csv.',
        status: 'relevant',
        sourceNodeIds: ['node-3'],
        sourceSpans: [{ ...sourceSpan, startLine: 5, endLine: 5 }],
        warningIds: [],
        params: { source: 'weather.csv' }
      },
      {
        nodeId: 'flow-node-2',
        opId: 'op-2',
        kind: 'DropNA',
        title: 'Drop missing values',
        description: 'Remove rows missing values in state and temperature.',
        status: 'relevant',
        sourceNodeIds: ['node-4'],
        sourceSpans: [{ ...sourceSpan, startLine: 6, endLine: 6 }],
        warningIds: [],
        params: { subset: ['state', 'temperature'] }
      },
      {
        nodeId: 'flow-node-3',
        opId: 'op-3',
        kind: 'GroupBy',
        title: 'Group rows',
        description: 'Group rows by state.',
        status: 'relevant',
        sourceNodeIds: ['node-5'],
        sourceSpans: [{ ...sourceSpan, startLine: 7, endLine: 7 }],
        warningIds: [],
        params: { groupBy: ['state'] }
      },
      {
        nodeId: 'flow-node-4',
        opId: 'op-4',
        kind: 'Aggregate',
        title: 'Aggregate with count',
        description: 'Calculate the count of temperature for each group.',
        status: 'error',
        sourceNodeIds: ['node-6'],
        sourceSpans: [sourceSpan],
        warningIds: ['warning-1'],
        params: { function: 'count', measure: 'temperature' }
      },
      {
        nodeId: 'flow-node-5',
        opId: 'op-5',
        kind: 'Aggregate',
        title: 'Aggregate with mean',
        description: 'Calculate the mean of humidity for each group.',
        status: 'vestigial',
        sourceNodeIds: ['node-7'],
        sourceSpans: [{ ...sourceSpan, startLine: 9, endLine: 9 }],
        warningIds: [],
        params: { function: 'mean', measure: 'humidity' }
      },
      {
        nodeId: 'flow-node-6',
        opId: 'op-6',
        kind: 'Plot',
        title: 'Plot line chart',
        description: 'Draw a line chart.',
        status: 'error',
        sourceNodeIds: ['node-8'],
        sourceSpans: [{ ...sourceSpan, startLine: 10, endLine: 10 }],
        warningIds: ['warning-2'],
        params: { chartType: 'line' }
      },
      {
        nodeId: 'flow-node-7',
        opId: 'op-7',
        kind: 'PlotFormatting',
        title: 'Plot formatting',
        description: 'Set the chart x-axis label.',
        status: 'error',
        sourceNodeIds: ['node-9'],
        sourceSpans: [{ ...sourceSpan, startLine: 11, endLine: 11 }],
        warningIds: ['warning-3'],
        params: {
          formatTypes: ['xLabel'],
          values: { xLabel: 'Region' },
          formats: [{ formatType: 'xLabel', value: 'Region', callName: 'plt.xlabel' }]
        }
      },
      {
        nodeId: 'flow-node-8',
        opId: 'op-8',
        kind: 'Unknown',
        title: 'Unsupported statement',
        description: 'This statement is not recognized by the current semantic lowerer.',
        status: 'unsupported',
        sourceNodeIds: ['node-10'],
        sourceSpans: [{ ...sourceSpan, startLine: 12, endLine: 12 }],
        warningIds: [],
        params: { astType: 'Expr' }
      }
    ],
    edges: [
      { edgeId: 'flow-edge-1', source: 'flow-node-1', target: 'flow-node-2' },
      { edgeId: 'flow-edge-2', source: 'flow-node-2', target: 'flow-node-3' },
      { edgeId: 'flow-edge-3', source: 'flow-node-3', target: 'flow-node-4' },
      { edgeId: 'flow-edge-4', source: 'flow-node-4', target: 'flow-node-5' },
      { edgeId: 'flow-edge-5', source: 'flow-node-5', target: 'flow-node-6' },
      { edgeId: 'flow-edge-6', source: 'flow-node-6', target: 'flow-node-7' },
      { edgeId: 'flow-edge-7', source: 'flow-node-7', target: 'flow-node-8' }
    ],
    warnings: []
  },
  warnings: [
    {
      warningId: 'warning-1',
      kind: 'wrong_aggregation',
      severity: 'error',
      opId: 'op-4',
      nodeIds: ['node-6'],
      sourceSpans: [sourceSpan],
      title: 'Aggregation does not match',
      userMessage: 'The code uses count, but the intent asks for mean.',
      technicalMessage: 'Sliced Aggregate operation params.function differs from intent.aggregation.',
      expected: 'mean',
      actual: 'count'
    },
    {
      warningId: 'warning-2',
      kind: 'wrong_chart_type',
      severity: 'error',
      opId: 'op-6',
      nodeIds: ['node-8'],
      sourceSpans: [{ ...sourceSpan, startLine: 10, endLine: 10 }],
      title: 'Chart type does not match',
      userMessage: 'The code draws a line chart, but the intent asks for bar.',
      technicalMessage: 'Sliced Plot operation params.chartType differs from intent.chartType.',
      expected: 'bar',
      actual: 'line'
    },
    {
      warningId: 'warning-3',
      kind: 'wrong_x_label',
      severity: 'error',
      opId: 'op-7',
      nodeIds: ['node-9'],
      sourceSpans: [{ ...sourceSpan, startLine: 11, endLine: 11 }],
      title: 'Wrong x-axis label',
      userMessage: 'The x-axis label says "Region", but the intent expects "state".',
      technicalMessage: 'Sliced PlotFormatting operation params.value does not match expected xLabel.',
      expected: 'state',
      actual: 'Region'
    }
  ]
};

fixturePayload.flowGraph.warnings = fixturePayload.warnings;
