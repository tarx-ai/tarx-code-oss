/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Toast Notification Manager
 *  - Non-blocking notifications in VS Code
 *  - Supports progress updates
 *  - Auto-dismiss with configurable duration
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class ToastManager {
	private activeToasts = new Map<string, NodeJS.Timeout>();

	async show(id: string, options: {
		message: string;
		duration?: number; // ms (0 = manual dismiss)
		type?: 'info' | 'warning' | 'error';
	}): Promise<void> {
		// Clear existing toast with same ID
		if (this.activeToasts.has(id)) {
			clearTimeout(this.activeToasts.get(id)!);
		}

		const toastFn = options.type === 'warning'
			? vscode.window.showWarningMessage
			: options.type === 'error'
				? vscode.window.showErrorMessage
				: vscode.window.showInformationMessage;

		// Show the message (non-blocking)
		toastFn(options.message, { modal: false });

		// Set auto-dismiss timeout if duration specified
		if (options.duration && options.duration > 0) {
			const timeout = setTimeout(() => {
				this.activeToasts.delete(id);
			}, options.duration);
			this.activeToasts.set(id, timeout);
		}
	}

	hide(id: string): void {
		if (this.activeToasts.has(id)) {
			clearTimeout(this.activeToasts.get(id)!);
			this.activeToasts.delete(id);
		}
	}

	clear(): void {
		for (const timeout of this.activeToasts.values()) {
			clearTimeout(timeout);
		}
		this.activeToasts.clear();
	}
}

// Singleton instance
export const toastManager = new ToastManager();
