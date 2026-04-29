import type { VerificationWarning } from './vscodeApi';
import { postWarningClicked } from './vscodeApi';

interface WarningPanelProps {
  warnings: VerificationWarning[];
}

export function WarningPanel({ warnings }: WarningPanelProps) {
  return (
    <section className="warning-panel" aria-label="Verification warnings">
      <div className="panel-heading">
        <h2>Warnings</h2>
        <span>{warnings.length}</span>
      </div>

      {warnings.length === 0 ? (
        <p>No mismatches were found in the selected computation.</p>
      ) : (
        <div className="warning-list">
          {warnings.map((warning) => (
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
    </section>
  );
}
