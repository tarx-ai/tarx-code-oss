/**
 * TARX Circuit Breaker — Prevents infinite fix loops.
 * Tracks dispatch attempts per error signature and enforces rate limits.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';

const STATE_DIR = resolve(homedir(), '.tarx');
const STATE_FILE = resolve(STATE_DIR, 'breaker.json');
const MAX_PER_ERROR = 3;
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const MAX_DISPATCHES_PER_HOUR = 20;

interface BreakerEntry {
  count: number;
  lastAttempt: number;
  firstAttempt: number;
}

interface BreakerState {
  entries: Record<string, BreakerEntry>;
  globalDispatchTimes: number[];
}

export interface BreakerCheck {
  allowed: boolean;
  reason?: string;
}

function ensureDir(): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true });
  }
}

function loadState(): BreakerState {
  ensureDir();
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { entries: {}, globalDispatchTimes: [] };
  }
}

function saveState(state: BreakerState): void {
  ensureDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function makeSignature(taxonomyId: string, errorMessage: string): string {
  const hash = createHash('sha256').update(errorMessage.substring(0, 100)).digest('hex').substring(0, 12);
  return `${taxonomyId}:${hash}`;
}

export function check(taxonomyId: string, errorMessage: string): BreakerCheck {
  const state = loadState();
  const now = Date.now();
  const sig = makeSignature(taxonomyId, errorMessage);

  // Clean old global dispatch times (only keep last hour)
  state.globalDispatchTimes = state.globalDispatchTimes.filter((t) => now - t < COOLDOWN_MS);

  // Global rate limit
  if (state.globalDispatchTimes.length >= MAX_DISPATCHES_PER_HOUR) {
    return { allowed: false, reason: `Global rate limit: ${MAX_DISPATCHES_PER_HOUR} dispatches/hour exceeded` };
  }

  // Per-error check
  const entry = state.entries[sig];
  if (entry) {
    // If cooldown has passed, reset
    if (now - entry.lastAttempt >= COOLDOWN_MS) {
      delete state.entries[sig];
      saveState(state);
      return { allowed: true };
    }

    if (entry.count >= MAX_PER_ERROR) {
      const cooldownRemaining = Math.ceil((COOLDOWN_MS - (now - entry.lastAttempt)) / 60000);
      return {
        allowed: false,
        reason: `Max ${MAX_PER_ERROR} attempts for ${taxonomyId}. Cooldown: ${cooldownRemaining}min remaining`,
      };
    }
  }

  return { allowed: true };
}

export function record(taxonomyId: string, errorMessage: string): void {
  const state = loadState();
  const now = Date.now();
  const sig = makeSignature(taxonomyId, errorMessage);

  if (!state.entries[sig]) {
    state.entries[sig] = { count: 0, lastAttempt: 0, firstAttempt: now };
  }
  state.entries[sig].count++;
  state.entries[sig].lastAttempt = now;

  state.globalDispatchTimes.push(now);

  saveState(state);
}

export function reset(taxonomyId?: string, errorMessage?: string): void {
  const state = loadState();

  if (taxonomyId && errorMessage) {
    const sig = makeSignature(taxonomyId, errorMessage);
    delete state.entries[sig];
  } else if (taxonomyId) {
    // Reset all entries for this taxonomy ID
    for (const key of Object.keys(state.entries)) {
      if (key.startsWith(taxonomyId + ':')) {
        delete state.entries[key];
      }
    }
  } else {
    // Reset everything
    state.entries = {};
    state.globalDispatchTimes = [];
  }

  saveState(state);
}

export function getStatus(): { entries: number; dispatchesLastHour: number } {
  const state = loadState();
  const now = Date.now();
  const recentDispatches = state.globalDispatchTimes.filter((t) => now - t < COOLDOWN_MS);
  return {
    entries: Object.keys(state.entries).length,
    dispatchesLastHour: recentDispatches.length,
  };
}
