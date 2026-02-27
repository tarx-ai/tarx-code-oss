#!/usr/bin/env node
/**
 * TARX CLI - Local AI Command Line Interface
 * Entry point and argument parsing
 */

import { Command } from 'commander';
import { startRepl } from './repl';
import { checkHealth, getFullStatus } from './services/health';
import { chat } from './services/inference';
import { version } from '../package.json';

const program = new Command();

program
  .name('tarx')
  .description('TARX CLI - Local AI running on your machine')
  .version(version)
  .argument('[prompt]', 'Your prompt for one-shot mode')
  .option('-p, --print', 'Print response and exit (pipe-friendly)')
  .option('--health', 'Quick health check')
  .option('--status', 'Full system status')
  .option('--no-stream', 'Disable streaming output')
  .option('--max-tokens <n>', 'Max response tokens', '2000')
  .option('--json', 'Output as JSON')
  .option('--debug', 'Enable debug output')
  .action(async (prompt, options) => {
    try {
      // Health check mode
      if (options.health) {
        const health = await checkHealth();
        if (options.json) {
          console.log(JSON.stringify(health, null, 2));
        } else {
          printHealth(health);
        }
        process.exit(health.inference.healthy ? 0 : 1);
      }

      // Status mode
      if (options.status) {
        const status = await getFullStatus();
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          printStatus(status);
        }
        process.exit(0);
      }

      // One-shot prompt mode
      if (prompt) {
        const response = await chat(prompt, {
          stream: !options.noStream && !options.print,
          maxTokens: parseInt(options.maxTokens),
          onToken: options.print ? undefined : (token: string) => process.stdout.write(token)
        });
        
        if (options.print || options.noStream) {
          console.log(response);
        } else {
          console.log(); // Newline after streamed response
        }
        process.exit(0);
      }

      // Interactive REPL mode (default)
      await startRepl();
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      if (options.debug) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Subcommands
program
  .command('chat')
  .description('Start interactive chat session')
  .option('-c, --continue', 'Continue last conversation')
  .option('-r, --resume <id>', 'Resume specific session')
  .option('--list', 'List recent sessions')
  .action(async (options) => {
    // TODO: Implement chat subcommand
    await startRepl();
  });

program
  .command('doctor')
  .description('Diagnose issues and suggest fixes')
  .action(async () => {
    console.log('Running diagnostics...');
    const health = await checkHealth();
    
    if (!health.inference.healthy) {
      console.log('❌ Inference server not responding on port 11435');
      console.log('   Fix: Ensure llama-server is running');
    }
    
    if (!health.embeddings.healthy) {
      console.log('❌ Embedding server not responding on port 11437');
      console.log('   Fix: Ensure embedding server is running');
    }
    
    if (!health.mesh.healthy) {
      console.log('⚠️  Mesh network not responding on port 11436');
      console.log('   Note: Mesh is optional for basic functionality');
    }
    
    if (health.inference.healthy && health.embeddings.healthy) {
      console.log('✅ All critical services healthy');
    }
  });

// ── Daemon subcommand group ──
const daemonCmd = program.command('daemon').description('Manage the always-on AI engine');

daemonCmd
  .command('start')
  .description('Start the daemon (inference + embeddings)')
  .option('--foreground', 'Run in foreground (don\'t fork)')
  .action(async (options) => {
    const { isDaemonRunning } = await import('./daemon-client');
    if (isDaemonRunning()) {
      console.log('Daemon already running');
      process.exit(0);
    }

    if (options.foreground) {
      // Run daemon in-process (blocking)
      await import('./daemon');
      return;
    }

    // Fork daemon as detached child
    const { spawn: spawnChild } = await import('child_process');
    const daemonScript = require.resolve('./daemon');
    const logFile = require('path').join(require('os').homedir(), '.tarx', 'logs', 'daemon-launchd.log');
    const fs = await import('fs');
    fs.mkdirSync(require('path').dirname(logFile), { recursive: true });
    const out = fs.openSync(logFile, 'a');
    const child = spawnChild(process.execPath, [daemonScript, '--foreground'], {
      detached: true,
      stdio: ['ignore', out, out]
    });
    child.unref();
    console.log(`Daemon forked (PID ${child.pid})`);

    // Wait for socket to appear
    const sockPath = require('path').join(require('os').homedir(), '.tarx', 'daemon.sock');
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
      if (fs.existsSync(sockPath)) {
        console.log('Daemon ready');
        process.exit(0);
      }
    }
    console.error('Daemon started but socket not found after 30s');
    process.exit(1);
  });

daemonCmd
  .command('stop')
  .description('Stop the daemon and all managed services')
  .action(async () => {
    const { isDaemonRunning, stopDaemon } = await import('./daemon-client');
    if (!isDaemonRunning()) {
      console.log('Daemon not running');
      process.exit(0);
    }
    try {
      await stopDaemon();
      console.log('Daemon stopped');
    } catch (e: any) {
      console.error(`Failed: ${e.message}`);
      process.exit(1);
    }
  });

daemonCmd
  .command('status')
  .description('Show daemon and service status')
  .action(async () => {
    const { isDaemonRunning, getDaemonStatus } = await import('./daemon-client');
    if (!isDaemonRunning()) {
      console.log('Daemon: not running');
      process.exit(1);
    }
    try {
      const s = await getDaemonStatus();
      const uptime = Math.round(s.daemon.uptime / 1000);
      console.log(`Daemon:     PID ${s.daemon.pid} (uptime ${uptime}s)`);
      const ic = s.inference.healthy ? '✓' : '✗';
      console.log(`Inference:  ${ic} :${s.inference.port}${s.inference.pid ? ` PID ${s.inference.pid}` : ''}${s.inference.latencyMs ? ` (${s.inference.latencyMs}ms)` : ''}`);
      const ec = s.embeddings.healthy ? '✓' : '✗';
      console.log(`Embeddings: ${ec} :${s.embeddings.port}${s.embeddings.pid ? ` PID ${s.embeddings.pid}` : ''}${s.embeddings.latencyMs ? ` (${s.embeddings.latencyMs}ms)` : ''}`);
    } catch (e: any) {
      console.error(`Failed: ${e.message}`);
      process.exit(1);
    }
  });

daemonCmd
  .command('restart')
  .description('Restart all managed services')
  .action(async () => {
    const { isDaemonRunning, restartDaemon } = await import('./daemon-client');
    if (!isDaemonRunning()) {
      console.log('Daemon not running. Use: tarx daemon start');
      process.exit(1);
    }
    try {
      await restartDaemon();
      console.log('Services restarted');
    } catch (e: any) {
      console.error(`Failed: ${e.message}`);
      process.exit(1);
    }
  });

daemonCmd
  .command('install')
  .description('Install launchd plist for boot persistence')
  .action(async () => {
    const pathMod = await import('path');
    const fsMod = await import('fs');
    const { execSync } = await import('child_process');
    const plistSrc = pathMod.join(__dirname, '..', 'com.tarx.daemon.plist');
    const plistDst = pathMod.join(require('os').homedir(), 'Library', 'LaunchAgents', 'com.tarx.daemon.plist');

    if (!fsMod.existsSync(plistSrc)) {
      console.error(`Plist not found: ${plistSrc}`);
      process.exit(1);
    }

    fsMod.mkdirSync(pathMod.dirname(plistDst), { recursive: true });
    fsMod.copyFileSync(plistSrc, plistDst);
    try {
      execSync(`launchctl load ${plistDst}`);
      console.log('Daemon installed and loaded');
    } catch {
      console.log('Plist copied. Run: launchctl load ' + plistDst);
    }
  });

daemonCmd
  .command('uninstall')
  .description('Remove launchd plist')
  .action(async () => {
    const pathMod = await import('path');
    const fsMod = await import('fs');
    const { execSync } = await import('child_process');
    const plistDst = pathMod.join(require('os').homedir(), 'Library', 'LaunchAgents', 'com.tarx.daemon.plist');

    if (fsMod.existsSync(plistDst)) {
      try { execSync(`launchctl unload ${plistDst}`); } catch {}
      fsMod.unlinkSync(plistDst);
      console.log('Daemon uninstalled');
    } else {
      console.log('Plist not found — already uninstalled');
    }
  });

// ── Backward-compat aliases ──
program
  .command('start')
  .description('Start AI engine (alias: daemon start)')
  .action(async () => {
    const { isDaemonRunning } = await import('./daemon-client');
    if (isDaemonRunning()) {
      console.log('Daemon already running');
      process.exit(0);
    }
    // Delegate to daemon start (foreground=false)
    const { ensureInferenceRunning } = await import('./services/engine');
    console.log('Starting inference engine...');
    const result = await ensureInferenceRunning();
    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    console.log(result.started ? 'Inference engine started on :11435' : 'Inference engine already running on :11435');
  });

program
  .command('stop')
  .description('Stop AI engine (alias: daemon stop)')
  .action(async () => {
    const { isDaemonRunning, stopDaemon } = await import('./daemon-client');
    if (isDaemonRunning()) {
      try {
        await stopDaemon();
        console.log('Daemon stopped');
        return;
      } catch {}
    }
    const { stopInference } = await import('./services/engine');
    await stopInference();
    console.log('Inference engine stopped');
  });

function printHealth(health: any): void {
  const check = (ok: boolean) => ok ? '✓' : '✗';
  console.log(`Inference:  ${check(health.inference.healthy)} ${health.inference.port}`);
  console.log(`Embeddings: ${check(health.embeddings.healthy)} ${health.embeddings.port}`);
  console.log(`Mesh:       ${check(health.mesh.healthy)} ${health.mesh.port}`);
}

function printStatus(status: any): void {
  printHealth(status.health);
  console.log('---');
  console.log(`Memories:  ${status.memory?.totalMemories || 'N/A'}`);
  console.log(`Sessions:  ${status.memory?.totalSessions || 'N/A'}`);
  console.log(`Messages:  ${status.memory?.totalMessages || 'N/A'}`);
}

program.parse();
