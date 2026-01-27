import React, { useState } from 'react';
import { Codicon, ChevronDown, ExternalLink } from '../Codicon';
import styles from './vsCodeThinkingBlock.module.css';

// Custom icon components for missing icons
const Brain: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="symbol-misc" {...props} />;
const ChevronUp: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="chevron-up" {...props} />;

export interface VSCodeThinkingBlockProps {
  thinking: string;
  duration?: number;
  expanded?: boolean;
  onExpand?: (expanded: boolean) => void;
  onDeepDive?: () => void;
}

/**
 * VSCodeThinkingBlock - VS Code notification/info style collapsible reasoning
 * Matches VS Code's info panel styling with blue accent
 */
export const VSCodeThinkingBlock: React.FC<VSCodeThinkingBlockProps> = ({
  thinking,
  duration,
  expanded: controlledExpanded,
  onExpand,
  onDeepDive,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    if (onExpand) {
      onExpand(newExpanded);
    } else {
      setInternalExpanded(newExpanded);
    }
  };

  const truncatedText = thinking.length > 80 ? thinking.slice(0, 80) + '...' : thinking;

  return (
    <div className={styles.container} role="region" aria-label="Thinking process">
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Brain className={styles.icon} size={14} aria-hidden="true" />
          <span className={styles.title}>
            Thinking {duration && <span className={styles.duration}>({duration.toFixed(1)}s)</span>}
          </span>
        </div>
        <button
          className={styles.expandButton}
          onClick={handleToggle}
          aria-label={isExpanded ? 'Collapse reasoning' : 'Expand reasoning'}
          aria-expanded={isExpanded}
          type="button"
        >
          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
        </button>
      </div>

      <div className={`${styles.content} ${isExpanded ? styles.expanded : ''}`}>
        <p className={styles.text}>
          {isExpanded ? thinking : truncatedText}
        </p>
      </div>

      {onDeepDive && (
        <div className={styles.footer}>
          <button
            className={styles.deepDiveButton}
            onClick={onDeepDive}
            type="button"
            aria-label="View deep dive"
          >
            <ExternalLink size={12} />
            <span>Deep dive</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default VSCodeThinkingBlock;
