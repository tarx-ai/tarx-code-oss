/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useMemo, useCallback } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import type { TarxProject, TarxHistoryItem } from '../types';

function formatTimeAgo(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return 'now';
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;

	const date = new Date(timestamp);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ProjectsSectionProps {
	collapsed: boolean;
	onToggle: () => void;
	projects: TarxProject[];
	historyItems: TarxHistoryItem[];
	isLoading?: boolean;
	onOpenProject: (projectId: string) => void;
	onCreateProject: () => void;
	onOpenSession: (sessionId: string, spaceId?: string) => void;
	selectedProjectId?: string | null;
}

export const ProjectsSection: React.FC<ProjectsSectionProps> = ({
	collapsed,
	onToggle,
	projects,
	historyItems,
	isLoading,
	onOpenProject,
	onCreateProject,
	onOpenSession,
	selectedProjectId
}) => {
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

	// Group sessions by project (space) ID
	const sessionsByProject = useMemo(() => {
		const map = new Map<string, TarxHistoryItem[]>();
		for (const item of historyItems) {
			if (item.spaceId) {
				const list = map.get(item.spaceId) || [];
				list.push(item);
				map.set(item.spaceId, list);
			}
		}
		return map;
	}, [historyItems]);

	const toggleExpand = useCallback((projectId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setExpandedProjects(prev => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	}, []);

	return (
		<CollapsibleSection
			id="projects"
			title="Projects"
			icon="root-folder"
			collapsed={collapsed}
			onToggle={onToggle}
			onAdd={onCreateProject}
			addTitle="New Project"
		>
			{isLoading ? (
				<div className="tarx-section-loading">
					<i className="codicon codicon-loading codicon-modifier-spin" />
					<span>Loading projects...</span>
				</div>
			) : projects.length === 0 ? (
				<div className="tarx-section-empty-state">
					<span className="tarx-empty-state-text">No projects yet</span>
					<button className="tarx-empty-state-btn" onClick={onCreateProject}>
						<i className="codicon codicon-add" />
						Create Project
					</button>
				</div>
			) : (
				projects.map(project => {
					const isSelected = selectedProjectId === project.id;
					const isExpanded = expandedProjects.has(project.id);
					const sessions = sessionsByProject.get(project.id) || [];
					const sessionCount = sessions.length;

					return (
						<div key={project.id} className="tarx-project-tree">
							<div
								className={`tarx-project-item${isSelected ? ' selected' : ''}${project.isActive ? ' active' : ''}`}
								title={project.path}
							>
								<span
									className={`tarx-project-chevron codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`}
									onClick={(e) => toggleExpand(project.id, e)}
								/>
								<span
									className="tarx-project-name"
									onClick={() => onOpenProject(project.id)}
								>
									{project.name}
								</span>
								{sessionCount > 0 && (
									<span className="tarx-project-session-count">{sessionCount}</span>
								)}
								{project.isActive && (
									<span className="tarx-project-active-dot" title="Active" />
								)}
							</div>
							{isExpanded && (
								<div className="tarx-project-sessions">
									{sessions.length === 0 ? (
										<div className="tarx-project-session-empty">No conversations</div>
									) : (
										sessions.map(session => (
											<div
												key={session.id}
												className="tarx-project-session-item"
												onClick={() => onOpenSession(session.id, session.spaceId)}
												title={session.title}
											>
												<span className="codicon codicon-comment-discussion tarx-session-icon" />
												<span className="tarx-session-title">{session.title}</span>
												<span className="tarx-session-time">{formatTimeAgo(session.timestamp)}</span>
											</div>
										))
									)}
								</div>
							)}
						</div>
					);
				})
			)}
		</CollapsibleSection>
	);
};
