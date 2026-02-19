/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX First-Run Manager
 *  - Tracks first-run state
 *  - Manages onboarding completion
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export class FirstRunManager {
	private static readonly FIRST_RUN_KEY = 'tarx.firstRunCompleted';
	private static readonly ONBOARDING_VERSION_KEY = 'tarx.onboardingVersion';
	private static readonly CURRENT_ONBOARDING_VERSION = 2; // Bumped for FTUX webview panel

	constructor(private context: vscode.ExtensionContext) {}

	async isFirstRun(): Promise<boolean> {
		const firstRunCompleted = this.context.globalState.get<boolean>(FirstRunManager.FIRST_RUN_KEY);
		const onboardingVersion = this.context.globalState.get<number>(FirstRunManager.ONBOARDING_VERSION_KEY, 0);

		// First run if never completed OR if onboarding version has been updated
		if (!firstRunCompleted) {
			return true;
		}

		// Re-run onboarding if version has increased (for new features)
		if (onboardingVersion < FirstRunManager.CURRENT_ONBOARDING_VERSION) {
			console.log(`[TARX] Onboarding version updated (${onboardingVersion} -> ${FirstRunManager.CURRENT_ONBOARDING_VERSION})`);
			return true;
		}

		return false;
	}

	async markFirstRunComplete(): Promise<void> {
		await this.context.globalState.update(FirstRunManager.FIRST_RUN_KEY, true);
		await this.context.globalState.update(FirstRunManager.ONBOARDING_VERSION_KEY, FirstRunManager.CURRENT_ONBOARDING_VERSION);
		console.log('[TARX] First-run marked complete');
	}

	async resetFirstRun(): Promise<void> {
		await this.context.globalState.update(FirstRunManager.FIRST_RUN_KEY, false);
		await this.context.globalState.update(FirstRunManager.ONBOARDING_VERSION_KEY, 0);
		console.log('[TARX] First-run state reset');
	}
}
