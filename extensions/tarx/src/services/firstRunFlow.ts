/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX First-Run Orchestration Flow
 *  - FTUX webview panel (invite code → profile → ready)
 *  - Hardware detection → Model selection → Download → Ready
 *  - Non-blocking toast notifications
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FirstRunManager } from './firstRunManager';
import { detectHardware, selectModel, getModelSize } from './hardwareDetection';
import { trackModelDownload, checkModelExists } from './modelDownload';
import { toastManager } from './toastManager';
import { TarxFTUXPanel } from '../onboarding/ftux-panel.js';

const INVITE_VALIDATED_KEY = 'tarx.inviteValidated';

export async function executeFirstRunFlow(
	context: vscode.ExtensionContext
): Promise<void> {
	const firstRunMgr = new FirstRunManager(context);

	const isFirstRun = await firstRunMgr.isFirstRun();
	if (!isFirstRun) {
		console.log('[TARX] Not first run, skipping onboarding');
		return;
	}

	// Check if already validated in a previous session
	const alreadyValidated = context.globalState.get<boolean>(INVITE_VALIDATED_KEY);
	if (alreadyValidated) {
		console.log('[TARX] Invite already validated, skipping FTUX');
		await firstRunMgr.markFirstRunComplete();
		return;
	}

	console.log('[TARX] First run detected — launching FTUX');

	try {
		// Step 1: Show the branded FTUX webview panel
		const ftux = new TarxFTUXPanel(context);
		const result = await ftux.show();

		if (!result.completed) {
			console.log('[TARX] FTUX dismissed without completion');
			return;
		}

		console.log(`[TARX] FTUX completed (skipped: ${result.skipped})`);

		// Step 2: Hardware detection + model setup (runs after FTUX)
		const hardware = await detectHardware();

		await toastManager.show('model-select', {
			message: 'Selecting optimal model for your hardware...',
			duration: 1500,
			type: 'info'
		});

		const model = selectModel(hardware);
		console.log(`[TARX] Selected model: ${model} (RAM: ${hardware.ram_gb}GB)`);

		// Step 3: Check if model exists, download if needed
		const modelExists = await checkModelExists(model);
		if (!modelExists) {
			const totalSize = getModelSize(model);
			await trackModelDownload(model, totalSize);
		} else {
			console.log(`[TARX] Model ${model} already exists, skipping download`);
		}

		// Step 4: Model loading notification
		await toastManager.show('loading', {
			message: 'Loading model into memory...',
			duration: 3000,
			type: 'info'
		});

		await new Promise(resolve => setTimeout(resolve, 2000));

		// Step 5: Ready notification
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
