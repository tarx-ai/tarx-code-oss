/**
 * TARX Orchestration MCP - Crypto Utilities
 *
 * Secure encryption for API keys and sensitive data.
 * Uses AES-256-GCM for authenticated encryption.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const KEY_FILE = path.join(homedir(), '.tarx', 'master.key');

/**
 * Get or create the master encryption key
 */
function getMasterKey(): Buffer {
  // Check environment variable first
  if (process.env.TARX_MASTER_KEY) {
    return Buffer.from(process.env.TARX_MASTER_KEY, 'hex');
  }

  // Check for existing key file
  if (fs.existsSync(KEY_FILE)) {
    const keyData = fs.readFileSync(KEY_FILE, 'utf-8').trim();
    return Buffer.from(keyData, 'hex');
  }

  // Generate new key and save it
  const newKey = crypto.randomBytes(32);
  const keyDir = path.dirname(KEY_FILE);

  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }

  fs.writeFileSync(KEY_FILE, newKey.toString('hex'), { mode: 0o600 });
  return newKey;
}

const ENCRYPTION_KEY = getMasterKey();

/**
 * Encrypt an API key
 * Returns encrypted data and a hash for verification
 */
export function encryptApiKey(apiKey: string): { encrypted: string; hash: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  const combined = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;

  // Create hash for verification (last 8 chars)
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(-8);

  return { encrypted: combined, hash };
}

/**
 * Decrypt an API key
 */
export function decryptApiKey(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Verify an API key matches a hash (for validation without decryption)
 */
export function verifyKeyHash(apiKey: string, expectedHash: string): boolean {
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(-8);
  return hash === expectedHash;
}

/**
 * Generate a secure random ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}
