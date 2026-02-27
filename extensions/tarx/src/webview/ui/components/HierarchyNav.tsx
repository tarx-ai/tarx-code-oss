/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import { SearchInput, Badge, Button, Card, IconButton, VS } from './ui';

// ═══════════════════════════════════════════════════════════════════════════
// HIERARCHY NAV - Polished Custom React Collapsible Left Nav
// Projects/Spaces → Project Explorer → Conversations →
// Context Files → Files (with RAG Search) → Agents (with Claude Sessions)
// ═══════════════════════════════════════════════════════════════════════════

interface NavItemProps {
	id: string;
	icon: string;
	label: string;
	badge?: number | string;
	badgeVariant?: 'default' | 'success' | 'warning' | 'error' | 'purple';
	depth?: number;
	isExpanded?: boolean;
	hasChildren?: boolean;
	isActive?: boolean;
	disabled?: boolean;
	onClick?: () => void;
	onToggle?: () => void;
	onAdd?: () => void;
	addTooltip?: string;
	children?: React.ReactNode;
}

// Single nav item with expand/collapse support
export const NavItem: React.FC<NavItemProps> = ({
	id,
	icon,
	label,
	badge,
	badgeVariant = 'default',
	depth = 0,
	isExpanded = false,
	hasChildren = false,
	isActive = false,
	disabled = false,
	onClick,
	onToggle,
	onAdd,
	addTooltip,
	children
}) => {
	const [hover, setHover] = useState(false);

	const handleClick = (e: React.MouseEvent) => {
		if (disabled) return;
		if (hasChildren && onToggle) {
			onToggle();
		} else if (onClick) {
			onClick();
		}
	};

	const handleAddClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!disabled) onAdd?.();
	};

	const indentPx = depth * 12;

	return (
		<div className="tarx-hierarchy-item-wrapper" data-nav-id={id}>
			<div
				className={`tarx-hierarchy-item ${isActive ? 'active' : ''} ${hasChildren ? 'has-children' : ''} ${hover && !disabled ? 'hover' : ''}`}
				style={{
					paddingLeft: `${12 + indentPx}px`,
					opacity: disabled ? 0.5 : 1,
					cursor: disabled ? 'not-allowed' : 'pointer',
				}}
				onClick={handleClick}
				onMouseEnter={() => setHover(true)}
				onMouseLeave={() => setHover(false)}
			>
				{/* Icon */}
				<i className={`tarx-hierarchy-icon codicon codicon-${icon}`} />

				{/* Label */}
				<span className="tarx-hierarchy-label">{label}</span>

				{/* Badge */}
				{badge !== undefined && (
					<Badge variant={badgeVariant} className="tarx-hierarchy-badge">
						{badge}
					</Badge>
				)}

				{/* Add button */}
				{onAdd && hover && !disabled && (
					<i
						className="tarx-hierarchy-add codicon codicon-add"
						title={addTooltip || 'Add'}
						onClick={handleAddClick}
					/>
				)}

				{/* Chevron for expandable items - on the RIGHT */}
				{hasChildren && (
					<i
						className={`tarx-hierarchy-chevron codicon codicon-chevron-${isExpanded ? 'down' : 'right'}`}
						onClick={(e) => {
							e.stopPropagation();
							if (!disabled) onToggle?.();
						}}
					/>
				)}
			</div>

			{/* Children (expanded content) */}
			{hasChildren && (
				<div
					className="tarx-hierarchy-children"
					style={{
						overflow: 'hidden',
						maxHeight: isExpanded ? '2000px' : '0',
						opacity: isExpanded ? 1 : 0,
						transition: 'all 0.2s ease-out',
					}}
				>
					{children}
				</div>
			)}
		</div>
	);
};

// Section header for grouping
interface SectionHeaderProps {
	title: string;
	onRefresh?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, onRefresh }) => (
	<div className="tarx-hierarchy-section-header">
		<span className="tarx-hierarchy-section-title">{title}</span>
		{onRefresh && (
			<i
				className="tarx-hierarchy-refresh codicon codicon-refresh"
				title="Refresh"
				onClick={onRefresh}
			/>
		)}
	</div>
);

// ═══════════════════════════════════════════════════════════════════════════
// DATA TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HierarchyProject {
	id: string;
	name: string;
	path: string;
	isActive?: boolean;
	priority?: number;
	taskCount?: number;
	status?: 'active' | 'archived' | 'pending';
}

export interface HierarchyConversation {
	id: string;
	title: string;
	timestamp: number;
	source: 'claude' | 'tarx' | 'mcp' | 'test';
	spaceId?: string;
}

export interface HierarchyContextFile {
	id: string;
	filename: string;
	path: string;
}

export interface RAGSearchResult {
	id: string;
	filename: string;
	path: string;
	snippet: string;
	score: number;
}

interface HierarchyNavProps {
	projects: HierarchyProject[];
	conversations: HierarchyConversation[];
	contextFiles: HierarchyContextFile[];
	selectedProjectId?: string | null;
	onOpenProject: (projectId: string) => void;
	onCreateProject: () => void;
	onOpenConversation: (conversationId: string) => void;
	onNewConversation: () => void;
	onOpenContextFile: (fileId: string) => void;
	onClearContext: () => void;
	onBrowseFiles: () => void;
	onRAGSearch?: (query: string) => void;
	ragResults?: RAGSearchResult[];
	ragLoading?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HIERARCHY NAV COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const HierarchyNav: React.FC<HierarchyNavProps> = ({
	projects,
	conversations,
	contextFiles,
	selectedProjectId,
	onOpenProject,
	onCreateProject,
	onOpenConversation,
	onNewConversation,
	onOpenContextFile,
	onClearContext,
	onBrowseFiles,
	onRAGSearch,
	ragResults = [],
	ragLoading = false,
}) => {
	// Collapsed state for each section
	const [expanded, setExpanded] = useState<Record<string, boolean>>({
		projects: true,
		explorer: false,
		conversations: true,
		files: false,
		contextFiles: false,
	});

	const [showAllProjects, setShowAllProjects] = useState(false);

	const toggleSection = useCallback((section: string) => {
		setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
	}, []);

	// Sort projects by priority/activity
	const sortedProjects = [...projects].sort((a, b) => {
		if (a.isActive && !b.isActive) return -1;
		if (!a.isActive && b.isActive) return 1;
		return (b.priority || 0) - (a.priority || 0);
	});

	return (
		<div className="tarx-hierarchy-nav" style={{ paddingBottom: 20 }}>
			{/* ─── Projects/Spaces ─── */}
			<NavItem
				id="projects"
				icon="folder-library"
				label="Projects"
				badge={projects.length || undefined}
				badgeVariant={projects.some(p => p.isActive) ? 'success' : 'default'}
				hasChildren={true}
				isExpanded={expanded.projects}
				onToggle={() => toggleSection('projects')}
				onAdd={onCreateProject}
				addTooltip="Create Project"
			>
				{projects.length === 0 ? (
					<Card variant="outline" style={{ margin: '8px 12px', padding: 12 }}>
						<div style={{ textAlign: 'center' }}>
							<span style={{ color: VS.fgMuted, fontSize: 12, display: 'block', marginBottom: 8 }}>No projects yet</span>
							<Button size="sm" onClick={onCreateProject} icon={<i className="codicon codicon-add" />}>
								Initialize Project
							</Button>
						</div>
					</Card>
				) : (
					<>
						{(showAllProjects ? sortedProjects : sortedProjects.slice(0, 10)).map(project => (
							<NavItem
								key={project.id}
								id={`project-${project.id}`}
								icon={project.isActive ? 'folder-active' : 'folder'}
								label={project.name}
								badge={project.taskCount ? `${project.taskCount} tasks` : undefined}
								badgeVariant={project.status === 'active' ? 'success' : 'default'}
								depth={1}
								isActive={project.id === selectedProjectId}
								onClick={() => onOpenProject(project.id)}
							/>
						))}
						{sortedProjects.length > 10 && (
							<div
								style={{
									padding: '6px 12px 6px 36px',
									fontSize: 11,
									color: VS.link,
									cursor: 'pointer',
								}}
								onClick={() => setShowAllProjects(!showAllProjects)}
							>
								{showAllProjects ? 'Show less' : `View ${sortedProjects.length - 10} more...`}
							</div>
						)}
					</>
				)}
			</NavItem>

			{/* ─── Files (Browse) ─── */}
			<NavItem
				id="files"
				icon="folder-opened"
				label="Files"
				hasChildren={false}
				onClick={onBrowseFiles}
			/>

			{/* ─── Conversations ─── */}
			<NavItem
				id="conversations"
				icon="comment-discussion"
				label="Conversations"
				badge={conversations.length || undefined}
				hasChildren={true}
				isExpanded={expanded.conversations}
				onToggle={() => toggleSection('conversations')}
				onAdd={onNewConversation}
				addTooltip="New Conversation"
			>
				{conversations.length === 0 ? (
					<Card variant="outline" style={{ margin: '8px 12px', padding: 12 }}>
						<div style={{ textAlign: 'center' }}>
							<span style={{ color: VS.fgMuted, fontSize: 12, display: 'block', marginBottom: 8 }}>No conversations yet</span>
							<Button size="sm" onClick={onNewConversation} icon={<i className="codicon codicon-comment-discussion" />}>
								Start Conversation
							</Button>
						</div>
					</Card>
				) : (
					conversations.slice(0, 10).map(conv => (
						<NavItem
							key={conv.id}
							id={`conv-${conv.id}`}
							icon={conv.source === 'claude' ? 'sparkle' : 'comment'}
							label={conv.title || 'Untitled'}
							depth={1}
							onClick={() => onOpenConversation(conv.id)}
						/>
					))
				)}
			</NavItem>
		</div>
	);
};

export default HierarchyNav;
