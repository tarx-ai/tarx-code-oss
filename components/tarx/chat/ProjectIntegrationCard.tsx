import React, { useState } from 'react';
import { FileText, ChevronRight, ChevronDown } from '../Codicon';
import styles from './projectIntegrationCard.module.css';

export interface FileChange {
  path: string;
  status: 'modified' | 'created' | 'deleted';
  linesAdded: number;
  linesRemoved: number;
  diff?: string;
}

export interface ProjectIntegrationCardProps {
  filesAffected: FileChange[];
  onApplyAll?: () => void;
}

/**
 * ProjectIntegrationCard - VS Code file explorer styling
 * Matches VS Code's source control file list
 */
export const ProjectIntegrationCard: React.FC<ProjectIntegrationCardProps> = ({
  filesAffected,
  onApplyAll,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const totalAdded = filesAffected.reduce((sum, file) => sum + file.linesAdded, 0);
  const totalRemoved = filesAffected.reduce((sum, file) => sum + file.linesRemoved, 0);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const statusColors = {
    modified: 'var(--vscode-warning-yellow, #dcdcaa)',
    created: 'var(--vscode-success-green, #4ec9b0)',
    deleted: 'var(--vscode-error-red, #f48771)',
  };

  const statusLabels = {
    modified: 'MODIFIED',
    created: 'CREATED',
    deleted: 'DELETED',
  };

  return (
    <div className={styles.container} role="region" aria-label="Project integration">
      <div className={styles.header}>
        <span className={styles.title}>{filesAffected.length} files will be affected</span>
        <span className={styles.summary}>
          <span className={styles.added}>+{totalAdded}</span>
          {' '}
          <span className={styles.removed}>-{totalRemoved}</span>
        </span>
      </div>

      <div className={styles.fileList}>
        {filesAffected.map((file) => {
          const isExpanded = expandedFiles.has(file.path);

          return (
            <div key={file.path} className={styles.fileItem}>
              <button
                className={styles.fileHeader}
                onClick={() => file.diff && toggleFile(file.path)}
                aria-expanded={isExpanded}
                aria-label={`${file.path} - ${statusLabels[file.status]}`}
                type="button"
                disabled={!file.diff}
              >
                {file.diff && (
                  isExpanded ? 
                    <ChevronDown className={styles.chevron} size={14} /> : 
                    <ChevronRight className={styles.chevron} size={14} />
                )}
                <FileText className={styles.fileIcon} size={14} />
                <span className={styles.filePath}>{file.path}</span>
                <span 
                  className={styles.status}
                  style={{ color: statusColors[file.status] }}
                >
                  {statusLabels[file.status]}
                </span>
                <span className={styles.changes}>
                  <span className={styles.added}>+{file.linesAdded}</span>
                  {' '}
                  <span className={styles.removed}>-{file.linesRemoved}</span>
                </span>
              </button>

              {isExpanded && file.diff && (
                <pre className={styles.diff}>
                  <code>{file.diff}</code>
                </pre>
              )}
            </div>
          );
        })}
      </div>

      {onApplyAll && (
        <div className={styles.actions}>
          <button
            className={styles.primaryButton}
            onClick={onApplyAll}
            type="button"
            aria-label={`Apply to all ${filesAffected.length} files`}
          >
            Apply to all {filesAffected.length} files
          </button>
        </div>
      )}
    </div>
  );
};

export default ProjectIntegrationCard;
