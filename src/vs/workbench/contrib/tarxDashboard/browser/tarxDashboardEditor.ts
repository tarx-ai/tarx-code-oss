/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Thinking Dashboard — EditorPane
 *  Live dashboard showing health, thinking feed, and recent conversations.
 *--------------------------------------------------------------------------------------------*/

import './tarxDashboard.css';
import { $, append, clearNode, Dimension } from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorSerializer, IEditorOpenContext } from '../../../common/editor.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { TarxDashboardInput } from './tarxDashboardEditorInput.js';

// ============================================================================
// Types
// ============================================================================

interface ServiceHealth {
	name: string;
	port: number;
	healthy: boolean;
	lastCheck: number;
}

interface ThinkingEntry {
	id: string;
	time: number;
	message: string;
	type: 'health' | 'alert' | 'suggestion' | 'info';
	actionLabel?: string;
	actionCommand?: string;
}

interface ConversationSummary {
	id: string;
	title: string;
	updatedAt: number;
	messageCount: number;
}

// ============================================================================
// Serializer
// ============================================================================

export class TarxDashboardInputSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return true;
	}

	serialize(): string {
		return '{}';
	}

	deserialize(): TarxDashboardInput {
		return new TarxDashboardInput();
	}
}

// ============================================================================
// Editor Pane
// ============================================================================

export class TarxDashboardEditor extends EditorPane {

	static readonly ID = 'tarxDashboardEditor';

	private container!: HTMLElement;

	// Health state
	private services: ServiceHealth[] = [
		{ name: 'inference', port: 11435, healthy: false, lastCheck: 0 },
		{ name: 'mesh', port: 11436, healthy: false, lastCheck: 0 },
		{ name: 'embeddings', port: 11437, healthy: false, lastCheck: 0 },
	];

	// Thinking feed
	private thinkingEntries: ThinkingEntry[] = [];
	private conversations: ConversationSummary[] = [];

	// Timers
	private healthTimer: ReturnType<typeof setInterval> | undefined;
	private insightTimer: ReturnType<typeof setInterval> | undefined;
	private timestampTimer: ReturnType<typeof setInterval> | undefined;

	// DOM refs
	private healthDotsContainer!: HTMLElement;
	private suggestionsBody!: HTMLElement;
	private thinkingBody!: HTMLElement;
	private conversationsRow!: HTMLElement;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(TarxDashboardEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.container = append(parent, $('.tarx-dashboard'));
		this.buildUI();
		this.startWatchdog();
	}

	override async setInput(
		input: TarxDashboardInput,
		options: IEditorOptions | undefined,
		context: IEditorOpenContext,
		token: CancellationToken
	): Promise<void> {
		await super.setInput(input, options, context, token);
	}

	override layout(dimension: Dimension): void {
		if (this.container) {
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
	}

	override focus(): void {
		this.container?.focus();
	}

	override dispose(): void {
		if (this.healthTimer) { clearInterval(this.healthTimer); }
		if (this.insightTimer) { clearInterval(this.insightTimer); }
		if (this.timestampTimer) { clearInterval(this.timestampTimer); }
		super.dispose();
	}

	// ========================================================================
	// UI Construction
	// ========================================================================

	private buildUI(): void {
		// --- Header ---
		const header = append(this.container, $('.tarx-dashboard-header'));

		const headerLeft = append(header, $('.tarx-dashboard-header-left'));
		append(headerLeft, $('.tarx-dashboard-title')).textContent = 'TARX Workbench';
		append(headerLeft, $('.tarx-dashboard-subtitle')).textContent = 'Local. Private. Proactive.';

		const healthSection = append(header, $('.tarx-dashboard-health'));
		this.healthDotsContainer = healthSection;
		this.renderHealthDots();

		// --- Main Grid ---
		const grid = append(this.container, $('.tarx-dashboard-grid'));

		// Panel 1: Suggestions
		const suggestionsPanel = append(grid, $('.tarx-panel.tarx-panel-suggestions'));
		const suggestionsHeader = append(suggestionsPanel, $('.tarx-panel-header'));
		append(suggestionsHeader, $('.tarx-panel-title')).textContent = 'Suggested for you';
		this.suggestionsBody = append(suggestionsPanel, $('.tarx-panel-body'));
		this.renderSuggestions();

		// Panel 2: Thinking
		const thinkingPanel = append(grid, $('.tarx-panel.tarx-panel-thinking'));
		const thinkingHeader = append(thinkingPanel, $('.tarx-panel-header'));
		append(thinkingHeader, $('.tarx-thinking-pulse'));
		append(thinkingHeader, $('.tarx-panel-title')).textContent = 'Thinking...';
		this.thinkingBody = append(thinkingPanel, $('.tarx-panel-body'));
		this.renderThinking();

		// Panel 3: Conversations
		const convPanel = append(grid, $('.tarx-panel.tarx-panel-conversations'));
		const convHeader = append(convPanel, $('.tarx-panel-header'));
		append(convHeader, $('.tarx-panel-title')).textContent = 'Continue where you left off';
		const convBody = append(convPanel, $('.tarx-panel-body'));
		this.conversationsRow = append(convBody, $('.tarx-conversations-row'));
		this.renderConversations();
	}

	// ========================================================================
	// Rendering
	// ========================================================================

	private renderHealthDots(): void {
		clearNode(this.healthDotsContainer);

		for (const svc of this.services) {
			const wrapper = append(this.healthDotsContainer, $('div', { style: 'display:flex;align-items:center;gap:4px;' }));
			const dot = append(wrapper, $('.tarx-health-dot'));
			dot.classList.add(svc.lastCheck === 0 ? 'unknown' : svc.healthy ? 'healthy' : 'unhealthy');
			dot.title = `${svc.name} (port ${svc.port})${svc.healthy ? ' — healthy' : svc.lastCheck === 0 ? '' : ' — down'}`;
			const label = append(wrapper, $('.tarx-health-label'));
			label.textContent = svc.name;
		}
	}

	private renderSuggestions(): void {
		clearNode(this.suggestionsBody);

		type Suggestion = { icon: string; title: string; detail: string; cta: string; command?: string; prompt?: string };
		const suggestions: Suggestion[] = [];

		// Generate suggestions based on current state
		const allHealthy = this.services.every(s => s.healthy);
		const inferenceUp = this.services[0].healthy;
		const embeddingsUp = this.services[2].healthy;

		if (!inferenceUp && this.services[0].lastCheck > 0) {
			suggestions.push({
				icon: '\u26A0\uFE0F', // ⚠️
				title: 'Inference server down',
				detail: 'Port 11435 not responding. Check llama-server status.',
				cta: 'Restart',
				command: 'tarx.restartService',
			});
		}

		if (allHealthy) {
			suggestions.push({
				icon: '\u2728', // ✨
				title: 'All systems operational',
				detail: 'Inference, mesh, and embeddings running. Ready for anything.',
				cta: 'New Chat',
				command: 'workbench.action.chat.open',
			});
		}

		if (embeddingsUp) {
			suggestions.push({
				icon: '\uD83D\uDD0D', // 🔍
				title: 'Knowledge base ready',
				detail: 'RAG system active. Upload files or search your knowledge.',
				cta: 'Search',
				prompt: 'Search my knowledge base for',
			});
		}

		if (this.conversations.length > 0) {
			suggestions.push({
				icon: '\uD83D\uDCAC', // 💬
				title: `${this.conversations.length} recent conversation${this.conversations.length > 1 ? 's' : ''}`,
				detail: 'Pick up where you left off.',
				cta: 'View',
				command: 'tarx.viewHistory',
			});
		}

		// Default suggestion if nothing else
		if (suggestions.length === 0) {
			suggestions.push({
				icon: '\uD83E\uDD16', // 🤖
				title: 'TARX is starting up',
				detail: 'Checking services... Suggestions will appear as systems come online.',
				cta: 'Refresh',
				command: 'tarx.openDashboard',
			});
		}

		for (const s of suggestions) {
			const card = append(this.suggestionsBody, $('.tarx-suggestion-card'));

			const icon = append(card, $('.tarx-suggestion-icon'));
			icon.textContent = s.icon;

			const content = append(card, $('.tarx-suggestion-content'));
			append(content, $('.tarx-suggestion-title')).textContent = s.title;
			append(content, $('.tarx-suggestion-detail')).textContent = s.detail;

			const cta = append(card, $('button.tarx-suggestion-cta'));
			cta.textContent = s.cta;
			cta.addEventListener('click', () => {
				if (s.command) {
					this.commandService.executeCommand(s.command).catch(() => { });
				}
			});
		}
	}

	private renderThinking(): void {
		clearNode(this.thinkingBody);

		if (this.thinkingEntries.length === 0) {
			const empty = append(this.thinkingBody, $('.tarx-thinking-empty'));
			empty.textContent = 'Monitoring system health...';
			return;
		}

		for (const entry of this.thinkingEntries) {
			const row = append(this.thinkingBody, $('.tarx-thinking-entry'));

			const time = append(row, $('.tarx-thinking-time'));
			time.textContent = this.relativeTime(entry.time);
			time.dataset['ts'] = String(entry.time);

			const msg = append(row, $(`.tarx-thinking-msg${entry.type === 'alert' ? '.alert' : entry.type === 'health' ? '.health' : ''}`));
			msg.textContent = entry.message;

			if (entry.actionLabel && entry.actionCommand) {
				const action = append(row, $('button.tarx-thinking-action'));
				action.textContent = entry.actionLabel;
				action.addEventListener('click', () => {
					this.commandService.executeCommand(entry.actionCommand!).catch(() => { });
				});
			}
		}
	}

	private renderConversations(): void {
		clearNode(this.conversationsRow);

		if (this.conversations.length === 0) {
			const empty = append(this.conversationsRow, $('.tarx-conv-empty'));
			empty.textContent = 'No conversations yet. ';
			const cta = append(empty, $('button.tarx-conv-empty-cta'));
			cta.textContent = 'Start your first conversation \u2192';
			cta.addEventListener('click', () => {
				this.commandService.executeCommand('workbench.action.chat.open').catch(() => { });
			});
			return;
		}

		for (const conv of this.conversations.slice(0, 10)) {
			const card = append(this.conversationsRow, $('.tarx-conv-card'));
			card.addEventListener('click', () => {
				this.commandService.executeCommand('tarx.openConversation', conv.id).catch(() => { });
			});

			append(card, $('.tarx-conv-title')).textContent = conv.title || 'Untitled conversation';

			const meta = append(card, $('.tarx-conv-meta'));
			meta.textContent = `${this.relativeTime(conv.updatedAt)} \u00B7 ${conv.messageCount} message${conv.messageCount !== 1 ? 's' : ''}`;
		}

		const viewAll = append(this.conversationsRow, $('.tarx-view-all'));
		viewAll.textContent = 'View All History \u2192';
		viewAll.addEventListener('click', () => {
			this.commandService.executeCommand('tarx.viewHistory').catch(() => { });
		});
	}

	// ========================================================================
	// Watchdog — Health Polling & Insight Generation
	// ========================================================================

	private startWatchdog(): void {
		// Immediate first check
		this.checkAllHealth();
		this.loadConversations();

		// Health every 30s
		this.healthTimer = setInterval(() => this.checkAllHealth(), 30_000);

		// Conversations every 60s
		this.insightTimer = setInterval(() => this.loadConversations(), 60_000);

		// Update relative timestamps every 30s
		this.timestampTimer = setInterval(() => this.updateTimestamps(), 30_000);
	}

	private async checkAllHealth(): Promise<void> {
		for (const svc of this.services) {
			const wasHealthy = svc.healthy;
			const wasChecked = svc.lastCheck > 0;

			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 5000);
				const res = await fetch(`http://localhost:${svc.port}/health`, { signal: controller.signal });
				clearTimeout(timeout);
				svc.healthy = res.ok;
			} catch {
				svc.healthy = false;
			}
			svc.lastCheck = Date.now();

			// Emit thinking observations on state changes
			if (!wasChecked) {
				// First check
				this.addThinking(
					svc.healthy
						? `${svc.name} online (port ${svc.port})`
						: `${svc.name} unreachable (port ${svc.port})`,
					svc.healthy ? 'health' : 'alert'
				);
			} else if (wasHealthy && !svc.healthy) {
				this.addThinking(`${svc.name} went down — port ${svc.port} not responding`, 'alert');
			} else if (!wasHealthy && svc.healthy) {
				this.addThinking(`${svc.name} came back online`, 'health');
			}
		}

		// Periodic healthy status (suppress noise — only every 5 minutes)
		const allHealthy = this.services.every(s => s.healthy);
		if (allHealthy) {
			const lastStatusEntry = this.thinkingEntries.find(e => e.message.includes('All systems healthy'));
			const fiveMinutes = 5 * 60 * 1000;
			if (!lastStatusEntry || (Date.now() - lastStatusEntry.time) > fiveMinutes) {
				this.addThinking('All systems healthy — inference, mesh, embeddings responding', 'info');
			}
		}

		this.renderHealthDots();
		this.renderSuggestions();
	}

	private async loadConversations(): Promise<void> {
		try {
			const result = await this.commandService.executeCommand<ConversationSummary[]>('tarx.getRecentConversations');
			if (Array.isArray(result)) {
				this.conversations = result;
				this.renderConversations();
				this.renderSuggestions(); // suggestions depend on conversation count
			}
		} catch {
			// Extension not activated yet or command not registered — that's fine
		}
	}

	private addThinking(message: string, type: ThinkingEntry['type']): void {
		const entry: ThinkingEntry = {
			id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
			time: Date.now(),
			message,
			type,
		};

		this.thinkingEntries.unshift(entry);
		if (this.thinkingEntries.length > 50) {
			this.thinkingEntries.pop();
		}

		this.renderThinking();
	}

	private updateTimestamps(): void {
		if (!this.thinkingBody) { return; }
		const timeElements = this.thinkingBody.querySelectorAll('.tarx-thinking-time[data-ts]');
		for (const el of timeElements) {
			const ts = parseInt((el as HTMLElement).dataset['ts'] || '0');
			if (ts) {
				el.textContent = this.relativeTime(ts);
			}
		}
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	private relativeTime(timestamp: number): string {
		const delta = Date.now() - timestamp;
		if (delta < 10_000) { return 'now'; }
		if (delta < 60_000) { return `${Math.floor(delta / 1000)}s ago`; }
		if (delta < 3_600_000) { return `${Math.floor(delta / 60_000)}m ago`; }
		if (delta < 86_400_000) { return `${Math.floor(delta / 3_600_000)}h ago`; }
		return `${Math.floor(delta / 86_400_000)}d ago`;
	}
}
