/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';

/**
 * Voice context data structure
 * Holds session state, chat history, and metadata for voice interactions
 */
export interface IVoiceContext {
	sessionId: string;
	chatHistory: Array<{
		role: 'user' | 'assistant';
		content: string;
		timestamp: number;
	}>;
	currentCode?: string;
	codeContext?: string;
	systemPrompt: string;
	metadata: {
		timestamp: number;
		userLanguage: string;
		codeLanguage?: string;
		recentTopics: string[];
	};
}

/**
 * Voice transcript event data
 */
export interface IVoiceTranscriptEvent {
	text: string;
	isFinal: boolean;
	confidence: number;
	timestamp: number;
}

export const IVoiceContextService = createDecorator<IVoiceContextService>('voiceContextService');

/**
 * Voice Context Service Interface
 * Manages shared context between voice input and chat
 */
export interface IVoiceContextService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when transcript is received
	 */
	readonly onTranscript: Event<IVoiceTranscriptEvent>;

	/**
	 * Event fired when voice status changes
	 */
	readonly onStatusChange: Event<'idle' | 'listening' | 'processing' | 'error'>;

	/**
	 * Get current voice context
	 */
	getContext(): Promise<IVoiceContext>;

	/**
	 * Update voice context
	 */
	updateContext(partial: Partial<IVoiceContext>): Promise<void>;

	/**
	 * Get chat history from context
	 */
	getChatHistory(): Promise<IVoiceContext['chatHistory']>;

	/**
	 * Add message to chat history
	 */
	addToHistory(role: 'user' | 'assistant', content: string): void;

	/**
	 * Get current code from active editor
	 */
	getCurrentCode(): Promise<string | undefined>;

	/**
	 * Clear context and start fresh session
	 */
	clearContext(): void;

	/**
	 * Emit a transcript event
	 */
	emitTranscript(text: string, isFinal: boolean, confidence: number): void;

	/**
	 * Update voice status
	 */
	setStatus(status: 'idle' | 'listening' | 'processing' | 'error'): void;

	/**
	 * Get current status
	 */
	getStatus(): 'idle' | 'listening' | 'processing' | 'error';
}

/**
 * Default system prompt for voice interactions
 */
const DEFAULT_VOICE_SYSTEM_PROMPT = `You are TARX — Local. Private. Proactive. A helpful assistant in TARX Workbench.
When receiving voice input, respond naturally and concisely.
Silently correct obvious transcription errors.
Use the conversation context to provide relevant answers.`;

/**
 * Voice Context Service Implementation
 * Manages shared state between voice input and chat panels
 */
export class VoiceContextService extends Disposable implements IVoiceContextService {
	declare readonly _serviceBrand: undefined;

	private context: IVoiceContext | null = null;
	private currentStatus: 'idle' | 'listening' | 'processing' | 'error' = 'idle';

	private readonly _onTranscript = this._register(new Emitter<IVoiceTranscriptEvent>());
	readonly onTranscript: Event<IVoiceTranscriptEvent> = this._onTranscript.event;

	private readonly _onStatusChange = this._register(new Emitter<'idle' | 'listening' | 'processing' | 'error'>());
	readonly onStatusChange: Event<'idle' | 'listening' | 'processing' | 'error'> = this._onStatusChange.event;

	constructor() {
		super();
		console.log('[TARX VoiceContext] Service initialized');
	}

	async getContext(): Promise<IVoiceContext> {
		if (!this.context) {
			this.context = {
				sessionId: this.generateSessionId(),
				chatHistory: [],
				systemPrompt: DEFAULT_VOICE_SYSTEM_PROMPT,
				metadata: {
					timestamp: Date.now(),
					userLanguage: 'en',
					recentTopics: [],
				},
			};
			console.log('[TARX VoiceContext] Created new context:', this.context.sessionId);
		}
		return this.context;
	}

	async updateContext(partial: Partial<IVoiceContext>): Promise<void> {
		const current = await this.getContext();
		this.context = { ...current, ...partial };
		console.log('[TARX VoiceContext] Context updated');
	}

	async getChatHistory(): Promise<IVoiceContext['chatHistory']> {
		const context = await this.getContext();
		return context.chatHistory;
	}

	addToHistory(role: 'user' | 'assistant', content: string): void {
		if (this.context) {
			this.context.chatHistory.push({
				role,
				content,
				timestamp: Date.now()
			});

			// Keep last 50 messages to prevent memory bloat
			if (this.context.chatHistory.length > 50) {
				this.context.chatHistory = this.context.chatHistory.slice(-50);
			}

			// Update recent topics
			const topics = this.extractTopics(content);
			if (topics.length > 0) {
				this.context.metadata.recentTopics = [
					...topics,
					...this.context.metadata.recentTopics
				].slice(0, 10);
			}
		}
	}

	async getCurrentCode(): Promise<string | undefined> {
		const context = await this.getContext();
		return context.currentCode;
	}

	clearContext(): void {
		console.log('[TARX VoiceContext] Clearing context');
		this.context = null;
		this.currentStatus = 'idle';
	}

	emitTranscript(text: string, isFinal: boolean, confidence: number): void {
		this._onTranscript.fire({
			text,
			isFinal,
			confidence,
			timestamp: Date.now()
		});
	}

	setStatus(status: 'idle' | 'listening' | 'processing' | 'error'): void {
		if (this.currentStatus !== status) {
			this.currentStatus = status;
			this._onStatusChange.fire(status);
			console.log('[TARX VoiceContext] Status changed:', status);
		}
	}

	getStatus(): 'idle' | 'listening' | 'processing' | 'error' {
		return this.currentStatus;
	}

	private generateSessionId(): string {
		const now = new Date();
		const date = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}`;
		const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
		const random = Math.random().toString(36).substring(2, 8);
		return `voice_${date}_${time}_${random}`;
	}

	private extractTopics(content: string): string[] {
		// Simple topic extraction - look for code-related keywords
		const keywords = [
			'function', 'class', 'component', 'api', 'database',
			'error', 'bug', 'test', 'deploy', 'build', 'react',
			'typescript', 'javascript', 'python', 'css', 'html'
		];

		const lowerContent = content.toLowerCase();
		return keywords.filter(k => lowerContent.includes(k));
	}
}
