import React, { useState } from 'react';
import styles from './codeComparisonCard.module.css';

export interface CodeComparisonCardProps {
  before: string;
  after: string;
  language: string;
  summary?: string;
  onApply?: () => void;
  onKeepOriginal?: () => void;
}

/**
 * CodeComparisonCard - VS Code diff editor styling with before/after tabs
 * Matches VS Code's diff view exactly
 */
export const CodeComparisonCard: React.FC<CodeComparisonCardProps> = ({
  before,
  after,
  language,
  summary,
  onApply,
  onKeepOriginal,
}) => {
  const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');

  return (
    <div className={styles.container} role="region" aria-label="Code comparison">
      <div className={styles.tabs} role="tablist">
        <button
          className={`${styles.tab} ${activeTab === 'before' ? styles.active : ''}`}
          onClick={() => setActiveTab('before')}
          role="tab"
          aria-selected={activeTab === 'before'}
          aria-controls="before-panel"
          type="button"
        >
          Before
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'after' ? styles.active : ''}`}
          onClick={() => setActiveTab('after')}
          role="tab"
          aria-selected={activeTab === 'after'}
          aria-controls="after-panel"
          type="button"
        >
          After
        </button>
      </div>

      {activeTab === 'before' && (
        <div id="before-panel" role="tabpanel" className={styles.panel}>
          <pre className={`${styles.codeBlock} ${styles.beforeCode}`}>
            <code>{before}</code>
          </pre>
        </div>
      )}

      {activeTab === 'after' && (
        <div id="after-panel" role="tabpanel" className={styles.panel}>
          <pre className={`${styles.codeBlock} ${styles.afterCode}`}>
            <code>{after}</code>
          </pre>
        </div>
      )}

      {summary && (
        <div className={styles.summary}>
          {summary}
        </div>
      )}

      <div className={styles.actions}>
        {onApply && (
          <button
            className={styles.primaryButton}
            onClick={onApply}
            type="button"
            aria-label="Apply changes"
          >
            Apply changes
          </button>
        )}
        {onKeepOriginal && (
          <button
            className={styles.secondaryButton}
            onClick={onKeepOriginal}
            type="button"
            aria-label="Keep original"
          >
            Keep original
          </button>
        )}
      </div>
    </div>
  );
};

export default CodeComparisonCard;
