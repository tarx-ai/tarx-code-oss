/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Telemetry Reporter
 *  - Reports inference metrics to tarx.com/api/telemetry → Datadog
 *  - Fires heartbeats every 5 minutes (+ immediate on start)
 *  - Reports cognitive sync events
 *  - All telemetry is fire-and-forget, never blocks inference
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as crypto from 'crypto';

const TELEMETRY_URL = 'https://tarx.com/api/telemetry';
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

// Anonymous machine fingerprint — hash of hostname + platform + arch, no PII
const MACHINE_ID = crypto
	.createHash('sha256')
	.update(`${os.hostname()}:${os.platform()}:${os.arch()}`)
	.digest('hex')
	.slice(0, 16);

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function log(msg: string): void {
	console.log(`[TARX Telemetry] ${msg}`);
}

async function getMeshPeerCount(): Promise<number> {
	try {
		const res = await fetch('http://localhost:11436/mesh/status', {
			signal: AbortSignal.timeout(500),
		});
		if (res.ok) {
			const data = (await res.json()) as { peers?: number };
			return data.peers ?? 0;
		}
	} catch {
		// mesh offline
	}
	return 0;
}

async function getHealthyPorts(): Promise<number[]> {
	const ports = [11435, 11436, 11437, 11438];
	const checks = await Promise.allSettled(
		ports.map(async (port) => {
			const res = await fetch(`http://localhost:${port}/health`, {
				signal: AbortSignal.timeout(300),
			});
			return res.ok ? port : null;
		})
	);
	return checks
		.map((r) => (r.status === 'fulfilled' ? r.value : null))
		.filter((p): p is number => p !== null);
}

async function getMemoryCount(): Promise<number> {
	try {
		const res = await fetch('http://localhost:11438/v1/activity/recent?limit=1', {
			signal: AbortSignal.timeout(500),
		});
		if (res.ok) {
			const data = (await res.json()) as { memory_count?: number };
			return data.memory_count ?? 0;
		}
	} catch {
		// cognitive engine offline
	}
	return 0;
}

function sendTelemetry(payload: Record<string, unknown>): void {
	fetch(TELEMETRY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			...payload,
			machine_id: MACHINE_ID,
			version: process.env.TARX_VERSION ?? '1.0.0',
			platform: os.platform(),
			timestamp: new Date().toISOString(),
		}),
		signal: AbortSignal.timeout(5000),
	}).catch(() => {}); // fire and forget
}

/**
 * Report inference completion. Called after every local LLM response.
 * Non-blocking — gathers network context in background, then sends.
 */
export function reportInference(data: {
	inference_mode: 'local' | 'mesh' | 'cloud';
	tokens_in: number;
	tokens_out: number;
	ttft_ms: number;
	duration_ms: number;
	model: string;
}): void {
	Promise.all([getMeshPeerCount(), getHealthyPorts()])
		.then(([mesh_peers, ports_healthy]) => {
			sendTelemetry({
				event_type: 'inference_complete',
				mesh_peers,
				ports_healthy,
				...data,
			});
		})
		.catch(() => {});
}

/**
 * Report cognitive sync event with current cognitive state.
 * Called after each 5-minute sync cycle in cognitiveSync.ts.
 */
export function reportCognitiveSync(data: {
	focus_depth: number;
	decision_fatigue: number;
	context_switch_rate: number;
	session_count: number;
	message_count: number;
	recommended_style: string;
}): void {
	sendTelemetry({
		event_type: 'cognitive_sync',
		...data,
	});
}

/**
 * Start heartbeat timer. Sends immediately, then every 5 minutes.
 * Call once during extension activation.
 */
export function startHeartbeat(): void {
	if (heartbeatInterval) return;

	const sendHeartbeat = async () => {
		const [mesh_peers, ports_healthy, memory_entries] = await Promise.all([
			getMeshPeerCount(),
			getHealthyPorts(),
			getMemoryCount(),
		]);
		sendTelemetry({
			event_type: 'daemon_heartbeat',
			mesh_peers,
			ports_healthy,
			memory_entries,
		});
	};

	// Send immediately on start, then every 5 minutes
	sendHeartbeat();
	heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
	log('Heartbeat started (5min interval)');
}

/**
 * Stop heartbeat timer. Call during extension deactivation.
 */
export function stopHeartbeat(): void {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
		log('Heartbeat stopped');
	}
}
