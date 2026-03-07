// @ts-check
'use strict';

const http = require('http');

/** @typedef {{ inference: boolean, embeddings: boolean, mesh: boolean, cognitive: boolean, meshPeers: number, meshCredits: number, modelName: string, tokPerSec: number, status: 'healthy' | 'degraded' | 'offline' | 'unknown' }} ServiceHealth */

const PORTS = {
	inference: 11435,
	mesh: 11436,
	embeddings: 11437,
	cognitive: 11438,
};

const TIMEOUT = 2000;

/**
 * HTTP GET with timeout, returns response body or null
 * @param {number} port
 * @param {string} path
 * @param {number} [timeout]
 * @returns {Promise<string | null>}
 */
function httpGet(port, path, timeout = TIMEOUT) {
	return new Promise((resolve) => {
		const req = http.request({
			hostname: '127.0.0.1',
			port,
			path,
			method: 'GET',
			timeout,
		}, (res) => {
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () => resolve(res.statusCode === 200 ? data : null));
		});
		req.on('error', () => resolve(null));
		req.on('timeout', () => { req.destroy(); resolve(null); });
		req.end();
	});
}

/**
 * Check if a port responds to /health
 * @param {number} port
 * @returns {Promise<boolean>}
 */
async function checkPort(port) {
	const res = await httpGet(port, '/health');
	return res !== null;
}

/**
 * Fetch JSON from a port/path, returns parsed object or null
 * @param {number} port
 * @param {string} path
 * @returns {Promise<any>}
 */
async function fetchJson(port, path) {
	const body = await httpGet(port, path);
	if (!body) return null;
	try { return JSON.parse(body); }
	catch { return null; }
}

/**
 * Poll all services and return health snapshot
 * @returns {Promise<ServiceHealth>}
 */
async function pollHealth() {
	const [inference, embeddings, mesh, cognitive, meshStatus, modelInfo] = await Promise.all([
		checkPort(PORTS.inference),
		checkPort(PORTS.embeddings),
		checkPort(PORTS.mesh),
		checkPort(PORTS.cognitive),
		fetchJson(PORTS.mesh, '/mesh/status'),
		fetchJson(PORTS.inference, '/v1/models'),
	]);

	// Determine overall status
	let status = 'unknown';
	const upCount = [inference, embeddings, mesh, cognitive].filter(Boolean).length;
	if (upCount >= 3) status = 'healthy';
	else if (upCount >= 1) status = 'degraded';
	else status = 'offline';

	// Extract model name from /v1/models response
	let modelName = '';
	let tokPerSec = 0;
	if (modelInfo && modelInfo.data && modelInfo.data.length > 0) {
		modelName = modelInfo.data[0].id || '';
		// Clean up model name (strip path, extension)
		if (modelName.includes('/')) modelName = modelName.split('/').pop();
		if (modelName.endsWith('.gguf')) modelName = modelName.slice(0, -5);
	}

	// Extract mesh stats
	const meshPeers = meshStatus?.peer_count ?? 0;
	const meshCredits = meshStatus?.credits ?? 0;

	return {
		inference,
		embeddings,
		mesh,
		cognitive,
		meshPeers,
		meshCredits,
		modelName,
		tokPerSec,
		status,
	};
}

module.exports = { pollHealth, PORTS };
