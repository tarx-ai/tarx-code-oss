/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TarxClient } from './tarxClient';

export class TarxCompletionProvider implements vscode.InlineCompletionItemProvider {
	private _lastRequestTime = 0;
	private _debounceMs: number;
	private _maxTokens: number;

	constructor(private readonly _tarxClient: TarxClient) {
		const config = vscode.workspace.getConfiguration('tarx');
		this._debounceMs = config.get<number>('completions.debounceMs', 300);
		this._maxTokens = config.get<number>('completions.maxTokens', 128);

		// Listen for config changes
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('tarx.completions')) {
				const config = vscode.workspace.getConfiguration('tarx');
				this._debounceMs = config.get<number>('completions.debounceMs', 300);
				this._maxTokens = config.get<number>('completions.maxTokens', 128);
			}
		});
	}

	async provideInlineCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
		context: vscode.InlineCompletionContext,
		token: vscode.CancellationToken
	): Promise<vscode.InlineCompletionItem[]> {
		// Check if completions are enabled
		const config = vscode.workspace.getConfiguration('tarx');
		if (!config.get<boolean>('completions.enabled', true)) {
			return [];
		}

		// Debounce: skip if too soon after last request
		const now = Date.now();
		if (now - this._lastRequestTime < this._debounceMs) {
			return [];
		}
		this._lastRequestTime = now;

		// Skip if triggered by certain events
		if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
			// Only provide completions at end of line or after certain characters
			const lineText = document.lineAt(position.line).text;
			const charBefore = lineText[position.character - 1];

			// Skip if in the middle of a word
			if (position.character < lineText.length) {
				const charAfter = lineText[position.character];
				if (/\w/.test(charAfter)) {
					return [];
				}
			}

			// Skip if line is too short (likely just started typing)
			if (lineText.trim().length < 3) {
				return [];
			}
		}

		// Get context: prefix (lines before cursor)
		const prefixRange = new vscode.Range(
			new vscode.Position(Math.max(0, position.line - 50), 0),
			position
		);
		const prefix = document.getText(prefixRange);

		// Get suffix (lines after cursor) for FIM (Fill-in-Middle)
		const suffixRange = new vscode.Range(
			position,
			new vscode.Position(Math.min(document.lineCount - 1, position.line + 10), 0)
		);
		const suffix = document.getText(suffixRange);

		// Skip if prefix is too short
		if (prefix.trim().length < 10) {
			return [];
		}

		try {
			const completion = await this._tarxClient.completion(prefix, {
				suffix: suffix.length > 0 ? suffix : undefined,
				maxTokens: this._maxTokens,
				temperature: 0.2,
				stop: ['\n\n', '```', '###']
			});

			// Check if cancelled
			if (token.isCancellationRequested) {
				return [];
			}

			// Skip empty completions
			if (!completion || completion.trim().length === 0) {
				return [];
			}

			// Create completion item
			return [{
				insertText: completion,
				range: new vscode.Range(position, position)
			}];
		} catch (error) {
			// Silent fail - no completions available
			console.log('[TARX] Completion error:', error);
			return [];
		}
	}
}
