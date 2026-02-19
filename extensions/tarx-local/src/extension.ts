import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ThemeColors, themeColor } from './design-tokens';
import { statusIcon, Symbols, TarxIcons } from './icons';

let llamaServer: ChildProcess | undefined;
let embeddingServer: ChildProcess | undefined;
let meshServer: ChildProcess | undefined;
let embeddingHealthMonitor: NodeJS.Timeout | undefined;
let meshHealthMonitor: NodeJS.Timeout | undefined;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let embeddingStatusItem: vscode.StatusBarItem;
let meshStatusItem: vscode.StatusBarItem;
let isMeshEnabled = false;
let meshPeerCount = 0;
let extensionContext: vscode.ExtensionContext | undefined;

const MESH_PORT = 11436;

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
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

  // Create embedding server status bar item
  embeddingStatusItem = vscode.window.createStatusBarItem(
    'tarx-embedding-status',
    vscode.StatusBarAlignment.Right,
    98
  );
  embeddingStatusItem.name = 'TARX Embedding Status';
  embeddingStatusItem.text = `${statusIcon('loading')} RAG: Starting...`;
  embeddingStatusItem.tooltip = 'TARX Embedding Server - Starting...';
  embeddingStatusItem.command = 'tarx.local.embeddingStatus';
  context.subscriptions.push(embeddingStatusItem);

  // Create mesh status bar item
  meshStatusItem = vscode.window.createStatusBarItem(
    'tarx-mesh-status',
    vscode.StatusBarAlignment.Right,
    99
  );
  meshStatusItem.name = 'TARX Mesh Status';
  meshStatusItem.text = `${Symbols.meshOff} Mesh: Starting...`;
  meshStatusItem.tooltip = 'TARX Mesh Network - Starting...';
  meshStatusItem.command = 'tarx.local.meshStatus';
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
      vscode.window.showWarningMessage('TARX LOCAL: No model found. Download a GGUF model file to ~/Library/Application Support/tarx/models/.');
    }

    // 3. Get port from config
    const port = config.get('port', 11435);

    // 3b. Singleton guard — skip spawn if already running
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        outputChannel.appendLine(`TARX LOCAL: Server already running on port ${port}`);
        updateStatusBar('connected', port);
        return;
      }
    } catch { /* not running, proceed to start */ }

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

    // 7. Start embedding server if enabled (with delay to avoid GPU contention)
    const embeddingConfig = vscode.workspace.getConfiguration('tarx.local.embeddingServer');
    if (embeddingConfig.get('enabled', true)) {
      // Brief delay to let inference server finish GPU initialization
      await new Promise(r => setTimeout(r, 2000));
      await startEmbeddingServer(context, embeddingConfig.get('port', 11437));
      // Start health monitoring for auto-restart on crash
      startEmbeddingHealthMonitor(embeddingConfig.get('port', 11437));
    } else {
      embeddingStatusItem.text = `${statusIcon('warning')} RAG: Disabled`;
      embeddingStatusItem.tooltip = 'TARX Embedding Server - Disabled by config';
    }

    // 7b. Start mesh server (auto-start, no GPU needed)
    await startMeshServer(context, MESH_PORT);
    startMeshHealthMonitor(MESH_PORT);

    // 8. Register commands
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

    // Mesh toggle command — now starts/stops the real server
    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.toggleMesh', async () => {
        if (meshServer) {
          // Running → stop it
          await stopMeshServer();
          isMeshEnabled = false;
          vscode.window.showInformationMessage('TARX Mesh: Stopped');
        } else {
          // Not running → start it
          isMeshEnabled = true;
          await startMeshServer(context, MESH_PORT);
          startMeshHealthMonitor(MESH_PORT);
          vscode.window.showInformationMessage('TARX Mesh: Starting...');
        }
      })
    );

    // Mesh status command
    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.local.meshStatus', async () => {
        await showMeshStatus(MESH_PORT);
      })
    );

    // Mesh restart command
    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.local.restartMesh', async () => {
        await restartMeshServer(context);
      })
    );

    // Embedding server commands
    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.local.restartEmbedding', async () => {
        await restartEmbeddingServer(context);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.local.embeddingStatus', async () => {
        const embPort = vscode.workspace.getConfiguration('tarx.local.embeddingServer').get('port', 11437);
        await showEmbeddingStatus(embPort);
      })
    );

    // Update status bar to show connected
    updateStatusBar('connected', port);

    // 9. Cleanup on deactivate
    context.subscriptions.push({
      dispose: () => {
        stopEmbeddingHealthMonitor();
        stopMeshHealthMonitor();
        if (llamaServer) {
          llamaServer.kill('SIGTERM');
          llamaServer = undefined;
        }
        if (embeddingServer) {
          embeddingServer.kill('SIGTERM');
          embeddingServer = undefined;
        }
        if (meshServer) {
          meshServer.kill('SIGTERM');
          meshServer = undefined;
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
  stopEmbeddingHealthMonitor();
  stopMeshHealthMonitor();
  if (llamaServer) {
    llamaServer.kill('SIGTERM');
    llamaServer = undefined;
  }
  if (embeddingServer) {
    embeddingServer.kill('SIGTERM');
    embeddingServer = undefined;
  }
  if (meshServer) {
    meshServer.kill('SIGTERM');
    meshServer = undefined;
  }
}

// ============================================================================
// STATUS BAR HELPERS (using design tokens)
// ============================================================================

function updateStatusBar(state: 'starting' | 'connected' | 'error' | 'offline', port?: number) {
  // Guard: statusBarItem may be null during dispose
  if (!statusBarItem) return;

  try {
    switch (state) {
      case 'starting':
        statusBarItem.text = `${statusIcon('loading')} TARX: Starting...`;
        statusBarItem.tooltip = 'TARX Local - Starting llama-server...';
        statusBarItem.backgroundColor = undefined;
        break;
      case 'connected':
        statusBarItem.text = `${statusIcon('pass')} Local AI: Connected`;
        statusBarItem.tooltip = `TARX Local AI — Running on port ${port}`;
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
  } catch {
    // Silently ignore errors during status bar updates
  }
}

function updateMeshStatusBar(state: 'starting' | 'connected' | 'error' | 'offline', peers?: number) {
  // Guard: meshStatusItem may be null during dispose
  if (!meshStatusItem) return;

  try {
    switch (state) {
      case 'starting':
        meshStatusItem.text = `${Symbols.meshOff} Mesh: Starting...`;
        meshStatusItem.tooltip = 'TARX Mesh Network - Starting...';
        meshStatusItem.backgroundColor = undefined;
        break;
      case 'connected':
        meshPeerCount = peers ?? 0;
        meshStatusItem.text = `${Symbols.meshOn} Mesh (${meshPeerCount})`;
        meshStatusItem.tooltip = `TARX Mesh Network - Running on port ${MESH_PORT} (${meshPeerCount} peers)`;
        meshStatusItem.backgroundColor = undefined;
        isMeshEnabled = true;
        break;
      case 'error':
        meshStatusItem.text = `${Symbols.meshOff} Mesh: Error`;
        meshStatusItem.tooltip = 'TARX Mesh Network - Error. Click for details.';
        meshStatusItem.backgroundColor = themeColor(ThemeColors.statusBarError);
        isMeshEnabled = false;
        break;
      case 'offline':
        meshStatusItem.text = `${Symbols.meshOff} Mesh: Off`;
        meshStatusItem.tooltip = 'TARX Mesh Network - Not running. Click to start.';
        meshStatusItem.backgroundColor = undefined;
        isMeshEnabled = false;
        break;
    }
  } catch {
    // Silently ignore errors during status bar updates
  }
}

async function findModel(): Promise<string | undefined> {
  const home = os.homedir();

  // V1.1: Fine-tuned TARX model — always prefer if present
  const fineTunedModel = path.join(home, 'Library/Application Support/tarx/models/tarx-qwen2.5-7b-deep-Q4_K_M.gguf');
  if (fs.existsSync(fineTunedModel)) {
    return fineTunedModel;
  }

  // Fallback: scan directories for any valid GGUF
  const minSize = 500 * 1024 * 1024; // 500MB minimum
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

// ============================================================================
// EMBEDDING SERVER
// ============================================================================

async function findEmbeddingModel(): Promise<string | undefined> {
  const home = os.homedir();

  // Search for nomic-embed-text or similar embedding models
  const searchDirs = [
    path.join(home, 'Library/Application Support/tarx/models'),
    path.join(home, '.ollama/models/blobs'),
    path.join(home, 'Downloads')
  ];

  // Known embedding model sizes (approximate)
  const minSize = 200 * 1024 * 1024;  // 200MB minimum
  const maxSize = 500 * 1024 * 1024;  // 500MB max (embedding models are smaller)

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const entries = fs.readdirSync(dir);
      const models: Array<{ path: string; size: number; isEmbed: boolean }> = [];

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
            // Embedding models are typically 200-400MB
            if (stat.size >= minSize && stat.size <= maxSize) {
              models.push({
                path: fullPath,
                size: stat.size,
                isEmbed: lowerName.includes('embed') || lowerName.includes('nomic')
              });
            }
          } catch { /* ignore */ }
        }
      }

      // Sort: explicit embed models first, then by size (prefer smaller for embeddings)
      models.sort((a, b) => {
        if (a.isEmbed !== b.isEmbed) return a.isEmbed ? -1 : 1;
        return a.size - b.size;
      });

      if (models.length > 0) {
        return models[0].path;
      }
    } catch { /* ignore */ }
  }

  return undefined;
}

async function startEmbeddingServer(context: vscode.ExtensionContext, port: number, attempt: number = 1) {
  const maxAttempts = 3;
  try {
    // Check if something is already running on this port
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        outputChannel.appendLine(`TARX EMBEDDING: Server already running on port ${port}`);
        updateEmbeddingStatusBar('connected', port);
        embeddingStatusItem.show();
        return;
      }
    } catch { /* not running, proceed to start */ }

    const binaryPath = path.join(
      context.extensionPath,
      'binaries',
      'llama-server-darwin-arm64'
    );

    if (!fs.existsSync(binaryPath)) {
      throw new Error('llama-server binary not found');
    }

    const modelPath = await findEmbeddingModel();
    if (!modelPath) {
      outputChannel.appendLine('TARX EMBEDDING: No embedding model found');
      updateEmbeddingStatusBar('offline');
      return;
    }

    outputChannel.appendLine(`TARX EMBEDDING: Starting on port ${port} (attempt ${attempt}/${maxAttempts})`);
    outputChannel.appendLine(`TARX EMBEDDING: Model: ${modelPath}`);

    const args = [
      '--host', '127.0.0.1',
      '--port', String(port),
      '--model', modelPath,
      '--ctx-size', '8192',
      '--batch-size', '8192',
      '--ubatch-size', '8192',
      '--embeddings',
      '--pooling', 'mean',
      '--parallel', '1',
      '--no-warmup'
    ];

    const binariesDir = path.join(context.extensionPath, 'binaries');
    embeddingServer = spawn(binaryPath, args, {
      env: {
        ...process.env,
        DYLD_LIBRARY_PATH: binariesDir,
        DYLD_FALLBACK_LIBRARY_PATH: binariesDir
      }
    });

    embeddingServer.stdout?.on('data', (data) => {
      outputChannel.appendLine(`[embed-server] ${data.toString().trim()}`);
    });

    embeddingServer.stderr?.on('data', (data) => {
      outputChannel.appendLine(`[embed-server] ${data.toString().trim()}`);
    });

    embeddingServer.on('exit', (code, signal) => {
      outputChannel.appendLine(`TARX EMBEDDING: Server exited (code: ${code}, signal: ${signal})`);
      if (code !== 0 && code !== null) {
        updateEmbeddingStatusBar('error');
      } else {
        updateEmbeddingStatusBar('offline');
      }
      embeddingServer = undefined;
    });

    embeddingServer.on('error', (err) => {
      outputChannel.appendLine(`TARX EMBEDDING: Spawn error: ${err.message}`);
      updateEmbeddingStatusBar('error');
    });

    // Wait for embedding server health
    await waitForHealth(`http://localhost:${port}/health`, 30000);
    updateEmbeddingStatusBar('connected', port);
    embeddingStatusItem.show();

    outputChannel.appendLine('TARX EMBEDDING: Ready!');

  } catch (err: any) {
    outputChannel.appendLine(`TARX EMBEDDING: Error (attempt ${attempt}): ${err.message}`);

    // Kill failed process before retry
    if (embeddingServer) {
      embeddingServer.kill('SIGTERM');
      embeddingServer = undefined;
    }

    if (attempt < maxAttempts) {
      outputChannel.appendLine(`TARX EMBEDDING: Retrying in 3s...`);
      updateEmbeddingStatusBar('starting');
      await new Promise(r => setTimeout(r, 3000));
      return startEmbeddingServer(context, port, attempt + 1);
    }

    updateEmbeddingStatusBar('error');
  }
}

function updateEmbeddingStatusBar(state: 'starting' | 'connected' | 'error' | 'offline', port?: number) {
  // Guard: embeddingStatusItem may be null during dispose
  if (!embeddingStatusItem) return;

  try {
    switch (state) {
      case 'starting':
        embeddingStatusItem.text = `${statusIcon('loading')} RAG: Starting...`;
        embeddingStatusItem.tooltip = 'TARX Embedding Server - Starting...';
        embeddingStatusItem.backgroundColor = undefined;
        break;
      case 'connected':
        embeddingStatusItem.text = `${statusIcon('pass')} RAG: Ready`;
        embeddingStatusItem.tooltip = `TARX Embedding Server - Connected on port ${port}`;
        embeddingStatusItem.backgroundColor = undefined;
        break;
      case 'error':
        embeddingStatusItem.text = `${statusIcon('error')} RAG: Error`;
        embeddingStatusItem.tooltip = 'TARX Embedding Server - Error. Click for details.';
        embeddingStatusItem.backgroundColor = themeColor(ThemeColors.statusBarError);
        break;
      case 'offline':
        embeddingStatusItem.text = `${statusIcon('warning')} RAG: Offline`;
        embeddingStatusItem.tooltip = 'TARX Embedding Server - Not running.';
        embeddingStatusItem.backgroundColor = themeColor(ThemeColors.statusBarWarning);
        break;
    }
  } catch {
    // Silently ignore errors during status bar updates
  }
}

async function restartEmbeddingServer(context: vscode.ExtensionContext) {
  outputChannel.appendLine('TARX EMBEDDING: Restarting...');
  updateEmbeddingStatusBar('starting');

  if (embeddingServer) {
    embeddingServer.kill('SIGTERM');
    embeddingServer = undefined;
    await new Promise(r => setTimeout(r, 1000));
  }

  const port = vscode.workspace.getConfiguration('tarx.local.embeddingServer').get('port', 11437);
  await startEmbeddingServer(context, port);
}

// ============================================================================
// EMBEDDING SERVER HEALTH MONITOR (auto-restart on crash)
// ============================================================================

function startEmbeddingHealthMonitor(port: number) {
  // Clear any existing monitor
  if (embeddingHealthMonitor) {
    clearInterval(embeddingHealthMonitor);
  }

  outputChannel.appendLine('TARX EMBEDDING: Starting health monitor (30s interval)');

  embeddingHealthMonitor = setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        throw new Error(`Health check returned ${res.status}`);
      }
    } catch (err: any) {
      outputChannel.appendLine(`TARX EMBEDDING: Health check failed: ${err.message}`);
      outputChannel.appendLine('TARX EMBEDDING: Auto-restarting...');
      updateEmbeddingStatusBar('starting');

      // Kill zombie process if exists
      if (embeddingServer) {
        try {
          embeddingServer.kill('SIGKILL');
        } catch { /* ignore */ }
        embeddingServer = undefined;
      }

      // Wait before restart
      await new Promise(r => setTimeout(r, 2000));

      // Restart if we have context
      if (extensionContext) {
        await startEmbeddingServer(extensionContext, port);
      }
    }
  }, 30000); // Check every 30 seconds
}

function stopEmbeddingHealthMonitor() {
  if (embeddingHealthMonitor) {
    clearInterval(embeddingHealthMonitor);
    embeddingHealthMonitor = undefined;
    outputChannel.appendLine('TARX EMBEDDING: Health monitor stopped');
  }
}

async function showEmbeddingStatus(port: number) {
  try {
    const healthRes = await fetch(`http://localhost:${port}/health`);
    const health = await healthRes.json();

    const msg = `TARX Embedding Server Status:
- Running: ${embeddingServer ? 'Yes' : 'No'}
- Port: ${port}
- Health: ${JSON.stringify(health)}`;

    vscode.window.showInformationMessage(msg);
    outputChannel.appendLine(msg);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Cannot get embedding status: ${err.message}`);
  }
}

// ============================================================================
// MESH SERVER (tarx-mesh binary on port 11436)
// ============================================================================

async function startMeshServer(context: vscode.ExtensionContext, port: number, attempt: number = 1) {
  const maxAttempts = 3;
  try {
    // Singleton guard — skip spawn if already running
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        outputChannel.appendLine(`TARX MESH: Server already running on port ${port}`);
        // Fetch initial peer count
        await fetchMeshPeerCount(port);
        updateMeshStatusBar('connected', meshPeerCount);
        return;
      }
    } catch { /* not running, proceed to start */ }

    const binaryPath = path.join(
      context.extensionPath,
      'binaries',
      'tarx-mesh'
    );

    if (!fs.existsSync(binaryPath)) {
      outputChannel.appendLine(`TARX MESH: Binary not found at ${binaryPath}`);
      updateMeshStatusBar('offline');
      return;
    }

    outputChannel.appendLine(`TARX MESH: Starting on port ${port} (attempt ${attempt}/${maxAttempts})`);
    updateMeshStatusBar('starting');

    const home = os.homedir();
    const dataDir = path.join(home, 'Library/Application Support/tarx/mesh');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const args = [
      '--bind-addr', `127.0.0.1:${port}`,
      '--inference-url', 'http://127.0.0.1:11435',
      '--data-dir', dataDir,
      '--log-level', 'info',
      '--mode', 'embedded',
      '--enable-mdns'
    ];

    meshServer = spawn(binaryPath, args, {
      env: { ...process.env }
    });

    meshServer.stdout?.on('data', (data) => {
      outputChannel.appendLine(`[tarx-mesh] ${data.toString().trim()}`);
    });

    meshServer.stderr?.on('data', (data) => {
      outputChannel.appendLine(`[tarx-mesh] ${data.toString().trim()}`);
    });

    meshServer.on('exit', (code, signal) => {
      outputChannel.appendLine(`TARX MESH: Server exited (code: ${code}, signal: ${signal})`);
      if (code !== 0 && code !== null) {
        updateMeshStatusBar('error');
      } else {
        updateMeshStatusBar('offline');
      }
      meshServer = undefined;
    });

    meshServer.on('error', (err) => {
      outputChannel.appendLine(`TARX MESH: Spawn error: ${err.message}`);
      updateMeshStatusBar('error');
    });

    // Wait for mesh server health (faster startup than LLM servers)
    await waitForHealth(`http://localhost:${port}/health`, 10000);

    // Fetch initial peer count
    await fetchMeshPeerCount(port);
    updateMeshStatusBar('connected', meshPeerCount);

    outputChannel.appendLine('TARX MESH: Ready!');

  } catch (err: any) {
    outputChannel.appendLine(`TARX MESH: Error (attempt ${attempt}): ${err.message}`);

    // Kill failed process before retry
    if (meshServer) {
      meshServer.kill('SIGTERM');
      meshServer = undefined;
    }

    if (attempt < maxAttempts) {
      outputChannel.appendLine(`TARX MESH: Retrying in 3s...`);
      updateMeshStatusBar('starting');
      await new Promise(r => setTimeout(r, 3000));
      return startMeshServer(context, port, attempt + 1);
    }

    updateMeshStatusBar('error');
  }
}

async function stopMeshServer() {
  stopMeshHealthMonitor();
  if (meshServer) {
    outputChannel.appendLine('TARX MESH: Stopping...');
    meshServer.kill('SIGTERM');
    meshServer = undefined;
    await new Promise(r => setTimeout(r, 500));
  }
  updateMeshStatusBar('offline');
}

async function restartMeshServer(context: vscode.ExtensionContext) {
  outputChannel.appendLine('TARX MESH: Restarting...');
  await stopMeshServer();
  await new Promise(r => setTimeout(r, 1000));
  await startMeshServer(context, MESH_PORT);
  startMeshHealthMonitor(MESH_PORT);
}

async function fetchMeshPeerCount(port: number): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${port}/mesh/status`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json() as any;
      meshPeerCount = data.peer_count ?? data.peers?.length ?? 0;
    }
  } catch {
    // Non-fatal — peer count stays at last known value
  }
}

async function showMeshStatus(port: number) {
  try {
    const healthRes = await fetch(`http://localhost:${port}/health`);
    const health = await healthRes.json();

    let statusExtra = '';
    try {
      const meshRes = await fetch(`http://localhost:${port}/mesh/status`);
      const meshData = await meshRes.json() as any;
      statusExtra = `\n- Peers: ${meshData.peer_count ?? 0}\n- Mode: ${meshData.mode ?? 'unknown'}`;
    } catch { /* ignore */ }

    const msg = `TARX Mesh Status:
- Running: ${meshServer ? 'Yes' : 'No'}
- Port: ${port}
- Health: ${JSON.stringify(health)}${statusExtra}`;

    vscode.window.showInformationMessage(msg);
    outputChannel.appendLine(msg);
  } catch (err: any) {
    vscode.window.showErrorMessage(`Cannot get mesh status: ${err.message}`);
  }
}

// ============================================================================
// MESH SERVER HEALTH MONITOR (auto-restart on crash)
// ============================================================================

function startMeshHealthMonitor(port: number) {
  if (meshHealthMonitor) {
    clearInterval(meshHealthMonitor);
  }

  outputChannel.appendLine('TARX MESH: Starting health monitor (30s interval)');

  meshHealthMonitor = setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        throw new Error(`Health check returned ${res.status}`);
      }
      // Update peer count on each successful health check
      await fetchMeshPeerCount(port);
      updateMeshStatusBar('connected', meshPeerCount);
    } catch (err: any) {
      outputChannel.appendLine(`TARX MESH: Health check failed: ${err.message}`);
      outputChannel.appendLine('TARX MESH: Auto-restarting...');
      updateMeshStatusBar('starting');

      // Kill zombie process if exists
      if (meshServer) {
        try {
          meshServer.kill('SIGKILL');
        } catch { /* ignore */ }
        meshServer = undefined;
      }

      // Wait before restart
      await new Promise(r => setTimeout(r, 2000));

      // Restart if we have context
      if (extensionContext) {
        await startMeshServer(extensionContext, port);
      }
    }
  }, 30000); // Check every 30 seconds
}

function stopMeshHealthMonitor() {
  if (meshHealthMonitor) {
    clearInterval(meshHealthMonitor);
    meshHealthMonitor = undefined;
    outputChannel.appendLine('TARX MESH: Health monitor stopped');
  }
}
