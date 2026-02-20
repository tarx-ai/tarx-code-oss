/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Conversational-First UX Flows
 *
 *  All user flows route through the @tarx chat participant unless they
 *  require persistent spatial UI (file tree, editor, terminal).
 *
 *  Handles: FTUX onboarding, auth, settings, project setup, agent management
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AuthManager } from '../auth/authManager';
import {
	validateMCPInviteCode,
	redeemMCPInviteCode,
	updateOnboardingState,
	seedRAGWithProfile,
	createMCPSpace,
	createMCPSession
} from '../mcpKnowledge.js';

// ============================================================================
// INTENT DETECTION
// ============================================================================

export type ConversationalIntent =
	| { type: 'ftux_invite' }
	| { type: 'ftux_skip' }
	| { type: 'auth_setup' }
	| { type: 'auth_unlock' }
	| { type: 'auth_lock' }
	| { type: 'auth_change_pin' }
	| { type: 'auth_disable' }
	| { type: 'settings_memory'; action: 'on' | 'off' | 'toggle' }
	| { type: 'settings_model'; model?: string }
	| { type: 'settings_mesh'; action: 'on' | 'off' }
	| { type: 'settings_clear_memory' }
	| { type: 'settings_show' }
	| { type: 'project_create'; name?: string }
	| { type: 'project_setup' }
	| null;

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: ConversationalIntent }> = [
	// Auth intents
	{ pattern: /\b(set\s*up|create|enable)\s+(pin|auth|authentication)\b/i, intent: { type: 'auth_setup' } },
	{ pattern: /\bunlock\b/i, intent: { type: 'auth_unlock' } },
	{ pattern: /\block\b(?!\s*(?:file|screen))/i, intent: { type: 'auth_lock' } },
	{ pattern: /\bchange\s+pin\b/i, intent: { type: 'auth_change_pin' } },
	{ pattern: /\bdisable\s+(pin|auth|authentication)\b/i, intent: { type: 'auth_disable' } },

	// Settings intents
	{ pattern: /\b(turn|switch|enable)\s+on\s+memory\b/i, intent: { type: 'settings_memory', action: 'on' } },
	{ pattern: /\b(turn|switch|disable)\s+off\s+memory\b/i, intent: { type: 'settings_memory', action: 'off' } },
	{ pattern: /\btoggle\s+memory\b/i, intent: { type: 'settings_memory', action: 'toggle' } },
	{ pattern: /\b(change|switch|set)\s+model\b/i, intent: { type: 'settings_model' } },
	{ pattern: /\b(enable|connect|join)\s+mesh\b/i, intent: { type: 'settings_mesh', action: 'on' } },
	{ pattern: /\b(disable|disconnect|leave)\s+mesh\b/i, intent: { type: 'settings_mesh', action: 'off' } },
	{ pattern: /\bclear\s+(my\s+)?memory\b/i, intent: { type: 'settings_clear_memory' } },
	{ pattern: /\b(show|open|view)\s+settings\b/i, intent: { type: 'settings_show' } },

	// Project intents
	{ pattern: /\b(start|create|new)\s+project\b/i, intent: { type: 'project_create' } },
	{ pattern: /\bset\s*up\s+project\b/i, intent: { type: 'project_setup' } },
];

export function detectConversationalIntent(prompt: string): ConversationalIntent {
	for (const { pattern, intent } of INTENT_PATTERNS) {
		if (pattern.test(prompt)) {
			return intent;
		}
	}
	return null;
}

// ============================================================================
// FTUX  - First Time User Experience (Conversational)
// ============================================================================

/**
 * Greet the user on first launch via the @tarx chat participant.
 * Uses confirmation buttons and followup prompts instead of a webview panel.
 */
export async function runConversationalFTUX(
	context: vscode.ExtensionContext
): Promise<void> {
	const INVITE_KEY = 'tarx.inviteValidated';
	const alreadyValidated = context.globalState.get<boolean>(INVITE_KEY);
	if (alreadyValidated) {
		return;
	}

	// Open the chat panel with a greeting
	await vscode.commands.executeCommand(
		'workbench.action.chat.open',
		{ query: '@tarx hello' }
	);

	// The actual greeting is handled by the chat participant when it sees
	// the first-run state (isFirstRun === true). See handleFTUXGreeting().
}

/**
 * Generate the FTUX greeting response for the chat participant.
 * Called from the @tarx handler when first-run state is detected.
 */
export async function handleFTUXGreeting(
	response: vscode.ChatResponseStream,
	context: vscode.ExtensionContext
): Promise<boolean> {
	const INVITE_KEY = 'tarx.inviteValidated';
	const alreadyValidated = context.globalState.get<boolean>(INVITE_KEY);
	if (alreadyValidated) {
		return false; // Not first run
	}

	response.markdown('**Welcome to TARX.** Local AI, private memory, your machine.\n\n');
	response.markdown('If you have an invite code, type it below. Otherwise, skip to start exploring.\n\n');

	response.button({
		command: 'tarx.ftux.enterInvite',
		title: 'I have an invite code'
	});

	response.button({
		command: 'tarx.ftux.skip',
		title: 'Skip  - explore on my own'
	});

	return true; // Handled as FTUX
}

/**
 * Handle invite code entry via showInputBox.
 */
export async function handleFTUXInviteCode(
	context: vscode.ExtensionContext
): Promise<void> {
	const code = await vscode.window.showInputBox({
		prompt: 'Enter your TARX invite code',
		placeHolder: 'TARX-XXXX',
		validateInput: (value) => {
			if (!value.trim()) {
				return 'Please enter an invite code';
			}
			return null;
		}
	});

	if (!code) {
		return; // Cancelled
	}

	const upperCode = code.trim().toUpperCase();

	// Validate via MCP
	const result = await validateMCPInviteCode(upperCode);

	if (!result.valid) {
		const retry = await vscode.window.showWarningMessage(
			'Invalid or expired invite code.',
			'Try Again',
			'Skip'
		);
		if (retry === 'Try Again') {
			return handleFTUXInviteCode(context);
		}
		// Skip  - mark as validated anyway for beta
		await completeFTUX(context, upperCode);
		return;
	}

	// Redeem and complete
	await redeemMCPInviteCode(upperCode);
	await context.globalState.update('tarx.inviteTier', result.tier);
	await completeFTUX(context, upperCode);

	vscode.window.showInformationMessage('Invite code accepted. Welcome to TARX.');

	// Open chat with a starter prompt
	await vscode.commands.executeCommand(
		'workbench.action.chat.open',
		{ query: '@tarx What can you help me with?' }
	);
}

/**
 * Skip FTUX  - mark as completed without invite code.
 */
export async function handleFTUXSkip(
	context: vscode.ExtensionContext
): Promise<void> {
	await completeFTUX(context);

	// Open chat with welcome
	await vscode.commands.executeCommand(
		'workbench.action.chat.open',
		{ query: '@tarx What can you help me with?' }
	);
}

async function completeFTUX(
	context: vscode.ExtensionContext,
	inviteCode?: string
): Promise<void> {
	await context.globalState.update('tarx.inviteValidated', true);
	await context.globalState.update('tarx.inviteTier', 'beta');
	await updateOnboardingState('complete', inviteCode ? { invite_code: inviteCode } : undefined);
}

// ============================================================================
// AUTH  - Conversational Authentication
// ============================================================================

/**
 * Handle auth intents via chat response.
 * Returns markdown response for the chat participant.
 */
export async function handleAuthIntent(
	intent: ConversationalIntent,
	authManager: AuthManager,
	response: vscode.ChatResponseStream
): Promise<void> {
	if (!intent) { return; }

	switch (intent.type) {
		case 'auth_setup': {
			response.markdown('Setting up PIN authentication...\n\n');
			const success = await authManager.runSetupFlow();
			if (success) {
				response.markdown('PIN authentication is now active. Your data is protected.\n\n');
				response.markdown('*Tip: TARX auto-locks after 30 minutes of inactivity. Change this in settings.*');
			} else {
				response.markdown('PIN setup was cancelled. You can set it up anytime with "set up PIN".');
			}
			break;
		}
		case 'auth_unlock': {
			const success = await authManager.unlock();
			if (success) {
				response.markdown('Unlocked. Welcome back.');
			} else {
				response.markdown('Unlock failed. Try again or use "disable authentication" if you forgot your PIN.');
			}
			break;
		}
		case 'auth_lock': {
			authManager.lock();
			response.markdown('TARX is now locked. Type "unlock" to resume.');
			break;
		}
		case 'auth_change_pin': {
			const success = await authManager.changePIN();
			if (success) {
				response.markdown('PIN changed successfully.');
			} else {
				response.markdown('PIN change cancelled.');
			}
			break;
		}
		case 'auth_disable': {
			const success = await authManager.disableAuth();
			if (success) {
				response.markdown('Authentication disabled. Your data is no longer PIN-protected.');
			} else {
				response.markdown('Could not disable authentication.');
			}
			break;
		}
	}
}

// ============================================================================
// SETTINGS  - Chat Commands
// ============================================================================

export async function handleSettingsIntent(
	intent: ConversationalIntent,
	response: vscode.ChatResponseStream
): Promise<void> {
	if (!intent) { return; }

	const config = vscode.workspace.getConfiguration('tarx');

	switch (intent.type) {
		case 'settings_memory': {
			const current = config.get<boolean>('memory.enabled', true);
			let newValue: boolean;

			if (intent.action === 'toggle') {
				newValue = !current;
			} else {
				newValue = intent.action === 'on';
			}

			await config.update('memory.enabled', newValue, vscode.ConfigurationTarget.Workspace);
			response.markdown(`Memory is now **${newValue ? 'enabled' : 'disabled'}**.`);

			if (!newValue) {
				response.markdown('\n\n*TARX will not remember conversations until you turn memory back on.*');
			}
			break;
		}

		case 'settings_model': {
			const models = [
				{ label: 'Qwen 2.5 7B (default)', description: 'Best balance of speed and quality', value: 'qwen-2.5-7b' },
				{ label: 'Qwen 2.5 3B', description: 'Faster, lower quality', value: 'qwen-2.5-3b' },
				{ label: 'Qwen 2.5 14B', description: 'Higher quality, slower', value: 'qwen-2.5-14b' },
			];

			const selected = await vscode.window.showQuickPick(models, {
				placeHolder: 'Select inference model'
			});

			if (selected) {
				await config.update('model', selected.value, vscode.ConfigurationTarget.Workspace);
				response.markdown(`Model switched to **${selected.label}**.\n\n`);
				response.markdown('*Restart llama-server to load the new model.*');
			} else {
				response.markdown('Model selection cancelled.');
			}
			break;
		}

		case 'settings_mesh': {
			const enabled = intent.action === 'on';
			await config.update('mesh.enabled', enabled, vscode.ConfigurationTarget.Workspace);
			response.markdown(`Mesh networking is now **${enabled ? 'enabled' : 'disabled'}**.`);

			if (enabled) {
				response.markdown('\n\n*TARX will connect to nearby peers for distributed inference.*');
			}
			break;
		}

		case 'settings_clear_memory': {
			const confirm = await vscode.window.showWarningMessage(
				'This will delete all conversation memory. This cannot be undone.',
				{ modal: true },
				'Clear Memory',
				'Cancel'
			);

			if (confirm === 'Clear Memory') {
				// Clear memory via MCP tool
				try {
					await vscode.commands.executeCommand('tarx.clearAllMemory');
					response.markdown('All memory has been cleared.');
				} catch {
					response.markdown('Failed to clear memory. Try again or use the command palette.');
				}
			} else {
				response.markdown('Memory clear cancelled.');
			}
			break;
		}

		case 'settings_show': {
			// Open VS Code native settings filtered to tarx
			await vscode.commands.executeCommand('workbench.action.openSettings', 'tarx');
			response.markdown('Opened TARX settings. You can also change settings by telling me:\n\n');
			response.markdown('- "Turn on memory"\n');
			response.markdown('- "Change model"\n');
			response.markdown('- "Enable mesh"\n');
			response.markdown('- "Clear memory"\n');
			break;
		}
	}
}

// ============================================================================
// PROJECT SETUP  - Conversational
// ============================================================================

export async function handleProjectIntent(
	intent: ConversationalIntent,
	response: vscode.ChatResponseStream,
	context: vscode.ExtensionContext,
	db: any // TarxDatabase
): Promise<void> {
	if (!intent || !db) { return; }

	switch (intent.type) {
		case 'project_create':
		case 'project_setup': {
			// Get project name
			const name = await vscode.window.showInputBox({
				prompt: 'What should we call this project?',
				placeHolder: 'My Project',
				validateInput: (v) => v.trim() ? null : 'Project name is required'
			});

			if (!name) {
				response.markdown('Project creation cancelled.');
				return;
			}

			// Get workspace folder
			const folders = vscode.workspace.workspaceFolders;
			let rootPath: string | undefined;

			if (folders && folders.length > 0) {
				rootPath = folders[0].uri.fsPath;
			} else {
				const folderUri = await vscode.window.showOpenDialog({
					canSelectFolders: true,
					canSelectFiles: false,
					canSelectMany: false,
					openLabel: 'Select project folder'
				});
				rootPath = folderUri?.[0]?.fsPath;
			}

			if (!rootPath) {
				response.markdown('No folder selected. Project creation cancelled.');
				return;
			}

			try {
				// Create space in SQLite via MCP
				const space = await createMCPSpace(name, `Project: ${name}`, '');
				if (space) {
					// Create initial session
					await createMCPSession(space.id, 'Getting Started');

					response.markdown(`**Project "${name}" created.**\n\n`);
					response.markdown(`- Workspace: \`${rootPath}\`\n`);
					response.markdown(`- Space ID: \`${space.id}\`\n\n`);
					response.markdown('What would you like to work on first?\n\n');

					response.button({
						command: 'tarx.chat.send',
						title: 'Explore this codebase',
						arguments: ['What files are in this project?']
					});

					response.button({
						command: 'tarx.chat.send',
						title: 'Set project instructions',
						arguments: ['Help me create a .tarx/instructions.md for this project']
					});
				} else {
					response.markdown('Failed to create project space. Check MCP server status.');
				}
			} catch (e) {
				response.markdown(`Project creation failed: ${e instanceof Error ? e.message : String(e)}`);
			}
			break;
		}
	}
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

export function registerConversationalCommands(
	context: vscode.ExtensionContext
): void {
	// FTUX commands (called by chat button clicks)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.ftux.enterInvite', () => {
			handleFTUXInviteCode(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.ftux.skip', () => {
			handleFTUXSkip(context);
		})
	);

	// Redirect old panel commands to chat
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.openProjectContext', async () => {
			await vscode.commands.executeCommand(
				'workbench.action.chat.open',
				{ query: '@tarx show project context' }
			);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.showProjectContext', async () => {
			await vscode.commands.executeCommand('tarx.openProjectContext');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.showCreateProject', async () => {
			await vscode.commands.executeCommand(
				'workbench.action.chat.open',
				{ query: '@tarx start project' }
			);
		})
	);

	console.log('[TARX] Conversational flow commands registered');
}
