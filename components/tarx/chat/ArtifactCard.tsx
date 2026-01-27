import React from 'react';
import { FileText, Copy, Plus, ArrowRight } from '../Codicon';
import styles from './artifactCard.module.css';

export interface ArtifactCardProps {
  type: 'code' | 'config' | 'test' | 'document';
  language: string;
  filename: string;
  content: string;
  lineCount?: number;
  onCopy?: () => void;
  onAdd?: () => void;
  onInsert?: () => void;
}

/**
 * ArtifactCard - VS Code code block styling with action buttons
 * Matches VS Code's editor code block appearance
 */
export const ArtifactCard: React.FC<ArtifactCardProps> = ({
  type,
  language,
  filename,
  content,
  lineCount,
  onCopy,
  onAdd,
  onInsert,
}) => {
  const previewLines = content.split('\n').slice(0, 8);
  const hasMore = content.split('\n').length > 8;
  const displayContent = previewLines.join('\n') + (hasMore ? '\n...' : '');

  return (
    <div className={styles.container} role="region" aria-label={`${type} artifact`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <FileText className={styles.icon} size={14} aria-hidden="true" />
          <span className={styles.languageBadge}>{language}</span>
          <span className={styles.filename}>{filename}</span>
        </div>
        {lineCount && (
          <span className={styles.lineCount}>{lineCount} lines</span>
        )}
      </div>

      <pre className={styles.codeBlock}>
        <code className={styles.code}>{displayContent}</code>
      </pre>

      <div className={styles.actions}>
        {onCopy && (
          <button
            className={styles.secondaryButton}
            onClick={onCopy}
            type="button"
            aria-label="Copy code"
          >
            <Copy size={14} />
            <span>Copy</span>
            <kbd className={styles.kbd}>⌘C</kbd>
          </button>
        )}
        {onAdd && (
          <button
            className={styles.secondaryButton}
            onClick={onAdd}
            type="button"
            aria-label="Add to workspace"
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
        )}
        {onInsert && (
          <button
            className={styles.primaryButton}
            onClick={onInsert}
            type="button"
            aria-label="Insert at cursor"
          >
            <ArrowRight size={14} />
            <span>Insert</span>
            <kbd className={styles.kbd}>⌘⏎</kbd>
          </button>
        )}
      </div>
    </div>
  );
};

export default ArtifactCard;
