import type { FlowNode, VerificationWarning } from './vscodeApi';

interface NodeDetailsProps {
  node: FlowNode | null;
  warnings: VerificationWarning[];
}

export function NodeDetails({ node, warnings }: NodeDetailsProps) {
  if (!node) {
    return (
      <aside className="details-panel">
        <h2>Operation details</h2>
        <p>Select a flowchart node to see what it does and where it came from.</p>
      </aside>
    );
  }

  const nodeWarnings = warnings.filter((warning) => node.warningIds.includes(warning.warningId));

  return (
    <aside className="details-panel">
      <div className="status-row">
        <h2>{node.title}</h2>
        <span className="status-pill" data-status={node.status}>{node.status}</span>
      </div>
      <p>{node.description}</p>

      <section className="details-section">
        <h3>Source lines</h3>
        {node.sourceSpans.map((span) => (
          <div className="source-line" key={`${span.filePath}:${span.startLine}`}>
            <span>{shortPath(span.filePath)}</span>
            <strong>lines {span.startLine}{span.endLine !== span.startLine ? `-${span.endLine}` : ''}</strong>
          </div>
        ))}
      </section>

      {nodeWarnings.length > 0 ? (
        <section className="details-section">
          <h3>Warnings for this step</h3>
          {nodeWarnings.map((warning) => (
            <div className="inline-warning" data-severity={warning.severity} key={warning.warningId}>
              <strong>{warning.title}</strong>
              <p>{warning.userMessage}</p>
            </div>
          ))}
        </section>
      ) : (
        <section className="details-section">
          <h3>Warnings</h3>
          <p>No warnings are attached to this step.</p>
        </section>
      )}
    </aside>
  );
}

function shortPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').slice(-2).join('/');
}
