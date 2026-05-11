import type { VerificationWarning } from './vscodeApi';
import {
  postDeleteWarningCode,
  postEditIntentForWarning,
  postFixWarning,
  postIgnoreWarning,
  postWarningClicked
} from './vscodeApi';

interface WarningPanelProps {
  warnings: VerificationWarning[];
}

export function WarningPanel({ warnings }: WarningPanelProps) {
  const issues = warnings.filter((warning) => warning.severity !== 'info');
  const notes = warnings.filter((warning) => warning.severity === 'info');

  return (
    <section className="warning-panel" aria-label="Verification warnings">
      <div className="panel-heading">
        <h2>Issues</h2>
        <span>{issues.length}</span>
      </div>

      {issues.length === 0 ? (
        <p>No mismatches were found in the selected computation.</p>
      ) : (
        <div className="warning-list">
          {issues.map((warning) => (
            <article className="warning-card" data-severity={warning.severity} key={warning.warningId}>
              <button className="warning-card-main" type="button" onClick={() => postWarningClicked(warning.warningId)}>
                <span className="warning-kind">{warning.kind.replace(/_/g, ' ')}</span>
                <strong>{warning.title}</strong>
                <span>{warning.userMessage}</span>
              </button>
              <WarningActions warning={warning} />
            </article>
          ))}
        </div>
      )}

      {notes.length > 0 ? (
        <details className="notes-section">
          <summary>{notes.length} extra-code note{notes.length === 1 ? '' : 's'}</summary>
          <div className="warning-list">
            {notes.map((warning) => (
              <article className="warning-card" data-severity={warning.severity} key={warning.warningId}>
                <button className="warning-card-main" type="button" onClick={() => postWarningClicked(warning.warningId)}>
                  <span className="warning-kind">{warning.kind.replace(/_/g, ' ')}</span>
                  <strong>{warning.title}</strong>
                  <span>{warning.userMessage}</span>
                </button>
                <WarningActions warning={warning} />
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function WarningActions({ warning }: { warning: VerificationWarning }) {
  const canFix = warning.severity !== 'info';
  const canDelete = warning.kind === 'vestigial_code' || warning.kind === 'unsupported_pattern';
  return (
    <div className="warning-actions">
      <button type="button" disabled={!canFix} onClick={() => postFixWarning(warning.warningId)}>Fix code</button>
      {canDelete ? (
        <button type="button" className="delete-button" onClick={() => postDeleteWarningCode(warning.warningId)}>Delete code</button>
      ) : null}
      <button type="button" onClick={() => postEditIntentForWarning(warning.warningId)}>Edit intent</button>
      <button type="button" onClick={() => postWarningClicked(warning.warningId)}>Jump</button>
      <button type="button" onClick={() => postIgnoreWarning(warning.warningId)}>Ignore</button>
    </div>
  );
}
