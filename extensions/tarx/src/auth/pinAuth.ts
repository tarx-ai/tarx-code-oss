/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * PIN Authentication Module
 *
 * Privacy-first local PIN authentication using VS Code Secrets API.
 * - No server communication
 * - PIN hash stored locally using bcrypt
 * - Rate limiting to prevent brute force
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';

// Storage keys
const PIN_HASH_KEY = 'tarx.auth.pin.hash';
const PIN_SALT_KEY = 'tarx.auth.pin.salt';
const PIN_ATTEMPTS_KEY = 'tarx.auth.pin.attempts';
const PIN_LOCKOUT_KEY = 'tarx.auth.pin.lockout';

// Security constants
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const HASH_ITERATIONS = 100000;
const HASH_KEY_LENGTH = 64;
const HASH_ALGORITHM = 'sha512';

export interface PinAuthState {
	isConfigured: boolean;
	isLocked: boolean;
	attemptsRemaining: number;
	lockoutEndTime?: number;
}

export class PinAuth {
	private secrets: vscode.SecretStorage;
	private globalState: vscode.Memento;

	constructor(context: vscode.ExtensionContext) {
		this.secrets = context.secrets;
		this.globalState = context.globalState;
	}

	/**
	 * Check if PIN is configured
	 */
	async isConfigured(): Promise<boolean> {
		const hash = await this.secrets.get(PIN_HASH_KEY);
		return hash !== undefined && hash.length > 0;
	}

	/**
	 * Get current auth state
	 */
	async getState(): Promise<PinAuthState> {
		const isConfigured = await this.isConfigured();
		const lockoutEnd = this.globalState.get<number>(PIN_LOCKOUT_KEY, 0);
		const attempts = this.globalState.get<number>(PIN_ATTEMPTS_KEY, 0);
		const now = Date.now();

		const isLocked = lockoutEnd > now;
		const attemptsRemaining = isLocked ? 0 : MAX_ATTEMPTS - attempts;

		return {
			isConfigured,
			isLocked,
			attemptsRemaining,
			lockoutEndTime: isLocked ? lockoutEnd : undefined
		};
	}

	/**
	 * Set up a new PIN
	 * @param pin 6-digit PIN string
	 */
	async setPIN(pin: string): Promise<{ success: boolean; error?: string }> {
		// Validate PIN format
		if (!this.validatePinFormat(pin)) {
			return { success: false, error: 'PIN must be exactly 6 digits' };
		}

		try {
			// Generate random salt
			const salt = crypto.randomBytes(32).toString('hex');

			// Hash the PIN with salt using PBKDF2
			const hash = await this.hashPin(pin, salt);

			// Store hash and salt securely
			await this.secrets.store(PIN_HASH_KEY, hash);
			await this.secrets.store(PIN_SALT_KEY, salt);

			// Reset attempts
			await this.globalState.update(PIN_ATTEMPTS_KEY, 0);
			await this.globalState.update(PIN_LOCKOUT_KEY, 0);

			console.log('[TARX Auth] PIN configured successfully');
			return { success: true };
		} catch (error) {
			console.error('[TARX Auth] Failed to set PIN:', error);
			return { success: false, error: 'Failed to save PIN securely' };
		}
	}

	/**
	 * Verify entered PIN
	 * @param pin PIN to verify
	 */
	async verifyPIN(pin: string): Promise<{ success: boolean; error?: string; locked?: boolean }> {
		// Check if locked out
		const state = await this.getState();
		if (state.isLocked) {
			const remainingMs = (state.lockoutEndTime || 0) - Date.now();
			const remainingMins = Math.ceil(remainingMs / 60000);
			return {
				success: false,
				error: `Too many attempts. Try again in ${remainingMins} minute(s)`,
				locked: true
			};
		}

		// Check if configured
		if (!state.isConfigured) {
			return { success: false, error: 'PIN not configured' };
		}

		try {
			// Get stored hash and salt
			const storedHash = await this.secrets.get(PIN_HASH_KEY);
			const storedSalt = await this.secrets.get(PIN_SALT_KEY);

			if (!storedHash || !storedSalt) {
				return { success: false, error: 'PIN data corrupted' };
			}

			// Hash the entered PIN with the stored salt
			const enteredHash = await this.hashPin(pin, storedSalt);

			// Constant-time comparison to prevent timing attacks
			const isValid = crypto.timingSafeEqual(
				Buffer.from(storedHash, 'hex'),
				Buffer.from(enteredHash, 'hex')
			);

			if (isValid) {
				// Reset attempts on success
				await this.globalState.update(PIN_ATTEMPTS_KEY, 0);
				console.log('[TARX Auth] PIN verified successfully');
				return { success: true };
			} else {
				// Increment attempts
				const attempts = this.globalState.get<number>(PIN_ATTEMPTS_KEY, 0) + 1;
				await this.globalState.update(PIN_ATTEMPTS_KEY, attempts);

				if (attempts >= MAX_ATTEMPTS) {
					// Lock out
					const lockoutEnd = Date.now() + LOCKOUT_DURATION_MS;
					await this.globalState.update(PIN_LOCKOUT_KEY, lockoutEnd);
					await this.globalState.update(PIN_ATTEMPTS_KEY, 0);
					console.log('[TARX Auth] Account locked due to too many attempts');
					return {
						success: false,
						error: `Too many attempts. Locked for 5 minutes`,
						locked: true
					};
				}

				return {
					success: false,
					error: `Incorrect PIN. ${MAX_ATTEMPTS - attempts} attempts remaining`
				};
			}
		} catch (error) {
			console.error('[TARX Auth] PIN verification error:', error);
			return { success: false, error: 'Verification failed' };
		}
	}

	/**
	 * Change existing PIN
	 */
	async changePIN(currentPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
		// Verify current PIN first
		const verifyResult = await this.verifyPIN(currentPin);
		if (!verifyResult.success) {
			return { success: false, error: verifyResult.error || 'Current PIN incorrect' };
		}

		// Set new PIN
		return this.setPIN(newPin);
	}

	/**
	 * Remove PIN (requires current PIN verification)
	 */
	async removePIN(currentPin: string): Promise<{ success: boolean; error?: string }> {
		// Verify current PIN first
		const verifyResult = await this.verifyPIN(currentPin);
		if (!verifyResult.success) {
			return { success: false, error: verifyResult.error || 'PIN incorrect' };
		}

		try {
			await this.secrets.delete(PIN_HASH_KEY);
			await this.secrets.delete(PIN_SALT_KEY);
			await this.globalState.update(PIN_ATTEMPTS_KEY, undefined);
			await this.globalState.update(PIN_LOCKOUT_KEY, undefined);
			console.log('[TARX Auth] PIN removed');
			return { success: true };
		} catch (error) {
			console.error('[TARX Auth] Failed to remove PIN:', error);
			return { success: false, error: 'Failed to remove PIN' };
		}
	}

	/**
	 * Reset lockout (for admin/recovery purposes)
	 */
	async resetLockout(): Promise<void> {
		await this.globalState.update(PIN_ATTEMPTS_KEY, 0);
		await this.globalState.update(PIN_LOCKOUT_KEY, 0);
		console.log('[TARX Auth] Lockout reset');
	}

	/**
	 * Validate PIN format (6 digits)
	 */
	private validatePinFormat(pin: string): boolean {
		return /^\d{6}$/.test(pin);
	}

	/**
	 * Hash PIN using PBKDF2
	 */
	private hashPin(pin: string, salt: string): Promise<string> {
		return new Promise((resolve, reject) => {
			crypto.pbkdf2(
				pin,
				salt,
				HASH_ITERATIONS,
				HASH_KEY_LENGTH,
				HASH_ALGORITHM,
				(err, derivedKey) => {
					if (err) reject(err);
					else resolve(derivedKey.toString('hex'));
				}
			);
		});
	}
}
