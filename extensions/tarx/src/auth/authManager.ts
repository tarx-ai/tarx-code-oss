/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Authentication Manager
 *
 * Orchestrates PIN + SMS 2FA authentication flow.
 * Handles first-run setup, unlock, and settings management.
 */

import * as vscode from 'vscode';
import { PinAuth, PinAuthState } from './pinAuth';
import { SmsAuth, SmsAuthState } from './smsAuth';

// Storage keys
const AUTH_ENABLED_KEY = 'tarx.auth.enabled';
const LAST_ACTIVITY_KEY = 'tarx.auth.lastActivity';

/**
 * Get auto-lock timeout from settings
 */
function getAutoLockTimeoutMs(): number {
	const config = vscode.workspace.getConfiguration('tarx.security');
	const minutes = config.get<number>('autoLockMinutes', 30);
	return minutes * 60 * 1000;
}

/**
 * Check if auth is required on startup from settings
 */
function isRequiredOnStartup(): boolean {
	const config = vscode.workspace.getConfiguration('tarx.security');
	return config.get<boolean>('requireOnStartup', true);
}

export interface AuthState {
	isAuthEnabled: boolean;
	isUnlocked: boolean;
	pin: PinAuthState;
	sms: SmsAuthState;
}

export class AuthManager {
	private pinAuth: PinAuth;
	private smsAuth: SmsAuth;
	private globalState: vscode.Memento;
	private isUnlocked: boolean = false;
	private activityTimer: NodeJS.Timeout | null = null;
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.globalState = context.globalState;
		this.pinAuth = new PinAuth(context);
		this.smsAuth = new SmsAuth(context);
	}

	/**
	 * Initialize auth manager
	 */
	async initialize(): Promise<void> {
		// Initialize SMS auth (loads Twilio config)
		await this.smsAuth.initialize();
		// Start activity tracking for auto-lock
		this.startActivityTracking();
		console.log('[TARX Auth] Manager initialized');
	}

	/**
	 * Check if authentication is enabled
	 */
	async isAuthEnabled(): Promise<boolean> {
		return this.pinAuth.isConfigured();
	}

	/**
	 * Get full auth state
	 */
	async getState(): Promise<AuthState> {
		const isAuthEnabled = await this.isAuthEnabled();
		const pinState = await this.pinAuth.getState();
		const smsState = await this.smsAuth.getState();

		return {
			isAuthEnabled,
			isUnlocked: this.isUnlocked,
			pin: pinState,
			sms: smsState
		};
	}

	/**
	 * Check if auth is required on startup (respects user setting)
	 */
	isRequiredOnStartup(): boolean {
		return isRequiredOnStartup();
	}

	/**
	 * Check if unlock is required
	 */
	async requiresUnlock(): Promise<boolean> {
		const isEnabled = await this.isAuthEnabled();
		if (!isEnabled) {
			return false; // No auth configured
		}

		// Check auto-lock timeout
		if (this.isUnlocked) {
			const lastActivity = this.globalState.get<number>(LAST_ACTIVITY_KEY, 0);
			if (Date.now() - lastActivity > getAutoLockTimeoutMs()) {
				this.isUnlocked = false;
				console.log('[TARX Auth] Auto-locked due to inactivity');
			}
		}

		return !this.isUnlocked;
	}

	/**
	 * First-run setup flow
	 */
	async runSetupFlow(): Promise<boolean> {
		// Step 1: Ask if user wants to enable authentication
		const enableAuth = await vscode.window.showInformationMessage(
			'Would you like to set up PIN authentication to protect TARX?',
			{ modal: true },
			'Yes, set up PIN',
			'Skip for now'
		);

		if (enableAuth !== 'Yes, set up PIN') {
			return false;
		}

		// Step 2: Get PIN
		const pin = await this.promptForNewPin();
		if (!pin) {
			return false;
		}

		// Step 3: Set PIN
		const pinResult = await this.pinAuth.setPIN(pin);
		if (!pinResult.success) {
			vscode.window.showErrorMessage(pinResult.error || 'Failed to set PIN');
			return false;
		}

		// Step 4: Ask about 2FA
		const smsAvailable = await this.smsAuth.isAvailable();
		if (smsAvailable) {
			const enable2FA = await vscode.window.showInformationMessage(
				'Would you like to enable SMS two-factor authentication for extra security?',
				{ modal: true },
				'Yes, enable 2FA',
				'Skip'
			);

			if (enable2FA === 'Yes, enable 2FA') {
				await this.setup2FA();
			}
		}

		vscode.window.showInformationMessage('Authentication set up successfully!');
		this.isUnlocked = true;
		this.updateActivity();
		return true;
	}

	/**
	 * Prompt user for new PIN with confirmation
	 */
	private async promptForNewPin(): Promise<string | undefined> {
		// First entry
		const pin1 = await vscode.window.showInputBox({
			prompt: 'Enter a 6-digit PIN',
			password: true,
			validateInput: (value) => {
				if (!/^\d{6}$/.test(value)) {
					return 'PIN must be exactly 6 digits';
				}
				return null;
			},
			placeHolder: '••••••'
		});

		if (!pin1) {
			return undefined;
		}

		// Confirmation
		const pin2 = await vscode.window.showInputBox({
			prompt: 'Confirm your PIN',
			password: true,
			validateInput: (value) => {
				if (value !== pin1) {
					return 'PINs do not match';
				}
				return null;
			},
			placeHolder: '••••••'
		});

		if (!pin2 || pin1 !== pin2) {
			vscode.window.showErrorMessage('PINs do not match');
			return undefined;
		}

		return pin1;
	}

	/**
	 * Setup 2FA flow
	 */
	private async setup2FA(): Promise<boolean> {
		// Get phone number
		const phone = await vscode.window.showInputBox({
			prompt: 'Enter your phone number with country code',
			placeHolder: '+1234567890',
			validateInput: (value) => {
				if (!/^\+[1-9]\d{7,14}$/.test(value)) {
					return 'Use format: +[country code][number]';
				}
				return null;
			}
		});

		if (!phone) {
			return false;
		}

		// Send verification code
		const sendResult = await this.smsAuth.sendVerificationCode(phone);
		if (!sendResult.success) {
			vscode.window.showErrorMessage(sendResult.error || 'Failed to send verification code');
			return false;
		}

		// Get verification code
		const code = await vscode.window.showInputBox({
			prompt: 'Enter the 4-digit code sent to your phone',
			placeHolder: '1234',
			validateInput: (value) => {
				if (!/^\d{4}$/.test(value)) {
					return 'Code must be 4 digits';
				}
				return null;
			}
		});

		if (!code || !sendResult.sessionId) {
			return false;
		}

		// Verify code
		const verifyResult = await this.smsAuth.verifyCode(code, sendResult.sessionId);
		if (!verifyResult.success) {
			vscode.window.showErrorMessage(verifyResult.error || 'Verification failed');
			return false;
		}

		vscode.window.showInformationMessage('Two-factor authentication enabled!');
		return true;
	}

	/**
	 * Unlock flow (called when auth is required)
	 */
	async unlock(): Promise<boolean> {
		const state = await this.getState();

		if (!state.isAuthEnabled) {
			this.isUnlocked = true;
			return true;
		}

		// Check if locked out
		if (state.pin.isLocked) {
			const remainingMs = (state.pin.lockoutEndTime || 0) - Date.now();
			const remainingMins = Math.ceil(remainingMs / 60000);
			vscode.window.showErrorMessage(
				`Too many incorrect attempts. Try again in ${remainingMins} minute(s)`
			);
			return false;
		}

		// Step 1: PIN verification
		const pin = await vscode.window.showInputBox({
			prompt: `Enter your PIN to unlock TARX (${state.pin.attemptsRemaining} attempts remaining)`,
			password: true,
			placeHolder: '••••••',
			ignoreFocusOut: true
		});

		if (!pin) {
			return false;
		}

		const pinResult = await this.pinAuth.verifyPIN(pin);
		if (!pinResult.success) {
			vscode.window.showErrorMessage(pinResult.error || 'Incorrect PIN');
			return false;
		}

		// Step 2: 2FA verification (if enabled)
		if (state.sms.isEnabled) {
			const twoFAResult = await this.verify2FA();
			if (!twoFAResult) {
				return false;
			}
		}

		// Success
		this.isUnlocked = true;
		this.updateActivity();
		return true;
	}

	/**
	 * 2FA verification flow
	 */
	private async verify2FA(): Promise<boolean> {
		// Send challenge
		const challengeResult = await this.smsAuth.sendChallenge();
		if (!challengeResult.success) {
			vscode.window.showErrorMessage(challengeResult.error || 'Failed to send 2FA code');
			return false;
		}

		const state = await this.smsAuth.getState();
		const phoneHint = state.phoneLastFour ? `••••${state.phoneLastFour}` : 'your phone';

		// Get code from user
		const code = await vscode.window.showInputBox({
			prompt: `Enter the 4-digit code sent to ${phoneHint}`,
			placeHolder: '1234',
			password: true,
			ignoreFocusOut: true,
			validateInput: (value) => {
				if (!/^\d{4}$/.test(value)) {
					return 'Code must be 4 digits';
				}
				return null;
			}
		});

		if (!code || !challengeResult.sessionId) {
			return false;
		}

		// Verify
		const verifyResult = await this.smsAuth.verifyChallenge(code, challengeResult.sessionId);
		if (!verifyResult.success) {
			vscode.window.showErrorMessage(verifyResult.error || 'Invalid code');
			return false;
		}

		return true;
	}

	/**
	 * Change PIN
	 */
	async changePIN(): Promise<boolean> {
		// Verify current PIN first
		const currentPin = await vscode.window.showInputBox({
			prompt: 'Enter your current PIN',
			password: true,
			placeHolder: '••••••'
		});

		if (!currentPin) {
			return false;
		}

		// Get new PIN
		const newPin = await this.promptForNewPin();
		if (!newPin) {
			return false;
		}

		const result = await this.pinAuth.changePIN(currentPin, newPin);
		if (result.success) {
			vscode.window.showInformationMessage('PIN changed successfully');
			return true;
		} else {
			vscode.window.showErrorMessage(result.error || 'Failed to change PIN');
			return false;
		}
	}

	/**
	 * Disable authentication (requires PIN verification)
	 */
	async disableAuth(): Promise<boolean> {
		const confirm = await vscode.window.showWarningMessage(
			'Are you sure you want to disable PIN authentication?',
			{ modal: true },
			'Yes, disable',
			'Cancel'
		);

		if (confirm !== 'Yes, disable') {
			return false;
		}

		const pin = await vscode.window.showInputBox({
			prompt: 'Enter your PIN to confirm',
			password: true,
			placeHolder: '••••••'
		});

		if (!pin) {
			return false;
		}

		// Disable 2FA first if enabled
		const smsState = await this.smsAuth.getState();
		if (smsState.isEnabled) {
			await this.smsAuth.disable();
		}

		// Remove PIN
		const result = await this.pinAuth.removePIN(pin);
		if (result.success) {
			this.isUnlocked = true; // No longer need unlock
			vscode.window.showInformationMessage('Authentication disabled');
			return true;
		} else {
			vscode.window.showErrorMessage(result.error || 'Failed to disable authentication');
			return false;
		}
	}

	/**
	 * Lock immediately
	 */
	lock(): void {
		this.isUnlocked = false;
		console.log('[TARX Auth] Locked');
	}

	/**
	 * Update last activity time
	 */
	updateActivity(): void {
		this.globalState.update(LAST_ACTIVITY_KEY, Date.now());
	}

	/**
	 * Start activity tracking for auto-lock
	 */
	private startActivityTracking(): void {
		// Check every minute
		this.activityTimer = setInterval(() => {
			if (this.isUnlocked) {
				const lastActivity = this.globalState.get<number>(LAST_ACTIVITY_KEY, 0);
				if (Date.now() - lastActivity > getAutoLockTimeoutMs()) {
					this.lock();
					vscode.window.showInformationMessage('TARX has been locked due to inactivity');
				}
			}
		}, 60000);

		// Track user activity
		vscode.window.onDidChangeActiveTextEditor(() => this.updateActivity());
		vscode.workspace.onDidChangeTextDocument(() => this.updateActivity());
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.activityTimer) {
			clearInterval(this.activityTimer);
			this.activityTimer = null;
		}
	}
}

/**
 * Unlock handler callback type
 */
export type UnlockHandler = () => Promise<boolean>;

/**
 * Create and register auth commands
 * @param unlockHandler Optional custom unlock handler (e.g., to show AuthChatView)
 */
export function registerAuthCommands(
	context: vscode.ExtensionContext,
	authManager: AuthManager,
	unlockHandler?: UnlockHandler
): void {
	// Safe command registration helper
	function safeRegister(commandId: string, handler: (...args: any[]) => any) {
		try {
			context.subscriptions.push(
				vscode.commands.registerCommand(commandId, handler)
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes('already exists')) {
				console.log(`[TARX] Command ${commandId} already exists, skipping`);
			} else {
				console.error(`[TARX] Failed to register ${commandId}:`, error);
			}
		}
	}

	// Setup authentication
	safeRegister('tarx.auth.setup', async () => {
		await authManager.runSetupFlow();
	});

	// Unlock - use custom handler if provided (e.g., AuthChatView)
	safeRegister('tarx.auth.unlock', async () => {
		if (unlockHandler) {
			await unlockHandler();
		} else {
			await authManager.unlock();
		}
	});

	// Lock
	safeRegister('tarx.auth.lock', () => {
		authManager.lock();
		vscode.window.showInformationMessage('TARX locked');
	});

	// Change PIN
	safeRegister('tarx.auth.changePin', async () => {
		await authManager.changePIN();
	});

	// Disable auth
	safeRegister('tarx.auth.disable', async () => {
		await authManager.disableAuth();
	});

	// Debug: Force reset all auth (for testing)
	safeRegister('tarx.auth.debugReset', async () => {
		const confirm = await vscode.window.showWarningMessage(
			'DEBUG: This will delete all auth data (PIN, 2FA). Continue?',
			{ modal: true },
			'Yes, Reset Everything'
		);

		if (confirm === 'Yes, Reset Everything') {
			// Clear PIN
			await context.secrets.delete('tarx.auth.pin');
			// Clear SMS/2FA
			await context.secrets.delete('tarx.auth.phone.hash');
			await context.secrets.delete('tarx.auth.phone.encrypted');
			await context.globalState.update('tarx.auth.phone.last4', undefined);
			await context.globalState.update('tarx.auth.2fa.enabled', undefined);
			// Reset manager state
			(authManager as any).isUnlocked = false;
			vscode.window.showInformationMessage('Auth data cleared. Reload window to test setup flow.');
		}
	});

	// Auth settings
	safeRegister('tarx.auth.settings', async () => {
			const state = await authManager.getState();

			const options = state.isAuthEnabled
				? ['Change PIN', 'Disable Authentication', 'Lock Now']
				: ['Set Up Authentication'];

			const selected = await vscode.window.showQuickPick(options, {
				placeHolder: 'Authentication Settings'
			});

			switch (selected) {
				case 'Set Up Authentication':
					await authManager.runSetupFlow();
					break;
				case 'Change PIN':
					await authManager.changePIN();
					break;
				case 'Disable Authentication':
					await authManager.disableAuth();
					break;
				case 'Lock Now':
					authManager.lock();
					vscode.window.showInformationMessage('TARX locked');
					break;
			}
		});
}
