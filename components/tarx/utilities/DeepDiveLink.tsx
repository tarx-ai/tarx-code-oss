import React from 'react';
import { ArrowRight } from '../Codicon';
import styles from './deepDiveLink.module.css';

export interface DeepDiveLinkProps {
  onDeepDive: () => void;
  context?: string;
}

/**
 * DeepDiveLink - VS Code link styling
 * Message footer link to expand reasoning
 */
export const DeepDiveLink: React.FC<DeepDiveLinkProps> = ({
  onDeepDive,
  context = 'See full reasoning',
}) => {
  return (
    <button
      className={styles.link}
      onClick={onDeepDive}
      type="button"
      aria-label={`Deep dive: ${context}`}
    >
      <ArrowRight className={styles.icon} size={14} />
      <span className={styles.text}>Deep dive</span>
      <span className={styles.context}>{context}</span>
    </button>
  );
};

export default DeepDiveLink;
