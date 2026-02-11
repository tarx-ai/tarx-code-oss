/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pattern Detector - Classifies user state from ambient context
 *
 * Analyzes context signals to determine what the user is doing:
 * debugging, stuck, exploring, learning, confident, or idle
 */

import { EventEmitter } from 'events';
import {
  IAmbientContext,
  IContextSignal,
  ContextObserverService,
  getContextObserver
} from './contextObserver';

// ========================================
// Types
// ========================================

export type UserPattern =
  | 'debugging'
  | 'stuck'
  | 'exploring'
  | 'learning'
  | 'confident'
  | 'idle';

export interface IDetectedPattern {
  pattern: UserPattern;
  confidence: number; // 0-1
  evidence: string[];
  timestamp: number;
  context: IAmbientContext;
}

export interface IPatternThresholds {
  debugging: number;
  stuck: number;
  exploring: number;
  learning: number;
  confident: number;
  idle: number;
}

// ========================================
// Pattern Detector Service
// ========================================

export class PatternDetectorService extends EventEmitter {
  private contextObserver: ContextObserverService;
  private lastPattern: IDetectedPattern | null = null;
  private patternHistory: IDetectedPattern[] = [];
  private thresholds: IPatternThresholds = {
    debugging: 0.7,
    stuck: 0.75,
    exploring: 0.65,
    learning: 0.6,
    confident: 0.8,
    idle: 0.5
  };

  constructor(contextObserver?: ContextObserverService) {
    super();
    this.contextObserver = contextObserver || getContextObserver();
    console.log('[TARX PatternDetector] Initialized');
  }

  /**
   * Start pattern detection
   */
  start(): void {
    this.contextObserver.on('signal', this.onContextSignal.bind(this));
    console.log('[TARX PatternDetector] Started');
  }

  /**
   * Stop pattern detection
   */
  stop(): void {
    this.contextObserver.removeAllListeners('signal');
    console.log('[TARX PatternDetector] Stopped');
  }

  /**
   * Get current detected pattern
   */
  getCurrentPattern(): IDetectedPattern | null {
    return this.lastPattern;
  }

  /**
   * Detect pattern from current context
   */
  detectPattern(): IDetectedPattern {
    const context = this.contextObserver.getContext();
    const scores = this.calculatePatternScores(context);

    // Find highest scoring pattern
    let bestPattern: UserPattern = 'idle';
    let bestScore = 0;
    let evidence: string[] = [];

    for (const [pattern, data] of Object.entries(scores)) {
      if (data.score > bestScore) {
        bestScore = data.score;
        bestPattern = pattern as UserPattern;
        evidence = data.evidence;
      }
    }

    const detected: IDetectedPattern = {
      pattern: bestPattern,
      confidence: bestScore,
      evidence,
      timestamp: Date.now(),
      context
    };

    this.lastPattern = detected;
    this.patternHistory.push(detected);

    // Keep last 50 patterns
    if (this.patternHistory.length > 50) {
      this.patternHistory.shift();
    }

    return detected;
  }

  /**
   * Get confidence level for proposal triggering
   */
  getConfidence(): number {
    return this.lastPattern?.confidence || 0;
  }

  /**
   * Check if pattern is actionable (high enough confidence)
   */
  isActionable(): boolean {
    if (!this.lastPattern) return false;
    const threshold = this.thresholds[this.lastPattern.pattern] || 0.7;
    return this.lastPattern.confidence >= threshold;
  }

  // ========================================
  // Private Methods
  // ========================================

  private onContextSignal(signal: IContextSignal): void {
    // Re-detect pattern on significant signals
    const significantTypes = ['code_change', 'voice_input', 'diagnostic_change'];
    if (significantTypes.includes(signal.type)) {
      const pattern = this.detectPattern();

      // Emit if actionable and different from last emission
      if (this.isActionable()) {
        this.emit('pattern', pattern);
      }
    }
  }

  private calculatePatternScores(context: IAmbientContext): Record<UserPattern, { score: number; evidence: string[] }> {
    return {
      debugging: this.scoreDebugging(context),
      stuck: this.scoreStuck(context),
      exploring: this.scoreExploring(context),
      learning: this.scoreLearning(context),
      confident: this.scoreConfident(context),
      idle: this.scoreIdle(context)
    };
  }

  /**
   * Debugging pattern: errors present, focused edits, frustration signals
   */
  private scoreDebugging(context: IAmbientContext): { score: number; evidence: string[] } {
    let score = 0;
    const evidence: string[] = [];

    // Errors present
    if (context.diagnostics.errorCount > 0) {
      score += 0.3;
      evidence.push(`${context.diagnostics.errorCount} errors in file`);
    }

    // Same error repeated
    if (context.diagnostics.sameErrorRepeated > 1) {
      score += 0.2;
      evidence.push('Same error appearing multiple times');
    }

    // Repeated edits to same line
    if (context.editorActivity.sameLineEdits > 3) {
      score += 0.2;
      evidence.push('Repeated edits to same location');
    }

    // Frustration in voice
    if (context.voicePattern.frustrationIndicators > 0) {
      score += 0.15;
      evidence.push('Frustration detected in voice');
    }

    // Error-related words in voice
    const errorWords = ['error', 'bug', 'broken', 'fix', 'wrong', 'issue'];
    const hasErrorWords = context.voicePattern.recentUtterances.some(
      u => errorWords.some(w => u.toLowerCase().includes(w))
    );
    if (hasErrorWords) {
      score += 0.15;
      evidence.push('Error-related language in conversation');
    }

    return { score: Math.min(score, 1), evidence };
  }

  /**
   * Stuck pattern: long silence, no progress, repeated attempts
   */
  private scoreStuck(context: IAmbientContext): { score: number; evidence: string[] } {
    let score = 0;
    const evidence: string[] = [];

    // Long time since last action (> 2 min)
    if (context.timeSignals.timeSinceLastAction > 120000) {
      score += 0.3;
      evidence.push('No activity for 2+ minutes');
    }

    // Long time on same file (> 10 min) with errors
    if (context.timeSignals.timeOnCurrentFile > 600000 && context.diagnostics.errorCount > 0) {
      score += 0.25;
      evidence.push('On same file with errors for 10+ minutes');
    }

    // Many repeated edits to same location
    if (context.editorActivity.sameLineEdits > 5) {
      score += 0.2;
      evidence.push('Many repeated edits suggest stuck on problem');
    }

    // High undo count
    if (context.editorActivity.undoCount > 5) {
      score += 0.15;
      evidence.push('High undo count');
    }

    // Long voice silence after questions
    if (context.voicePattern.silenceDuration > 60000 && context.voicePattern.questionCount > 0) {
      score += 0.1;
      evidence.push('Silence after asking questions');
    }

    return { score: Math.min(score, 1), evidence };
  }

  /**
   * Exploring pattern: many file changes, hypothetical language
   */
  private scoreExploring(context: IAmbientContext): { score: number; evidence: string[] } {
    let score = 0;
    const evidence: string[] = [];

    // Many file changes
    if (context.editorActivity.fileChanges > 10) {
      score += 0.3;
      evidence.push('Many file changes (exploring codebase)');
    }

    // Hypothetical language
    const exploratoryWords = ['what if', 'maybe', 'could', 'try', 'wonder', 'thinking'];
    const hasExploratoryWords = context.voicePattern.recentUtterances.some(
      u => exploratoryWords.some(w => u.toLowerCase().includes(w))
    );
    if (hasExploratoryWords) {
      score += 0.25;
      evidence.push('Exploratory/hypothetical language');
    }

    // Many cursor movements (browsing code)
    if (context.editorActivity.cursorMovements > 50) {
      score += 0.2;
      evidence.push('Frequent navigation (browsing)');
    }

    // Short time on each file
    if (context.timeSignals.timeOnCurrentFile < 30000 && context.editorActivity.fileChanges > 3) {
      score += 0.15;
      evidence.push('Quick file switching');
    }

    // Selection activity (looking at code)
    if (context.editorActivity.selectionLength > 100) {
      score += 0.1;
      evidence.push('Reading/selecting code blocks');
    }

    return { score: Math.min(score, 1), evidence };
  }

  /**
   * Learning pattern: how/why questions, slow pace, careful reading
   */
  private scoreLearning(context: IAmbientContext): { score: number; evidence: string[] } {
    let score = 0;
    const evidence: string[] = [];

    // Many questions
    if (context.voicePattern.questionCount > 2) {
      score += 0.35;
      evidence.push('Multiple questions asked');
    }

    // How/why language
    const learningWords = ['how', 'why', 'explain', 'understand', 'mean', 'work'];
    const hasLearningWords = context.voicePattern.recentUtterances.some(
      u => learningWords.some(w => u.toLowerCase().includes(w))
    );
    if (hasLearningWords) {
      score += 0.25;
      evidence.push('Learning-oriented language');
    }

    // Slow pace (long time on file with few changes)
    if (context.timeSignals.timeOnCurrentFile > 300000 && context.editorActivity.fileChanges < 5) {
      score += 0.2;
      evidence.push('Slow, careful reading');
    }

    // Long selections (reading documentation/comments)
    if (context.editorActivity.selectionLength > 200) {
      score += 0.15;
      evidence.push('Reading large code sections');
    }

    return { score: Math.min(score, 1), evidence };
  }

  /**
   * Confident pattern: fast pace, minimal errors, confirming language
   */
  private scoreConfident(context: IAmbientContext): { score: number; evidence: string[] } {
    let score = 0;
    const evidence: string[] = [];

    // No errors
    if (context.diagnostics.errorCount === 0) {
      score += 0.3;
      evidence.push('No errors present');
    }

    // Active editing (in flow)
    if (context.editorActivity.fileChanges > 5 && context.editorActivity.sameLineEdits < 2) {
      score += 0.25;
      evidence.push('Steady productive editing');
    }

    // Confirming language
    const confidentWords = ['got it', 'done', 'next', 'okay', 'perfect', 'good'];
    const hasConfidentWords = context.voicePattern.recentUtterances.some(
      u => confidentWords.some(w => u.toLowerCase().includes(w))
    );
    if (hasConfidentWords) {
      score += 0.2;
      evidence.push('Confident/confirming language');
    }

    // Low undo count
    if (context.editorActivity.undoCount < 2) {
      score += 0.15;
      evidence.push('Few undos (confident edits)');
    }

    // No frustration
    if (context.voicePattern.frustrationIndicators === 0) {
      score += 0.1;
      evidence.push('No frustration signals');
    }

    return { score: Math.min(score, 1), evidence };
  }

  /**
   * Idle pattern: no activity, long silence
   */
  private scoreIdle(context: IAmbientContext): { score: number; evidence: string[] } {
    let score = 0;
    const evidence: string[] = [];

    // Long time since last action (> 5 min)
    if (context.timeSignals.timeSinceLastAction > 300000) {
      score += 0.5;
      evidence.push('No activity for 5+ minutes');
    }

    // No recent voice
    if (context.voicePattern.silenceDuration > 300000) {
      score += 0.3;
      evidence.push('No voice input for 5+ minutes');
    }

    // No file changes
    if (context.editorActivity.fileChanges === 0) {
      score += 0.2;
      evidence.push('No file changes');
    }

    return { score: Math.min(score, 1), evidence };
  }

  dispose(): void {
    this.stop();
  }
}

// Export singleton factory
let instance: PatternDetectorService | null = null;

export function getPatternDetector(): PatternDetectorService {
  if (!instance) {
    instance = new PatternDetectorService();
  }
  return instance;
}
