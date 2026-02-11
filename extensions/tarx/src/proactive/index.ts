/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Proactive Intelligence Module
 *
 * Phase 6: Zero-Prompt Proactive Intelligence
 *
 * This module provides ambient context awareness and proactive assistance:
 * - Context Observer: Monitors code changes, voice patterns, editor activity
 * - Pattern Detector: Classifies user state (debugging, stuck, exploring, etc.)
 * - Action Proposer: Generates concrete action proposals
 * - Action Executor: Executes approved actions with undo support
 * - Proactive Voice Interface: Voice-native proposal handling
 */

// Context Observation
export {
  ContextObserverService,
  getContextObserver,
  IAmbientContext,
  IVoicePattern,
  IEditorActivity,
  ITimeSignals,
  IDiagnosticContext,
  IContextSignal
} from './contextObserver';

// Pattern Detection
export {
  PatternDetectorService,
  getPatternDetector,
  IDetectedPattern,
  UserPattern,
  IPatternThresholds
} from './patternDetector';

// Action Proposal
export {
  ActionProposerService,
  getActionProposer,
  IProposedAction,
  IActionOption,
  IProposalConfig
} from './actionProposer';

// Action Execution
export {
  ActionExecutorService,
  getActionExecutor,
  IExecutionResult,
  IUndoEntry,
  IDocumentState,
  IExecutionError,
  UserResponse
} from './actionExecutor';

// Voice Interface
export {
  ProactiveVoiceInterfaceService,
  getProactiveVoiceInterface,
  IVoiceProposal,
  IVoiceResponse,
  IServiceHealth
} from './proactiveVoiceInterface';

// Logger
export {
  logger,
  LogLevel,
  contextLogger,
  patternLogger,
  proposerLogger,
  executorLogger,
  voiceLogger
} from './logger';

// ========================================
// Proactive System Manager
// ========================================

import { ContextObserverService, getContextObserver } from './contextObserver';
import { PatternDetectorService, getPatternDetector } from './patternDetector';
import { ActionProposerService, getActionProposer } from './actionProposer';
import { ActionExecutorService, getActionExecutor } from './actionExecutor';
import { ProactiveVoiceInterfaceService, getProactiveVoiceInterface } from './proactiveVoiceInterface';

/**
 * ProactiveSystem - Manages all proactive services
 */
export class ProactiveSystem {
  private contextObserver: ContextObserverService;
  private patternDetector: PatternDetectorService;
  private actionProposer: ActionProposerService;
  private actionExecutor: ActionExecutorService;
  private proactiveVoice: ProactiveVoiceInterfaceService;
  private isRunning: boolean = false;

  constructor() {
    this.contextObserver = getContextObserver();
    this.patternDetector = getPatternDetector();
    this.actionProposer = getActionProposer();
    this.actionExecutor = getActionExecutor();
    this.proactiveVoice = getProactiveVoiceInterface();
  }

  /**
   * Start all proactive services
   */
  start(): void {
    if (this.isRunning) return;

    this.contextObserver.start();
    this.patternDetector.start();
    this.actionProposer.start();
    this.proactiveVoice.enable();
    this.isRunning = true;

    console.log('[TARX Proactive] System started');
  }

  /**
   * Stop all proactive services
   */
  stop(): void {
    if (!this.isRunning) return;

    this.contextObserver.stop();
    this.patternDetector.stop();
    this.actionProposer.stop();
    this.proactiveVoice.disable();
    this.isRunning = false;

    console.log('[TARX Proactive] System stopped');
  }

  /**
   * Toggle proactive system
   */
  toggle(): boolean {
    if (this.isRunning) {
      this.stop();
    } else {
      this.start();
    }
    return this.isRunning;
  }

  /**
   * Check if running
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get services for direct access
   */
  get services() {
    return {
      contextObserver: this.contextObserver,
      patternDetector: this.patternDetector,
      actionProposer: this.actionProposer,
      actionExecutor: this.actionExecutor,
      proactiveVoice: this.proactiveVoice
    };
  }

  /**
   * Dispose all services
   */
  dispose(): void {
    this.stop();
    this.contextObserver.dispose();
    this.patternDetector.dispose();
    this.actionProposer.dispose();
    this.actionExecutor.dispose();
    this.proactiveVoice.dispose();
  }
}

// Export singleton instance
let proactiveSystemInstance: ProactiveSystem | null = null;

export function getProactiveSystem(): ProactiveSystem {
  if (!proactiveSystemInstance) {
    proactiveSystemInstance = new ProactiveSystem();
  }
  return proactiveSystemInstance;
}
