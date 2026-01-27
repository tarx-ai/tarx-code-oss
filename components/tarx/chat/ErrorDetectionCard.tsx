import React from 'react';
import { AlertTriangle, Check } from '../Codicon';
import styles from './errorDetectionCard.module.css';

export interface ErrorDetectionCardProps {
  errorCount: number;
  beforeCode: string;
  afterCode: string;
  changes: string[];
  onAutoFix?: () => void;
  onShowDetails?: () => void;
}

/**
 * ErrorDetectionCard - VS Code error/problem styling with before/after code
 * Matches VS Code's error diagnostic panel
 */
export const ErrorDetectionCard: React.FC<ErrorDetectionCardProps> = ({
  errorCount,
  beforeCode,
  afterCode,
  changes,
  onAutoFix,
  onShowDetails,
}) => {
  return (
    <div className={styles.container} role="region" aria-label="Error detection">
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <AlertTriangle className={styles.errorIcon} size={16} aria-hidden="true" />
          <span className={styles.title}>Error Detection</span>
        </div>
        <span className={styles.badge}>
          <Check size={12} />
          Fixes {errorCount} {errorCount === 1 ? 'error' : 'errors'}
        </span>
      </div>

      <div className={styles.codeSection}>
        <div className={styles.codeLabel}>Before:</div>
        <pre className={`${styles.codeBlock} ${styles.before}`}>
          <code>{beforeCode}</code>
        </pre>
      </div>

      <div className={styles.codeSection}>
        <div className={styles.codeLabel}>After:</div>
        <pre className={`${styles.codeBlock} ${styles.after}`}>
          <code>{afterCode}</code>
        </pre>
      </div>

      {changes.length > 0 && (
        <div className={styles.changes}>
          <div className={styles.changesTitle}>Changes:</div>
          <ul className={styles.changesList}>
            {changes.map((change, index) => (
              <li key={index}>{change}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.actions}>
        {onAutoFix && (
          <button
            className={styles.primaryButton}
            onClick={onAutoFix}
            type="button"
            aria-label="Apply auto-fix"
          >
            Auto-fix
          </button>
        )}
        {onShowDetails && (
          <button
            className={styles.secondaryButton}
            onClick={onShowDetails}
            type="button"
            aria-label="Show details"
          >
            Show details
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorDetectionCard;
