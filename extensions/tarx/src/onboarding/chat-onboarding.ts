/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Conversational Onboarding State Machine
 *
 *  After FTUX validates the invite code and closes, this module takes over
 *  with a 3-4 question conversational flow, seeds RAG with answers, and
 *  transitions to a personalized "workspace ready" state.
 *
 *  Two paths:
 *    - With signup data (invite had profile metadata): confirm in one turn
 *    - Without signup data (code-only or skipped): ask 3-4 questions
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	InviteProfile,
	profileToPrompts,
	profileToRAGDocument
} from '../invite/invite-system.js';
import {
	seedRAGWithProfile,
	createMCPSpace,
	updateOnboardingState
} from '../mcpKnowledge.js';
import { PinAuth } from '../auth/pinAuth.js';

// ============================================================================
// TYPES
// ============================================================================

type OnboardingStep =
	| 'welcome'
	| 'ask_pin'
	| 'confirm_pin'
	| 'ask_role'
	| 'ask_project'
	| 'ask_tools'
	| 'finishing'
	| 'confirm'
	| 'complete';

interface OnboardingResult {
	metadata: {
		command: string;
		onboarding: true;
		step?: OnboardingStep;
		complete?: boolean;
	};
}

// ============================================================================
// STATE MACHINE
// ============================================================================

export class ChatOnboardingManager {
	private context: vscode.ExtensionContext;
	private pinAuth: PinAuth;
	private pendingPin: string | undefined;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.pinAuth = new PinAuth(context);
	}

	/**
	 * Returns true if the user has not completed onboarding.
	 */
	needsOnboarding(): boolean {
		return !this.context.globalState.get<boolean>('tarx.onboardingComplete');
	}

	/**
	 * Handle a chat message during onboarding.
	 * Returns a ChatResult-like object when onboarding is active,
	 * or null when onboarding is complete (pass to normal handler).
	 */
	async handleMessage(
		request: vscode.ChatRequest,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult | null> {
		const step = this.context.globalState.get<string>('tarx.onboardingStep') || 'welcome';
		const prompt = request.prompt.trim();

		// Handle /welcome command — reset onboarding
		if (request.command === 'welcome') {
			await this.resetOnboarding();
			return this.runWelcome(response);
		}

		// Handle "skip" at any step
		if (/^skip\b/i.test(prompt)) {
			await this.finalize(response);
			return {
				metadata: { command: 'onboarding', onboarding: true, step: 'complete', complete: true }
			};
		}

		switch (step) {
			case 'welcome':
				return this.runWelcome(response);

			case 'ask_pin':
				return this.handlePinEntry(prompt, response);

			case 'confirm_pin':
				return this.handlePinConfirm(prompt, response);

			case 'ask_role':
				return this.handleNameResponse(prompt, response);

			case 'ask_project':
				return this.handleRoleResponse(prompt, response);

			case 'ask_tools':
				return this.handleProjectResponse(prompt, response);

			case 'finishing':
				return this.handleToolsResponse(prompt, response);

			case 'confirm':
				return this.handleConfirmResponse(prompt, response);

			case 'complete':
				return null; // Onboarding done — pass to normal handler

			default:
				return null;
		}
	}

	/**
	 * Provide followup chips appropriate for the current onboarding state.
	 */
	getFollowups(result: vscode.ChatResult): vscode.ChatFollowup[] {
		const meta = result.metadata as Record<string, unknown> | undefined;
		if (!meta?.onboarding) {
			return [];
		}

		if (meta.complete) {
			// Completion followups — role-based prompts
			const role = this.context.globalState.get<string>('tarx.userRole') || '';
			const project = this.context.globalState.get<string>('tarx.userProject') || '';
			const profile: InviteProfile = {
				code: '', name: '', email: '',
				role, project,
				toolsTried: [], frustrations: '',
				interactionStyle: 'both'
			};
			return profileToPrompts(profile).slice(0, 3).map(p => ({
				prompt: p,
				label: p.length > 40 ? p.substring(0, 37) + '...' : p
			}));
		}

		// Mid-onboarding: offer skip
		return [{ prompt: 'Skip setup', label: 'Skip for now' }];
	}

	// ========================================================================
	// STEP HANDLERS
	// ========================================================================

	private async runWelcome(
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		// Check for signup profile data from FTUX — store it but still do PIN first
		const signupJson = this.context.globalState.get<string>('tarx.signupProfile');
		if (signupJson) {
			try {
				const profile = JSON.parse(signupJson) as Partial<InviteProfile>;
				if (profile.name && profile.role) {
					// Store profile data — confirmation happens after PIN
					await this.setUserData(profile.name, profile.role, profile.project);
				}
			} catch {
				// Malformed signup data — ignore
			}
		}

		// No signup data — start with PIN setup
		response.markdown(
			`**Welcome to TARX.** I run locally on your machine — your data never leaves.\n\n` +
			`Let's secure your workspace first. Pick a 6-digit PIN — it's stored locally, never transmitted.`
		);
		await this.setStep('ask_pin');
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'welcome' }
		};
	}

	private async handlePinEntry(
		input: string,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		const pin = input.replace(/\s/g, '');
		if (!/^\d{6}$/.test(pin)) {
			response.markdown(`Just 6 numbers, nothing fancy.`);
			return {
				metadata: { command: 'onboarding', onboarding: true, step: 'ask_pin' }
			};
		}

		this.pendingPin = pin;
		response.markdown(`Confirm it one more time.`);
		await this.setStep('confirm_pin');
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'ask_pin' }
		};
	}

	private async handlePinConfirm(
		input: string,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		const pin = input.replace(/\s/g, '');
		if (pin !== this.pendingPin) {
			this.pendingPin = undefined;
			response.markdown(`Those didn't match. Try again — first, your new PIN:`);
			await this.setStep('ask_pin');
			return {
				metadata: { command: 'onboarding', onboarding: true, step: 'confirm_pin' }
			};
		}

		// Store PIN via PinAuth (PBKDF2 + SecretStorage)
		const result = await this.pinAuth.setPIN(pin);
		this.pendingPin = undefined;

		if (!result.success) {
			response.markdown(`Something went wrong saving your PIN. Try again:`);
			await this.setStep('ask_pin');
			return {
				metadata: { command: 'onboarding', onboarding: true, step: 'confirm_pin' }
			};
		}

		console.log('[TARX] PIN set via onboarding');

		// Check if we have signup profile data — if so, go to confirm
		const signupJson = this.context.globalState.get<string>('tarx.signupProfile');
		if (signupJson) {
			try {
				const profile = JSON.parse(signupJson) as Partial<InviteProfile>;
				if (profile.name && profile.role) {
					response.markdown(
						`Locked down. \u2713\n\n` +
						`Based on your signup, you're **${profile.name}**, ` +
						`a **${profile.role}**` +
						(profile.project ? ` working on **${profile.project}**` : '') +
						`. Sound right?\n\n` +
						`Type **yes** to confirm, or **no** to update your info.`
					);
					await this.setStep('confirm');
					return {
						metadata: { command: 'onboarding', onboarding: true, step: 'confirm_pin' }
					};
				}
			} catch {
				// Fall through to name question
			}
		}

		// No signup data — proceed to name question
		response.markdown(`Locked down. \u2713 Now let's get to know each other.\n\nWhat should I call you?`);
		await this.setStep('ask_role');
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'confirm_pin' }
		};
	}

	private async handleNameResponse(
		name: string,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		await this.context.globalState.update('tarx.userName', name);
		response.markdown(
			`Good to meet you, **${name}**. What do you do? ` +
			`(developer, designer, founder, writer — whatever fits)`
		);
		await this.setStep('ask_project');
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'ask_role' }
		};
	}

	private async handleRoleResponse(
		role: string,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		await this.context.globalState.update('tarx.userRole', role);
		const userName = this.context.globalState.get<string>('tarx.userName') || 'there';
		response.markdown(`Got it. What are you working on right now, ${userName}?`);
		await this.setStep('ask_tools');
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'ask_project' }
		};
	}

	private async handleProjectResponse(
		project: string,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		await this.context.globalState.update('tarx.userProject', project);
		response.markdown(
			`Last one — what AI tools have you tried before? ` +
			`(ChatGPT, Claude, Copilot, none — all valid)`
		);
		await this.setStep('finishing');
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'ask_tools' }
		};
	}

	private async handleToolsResponse(
		tools: string,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		await this.finalize(response, tools);
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'complete', complete: true }
		};
	}

	private async handleConfirmResponse(
		input: string,
		response: vscode.ChatResponseStream
	): Promise<OnboardingResult> {
		const affirmative = /^(y(es|eah|ep|up)?|sounds?\s*(right|good|correct)|confirm|ok|sure|yep)\b/i;

		if (affirmative.test(input)) {
			// Confirmed — finalize with signup data
			await this.finalize(response);
			return {
				metadata: { command: 'onboarding', onboarding: true, step: 'complete', complete: true }
			};
		}

		// Declined — fall through to questions
		response.markdown(`No problem. What should I call you?`);
		// Clear signup data so we don't re-confirm
		await this.context.globalState.update('tarx.signupProfile', undefined);
		await this.setStep('ask_role');
		return {
			metadata: { command: 'onboarding', onboarding: true, step: 'confirm' }
		};
	}

	// ========================================================================
	// FINALIZATION
	// ========================================================================

	private async finalize(
		response: vscode.ChatResponseStream,
		toolsText?: string
	): Promise<void> {
		const name = this.context.globalState.get<string>('tarx.userName') || 'there';
		const role = this.context.globalState.get<string>('tarx.userRole') || '';
		const project = this.context.globalState.get<string>('tarx.userProject') || '';

		// Build RAG document and seed
		const profile: InviteProfile = {
			code: '',
			name,
			email: '',
			role,
			project,
			toolsTried: toolsText ? toolsText.split(/[,;]+/).map(t => t.trim()).filter(Boolean) : [],
			frustrations: '',
			interactionStyle: 'both'
		};

		const ragDoc = profileToRAGDocument(profile);
		seedRAGWithProfile(ragDoc).catch(err => {
			console.error('[TARX] Failed to seed RAG with profile:', err);
		});

		// Create workspace space if project was specified
		if (project) {
			createMCPSpace(project, `Project: ${project}`, '').catch(err => {
				console.error('[TARX] Failed to create workspace space:', err);
			});
		}

		// Update onboarding state in SQLite
		updateOnboardingState('complete', { profile_confirmed: true }).catch(err => {
			console.error('[TARX] Failed to update onboarding state:', err);
		});

		// Generate role-based prompts for the completion message
		const prompts = profileToPrompts(profile).slice(0, 3);
		const promptList = prompts.map(p => `- ${p}`).join('\n');

		// Show completion message
		response.markdown(
			`**Your workspace is ready, ${name}.**\n\n` +
			(role ? `I'm set up for ${role} work` : `I'm ready`) +
			(project ? ` on ${project}` : '') +
			`. Here are some things to try:\n\n` +
			promptList
		);

		// Mark complete
		await this.context.globalState.update('tarx.onboardingComplete', true);
		await this.context.globalState.update('tarx.firstRunCompleted', true);
		await this.context.globalState.update('tarx.onboardingVersion', 2);
		await this.setStep('complete');

		// Clean up signup profile (no longer needed)
		await this.context.globalState.update('tarx.signupProfile', undefined);

		console.log(`[TARX] Onboarding complete for ${name} (${role})`);
	}

	// ========================================================================
	// HELPERS
	// ========================================================================

	private async setStep(step: OnboardingStep): Promise<void> {
		await this.context.globalState.update('tarx.onboardingStep', step);
	}

	private async setUserData(name?: string, role?: string, project?: string): Promise<void> {
		if (name) {
			await this.context.globalState.update('tarx.userName', name);
		}
		if (role) {
			await this.context.globalState.update('tarx.userRole', role);
		}
		if (project) {
			await this.context.globalState.update('tarx.userProject', project);
		}
	}

	private async resetOnboarding(): Promise<void> {
		this.pendingPin = undefined;
		await this.context.globalState.update('tarx.onboardingComplete', undefined);
		await this.context.globalState.update('tarx.onboardingStep', undefined);
		await this.context.globalState.update('tarx.userName', undefined);
		await this.context.globalState.update('tarx.userRole', undefined);
		await this.context.globalState.update('tarx.userProject', undefined);
		await this.context.globalState.update('tarx.signupProfile', undefined);
		console.log('[TARX] Onboarding state reset');
	}
}
