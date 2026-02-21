/**
 * TARX Dispatch — Core dispatch function.
 * Spawns Claude Code as a child process to execute prompts.
 */

import { spawn } from 'child_process';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const LOG_DIR = resolve(homedir(), '.tarx');
const LOG_FILE = resolve(LOG_DIR, 'dispatch.log');
const CWD = resolve(homedir(), 'Desktop/tarx-code-oss');
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function log(entry: string): void {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  appendFileSync(LOG_FILE, `[${timestamp}] ${entry}\n`);
}

export interface DispatchResult {
  success: boolean;
  output: string;
  duration_ms: number;
  exit_code: number | null;
}

export async function dispatch(prompt: string): Promise<DispatchResult> {
  const start = Date.now();
  log(`DISPATCH START: ${prompt.substring(0, 200)}`);

  return new Promise((resolve) => {
    let output = '';
    let killed = false;

    const proc = spawn('claude', ['-p', prompt], {
      cwd: CWD,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 5000);
    }, TIMEOUT_MS);

    proc.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      const duration_ms = Date.now() - start;
      const success = code === 0 && !killed;

      log(`DISPATCH END: exit=${code} killed=${killed} duration=${duration_ms}ms`);
      log(`OUTPUT (first 500): ${output.substring(0, 500)}`);

      resolve({ success, output: output.trim(), duration_ms, exit_code: code });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      const duration_ms = Date.now() - start;
      log(`DISPATCH ERROR: ${err.message}`);
      resolve({ success: false, output: err.message, duration_ms, exit_code: null });
    });
  });
}

// CLI entry: if run directly, take args and dispatch
if (require.main === module) {
  const prompt = process.argv.slice(2).join(' ');
  if (!prompt) {
    console.error('Usage: dispatch <prompt>');
    process.exit(1);
  }
  dispatch(prompt).then((result) => {
    process.exit(result.success ? 0 : 1);
  });
}
