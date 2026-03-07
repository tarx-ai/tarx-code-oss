// @ts-check
'use strict';

const { Menu, shell } = require('electron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHECK = '\u2705'; // green checkmark
const CROSS = '\u274C'; // red cross

/**
 * Build a service health menu item
 * @param {string} name
 * @param {boolean} up
 * @returns {Electron.MenuItemConstructorOptions}
 */
function serviceItem(name, up) {
	return {
		label: `  ${up ? CHECK : CROSS}  ${name}`,
		enabled: false,
	};
}

/**
 * Get the status line for the header
 * @param {import('./health').ServiceHealth} health
 * @returns {string}
 */
function getStatusLine(health) {
	const downServices = [];
	if (!health.inference) downServices.push('Inference');
	if (!health.embeddings) downServices.push('Embeddings');
	if (!health.mesh) downServices.push('Mesh');
	if (!health.cognitive) downServices.push('Cognitive');

	if (downServices.length === 0) return 'Running on your machine';
	if (downServices.length === 4) return 'All services offline';
	return `${downServices.length} service${downServices.length > 1 ? 's' : ''} down`;
}

/**
 * Check if CLI is installed
 * @returns {boolean}
 */
function isCliInstalled() {
	const tarxBin = path.join(process.env.HOME || '', '.tarx', 'bin', 'tarx');
	return fs.existsSync(tarxBin) || fs.existsSync('/usr/local/bin/tarx');
}

/**
 * Check if Workbench is installed
 * @returns {boolean}
 */
function isWorkbenchInstalled() {
	return [
		'/Applications/TARX Workbench.app',
		path.join(process.env.HOME || '', 'Applications', 'TARX Workbench.app'),
	].some(p => fs.existsSync(p));
}

/**
 * Open Workbench or fall back to tarx.com
 */
function openChat() {
	const workbenchPaths = [
		'/Applications/TARX Workbench.app',
		path.join(process.env.HOME || '', 'Applications', 'TARX Workbench.app'),
	];
	for (const p of workbenchPaths) {
		if (fs.existsSync(p)) {
			exec(`open "${p}"`);
			return;
		}
	}
	shell.openExternal('https://tarx.com');
}

/**
 * Open Workbench
 */
function openWorkbench() {
	const workbenchPaths = [
		'/Applications/TARX Workbench.app',
		path.join(process.env.HOME || '', 'Applications', 'TARX Workbench.app'),
	];
	for (const p of workbenchPaths) {
		if (fs.existsSync(p)) {
			exec(`open "${p}"`);
			return;
		}
	}
	shell.openExternal('https://tarx.com/download');
}

/**
 * Build the context menu from current health state
 * @param {import('./health').ServiceHealth} health
 * @param {() => void} onQuit
 * @returns {Electron.Menu}
 */
function buildMenu(health, onQuit) {
	const statusLine = getStatusLine(health);
	const statusDot = health.status === 'healthy' ? '\u{1F7E2}'
		: health.status === 'degraded' ? '\u{1F7E1}'
		: health.status === 'offline' ? '\u{1F534}'
		: '\u26AA';

	/** @type {Electron.MenuItemConstructorOptions[]} */
	const template = [
		// ── Header ──
		{
			label: `${statusDot}  TARX`,
			enabled: false,
		},
		{
			label: `     ${statusLine}`,
			enabled: false,
		},
		{ type: 'separator' },

		// ── CTAs ──
		{
			label: 'Chat with TARX',
			accelerator: 'CmdOrCtrl+Shift+T',
			click: () => openChat(),
		},
		{
			label: 'Open Workbench',
			click: () => openWorkbench(),
		},
		{ type: 'separator' },

		// ── Service Health ──
		{
			label: 'Services',
			enabled: false,
		},
		serviceItem('Inference     :11435', health.inference),
		serviceItem('Mesh          :11436', health.mesh),
		serviceItem('Embeddings    :11437', health.embeddings),
		serviceItem('Cognitive     :11438', health.cognitive),
		{ type: 'separator' },

		// ── SuperComputer Stats ──
		{
			label: 'SuperComputer',
			enabled: false,
		},
		{
			label: `  Peers: ${health.meshPeers}`,
			enabled: false,
		},
		{
			label: `  Credits: ${health.meshCredits}`,
			enabled: false,
		},
		{ type: 'separator' },

		// ── Model Info ──
		{
			label: 'Model',
			enabled: false,
		},
		{
			label: `  ${health.modelName || 'No model loaded'}`,
			enabled: false,
		},
	];

	// Only show tok/s if we have a reading
	if (health.tokPerSec > 0) {
		template.push({
			label: `  Speed: ${health.tokPerSec.toFixed(1)} tok/s`,
			enabled: false,
		});
	}

	template.push(
		{ type: 'separator' },

		// ── Actions ──
		{
			label: 'Restart Services',
			click: () => {
				const tarxBin = path.join(process.env.HOME || '', '.tarx', 'bin', 'tarx');
				const bin = fs.existsSync(tarxBin) ? tarxBin : 'tarx';
				exec(`"${bin}" stop && sleep 1 && "${bin}" start`);
			},
		},
		{
			label: 'Check for Updates',
			click: () => {
				const tarxBin = path.join(process.env.HOME || '', '.tarx', 'bin', 'tarx');
				const bin = fs.existsSync(tarxBin) ? tarxBin : 'tarx';
				exec(`"${bin}" update`);
			},
		},
		{ type: 'separator' },
		{
			label: 'Quit TARX',
			click: () => onQuit(),
		},
	);

	return Menu.buildFromTemplate(template);
}

module.exports = { buildMenu };
