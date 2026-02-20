/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX First-Run Orchestration Flow (Conversational-First)
 *  - Opens @tarx chat with greeting (no webview panel)
 *  - Hardware detection → Model selection → Download → Ready
 *  - Non-blocking toast notifications
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FirstRunManager } from './firstRunManager';
import { detectHardware, selectModel, getModelSize } from './hardwareDetection';
import { trackModelDownload, checkModelExists } from './modelDownload';
import { toastManager } from './toastManager';
import { runConversationalFTUX } from '../chat/conversationalFlows.js';

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
		return;
	}

	console.log('[TARX] First run detected - launching conversational onboarding');

	try {
		// Step 1: Open @tarx chat with greeting (conversational-first)
		await runConversationalFTUX(context);

		// Step 2: Hardware detection + model setup (runs in background)
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

		// Step 4: Ready notification
		await toastManager.show('ready', {
			message: 'TARX is ready! Chat with @tarx to get started.',
			duration: 5000,
			type: 'info'
		});

		// Note: firstRunCompleted is set by ChatOnboardingManager.finalize()
		// or by the FTUX skip handler — NOT here, to avoid premature gating.

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
