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
