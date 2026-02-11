/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * VS Code API type for webviews
 */
interface VSCodeAPI {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

/**
 * TARX-wrapped VS Code API that adds message type prefix
 * The host (tarxSidebarPart.ts) creates this wrapper to properly route messages
 */
interface TarxVSCodeAPI {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

// Cached instance
let vscodeApi: VSCodeAPI | undefined;
let tarxVscodeApi: TarxVSCodeAPI | undefined;

/**
 * Get the TARX-wrapped VS Code API instance for webviews
 * This ensures messages are sent with the correct type prefix for routing
 */
export function getVSCodeAPI(): VSCodeAPI {
	// First, try to use the TARX wrapper (preferred - adds type: 'tarx-webview')
	if (!tarxVscodeApi) {
		// @ts-expect-error - window.tarxVscode is set by the host wrapper script
		if (typeof window !== 'undefined' && window.tarxVscode) {
			// @ts-expect-error - use the TARX wrapper
			tarxVscodeApi = window.tarxVscode;
		}
	}
	if (tarxVscodeApi) {
		return tarxVscodeApi;
	}

	// Fallback to raw vscode API (for standalone webview contexts)
	if (!vscodeApi) {
		// @ts-expect-error - window.vscode may be set by the host wrapper script
		if (typeof window !== 'undefined' && window.vscode) {
			// @ts-expect-error - use the pre-acquired wrapped API
			vscodeApi = window.vscode;
		} else {
			// Acquire fresh - VS Code injects acquireVsCodeApi into webviews
			try {
				// @ts-expect-error - acquireVsCodeApi is injected by VS Code
				vscodeApi = acquireVsCodeApi();
				// Store on window for future access
				// @ts-expect-error - storing for potential re-use
				if (typeof window !== 'undefined') window.vscode = vscodeApi;
			} catch (e) {
				// Already acquired - try to get from window
				// @ts-expect-error - fallback to window.vscode
				if (typeof window !== 'undefined' && window.vscode) {
					// @ts-expect-error - use fallback
					vscodeApi = window.vscode;
				} else {
					console.error('[TARX] Failed to get VS Code API:', e);
					throw e;
				}
			}
		}
	}
	return vscodeApi!;
}

/**
 * Hook to get the VS Code API
 */
export function useVSCodeAPI(): VSCodeAPI {
	return getVSCodeAPI();
}

/**
 * Type-safe message sender
 */
export function postMessage(message: {
	command: string;
	[key: string]: unknown;
}): void {
	getVSCodeAPI().postMessage(message);
}

/**
 * Get persisted state from VS Code
 */
export function getState<T>(): T | undefined {
	return getVSCodeAPI().getState() as T | undefined;
}

/**
 * Persist state to VS Code
 */
export function setState<T>(state: T): void {
	getVSCodeAPI().setState(state);
}
