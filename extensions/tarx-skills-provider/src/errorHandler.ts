/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Structured error information with user-friendly messaging and recovery actions
 */
export interface TarxError {
	code: string;
	message: string;
	actions: { label: string; action: () => void }[];
}

/**
 * Classify an error and return user-friendly information with recovery actions
 */
export function classifyError(error: unknown): TarxError {
	const msg = error instanceof Error ? error.message : String(error);

	// Inference server (llama-server on port 11435)
	if (msg.includes('ECONNREFUSED') && msg.includes('11435')) {
		return {
			code: 'INFERENCE_DOWN',
			message: 'TARX local AI is starting up. This usually takes ~11 seconds.',
			actions: [
				{ label: 'Retry', action: () => vscode.commands.executeCommand('tarx.chat.retry') },
				{ label: 'Check Status', action: () => vscode.commands.executeCommand('tarx.status.showDetails') }
			]
		};
	}

	// Embeddings server (port 11437)
	if (msg.includes('ECONNREFUSED') && msg.includes('11437')) {
		return {
			code: 'EMBEDDINGS_DOWN',
			message: 'Knowledge search unavailable (embedding server offline). Continuing without search.',
			actions: [
				{ label: 'Continue', action: () => {} },
				{ label: 'Show Status', action: () => vscode.commands.executeCommand('tarx.status.showDetails') }
			]
		};
	}

	// Timeout or AbortError
	if (msg.includes('timeout') || msg.includes('AbortError')) {
		return {
			code: 'INFERENCE_TIMEOUT',
			message: 'Local inference taking longer than expected. Complex query?',
			actions: [
				{ label: 'Wait', action: () => {} },
				{ label: 'Try Simpler', action: () => {} }
			]
		};
	}

	// Mesh network (port 11436)
	if (msg.includes('ECONNREFUSED') && msg.includes('11436')) {
		return {
			code: 'MESH_DOWN',
			message: 'Mesh network unavailable. Running in local-only mode.',
			actions: [
				{ label: 'OK', action: () => {} }
			]
		};
	}

	// HTTP errors
	if (msg.includes('HTTP 500') || msg.includes('HTTP 502') || msg.includes('HTTP 503')) {
		return {
			code: 'SERVER_ERROR',
			message: 'TARX server encountered an error. Please try again.',
			actions: [
				{ label: 'Retry', action: () => vscode.commands.executeCommand('tarx.chat.retry') },
				{ label: 'Check Logs', action: () => vscode.commands.executeCommand('workbench.action.toggleDevTools') }
			]
		};
	}

	// Generic connection refused
	if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
		return {
			code: 'CONNECTION_FAILED',
			message: 'Cannot connect to TARX services. Please check that the servers are running.',
			actions: [
				{ label: 'Check Status', action: () => vscode.commands.executeCommand('tarx.status.showDetails') },
				{ label: 'Retry', action: () => vscode.commands.executeCommand('tarx.chat.retry') }
			]
		};
	}

	// Model unavailable (from modelProvider)
	if (msg.includes('currently unavailable')) {
		return {
			code: 'MODEL_UNAVAILABLE',
			message: 'Selected model is offline. Please try a different model or check server status.',
			actions: [
				{ label: 'Switch Model', action: () => vscode.commands.executeCommand('tarx.status.switchModel') },
				{ label: 'Check Status', action: () => vscode.commands.executeCommand('tarx.status.showDetails') }
			]
		};
	}

	// Generic/unknown error
	return {
		code: 'UNKNOWN',
		message: `Something went wrong: ${msg.substring(0, 100)}`,
		actions: [
			{ label: 'Retry', action: () => vscode.commands.executeCommand('tarx.chat.retry') },
			{ label: 'Show Details', action: () => vscode.window.showErrorMessage(msg) }
		]
	};
}

/**
 * Show a user-friendly error message with recovery actions
 */
export async function showTarxError(error: unknown): Promise<void> {
	const classified = classifyError(error);
	const labels = classified.actions.map(a => a.label);

	const selected = await vscode.window.showWarningMessage(
		`TARX: ${classified.message}`,
		...labels
	);

	if (selected) {
		const action = classified.actions.find(a => a.label === selected);
		action?.action();
	}
}

/**
 * Auto-retry wrapper for inference calls with exponential backoff
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	retries: number = 1,
	delayMs: number = 2000
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (retries > 0) {
			// Only retry on connection errors, not on model errors
			const msg = error instanceof Error ? error.message : String(error);
			const shouldRetry = msg.includes('ECONNREFUSED') ||
								msg.includes('fetch failed') ||
								msg.includes('timeout');

			if (shouldRetry) {
				console.log(`[TARX] Retrying after ${delayMs}ms (${retries} retries left)...`);
				await new Promise(r => setTimeout(r, delayMs));
				return withRetry(fn, retries - 1, delayMs * 1.5); // Exponential backoff
			}
		}
		throw error;
	}
}

/**
 * Wrap an async function with error handling and user feedback
 */
export async function withErrorHandling<T>(
	fn: () => Promise<T>,
	options: {
		showProgress?: boolean;
		progressMessage?: string;
		retries?: number;
	} = {}
): Promise<T | undefined> {
	try {
		if (options.showProgress) {
			return await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: options.progressMessage || 'Processing...',
					cancellable: false
				},
				async () => {
					return options.retries
						? await withRetry(fn, options.retries)
						: await fn();
				}
			);
		} else {
			return options.retries
				? await withRetry(fn, options.retries)
				: await fn();
		}
	} catch (error) {
		await showTarxError(error);
		return undefined;
	}
}
