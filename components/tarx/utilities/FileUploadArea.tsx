import React, { useRef, useState } from 'react';
import { FolderOpen, CheckCircle, Codicon } from '../Codicon';
import styles from './fileUploadArea.module.css';

const XCircle: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="error" {...props} />;
const X: React.FC<{ className?: string; size?: number }> = (props) =>
  <Codicon name="close" {...props} />;

export interface FileUploadAreaProps {
  onFileSelect: (file: File) => void;
  onError?: (error: string) => void;
  maxSize?: number;
  isUploading?: boolean;
  uploadProgress?: number;
  uploadedFile?: string;
}

/**
 * FileUploadArea - VS Code input styling with drag-drop
 * Matches VS Code's file input appearance
 */
export const FileUploadArea: React.FC<FileUploadAreaProps> = ({
  onFileSelect,
  onError,
  maxSize = 10 * 1024 * 1024, // 10MB default
  isUploading = false,
  uploadProgress = 0,
  uploadedFile,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFile = (file: File) => {
    if (file.size > maxSize) {
      const errorMsg = `File too large. Maximum size is ${(maxSize / 1024 / 1024).toFixed(0)}MB`;
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    setError(null);
    onFileSelect(file);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  if (uploadedFile) {
    return (
      <div className={`${styles.container} ${styles.success}`}>
        <CheckCircle className={styles.successIcon} size={24} />
        <div className={styles.successText}>
          <div className={styles.status}>Ready to analyze</div>
          <div className={styles.filename}>{uploadedFile}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.container} ${styles.error}`}>
        <XCircle className={styles.errorIcon} size={24} />
        <div className={styles.errorText}>
          <div className={styles.status}>{error}</div>
          <button className={styles.retryButton} onClick={() => setError(null)} type="button">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (isUploading) {
    return (
      <div className={styles.container}>
        <div className={styles.uploadingContent}>
          <div className={styles.filename}>{uploadedFile || 'Uploading...'}</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
          </div>
          <div className={styles.progressText}>{uploadProgress}%</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.container} ${isDragging ? styles.dragging : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Upload file"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <FolderOpen className={styles.icon} size={32} />
      <div className={styles.text}>Drag file here or click to upload</div>
      <input
        ref={inputRef}
        type="file"
        className={styles.hiddenInput}
        onChange={handleFileInput}
        aria-label="File input"
      />
    </div>
  );
};

export default FileUploadArea;
