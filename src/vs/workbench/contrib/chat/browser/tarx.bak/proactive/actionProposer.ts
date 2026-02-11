/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Action Proposer Service
 *  Generates concrete actions based on detected patterns and context
 *  Formats proposals for voice interface
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IPatternDetectorService, IPatternDetection } from './patternDetector.js';
import { IContextObserverService, IAmbientContext } from './contextObserver.js';

/**
 * Action types that can be proposed
 */
export type ActionType = 'code_fix' | 'generate' | 'explain' | 'refactor' | 'test' | 'suggest';

/**
 * Option for user selection
 */
export interface IActionOption {
	key: string;
	label: string;
	description: string;
}

/**
 * Proposed action structure
 */
export interface IProposedAction {
	id: string;
	type: ActionType;
	title: string;
	description: string;
	voiceProposal: string; // What TARX says out loud
	code?: string; // Optional code snippet to apply
	explanation?: string; // Optional explanation
	options: IActionOption[];
	confidence: number; // 0-1
	reversible: boolean;
	timestamp: number;
	pattern: IPatternDetection; // The pattern that triggered this
}

export const IActionProposerService = createDecorator<IActionProposerService>('actionProposerService');

/**
 * Action Proposer Service Interface
 */
export interface IActionProposerService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when an action is proposed
	 */
	readonly onActionProposed: Event<IProposedAction>;

	/**
	 * Propose an action based on pattern and context
	 */
	proposeAction(pattern: IPatternDetection, context: IAmbientContext): Promise<IProposedAction | null>;

	/**
	 * Get pending proposals
	 */
	getPendingProposals(): IProposedAction[];

	/**
	 * Dismiss a proposal
	 */
	dismissProposal(actionId: string): void;
}

/**
 * Action Proposer Service Implementation
 * Generates concrete, actionable proposals based on user patterns
 */
export class ActionProposerService extends Disposable implements IActionProposerService {
	declare readonly _serviceBrand: undefined;

	private readonly _onActionProposed = this._register(new Emitter<IProposedAction>());
	readonly onActionProposed: Event<IProposedAction> = this._onActionProposed.event;

	private pendingProposals: IProposedAction[] = [];
	private lastProposalTime = 0;
	private readonly PROPOSAL_COOLDOWN = 10000; // 10 seconds between proposals

	constructor(
		@IPatternDetectorService private readonly patternDetector: IPatternDetectorService,
		@IContextObserverService private readonly contextObserver: IContextObserverService,
	) {
		super();

		// Listen to pattern detections
		this._register(this.patternDetector.onPatternDetected(async pattern => {
			const context = await this.contextObserver.getAmbientContext();
			await this.proposeAction(pattern, context);
		}));

		console.log('[TARX Action] Proposer service initialized');
	}

	getPendingProposals(): IProposedAction[] {
		return [...this.pendingProposals];
	}

	dismissProposal(actionId: string): void {
		this.pendingProposals = this.pendingProposals.filter(p => p.id !== actionId);
	}

	async proposeAction(pattern: IPatternDetection, context: IAmbientContext): Promise<IProposedAction | null> {
		// Check cooldown
		const now = Date.now();
		if (now - this.lastProposalTime < this.PROPOSAL_COOLDOWN) {
			console.log('[TARX Action] Proposal cooldown active');
			return null;
		}

		// Skip if confidence too low
		if (pattern.confidence < 0.75) {
			console.log('[TARX Action] Pattern confidence too low:', pattern.confidence);
			return null;
		}

		// Skip if user is confident (in flow, don't interrupt)
		if (pattern.pattern === 'confident') {
			console.log('[TARX Action] User is confident, not interrupting');
			return null;
		}

		// Skip if idle
		if (pattern.pattern === 'idle') {
			console.log('[TARX Action] User is idle, waiting');
			return null;
		}

		let action: IProposedAction | null = null;

		switch (pattern.pattern) {
			case 'debugging':
				action = await this.proposeDebugAction(pattern, context);
				break;
			case 'stuck':
				action = await this.proposeUnblockAction(pattern, context);
				break;
			case 'exploring':
				action = await this.proposeExploreAction(pattern, context);
				break;
			case 'learning':
				action = await this.proposeLearnAction(pattern, context);
				break;
		}

		if (action) {
			this.pendingProposals.push(action);
			this.lastProposalTime = now;

			// Keep only last 5 proposals
			if (this.pendingProposals.length > 5) {
				this.pendingProposals = this.pendingProposals.slice(-5);
			}

			this._onActionProposed.fire(action);
			console.log('[TARX Action] Proposed:', action.title);
		}

		return action;
	}

	private async proposeDebugAction(pattern: IPatternDetection, context: IAmbientContext): Promise<IProposedAction> {
		const evidenceSummary = pattern.evidence[0] || 'Error detected';
		const fileName = context.currentFile.split('/').pop() || 'this file';

		// Craft natural voice proposal
		let voiceProposal = 'I see ';
		if (evidenceSummary.includes('Error')) {
			voiceProposal += `an error in ${fileName}. Want me to fix it?`;
		} else if (evidenceSummary.includes('Console')) {
			voiceProposal += `you're debugging with console.log. Want me to trace the issue?`;
		} else {
			voiceProposal += `${evidenceSummary.toLowerCase()}. Want me to help?`;
		}

		return {
			id: `debug_${Date.now()}`,
			type: 'code_fix',
			title: 'Fix Error',
			description: `Detected debugging activity: ${evidenceSummary}`,
			voiceProposal,
			options: [
				{ key: 'yes', label: 'Yes', description: 'Apply the fix' },
				{ key: 'show', label: 'Show me', description: 'Show the fix first' },
				{ key: 'trace', label: 'Trace it', description: 'Walk through the error' },
				{ key: 'no', label: 'No', description: 'I\'ll handle it' },
			],
			confidence: pattern.confidence,
			reversible: true,
			timestamp: Date.now(),
			pattern,
		};
	}

	private async proposeUnblockAction(pattern: IPatternDetection, context: IAmbientContext): Promise<IProposedAction> {
		const stuckDuration = Math.round(context.timeSignals.onSameProblem / 60);
		const attempts = context.timeSignals.failedAttempts;

		// Craft empathetic voice proposal
		let voiceProposal: string;
		if (attempts >= 3) {
			voiceProposal = `You've tried ${attempts} approaches. Want me to suggest a different direction?`;
		} else if (stuckDuration >= 2) {
			voiceProposal = `You've been on this for ${stuckDuration} minutes. Want me to help unblock?`;
		} else {
			voiceProposal = `Looks like you're stuck here. Want me to explain or show an approach?`;
		}

		return {
			id: `unblock_${Date.now()}`,
			type: 'explain',
			title: 'Help Unblock',
			description: `Detected stuck state: ${pattern.evidence.join(', ')}`,
			voiceProposal,
			options: [
				{ key: 'explain', label: 'Explain', description: 'Explain the issue' },
				{ key: 'approach', label: 'New approach', description: 'Show a different approach' },
				{ key: 'fix', label: 'Just fix it', description: 'Apply a solution' },
				{ key: 'no', label: 'No thanks', description: 'Keep trying myself' },
			],
			confidence: pattern.confidence,
			reversible: true,
			timestamp: Date.now(),
			pattern,
		};
	}

	private async proposeExploreAction(pattern: IPatternDetection, context: IAmbientContext): Promise<IProposedAction> {
		const recentUtterance = context.voicePattern.lastUtterance;

		// Extract the exploration topic
		let topic = 'that';
		if (recentUtterance.includes('what if')) {
			topic = recentUtterance.split('what if')[1]?.trim() || 'that';
		} else if (recentUtterance.includes('could we')) {
			topic = recentUtterance.split('could we')[1]?.trim() || 'that';
		}

		const voiceProposal = `I like where you're going with ${topic.slice(0, 30)}. Want me to sketch out those options?`;

		return {
			id: `explore_${Date.now()}`,
			type: 'generate',
			title: 'Sketch Options',
			description: `Detected exploration: ${pattern.evidence.join(', ')}`,
			voiceProposal,
			options: [
				{ key: 'sketch', label: 'Sketch it', description: 'Show a skeleton implementation' },
				{ key: 'compare', label: 'Compare options', description: 'Compare different approaches' },
				{ key: 'pros', label: 'Pros/Cons', description: 'Analyze trade-offs' },
				{ key: 'continue', label: 'Let me think', description: 'Keep exploring myself' },
			],
			confidence: pattern.confidence,
			reversible: true,
			timestamp: Date.now(),
			pattern,
		};
	}

	private async proposeLearnAction(pattern: IPatternDetection, context: IAmbientContext): Promise<IProposedAction> {
		const utterance = context.voicePattern.lastUtterance;

		// Extract what they want to learn
		let topic = 'this';
		const matches = utterance.match(/(?:what is|how does|explain|tell me about)\s+(.+)/i);
		if (matches && matches[1]) {
			topic = matches[1].trim().slice(0, 50);
		}

		const voiceProposal = `Good question about ${topic}. Want me to explain?`;

		return {
			id: `learn_${Date.now()}`,
			type: 'explain',
			title: 'Explain Concept',
			description: `Detected learning intent: ${pattern.evidence.join(', ')}`,
			voiceProposal,
			explanation: `Explaining: ${topic}`,
			options: [
				{ key: 'yes', label: 'Yes', description: 'Explain it' },
				{ key: 'simple', label: 'Keep it simple', description: 'Brief explanation' },
				{ key: 'deep', label: 'Go deep', description: 'Detailed explanation with examples' },
				{ key: 'code', label: 'Show code', description: 'Explain with code examples' },
			],
			confidence: pattern.confidence,
			reversible: false,
			timestamp: Date.now(),
			pattern,
		};
	}

	override dispose(): void {
		this.pendingProposals = [];
		super.dispose();
	}
}
