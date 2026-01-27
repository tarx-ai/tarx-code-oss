import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ThemeColors, themeColor } from './design-tokens';
import { statusIcon, Symbols, TarxIcons } from './icons';

let llamaServer: ChildProcess | undefined;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let meshStatusItem: vscode.StatusBarItem;
let isMeshEnabled = false;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('TARX LOCAL');
  outputChannel.appendLine('TARX LOCAL: Activating...');

  // Create status bar items using design tokens
  statusBarItem = vscode.window.createStatusBarItem(
    'tarx-local-status',
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = 'TARX Local Status';
  statusBarItem.text = `${statusIcon('robot')} TARX: Starting...`;
  statusBarItem.tooltip = 'TARX Local - Starting llama-server...';
  statusBarItem.command = 'tarx.local.status';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Create mesh toggle status bar item
  meshStatusItem = vscode.window.createStatusBarItem(
    'tarx-mesh-status',
    vscode.StatusBarAlignment.Right,
    99
  );
  meshStatusItem.name = 'TARX Mesh Status';
  meshStatusItem.text = `${Symbols.meshOff} Mesh: OFF`;
  meshStatusItem.tooltip = 'Click to toggle TARX mesh network';
  meshStatusItem.command = 'tarx.toggleMesh';
  meshStatusItem.show();
  context.subscriptions.push(meshStatusItem);

  const config = vscode.workspace.getConfiguration('tarx.local');
  if (!config.get('enabled', true)) {
    outputChannel.appendLine('TARX LOCAL: Disabled by user config');
    return;
  }

  try {
    // 1. Get binary path
    const binaryPath = path.join(
      context.extensionPath,
      'binaries',
      'llama-server-darwin-arm64'
    );

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`llama-server binary not found at ${binaryPath}`);
    }

    // 2. Find model
    const modelPath = await findModel();
    if (!modelPath) {
      outputChannel.appendLine('TARX LOCAL: No model found, running in API-only mode');
      vscode.window.showWarningMessage('TARX LOCAL: No model found. Install Ollama models or download a GGUF file.');
    }

    // 3. Get port from config
    const port = config.get('port', 11435);

    // 4. Build args
    const args = [
      '--host', '127.0.0.1',
      '--port', String(port),
      '--ctx-size', '4096',
      '--parallel', '1',
      '--no-warmup',
      '--metrics'
    ];

    if (modelPath) {
      args.push('--model', modelPath);
    }

    outputChannel.appendLine(`TARX LOCAL: Starting llama-server on port ${port}`);
    if (modelPath) {
      outputChannel.appendLine(`TARX LOCAL: Model: ${modelPath}`);
    }

    // 5. Spawn llama-server with dylib path
    const binariesDir = path.join(context.extensionPath, 'binaries');
    llamaServer = spawn(binaryPath, args, {
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: binariesDir,
        DYLD_FALLBACK_LIBRARY_PATH: binariesDir
      }
    });

    llamaServer.stdout?.on('data', (data) => {
      outputChannel.appendLine(`[llama-server] ${data.toString().trim()}`);
    });

    llamaServer.stderr?.on('data', (data) => {
      outputChannel.appendLine(`[llama-server] ${data.toString().trim()}`);
    });

    llamaServer.on('exit', (code, signal) => {
      outputChannel.appendLine(`TARX LOCAL: llama-server exited (code: ${code}, signal: ${signal})`);
      if (code !== 0 && code !== null) {
        vscode.window.showErrorMessage('TARX LOCAL: llama-server crashed. Check Output panel for details.');
        updateStatusBar('error');
      } else {
        updateStatusBar('offline');
      }
      llamaServer = undefined;
    });

    llamaServer.on('error', (err) => {
      outputChannel.appendLine(`TARX LOCAL: Spawn error: ${err.message}`);
    });

    // 6. Wait for health
    await waitForHealth(`http://localhost:${port}/health`, 30000);

    // 7. Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.local.restart', async () => {
        await restartServer(context);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.local.status', async () => {
        await showStatus(port);
      })
    );

    // Mesh toggle command
    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.toggleMesh', () => {
        isMeshEnabled = !isMeshEnabled;
        updateMeshStatus();
        vscode.window.showInformationMessage(
          `TARX Mesh: ${isMeshEnabled ? 'Enabled' : 'Disabled'}`
        );
      })
    );

    // Update status bar to show connected
    updateStatusBar('connected', port);

    // 9. Cleanup on deactivate
    context.subscriptions.push({
      dispose: () => {
        if (llamaServer) {
          llamaServer.kill('SIGTERM');
          llamaServer = undefined;
        }
      }
    });

    outputChannel.appendLine('TARX LOCAL: Ready!');
    vscode.window.showInformationMessage(`TARX LOCAL: Ready on port ${port}`);

  } catch (err: any) {
    outputChannel.appendLine(`TARX LOCAL: Error: ${err.message}`);
    vscode.window.showErrorMessage(`TARX LOCAL failed: ${err.message}`);
    updateStatusBar('error');
  }
}

export function deactivate() {
  if (llamaServer) {
    llamaServer.kill('SIGTERM');
    llamaServer = undefined;
  }
}

// ============================================================================
// STATUS BAR HELPERS (using design tokens)
// ============================================================================

function updateStatusBar(state: 'starting' | 'connected' | 'error' | 'offline', port?: number) {
  switch (state) {
    case 'starting':
      statusBarItem.text = `${statusIcon('loading')} TARX: Starting...`;
      statusBarItem.tooltip = 'TARX Local - Starting llama-server...';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'connected':
      statusBarItem.text = `${statusIcon('pass')} TARX: Ready`;
      statusBarItem.tooltip = `TARX Local - Connected on port ${port}`;
      statusBarItem.backgroundColor = undefined;
      break;
    case 'error':
      statusBarItem.text = `${statusIcon('error')} TARX: Error`;
      statusBarItem.tooltip = 'TARX Local - Server error. Click for details.';
      statusBarItem.backgroundColor = themeColor(ThemeColors.statusBarError);
      break;
    case 'offline':
      statusBarItem.text = `${statusIcon('warning')} TARX: Offline`;
      statusBarItem.tooltip = 'TARX Local - Not running. Click to restart.';
      statusBarItem.backgroundColor = themeColor(ThemeColors.statusBarWarning);
      break;
  }
}

function updateMeshStatus() {
  if (isMeshEnabled) {
    meshStatusItem.text = `${Symbols.meshOn} Mesh: ON`;
    meshStatusItem.tooltip = 'TARX Mesh Network - Connected. Click to disable.';
  } else {
    meshStatusItem.text = `${Symbols.meshOff} Mesh: OFF`;
    meshStatusItem.tooltip = 'TARX Mesh Network - Disabled. Click to enable.';
  }
}

async function findModel(): Promise<string | undefined> {
  const minSize = 500 * 1024 * 1024; // 500MB minimum
  const home = os.homedir();

  // Search locations in priority order
  const searchDirs = [
    path.join(home, 'Library/Application Support/tarx/models'),
    path.join(home, '.ollama/models/blobs'),
    path.join(home, 'Downloads')
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir);
      const models: Array<{ path: string; size: number; isCoder: boolean }> = [];

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const lowerName = entry.toLowerCase();

        // Skip mmproj files
        if (lowerName.includes('mmproj')) continue;

        const isGguf = lowerName.endsWith('.gguf');
        const isOllamaBlob = entry.startsWith('sha256-') && !entry.includes('.');

        if (isGguf || isOllamaBlob) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size >= minSize) {
              models.push({
                path: fullPath,
                size: stat.size,
                isCoder: lowerName.includes('coder')
              });
            }
          } catch { /* ignore */ }
        }
      }

      // Sort: coder models first, then by size
      models.sort((a, b) => {
        if (a.isCoder !== b.isCoder) return a.isCoder ? -1 : 1;
        return b.size - a.size;
      });

      if (models.length > 0) {
        return models[0].path;
      }
    } catch { /* ignore */ }
  }

  return undefined;
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  outputChannel.appendLine(`TARX LOCAL: Waiting for health at ${url}...`);

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        outputChannel.appendLine('TARX LOCAL: Health check passed');
        return;
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`Health check timeout after ${timeoutMs}ms`);
}

async function restartServer(context: vscode.ExtensionContext) {
  outputChannel.appendLine('TARX LOCAL: Restarting...');

  if (llamaServer) {
    llamaServer.kill('SIGTERM');
    llamaServer = undefined;
    await new Promise(r => setTimeout(r, 1000));
  }

  await activate(context);
}

async function showStatus(port: number) {
  try {
    const healthRes = await fetch(`http://localhost:${port}/health`);
    const health = await healthRes.json();

    const msg = `TARX LOCAL Status:
- Running: ${llamaServer ? 'Yes' : 'No'}
- Port: ${port}
- Health: ${JSON.stringify(health)}`;

    vscode.window.showInformationMessage(msg);
    outputChannel.appendLine(msg);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Cannot get status: ${err.message}`);
  }
}
