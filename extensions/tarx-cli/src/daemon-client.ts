/**
 * TARX Daemon Client — Unix socket IPC for CLI/engine communication with the daemon.
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TARX_DIR = path.join(os.homedir(), '.tarx');
const DAEMON_PID_FILE = path.join(TARX_DIR, 'daemon.pid');
const DAEMON_SOCK = path.join(TARX_DIR, 'daemon.sock');

export interface DaemonServiceStatus {
	running: boolean;
	pid?: number;
	port: number;
	healthy: boolean;
	latencyMs?: number;
	uptime?: number;
}

export interface DaemonStatus {
	daemon: { pid: number; uptime: number };
	inference: DaemonServiceStatus;
	embeddings: DaemonServiceStatus;
}

export function isDaemonRunning(): boolean {
	if (!fs.existsSync(DAEMON_PID_FILE)) return false;
	try {
		const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim(), 10);
		if (isNaN(pid)) return false;
		process.kill(pid, 0); // signal 0 = existence check
		return true;
	} catch {
		return false;
	}
}

export function getDaemonPid(): number | null {
	if (!fs.existsSync(DAEMON_PID_FILE)) return null;
	try {
		const pid = parseInt(fs.readFileSync(DAEMON_PID_FILE, 'utf8').trim(), 10);
		return isNaN(pid) ? null : pid;
	} catch {
		return null;
	}
}

export async function sendCommand(action: string, timeoutMs = 10000): Promise<any> {
	return new Promise((resolve, reject) => {
		if (!fs.existsSync(DAEMON_SOCK)) {
			reject(new Error('Daemon socket not found. Is the daemon running?'));
			return;
		}

		const client = net.createConnection(DAEMON_SOCK);
		let data = '';

		const timer = setTimeout(() => {
			client.destroy();
			reject(new Error(`Daemon command timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		client.on('connect', () => {
			client.write(JSON.stringify({ action }) + '\n');
		});

		client.on('data', (chunk) => {
			data += chunk.toString();
			const newlineIdx = data.indexOf('\n');
			if (newlineIdx !== -1) {
				clearTimeout(timer);
				client.destroy();
				try {
					resolve(JSON.parse(data.slice(0, newlineIdx)));
				} catch (e) {
					reject(new Error('Invalid JSON from daemon'));
				}
			}
		});

		client.on('error', (err) => {
			clearTimeout(timer);
			reject(new Error(`Daemon connection error: ${err.message}`));
		});
	});
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
	return sendCommand('status') as Promise<DaemonStatus>;
}

export async function stopDaemon(): Promise<void> {
	await sendCommand('stop');
}

export async function restartDaemon(): Promise<void> {
	await sendCommand('restart');
}

export async function restartInference(): Promise<void> {
	await sendCommand('restart-inference');
}

export async function restartEmbeddings(): Promise<void> {
	await sendCommand('restart-embeddings');
}
