// @ts-check
'use strict';

const { app, Tray } = require('electron');
const { iconForStatus, getIcons } = require('./src/icons');
const { pollHealth } = require('./src/health');
const { buildMenu } = require('./src/menu');

const POLL_INTERVAL = 10_000; // 10 seconds

/** @type {Electron.Tray | null} */
let tray = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;
/** @type {import('./src/health').ServiceHealth} */
let currentHealth = {
	inference: false,
	embeddings: false,
	mesh: false,
	cognitive: false,
	meshPeers: 0,
	meshCredits: 0,
	modelName: '',
	tokPerSec: 0,
	status: 'unknown',
};

function quit() {
	if (pollTimer) clearInterval(pollTimer);
	if (tray) tray.destroy();
	app.quit();
}

function updateTray() {
	if (!tray) return;
	tray.setImage(iconForStatus(currentHealth.status));
	tray.setContextMenu(buildMenu(currentHealth, quit));
}

async function poll() {
	try {
		currentHealth = await pollHealth();
	} catch {
		currentHealth.status = 'unknown';
	}
	updateTray();
}

// ── Electron setup ──

// No dock icon — tray-only app
app.dock?.hide();

// Prevent quit when all windows are closed (we have no windows)
app.on('window-all-closed', (e) => e.preventDefault());

app.whenReady().then(() => {
	// Pre-render icons
	getIcons();

	// Create tray with loading icon
	tray = new Tray(iconForStatus('unknown'));
	tray.setToolTip('TARX');

	// Left-click shows context menu (same as right-click on macOS)
	tray.on('click', () => {
		tray?.popUpContextMenu();
	});

	// Build initial menu
	updateTray();

	// Start polling
	poll(); // immediate first poll
	pollTimer = setInterval(poll, POLL_INTERVAL);

	console.log('[tarx-tray] Started. Polling every 10s.');
});
