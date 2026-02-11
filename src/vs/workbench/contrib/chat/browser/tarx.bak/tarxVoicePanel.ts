/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ViewPane, IViewPaneOptions } from '../../../../browser/parts/views/viewPane.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IVoiceContextService, IVoiceTranscriptEvent } from './voiceContextService.js';
import { IProactiveVoiceInterfaceService } from './proactive/proactiveVoiceInterface.js';
import { IActionProposerService, IProposedAction } from './proactive/actionProposer.js';
import { IActionExecutorService } from './proactive/actionExecutor.js';
import { $, append, clearNode } from '../../../../../base/browser/dom.js';

/**
 * TARX Voice Panel
 * Displays voice input status, transcript, proactive suggestions, and controls
 */
export class TarxVoicePanel extends ViewPane {
	static readonly ID = 'tarx.voice.panel';
	static readonly TITLE = 'TARX Voice';

	private voiceContainer: HTMLElement | undefined;
	private transcriptDisplay: HTMLElement | undefined;
	private statusDisplay: HTMLElement | undefined;
	private confidenceDisplay: HTMLElement | undefined;
	private recordButton: HTMLElement | undefined;
	private proactiveToggle: HTMLElement | undefined;
	private actionsContainer: HTMLElement | undefined;

	private isRecording = false;
	private isProactiveEnabled = false;
	private transcript = '';
	private confidence = 0;
	private pendingAction: IProposedAction | null = null;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IVoiceContextService private readonly voiceContextService: IVoiceContextService,
		@IProactiveVoiceInterfaceService private readonly proactiveInterface: IProactiveVoiceInterfaceService,
		@IActionProposerService private readonly actionProposer: IActionProposerService,
		@IActionExecutorService private readonly actionExecutor: IActionExecutorService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		// Subscribe to voice events
		this._register(this.voiceContextService.onTranscript(e => this.handleTranscript(e)));
		this._register(this.voiceContextService.onStatusChange(s => this.handleStatusChange(s)));

		// Subscribe to proactive events
		this._register(this.actionProposer.onActionProposed(action => this.displayProactiveAction(action)));
		this._register(this.proactiveInterface.onStateChange(state => this.handleProactiveStateChange(state)));

		console.log('[TARX Voice Panel] Initialized with proactive support');
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.voiceContainer = container;
		container.classList.add('tarx-voice-panel');

		this.renderContent();
	}

	private renderContent(): void {
		if (!this.voiceContainer) { return; }

		clearNode(this.voiceContainer);

		// Header section with proactive toggle
		const header = append(this.voiceContainer, $('.tarx-voice-header'));
		const title = append(header, $('.tarx-voice-title'));
		title.textContent = 'Voice Input';

		// Proactive mode toggle
		this.proactiveToggle = append(header, $('button.tarx-proactive-toggle'));
		this.proactiveToggle.innerHTML = '🤖 Proactive: OFF';
		this.proactiveToggle.title = 'Toggle proactive mode (TARX suggests actions)';
		this.proactiveToggle.onclick = () => this.toggleProactiveMode();

		// Status display
		this.statusDisplay = append(this.voiceContainer, $('.tarx-voice-status'));
		this.statusDisplay.textContent = 'Ready';
		this.updateStatusDisplay('idle');

		// Record button
		this.recordButton = append(this.voiceContainer, $('button.tarx-voice-record-button'));
		this.recordButton.innerHTML = '<span class="icon">🎤</span><span class="label">Start Recording</span>';
		this.recordButton.onclick = () => this.toggleRecording();

		// Confidence display
		this.confidenceDisplay = append(this.voiceContainer, $('.tarx-voice-confidence'));
		this.confidenceDisplay.textContent = 'Confidence: --';

		// Transcript display
		const transcriptLabel = append(this.voiceContainer, $('.tarx-voice-transcript-label'));
		transcriptLabel.textContent = 'Transcript:';

		this.transcriptDisplay = append(this.voiceContainer, $('.tarx-voice-transcript'));
		this.transcriptDisplay.textContent = 'Your speech will appear here...';

		// Proactive Actions Section
		this.renderProactiveActionsSection();

		// Context info
		const contextSection = append(this.voiceContainer, $('.tarx-voice-context'));
		const contextLabel = append(contextSection, $('.tarx-voice-context-label'));
		contextLabel.textContent = 'Context Status:';

		const contextItems = append(contextSection, $('.tarx-voice-context-items'));
		this.renderContextItems(contextItems);

		// Action buttons
		const actions = append(this.voiceContainer, $('.tarx-voice-actions'));

		const insertBtn = append(actions, $('button.tarx-voice-action-btn.primary'));
		insertBtn.textContent = 'Insert to Chat';
		insertBtn.onclick = () => this.insertToChat();

		const clearBtn = append(actions, $('button.tarx-voice-action-btn.secondary'));
		clearBtn.textContent = 'Clear';
		clearBtn.onclick = () => this.clearTranscript();

		// Tips section
		const tips = append(this.voiceContainer, $('.tarx-voice-tips'));
		tips.innerHTML = `
			<div class="tip-title">Tips:</div>
			<div class="tip-item">• Speak clearly and naturally</div>
			<div class="tip-item">• Transcription errors are auto-corrected</div>
			<div class="tip-item">• Use "Insert to Chat" to send to AI</div>
			<div class="tip-item">• Enable Proactive mode for AI suggestions</div>
		`;
	}

	private async renderContextItems(container: HTMLElement): Promise<void> {
		const context = await this.voiceContextService.getContext();

		const items = [
			{ label: 'Session', value: context.sessionId.slice(-8), status: 'ok' },
			{ label: 'History', value: `${context.chatHistory.length} messages`, status: 'ok' },
			{ label: 'Code', value: context.currentCode ? 'Loaded' : 'None', status: context.currentCode ? 'ok' : 'dim' },
		];

		for (const item of items) {
			const row = append(container, $(`.tarx-context-item.${item.status}`));
			row.innerHTML = `<span class="check">✓</span><span class="label">${item.label}:</span><span class="value">${item.value}</span>`;
		}
	}

	private async toggleRecording(): Promise<void> {
		if (!this.recordButton) { return; }

		try {
			if (!this.isRecording) {
				// Start recording
				this.isRecording = true;
				this.recordButton.innerHTML = '<span class="icon">⏹️</span><span class="label">Stop Recording</span>';
				this.recordButton.classList.add('recording');
				this.updateStatusDisplay('listening');

				await this.commandService.executeCommand('tarx.voice.start');
				this.voiceContextService.setStatus('listening');

			} else {
				// Stop recording
				this.isRecording = false;
				this.recordButton.innerHTML = '<span class="icon">🎤</span><span class="label">Start Recording</span>';
				this.recordButton.classList.remove('recording');
				this.updateStatusDisplay('idle');

				await this.commandService.executeCommand('tarx.voice.stop');
				this.voiceContextService.setStatus('idle');
			}
		} catch (error) {
			console.error('[TARX Voice Panel] Toggle error:', error);
			this.isRecording = false;
			if (this.recordButton) {
				this.recordButton.innerHTML = '<span class="icon">🎤</span><span class="label">Start Recording</span>';
				this.recordButton.classList.remove('recording');
			}
			this.updateStatusDisplay('error');
			this.voiceContextService.setStatus('error');
		}
	}

	private handleTranscript(event: IVoiceTranscriptEvent): void {
		this.transcript = event.text;
		this.confidence = event.confidence;

		if (this.transcriptDisplay) {
			this.transcriptDisplay.textContent = event.text || 'Listening...';
			this.transcriptDisplay.classList.toggle('partial', !event.isFinal);
			this.transcriptDisplay.classList.toggle('final', event.isFinal);
		}

		if (this.confidenceDisplay) {
			const percent = Math.round(event.confidence * 100);
			this.confidenceDisplay.textContent = `Confidence: ${percent}%`;
			this.confidenceDisplay.classList.toggle('high', percent >= 90);
			this.confidenceDisplay.classList.toggle('medium', percent >= 70 && percent < 90);
			this.confidenceDisplay.classList.toggle('low', percent < 70);
		}
	}

	private handleStatusChange(status: 'idle' | 'listening' | 'processing' | 'error'): void {
		this.updateStatusDisplay(status);

		// Sync recording state
		if (status === 'idle' || status === 'error') {
			this.isRecording = false;
			if (this.recordButton) {
				this.recordButton.innerHTML = '<span class="icon">🎤</span><span class="label">Start Recording</span>';
				this.recordButton.classList.remove('recording');
			}
		}
	}

	private updateStatusDisplay(status: 'idle' | 'listening' | 'processing' | 'error'): void {
		if (!this.statusDisplay) { return; }

		// Remove all status classes
		this.statusDisplay.classList.remove('idle', 'listening', 'processing', 'error');
		this.statusDisplay.classList.add(status);

		const statusText: Record<string, string> = {
			idle: '⚪ Ready',
			listening: '🔴 Listening...',
			processing: '🟡 Processing...',
			error: '🔴 Error'
		};

		this.statusDisplay.textContent = statusText[status] || 'Unknown';
	}

	private async insertToChat(): Promise<void> {
		if (!this.transcript.trim()) {
			console.log('[TARX Voice Panel] No transcript to insert');
			return;
		}

		try {
			const context = await this.voiceContextService.getContext();

			// Add to history
			this.voiceContextService.addToHistory('user', this.transcript);

			// Send to chat with context
			await this.commandService.executeCommand('tarx.chat.insertVoiceTranscript', {
				transcript: this.transcript,
				confidence: this.confidence,
				context: context,
				inputType: 'voice',
			});

			console.log('[TARX Voice Panel] Inserted transcript to chat');

			// Clear for next session
			this.clearTranscript();
		} catch (error) {
			console.error('[TARX Voice Panel] Insert error:', error);
		}
	}

	private clearTranscript(): void {
		this.transcript = '';
		this.confidence = 0;

		if (this.transcriptDisplay) {
			this.transcriptDisplay.textContent = 'Your speech will appear here...';
			this.transcriptDisplay.classList.remove('partial', 'final');
		}

		if (this.confidenceDisplay) {
			this.confidenceDisplay.textContent = 'Confidence: --';
			this.confidenceDisplay.classList.remove('high', 'medium', 'low');
		}
	}

	override focus(): void {
		super.focus();
		this.recordButton?.focus();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		// Panel auto-adjusts via flexbox
	}

	// ========================================================================
	// PROACTIVE MODE METHODS
	// ========================================================================

	private renderProactiveActionsSection(): void {
		if (!this.voiceContainer) { return; }

		const section = append(this.voiceContainer, $('.tarx-proactive-actions'));

		const label = append(section, $('.tarx-actions-label'));
		label.textContent = '💡 Proactive Suggestions';

		this.actionsContainer = append(section, $('.tarx-actions-container'));
		const placeholder = append(this.actionsContainer, $('.tarx-actions-placeholder'));
		placeholder.textContent = 'Enable proactive mode to see AI suggestions...';
	}

	private async toggleProactiveMode(): Promise<void> {
		if (!this.proactiveToggle) { return; }

		try {
			if (!this.isProactiveEnabled) {
				// Enable proactive mode
				this.isProactiveEnabled = true;
				this.proactiveToggle.innerHTML = '🤖 Proactive: ON';
				this.proactiveToggle.classList.add('active');

				await this.commandService.executeCommand('tarx.proactive.start');
				this.updateActionsPlaceholder('Watching for patterns...');

				console.log('[TARX Voice Panel] Proactive mode enabled');
			} else {
				// Disable proactive mode
				this.isProactiveEnabled = false;
				this.proactiveToggle.innerHTML = '🤖 Proactive: OFF';
				this.proactiveToggle.classList.remove('active');

				await this.commandService.executeCommand('tarx.proactive.stop');
				this.updateActionsPlaceholder('Enable proactive mode to see AI suggestions...');
				this.clearProactiveActions();

				console.log('[TARX Voice Panel] Proactive mode disabled');
			}
		} catch (error) {
			console.error('[TARX Voice Panel] Failed to toggle proactive mode:', error);
			this.proactiveToggle.innerHTML = '🤖 Proactive: ERROR';
		}
	}

	private updateActionsPlaceholder(text: string): void {
		if (!this.actionsContainer) { return; }

		// Only update if no pending action
		if (!this.pendingAction) {
			clearNode(this.actionsContainer);
			const placeholder = append(this.actionsContainer, $('.tarx-actions-placeholder'));
			placeholder.textContent = text;
		}
	}

	private clearProactiveActions(): void {
		this.pendingAction = null;
		if (this.actionsContainer) {
			clearNode(this.actionsContainer);
			const placeholder = append(this.actionsContainer, $('.tarx-actions-placeholder'));
			placeholder.textContent = 'Enable proactive mode to see AI suggestions...';
		}
	}

	private displayProactiveAction(action: IProposedAction): void {
		if (!this.actionsContainer || !this.isProactiveEnabled) { return; }

		this.pendingAction = action;
		clearNode(this.actionsContainer);

		const actionCard = append(this.actionsContainer, $('.tarx-action-card'));

		// Header with action type
		const cardHeader = append(actionCard, $('.tarx-action-header'));
		const actionType = append(cardHeader, $('.tarx-action-type'));
		actionType.textContent = action.type.toUpperCase();

		const confidenceBadge = append(cardHeader, $('.tarx-action-confidence-badge'));
		const confidencePercent = Math.round(action.confidence * 100);
		confidenceBadge.textContent = `${confidencePercent}%`;
		confidenceBadge.classList.add(confidencePercent >= 90 ? 'high' : confidencePercent >= 75 ? 'medium' : 'low');

		// Proposal text
		const proposal = append(actionCard, $('.tarx-action-proposal'));
		proposal.textContent = action.voiceProposal;

		// Evidence
		if (action.pattern.evidence.length > 0) {
			const evidence = append(actionCard, $('.tarx-action-evidence'));
			evidence.textContent = `Based on: ${action.pattern.evidence.slice(0, 2).join(', ')}`;
		}

		// Action buttons
		const buttons = append(actionCard, $('.tarx-action-buttons'));

		// Approve button
		const approveBtn = append(buttons, $('button.tarx-action-btn.approve'));
		approveBtn.textContent = 'Approve';
		approveBtn.onclick = () => this.approveAction(action);

		// Reject button
		const rejectBtn = append(buttons, $('button.tarx-action-btn.reject'));
		rejectBtn.textContent = 'Reject';
		rejectBtn.onclick = () => this.rejectAction(action);

		// Explain button
		const explainBtn = append(buttons, $('button.tarx-action-btn.explain'));
		explainBtn.textContent = 'Explain';
		explainBtn.onclick = () => this.explainAction(action);

		// Show option buttons if available
		if (action.options && action.options.length > 0) {
			const optionsRow = append(actionCard, $('.tarx-action-options'));
			for (const option of action.options.slice(0, 3)) {
				const optionBtn = append(optionsRow, $('button.tarx-option-btn'));
				optionBtn.textContent = option.label;
				optionBtn.title = option.description;
				optionBtn.onclick = () => this.selectOption(action, option.key);
			}
		}

		console.log('[TARX Voice Panel] Displaying proactive action:', action.title);
	}

	private async approveAction(action: IProposedAction): Promise<void> {
		console.log('[TARX Voice Panel] Action approved:', action.title);

		try {
			this.updateActionsPlaceholder('Executing...');
			const result = await this.actionExecutor.executeAction(action, 'yes');

			if (result.success) {
				this.updateActionsPlaceholder(`✅ ${result.message}`);
				setTimeout(() => this.updateActionsPlaceholder('Watching for patterns...'), 2000);
			} else {
				this.updateActionsPlaceholder(`❌ ${result.message}`);
			}
		} catch (error) {
			console.error('[TARX Voice Panel] Approve error:', error);
			this.updateActionsPlaceholder('Error executing action');
		}

		this.pendingAction = null;
	}

	private async rejectAction(action: IProposedAction): Promise<void> {
		console.log('[TARX Voice Panel] Action rejected:', action.title);

		this.actionProposer.dismissProposal(action.id);
		this.pendingAction = null;
		this.updateActionsPlaceholder('Ready for next suggestion...');
	}

	private async explainAction(action: IProposedAction): Promise<void> {
		console.log('[TARX Voice Panel] Action explain requested:', action.title);

		try {
			const result = await this.actionExecutor.executeAction(action, 'explain');
			console.log('[TARX Voice Panel] Explanation result:', result.message);
		} catch (error) {
			console.error('[TARX Voice Panel] Explain error:', error);
		}
	}

	private async selectOption(action: IProposedAction, optionKey: string): Promise<void> {
		console.log('[TARX Voice Panel] Option selected:', optionKey);

		try {
			this.updateActionsPlaceholder('Executing...');
			const result = await this.actionExecutor.executeAction(action, optionKey);

			if (result.success) {
				this.updateActionsPlaceholder(`✅ ${result.message}`);
				setTimeout(() => this.updateActionsPlaceholder('Watching for patterns...'), 2000);
			} else {
				this.updateActionsPlaceholder(`❌ ${result.message}`);
			}
		} catch (error) {
			console.error('[TARX Voice Panel] Option error:', error);
			this.updateActionsPlaceholder('Error executing action');
		}

		this.pendingAction = null;
	}

	private handleProactiveStateChange(state: 'idle' | 'proposing' | 'listening' | 'executing'): void {
		if (!this.proactiveToggle) { return; }

		switch (state) {
			case 'proposing':
				this.proactiveToggle.innerHTML = '🤖 Speaking...';
				break;
			case 'listening':
				this.proactiveToggle.innerHTML = '🤖 Listening...';
				break;
			case 'executing':
				this.proactiveToggle.innerHTML = '🤖 Executing...';
				break;
			default:
				this.proactiveToggle.innerHTML = this.isProactiveEnabled ? '🤖 Proactive: ON' : '🤖 Proactive: OFF';
		}
	}
}
