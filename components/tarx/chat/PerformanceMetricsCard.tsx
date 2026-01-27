import React from 'react';
import { TrendingUp, CheckCircle } from '../Codicon';
import styles from './performanceMetricsCard.module.css';

export interface PerformanceMetric {
  label: string;
  before: string;
  after: string;
  improvement: string;
}

export interface PerformanceMetricsCardProps {
  metrics: PerformanceMetric[];
  confidence: 'high' | 'medium' | 'low';
  onApply?: () => void;
  onSaveAsNew?: () => void;
}

/**
 * PerformanceMetricsCard - VS Code metrics/status styling
 * 3-column layout for performance comparisons
 */
export const PerformanceMetricsCard: React.FC<PerformanceMetricsCardProps> = ({
  metrics,
  confidence,
  onApply,
  onSaveAsNew,
}) => {
  const confidenceText = {
    high: 'High confidence - safe to apply',
    medium: 'Medium confidence - review recommended',
    low: 'Low confidence - manual review required',
  };

  const confidenceColor = {
    high: 'var(--vscode-success-green, #4ec9b0)',
    medium: 'var(--vscode-warning-yellow, #dcdcaa)',
    low: 'var(--vscode-error-red, #f48771)',
  };

  return (
    <div className={styles.container} role="region" aria-label="Performance metrics">
      <div className={styles.header}>
        <TrendingUp className={styles.icon} size={16} aria-hidden="true" />
        <h3 className={styles.title}>Performance Improvements</h3>
      </div>

      <div className={styles.metrics}>
        {metrics.map((metric, index) => (
          <div key={index} className={styles.metric}>
            <div className={styles.metricLabel}>{metric.label}</div>
            <div className={styles.metricValues}>
              <div className={styles.before}>
                <span className={styles.valueLabel}>Before:</span>
                <span className={styles.value}>{metric.before}</span>
              </div>
              <div className={styles.after}>
                <span className={styles.valueLabel}>After:</span>
                <span className={styles.valueAfter}>{metric.after}</span>
              </div>
            </div>
            <div className={styles.improvement}>{metric.improvement}</div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.confidence} style={{ color: confidenceColor[confidence] }}>
          <CheckCircle size={14} />
          <span>{confidenceText[confidence]}</span>
        </div>
      </div>

      <div className={styles.actions}>
        {onApply && (
          <button
            className={styles.primaryButton}
            onClick={onApply}
            type="button"
            aria-label="Apply changes"
          >
            Apply
          </button>
        )}
        {onSaveAsNew && (
          <button
            className={styles.secondaryButton}
            onClick={onSaveAsNew}
            type="button"
            aria-label="Save as new file"
          >
            Save as new file
          </button>
        )}
      </div>
    </div>
  );
};

export default PerformanceMetricsCard;
