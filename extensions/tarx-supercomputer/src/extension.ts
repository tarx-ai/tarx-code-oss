import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let meshNode: ChildProcess | undefined;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('TARX SUPERCOMPUTER');
  outputChannel.appendLine('TARX SUPERCOMPUTER: Activating...');

  const config = vscode.workspace.getConfiguration('tarx.supercomputer');
  if (!config.get('enabled', true)) {
    outputChannel.appendLine('TARX SUPERCOMPUTER: Disabled by user config');
    return;
  }

  try {
    // 1. Binary path
    const binaryPath = path.join(
      context.extensionPath,
      'binaries',
      'mesh-node-darwin-arm64'
    );

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`mesh-node binary not found at ${binaryPath}`);
    }

    // 2. Port from config
    const port = config.get('meshPort', 11436);

    outputChannel.appendLine(`TARX SUPERCOMPUTER: Starting mesh-node on port ${port}`);

    // 3. Spawn mesh-node
    meshNode = spawn(binaryPath, [`--port=${port}`], {
      env: { ...process.env }
    });

    meshNode.stdout?.on('data', (data) => {
      outputChannel.appendLine(`[mesh-node] ${data.toString().trim()}`);
    });

    meshNode.stderr?.on('data', (data) => {
      outputChannel.appendLine(`[mesh-node] ${data.toString().trim()}`);
    });

    meshNode.on('exit', (code, signal) => {
      outputChannel.appendLine(`TARX SUPERCOMPUTER: mesh-node exited (code: ${code}, signal: ${signal})`);
      if (code !== 0 && code !== null) {
        vscode.window.showErrorMessage('TARX SUPERCOMPUTER: mesh-node crashed');
      }
      meshNode = undefined;
    });

    meshNode.on('error', (err) => {
      outputChannel.appendLine(`TARX SUPERCOMPUTER: Spawn error: ${err.message}`);
    });

    // 4. Wait for health
    await waitForHealth(`http://localhost:${port}/health`, 20000);

    // 5. Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.showSupercomputerDashboard', () => {
        showDashboard(context, port);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('tarx.supercomputer.restart', async () => {
        await restartMeshNode(context);
      })
    );

    // 6. Cleanup
    context.subscriptions.push({
      dispose: () => {
        if (meshNode) {
          meshNode.kill('SIGTERM');
          meshNode = undefined;
        }
      }
    });

    // 7. Show status with peer count and hardware info
    const status = await getMeshStatus(port);
    const ramGb = status.local_capabilities?.ram_gb || '?';
    const peerCount = status.connected_peers || 0;

    outputChannel.appendLine(`TARX SUPERCOMPUTER: Ready! Peers: ${peerCount}, RAM: ${ramGb}GB`);
    outputChannel.appendLine(`TARX SUPERCOMPUTER: Peer ID: ${status.local_peer_id || 'unknown'}`);

    vscode.window.showInformationMessage(
      `TARX SUPERCOMPUTER: Active | ${peerCount} peers | ${ramGb}GB RAM`
    );

  } catch (err: any) {
    outputChannel.appendLine(`TARX SUPERCOMPUTER: Error: ${err.message}`);
    vscode.window.showWarningMessage(`TARX SUPERCOMPUTER: ${err.message}`);
  }
}

export function deactivate() {
  if (meshNode) {
    meshNode.kill('SIGTERM');
    meshNode = undefined;
  }
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  outputChannel.appendLine(`TARX SUPERCOMPUTER: Waiting for health at ${url}...`);

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        outputChannel.appendLine('TARX SUPERCOMPUTER: Health check passed');
        return;
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 800));
  }

  throw new Error(`mesh-node health timeout after ${timeoutMs}ms`);
}

async function getMeshStatus(port: number): Promise<any> {
  try {
    const res = await fetch(`http://localhost:${port}/mesh/status`);
    return await res.json();
  } catch {
    return { connected_peers: 0, local_capabilities: {} };
  }
}

async function restartMeshNode(context: vscode.ExtensionContext) {
  outputChannel.appendLine('TARX SUPERCOMPUTER: Restarting...');

  if (meshNode) {
    meshNode.kill('SIGTERM');
    meshNode = undefined;
    await new Promise(r => setTimeout(r, 1000));
  }

  await activate(context);
}

function showDashboard(context: vscode.ExtensionContext, port: number) {
  const panel = vscode.window.createWebviewPanel(
    'tarxSupercomputerDashboard',
    'TARX Supercomputer Dashboard',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getDashboardHtml(port);
}

function getDashboardHtml(port: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>TARX Supercomputer Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 24px;
      background: #0d1117;
      color: #c9d1d9;
      margin: 0;
    }
    h1 {
      color: #58a6ff;
      margin-bottom: 8px;
    }
    .subtitle {
      color: #8b949e;
      margin-bottom: 24px;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card h2 {
      margin: 0 0 12px 0;
      color: #f0f6fc;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #21262d;
    }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: #8b949e; }
    .stat-value { color: #58a6ff; font-weight: 600; }
    .status-ok { color: #3fb950; }
    .status-warn { color: #d29922; }
    pre {
      background: #0d1117;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
    }
    #error { color: #f85149; display: none; }
  </style>
</head>
<body>
  <h1>TARX Supercomputer</h1>
  <p class="subtitle">Mesh Network Dashboard</p>

  <div class="card">
    <h2>Node Status</h2>
    <div class="stat">
      <span class="stat-label">Status</span>
      <span class="stat-value" id="status">Connecting...</span>
    </div>
    <div class="stat">
      <span class="stat-label">Peer ID</span>
      <span class="stat-value" id="peerId">-</span>
    </div>
    <div class="stat">
      <span class="stat-label">Connected Peers</span>
      <span class="stat-value" id="peerCount">0</span>
    </div>
  </div>

  <div class="card">
    <h2>Hardware</h2>
    <div class="stat">
      <span class="stat-label">RAM</span>
      <span class="stat-value" id="ram">-</span>
    </div>
    <div class="stat">
      <span class="stat-label">GPU VRAM</span>
      <span class="stat-value" id="vram">-</span>
    </div>
    <div class="stat">
      <span class="stat-label">CPU Cores</span>
      <span class="stat-value" id="cores">-</span>
    </div>
  </div>

  <div class="card">
    <h2>Raw Status</h2>
    <pre id="raw">Loading...</pre>
  </div>

  <p id="error"></p>

  <script>
    const port = ${port};

    async function refresh() {
      try {
        const res = await fetch('http://localhost:' + port + '/mesh/status');
        const data = await res.json();

        document.getElementById('status').textContent = data.running ? 'Running' : 'Stopped';
        document.getElementById('status').className = 'stat-value ' + (data.running ? 'status-ok' : 'status-warn');
        document.getElementById('peerId').textContent = data.local_peer_id?.substring(0, 20) + '...' || '-';
        document.getElementById('peerCount').textContent = data.connected_peers || 0;

        if (data.local_capabilities) {
          document.getElementById('ram').textContent = data.local_capabilities.ram_gb + ' GB';
          document.getElementById('vram').textContent = (data.local_capabilities.gpu_vram_gb || 'N/A') + ' GB';
          document.getElementById('cores').textContent = data.local_capabilities.cpu_cores || '-';
        }

        document.getElementById('raw').textContent = JSON.stringify(data, null, 2);
        document.getElementById('error').style.display = 'none';
      } catch (e) {
        document.getElementById('error').textContent = 'Error: ' + e.message;
        document.getElementById('error').style.display = 'block';
      }
    }

    refresh();
    setInterval(refresh, 5000);
  </script>
</body>
</html>`;
}
