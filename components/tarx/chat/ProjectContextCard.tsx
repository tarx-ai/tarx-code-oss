import React from 'react';
import { FolderOpen, FileText, Wrench, Code, Database } from '../Codicon';
import styles from './projectContextCard.module.css';

export interface ProjectContextCardProps {
  project: string;
  currentFile: string;
  framework: string;
  language: string;
  database?: string;
}

/**
 * ProjectContextCard - VS Code toolbar-style project metadata
 * Matches VS Code editor toolbar styling exactly
 */
export const ProjectContextCard: React.FC<ProjectContextCardProps> = ({
  project,
  currentFile,
  framework,
  language,
  database,
}) => {
  return (
    <div className={styles.container} role="complementary" aria-label="Project context">
      <div className={styles.grid}>
        <div className={styles.item}>
          <FolderOpen className={styles.icon} size={14} aria-hidden="true" />
          <span className={styles.label}>Project</span>
          <span className={styles.value}>{project}</span>
        </div>

        <div className={styles.item}>
          <FileText className={styles.icon} size={14} aria-hidden="true" />
          <span className={styles.label}>File</span>
          <span className={styles.value}>{currentFile}</span>
        </div>

        <div className={styles.item}>
          <Wrench className={styles.icon} size={14} aria-hidden="true" />
          <span className={styles.label}>Framework</span>
          <span className={styles.value}>{framework}</span>
        </div>

        <div className={styles.item}>
          <Code className={styles.icon} size={14} aria-hidden="true" />
          <span className={styles.label}>Language</span>
          <span className={styles.value}>{language}</span>
        </div>

        {database && (
          <div className={styles.item}>
            <Database className={styles.icon} size={14} aria-hidden="true" />
            <span className={styles.label}>Database</span>
            <span className={styles.value}>{database}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectContextCard;
