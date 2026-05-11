import type { FlowNode, VerificationWarning } from './vscodeApi';
import {
  postDeleteWarningCode,
  postEditIntentForWarning,
  postFixWarning,
  postIgnoreWarning,
  postWarningClicked
} from './vscodeApi';

interface DetailsPanelProps {
  node: FlowNode | null;
  warnings: VerificationWarning[];
}

export function DetailsPanel({ node, warnings }: DetailsPanelProps) {
  const issues = warnings.filter((w) => w.severity !== 'info');
  const notes = warnings.filter((w) => w.severity === 'info');

  return (
    <aside className="details-panel">
      <div className="panel-heading">
        <h2>Details &amp; Issues</h2>
        <span>{issues.length}</span>
      </div>

      {node ? (
        <section className="selected-node-section">
          <div className="status-row">
            <h3>{node.title}</h3>
            <span className="status-pill" data-status={node.status}>{node.status}</span>
          </div>
          <p className="node-desc">{node.description}</p>
          <div className="source-lines">
            {node.sourceSpans.map((span) => (
              <div className="source-line" key={`${span.filePath}:${span.startLine}`}>
                <span>{shortPath(span.filePath)}</span>
                <strong>lines {span.startLine}{span.endLine !== span.startLine ? `-${span.endLine}` : ''}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="panel-hint">Select a flowchart node to see details.</p>
      )}

      {issues.length > 0 ? (
        <section className="issues-section">
          <h3>Issues ({issues.length})</h3>
          <div className="warning-list">
            {issues.map((warning) => (
              <WarningCard key={warning.warningId} warning={warning} selectedNodeId={node?.nodeId} />
            ))}
          </div>
        </section>
      ) : (
        <p className="panel-hint">No mismatches found.</p>
      )}

      {notes.length > 0 ? (
        <details className="notes-section">
          <summary>{notes.length} extra-code note{notes.length === 1 ? '' : 's'}</summary>
          <div className="warning-list">
            {notes.map((warning) => (
              <WarningCard key={warning.warningId} warning={warning} selectedNodeId={node?.nodeId} />
            ))}
          </div>
        </details>
      ) : null}
    </aside>
  );
}

function WarningCard({ warning, selectedNodeId }: { warning: VerificationWarning; selectedNodeId?: string }) {
  const isRelated = selectedNodeId && warning.nodeIds.includes(selectedNodeId);
  const canFix = warning.severity !== 'info';
  const canDelete = warning.kind === 'vestigial_code' || warning.kind === 'unsupported_pattern';

  return (
    <article className="warning-card" data-severity={warning.severity} data-related={String(Boolean(isRelated))}>
      <button className="warning-card-main" type="button" onClick={() => postWarningClicked(warning.warningId)}>
        <span className="warning-kind">{warning.kind.replace(/_/g, ' ')}</span>
        <strong>{warning.title}</strong>
        <span>{warning.userMessage}</span>
      </button>
      <div className="warning-actions">
        <button type="button" disabled={!canFix} onClick={() => postFixWarning(warning.warningId)}>Fix code</button>
        {canDelete ? (
          <button type="button" className="delete-button" onClick={() => postDeleteWarningCode(warning.warningId)}>Delete code</button>
        ) : null}
        <button type="button" onClick={() => postEditIntentForWarning(warning.warningId)}>Edit intent</button>
        <button type="button" onClick={() => postWarningClicked(warning.warningId)}>Jump</button>
        <button type="button" onClick={() => postIgnoreWarning(warning.warningId)}>Ignore</button>
      </div>
    </article>
  );
}

function shortPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').slice(-2).join('/');
}
