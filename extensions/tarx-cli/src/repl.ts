/**
 * TARX REPL - Interactive Read-Eval-Print Loop
 */

import * as readline from 'readline';
import { chat } from './services/inference';
import { checkHealth, getFullStatus } from './services/health';

const PROMPT = '\x1b[35mtarx>\x1b[0m ';

export async function startRepl(): Promise<void> {
  console.log('\x1b[35m╔════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[35m║\x1b[0m  TARX v1.1.0 — Local AI               \x1b[35m║\x1b[0m');
  console.log('\x1b[35m║\x1b[0m  Type /help for commands, Ctrl+D exit \x1b[35m║\x1b[0m');
  console.log('\x1b[35m╚════════════════════════════════════════╝\x1b[0m');
  console.log();

  const health = await checkHealth();
  if (!health.inference.healthy) {
    const { ensureInferenceRunning } = await import('./services/engine');
    console.log('Starting inference engine...');
    const result = await ensureInferenceRunning();
    if (result.error) {
      console.log(`\x1b[31mError: ${result.error}\x1b[0m`);
      console.log('\x1b[33mChat will not work without the inference engine.\x1b[0m');
    } else if (result.started) {
      console.log('\x1b[32mInference engine ready.\x1b[0m');
    }
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    historySize: 100
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input.startsWith('/')) {
      await handleSlashCommand(input, rl);
      rl.prompt();
      return;
    }

    try {
      await chat(input, {
        stream: true,
        onToken: (token: string) => process.stdout.write(token)
      });
      console.log();
    } catch (error: any) {
      console.log('\x1b[31mError: ' + error.message + '\x1b[0m');
    }
    rl.prompt();
  });

  rl.on('close', () => { console.log('\nGoodbye.'); process.exit(0); });
}

async function handleSlashCommand(input: string, rl: readline.Interface): Promise<void> {
  const [cmd, ...args] = input.slice(1).split(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
      console.log('\nTARX Commands:');
      console.log('  /help    - Show this help');
      console.log('  /status  - System status');
      console.log('  /health  - Quick health check');
      console.log('  /clear   - Clear screen');
      console.log('  /tools   - List MCP tools');
      console.log('  /exit    - Exit TARX\n');
      break;

    case 'status':
      const status = await getFullStatus();
      const h = status.health;
      console.log('Inference:  ' + (h.inference.healthy ? 'OK' : 'DOWN'));
      console.log('Embeddings: ' + (h.embeddings.healthy ? 'OK' : 'DOWN'));
      console.log('Mesh:       ' + (h.mesh.healthy ? 'OK' : 'DOWN'));
      break;

    case 'health':
      const hc = await checkHealth();
      console.log('Inference: ' + (hc.inference.healthy ? 'OK' : 'DOWN') +
                  ' | Embeddings: ' + (hc.embeddings.healthy ? 'OK' : 'DOWN') +
                  ' | Mesh: ' + (hc.mesh.healthy ? 'OK' : 'DOWN'));
      break;

    case 'clear':
      console.clear();
      break;

    case 'exit':
    case 'quit':
      rl.close();
      break;

    case 'tools':
      console.log('260 MCP tools: tarx-core (46), tarx-ops (47), tarx-ui (167)');
      break;

    default:
      console.log('Unknown command: /' + cmd);
  }
}
