/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Proactive Voice Interface Service
 *  Voice-native action proposal and response handling
 *  Integrates with Moshi TTS for speaking proposals
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IActionProposerService, IProposedAction } from './actionProposer.js';
import { IActionExecutorService, IExecutionResult } from './actionExecutor.js';
import { IContextObserverService } from './contextObserver.js';
import { IVoiceContextService } from '../voiceContextService.js';

/**
 * Voice response from user
 */
export interface IVoiceResponse {
	action: string; // 'yes' | 'no' | 'show' | 'explain' | etc
	confidence: number;
	rawText: string;
	timestamp: number;
}

/**
 * Proposal state
 */
type ProposalState = 'idle' | 'proposing' | 'listening' | 'executing';

export const IProactiveVoiceInterfaceService = createDecorator<IProactiveVoiceInterfaceService>('proactiveVoiceInterface');

/**
 * Proactive Voice Interface Service Interface
 */
export interface IProactiveVoiceInterfaceService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when user responds via voice
	 */
	readonly onVoiceResponse: Event<IVoiceResponse>;

	/**
	 * Event fired when proposal state changes
	 */
	readonly onStateChange: Event<ProposalState>;

	/**
	 * Propose an action via voice
	 */
	proposeViaVoice(action: IProposedAction): Promise<void>;

	/**
	 * Process voice input to detect response
	 */
	processVoiceInput(text: string, confidence: number): void;

	/**
	 * Interrupt current proposal
	 */
	interruptProposal(): void;

	/**
	 * Get current state
	 */
	getState(): ProposalState;

	/**
	 * Enable/disable proactive mode
	 */
	setEnabled(enabled: boolean): void;

	/**
	 * Check if proactive mode is enabled
	 */
	isEnabled(): boolean;
}

/**
 * Response keywords mapping
 */
const RESPONSE_KEYWORDS: Record<string, string[]> = {
	yes: ['yes', 'yeah', 'yep', 'sure', 'okay', 'ok', 'do it', 'go ahead', 'please'],
	no: ['no', 'nope', 'nah', 'don\'t', 'stop', 'cancel', 'nevermind', 'never mind'],
	show: ['show', 'show me', 'let me see', 'preview'],
	explain: ['explain', 'why', 'how', 'tell me'],
	trace: ['trace', 'walk through', 'step by step'],
	simple: ['simple', 'brief', 'short', 'quick'],
	deep: ['deep', 'detail', 'detailed', 'thorough'],
	code: ['code', 'example', 'sample'],
	sketch: ['sketch', 'skeleton', 'outline'],
	compare: ['compare', 'options', 'alternatives'],
	pros: ['pros', 'cons', 'trade', 'tradeoff'],
	fix: ['fix', 'fix it', 'repair'],
	approach: ['approach', 'different', 'another way'],
	continue: ['continue', 'keep going', 'i\'ll do it', 'let me']
};

/**
 * Proactive Voice Interface Service Implementation
 */
export class ProactiveVoiceInterfaceService extends Disposable implements IProactiveVoiceInterfaceService {
	declare readonly _serviceBrand: undefined;

	private readonly _onVoiceResponse = this._register(new Emitter<IVoiceResponse>());
	readonly onVoiceResponse: Event<IVoiceResponse> = this._onVoiceResponse.event;

	private readonly _onStateChange = this._register(new Emitter<ProposalState>());
	readonly onStateChange: Event<ProposalState> = this._onStateChange.event;

	private state: ProposalState = 'idle';
	private enabled = false;
	private currentAction: IProposedAction | null = null;
	private responseTimeout: ReturnType<typeof setTimeout> | null = null;
	private readonly RESPONSE_TIMEOUT = 15000; // 15 seconds

	constructor(
		@IActionProposerService private readonly actionProposer: IActionProposerService,
		@IActionExecutorService private readonly actionExecutor: IActionExecutorService,
		@IContextObserverService private readonly contextObserver: IContextObserverService,
		@IVoiceContextService private readonly voiceContext: IVoiceContextService,
	) {
		super();

		// Listen to action proposals
		this._register(this.actionProposer.onActionProposed(action => {
			if (this.enabled) {
				this.proposeViaVoice(action);
			}
		}));

		// Listen to voice transcripts
		this._register(this.voiceContext.onTranscript(event => {
			if (this.state === 'listening') {
				this.processVoiceInput(event.text, event.confidence);
			}
		}));

		console.log('[TARX Proactive] Voice interface initialized');
	}

	getState(): ProposalState {
		return this.state;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;

		if (enabled) {
			this.contextObserver.startObserving();
			console.log('[TARX Proactive] Mode enabled');
		} else {
			this.interruptProposal();
			console.log('[TARX Proactive] Mode disabled');
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	async proposeViaVoice(action: IProposedAction): Promise<void> {
		if (!this.enabled || this.state !== 'idle') {
			console.log('[TARX Proactive] Cannot propose - disabled or busy');
			return;
		}

		this.currentAction = action;
		this.setState('proposing');

		console.log('[TARX Proactive] Proposing:', action.voiceProposal);

		// Speak the proposal using TTS
		await this.speakProposal(action.voiceProposal);

		// Start listening for response
		this.setState('listening');
		this.startResponseTimeout();
	}

	processVoiceInput(text: string, confidence: number): void {
		if (this.state !== 'listening' || !this.currentAction) {
			return;
		}

		const response = this.classifyResponse(text);

		if (response) {
			this.clearResponseTimeout();

			const voiceResponse: IVoiceResponse = {
				action: response,
				confidence,
				rawText: text,
				timestamp: Date.now(),
			};

			console.log('[TARX Proactive] Response detected:', response);
			this._onVoiceResponse.fire(voiceResponse);

			// Execute the action
			this.executeResponse(voiceResponse);
		}
	}

	interruptProposal(): void {
		if (this.state === 'idle') {
			return;
		}

		console.log('[TARX Proactive] Proposal interrupted');

		this.clearResponseTimeout();
		this.currentAction = null;
		this.setState('idle');

		// Update context to note interruption
		this.contextObserver.updateVoicePattern({ tone: 'confident' });
	}

	private setState(state: ProposalState): void {
		if (this.state !== state) {
			this.state = state;
			this._onStateChange.fire(state);
			console.log('[TARX Proactive] State:', state);
		}
	}

	private classifyResponse(text: string): string | null {
		const lower = text.toLowerCase().trim();

		// Check each response type
		for (const [action, keywords] of Object.entries(RESPONSE_KEYWORDS)) {
			for (const keyword of keywords) {
				if (lower.includes(keyword)) {
					return action;
				}
			}
		}

		return null;
	}

	private startResponseTimeout(): void {
		this.clearResponseTimeout();

		this.responseTimeout = setTimeout(() => {
			console.log('[TARX Proactive] Response timeout');

			if (this.state === 'listening') {
				// No response, dismiss proposal
				this.currentAction = null;
				this.setState('idle');
			}
		}, this.RESPONSE_TIMEOUT);
	}

	private clearResponseTimeout(): void {
		if (this.responseTimeout) {
			clearTimeout(this.responseTimeout);
			this.responseTimeout = null;
		}
	}

	private async executeResponse(response: IVoiceResponse): Promise<void> {
		if (!this.currentAction) {
			return;
		}

		this.setState('executing');

		try {
			const result = await this.actionExecutor.executeAction(
				this.currentAction,
				response.action
			);

			// Speak confirmation
			if (result.success) {
				await this.speakConfirmation(result);
			}
		} catch (error) {
			console.error('[TARX Proactive] Execution error:', error);
		} finally {
			this.currentAction = null;
			this.setState('idle');
		}
	}

	private async speakProposal(text: string): Promise<void> {
		// Log to console (TTS integration point)
		console.log('[TARX TTS Proposal]', text);

		// Send to Moshi TTS service
		try {
			await this.sendToTTS(text);
		} catch (error) {
			console.error('[TARX TTS] Failed to speak proposal:', error);
		}
	}

	private async speakConfirmation(result: IExecutionResult): Promise<void> {
		let confirmation: string;

		if (result.message.includes('dismissed')) {
			confirmation = 'Got it.';
		} else if (result.message.includes('applied')) {
			confirmation = 'Done.';
		} else if (result.message.includes('Opening')) {
			confirmation = 'Opening.';
		} else if (result.message.includes('Undone')) {
			confirmation = 'Undone.';
		} else {
			confirmation = result.message;
		}

		console.log('[TARX TTS Confirm]', confirmation);

		try {
			await this.sendToTTS(confirmation);
		} catch (error) {
			console.error('[TARX TTS] Failed to speak confirmation:', error);
		}
	}

	private async sendToTTS(text: string): Promise<void> {
		// TTS integration with Moshi
		// This would connect to the tarx-voice service for speech synthesis
		// For now, just log the intended speech

		// Future implementation:
		// const response = await fetch('http://127.0.0.1:8998/tts', {
		//   method: 'POST',
		//   body: JSON.stringify({ text }),
		//   headers: { 'Content-Type': 'application/json' }
		// });
		// const audioBlob = await response.blob();
		// Play audio...

		// Simulate TTS delay
		await new Promise(resolve => setTimeout(resolve, 500));
	}

	override dispose(): void {
		this.clearResponseTimeout();
		super.dispose();
	}
}
