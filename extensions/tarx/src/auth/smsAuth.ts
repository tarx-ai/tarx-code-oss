/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * SMS 2FA Authentication Module
 *
 * Privacy-focused SMS verification using Twilio.
 * - Phone number hashed locally (never stored in plain text)
 * - Verification codes generated locally
 * - Only code verification happens via Twilio Verify API
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as https from 'https';

// Storage keys
const PHONE_HASH_KEY = 'tarx.auth.phone.hash';
const PHONE_LAST4_KEY = 'tarx.auth.phone.last4';
const TFA_ENABLED_KEY = 'tarx.auth.2fa.enabled';
const TFA_SESSION_KEY = 'tarx.auth.2fa.session';
const TFA_EXPIRY_KEY = 'tarx.auth.2fa.expiry';

// Security constants
const CODE_LENGTH = 6; // Twilio Verify sends 6-digit codes by default
const CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 3;

// Twilio configuration
interface TwilioConfig {
	accountSid: string;
	authToken: string;
	verifyServiceSid: string;
}

// Default Twilio credentials (TARX production)
const TWILIO_DEFAULTS = {
	accountSid: 'AC45e7c4b38539834cc9cacfe009e50ff5',
	verifyServiceSid: 'VA11b46efa64bb08b8184ade0a4243532a'
};

export interface SmsAuthState {
	isEnabled: boolean;
	phoneLastFour?: string;
	pendingVerification: boolean;
	expiresAt?: number;
}

export interface VerificationSession {
	sessionId: string;
	codeHash: string;
	phoneHash: string;
	expiresAt: number;
	attempts: number;
}

export class SmsAuth {
	private secrets: vscode.SecretStorage;
	private globalState: vscode.Memento;
	private twilioConfig: TwilioConfig | null = null;
	private currentSession: VerificationSession | null = null;

	private initialized = false;

	constructor(context: vscode.ExtensionContext) {
		this.secrets = context.secrets;
		this.globalState = context.globalState;
		// Config loaded asynchronously
	}

	/**
	 * Initialize Twilio configuration (call before using SMS features)
	 */
	async initialize(): Promise<void> {
		if (!this.initialized) {
			await this.loadTwilioConfig();
			this.initialized = true;
		}
	}

	/**
	 * Load Twilio configuration from settings, secrets, or defaults
	 */
	private async loadTwilioConfig(): Promise<void> {
		const config = vscode.workspace.getConfiguration('tarx.auth');

		// Account SID (use default if not overridden)
		const accountSid = config.get<string>('twilioAccountSid')
			|| process.env.TWILIO_ACCOUNT_SID
			|| TWILIO_DEFAULTS.accountSid;

		// Auth token (check secrets first, then config, then env)
		let authToken = await this.secrets.get('tarx.twilio.token');
		if (!authToken) {
			authToken = config.get<string>('twilioAuthToken') || process.env.TWILIO_AUTH_TOKEN;
		}
		// Hardcoded fallback for development
		if (!authToken) {
			authToken = 'e62238efa9b4aa73688ad682620e7a4e';
		}

		// Verify Service SID (use default if not overridden)
		const verifyServiceSid = config.get<string>('twilioVerifyServiceSid')
			|| process.env.TWILIO_VERIFY_SERVICE_SID
			|| TWILIO_DEFAULTS.verifyServiceSid;

		if (accountSid && authToken && verifyServiceSid) {
			this.twilioConfig = { accountSid, authToken, verifyServiceSid };
			console.log('[TARX Auth] Twilio configured with Account SID:', accountSid.substring(0, 8) + '...');
		} else {
			console.log('[TARX Auth] Twilio not configured - SMS 2FA unavailable');
		}
	}

	/**
	 * Check if 2FA is available (Twilio configured)
	 */
	async isAvailable(): Promise<boolean> {
		await this.initialize();
		console.log('[TARX Auth] isAvailable check - twilioConfig:', this.twilioConfig ? 'configured' : 'null');
		return this.twilioConfig !== null;
	}

	/**
	 * Check if 2FA is enabled for this user
	 */
	async isEnabled(): Promise<boolean> {
		return this.globalState.get<boolean>(TFA_ENABLED_KEY, false);
	}

	/**
	 * Get current 2FA state
	 */
	async getState(): Promise<SmsAuthState> {
		const isEnabled = await this.isEnabled();
		const phoneLastFour = this.globalState.get<string>(PHONE_LAST4_KEY);
		const pendingVerification = this.currentSession !== null &&
			this.currentSession.expiresAt > Date.now();

		return {
			isEnabled,
			phoneLastFour: isEnabled ? phoneLastFour : undefined,
			pendingVerification,
			expiresAt: this.currentSession?.expiresAt
		};
	}

	/**
	 * Send verification code to phone number via Twilio Verify API
	 * @param phoneNumber Full phone number with country code (e.g., +1234567890)
	 */
	async sendVerificationCode(phoneNumber: string): Promise<{ success: boolean; sessionId?: string; error?: string }> {
		// Ensure initialized
		await this.initialize();

		if (!this.twilioConfig) {
			return { success: false, error: 'SMS service not configured' };
		}

		// Validate phone number format
		if (!this.validatePhoneFormat(phoneNumber)) {
			return { success: false, error: 'Invalid phone number format. Use +[country code][number]' };
		}

		try {
			const phoneHash = this.hashPhoneNumber(phoneNumber);
			const sessionId = crypto.randomUUID();

			// Send verification via Twilio Verify API (they generate the code)
			const sendResult = await this.sendViaTwilioVerify(phoneNumber);
			if (!sendResult.success) {
				return { success: false, error: sendResult.error };
			}

			// Create local session to track verification state
			this.currentSession = {
				sessionId,
				codeHash: '', // Not used with Twilio Verify - they handle code verification
				phoneHash,
				expiresAt: Date.now() + CODE_EXPIRY_MS,
				attempts: 0
			};

			// Store phone number encrypted for future challenges
			// Store phone hash and last 4 digits for display
			await this.secrets.store(PHONE_HASH_KEY, phoneHash);
			await this.secrets.store('tarx.auth.phone.encrypted', phoneNumber); // Encrypted by SecretStorage
			await this.globalState.update(PHONE_LAST4_KEY, phoneNumber.slice(-4));

			console.log('[TARX Auth] Verification code sent via Twilio Verify');
			return { success: true, sessionId };
		} catch (error) {
			console.error('[TARX Auth] Failed to send verification code:', error);
			return { success: false, error: 'Failed to send verification code' };
		}
	}

	/**
	 * Verify the code entered by user via Twilio Verify API
	 */
	async verifyCode(code: string, sessionId: string): Promise<{ success: boolean; error?: string }> {
		if (!this.currentSession) {
			return { success: false, error: 'No verification session active' };
		}

		if (this.currentSession.sessionId !== sessionId) {
			return { success: false, error: 'Invalid session' };
		}

		if (this.currentSession.expiresAt < Date.now()) {
			this.currentSession = null;
			return { success: false, error: 'Verification code expired. Please request a new one' };
		}

		// Check attempts
		this.currentSession.attempts++;
		if (this.currentSession.attempts > MAX_VERIFY_ATTEMPTS) {
			this.currentSession = null;
			return { success: false, error: 'Too many attempts. Please request a new code' };
		}

		// Get stored phone number for Twilio verification
		const phoneNumber = await this.secrets.get('tarx.auth.phone.encrypted');
		if (!phoneNumber) {
			return { success: false, error: 'Phone number not found' };
		}

		// Verify code via Twilio Verify API
		const verifyResult = await this.verifyViaTwilio(phoneNumber, code);

		if (verifyResult.success) {
			// Enable 2FA
			await this.globalState.update(TFA_ENABLED_KEY, true);
			this.currentSession = null;
			console.log('[TARX Auth] 2FA verification successful via Twilio');
			return { success: true };
		} else {
			const remaining = MAX_VERIFY_ATTEMPTS - this.currentSession.attempts;
			return {
				success: false,
				error: verifyResult.error || `Incorrect code. ${remaining} attempt(s) remaining`
			};
		}
	}

	/**
	 * Send 2FA challenge (for login)
	 */
	async sendChallenge(): Promise<{ success: boolean; sessionId?: string; error?: string }> {
		// Ensure initialized
		await this.initialize();

		if (!this.twilioConfig) {
			return { success: false, error: 'SMS service not configured' };
		}

		const isEnabled = await this.isEnabled();
		if (!isEnabled) {
			return { success: false, error: '2FA not enabled' };
		}

		// Get stored phone number (encrypted in SecretStorage)
		const phoneNumber = await this.secrets.get('tarx.auth.phone.encrypted');
		if (!phoneNumber) {
			return { success: false, error: 'Phone number not configured' };
		}

		const phoneHash = await this.secrets.get(PHONE_HASH_KEY);
		const sessionId = crypto.randomUUID();

		// Send challenge via Twilio Verify
		const sendResult = await this.sendViaTwilioVerify(phoneNumber);
		if (!sendResult.success) {
			return { success: false, error: sendResult.error };
		}

		this.currentSession = {
			sessionId,
			codeHash: '', // Not used with Twilio Verify
			phoneHash: phoneHash || '',
			expiresAt: Date.now() + CODE_EXPIRY_MS,
			attempts: 0
		};

		console.log('[TARX Auth] 2FA challenge sent via Twilio Verify');
		return { success: true, sessionId };
	}

	/**
	 * Verify 2FA challenge code
	 */
	async verifyChallenge(code: string, sessionId: string): Promise<{ success: boolean; error?: string }> {
		return this.verifyCode(code, sessionId);
	}

	/**
	 * Disable 2FA (requires PIN verification first - handled by AuthManager)
	 */
	async disable(): Promise<{ success: boolean; error?: string }> {
		try {
			await this.globalState.update(TFA_ENABLED_KEY, false);
			await this.secrets.delete(PHONE_HASH_KEY);
			await this.globalState.update(PHONE_LAST4_KEY, undefined);
			this.currentSession = null;
			console.log('[TARX Auth] 2FA disabled');
			return { success: true };
		} catch (error) {
			console.error('[TARX Auth] Failed to disable 2FA:', error);
			return { success: false, error: 'Failed to disable 2FA' };
		}
	}

	/**
	 * Generate random verification code
	 */
	private generateCode(): string {
		const buffer = crypto.randomBytes(4);
		const num = buffer.readUInt32BE(0) % 10000;
		return num.toString().padStart(CODE_LENGTH, '0');
	}

	/**
	 * Hash phone number for storage
	 */
	private hashPhoneNumber(phone: string): string {
		return crypto.createHash('sha256').update(phone).digest('hex');
	}

	/**
	 * Hash verification code
	 */
	private hashCode(code: string): string {
		return crypto.createHash('sha256').update(code).digest('hex');
	}

	/**
	 * Validate phone number format
	 */
	private validatePhoneFormat(phone: string): boolean {
		// E.164 format: +[country code][number], 8-15 digits total
		return /^\+[1-9]\d{7,14}$/.test(phone);
	}

	/**
	 * Send verification via Twilio Verify API (Twilio generates the code)
	 */
	private sendViaTwilioVerify(phoneNumber: string): Promise<{ success: boolean; sid?: string; error?: string }> {
		return new Promise((resolve) => {
			if (!this.twilioConfig) {
				resolve({ success: false, error: 'Twilio not configured' });
				return;
			}

			const { accountSid, authToken, verifyServiceSid } = this.twilioConfig;

			// Twilio Verify API - send verification (they generate the code)
			const postData = new URLSearchParams({
				To: phoneNumber,
				Channel: 'sms'
			}).toString();

			const options = {
				hostname: 'verify.twilio.com',
				port: 443,
				path: `/v2/Services/${verifyServiceSid}/Verifications`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Content-Length': Buffer.byteLength(postData),
					'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
				}
			};

			console.log('[TARX Auth] Sending verification to:', phoneNumber);

			const req = https.request(options, (res) => {
				let data = '';
				res.on('data', chunk => data += chunk);
				res.on('end', () => {
					console.log('[TARX Auth] Twilio response status:', res.statusCode);
					if (res.statusCode === 201) {
						try {
							const parsed = JSON.parse(data);
							resolve({ success: true, sid: parsed.sid });
						} catch {
							resolve({ success: true });
						}
					} else {
						try {
							const parsed = JSON.parse(data);
							console.error('[TARX Auth] Twilio error:', parsed);
							resolve({ success: false, error: parsed.message || 'Failed to send SMS' });
						} catch {
							resolve({ success: false, error: `Failed to send SMS (${res.statusCode})` });
						}
					}
				});
			});

			req.on('error', (error) => {
				console.error('[TARX Auth] Twilio request error:', error);
				resolve({ success: false, error: 'Network error sending SMS' });
			});

			req.write(postData);
			req.end();
		});
	}

	/**
	 * Verify code via Twilio VerificationCheck API
	 */
	private verifyViaTwilio(phoneNumber: string, code: string): Promise<{ success: boolean; error?: string }> {
		return new Promise((resolve) => {
			if (!this.twilioConfig) {
				resolve({ success: false, error: 'Twilio not configured' });
				return;
			}

			const { accountSid, authToken, verifyServiceSid } = this.twilioConfig;

			// Twilio Verify API - check verification code
			const postData = new URLSearchParams({
				To: phoneNumber,
				Code: code
			}).toString();

			const options = {
				hostname: 'verify.twilio.com',
				port: 443,
				path: `/v2/Services/${verifyServiceSid}/VerificationCheck`,
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Content-Length': Buffer.byteLength(postData),
					'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
				}
			};

			console.log('[TARX Auth] Verifying code for:', phoneNumber);

			const req = https.request(options, (res) => {
				let data = '';
				res.on('data', chunk => data += chunk);
				res.on('end', () => {
					console.log('[TARX Auth] Twilio verify response status:', res.statusCode);
					console.log('[TARX Auth] Twilio verify response body:', data);
					try {
						const parsed = JSON.parse(data);
						console.log('[TARX Auth] Twilio verify status:', parsed.status);
						if (parsed.status === 'approved') {
							resolve({ success: true });
						} else if (parsed.status === 'pending') {
							resolve({ success: false, error: 'Incorrect code' });
						} else if (parsed.status === 'max_attempts_reached') {
							resolve({ success: false, error: 'Too many attempts on this code. Request a new one.' });
						} else if (parsed.status === 'canceled' || parsed.status === 'deleted') {
							resolve({ success: false, error: 'Verification expired. Request a new code.' });
						} else {
							// Log the actual status for debugging
							console.error('[TARX Auth] Unexpected Twilio status:', parsed.status, parsed);
							resolve({ success: false, error: `Verification failed: ${parsed.status}` });
						}
					} catch (e) {
						console.error('[TARX Auth] Failed to parse Twilio response:', e, data);
						resolve({ success: false, error: 'Failed to verify code' });
					}
				});
			});

			req.on('error', (error) => {
				console.error('[TARX Auth] Twilio verify request error:', error);
				resolve({ success: false, error: 'Network error verifying code' });
			});

			req.write(postData);
			req.end();
		});
	}
}
