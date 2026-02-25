/**
 * tarx stream — unified real-time activity feed
 * Tails thinking.log + orch log + priorities.jsonl, color-coded by event type.
 */

import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, statSync, readFileSync, openSync, readSync, closeSync } from 'fs';

const HOME = homedir();
const FILES = [
  { path: resolve(HOME, '.tarx/thinking.log'), label: 'THINK' },
  { path: resolve(HOME, 'Library/Application Support/tarx/daemon.log'), label: 'DAEMON' },
  { path: resolve(HOME, '.tarx/priorities.jsonl'), label: 'PRI' },
  { path: resolve(HOME, '.tarx/dispatch.log'), label: 'DISPATCH' },
];

// ANSI colors (no chalk import needed at runtime — chalk v5 is ESM-only)
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

interface Tailer {
  path: string;
  label: string;
  offset: number;
}

function highlight(line: string): string {
  // xAI / Grok calls
  if (/xai|grok/i.test(line)) return `${C.magenta}${C.bold}⚡ ${line}${C.reset}`;
  // Qwen consolidation
  if (/qwen|consolidat/i.test(line)) return `${C.cyan}🧠 ${line}${C.reset}`;
  // SMS / notify
  if (/sms|notify|twilio/i.test(line)) return `${C.green}📱 ${line}${C.reset}`;
  // Daemon tick
  if (/tick|heartbeat|daemon/i.test(line)) return `${C.blue}💓 ${line}${C.reset}`;
  // Priority urgency=now
  if (/urgency.*now|!!!/i.test(line)) return `${C.red}${C.bold}🔴 ${line}${C.reset}`;
  // Augment / review
  if (/augment:|review/i.test(line)) return `${C.yellow}🔍 ${line}${C.reset}`;
  // Blocked
  if (/blocked|error|fail/i.test(line)) return `${C.red}❌ ${line}${C.reset}`;
  // Status
  if (/cc-status|complete/i.test(line)) return `${C.green}✓ ${line}${C.reset}`;
  return `${C.dim}  ${line}${C.reset}`;
}

function readNewLines(tailer: Tailer): string[] {
  if (!existsSync(tailer.path)) return [];
  const stat = statSync(tailer.path);
  if (stat.size <= tailer.offset) return [];

  const len = stat.size - tailer.offset;
  const buf = Buffer.alloc(len);
  const fd = openSync(tailer.path, 'r');
  readSync(fd, buf, 0, len, tailer.offset);
  closeSync(fd);
  tailer.offset = stat.size;

  return buf.toString('utf-8').split('\n').filter(l => l.trim());
}

export function stream(): void {
  console.log(`${C.bold}${C.cyan}━━━ TARX STREAM ━━━${C.reset}  ${C.dim}Ctrl+C to exit${C.reset}\n`);

  // Init tailers at end of each file
  const tailers: Tailer[] = FILES.map(f => ({
    path: f.path,
    label: f.label,
    offset: existsSync(f.path) ? statSync(f.path).size : 0,
  }));

  // Show last 5 lines from thinking.log as context
  const thinkPath = FILES[0].path;
  if (existsSync(thinkPath)) {
    const lines = readFileSync(thinkPath, 'utf-8').trim().split('\n').slice(-5);
    console.log(`${C.dim}── recent thoughts ──${C.reset}`);
    for (const l of lines) console.log(highlight(l));
    console.log('');
  }

  const poll = () => {
    for (const t of tailers) {
      const lines = readNewLines(t);
      for (const line of lines) {
        const tag = `${C.dim}[${t.label}]${C.reset}`;
        console.log(`${tag} ${highlight(line)}`);
      }
    }
  };

  const interval = setInterval(poll, 2000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(`\n${C.dim}Stream ended.${C.reset}`);
    process.exit(0);
  });
}
