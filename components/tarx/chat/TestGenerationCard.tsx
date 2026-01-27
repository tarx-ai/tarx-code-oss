import React, { useState } from 'react';
import { CheckCircle, ChevronDown, Codicon } from '../Codicon';
import styles from './testGenerationCard.module.css';

const ChevronUp: React.FC<{ size?: number }> = (props) =>
  <Codicon name="chevron-up" {...props} />;

export interface TestGenerationCardProps {
  filename: string;
  testCount: number;
  coverage: number;
  tests: string[];
  onCreateFile?: () => void;
  onPreview?: () => void;
  onAddToProject?: () => void;
}

/**
 * TestGenerationCard - VS Code test runner output styling
 * Matches VS Code's test explorer appearance
 */
export const TestGenerationCard: React.FC<TestGenerationCardProps> = ({
  filename,
  testCount,
  coverage,
  tests,
  onCreateFile,
  onPreview,
  onAddToProject,
}) => {
  const [showAll, setShowAll] = useState(false);
  const displayTests = showAll ? tests : tests.slice(0, 3);

  return (
    <div className={styles.container} role="region" aria-label="Test generation">
      <div className={styles.header}>
        <CheckCircle className={styles.icon} size={16} aria-hidden="true" />
        <h3 className={styles.title}>Test Generation</h3>
      </div>

      <div className={styles.filePath}>
        <code>{filename}</code>
      </div>

      <div className={styles.metrics}>
        <span className={styles.metric}>{testCount} test cases</span>
        <span className={styles.separator}>|</span>
        <span className={styles.coverage}>{coverage}% coverage</span>
      </div>

      <div className={styles.testList}>
        {displayTests.map((test, index) => (
          <div key={index} className={styles.testItem}>
            <CheckCircle className={styles.testIcon} size={12} aria-hidden="true" />
            <span className={styles.testName}>{test}</span>
          </div>
        ))}
      </div>

      {tests.length > 3 && (
        <button
          className={styles.showAllButton}
          onClick={() => setShowAll(!showAll)}
          type="button"
          aria-label={showAll ? `Hide ${tests.length - 3} tests` : `Show all ${testCount} tests`}
        >
          {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{showAll ? 'Show less' : `Show all ${testCount}`}</span>
        </button>
      )}

      <div className={styles.actions}>
        {onCreateFile && (
          <button
            className={styles.primaryButton}
            onClick={onCreateFile}
            type="button"
            aria-label="Create test file"
          >
            Create test file
          </button>
        )}
        {onPreview && (
          <button
            className={styles.secondaryButton}
            onClick={onPreview}
            type="button"
            aria-label="Preview tests"
          >
            Preview
          </button>
        )}
        {onAddToProject && (
          <button
            className={styles.secondaryButton}
            onClick={onAddToProject}
            type="button"
            aria-label="Add to project"
          >
            Add to project
          </button>
        )}
      </div>
    </div>
  );
};

export default TestGenerationCard;
