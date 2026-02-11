/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Action Executor - Executes approved actions safely with undo support
 *
 * Handles the actual execution of proposed actions, including:
 * - Code fixes and modifications
 * - Explanations and suggestions
 * - Error handling and recovery
 * - Undo stack management
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { IProposedAction, ActionProposerService, getActionProposer } from './actionProposer';

// ========================================
// Types
// ========================================

export interface IExecutionResult {
  success: boolean;
  message: string;
  undoable: boolean;
  retriable?: boolean;
  data?: any;
}

export interface IUndoEntry {
  action: IProposedAction;
  before: IDocumentState;
  after?: IDocumentState;
  timestamp: number;
}

export interface IDocumentState {
  uri: string;
  content: string;
  version: number;
}

export interface IExecutionError {
  actionId: string;
  actionTitle: string;
  error: string;
  timestamp: number;
  method: string;
}

export type UserResponse = 'approve' | 'reject' | 'explain' | 'alternative';

// ========================================
// Action Executor Service
// ========================================

export class ActionExecutorService extends EventEmitter {
  private actionProposer: ActionProposerService;
  private undoStack: IUndoEntry[] = [];
  private maxUndoStackSize = 10;
  private errorLog: IExecutionError[] = [];
  private maxErrorRetries = 3;
  private retryCount: Map<string, number> = new Map();

  constructor(actionProposer?: ActionProposerService) {
    super();
    this.actionProposer = actionProposer || getActionProposer();
    console.log('[TARX ActionExecutor] Initialized');
  }

  /**
   * Handle user response to a proposal
   */
  async handleResponse(action: IProposedAction, response: UserResponse, optionId?: string): Promise<IExecutionResult> {
    console.log(`[TARX ActionExecutor] Handling response: ${response} for action ${action.id}`);

    switch (response) {
      case 'approve':
        return this.executeAction(action, optionId || 'default');
      case 'reject':
        return this.rejectAction(action);
      case 'explain':
        return this.explainAction(action);
      case 'alternative':
        return this.showAlternative(action, optionId);
      default:
        return { success: false, message: 'Unknown response type', undoable: false };
    }
  }

  /**
   * Execute an approved action
   */
  async executeAction(action: IProposedAction, optionId: string): Promise<IExecutionResult> {
    const startTime = Date.now();
    const timeoutMs = 15000; // 15 second timeout

    try {
      // Set timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Action timeout')), timeoutMs)
      );

      // Execute with timeout
      const result = await Promise.race([
        this.performAction(action, optionId),
        timeoutPromise
      ]);

      // Clear proposal
      this.actionProposer.clearActiveProposal();

      console.log(`[TARX ActionExecutor] Action completed in ${Date.now() - startTime}ms`);
      return result;

    } catch (error: any) {
      const executionError: IExecutionError = {
        actionId: action.id,
        actionTitle: action.title,
        error: error.message,
        timestamp: Date.now(),
        method: optionId
      };
      this.errorLog.push(executionError);

      // Check if retriable
      if (this.isRetriable(error) && this.getRetryCount(action.id) < this.maxErrorRetries) {
        console.log(`[TARX ActionExecutor] Retrying action "${action.title}"...`);
        this.incrementRetryCount(action.id);
        return this.executeAction(action, optionId);
      }

      return {
        success: false,
        message: this.getUserFriendlyError(error),
        undoable: false,
        retriable: this.isRetriable(error)
      };
    }
  }

  /**
   * Undo the last action
   */
  async undo(): Promise<IExecutionResult> {
    const entry = this.undoStack.pop();
    if (!entry) {
      return {
        success: false,
        message: 'Nothing to undo',
        undoable: false
      };
    }

    try {
      // Restore document to before state
      const uri = vscode.Uri.file(entry.before.uri);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      );

      await editor.edit(editBuilder => {
        editBuilder.replace(fullRange, entry.before.content);
      });

      console.log(`[TARX ActionExecutor] Undid action: ${entry.action.title}`);
      this.emit('undo', entry);

      return {
        success: true,
        message: `Undid: ${entry.action.title}`,
        undoable: this.undoStack.length > 0
      };

    } catch (error: any) {
      return {
        success: false,
        message: `Undo failed: ${error.message}`,
        undoable: false
      };
    }
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Get undo stack size
   */
  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  // ========================================
  // Private Methods
  // ========================================

  private async performAction(action: IProposedAction, optionId: string): Promise<IExecutionResult> {
    // Save before state for undo
    let beforeState: IDocumentState | null = null;

    if (action.context.file && action.reversible) {
      try {
        const uri = vscode.Uri.file(action.context.file);
        const document = await vscode.workspace.openTextDocument(uri);
        beforeState = {
          uri: action.context.file,
          content: document.getText(),
          version: document.version
        };
      } catch (e) {
        console.warn('[TARX ActionExecutor] Could not save before state:', e);
      }
    }

    // Execute based on action type
    let result: IExecutionResult;

    switch (action.type) {
      case 'fix':
        result = await this.executeFix(action, optionId);
        break;
      case 'explain':
        result = await this.executeExplain(action, optionId);
        break;
      case 'suggest':
        result = await this.executeSuggest(action, optionId);
        break;
      case 'help':
        result = await this.executeHelp(action, optionId);
        break;
      case 'generate':
        result = await this.executeGenerate(action, optionId);
        break;
      default:
        result = { success: false, message: 'Unknown action type', undoable: false };
    }

    // Add to undo stack if successful and reversible
    if (result.success && beforeState && action.reversible) {
      this.undoStack.push({
        action,
        before: beforeState,
        timestamp: Date.now()
      });

      // Trim undo stack
      if (this.undoStack.length > this.maxUndoStackSize) {
        this.undoStack.shift();
      }
    }

    return result;
  }

  private async executeFix(action: IProposedAction, optionId: string): Promise<IExecutionResult> {
    // Open chat with fix request
    const error = action.context.error || 'the error';
    const query = optionId === 'show'
      ? `@tarx Show me what's wrong with this code and explain the fix:\n\n${action.context.code}`
      : `@tarx /fix ${action.context.code}`;

    await vscode.commands.executeCommand('workbench.action.chat.open', { query });

    return {
      success: true,
      message: optionId === 'show' ? 'Showing fix explanation' : 'Applying fix...',
      undoable: optionId !== 'show'
    };
  }

  private async executeExplain(action: IProposedAction, optionId: string): Promise<IExecutionResult> {
    let detail = '';
    switch (optionId) {
      case 'simple':
        detail = 'Give a brief, simple explanation.';
        break;
      case 'detailed':
        detail = 'Give a detailed technical breakdown.';
        break;
      case 'code':
        detail = 'Explain with code examples.';
        break;
    }

    const query = `@tarx /explain ${detail}\n\n${action.context.code}`;
    await vscode.commands.executeCommand('workbench.action.chat.open', { query });

    return {
      success: true,
      message: 'Opening explanation',
      undoable: false
    };
  }

  private async executeSuggest(action: IProposedAction, optionId: string): Promise<IExecutionResult> {
    const query = optionId === 'options'
      ? `@tarx What are the different approaches I could take here? Give me 2-3 options:\n\n${action.context.code}`
      : `@tarx Sketch out an implementation approach for this:\n\n${action.context.code}`;

    await vscode.commands.executeCommand('workbench.action.chat.open', { query });

    return {
      success: true,
      message: 'Generating suggestion',
      undoable: false
    };
  }

  private async executeHelp(action: IProposedAction, optionId: string): Promise<IExecutionResult> {
    let query: string;

    switch (optionId) {
      case 'explain':
        query = `@tarx Explain what's happening in this code and where I might be stuck:\n\n${action.context.code}`;
        break;
      case 'suggest':
        query = `@tarx I'm stuck on this. Suggest a different approach:\n\n${action.context.code}`;
        break;
      case 'fix':
        query = `@tarx /fix ${action.context.code}`;
        break;
      default:
        query = `@tarx Help me with this code:\n\n${action.context.code}`;
    }

    await vscode.commands.executeCommand('workbench.action.chat.open', { query });

    return {
      success: true,
      message: 'Opening help',
      undoable: false
    };
  }

  private async executeGenerate(action: IProposedAction, optionId: string): Promise<IExecutionResult> {
    const query = `@tarx Generate code based on this context:\n\n${action.context.code}`;
    await vscode.commands.executeCommand('workbench.action.chat.open', { query });

    return {
      success: true,
      message: 'Generating code',
      undoable: true
    };
  }

  private async rejectAction(action: IProposedAction): Promise<IExecutionResult> {
    this.actionProposer.clearActiveProposal();
    console.log(`[TARX ActionExecutor] Action rejected: ${action.title}`);

    return {
      success: true,
      message: 'Action dismissed',
      undoable: false
    };
  }

  private async explainAction(action: IProposedAction): Promise<IExecutionResult> {
    // Show explanation without executing
    const query = `@tarx Explain what you were going to do here and why:\n\nAction: ${action.title}\nContext: ${action.context.code}`;
    await vscode.commands.executeCommand('workbench.action.chat.open', { query });

    return {
      success: true,
      message: 'Showing explanation',
      undoable: false
    };
  }

  private async showAlternative(action: IProposedAction, optionId?: string): Promise<IExecutionResult> {
    // Show alternative options
    const query = `@tarx Show me alternative approaches for:\n\n${action.context.code}`;
    await vscode.commands.executeCommand('workbench.action.chat.open', { query });

    return {
      success: true,
      message: 'Showing alternatives',
      undoable: false
    };
  }

  private isRetriable(error: Error): boolean {
    const retriableErrors = ['ECONNREFUSED', 'TIMEOUT', 'timeout', 'ENOENT'];
    return retriableErrors.some(e => error.message.includes(e));
  }

  private getRetryCount(actionId: string): number {
    return this.retryCount.get(actionId) || 0;
  }

  private incrementRetryCount(actionId: string): void {
    const count = this.getRetryCount(actionId);
    this.retryCount.set(actionId, count + 1);
  }

  private getUserFriendlyError(error: Error): string {
    if (error.message.includes('timeout')) {
      return 'Action took too long. Try again?';
    }
    if (error.message.includes('ECONNREFUSED')) {
      return 'Service unavailable. Check connection?';
    }
    if (error.message.includes('permission')) {
      return 'Permission denied. Check file access?';
    }
    return `Action failed: ${error.message}. Try a different approach?`;
  }

  dispose(): void {
    this.undoStack = [];
    this.errorLog = [];
    this.retryCount.clear();
  }
}

// Export singleton factory
let instance: ActionExecutorService | null = null;

export function getActionExecutor(): ActionExecutorService {
  if (!instance) {
    instance = new ActionExecutorService();
  }
  return instance;
}
