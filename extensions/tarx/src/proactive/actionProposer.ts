/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Action Proposer - Generates concrete actions based on detected patterns
 *
 * Takes pattern detection results and proposes specific actions the user
 * can approve, reject, or get more information about.
 */

import { EventEmitter } from 'events';
import {
  IDetectedPattern,
  UserPattern,
  PatternDetectorService,
  getPatternDetector
} from './patternDetector';

// ========================================
// Types
// ========================================

export interface IProposedAction {
  id: string;
  title: string;
  description: string;
  voiceProposal: string; // Under 15 words, natural language
  type: 'fix' | 'explain' | 'suggest' | 'help' | 'generate';
  options: IActionOption[];
  confidence: number;
  pattern: UserPattern;
  reversible: boolean;
  context: {
    file?: string;
    line?: number;
    code?: string;
    error?: string;
  };
  timestamp: number;
}

export interface IActionOption {
  id: string;
  label: string;
  voiceLabel: string; // Spoken version
  action: 'approve' | 'reject' | 'explain' | 'alternative';
}

export interface IProposalConfig {
  minConfidence: number;
  debounceMs: number;
  maxQueueSize: number;
}

// ========================================
// Action Proposer Service
// ========================================

export class ActionProposerService extends EventEmitter {
  private patternDetector: PatternDetectorService;
  private proposalQueue: IProposedAction[] = [];
  private activeProposal: IProposedAction | null = null;
  private lastProposalTime: number = 0;
  private proposalTimeout: NodeJS.Timeout | null = null;
  private config: IProposalConfig = {
    minConfidence: 0.85,
    debounceMs: 3000,
    maxQueueSize: 5
  };

  constructor(patternDetector?: PatternDetectorService) {
    super();
    this.patternDetector = patternDetector || getPatternDetector();
    console.log('[TARX ActionProposer] Initialized');
  }

  /**
   * Start listening for patterns
   */
  start(): void {
    this.patternDetector.on('pattern', this.onPatternDetected.bind(this));
    console.log('[TARX ActionProposer] Started');
  }

  /**
   * Stop proposing actions
   */
  stop(): void {
    this.patternDetector.removeAllListeners('pattern');
    if (this.proposalTimeout) {
      clearTimeout(this.proposalTimeout);
    }
    console.log('[TARX ActionProposer] Stopped');
  }

  /**
   * Get active proposal
   */
  getActiveProposal(): IProposedAction | null {
    return this.activeProposal;
  }

  /**
   * Get next queued proposal
   */
  getNextAction(): IProposedAction | null {
    return this.proposalQueue[0] || null;
  }

  /**
   * Clear active proposal (after user response)
   */
  clearActiveProposal(): void {
    if (this.proposalTimeout) {
      clearTimeout(this.proposalTimeout);
      this.proposalTimeout = null;
    }
    this.activeProposal = null;

    // Show next queued proposal if available
    if (this.proposalQueue.length > 0) {
      setTimeout(() => {
        const next = this.proposalQueue.shift();
        if (next) {
          this.presentProposal(next);
        }
      }, 1000);
    }
  }

  /**
   * Manually generate a proposal for a pattern
   */
  generateProposal(pattern: IDetectedPattern): IProposedAction | null {
    if (pattern.confidence < this.config.minConfidence) {
      console.log('[TARX ActionProposer] Confidence too low:', pattern.confidence);
      return null;
    }

    const proposal = this.createProposalForPattern(pattern);
    if (!proposal) {
      return null;
    }

    return proposal;
  }

  // ========================================
  // Private Methods
  // ========================================

  private onPatternDetected(pattern: IDetectedPattern): void {
    // Debounce rapid pattern changes
    const now = Date.now();
    if (now - this.lastProposalTime < this.config.debounceMs) {
      console.log('[TARX ActionProposer] Debouncing rapid pattern');
      return;
    }

    // Skip if already showing proposal
    if (this.activeProposal) {
      console.log('[TARX ActionProposer] Proposal already active, queuing');
      const proposal = this.createProposalForPattern(pattern);
      if (proposal && this.proposalQueue.length < this.config.maxQueueSize) {
        this.proposalQueue.push(proposal);
      }
      return;
    }

    // Skip low confidence
    if (pattern.confidence < this.config.minConfidence) {
      return;
    }

    // Skip confident pattern (don't interrupt flow)
    if (pattern.pattern === 'confident') {
      console.log('[TARX ActionProposer] User is confident, staying silent');
      return;
    }

    // Skip idle pattern
    if (pattern.pattern === 'idle') {
      return;
    }

    // Generate and present proposal
    const proposal = this.createProposalForPattern(pattern);
    if (proposal) {
      this.presentProposal(proposal);
    }
  }

  private presentProposal(proposal: IProposedAction): void {
    this.activeProposal = proposal;
    this.lastProposalTime = Date.now();

    // Set timeout to auto-clear if no response
    this.proposalTimeout = setTimeout(() => {
      console.log('[TARX ActionProposer] Proposal timed out');
      this.activeProposal = null;
      this.emit('timeout', proposal);
    }, 30000);

    this.emit('proposal', proposal);
  }

  private createProposalForPattern(pattern: IDetectedPattern): IProposedAction | null {
    const id = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    switch (pattern.pattern) {
      case 'debugging':
        return this.createDebuggingProposal(id, pattern);
      case 'stuck':
        return this.createStuckProposal(id, pattern);
      case 'exploring':
        return this.createExploringProposal(id, pattern);
      case 'learning':
        return this.createLearningProposal(id, pattern);
      default:
        return null;
    }
  }

  private createDebuggingProposal(id: string, pattern: IDetectedPattern): IProposedAction {
    const error = pattern.context.diagnostics.recentErrors[0] || 'the error';
    const file = pattern.context.currentFile.split('/').pop() || 'current file';

    return {
      id,
      title: 'Fix Error',
      description: `I see ${error.slice(0, 50)}... Want me to fix it?`,
      voiceProposal: `Error in ${file}. Want me to fix it?`,
      type: 'fix',
      options: [
        { id: 'yes', label: 'Yes, fix it', voiceLabel: 'yes', action: 'approve' },
        { id: 'show', label: 'Show me first', voiceLabel: 'show me', action: 'explain' },
        { id: 'no', label: 'No thanks', voiceLabel: 'no', action: 'reject' }
      ],
      confidence: pattern.confidence,
      pattern: pattern.pattern,
      reversible: true,
      context: {
        file: pattern.context.currentFile,
        error: error
      },
      timestamp: Date.now()
    };
  }

  private createStuckProposal(id: string, pattern: IDetectedPattern): IProposedAction {
    const minutes = Math.round(pattern.context.timeSignals.timeOnCurrentFile / 60000);

    return {
      id,
      title: 'Offer Help',
      description: `You've been here ${minutes} minutes. Want me to help?`,
      voiceProposal: `Been here a while. Want help?`,
      type: 'help',
      options: [
        { id: 'explain', label: 'Explain the issue', voiceLabel: 'explain', action: 'explain' },
        { id: 'suggest', label: 'Suggest approach', voiceLabel: 'suggest', action: 'alternative' },
        { id: 'fix', label: 'Just fix it', voiceLabel: 'fix it', action: 'approve' },
        { id: 'no', label: 'I\'m fine', voiceLabel: 'no', action: 'reject' }
      ],
      confidence: pattern.confidence,
      pattern: pattern.pattern,
      reversible: false,
      context: {
        file: pattern.context.currentFile,
        code: pattern.context.codeContext
      },
      timestamp: Date.now()
    };
  }

  private createExploringProposal(id: string, pattern: IDetectedPattern): IProposedAction {
    return {
      id,
      title: 'Sketch Idea',
      description: 'I see you\'re exploring. Want me to sketch out an approach?',
      voiceProposal: `I like where you're going. Want me to sketch it?`,
      type: 'suggest',
      options: [
        { id: 'yes', label: 'Yes, sketch it', voiceLabel: 'yes', action: 'approve' },
        { id: 'options', label: 'Show options', voiceLabel: 'show options', action: 'alternative' },
        { id: 'no', label: 'No, exploring', voiceLabel: 'no', action: 'reject' }
      ],
      confidence: pattern.confidence,
      pattern: pattern.pattern,
      reversible: false,
      context: {
        file: pattern.context.currentFile,
        code: pattern.context.codeContext
      },
      timestamp: Date.now()
    };
  }

  private createLearningProposal(id: string, pattern: IDetectedPattern): IProposedAction {
    return {
      id,
      title: 'Explain Code',
      description: 'Want me to explain how this works?',
      voiceProposal: `Good question. Want me to explain?`,
      type: 'explain',
      options: [
        { id: 'simple', label: 'Simple explanation', voiceLabel: 'simple', action: 'approve' },
        { id: 'detailed', label: 'Detailed breakdown', voiceLabel: 'detailed', action: 'alternative' },
        { id: 'code', label: 'With code examples', voiceLabel: 'with code', action: 'alternative' },
        { id: 'no', label: 'No thanks', voiceLabel: 'no', action: 'reject' }
      ],
      confidence: pattern.confidence,
      pattern: pattern.pattern,
      reversible: false,
      context: {
        file: pattern.context.currentFile,
        code: pattern.context.codeContext
      },
      timestamp: Date.now()
    };
  }

  dispose(): void {
    this.stop();
  }
}

// Export singleton factory
let instance: ActionProposerService | null = null;

export function getActionProposer(): ActionProposerService {
  if (!instance) {
    instance = new ActionProposerService();
  }
  return instance;
}
