/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX First-Run Orchestration Flow
 *  - Executes first-time user onboarding
 *  - Hardware detection → Model selection → Download → Ready
 *  - Non-blocking toast notifications
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { FirstRunManager } from './firstRunManager';
import { detectHardware, selectModel, getModelSize } from './hardwareDetection';
import { trackModelDownload, checkModelExists } from './modelDownload';
import { toastManager } from './toastManager';

export async function executeFirstRunFlow(
	context: vscode.ExtensionContext
): Promise<void> {
	const firstRunMgr = new FirstRunManager(context);

	const isFirstRun = await firstRunMgr.isFirstRun();
	if (!isFirstRun) {
		console.log('[TARX] Not first run, skipping onboarding');
		return;
	}

	console.log('[TARX] First run detected - executing onboarding flow');

	try {
		// Step 1: Open welcome file immediately
		const welcomePath = path.join(context.extensionPath, 'media', 'welcome.md');
		const welcomeUri = vscode.Uri.file(welcomePath);
		try {
			await vscode.commands.executeCommand('markdown.showPreview', welcomeUri);
			console.log('[TARX] Welcome file opened');
		} catch {
			// Fallback: open as text document
			const doc = await vscode.workspace.openTextDocument(welcomeUri);
			await vscode.window.showTextDocument(doc);
		}

		// Step 2: Hardware detection (background)
		const hardware = await detectHardware();

		// Step 3: Model selection
		await toastManager.show('model-select', {
			message: 'Selecting optimal model for your hardware...',
			duration: 1500,
			type: 'info'
		});

		const model = selectModel(hardware);
		console.log(`[TARX] Selected model: ${model} (RAM: ${hardware.ram_gb}GB)`);

		// Step 4: Check if model exists, download if needed
		const modelExists = await checkModelExists(model);
		if (!modelExists) {
			const totalSize = getModelSize(model);
			await trackModelDownload(model, totalSize);
		} else {
			console.log(`[TARX] Model ${model} already exists, skipping download`);
		}

		// Step 5: Model loading notification
		await toastManager.show('loading', {
			message: 'Loading model into memory...',
			duration: 3000,
			type: 'info'
		});

		// Simulate model loading time
		await new Promise(resolve => setTimeout(resolve, 2000));

		// Step 6: Ready notification
		await toastManager.show('ready', {
			message: 'TARX is ready! Press Cmd+Shift+T to start chatting.',
			duration: 5000,
			type: 'info'
		});

		// Mark first run complete
		await firstRunMgr.markFirstRunComplete();

		console.log('[TARX] First-run flow completed successfully');

	} catch (error) {
		console.error('[TARX] First-run error:', error);
		await toastManager.show('error', {
			message: 'Setup encountered an issue. TARX will retry on next launch.',
			duration: 5000,
			type: 'error'
		});
	}
}

// Export for use in commands
export { FirstRunManager };
