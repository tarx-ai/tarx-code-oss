#!/usr/bin/env node
// Suppress dotenv v17 auto-inject logging (must run before require('dotenv'))
process.env.DOTENV_CONFIG_QUIET = 'true';
/**
 * TARX CLI — Dispatch layer entry point.
 * Commands: dispatch, status, log, heal, notify, taxonomy, strategy
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { spawn, execSync } from 'child_process';
import { homedir } from 'os';
import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { dispatch } from './dispatch';
import { tick } from './heartbeat';
import { generateDailyBrief, generateWeeklyDigest } from './briefing';
import { postTweet, getUserTimeline, searchTweets, verifyConnection } from './x-api';
import { callXAI, verifyXAI } from './xai-api';
import { greet } from './greeting';
import { withSpinner, thinkingSpinner, promptLabel, inputHint, printRecovery, suggestNext, printHelp, printCommandHelp } from './feedback';
import { stream as runStream } from './stream';
import { getStatus as getMeshStatus, checkHealth as checkMeshHealth } from './services/mesh';
import { embedQuery } from './services/embeddings';

// Load .env from repo root
const envPath = resolve(__dirname, '../../../.env');
config({ path: envPath, quiet: true });

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
  // Sentient greeting: show on bare invocation
  if (!command) {
    await greet();
    return;
  }

  // Help flags — handled before switch so --help never falls to "unknown command"
  if (command === '--help' || command === '-h' || command === 'help') {
    printHelp();
    return;
  }

  // Per-command help: tarx <cmd> --help / -h
  if (args.includes('--help') || args.includes('-h')) {
    if (!printCommandHelp(command)) {
      printHelp();
    }
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
        { port: 11436, name: 'Supercomp  ' },
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

    // ─── BUG FIX: update — fetch JSON from API, not HTML ───
    case 'update': {
      const BRAND = '\x1b[35m';
      const RST = '\x1b[0m';
      const GREEN = '\x1b[32m';
      const DIM = '\x1b[2m';

      console.log(`\n  ${BRAND}⠸${RST} Checking for updates...`);

      // Try nextjs-ai-t1 API (known good endpoint)
      const endpoints = [
        'https://nextjs-ai-t1-tarx.vercel.app/api/cli/latest',
        'http://localhost:11435/health', // fallback: just show current
      ];

      let latestVersion: string | null = null;
      for (const ep of endpoints) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(ep, { signal: controller.signal });
          clearTimeout(timeout);
          if (res.ok) {
            const text = await res.text();
            // Guard: reject HTML responses
            if (text.trim().startsWith('<') || text.trim().startsWith('<!')) {
              continue; // skip HTML, try next endpoint
            }
            const json = JSON.parse(text);
            latestVersion = json.version || json.tag || null;
            if (latestVersion) break;
          }
        } catch {
          continue;
        }
      }

      const currentVersion = '1.2.0';
      if (latestVersion) {
        if (latestVersion === currentVersion) {
          console.log(`  ${GREEN}✓${RST} Up to date — v${currentVersion}`);
        } else {
          console.log(`  Current: v${currentVersion}`);
          console.log(`  Latest:  v${latestVersion}`);
          console.log(`\n  ${DIM}Run: curl -fsSL tarx.com/install | sh${RST}`);
        }
      } else {
        console.log(`  Current: v${currentVersion}`);
        console.log(`  ${DIM}Could not reach update server. You're on v${currentVersion}.${RST}`);
      }
      console.log('');
      suggestNext('update');
      break;
    }

    // ─── BUG FIX: search — query knowledge DB, format results ───
    case 'search': {
      const query = args.join(' ');
      if (!query) {
        console.error('Usage: tarx search <query>');
        console.error('  Searches your local knowledge base (RAG embeddings)');
        process.exit(1);
      }

      const BRAND = '\x1b[35m';
      const DIM = '\x1b[2m';
      const BOLD = '\x1b[1m';
      const RST = '\x1b[0m';

      // Step 1: Generate query embedding
      let queryVec: number[];
      try {
        queryVec = await withSpinner(`Embedding query: "${query}"`, () => embedQuery(query));
      } catch (e: any) {
        console.error(`  Embedding failed: ${e.message}`);
        console.error(`  ${DIM}Is the embedding server running on :11437?${RST}`);
        process.exit(1);
      }

      // Step 2: Query knowledge_embeddings in SQLite
      const dbPath = resolve(homedir(), 'Library/Application Support/tarx/memory.db');
      if (!existsSync(dbPath)) {
        console.log('  No knowledge database found. Upload or scan files first.');
        console.log(`  ${DIM}Expected: ${dbPath}${RST}`);
        break;
      }

      try {
        const Database = require('better-sqlite3');
        const db = new Database(dbPath, { readonly: true });

        const rows = db.prepare(`
          SELECT ke.content, ke.source_id, ke.title, ke.embedding, f.filename
          FROM knowledge_embeddings ke
          LEFT JOIN files f ON ke.source_id = f.id
          WHERE ke.embedding IS NOT NULL
          LIMIT 500
        `).all() as Array<{ content: string; source_id: string; title: string; embedding: Buffer; filename: string }>;

        if (rows.length === 0) {
          console.log('  No knowledge indexed yet. Upload or scan files first.');
          db.close();
          break;
        }

        // Cosine similarity against query vector
        const results: Array<{ text: string; score: number; file: string }> = [];
        for (const row of rows) {
          try {
            if (!row.embedding || row.embedding.length < 16) continue;
            const emb = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4);

            if (emb.length !== queryVec.length) continue;

            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < emb.length; i++) {
              dot += queryVec[i] * emb[i];
              normA += queryVec[i] * queryVec[i];
              normB += emb[i] * emb[i];
            }
            const score = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);

            results.push({
              text: (row.content || '').slice(0, 120),
              score,
              file: row.filename || row.title || `source:${row.source_id}`,
            });
          } catch {
            continue;
          }
        }

        db.close();

        // Sort by score, show top 5
        results.sort((a, b) => b.score - a.score);
        const top = results.slice(0, 5);

        if (top.length === 0 || top[0].score < 0.3) {
          console.log(`\n  No relevant results for "${query}"`);
          console.log(`  ${DIM}${results.length} chunks searched, best score: ${results[0]?.score.toFixed(3) || 'N/A'}${RST}`);
        } else {
          console.log(`\n  ${BOLD}Results for "${query}"${RST}  ${DIM}(${results.length} chunks searched)${RST}\n`);
          for (let i = 0; i < top.length; i++) {
            const r = top[i];
            if (r.score < 0.3) break;
            const bar = '\u2588'.repeat(Math.round(r.score * 10));
            console.log(`  ${BRAND}${i + 1}.${RST} ${r.file} ${DIM}(${r.score.toFixed(3)})${RST} ${DIM}${bar}${RST}`);
            console.log(`     ${r.text.replace(/\n/g, ' ').trim()}`);
            console.log('');
          }
        }
      } catch (e: any) {
        if (e.code === 'MODULE_NOT_FOUND') {
          console.log(`  ${DIM}Search requires better-sqlite3. Install:${RST}`);
          console.log(`  ${BOLD}cd extensions/tarx-cli && npm install better-sqlite3${RST}`);
        } else {
          console.error(`  Search error: ${e.message}`);
        }
      }
      suggestNext('search');
      break;
    }

    // ─── BUG FIX: mesh — use correct /health endpoint ───
    case 'mesh': {
      const BRAND = '\x1b[35m';
      const GREEN = '\x1b[32m';
      const RED = '\x1b[31m';
      const DIM = '\x1b[2m';
      const BOLD = '\x1b[1m';
      const RST = '\x1b[0m';

      console.log(`\n  ${BOLD}Supercomputer${RST}\n`);

      const health = await checkMeshHealth();
      if (!health.healthy) {
        console.log(`  ${RED}●${RST} Supercomputer offline — ${health.error || 'unreachable'}`);
        console.log(`  ${DIM}Expected on :11436. Run tarx-mesh binary.${RST}\n`);
        break;
      }

      console.log(`  ${GREEN}●${RST} Supercomputer online :11436`);
      if (health.peerId) console.log(`  ${DIM}Peer ID:${RST} ${health.peerId}`);
      console.log(`  ${DIM}Peers:${RST}   ${health.peers || 0}`);

      // Try to get full status (now uses /health too)
      const status = await getMeshStatus();
      if (status) {
        if (status.listening && status.listening.length > 0) {
          console.log(`  ${DIM}Listening:${RST} ${status.listening.join(', ')}`);
        }
      }
      console.log('');
      suggestNext('mesh');
      break;
    }

    // ─── Local AI + RAG commands ───
    case 'ask': {
      const { ask } = await import('./commands/ask');
      await ask(args);
      suggestNext('ask');
      break;
    }

    case 'learn': {
      const { learn } = await import('./commands/learn');
      await learn(args);
      suggestNext('learn');
      break;
    }

    case 'recall': {
      const { recall } = await import('./commands/recall');
      await recall(args);
      suggestNext('recall');
      break;
    }

    case 'context': {
      const { context } = await import('./commands/context');
      await context();
      suggestNext('context');
      break;
    }

    case 'watch': {
      const { watch } = await import('./commands/watch');
      await watch(args);
      suggestNext('watch');
      break;
    }

    case 'index': {
      const { indexStats } = await import('./commands/indexStats');
      await indexStats();
      suggestNext('index');
      break;
    }

    case 'review': {
      const { review } = await import('./commands/review');
      await review();
      suggestNext('review');
      break;
    }

    case 'remember': {
      const { remember } = await import('./commands/remember');
      await remember(args);
      suggestNext('remember');
      break;
    }

    case 'forget': {
      const { forget } = await import('./commands/forget');
      await forget(args);
      suggestNext('forget');
      break;
    }

    case 'explain': {
      const { explain } = await import('./commands/explain');
      await explain(args);
      suggestNext('explain');
      break;
    }

    // ─── Claude Code use cases: build/refactor/fix/test/document/plan ───
    case 'build':
    case 'refactor':
    case 'fix':
    case 'test':
    case 'document':
    case 'plan': {
      // --e2e-probe: heartbeat daemon verifies routing without dispatching
      if (args.includes('--e2e-probe')) {
        console.log(`${command}: routed OK`);
        break;
      }
      const taskArg = args.join(' ');
      const prompts: Record<string, string> = {
        build: taskArg || 'Build the project. Run yarn compile, fix any errors.',
        refactor: taskArg ? `Refactor: ${taskArg}` : 'Identify code that needs refactoring and improve it.',
        fix: taskArg ? `Fix this bug: ${taskArg}` : 'Run tests, find failures, fix them.',
        test: taskArg ? `Write tests for: ${taskArg}` : 'Run the test suite and report results.',
        document: taskArg ? `Document: ${taskArg}` : 'Generate documentation for recent changes.',
        plan: taskArg ? `Plan: ${taskArg}` : 'Analyze the codebase and create an implementation plan.',
      };

      const prompt = prompts[command];
      console.log(`\n  \x1b[35m⠸\x1b[0m tarx ${command}: ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}\n`);

      const result = await withSpinner(`Running ${command}`, () => dispatch(prompt));
      console.log(`\n--- ${command} ${result.success ? 'OK' : 'FAILED'} (${result.duration_ms}ms) ---`);
      suggestNext(command);
      process.exit(result.success ? 0 : 1);
    }

    case 'vs':
    case '--compare': {
      const { header: fmtHeader, compareTable, footer: fmtFooter, brand: fmtBrand } = require('./format');
      fmtHeader('Why Local?');
      console.log();
      console.log(`  ${fmtBrand.bold('TARX CLI vs Cloud AI Coding Tools')}`);
      console.log();

      compareTable(
        ['', 'TARX', 'Cloud AI'],
        [
          ['Price', fmtBrand.green('Free'), '$20/mo'],
          ['Your code leaves your machine', fmtBrand.green('No'), fmtBrand.red('Yes')],
          ['Works offline', fmtBrand.green('Yes'), fmtBrand.red('No')],
          ['Rate limits', fmtBrand.green('None'), fmtBrand.yellow('Yes')],
          ['Telemetry', fmtBrand.green('None'), fmtBrand.yellow('Yes')],
          ['Custom model fine-tuning', fmtBrand.green('Yes'), fmtBrand.red('No')],
          ['Mesh compute boost', fmtBrand.green('Yes'), fmtBrand.red('No')],
        ]
      );

      console.log();
      console.log(`  ${fmtBrand.bold('Your code. Your machine. Your AI.')}`);
      fmtFooter('local', { version: '1.2.0' });
      break;
    }

    default: {
      console.error(`\n  Unknown command: ${command}`);
      console.log('  Run \x1b[1mtarx --help\x1b[0m for usage.\n');
      process.exit(1);
    }
  }
}

main().catch((e) => {
  printRecovery(e);
  process.exit(1);
});
