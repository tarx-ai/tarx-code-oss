#!/usr/bin/env node
/**
 * TARX CLI — Dispatch layer entry point.
 * Commands: dispatch, status, log, heal, notify, taxonomy, strategy
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { dispatch } from './dispatch';

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
  switch (command) {
    case 'dispatch': {
      const prompt = args.join(' ');
      if (!prompt) {
        console.error('Usage: tarx dispatch <prompt>');
        process.exit(1);
      }
      const result = await dispatch(prompt);
      console.log(`\n--- Dispatch ${result.success ? 'OK' : 'FAILED'} (${result.duration_ms}ms) ---`);
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
        // Heal a specific error
        const errorMessage = args.join(' ');
        console.log(`Healing: ${errorMessage}\n`);
        const result = await engine.handleError(errorMessage);
        console.log('\nResult:', JSON.stringify(result, null, 2));
      } else {
        // Health check cycle
        await engine.healthCheck();
      }
      break;
    }

    case 'notify': {
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

    default: {
      console.log(`TARX CLI v1.0.0 — Dispatch Layer

Usage: tarx <command> [args]

Commands:
  dispatch <prompt>    Send prompt to Claude Code, stream output
  status               Health check all services
  log [n]              Tail dispatch log (default: last 50 lines)
  heal [error]         Run self-healing cycle or fix specific error
  notify <message>     Send notification via all channels
  taxonomy             Print error taxonomy tree
  strategy [name]      Print strategy definition(s)

Environment:
  .env at ${envPath}
  Log at ${LOG_FILE}
  Services at ${SERVICES_DIR}
`);
      if (command) {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    }
  }
}

main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
