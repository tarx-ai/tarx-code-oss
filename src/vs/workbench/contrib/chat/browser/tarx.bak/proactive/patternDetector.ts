/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Pattern Detector Service
 *  Analyzes context signals to classify user state
 *  Emits pattern detections to the action proposer
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IContextObserverService, IContextSignal, IAmbientContext } from './contextObserver.js';

/**
 * User behavior patterns
 */
export type UserPattern = 'debugging' | 'stuck' | 'exploring' | 'learning' | 'confident' | 'idle';

/**
 * Pattern detection result
 */
export interface IPatternDetection {
	pattern: UserPattern;
	confidence: number; // 0-1
	evidence: string[];
	recommendedAction?: string;
	timestamp: number;
}

export const IPatternDetectorService = createDecorator<IPatternDetectorService>('patternDetectorService');

/**
 * Pattern Detector Service Interface
 */
export interface IPatternDetectorService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when a pattern is detected
	 */
	readonly onPatternDetected: Event<IPatternDetection>;

	/**
	 * Analyze context and detect pattern
	 */
	analyzeContext(context: IAmbientContext): Promise<IPatternDetection>;

	/**
	 * Get the last detected pattern
	 */
	getLastPattern(): IPatternDetection | null;
}

/**
 * Pattern Detector Service Implementation
 * Classifies user state based on context signals
 */
export class PatternDetectorService extends Disposable implements IPatternDetectorService {
	declare readonly _serviceBrand: undefined;

	private readonly _onPatternDetected = this._register(new Emitter<IPatternDetection>());
	readonly onPatternDetected: Event<IPatternDetection> = this._onPatternDetected.event;

	private lastPattern: IPatternDetection | null = null;
	private signalBuffer: IContextSignal[] = [];
	private analysisDebounce: ReturnType<typeof setTimeout> | null = null;

	constructor(
		@IContextObserverService private readonly contextObserver: IContextObserverService,
	) {
		super();

		// Listen to context signals
		this._register(this.contextObserver.onContextSignal(signal => this.processSignal(signal)));

		console.log('[TARX Pattern] Detector service initialized');
	}

	getLastPattern(): IPatternDetection | null {
		return this.lastPattern;
	}

	async analyzeContext(context: IAmbientContext): Promise<IPatternDetection> {
		// Run all pattern detectors in parallel
		const patterns = await Promise.all([
			this.detectDebugging(context),
			this.detectStuck(context),
			this.detectExploring(context),
			this.detectLearning(context),
			this.detectConfident(context),
			this.detectIdle(context),
		]);

		// Return highest confidence pattern
		const bestPattern = patterns.reduce((prev, current) =>
			current.confidence > prev.confidence ? current : prev
		);

		// Only emit if confidence changed significantly or pattern changed
		if (
			!this.lastPattern ||
			this.lastPattern.pattern !== bestPattern.pattern ||
			Math.abs(this.lastPattern.confidence - bestPattern.confidence) > 0.1
		) {
			this.lastPattern = bestPattern;

			if (bestPattern.confidence >= 0.5) {
				this._onPatternDetected.fire(bestPattern);
				console.log('[TARX Pattern] Detected:', bestPattern.pattern, `(${Math.round(bestPattern.confidence * 100)}%)`);
			}
		}

		return bestPattern;
	}

	private processSignal(signal: IContextSignal): void {
		// Buffer signals for batch analysis
		this.signalBuffer.push(signal);

		// Keep last 20 signals
		if (this.signalBuffer.length > 20) {
			this.signalBuffer = this.signalBuffer.slice(-20);
		}

		// Debounce analysis to avoid too frequent updates
		if (this.analysisDebounce) {
			clearTimeout(this.analysisDebounce);
		}

		this.analysisDebounce = setTimeout(async () => {
			const context = await this.contextObserver.getAmbientContext();
			await this.analyzeContext(context);
		}, 500);
	}

	private async detectDebugging(context: IAmbientContext): Promise<IPatternDetection> {
		const evidence: string[] = [];
		let score = 0;

		const utterance = context.voicePattern.lastUtterance.toLowerCase();

		// Check for error-related language
		const errorKeywords = ['error', 'bug', 'broken', 'wrong', 'undefined', 'null', 'fails', 'crash', 'exception'];
		for (const keyword of errorKeywords) {
			if (utterance.includes(keyword)) {
				score += 0.2;
				evidence.push(`Error keyword: "${keyword}"`);
				break;
			}
		}

		// Check for debugging questions
		const debugQuestions = ['why is', 'why does', 'what\'s wrong', 'not working', 'doesn\'t work'];
		for (const question of debugQuestions) {
			if (utterance.includes(question)) {
				score += 0.25;
				evidence.push(`Debug question: "${question}"`);
				break;
			}
		}

		// Check for repeated edits (trial and error)
		if (context.editorActivity.fileChanges > 3) {
			score += 0.15;
			evidence.push(`${context.editorActivity.fileChanges} file changes`);
		}

		// Check for console.log patterns in code
		if (context.codeContext.includes('console.log')) {
			score += 0.15;
			evidence.push('Console logging detected');
		}

		// Check for error patterns in code
		if (context.codeContext.includes('catch') || context.codeContext.includes('Error')) {
			score += 0.1;
			evidence.push('Error handling code visible');
		}

		// Check voice tone
		if (context.voicePattern.tone === 'frustrated') {
			score += 0.15;
			evidence.push('Frustrated tone detected');
		} else if (context.voicePattern.tone === 'uncertain') {
			score += 0.1;
			evidence.push('Uncertain tone detected');
		}

		return {
			pattern: 'debugging',
			confidence: Math.min(score, 1),
			evidence,
			recommendedAction: 'Offer to trace or fix the error',
			timestamp: Date.now(),
		};
	}

	private async detectStuck(context: IAmbientContext): Promise<IPatternDetection> {
		const evidence: string[] = [];
		let score = 0;

		// Check time on same problem
		if (context.timeSignals.onSameProblem > 120) {
			score += 0.3;
			evidence.push(`${Math.round(context.timeSignals.onSameProblem / 60)} min on same problem`);
		} else if (context.timeSignals.onSameProblem > 60) {
			score += 0.2;
			evidence.push(`${Math.round(context.timeSignals.onSameProblem / 60)} min on same problem`);
		}

		// Check failed attempts
		if (context.timeSignals.failedAttempts >= 3) {
			score += 0.3;
			evidence.push(`${context.timeSignals.failedAttempts} failed attempts`);
		} else if (context.timeSignals.failedAttempts >= 2) {
			score += 0.2;
			evidence.push(`${context.timeSignals.failedAttempts} failed attempts`);
		}

		// Check silence duration (thinking hard)
		if (context.voicePattern.silenceDuration > 60) {
			score += 0.2;
			evidence.push('Extended silence (thinking)');
		} else if (context.voicePattern.silenceDuration > 30) {
			score += 0.1;
			evidence.push('Long pause');
		}

		// Check for explicit stuck signals
		const stuckPhrases = ['i don\'t know', 'no idea', 'stuck', 'help', 'confused', 'lost'];
		const utterance = context.voicePattern.lastUtterance.toLowerCase();
		for (const phrase of stuckPhrases) {
			if (utterance.includes(phrase)) {
				score += 0.3;
				evidence.push(`Stuck expression: "${phrase}"`);
				break;
			}
		}

		// Frustrated tone
		if (context.voicePattern.tone === 'frustrated') {
			score += 0.15;
			evidence.push('Frustrated tone');
		}

		// Already flagged as stuck
		if (context.timeSignals.isStuck) {
			score += 0.2;
			evidence.push('Time-based stuck detection');
		}

		return {
			pattern: 'stuck',
			confidence: Math.min(score, 1),
			evidence,
			recommendedAction: 'Offer help or alternative approach',
			timestamp: Date.now(),
		};
	}

	private async detectExploring(context: IAmbientContext): Promise<IPatternDetection> {
		const evidence: string[] = [];
		let score = 0;

		const utterance = context.voicePattern.lastUtterance.toLowerCase();

		// Speculative language
		const exploratoryPhrases = ['what if', 'could we', 'maybe', 'perhaps', 'how about', 'let\'s try', 'i wonder'];
		for (const phrase of exploratoryPhrases) {
			if (utterance.includes(phrase)) {
				score += 0.3;
				evidence.push(`Exploratory phrase: "${phrase}"`);
				break;
			}
		}

		// Hypothetical questions
		if (utterance.includes('?') && (utterance.includes('would') || utterance.includes('could') || utterance.includes('should'))) {
			score += 0.2;
			evidence.push('Hypothetical question');
		}

		// Multiple file exploration
		if (context.editorActivity.fileChanges > 5) {
			score += 0.2;
			evidence.push('Exploring multiple files');
		}

		// Thinking tone
		if (context.voicePattern.tone === 'thinking') {
			score += 0.15;
			evidence.push('Thinking tone');
		}

		// Confident tone (in flow, exploring options)
		if (context.voicePattern.tone === 'confident') {
			score += 0.1;
			evidence.push('Confident exploration');
		}

		// Faster pace (brainstorming)
		if (context.voicePattern.pace === 'fast') {
			score += 0.1;
			evidence.push('Fast pace (brainstorming)');
		}

		return {
			pattern: 'exploring',
			confidence: Math.min(score, 1),
			evidence,
			recommendedAction: 'Offer options or sketch out approaches',
			timestamp: Date.now(),
		};
	}

	private async detectLearning(context: IAmbientContext): Promise<IPatternDetection> {
		const evidence: string[] = [];
		let score = 0;

		const utterance = context.voicePattern.lastUtterance.toLowerCase();

		// Learning keywords
		const learningPhrases = ['how do', 'how does', 'what is', 'what does', 'explain', 'tell me', 'teach me', 'i don\'t understand'];
		for (const phrase of learningPhrases) {
			if (utterance.includes(phrase)) {
				score += 0.35;
				evidence.push(`Learning phrase: "${phrase}"`);
				break;
			}
		}

		// Why questions (seeking understanding)
		if (utterance.includes('why')) {
			score += 0.2;
			evidence.push('"Why" question detected');
		}

		// Uncertain tone
		if (context.voicePattern.tone === 'uncertain') {
			score += 0.15;
			evidence.push('Uncertain tone');
		} else if (context.voicePattern.tone === 'learning') {
			score += 0.2;
			evidence.push('Learning tone');
		}

		// Slow pace (processing information)
		if (context.voicePattern.pace === 'slow') {
			score += 0.1;
			evidence.push('Slow pace (processing)');
		}

		// Questions in chat history
		const recentQuestions = context.chatHistory.filter(msg => msg.includes('?')).length;
		if (recentQuestions >= 2) {
			score += 0.15;
			evidence.push('Multiple questions in history');
		}

		return {
			pattern: 'learning',
			confidence: Math.min(score, 1),
			evidence,
			recommendedAction: 'Explain the concept clearly',
			timestamp: Date.now(),
		};
	}

	private async detectConfident(context: IAmbientContext): Promise<IPatternDetection> {
		const evidence: string[] = [];
		let score = 0;

		const utterance = context.voicePattern.lastUtterance.toLowerCase();

		// Confirming language
		const confirmPhrases = ['yeah', 'yes', 'looks good', 'makes sense', 'got it', 'i see', 'perfect', 'nice', 'great'];
		for (const phrase of confirmPhrases) {
			if (utterance.includes(phrase)) {
				score += 0.3;
				evidence.push(`Confirmation: "${phrase}"`);
				break;
			}
		}

		// Action language (doing, not asking)
		const actionPhrases = ['let me', 'i\'ll', 'i will', 'doing', 'going to'];
		for (const phrase of actionPhrases) {
			if (utterance.includes(phrase)) {
				score += 0.2;
				evidence.push(`Action language: "${phrase}"`);
				break;
			}
		}

		// Confident tone
		if (context.voicePattern.tone === 'confident') {
			score += 0.25;
			evidence.push('Confident tone');
		}

		// Fast pace (in flow)
		if (context.voicePattern.pace === 'fast') {
			score += 0.15;
			evidence.push('Fast pace (in flow)');
		}

		// No stuck signals
		if (!context.timeSignals.isStuck && context.timeSignals.failedAttempts === 0) {
			score += 0.1;
			evidence.push('No stuck signals');
		}

		return {
			pattern: 'confident',
			confidence: Math.min(score, 1),
			evidence,
			recommendedAction: 'Stay silent, let them work',
			timestamp: Date.now(),
		};
	}

	private async detectIdle(context: IAmbientContext): Promise<IPatternDetection> {
		const evidence: string[] = [];
		let score = 0;

		// Long silence with no edits
		const timeSinceLastEdit = (Date.now() - context.editorActivity.lastEditTime) / 1000;

		if (context.voicePattern.silenceDuration > 120 && timeSinceLastEdit > 120) {
			score += 0.7;
			evidence.push('Extended inactivity');
		} else if (context.voicePattern.silenceDuration > 60 && timeSinceLastEdit > 60) {
			score += 0.4;
			evidence.push('Moderate inactivity');
		}

		// No recent chat
		if (context.chatHistory.length === 0) {
			score += 0.2;
			evidence.push('No recent chat');
		}

		return {
			pattern: 'idle',
			confidence: Math.min(score, 1),
			evidence,
			recommendedAction: 'Wait or offer help',
			timestamp: Date.now(),
		};
	}

	override dispose(): void {
		if (this.analysisDebounce) {
			clearTimeout(this.analysisDebounce);
		}
		super.dispose();
	}
}
