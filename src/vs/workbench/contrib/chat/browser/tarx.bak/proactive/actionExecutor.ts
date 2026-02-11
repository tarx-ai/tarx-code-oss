/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Action Executor Service
 *  Executes approved actions safely
 *  Tracks undo history for reversible actions
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IProposedAction } from './actionProposer.js';

/**
 * Execution result
 */
export interface IExecutionResult {
	success: boolean;
	actionId: string;
	message: string;
	changes?: {
		before: string;
		after: string;
		file: string;
	};
	undoable: boolean;
	timestamp: number;
}

/**
 * Undo entry
 */
interface IUndoEntry {
	action: IProposedAction;
	before: string;
	file: string;
	timestamp: number;
}

export const IActionExecutorService = createDecorator<IActionExecutorService>('actionExecutorService');

/**
 * Action Executor Service Interface
 */
export interface IActionExecutorService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when an action is executed
	 */
	readonly onActionExecuted: Event<IExecutionResult>;

	/**
	 * Execute an approved action
	 */
	executeAction(action: IProposedAction, userResponse: string): Promise<IExecutionResult>;

	/**
	 * Undo the last action
	 */
	undoLastAction(): Promise<boolean>;

	/**
	 * Check if undo is available
	 */
	canUndo(): boolean;

	/**
	 * Get undo history
	 */
	getUndoHistory(): Array<{ actionId: string; title: string; timestamp: number }>;

	/**
	 * Clear undo history
	 */
	clearUndoHistory(): void;
}

/**
 * Action Executor Service Implementation
 * Handles safe execution and undo of proposed actions
 */
export class ActionExecutorService extends Disposable implements IActionExecutorService {
	declare readonly _serviceBrand: undefined;

	private readonly _onActionExecuted = this._register(new Emitter<IExecutionResult>());
	readonly onActionExecuted: Event<IExecutionResult> = this._onActionExecuted.event;

	private undoStack: IUndoEntry[] = [];
	private readonly MAX_UNDO_ENTRIES = 10;

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		console.log('[TARX Executor] Service initialized');
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	getUndoHistory(): Array<{ actionId: string; title: string; timestamp: number }> {
		return this.undoStack.map(entry => ({
			actionId: entry.action.id,
			title: entry.action.title,
			timestamp: entry.timestamp,
		}));
	}

	clearUndoHistory(): void {
		this.undoStack = [];
		console.log('[TARX Executor] Undo history cleared');
	}

	async executeAction(action: IProposedAction, userResponse: string): Promise<IExecutionResult> {
		console.log('[TARX Executor] Executing:', action.title, 'Response:', userResponse);

		const timestamp = Date.now();

		// Handle dismissal responses
		if (userResponse === 'no' || userResponse === 'continue') {
			return {
				success: true,
				actionId: action.id,
				message: 'Action dismissed',
				undoable: false,
				timestamp,
			};
		}

		// Handle explanation/preview responses
		if (userResponse === 'show' || userResponse === 'explain' || userResponse === 'trace') {
			return this.handleExplainResponse(action, userResponse);
		}

		// Handle learning responses
		if (userResponse === 'simple' || userResponse === 'deep' || userResponse === 'code') {
			return this.handleLearnResponse(action, userResponse);
		}

		// Handle exploration responses
		if (userResponse === 'sketch' || userResponse === 'compare' || userResponse === 'pros') {
			return this.handleExploreResponse(action, userResponse);
		}

		// Handle action execution
		if (userResponse === 'yes' || userResponse === 'fix' || userResponse === 'approach') {
			return this.handleActionExecution(action, userResponse);
		}

		// Unknown response
		return {
			success: false,
			actionId: action.id,
			message: `Unknown response: ${userResponse}`,
			undoable: false,
			timestamp,
		};
	}

	private async handleExplainResponse(action: IProposedAction, response: string): Promise<IExecutionResult> {
		const timestamp = Date.now();

		// Open chat with explanation request
		const query = response === 'trace'
			? `Trace through the error in the current code step by step`
			: `Show me the proposed fix for: ${action.description}`;

		try {
			await this.commandService.executeCommand('workbench.action.chat.open', {
				query: `@tarx ${query}`
			});

			return {
				success: true,
				actionId: action.id,
				message: `Opening ${response} view`,
				undoable: false,
				timestamp,
			};
		} catch (error) {
			return {
				success: false,
				actionId: action.id,
				message: `Failed to open explanation: ${error}`,
				undoable: false,
				timestamp,
			};
		}
	}

	private async handleLearnResponse(action: IProposedAction, depth: string): Promise<IExecutionResult> {
		const timestamp = Date.now();

		const depthModifier = depth === 'simple' ? 'briefly'
			: depth === 'deep' ? 'in detail with examples'
			: 'with code examples';

		const query = `Explain ${depthModifier}: ${action.explanation || action.description}`;

		try {
			await this.commandService.executeCommand('workbench.action.chat.open', {
				query: `@tarx ${query}`
			});

			return {
				success: true,
				actionId: action.id,
				message: `Opening ${depth} explanation`,
				undoable: false,
				timestamp,
			};
		} catch (error) {
			return {
				success: false,
				actionId: action.id,
				message: `Failed to explain: ${error}`,
				undoable: false,
				timestamp,
			};
		}
	}

	private async handleExploreResponse(action: IProposedAction, response: string): Promise<IExecutionResult> {
		const timestamp = Date.now();

		let query: string;
		if (response === 'sketch') {
			query = `Sketch out a skeleton implementation for what I was exploring`;
		} else if (response === 'compare') {
			query = `Compare different approaches for: ${action.description}`;
		} else {
			query = `Analyze pros and cons of: ${action.description}`;
		}

		try {
			await this.commandService.executeCommand('workbench.action.chat.open', {
				query: `@tarx ${query}`
			});

			return {
				success: true,
				actionId: action.id,
				message: `Opening ${response} view`,
				undoable: false,
				timestamp,
			};
		} catch (error) {
			return {
				success: false,
				actionId: action.id,
				message: `Failed to explore: ${error}`,
				undoable: false,
				timestamp,
			};
		}
	}

	private async handleActionExecution(action: IProposedAction, response: string): Promise<IExecutionResult> {
		const timestamp = Date.now();

		// For code fixes, apply the change
		if (action.type === 'code_fix' || action.type === 'refactor' || action.type === 'generate') {
			if (action.code) {
				return this.applyCodeChange(action);
			}

			// No code provided, ask AI to generate it
			const query = response === 'fix'
				? `Fix the issue: ${action.description}`
				: response === 'approach'
				? `Show a different approach for: ${action.description}`
				: `Apply: ${action.description}`;

			try {
				await this.commandService.executeCommand('workbench.action.chat.open', {
					query: `@tarx /fix ${query}`
				});

				return {
					success: true,
					actionId: action.id,
					message: 'Requesting fix from AI',
					undoable: false,
					timestamp,
				};
			} catch (error) {
				return {
					success: false,
					actionId: action.id,
					message: `Failed to request fix: ${error}`,
					undoable: false,
					timestamp,
				};
			}
		}

		// For explanations, open chat
		try {
			await this.commandService.executeCommand('workbench.action.chat.open', {
				query: `@tarx ${action.description}`
			});

			return {
				success: true,
				actionId: action.id,
				message: 'Action sent to chat',
				undoable: false,
				timestamp,
			};
		} catch (error) {
			return {
				success: false,
				actionId: action.id,
				message: `Failed to execute: ${error}`,
				undoable: false,
				timestamp,
			};
		}
	}

	private async applyCodeChange(action: IProposedAction): Promise<IExecutionResult> {
		const timestamp = Date.now();
		const editor = this.codeEditorService.getFocusedCodeEditor();

		if (!editor || !action.code) {
			return {
				success: false,
				actionId: action.id,
				message: 'No active editor or code to apply',
				undoable: false,
				timestamp,
			};
		}

		const model = editor.getModel();
		if (!model) {
			return {
				success: false,
				actionId: action.id,
				message: 'No editor model',
				undoable: false,
				timestamp,
			};
		}

		const before = editor.getValue();
		const file = model.uri.path;

		try {
			// Apply the change
			editor.setValue(action.code);

			// Track for undo
			if (action.reversible) {
				this.undoStack.push({
					action,
					before,
					file,
					timestamp,
				});

				// Limit undo stack size
				if (this.undoStack.length > this.MAX_UNDO_ENTRIES) {
					this.undoStack = this.undoStack.slice(-this.MAX_UNDO_ENTRIES);
				}
			}

			const result: IExecutionResult = {
				success: true,
				actionId: action.id,
				message: `${action.title} applied`,
				changes: { before, after: action.code, file },
				undoable: action.reversible,
				timestamp,
			};

			this._onActionExecuted.fire(result);
			console.log('[TARX Executor] Applied:', action.title);

			return result;
		} catch (error) {
			return {
				success: false,
				actionId: action.id,
				message: `Failed to apply: ${error}`,
				undoable: false,
				timestamp,
			};
		}
	}

	async undoLastAction(): Promise<boolean> {
		if (this.undoStack.length === 0) {
			console.log('[TARX Executor] Nothing to undo');
			return false;
		}

		const entry = this.undoStack.pop()!;
		const editor = this.codeEditorService.getFocusedCodeEditor();

		if (!editor) {
			console.error('[TARX Executor] No active editor for undo');
			return false;
		}

		const model = editor.getModel();
		if (!model || model.uri.path !== entry.file) {
			console.error('[TARX Executor] Undo file mismatch');
			return false;
		}

		try {
			editor.setValue(entry.before);
			console.log('[TARX Executor] Undone:', entry.action.title);

			this._onActionExecuted.fire({
				success: true,
				actionId: entry.action.id,
				message: `Undone: ${entry.action.title}`,
				changes: { before: editor.getValue(), after: entry.before, file: entry.file },
				undoable: false,
				timestamp: Date.now(),
			});

			return true;
		} catch (error) {
			console.error('[TARX Executor] Undo failed:', error);
			return false;
		}
	}

	override dispose(): void {
		this.undoStack = [];
		super.dispose();
	}
}
