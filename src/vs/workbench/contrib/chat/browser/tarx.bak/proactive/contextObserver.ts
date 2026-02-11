/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Context Observer Service
 *  Monitors code context, voice patterns, editor activity, and time signals
 *  Emits signals to the pattern detector for user state classification
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';

/**
 * Context signal types emitted by the observer
 */
export interface IContextSignal {
	type: 'code_change' | 'voice_pattern' | 'editor_activity' | 'chat_history' | 'time_signal';
	timestamp: number;
	data: unknown;
	confidence: number; // 0-1
}

/**
 * Voice pattern analysis
 */
export interface IVoicePattern {
	tone: 'confident' | 'uncertain' | 'frustrated' | 'thinking' | 'learning';
	pace: 'fast' | 'normal' | 'slow';
	lastUtterance: string;
	silenceDuration: number; // seconds
}

/**
 * Editor activity tracking
 */
export interface IEditorActivity {
	cursorPosition: number;
	isSelecting: boolean;
	fileChanges: number;
	lastEditTime: number;
}

/**
 * Time-based signals for detecting stuck state
 */
export interface ITimeSignals {
	onSameProblem: number; // seconds
	failedAttempts: number;
	isStuck: boolean;
}

/**
 * Full ambient context snapshot
 */
export interface IAmbientContext {
	currentFile: string;
	codeContext: string;
	chatHistory: string[];
	voicePattern: IVoicePattern;
	editorActivity: IEditorActivity;
	timeSignals: ITimeSignals;
}

export const IContextObserverService = createDecorator<IContextObserverService>('contextObserverService');

/**
 * Context Observer Service Interface
 */
export interface IContextObserverService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when a context signal is detected
	 */
	readonly onContextSignal: Event<IContextSignal>;

	/**
	 * Get current ambient context snapshot
	 */
	getAmbientContext(): Promise<IAmbientContext>;

	/**
	 * Start observing context
	 */
	startObserving(): void;

	/**
	 * Stop observing context
	 */
	stopObserving(): void;

	/**
	 * Update voice pattern from voice service
	 */
	updateVoicePattern(pattern: Partial<IVoicePattern>): void;

	/**
	 * Add chat message to history
	 */
	addChatMessage(message: string): void;

	/**
	 * Reset time signals (called when problem changes)
	 */
	resetTimeSignals(): void;

	/**
	 * Increment failed attempts counter
	 */
	incrementFailedAttempts(): void;
}

/**
 * Context Observer Service Implementation
 * Monitors user activity and emits signals for pattern detection
 */
export class ContextObserverService extends Disposable implements IContextObserverService {
	declare readonly _serviceBrand: undefined;

	private readonly _onContextSignal = this._register(new Emitter<IContextSignal>());
	readonly onContextSignal: Event<IContextSignal> = this._onContextSignal.event;

	private isObserving = false;
	private context: IAmbientContext;

	private codeMonitorInterval: ReturnType<typeof setInterval> | null = null;
	private editorMonitorInterval: ReturnType<typeof setInterval> | null = null;
	private timeMonitorInterval: ReturnType<typeof setInterval> | null = null;
	private silenceInterval: ReturnType<typeof setInterval> | null = null;

	private lastCodeContent = '';
	private lastFile = '';

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
	) {
		super();
		this.context = this.initializeContext();
		console.log('[TARX Context] Observer service initialized');
	}

	private initializeContext(): IAmbientContext {
		return {
			currentFile: '',
			codeContext: '',
			chatHistory: [],
			voicePattern: {
				tone: 'thinking',
				pace: 'normal',
				lastUtterance: '',
				silenceDuration: 0,
			},
			editorActivity: {
				cursorPosition: 0,
				isSelecting: false,
				fileChanges: 0,
				lastEditTime: Date.now(),
			},
			timeSignals: {
				onSameProblem: 0,
				failedAttempts: 0,
				isStuck: false,
			},
		};
	}

	async getAmbientContext(): Promise<IAmbientContext> {
		return { ...this.context };
	}

	startObserving(): void {
		if (this.isObserving) {
			console.log('[TARX Context] Already observing');
			return;
		}

		this.isObserving = true;
		console.log('[TARX Context] Starting observation');

		// Monitor code changes every 2 seconds
		this.codeMonitorInterval = setInterval(() => this.monitorCodeChanges(), 2000);

		// Monitor editor activity every 500ms
		this.editorMonitorInterval = setInterval(() => this.monitorEditorActivity(), 500);

		// Monitor time signals every 5 seconds
		this.timeMonitorInterval = setInterval(() => this.monitorTimeSignals(), 5000);

		// Monitor silence duration every second
		this.silenceInterval = setInterval(() => this.updateSilenceDuration(), 1000);

		console.log('[TARX Context] Observer started - monitoring code, editor, and time signals');
	}

	stopObserving(): void {
		if (!this.isObserving) {
			return;
		}

		this.isObserving = false;

		if (this.codeMonitorInterval) {
			clearInterval(this.codeMonitorInterval);
			this.codeMonitorInterval = null;
		}
		if (this.editorMonitorInterval) {
			clearInterval(this.editorMonitorInterval);
			this.editorMonitorInterval = null;
		}
		if (this.timeMonitorInterval) {
			clearInterval(this.timeMonitorInterval);
			this.timeMonitorInterval = null;
		}
		if (this.silenceInterval) {
			clearInterval(this.silenceInterval);
			this.silenceInterval = null;
		}

		console.log('[TARX Context] Observer stopped');
	}

	updateVoicePattern(pattern: Partial<IVoicePattern>): void {
		this.context.voicePattern = { ...this.context.voicePattern, ...pattern };

		// Reset silence when user speaks
		if (pattern.lastUtterance) {
			this.context.voicePattern.silenceDuration = 0;
		}

		this._onContextSignal.fire({
			type: 'voice_pattern',
			timestamp: Date.now(),
			data: {
				tone: this.context.voicePattern.tone,
				pace: this.context.voicePattern.pace,
				utterance: pattern.lastUtterance?.slice(0, 100),
			},
			confidence: 0.9,
		});

		console.log('[TARX Context] Voice pattern updated:', pattern.tone || 'unchanged');
	}

	addChatMessage(message: string): void {
		this.context.chatHistory.push(message);

		// Keep last 20 messages
		if (this.context.chatHistory.length > 20) {
			this.context.chatHistory = this.context.chatHistory.slice(-20);
		}

		this._onContextSignal.fire({
			type: 'chat_history',
			timestamp: Date.now(),
			data: { messageCount: this.context.chatHistory.length, lastMessage: message.slice(0, 100) },
			confidence: 1.0,
		});
	}

	resetTimeSignals(): void {
		this.context.timeSignals = {
			onSameProblem: 0,
			failedAttempts: 0,
			isStuck: false,
		};
		console.log('[TARX Context] Time signals reset');
	}

	incrementFailedAttempts(): void {
		this.context.timeSignals.failedAttempts++;
		console.log('[TARX Context] Failed attempts:', this.context.timeSignals.failedAttempts);
	}

	private monitorCodeChanges(): void {
		if (!this.isObserving) return;

		const editor = this.codeEditorService.getFocusedCodeEditor();
		if (!editor) return;

		const model = editor.getModel();
		if (!model) return;

		const currentFile = model.uri.path;
		const currentContent = editor.getValue();
		const cursorPos = editor.getPosition();

		// Check if file changed
		if (currentFile !== this.lastFile) {
			this.context.editorActivity.fileChanges++;
			this.lastFile = currentFile;
		}

		// Check if code changed
		const codeChanged = currentContent !== this.lastCodeContent;
		if (codeChanged) {
			this.context.editorActivity.lastEditTime = Date.now();
			this.lastCodeContent = currentContent;
		}

		// Update context
		this.context.currentFile = currentFile;
		this.context.codeContext = currentContent.substring(0, 1000);
		this.context.editorActivity.cursorPosition = cursorPos?.lineNumber || 0;

		// Detect error patterns in code
		const hasError = this.detectErrorPatterns(currentContent);

		this._onContextSignal.fire({
			type: 'code_change',
			timestamp: Date.now(),
			data: {
				file: currentFile.split('/').pop(),
				hasError,
				codeChanged,
				lineCount: model.getLineCount(),
				cursorLine: cursorPos?.lineNumber,
			},
			confidence: 0.95,
		});
	}

	private detectErrorPatterns(code: string): boolean {
		const errorPatterns = [
			/error/i,
			/Error:/,
			/undefined is not/i,
			/null is not/i,
			/TypeError/,
			/ReferenceError/,
			/SyntaxError/,
			/console\.error/,
			/throw new/,
			/catch\s*\(/,
			/\.catch\(/,
		];

		return errorPatterns.some(pattern => pattern.test(code));
	}

	private monitorEditorActivity(): void {
		if (!this.isObserving) return;

		const editor = this.codeEditorService.getFocusedCodeEditor();
		if (!editor) return;

		const selection = editor.getSelection();
		const isSelecting = selection ? !selection.isEmpty() : false;

		// Only emit if selection state changed
		if (isSelecting !== this.context.editorActivity.isSelecting) {
			this.context.editorActivity.isSelecting = isSelecting;

			this._onContextSignal.fire({
				type: 'editor_activity',
				timestamp: Date.now(),
				data: {
					isSelecting,
					selectionLength: selection ? selection.endLineNumber - selection.startLineNumber : 0,
					cursorLine: selection?.startLineNumber,
				},
				confidence: 0.95,
			});
		}
	}

	private monitorTimeSignals(): void {
		if (!this.isObserving) return;

		const now = Date.now();
		const timeSinceLastEdit = (now - this.context.editorActivity.lastEditTime) / 1000;

		// Increment time on same problem
		this.context.timeSignals.onSameProblem += 5;

		// Detect stuck state
		const wasStuck = this.context.timeSignals.isStuck;
		this.context.timeSignals.isStuck =
			timeSinceLastEdit > 30 || // No edits for 30 seconds
			this.context.timeSignals.failedAttempts >= 3 || // Multiple failed attempts
			(this.context.timeSignals.onSameProblem > 120 && this.context.voicePattern.silenceDuration > 20); // Long time + silence

		this._onContextSignal.fire({
			type: 'time_signal',
			timestamp: Date.now(),
			data: {
				onSameProblem: this.context.timeSignals.onSameProblem,
				failedAttempts: this.context.timeSignals.failedAttempts,
				isStuck: this.context.timeSignals.isStuck,
				timeSinceLastEdit: Math.round(timeSinceLastEdit),
				becameStuck: !wasStuck && this.context.timeSignals.isStuck,
			},
			confidence: 0.8,
		});
	}

	private updateSilenceDuration(): void {
		if (!this.isObserving) return;

		this.context.voicePattern.silenceDuration++;
	}

	override dispose(): void {
		this.stopObserving();
		super.dispose();
	}
}
