import React from 'react';
import { Codicon } from '../Codicon';
import styles from './vsCodeReasoningBlock.module.css';

const Brain: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="symbol-misc" {...props} />;
const X: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="close" {...props} />;

export interface VSCodeReasoningBlockProps {
  reasoning: string;
  duration?: number;
  onClose?: () => void;
}

/**
 * VSCodeReasoningBlock - VS Code notification/info panel for full reasoning
 * Full expanded view with scrollable content
 */
export const VSCodeReasoningBlock: React.FC<VSCodeReasoningBlockProps> = ({
  reasoning,
  duration,
  onClose,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      onClose();
    }
  };

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div 
      className={styles.container}
      role="dialog"
      aria-label="Reasoning details"
      aria-modal="false"
      onKeyDown={handleKeyDown}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Brain className={styles.icon} size={16} aria-hidden="true" />
          <h3 className={styles.title}>
            Reasoning
            {duration && <span className={styles.duration}> ({duration.toFixed(1)}s)</span>}
          </h3>
        </div>
        {onClose && (
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close reasoning (Escape)"
            type="button"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.content}>
        {reasoning.split('\n\n').map((paragraph, index) => (
          <p key={index} className={styles.paragraph}>
            {paragraph}
          </p>
        ))}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>Deep dive complete</span>
      </div>
    </div>
  );
};

export default VSCodeReasoningBlock;
