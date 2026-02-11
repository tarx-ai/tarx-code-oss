/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Proactive Voice Interface - Voice-native proposal and response handling
 *
 * Bridges the proactive system with voice input/output:
 * - Speaks proposals using TTS
 * - Listens for voice responses
 * - Classifies voice responses to action options
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { IProposedAction, ActionProposerService, getActionProposer } from './actionProposer';
import { ActionExecutorService, getActionExecutor, UserResponse } from './actionExecutor';

// ========================================
// Types
// ========================================

export interface IVoiceProposal {
  action: IProposedAction;
  spokenText: string;
  expectedResponses: string[];
  timeout: number;
}

export interface IVoiceResponse {
  transcript: string;
  confidence: number;
  classified: UserResponse;
  optionId?: string;
}

export interface IServiceHealth {
  healthy: boolean;
  lastCheck: number;
  error?: string;
}

// ========================================
// Proactive Voice Interface Service
// ========================================

export class ProactiveVoiceInterfaceService extends EventEmitter {
  private actionProposer: ActionProposerService;
  private actionExecutor: ActionExecutorService;
  private isEnabled: boolean = false;
  private isPaused: boolean = false;
  private responseTimeout: NodeJS.Timeout | null = null;
  private responseTimeoutMs = 15000;
  private serviceHealth: Map<string, IServiceHealth> = new Map();
  private degradedMode: boolean = false;

  constructor(
    actionProposer?: ActionProposerService,
    actionExecutor?: ActionExecutorService
  ) {
    super();
    this.actionProposer = actionProposer || getActionProposer();
    this.actionExecutor = actionExecutor || getActionExecutor();
    console.log('[TARX ProactiveVoice] Initialized');
  }

  /**
   * Enable proactive voice interface
   */
  enable(): void {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.actionProposer.on('proposal', this.onProposal.bind(this));
    console.log('[TARX ProactiveVoice] Enabled');
    this.emit('enabled');
  }

  /**
   * Disable proactive voice interface
   */
  disable(): void {
    if (!this.isEnabled) return;

    this.isEnabled = false;
    this.actionProposer.removeAllListeners('proposal');
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout);
      this.responseTimeout = null;
    }
    console.log('[TARX ProactiveVoice] Disabled');
    this.emit('disabled');
  }

  /**
   * Toggle enabled state
   */
  toggle(): boolean {
    if (this.isEnabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this.isEnabled;
  }

  /**
   * Check if enabled
   */
  get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Pause temporarily (e.g., user is in flow)
   */
  pause(): void {
    this.isPaused = true;
    console.log('[TARX ProactiveVoice] Paused');
  }

  /**
   * Resume after pause
   */
  resume(): void {
    this.isPaused = false;
    console.log('[TARX ProactiveVoice] Resumed');
  }

  /**
   * Handle voice input (from speech provider)
   */
  async handleVoiceInput(transcript: string, confidence: number): Promise<void> {
    const activeProposal = this.actionProposer.getActiveProposal();
    if (!activeProposal) {
      console.log('[TARX ProactiveVoice] No active proposal for voice input');
      return;
    }

    // Clear response timeout
    if (this.responseTimeout) {
      clearTimeout(this.responseTimeout);
      this.responseTimeout = null;
    }

    // Classify the response
    const response = this.classifyVoiceResponse(transcript, activeProposal);
    console.log(`[TARX ProactiveVoice] Classified response: ${response.classified} (${response.optionId})`);

    // Execute the response
    const result = await this.actionExecutor.handleResponse(
      activeProposal,
      response.classified,
      response.optionId
    );

    this.emit('response', {
      action: activeProposal,
      response,
      result
    });

    // Speak confirmation
    if (result.success) {
      this.speak(this.getConfirmationMessage(response.classified, result.message));
    }
  }

  /**
   * Check service health
   */
  async checkServiceHealth(): Promise<void> {
    const services = ['llama-server', 'moshi-tts'];
    this.degradedMode = false;

    for (const service of services) {
      try {
        const healthy = await this.pingService(service);
        this.serviceHealth.set(service, { healthy, lastCheck: Date.now() });
      } catch (error: any) {
        this.serviceHealth.set(service, {
          healthy: false,
          lastCheck: Date.now(),
          error: error.message
        });
        this.degradedMode = true;
      }
    }

    if (this.degradedMode) {
      console.warn('[TARX ProactiveVoice] Running in degraded mode');
      this.emit('degraded', this.serviceHealth);
    }
  }

  /**
   * Get current proposal for UI
   */
  getCurrentProposal(): IProposedAction | null {
    return this.actionProposer.getActiveProposal();
  }

  // ========================================
  // Private Methods
  // ========================================

  private onProposal(action: IProposedAction): void {
    if (!this.isEnabled || this.isPaused) {
      console.log('[TARX ProactiveVoice] Ignoring proposal (disabled/paused)');
      return;
    }

    // In degraded mode, only high confidence proposals
    if (this.degradedMode && action.confidence < 0.9) {
      console.log('[TARX ProactiveVoice] Skipping low-confidence in degraded mode');
      return;
    }

    // Speak the proposal
    this.speak(action.voiceProposal);

    // Set response timeout
    this.responseTimeout = setTimeout(() => {
      console.log('[TARX ProactiveVoice] Response timeout');
      this.actionProposer.clearActiveProposal();
      this.emit('timeout', action);
    }, this.responseTimeoutMs);

    // Emit for UI
    this.emit('proposal', action);
  }

  private classifyVoiceResponse(transcript: string, action: IProposedAction): IVoiceResponse {
    const lower = transcript.toLowerCase().trim();

    // Check each option's voice labels
    for (const option of action.options) {
      if (lower.includes(option.voiceLabel.toLowerCase()) ||
          lower === option.voiceLabel.toLowerCase()) {
        return {
          transcript,
          confidence: 1.0,
          classified: option.action,
          optionId: option.id
        };
      }
    }

    // Generic approval patterns
    const approvalPatterns = [
      'yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'go ahead', 'do it',
      'please', 'fix it', 'help', 'show me'
    ];
    if (approvalPatterns.some(p => lower.includes(p))) {
      return {
        transcript,
        confidence: 0.85,
        classified: 'approve',
        optionId: action.options.find(o => o.action === 'approve')?.id
      };
    }

    // Generic rejection patterns
    const rejectPatterns = [
      'no', 'nope', 'not now', 'later', 'stop', 'cancel', 'dismiss',
      'nevermind', 'never mind', 'i\'m fine', 'i\'m good'
    ];
    if (rejectPatterns.some(p => lower.includes(p))) {
      return {
        transcript,
        confidence: 0.85,
        classified: 'reject'
      };
    }

    // Explain patterns
    const explainPatterns = [
      'explain', 'why', 'what', 'show', 'tell me', 'how'
    ];
    if (explainPatterns.some(p => lower.includes(p))) {
      return {
        transcript,
        confidence: 0.8,
        classified: 'explain'
      };
    }

    // Default to reject if uncertain
    return {
      transcript,
      confidence: 0.5,
      classified: 'reject'
    };
  }

  private speak(text: string): void {
    // Emit for TTS (handled by speech provider)
    this.emit('speak', text);

    // Also try VS Code speech if available
    try {
      vscode.commands.executeCommand('workbench.action.speech.speak', text);
    } catch (e) {
      // VS Code speech not available
    }
  }

  private getConfirmationMessage(response: UserResponse, message: string): string {
    switch (response) {
      case 'approve':
        return 'Done.';
      case 'reject':
        return 'Got it.';
      case 'explain':
        return 'Opening explanation.';
      case 'alternative':
        return 'Showing options.';
      default:
        return message;
    }
  }

  private async pingService(service: string): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('tarx');

    let url: string;
    switch (service) {
      case 'llama-server':
        url = config.get<string>('serverUrl', 'http://localhost:11435') + '/health';
        break;
      case 'moshi-tts':
        url = 'http://localhost:8998/health';
        break;
      default:
        return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  dispose(): void {
    this.disable();
  }
}

// Export singleton factory
let instance: ProactiveVoiceInterfaceService | null = null;

export function getProactiveVoiceInterface(): ProactiveVoiceInterfaceService {
  if (!instance) {
    instance = new ProactiveVoiceInterfaceService();
  }
  return instance;
}
