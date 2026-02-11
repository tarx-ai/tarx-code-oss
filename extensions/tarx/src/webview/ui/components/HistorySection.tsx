/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useMemo, useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import type { TarxHistoryItem } from '../types';

interface HistorySectionProps {
	collapsed: boolean;
	onToggle: () => void;
	items: TarxHistoryItem[];
	eyesUri: string;
	onOpenSession: (sessionId: string, spaceId?: string) => void;
	onOpenConversation: (conversationId: string) => void;
	onShowAll: () => void;
	onDeleteItem?: (itemId: string) => void;
}

const CLAUDE_SVG_DATA_URI = `data:image/svg+xml;base64,${btoa(`<svg width="16" height="16" viewBox="0 -.01 39.5 39.53" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m7.75 26.27 7.77-4.36.13-.38-.13-.21h-.38l-1.3-.08-4.44-.12-3.85-.16-3.73-.2-.94-.2-.88-1.16.09-.58.79-.53 1.13.1 2.5.17 3.75.26 2.72.16 4.03.42h.64l.09-.26-.22-.16-.17-.16-3.88-2.63-4.2-2.78-2.2-1.6-1.19-.81-.6-.76-.26-1.66 1.08-1.19 1.45.1.37.1 1.47 1.13 3.14 2.43 4.1 3.02.6.5.24-.17.03-.12-.27-.45-2.23-4.03-2.38-4.1-1.06-1.7-.28-1.02c-.1-.42-.17-.77-.17-1.2l1.23-1.67.68-.22 1.64.22.69.6 1.02 2.33 1.65 3.67 2.56 4.99.75 1.48.4 1.37.15.42h.26v-.24l.21-2.81.39-3.45.38-4.44.13-1.25.62-1.5 1.23-.81.96.46.79 1.13-.11.73-.47 3.05-.92 4.78-.6 3.2h.35l.4-.4 1.62-2.15 2.72-3.4 1.2-1.35 1.4-1.49.9-.71h1.7l1.25 1.86-.56 1.92-1.75 2.22-1.45 1.88-2.08 2.8-1.3 2.24.12.18.31-.03 4.7-1 2.54-.46 3.03-.52 1.37.64.15.65-.54 1.33-3.24.8-3.8.76-5.66 1.34-.07.05.08.1 2.55.24 1.09.06h2.67l4.97.37 1.3.86.78 1.05-.13.8-2 1.02-2.7-.64-6.3-1.5-2.16-.54h-.3v.18l1.8 1.76 3.3 2.98 4.13 3.84.21.95-.53.75-.56-.08-3.63-2.73-1.4-1.23-3.17-2.67h-.21v.28l.73 1.07 3.86 5.8.2 1.78-.28.58-1 .35-1.1-.2-2.26-3.17-2.33-3.57-1.88-3.2-.23.13-1.11 11.95-.52.61-1.2.46-1-.76-.53-1.23.53-2.43.64-3.17.52-2.52.47-3.13.28-1.04-.02-.07-.23.03-2.36 3.24-3.59 4.85-2.84 3.04-.68.27-1.18-.61.11-1.09.66-.97 3.93-5 2.37-3.1 1.53-1.79-.01-.26h-.09l-10.44 6.78-1.86.24-.8-.75.1-1.23.38-.4 3.14-2.16z" fill="#d97757"/></svg>`)}`;

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

function isClaudeSource(source?: string, title?: string): boolean {
	if (source) {
		const s = source.toLowerCase();
		if (s === 'claude' || s.includes('claude')) return true;
	}
	if (title) {
		const t = title.toLowerCase();
		if (t.includes('claude')) return true;
	}
	return false;
}

function isClaudeSession(item: TarxHistoryItem): boolean {
	if (item.source === 'claude') return true;
	const lower = item.title.toLowerCase();
	return lower.startsWith('cc:') || lower.includes('claude') || lower.includes('god mode');
}

interface GroupedHistory {
	today: TarxHistoryItem[];
	yesterday: TarxHistoryItem[];
	thisWeek: TarxHistoryItem[];
	older: TarxHistoryItem[];
	claudeSynced: TarxHistoryItem[];
}

function groupHistoryItems(items: TarxHistoryItem[]): GroupedHistory {
	const dayMs = 24 * 60 * 60 * 1000;
	const todayStart = new Date().setHours(0, 0, 0, 0);
	const yesterdayStart = todayStart - dayMs;
	const weekStart = todayStart - 6 * dayMs;

	const result: GroupedHistory = { today: [], yesterday: [], thisWeek: [], older: [], claudeSynced: [] };

	for (const item of items) {
		if (isClaudeSource(item.source, item.title)) {
			result.claudeSynced.push(item);
			continue;
		}
		if (item.timestamp >= todayStart) {
			result.today.push(item);
		} else if (item.timestamp >= yesterdayStart) {
			result.yesterday.push(item);
		} else if (item.timestamp >= weekStart) {
			result.thisWeek.push(item);
		} else {
			result.older.push(item);
		}
	}
	return result;
}

interface HistoryItemProps {
	item: TarxHistoryItem;
	eyesUri: string;
	onClick: () => void;
	onDelete?: () => void;
}

const HistoryItem: React.FC<HistoryItemProps> = ({ item, eyesUri, onClick, onDelete }) => {
	const timeAgo = formatTimeAgo(item.timestamp);
	const isClaude = isClaudeSession(item);

	return (
		<div className="tarx-history-item" data-id={item.id} onClick={onClick}>
			<span className="tarx-history-item-icon">
				{isClaude ? (
					<img src={CLAUDE_SVG_DATA_URI} alt="Claude" className="tarx-claude-logo-icon" />
				) : (
					<span className="codicon codicon-comment-discussion" />
				)}
			</span>
			<span className="tarx-history-item-title" title={item.title}>{item.title}</span>
			<span className="tarx-history-item-time">{timeAgo}</span>
			{onDelete && (
				<span
					className="tarx-history-item-delete codicon codicon-trash"
					title="Delete"
					onClick={(e) => { e.stopPropagation(); onDelete(); }}
				/>
			)}
		</div>
	);
};

interface HistoryGroupProps {
	label: string;
	items: TarxHistoryItem[];
	eyesUri: string;
	onOpenSession: (sessionId: string, spaceId?: string) => void;
	onOpenConversation: (conversationId: string) => void;
	onDeleteItem?: (itemId: string) => void;
	icon?: React.ReactNode;
}

const HistoryGroup: React.FC<HistoryGroupProps> = ({
	label, items, eyesUri, onOpenSession, onOpenConversation, onDeleteItem, icon
}) => {
	if (items.length === 0) return null;

	return (
		<>
			<div className="tarx-history-group-label">
				{icon && <span className="tarx-history-group-icon">{icon}</span>}
				{label}
			</div>
			{items.map(item => (
				<HistoryItem
					key={item.id}
					item={item}
					eyesUri={eyesUri}
					onClick={() => {
						if (item.spaceId) {
							onOpenSession(item.id, item.spaceId);
						} else {
							onOpenConversation(item.id);
						}
					}}
					onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
				/>
			))}
		</>
	);
};

export const HistorySection: React.FC<HistorySectionProps> = ({
	collapsed, onToggle, items, eyesUri, onOpenSession, onOpenConversation, onShowAll, onDeleteItem
}) => {
	const [searchQuery, setSearchQuery] = useState('');

	const filteredItems = useMemo(() => {
		if (!searchQuery.trim()) return items;
		const q = searchQuery.toLowerCase();
		return items.filter(item => item.title.toLowerCase().includes(q));
	}, [items, searchQuery]);

	const grouped = useMemo(() => groupHistoryItems(filteredItems), [filteredItems]);

	return (
		<CollapsibleSection
			id="history"
			title="History"
			icon="history"
			collapsed={collapsed}
			onToggle={onToggle}
			onSeeAll={onShowAll}
		>
			{items.length > 3 && (
				<div className="tarx-history-search">
					<i className="codicon codicon-search" />
					<input
						type="text"
						className="tarx-history-search-input"
						placeholder="Filter conversations..."
						value={searchQuery}
						onChange={e => setSearchQuery(e.target.value)}
					/>
					{searchQuery && (
						<i className="codicon codicon-close tarx-history-search-clear" onClick={() => setSearchQuery('')} />
					)}
				</div>
			)}
			{filteredItems.length === 0 ? (
				<div className="tarx-section-empty-state">
					<span className="tarx-empty-state-text">
						{searchQuery ? 'No matches' : 'No conversations yet'}
					</span>
				</div>
			) : (
				<div className="tarx-history-content">
					<HistoryGroup label="Today" items={grouped.today} eyesUri={eyesUri}
						onOpenSession={onOpenSession} onOpenConversation={onOpenConversation} onDeleteItem={onDeleteItem} />
					<HistoryGroup label="Yesterday" items={grouped.yesterday} eyesUri={eyesUri}
						onOpenSession={onOpenSession} onOpenConversation={onOpenConversation} onDeleteItem={onDeleteItem} />
					<HistoryGroup label="This Week" items={grouped.thisWeek} eyesUri={eyesUri}
						onOpenSession={onOpenSession} onOpenConversation={onOpenConversation} onDeleteItem={onDeleteItem} />
					<HistoryGroup label="Older" items={grouped.older} eyesUri={eyesUri}
						onOpenSession={onOpenSession} onOpenConversation={onOpenConversation} onDeleteItem={onDeleteItem} />
					<HistoryGroup label="Claude.ai Synced" items={grouped.claudeSynced} eyesUri={eyesUri}
						onOpenSession={onOpenSession} onOpenConversation={onOpenConversation} onDeleteItem={onDeleteItem}
						icon={<img src={CLAUDE_SVG_DATA_URI} alt="Claude" className="tarx-claude-logo-icon" />} />
				</div>
			)}
		</CollapsibleSection>
	);
};
