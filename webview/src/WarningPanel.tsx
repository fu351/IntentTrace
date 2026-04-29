import type { VerificationWarning } from './vscodeApi';
import { postWarningClicked } from './vscodeApi';

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
            <button
              className="warning-card"
              data-severity={warning.severity}
              key={warning.warningId}
              type="button"
              onClick={() => postWarningClicked(warning.warningId)}
            >
              <span className="warning-kind">{warning.kind.replace(/_/g, ' ')}</span>
              <strong>{warning.title}</strong>
              <span>{warning.userMessage}</span>
            </button>
          ))}
        </div>
      )}

      {notes.length > 0 ? (
        <details className="notes-section">
          <summary>{notes.length} extra-code note{notes.length === 1 ? '' : 's'}</summary>
          <div className="warning-list">
            {notes.map((warning) => (
              <button
                className="warning-card"
                data-severity={warning.severity}
                key={warning.warningId}
                type="button"
                onClick={() => postWarningClicked(warning.warningId)}
              >
                <span className="warning-kind">{warning.kind.replace(/_/g, ' ')}</span>
                <strong>{warning.title}</strong>
                <span>{warning.userMessage}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
