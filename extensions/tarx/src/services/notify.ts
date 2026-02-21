/**
 * TARX Notify — Notification routing (log, thinking tab, SMS).
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';

// Load .env from repo root
config({ path: resolve(__dirname, '../../../../.env') });

const LOG_DIR = resolve(homedir(), '.tarx');
const LOG_FILE = resolve(LOG_DIR, 'dispatch.log');
const MAX_SMS_PER_HOUR = 10;

// SMS rate tracking
const smsTimestamps: number[] = [];

// Lazy Twilio client
let twilioClient: any = null;
function getTwilio(): any {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    } catch (e: any) {
      logToFile('warn', `Twilio init failed: ${e.message}`);
    }
  }
  return twilioClient;
}

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

const LEVEL_EMOJI: Record<string, string> = {
  info: 'i',
  success: 'OK',
  warning: '!!',
  blocked: 'BLOCKED',
  error: 'ERR',
};

export type NotifyLevel = 'info' | 'success' | 'warning' | 'blocked' | 'error';

async function sendSMS(level: NotifyLevel, message: string): Promise<boolean> {
  const client = getTwilio();
  if (!client || !process.env.TARX_NOTIFY_PHONE || !process.env.TWILIO_FROM) {
    logToFile('info', 'SMS skipped: Twilio not configured');
    return false;
  }

  // Rate limit check
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  // Clean old timestamps
  while (smsTimestamps.length > 0 && smsTimestamps[0] < hourAgo) {
    smsTimestamps.shift();
  }
  if (smsTimestamps.length >= MAX_SMS_PER_HOUR) {
    logToFile('warn', `SMS rate limit: ${MAX_SMS_PER_HOUR}/hour exceeded`);
    return false;
  }

  // Format SMS: "TARX {level}: {message}" — max 160 chars
  const emoji = LEVEL_EMOJI[level] || level;
  let smsBody = `TARX ${emoji}: ${message}`;
  if (smsBody.length > 160) {
    smsBody = smsBody.substring(0, 157) + '...';
  }

  try {
    await client.messages.create({
      body: smsBody,
      from: process.env.TWILIO_FROM,
      to: process.env.TARX_NOTIFY_PHONE,
    });
    smsTimestamps.push(now);
    logToFile('info', `SMS sent: ${smsBody}`);
    return true;
  } catch (e: any) {
    logToFile('error', `SMS failed: ${e.message}`);
    return false;
  }
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
      sendSMS('blocked', `REPEAT: ${message}`);
    }, 5 * 60 * 1000);
  }
}
