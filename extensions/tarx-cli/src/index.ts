#!/usr/bin/env node
/**
 * TARX CLI — Dispatch layer entry point.
 * Commands: dispatch, status, log, heal, notify, taxonomy, strategy
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { dispatch } from './dispatch';
import { tick } from './heartbeat';
import { generateDailyBrief, generateWeeklyDigest } from './briefing';
import { postTweet, getUserTimeline, searchTweets, verifyConnection } from './x-api';
import { callXAI, verifyXAI } from './xai-api';
import { greet } from './greeting';
import { withSpinner, printRecovery, suggestNext } from './feedback';
import { stream as runStream } from './stream';

// Load .env from repo root
const envPath = resolve(__dirname, '../../../.env');
config({ path: envPath });

const TARX_ROOT = resolve(homedir(), 'Desktop/tarx-code-oss');
const LOG_FILE = resolve(homedir(), '.tarx/dispatch.log');

// Resolve tarx extension services (compiled output)
const SERVICES_DIR = resolve(__dirname, '../../tarx/out/services');

function loadService(name: string): any {
  const modulePath = resolve(SERVICES_DIR, `${name}.js`);
  if (!existsSync(modulePath)) {
    console.error(`Service not found: ${modulePath}`);
    console.error('Run: cd ~/Desktop/tarx-code-oss && yarn compile');
    process.exit(1);
  }
  return require(modulePath);
}

const [,, command, ...args] = process.argv;

async function main(): Promise<void> {
  // Sentient greeting: show on bare invocation or before any command
  if (!command) {
    await greet();
    return;
  }

  switch (command) {
    case 'dispatch': {
      const prompt = args.join(' ');
      if (!prompt) {
        console.error('Usage: tarx dispatch <prompt>');
        process.exit(1);
      }
      const result = await withSpinner('Dispatching to Claude Code', () => dispatch(prompt));
      console.log(`\n--- Dispatch ${result.success ? 'OK' : 'FAILED'} (${result.duration_ms}ms) ---`);
      suggestNext('dispatch');
      process.exit(result.success ? 0 : 1);
    }

    case 'status': {
      console.log('TARX System Status');
      console.log('==================');

      const ports = [
        { port: 11435, name: 'Inference  ' },
        { port: 11436, name: 'Mesh       ' },
        { port: 11437, name: 'Embeddings ' },
        { port: 11438, name: 'MCP Core   ' },
      ];

      for (const { port, name } of ports) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
          clearTimeout(timeout);
          console.log(`  ${name} :${port}  ${res.ok ? 'UP' : 'DOWN (' + res.status + ')'}`);
        } catch {
          console.log(`  ${name} :${port}  --`);
        }
      }

      // Circuit breaker status
      try {
        const breaker = loadService('circuitBreaker');
        const status = breaker.getStatus();
        console.log('');
        console.log('Circuit Breaker:');
        console.log(`  Active entries:       ${status.entries}`);
        console.log(`  Dispatches (last hr): ${status.dispatchesLastHour}/20`);
      } catch {
        // Services not compiled yet, skip
      }
      suggestNext('status');
      break;
    }

    case 'log': {
      if (!existsSync(LOG_FILE)) {
        console.log('No dispatch log yet.');
        break;
      }
      const n = args[0] || '50';
      const child = spawn('tail', ['-f', '-n', n, LOG_FILE], { stdio: 'inherit' });
      child.on('error', (e) => console.error(`Failed: ${e.message}`));
      // Keep running until Ctrl+C
      process.on('SIGINT', () => { child.kill(); process.exit(0); });
      await new Promise(() => {}); // block forever
      break;
    }

    case 'heal': {
      const { SelfHealEngine } = loadService('selfHeal');
      const engine = new SelfHealEngine(dispatch);

      if (args.length > 0) {
        const errorMessage = args.join(' ');
        const result = await withSpinner(`Healing: ${errorMessage}`, () => engine.handleError(errorMessage));
        console.log('\nResult:', JSON.stringify(result, null, 2));
      } else {
        await withSpinner('Running health check cycle', () => engine.healthCheck());
      }
      suggestNext('heal');
      break;
    }

    case 'notify': {
      // --check: run diagnostic
      if (args.includes('--check')) {
        const { notifyCheck } = loadService('notify');
        await notifyCheck();
        break;
      }

      // First arg can be a level: --level=success
      let level = 'success';
      const msgParts: string[] = [];
      for (const a of args) {
        if (a.startsWith('--level=')) {
          level = a.split('=')[1];
        } else {
          msgParts.push(a);
        }
      }
      const message = msgParts.join(' ');
      if (!message) {
        console.error('Usage: tarx notify [--level=info|success|warning|blocked] <message>');
        console.error('       tarx notify --check   (run SMS diagnostic)');
        process.exit(1);
      }
      const { notify: notifyFn } = loadService('notify');
      await notifyFn(level, message);
      break;
    }

    case 'taxonomy': {
      const { printTaxonomyTree } = loadService('taxonomy');
      console.log(printTaxonomyTree());
      break;
    }

    case 'strategy': {
      const strategyName = args[0];
      const { printStrategy, listStrategies } = loadService('strategyCompositor');
      if (!strategyName) {
        console.log('Available strategies:');
        for (const name of listStrategies()) {
          console.log(`  - ${name}`);
        }
        console.log('\nUsage: tarx strategy <name>');
      } else {
        console.log(printStrategy(strategyName));
      }
      break;
    }

    case 'brief': {
      const weekly = args.includes('--weekly') || args.includes('-w');
      const sms = args.includes('--sms');
      const brief = await withSpinner(
        weekly ? 'Generating weekly digest' : 'Generating daily brief',
        () => weekly ? generateWeeklyDigest() : generateDailyBrief()
      );
      console.log(brief);
      if (sms) {
        try {
          const { notify: notifyFn } = loadService('notify');
          await notifyFn('info', brief);
          console.log('\nSMS sent.');
        } catch (e: any) {
          console.error(`SMS failed: ${e.message}`);
        }
      }
      suggestNext('brief');
      break;
    }

    case 'weekly': {
      // Alias: tarx weekly → tarx brief --weekly --sms
      const digest = await generateWeeklyDigest();
      console.log(digest);
      try {
        const { notify: notifyFn } = loadService('notify');
        await notifyFn('info', digest);
        console.log('\nSMS sent.');
      } catch (e: any) {
        console.error(`SMS failed: ${e.message}`);
      }
      break;
    }

    case 'priorities': {
      const priPath = resolve(homedir(), '.tarx/priorities.jsonl');
      const { readFileSync: rfs, writeFileSync: wfs, mkdirSync: mks } = require('fs');
      const sub = args[0];

      // Sub-command: tarx priorities add "title" --urgency today --owner john
      if (sub === 'add') {
        const titleParts: string[] = [];
        let urgency = 'today';
        let owner = 'john';
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--urgency' && args[i + 1]) { urgency = args[++i]; continue; }
          if (args[i] === '--owner' && args[i + 1]) { owner = args[++i]; continue; }
          titleParts.push(args[i]);
        }
        const title = titleParts.join(' ').replace(/^["']|["']$/g, '');
        if (!title) { console.error('Usage: tarx priorities add "title" [--urgency now|today|this_week] [--owner john|tarx]'); process.exit(1); }

        // Read existing to auto-generate ID
        let items: any[] = [];
        if (existsSync(priPath)) {
          const raw = rfs(priPath, 'utf-8').trim();
          if (raw) items = raw.split('\n').map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        }
        let maxNum = 0;
        for (const p of items) { const m = p.id?.match(/^p-(\d+)$/); if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; } }
        const id = `p-${String(maxNum + 1).padStart(3, '0')}`;
        const now = new Date().toISOString();
        const entry = { ts: now, id, title, status: 'active', owner, urgency, context: '', last_updated: now };

        const dir = resolve(homedir(), '.tarx');
        if (!existsSync(dir)) mks(dir, { recursive: true });
        const { appendFileSync: afs } = require('fs');
        afs(priPath, JSON.stringify(entry) + '\n');
        console.log(`Added ${id}: ${title} (${urgency}, ${owner})`);
        break;
      }

      // Sub-command: tarx priorities done p-001
      if (sub === 'done') {
        const targetId = args[1];
        if (!targetId) { console.error('Usage: tarx priorities done <id>'); process.exit(1); }

        if (!existsSync(priPath)) { console.error('No priorities file.'); process.exit(1); }
        const raw = rfs(priPath, 'utf-8').trim();
        const items = raw.split('\n').map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

        const target = items.find((p: any) => p.id === targetId);
        if (!target) { console.error(`Priority ${targetId} not found.`); process.exit(1); }
        if (target.status === 'done') { console.log(`${targetId} is already done.`); break; }

        target.status = 'done';
        target.last_updated = new Date().toISOString();
        wfs(priPath, items.map((p: any) => JSON.stringify(p)).join('\n') + '\n');
        console.log(`Marked ${targetId} done: ${target.title}`);
        break;
      }

      // Default: list priorities
      if (!existsSync(priPath)) {
        console.log('No priorities file yet. Create ~/.tarx/priorities.jsonl');
        break;
      }
      const raw = rfs(priPath, 'utf-8').trim();
      if (!raw) { console.log('No priorities.'); break; }
      const items = raw.split('\n').map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const active = items.filter((p: any) => p.status === 'active');
      const blocked = items.filter((p: any) => p.status === 'blocked');
      const done = items.filter((p: any) => p.status === 'done');
      console.log(`Priorities: ${active.length} active, ${blocked.length} blocked, ${done.length} done\n`);
      for (const p of active) {
        const tag = p.urgency === 'now' ? '!!!' : p.urgency === 'today' ? ' ! ' : '   ';
        console.log(`  [${tag}] ${p.id} ${p.title} (${p.owner})`);
      }
      if (blocked.length > 0) {
        console.log('');
        for (const p of blocked) {
          console.log(`  [BLK] ${p.id} ${p.title} — ${p.context || ''}`);
        }
      }
      if (done.length > 0) {
        console.log(`\n  Done: ${done.map((p: any) => p.id).join(', ')}`);
      }
      break;
    }

    case 'wake': {
      // Manually trigger one heartbeat tick (immediate)
      console.log('Triggering heartbeat tick...');
      await tick();
      console.log('Tick complete.');
      break;
    }

    case 'stream': {
      runStream();
      // Keep process alive for polling
      await new Promise(() => {});
      break;
    }

    case 'think': {
      // Tail the thinking log — TARX's stream of consciousness
      const thinkLog = resolve(homedir(), '.tarx/thinking.log');
      if (!existsSync(thinkLog)) {
        console.log('No thoughts yet. TARX is sleeping.');
        break;
      }

      const follow = args.includes('--follow') || args.includes('-f');
      const lines = args.find(a => /^\d+$/.test(a)) || '20';

      const tailArgs = ['-n', lines];
      if (follow) tailArgs.push('-f');
      tailArgs.push(thinkLog);

      const child = spawn('tail', tailArgs, { stdio: 'inherit' });
      child.on('error', (e) => console.error(`Failed: ${e.message}`));

      if (follow) {
        process.on('SIGINT', () => { child.kill(); process.exit(0); });
        await new Promise(() => {}); // block forever in follow mode
      } else {
        await new Promise<void>((res) => child.on('close', () => res()));
      }
      break;
    }

    case 'tweet': {
      const text = args.join(' ');
      if (!text) {
        console.error('Usage: tarx tweet <message>');
        process.exit(1);
      }
      const tweetId = await postTweet(text);
      console.log(`Tweet posted: https://x.com/i/status/${tweetId}`);
      break;
    }

    case 'timeline': {
      let username = args[0] || '';
      if (!username) {
        console.error('Usage: tarx timeline <@username> [limit]');
        process.exit(1);
      }
      username = username.replace(/^@/, '');
      const tlLimit = parseInt(args[1], 10) || 10;
      const tweets = await getUserTimeline(username, tlLimit);
      if (tweets.length === 0) {
        console.log(`No recent tweets from @${username}`);
      } else {
        for (const t of tweets) {
          const date = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';
          const likes = t.public_metrics?.like_count ?? 0;
          const rts = t.public_metrics?.retweet_count ?? 0;
          console.log(`[${date}] ${t.text}`);
          console.log(`  ${likes} likes, ${rts} RTs | id:${t.id}\n`);
        }
      }
      break;
    }

    case 'xsearch': {
      const query = args.join(' ');
      if (!query) {
        console.error('Usage: tarx xsearch <query> — search recent tweets');
        process.exit(1);
      }
      const results = await searchTweets(query);
      if (results.length === 0) {
        console.log('No results.');
      } else {
        for (const t of results) {
          const date = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';
          console.log(`[${date}] @${t.author_id}: ${t.text}`);
          console.log(`  id:${t.id}\n`);
        }
      }
      break;
    }

    case 'xstatus': {
      console.log('Verifying X API connection...');
      const status = await verifyConnection();
      console.log(`  Bearer token (read):  ${status.bearer ? 'OK' : 'MISSING/INVALID'}`);
      console.log(`  User token (write):   ${status.user ? 'OK' : 'MISSING/INVALID'}`);
      const xaiOk = await verifyXAI();
      console.log(`  xAI API key:          ${xaiOk ? 'OK' : 'MISSING/INVALID'}`);
      break;
    }

    case 'xai': {
      const xaiPrompt = args.join(' ');
      if (!xaiPrompt) {
        console.error('Usage: tarx xai <prompt>');
        console.error('       tarx xai --model grok-3 "prompt here"');
        process.exit(1);
      }
      // Parse optional --model flag
      let xaiModel = 'grok-3';
      const promptParts: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--model' && args[i + 1]) { xaiModel = args[++i]; continue; }
        promptParts.push(args[i]);
      }
      const response = await callXAI(promptParts.join(' '), { model: xaiModel });
      console.log(response);
      break;
    }

    default: {
      console.log(`TARX CLI v1.2.0 — Dispatch Layer

Usage: tarx <command> [args]

Commands:
  dispatch <prompt>    Send prompt to Claude Code, stream output
  status               Health check all services
  log [n]              Tail dispatch log (default: last 50 lines)
  heal [error]         Run self-healing cycle or fix specific error
  notify <message>     Send notification via all channels
  brief [--weekly] [--sms]  Daily briefing (add --sms to send via SMS)
  weekly                    Weekly digest + SMS (alias for brief --weekly --sms)
  priorities                List priorities from ~/.tarx/priorities.jsonl
  priorities add "title"    Add priority [--urgency now|today|this_week] [--owner john|tarx]
  priorities done <id>      Mark priority done (e.g. tarx priorities done p-001)
  taxonomy             Print error taxonomy tree
  strategy [name]      Print strategy definition(s)
  wake                 Trigger one heartbeat tick (immediate)
  think [n] [--follow] Tail thinking log (TARX consciousness stream)
  tweet <message>      Post a tweet via X API v2
  timeline <@user> [n] Read user's recent tweets (default 10)
  xsearch <query>      Search recent tweets (last 7 days)
  xstatus              Verify X API + xAI credentials
  xai <prompt>         Call xAI (Grok) chat completions [--model grok-3]

Environment:
  .env at ${envPath}
  Log at ${LOG_FILE}
  Services at ${SERVICES_DIR}
`);
      if (command) {
        console.error(`Unknown command: ${command}`);
        console.log('\n  Run \x1b[1mtarx\x1b[0m with no args for a live status greeting.\n');
        process.exit(1);
      }
    }
  }
}

main().catch((e) => {
  printRecovery(e);
  process.exit(1);
});
