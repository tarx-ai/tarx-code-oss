/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useRef, useState, useMemo } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { SectionItem } from './SectionItem';
import type { TarxUploadedFile } from '../types';

interface FilesSectionProps {
	collapsed: boolean;
	onToggle: () => void;
	files: TarxUploadedFile[];
	onOpenView: (viewId: string) => void;
	onUploadFile: (filename: string, content: string, size: number, mimeType: string) => void;
	onDeleteFile: (fileId: string) => void;
	onScanDirectory?: () => void;
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase() || '';
	switch (ext) {
		case 'ts': case 'tsx': return 'symbol-namespace';
		case 'js': case 'jsx': return 'symbol-method';
		case 'py': return 'symbol-method';
		case 'json': return 'json';
		case 'md': return 'markdown';
		case 'html': case 'htm': return 'globe';
		case 'css': case 'scss': case 'less': return 'symbol-color';
		case 'yaml': case 'yml': return 'settings-gear';
		case 'xml': return 'code';
		case 'pdf': return 'file-pdf';
		case 'doc': case 'docx': return 'file-text';
		case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': return 'file-media';
		case 'txt': return 'file-text';
		case 'rs': return 'symbol-struct';
		case 'go': return 'symbol-interface';
		case 'java': case 'kt': return 'symbol-class';
		case 'sh': case 'bash': case 'zsh': return 'terminal';
		default: return 'file';
	}
}

function formatTimeAgo(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;

	const date = new Date(timestamp);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Group scanned files by their parent directory */
function groupByDirectory(files: TarxUploadedFile[]): Map<string, TarxUploadedFile[]> {
	const groups = new Map<string, TarxUploadedFile[]>();
	for (const file of files) {
		const dirPath = file.originalPath
			? file.originalPath.substring(0, file.originalPath.lastIndexOf('/'))
			: 'Unknown';
		// Use last two path components for display
		const parts = dirPath.split('/');
		const label = parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : dirPath;
		if (!groups.has(label)) {
			groups.set(label, []);
		}
		groups.get(label)!.push(file);
	}
	return groups;
}

const FileItem: React.FC<{
	file: TarxUploadedFile;
	onDeleteFile: (id: string) => void;
}> = ({ file, onDeleteFile }) => (
	<div className="tarx-uploaded-file" data-file-id={file.id}>
		<span className={`tarx-file-icon codicon codicon-${getFileIcon(file.filename)}`} />
		<span className="tarx-file-name" title={file.originalPath || file.filename}>
			{file.filename}
		</span>
		<span className="tarx-file-meta">
			<span className="tarx-file-size">{formatFileSize(file.size)}</span>
			<span className="tarx-file-time">{formatTimeAgo(file.uploadedAt)}</span>
		</span>
		{!file.isReference && (
			<span
				className="tarx-file-attach codicon codicon-attach"
				title="Attach to chat"
				onClick={(e) => {
					e.stopPropagation();
					// @ts-ignore - vscode is injected by webview
					if (typeof vscode !== 'undefined') {
						vscode.postMessage({
							command: 'attachFileToChat',
							fileId: file.id
						});
					}
				}}
			/>
		)}
		<span
			className="tarx-file-delete codicon codicon-trash"
			title="Remove file"
			onClick={(e) => {
				e.stopPropagation();
				onDeleteFile(file.id);
			}}
		/>
	</div>
);

export const FilesSection: React.FC<FilesSectionProps> = ({
	collapsed,
	onToggle,
	files,
	onOpenView,
	onUploadFile,
	onDeleteFile,
	onScanDirectory
}) => {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

	// Split files into uploaded vs scanned
	const { uploaded, scanned } = useMemo(() => {
		const uploaded: TarxUploadedFile[] = [];
		const scanned: TarxUploadedFile[] = [];
		for (const f of files) {
			if (f.sourceType === 'scan' || f.sourceType === 'git') {
				scanned.push(f);
			} else {
				uploaded.push(f);
			}
		}
		return { uploaded, scanned };
	}, [files]);

	const scannedGroups = useMemo(() => groupByDirectory(scanned), [scanned]);

	const toggleDir = (dir: string) => {
		setCollapsedDirs(prev => {
			const next = new Set(prev);
			if (next.has(dir)) {
				next.delete(dir);
			} else {
				next.add(dir);
			}
			return next;
		});
	};

	const handleUploadClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(e.target.files || []);
		for (const file of selectedFiles) {
			const content = await readFileAsText(file);
			onUploadFile(file.name, content, file.size, file.type || 'text/plain');
		}
		// Reset input
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	};

	const handleDragEnter = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
	};

	const handleDrop = async (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);

		const droppedFiles = Array.from(e.dataTransfer.files);
		for (const file of droppedFiles) {
			const content = await readFileAsText(file);
			onUploadFile(file.name, content, file.size, file.type || 'text/plain');
		}
	};

	const readFileAsText = (file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(file);
		});
	};

	const totalCount = files.length;
	const sectionTitle = totalCount > 0 ? `Files (${totalCount})` : 'Files';

	return (
		<div
			className={`tarx-section-wrapper ${isDragOver ? 'drag-over' : ''}`}
			onDragOver={handleDragOver}
			onDragEnter={handleDragEnter}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<CollapsibleSection
				id="files"
				title={sectionTitle}
				icon="files"
				collapsed={collapsed}
				onToggle={onToggle}
			>
				{/* Header upload button */}
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept=".txt,.md,.pdf,.doc,.docx,.py,.js,.ts,.json,.yaml,.yml,.xml,.html,.css"
					style={{ display: 'none' }}
					onChange={handleFileChange}
				/>

				{/* Default items */}
				<SectionItem
					icon="files"
					label="Explorer"
					onClick={() => onOpenView('workbench.view.explorer')}
				/>
				<SectionItem
					icon="search"
					label="Search"
					onClick={() => onOpenView('workbench.view.search')}
				/>

				{/* Uploaded Files Group */}
				<div className="tarx-section-divider">Uploaded</div>
				<div className="tarx-uploaded-files" data-container-id="uploaded-files">
					{uploaded.length === 0 ? (
						<div
							className="tarx-empty-state clickable"
							onClick={handleUploadClick}
						>
							Drop files here or click to upload
						</div>
					) : (
						uploaded.map(file => (
							<FileItem key={file.id} file={file} onDeleteFile={onDeleteFile} />
						))
					)}
				</div>

				{/* Scanned Files Group */}
				{scanned.length > 0 && (
					<>
						<div className="tarx-section-divider">Scanned ({scanned.length})</div>
						<div className="tarx-scanned-files">
							{Array.from(scannedGroups.entries()).map(([dir, dirFiles]) => (
								<div key={dir} className="tarx-scanned-dir-group">
									<div
										className="tarx-scanned-dir-header"
										onClick={() => toggleDir(dir)}
									>
										<span className={`codicon codicon-${collapsedDirs.has(dir) ? 'chevron-right' : 'chevron-down'}`} />
										<span className="codicon codicon-folder" />
										<span className="tarx-scanned-dir-label" title={dir}>{dir}</span>
										<span className="tarx-scanned-dir-count">{dirFiles.length}</span>
									</div>
									{!collapsedDirs.has(dir) && (
										<div className="tarx-scanned-dir-files">
											{dirFiles.map(file => (
												<FileItem key={file.id} file={file} onDeleteFile={onDeleteFile} />
											))}
										</div>
									)}
								</div>
							))}
						</div>
					</>
				)}

				{/* Scan Directory Button */}
				{onScanDirectory && (
					<div className="tarx-scan-directory-btn" onClick={onScanDirectory}>
						<span className="codicon codicon-folder-opened" />
						<span>Scan Directory...</span>
					</div>
				)}
			</CollapsibleSection>
		</div>
	);
};
