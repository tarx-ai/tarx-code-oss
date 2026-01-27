import React, { useState, useEffect } from 'react';
import { Codicon } from '../Codicon';
import styles from './progressIndicator.module.css';

const X: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="close" {...props} />;

export interface ProgressIndicatorProps {
  status: string;
  elapsed?: number;
  canCancel?: boolean;
  onCancel?: () => void;
}

/**
 * ProgressIndicator - VS Code activity bar spinner styling
 * Inline spinner matching VS Code's progress indicators
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  status,
  elapsed,
  canCancel = false,
  onCancel,
}) => {
  const [dots, setDots] = useState('...');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === '...') return '.';
        if (prev === '.') return '..';
        return '...';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const formatElapsed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `0:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={styles.container} role="status" aria-live="polite" aria-label={status}>
      <div className={styles.spinner} aria-hidden="true">
        <div className={styles.spinnerCircle} />
      </div>

      <div className={styles.statusContainer}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span className={styles.status}>{status}</span>
      </div>

      <span className={styles.animatedText}>
        {status}<span className={styles.dots}>{dots}</span>
      </span>

      {elapsed !== undefined && (
        <span className={styles.elapsed}>({formatElapsed(elapsed)})</span>
      )}

      {canCancel && onCancel && (
        <button
          className={styles.cancelButton}
          onClick={onCancel}
          aria-label="Cancel operation"
          type="button"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default ProgressIndicator;
