/**
 * TARX Notify — Notification routing (log, thinking tab, SMS).
 *
 * Twilio best practices:
 * - E.164 validation on all phone numbers
 * - Credential + number validation on first use (fail loud)
 * - Categorized error handling (non-retryable / retryable / config)
 * - Exponential backoff with jitter on retryable errors
 * - Message SID tracking + status logging
 * - Rate limiting with sliding window
 * - Console surfaces SMS success/failure (no silent swallowing)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';

// Load .env from repo root
config({ path: resolve(__dirname, '../../../../.env') });

const LOG_DIR = resolve(homedir(), '.tarx');
const LOG_FILE = resolve(LOG_DIR, 'dispatch.log');

// ── Configuration ──────────────────────────────────────────────────

const MAX_SMS_PER_HOUR = 10;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;
const JITTER_MS = 500;

// ── E.164 Validation ──────────────────────────────────────────────

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

function validateE164(phone: string, label: string): string | null {
	if (!phone) return `${label} is empty`;
	if (!E164_REGEX.test(phone)) return `${label} "${phone}" is not valid E.164 format (must be +[country code][number], e.g. +15551234567)`;
	return null;
}

// ── Error Classification ──────────────────────────────────────────

// Non-retryable: bad numbers, opt-outs, invalid formats
const NON_RETRYABLE_CODES = new Set([
	21211, // Invalid TO number
	21214, // TO not a valid mobile
	21610, // Recipient opted out (STOP)
	21614, // TO not valid for SMS
	21617, // Body exceeds 1600 chars
	21660, // FROM number mismatch (not in account)
	30005, // Unknown destination handset
	30006, // Landline or unreachable carrier
]);

// Config errors: need human intervention
const CONFIG_ERROR_CODES = new Set([
	21608, // FROM number not enabled for SMS
	30002, // Account suspended
	30004, // Message blocked (carrier filtering)
	30007, // Carrier violation (A2P 10DLC needed)
]);

function classifyError(code: number): 'non_retryable' | 'config' | 'retryable' {
	if (NON_RETRYABLE_CODES.has(code)) return 'non_retryable';
	if (CONFIG_ERROR_CODES.has(code)) return 'config';
	return 'retryable';
}

// ── Logging ───────────────────────────────────────────────────────

function ensureLogDir(): void {
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}
}

function logToFile(level: string, message: string): void {
	ensureLogDir();
	const timestamp = new Date().toISOString();
	appendFileSync(LOG_FILE, `[${timestamp}] [${level.toUpperCase()}] ${message}\n`);
}

// ── Rate Limiter (sliding window) ─────────────────────────────────

const smsTimestamps: number[] = [];

function checkRateLimit(): { allowed: boolean; remaining: number } {
	const now = Date.now();
	const hourAgo = now - 60 * 60 * 1000;
	while (smsTimestamps.length > 0 && smsTimestamps[0] < hourAgo) {
		smsTimestamps.shift();
	}
	return {
		allowed: smsTimestamps.length < MAX_SMS_PER_HOUR,
		remaining: MAX_SMS_PER_HOUR - smsTimestamps.length,
	};
}

// ── Twilio Client (lazy, validated) ───────────────────────────────

let twilioClient: any = null;
let twilioValidated = false;
let twilioDisabled = false; // Set true on config errors — don't retry until restart
let twilioDisabledReason = '';

function getTwilio(): any {
	if (twilioDisabled) return null;
	if (twilioClient) return twilioClient;

	const sid = process.env.TWILIO_ACCOUNT_SID;
	const token = process.env.TWILIO_AUTH_TOKEN;

	if (!sid || !token) {
		twilioDisabled = true;
		twilioDisabledReason = 'TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set in .env';
		return null;
	}

	if (!sid.startsWith('AC') || sid.length !== 34) {
		twilioDisabled = true;
		twilioDisabledReason = `TWILIO_ACCOUNT_SID format invalid (got ${sid.length} chars, need 34 starting with AC)`;
		return null;
	}

	if (token.length !== 32) {
		twilioDisabled = true;
		twilioDisabledReason = `TWILIO_AUTH_TOKEN format invalid (got ${token.length} chars, need 32)`;
		return null;
	}

	try {
		const twilio = require('twilio');
		twilioClient = twilio(sid, token);
		return twilioClient;
	} catch (e: any) {
		twilioDisabled = true;
		twilioDisabledReason = `Twilio module failed to load: ${e.message}`;
		return null;
	}
}

// ── Startup Validation ────────────────────────────────────────────

async function validateTwilioSetup(): Promise<{ ok: boolean; errors: string[] }> {
	if (twilioValidated) return { ok: !twilioDisabled, errors: twilioDisabled ? [twilioDisabledReason] : [] };

	const errors: string[] = [];
	const client = getTwilio();

	if (!client) {
		twilioValidated = true;
		return { ok: false, errors: [twilioDisabledReason || 'Twilio client not initialized'] };
	}

	const from = process.env.TWILIO_FROM;
	const to = process.env.TARX_NOTIFY_PHONE;
	const msgSvcSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

	// Validate TO number (always required)
	const toErr = to ? validateE164(to, 'TARX_NOTIFY_PHONE') : 'TARX_NOTIFY_PHONE not set in .env';
	if (toErr) errors.push(toErr);

	// Need either Messaging Service SID or FROM number
	if (!msgSvcSid && !from) {
		errors.push('Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM is set in .env');
	} else if (msgSvcSid && (!msgSvcSid.startsWith('MG') || msgSvcSid.length !== 34)) {
		errors.push(`TWILIO_MESSAGING_SERVICE_SID format invalid (must start with MG, 34 chars)`);
	} else if (!msgSvcSid && from) {
		const fromErr = validateE164(from, 'TWILIO_FROM');
		if (fromErr) errors.push(fromErr);
	}

	// Validate account is active
	try {
		const account = await client.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
		if (account.status !== 'active') {
			errors.push(`Twilio account status is "${account.status}" (need "active")`);
		}
		if (account.type === 'Trial') {
			logToFile('warn', 'Twilio account is TRIAL — can only send to verified numbers');
		}
	} catch (e: any) {
		if (e.status === 401) {
			errors.push('Twilio credentials are invalid (401 Unauthorized)');
		} else {
			errors.push(`Twilio account check failed: ${e.message}`);
		}
	}

	// Validate sending source
	if (msgSvcSid) {
		// Messaging Service handles number selection — skip FROM validation
		logToFile('info', `Using Messaging Service: ${msgSvcSid}`);
	} else if (from) {
		// Direct FROM — validate number exists in account
		try {
			const nums = await client.incomingPhoneNumbers.list({ phoneNumber: from });
			if (nums.length === 0) {
				errors.push(`FROM number ${from} is NOT in your Twilio account — buy it at twilio.com/console or use a number you own`);
			} else if (!nums[0].capabilities?.sms) {
				errors.push(`FROM number ${from} exists but is NOT SMS-capable`);
			}
		} catch (e: any) {
			errors.push(`Could not verify FROM number: ${e.message}`);
		}
	}

	twilioValidated = true;

	if (errors.length > 0) {
		twilioDisabled = true;
		twilioDisabledReason = errors.join('; ');
	}

	return { ok: errors.length === 0, errors };
}

// ── SMS Send with Retry ───────────────────────────────────────────

interface SMSResult {
	sent: boolean;
	sid?: string;
	status?: string;
	error?: string;
	errorCode?: number;
	attempts: number;
}

async function sendSMSWithRetry(body: string): Promise<SMSResult> {
	const client = getTwilio();
	if (!client) {
		return { sent: false, error: twilioDisabledReason || 'Twilio not available', attempts: 0 };
	}

	const to = process.env.TARX_NOTIFY_PHONE!;
	const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
	const from = process.env.TWILIO_FROM;

	// Build send params — prefer Messaging Service, fall back to direct FROM
	const sendParams: any = { body, to };
	if (messagingServiceSid) {
		sendParams.messagingServiceSid = messagingServiceSid;
	} else if (from) {
		sendParams.from = from;
	} else {
		return { sent: false, error: 'Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM is set', attempts: 0 };
	}

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const msg = await client.messages.create(sendParams);

			smsTimestamps.push(Date.now());
			logToFile('info', `SMS sent: SID=${msg.sid} status=${msg.status} via=${messagingServiceSid ? 'MessagingService' : 'direct'} body="${body}"`);

			return {
				sent: true,
				sid: msg.sid,
				status: msg.status,
				attempts: attempt + 1,
			};
		} catch (e: any) {
			const code = e.code || e.status;
			const category = classifyError(code);

			logToFile('error', `SMS attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: [${code}] ${e.message}`);

			// Non-retryable or config error — stop immediately
			if (category !== 'retryable') {
				if (category === 'config') {
					twilioDisabled = true;
					twilioDisabledReason = `Config error ${code}: ${e.message}`;
				}
				return {
					sent: false,
					error: `[${code}] ${e.message}`,
					errorCode: code,
					attempts: attempt + 1,
				};
			}

			// Retryable — backoff with jitter
			if (attempt < MAX_RETRIES) {
				const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
				const jitter = Math.random() * JITTER_MS;
				await new Promise(r => setTimeout(r, delay + jitter));
			}
		}
	}

	return { sent: false, error: 'Max retries exceeded', attempts: MAX_RETRIES + 1 };
}

// ── Public API ────────────────────────────────────────────────────

const LEVEL_EMOJI: Record<string, string> = {
	info: 'i',
	success: 'OK',
	warning: '!!',
	blocked: 'BLOCKED',
	error: 'ERR',
};

export type NotifyLevel = 'info' | 'success' | 'warning' | 'blocked' | 'error';

async function sendSMS(level: NotifyLevel, message: string): Promise<SMSResult> {
	// Validate on first SMS attempt
	const validation = await validateTwilioSetup();
	if (!validation.ok) {
		const errMsg = `SMS config errors: ${validation.errors.join('; ')}`;
		logToFile('error', errMsg);
		console.error(`  [SMS FAILED] ${errMsg}`);
		return { sent: false, error: errMsg, attempts: 0 };
	}

	// Rate limit
	const { allowed, remaining } = checkRateLimit();
	if (!allowed) {
		const errMsg = `Rate limit exceeded (${MAX_SMS_PER_HOUR}/hour). Resets in ~${60 - Math.floor((Date.now() - smsTimestamps[0]) / 60000)}min`;
		logToFile('warn', errMsg);
		console.error(`  [SMS BLOCKED] ${errMsg}`);
		return { sent: false, error: errMsg, attempts: 0 };
	}

	// Format: "TARX {level}: {message}" — keep under 160 chars for single segment
	const emoji = LEVEL_EMOJI[level] || level;
	let smsBody = `TARX ${emoji}: ${message}`;
	if (smsBody.length > 160) {
		smsBody = smsBody.substring(0, 157) + '...';
	}

	const result = await sendSMSWithRetry(smsBody);

	if (result.sent) {
		console.error(`  [SMS SENT] SID=${result.sid} (${remaining - 1} remaining this hour)`);
	} else {
		console.error(`  [SMS FAILED] ${result.error} (after ${result.attempts} attempt${result.attempts !== 1 ? 's' : ''})`);
	}

	return result;
}

export async function notify(level: NotifyLevel, message: string): Promise<void> {
	// Always log to file
	logToFile(level, message);

	// Console output
	const prefix = LEVEL_EMOJI[level] || level;
	console.log(`[TARX ${prefix}] ${message}`);

	// SMS for actionable levels
	if (level === 'success' || level === 'warning' || level === 'blocked') {
		await sendSMS(level, message);
	}

	// Blocked: schedule repeat in 5 minutes (best-effort, in-process only)
	if (level === 'blocked') {
		setTimeout(() => {
			sendSMS('blocked', `REPEAT: ${message}`).catch(() => {});
		}, 5 * 60 * 1000);
	}
}

/**
 * Validate Twilio setup and print diagnostic report.
 * Call from CLI: `tarx notify --check`
 */
export async function notifyCheck(): Promise<void> {
	console.log('TARX SMS Diagnostic');
	console.log('===================\n');

	// Env vars
	const sid = process.env.TWILIO_ACCOUNT_SID;
	const token = process.env.TWILIO_AUTH_TOKEN;
	const from = process.env.TWILIO_FROM;
	const to = process.env.TARX_NOTIFY_PHONE;

	const msgSvc = process.env.TWILIO_MESSAGING_SERVICE_SID;

	console.log('Environment:');
	console.log(`  TWILIO_ACCOUNT_SID:            ${sid ? sid.substring(0, 6) + '...' + sid.substring(sid.length - 4) : 'NOT SET'}`);
	console.log(`  TWILIO_AUTH_TOKEN:             ${token ? '****' + token.substring(token.length - 4) : 'NOT SET'}`);
	console.log(`  TWILIO_MESSAGING_SERVICE_SID:  ${msgSvc || 'NOT SET'}`);
	console.log(`  TWILIO_FROM:                   ${from || 'NOT SET'}${msgSvc ? ' (ignored — using Messaging Service)' : ''}`);
	console.log(`  TARX_NOTIFY_PHONE:             ${to || 'NOT SET'}`);
	console.log(`\n  Send mode: ${msgSvc ? 'Messaging Service (recommended)' : from ? 'Direct FROM number' : 'NOT CONFIGURED'}`);

	// E.164 validation
	console.log('\nE.164 Validation:');
	const fromErr = from ? validateE164(from, 'FROM') : 'NOT SET';
	const toErr = to ? validateE164(to, 'TO') : 'NOT SET';
	console.log(`  FROM: ${fromErr || 'VALID'}`);
	console.log(`  TO:   ${toErr || 'VALID'}`);

	// Account check
	const client = getTwilio();
	if (!client) {
		console.log(`\nTwilio Client: FAILED — ${twilioDisabledReason}`);
		return;
	}

	console.log('\nTwilio Account:');
	try {
		const account = await client.api.v2010.accounts(sid).fetch();
		console.log(`  Name:   ${account.friendlyName}`);
		console.log(`  Status: ${account.status}`);
		console.log(`  Type:   ${account.type}`);
		if (account.type === 'Trial') {
			console.log('  ** TRIAL: Can only send to verified numbers **');
		}
	} catch (e: any) {
		console.log(`  ERROR: ${e.message}`);
	}

	// Numbers in account
	console.log('\nPhone Numbers in Account:');
	try {
		const nums = await client.incomingPhoneNumbers.list();
		if (nums.length === 0) {
			console.log('  NONE — You need to buy a number at twilio.com/console/phone-numbers');
		} else {
			for (const n of nums) {
				console.log(`  ${n.phoneNumber}  SMS:${n.capabilities?.sms ? 'yes' : 'no'}  MMS:${n.capabilities?.mms ? 'yes' : 'no'}`);
			}
		}

		// Check if FROM is in the list
		if (from && nums.length > 0) {
			const match = nums.find((n: any) => n.phoneNumber === from);
			console.log(`\n  FROM ${from}: ${match ? 'FOUND in account' : 'NOT FOUND — SMS will fail with error 21660'}`);
		}
	} catch (e: any) {
		console.log(`  ERROR: ${e.message}`);
	}

	// Verified caller IDs (relevant for trial accounts)
	console.log('\nVerified Caller IDs:');
	try {
		const ids = await client.outgoingCallerIds.list();
		if (ids.length === 0) {
			console.log('  NONE');
		} else {
			for (const id of ids) {
				console.log(`  ${id.phoneNumber}  ${id.friendlyName}`);
			}
		}
		if (to) {
			const verified = ids.find((id: any) => id.phoneNumber === to);
			console.log(`\n  TO ${to}: ${verified ? 'VERIFIED' : 'NOT VERIFIED — trial accounts cannot send to this number'}`);
		}
	} catch (e: any) {
		console.log(`  ERROR: ${e.message}`);
	}

	// Rate limit status
	const { remaining } = checkRateLimit();
	console.log(`\nRate Limit: ${remaining}/${MAX_SMS_PER_HOUR} remaining this hour`);
}
