/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Telemetry Reporter
 *  - Reports inference metrics to tarx.com/api/telemetry → Datadog
 *  - Fires heartbeats every 5 minutes
 *  - All telemetry is fire-and-forget, never blocks inference
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as crypto from 'crypto';

const TELEMETRY_URL = 'https://tarx.com/api/telemetry';

// Anonymous machine fingerprint — hash of hostname + platform + arch, no PII
const MACHINE_ID = crypto
	.createHash('sha256')
	.update(`${os.hostname()}:${os.platform()}:${os.arch()}`)
	.digest('hex')
	.slice(0, 16);

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

async function getMeshPeerCount(): Promise<number> {
	try {
		const res = await fetch('http://localhost:11436/mesh/peers', {
			signal: AbortSignal.timeout(1000),
		});
		if (res.ok) {
			const data = (await res.json()) as { peers?: unknown[] };
			return data.peers?.length ?? 0;
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
				signal: AbortSignal.timeout(1000),
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
		const res = await fetch('http://localhost:11435/v1/stats', {
			signal: AbortSignal.timeout(1000),
		});
		if (res.ok) {
			const data = (await res.json()) as { memories_count?: number };
			return data.memories_count ?? 0;
		}
	} catch {
		// daemon offline
	}
	return 0;
}

export async function reportInference(data: {
	inference_mode: 'local' | 'mesh' | 'cloud';
	tokens_in: number;
	tokens_out: number;
	ttft_ms: number;
	duration_ms: number;
	model: string;
}): Promise<void> {
	// Never block inference on telemetry
	fetch(TELEMETRY_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			event_type: 'inference_complete',
			machine_id: MACHINE_ID,
			version: process.env.TARX_VERSION ?? 'unknown',
			platform: os.platform(),
			mesh_peers: await getMeshPeerCount(),
			ports_healthy: await getHealthyPorts(),
			...data,
		}),
	}).catch(() => {}); // fire and forget
}

export function startHeartbeat(): void {
	if (heartbeatInterval) return; // already running

	heartbeatInterval = setInterval(async () => {
		fetch(TELEMETRY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				event_type: 'daemon_heartbeat',
				machine_id: MACHINE_ID,
				version: process.env.TARX_VERSION ?? 'unknown',
				platform: os.platform(),
				mesh_peers: await getMeshPeerCount(),
				ports_healthy: await getHealthyPorts(),
				memory_entries: await getMemoryCount(),
			}),
		}).catch(() => {});
	}, 5 * 60 * 1000);
}

export function stopHeartbeat(): void {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}
}
