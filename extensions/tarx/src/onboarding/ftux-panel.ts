/*---------------------------------------------------------------------------------------------
 *  TARX First Time User Experience (FTUX) Panel
 *
 *  Branded 3-screen webview shown on first launch:
 *    Screen 1: Invite code entry (+ ChatGPT import option)
 *    Screen 2: Profile confirmation (role, project, prompts, skills)
 *    Screen 3: Ready state (first prompt CTA)
 *
 *  Replaces the old InputBox invite flow with a full branded experience.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
	validateMCPInviteCode,
	redeemMCPInviteCode,
	updateOnboardingState,
	seedRAGWithProfile,
	createMCPSpace,
	createMCPSession
} from '../mcpKnowledge.js';
import {
	parseInviteProfile,
	profileToPrompts,
	profileToSkills,
	profileToRAGDocument,
	InviteProfile
} from '../invite/invite-system.js';

// ============================================================================
// FTUX PANEL
// ============================================================================

export class TarxFTUXPanel {
	public static readonly viewType = 'tarx.ftux';
	private panel: vscode.WebviewPanel | undefined;
	private resolvePromise: ((result: FTUXResult) => void) | undefined;

	constructor(private context: vscode.ExtensionContext) {}

	/**
	 * Show the FTUX panel and wait for completion.
	 * Returns the result of the onboarding flow.
	 */
	async show(): Promise<FTUXResult> {
		return new Promise<FTUXResult>((resolve) => {
			this.resolvePromise = resolve;

			this.panel = vscode.window.createWebviewPanel(
				TarxFTUXPanel.viewType,
				'Welcome to TARX',
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true
				}
			);

			this.panel.webview.html = this.getHTML();

			this.panel.webview.onDidReceiveMessage(
				(msg) => this.handleMessage(msg),
				undefined,
				this.context.subscriptions
			);

			this.panel.onDidDispose(() => {
				if (this.resolvePromise) {
					this.resolvePromise({ completed: false, skipped: true });
					this.resolvePromise = undefined;
				}
			});
		});
	}

	private close(result: FTUXResult): void {
		this.panel?.dispose();
		if (this.resolvePromise) {
			this.resolvePromise(result);
			this.resolvePromise = undefined;
		}
	}

	// ============================================================================
	// MESSAGE HANDLING
	// ============================================================================

	private async handleMessage(msg: { command: string; [key: string]: unknown }): Promise<void> {
		switch (msg.command) {
			case 'validateInviteCode': {
				const code = (msg.code as string || '').trim().toUpperCase();
				const result = await validateMCPInviteCode(code);

				if (result.valid) {
					const profile = parseInviteProfile(code, result.metadata);

					if (profile) {
						// Profile found in metadata — show confirmation screen
						const prompts = profileToPrompts(profile);
						const skills = profileToSkills(profile);

						this.panel?.webview.postMessage({
							type: 'profileLoaded',
							data: { name: profile.name, role: profile.role, project: profile.project, prompts, skills, code }
						});
					} else {
						// Valid code but no profile metadata — skip to ready
						await redeemMCPInviteCode(code);
						await this.context.globalState.update('tarx.inviteValidated', true);
						await this.context.globalState.update('tarx.inviteTier', result.tier);
						await updateOnboardingState('complete', { invite_code: code });

						this.panel?.webview.postMessage({ type: 'noProfile', data: { code, tier: result.tier } });
					}
				} else {
					this.panel?.webview.postMessage({ type: 'invalidCode' });
				}
				break;
			}

			case 'confirmProfile': {
				const code = msg.code as string;
				const profileData = msg.profile as InviteProfile;

				// 1. Redeem the invite code
				await redeemMCPInviteCode(code);

				// 2. Cache validation
				await this.context.globalState.update('tarx.inviteValidated', true);
				await this.context.globalState.update('tarx.inviteTier', 'beta');

				// 3. Seed RAG with profile
				const ragDoc = profileToRAGDocument(profileData);
				await seedRAGWithProfile(ragDoc);

				// 4. Create first space
				const spaceName = profileData.project || `${profileData.name}'s Workspace`;
				await createMCPSpace(spaceName, `Created during onboarding for ${profileData.name}`, '🚀');

				// 5. Update onboarding state
				await updateOnboardingState('complete', {
					invite_code: code,
					profile_confirmed: true
				});

				// 6. Send ready signal
				const prompts = profileToPrompts(profileData);
				this.panel?.webview.postMessage({
					type: 'setupComplete',
					data: { firstPrompt: prompts[0] || 'What can you help me with?' }
				});
				break;
			}

			case 'skipOnboarding': {
				await this.context.globalState.update('tarx.inviteValidated', true);
				await this.context.globalState.update('tarx.inviteTier', 'beta');
				await updateOnboardingState('complete');
				this.close({ completed: true, skipped: true });
				break;
			}

			case 'importChatGPT': {
				vscode.commands.executeCommand('tarx.importChatGPT');
				break;
			}

			case 'sendFirstPrompt': {
				const prompt = msg.prompt as string;
				this.close({ completed: true, skipped: false, firstPrompt: prompt });
				// Send the prompt to chat after panel closes
				setTimeout(() => {
					vscode.commands.executeCommand('tarx.chat.send', prompt);
				}, 500);
				break;
			}

			case 'ftuxComplete': {
				this.close({ completed: true, skipped: false });
				break;
			}
		}
	}

	// ============================================================================
	// HTML GENERATION
	// ============================================================================

	private getHTML(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root {
	--bg-primary: #0d0d1a;
	--bg-card: rgba(30, 30, 50, 0.85);
	--border-glow: rgba(64, 182, 251, 0.25);
	--accent-cyan: #40B6FB;
	--accent-pink: #FF326D;
	--text-primary: #e8e8f0;
	--text-secondary: #8888a8;
	--text-muted: #555570;
	--success: #22c55e;
	--error: #ef4444;
	--radius: 12px;
	--font: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
	background: var(--bg-primary);
	color: var(--text-primary);
	font-family: var(--font);
	display: flex;
	justify-content: center;
	align-items: center;
	min-height: 100vh;
	overflow: hidden;
}

.screen {
	display: none;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	width: 100%;
	max-width: 520px;
	padding: 40px 32px;
	animation: fadeIn 0.4s ease;
}
.screen.active { display: flex; }

@keyframes fadeIn {
	from { opacity: 0; transform: translateY(16px); }
	to { opacity: 1; transform: translateY(0); }
}

/* Logo */
.logo {
	font-size: 48px;
	font-weight: 800;
	letter-spacing: -2px;
	margin-bottom: 8px;
	background: linear-gradient(135deg, var(--accent-cyan), var(--accent-pink));
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
}

h1 {
	font-size: 28px;
	font-weight: 700;
	margin-bottom: 8px;
	color: var(--text-primary);
}

.subtitle {
	font-size: 16px;
	color: var(--text-secondary);
	margin-bottom: 32px;
}

/* Cards */
.card {
	width: 100%;
	background: var(--bg-card);
	border: 1px solid var(--border-glow);
	border-radius: var(--radius);
	padding: 24px;
	margin-bottom: 20px;
	backdrop-filter: blur(12px);
}

/* Invite Input */
.invite-group {
	display: flex;
	gap: 10px;
	width: 100%;
	margin-bottom: 16px;
}

.invite-input {
	flex: 1;
	background: rgba(255,255,255,0.06);
	border: 1px solid rgba(255,255,255,0.12);
	border-radius: 8px;
	padding: 14px 16px;
	font-size: 18px;
	font-family: 'SF Mono', 'Fira Code', monospace;
	color: var(--text-primary);
	letter-spacing: 1.5px;
	text-transform: uppercase;
	outline: none;
	transition: border-color 0.2s;
}
.invite-input:focus {
	border-color: var(--accent-cyan);
	box-shadow: 0 0 0 3px rgba(64, 182, 251, 0.15);
}
.invite-input.error {
	border-color: var(--error);
	box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

/* Buttons */
.btn {
	padding: 12px 24px;
	border: none;
	border-radius: 8px;
	font-size: 15px;
	font-weight: 600;
	cursor: pointer;
	transition: all 0.2s;
	font-family: var(--font);
}
.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-primary {
	background: var(--accent-cyan);
	color: #000;
}
.btn-primary:hover:not(:disabled) {
	background: #5cc4ff;
	transform: translateY(-1px);
}

.btn-secondary {
	background: transparent;
	color: var(--text-secondary);
	border: 1px solid rgba(255,255,255,0.12);
}
.btn-secondary:hover:not(:disabled) {
	border-color: var(--accent-cyan);
	color: var(--accent-cyan);
}

.btn-full {
	width: 100%;
	padding: 14px;
	font-size: 16px;
}

.btn-import {
	background: rgba(255,255,255,0.06);
	color: var(--text-secondary);
	border: 1px dashed rgba(255,255,255,0.15);
	width: 100%;
	padding: 14px;
	margin-top: 8px;
}
.btn-import:hover {
	border-color: var(--accent-cyan);
	color: var(--accent-cyan);
	background: rgba(64, 182, 251, 0.06);
}

/* Error/info messages */
.msg { font-size: 13px; margin-bottom: 12px; min-height: 20px; }
.msg.error { color: var(--error); }
.msg.info { color: var(--accent-cyan); }

/* Skip link */
.skip {
	margin-top: 24px;
	font-size: 13px;
}
.skip a {
	color: var(--text-muted);
	cursor: pointer;
	text-decoration: none;
	transition: color 0.2s;
}
.skip a:hover { color: var(--text-secondary); }

/* Divider */
.divider {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 12px;
	margin: 20px 0;
	color: var(--text-muted);
	font-size: 12px;
	text-transform: uppercase;
	letter-spacing: 1px;
}
.divider::before, .divider::after {
	content: '';
	flex: 1;
	height: 1px;
	background: rgba(255,255,255,0.08);
}

/* Profile card */
.profile-row {
	display: flex;
	justify-content: space-between;
	padding: 10px 0;
	border-bottom: 1px solid rgba(255,255,255,0.06);
}
.profile-row:last-child { border-bottom: none; }
.profile-label { color: var(--text-secondary); font-size: 14px; }
.profile-value { color: var(--text-primary); font-size: 14px; font-weight: 600; }

/* Chips */
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.chip {
	padding: 6px 14px;
	border-radius: 20px;
	font-size: 13px;
	background: rgba(64, 182, 251, 0.1);
	color: var(--accent-cyan);
	border: 1px solid rgba(64, 182, 251, 0.2);
}
.chip.skill {
	background: rgba(255, 50, 109, 0.1);
	color: var(--accent-pink);
	border-color: rgba(255, 50, 109, 0.2);
}

/* Section headers */
.section-label {
	font-size: 12px;
	text-transform: uppercase;
	letter-spacing: 1px;
	color: var(--text-muted);
	margin: 20px 0 8px;
}

/* Ready screen */
.checkmark {
	width: 80px;
	height: 80px;
	border-radius: 50%;
	background: linear-gradient(135deg, var(--accent-cyan), var(--accent-pink));
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 40px;
	margin-bottom: 20px;
	animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes scaleIn {
	from { transform: scale(0); opacity: 0; }
	to { transform: scale(1); opacity: 1; }
}

.prompt-btn {
	width: 100%;
	padding: 16px;
	background: rgba(64, 182, 251, 0.08);
	border: 1px solid rgba(64, 182, 251, 0.2);
	border-radius: var(--radius);
	color: var(--text-primary);
	font-size: 15px;
	cursor: pointer;
	transition: all 0.2s;
	text-align: left;
	font-family: var(--font);
	margin-bottom: 8px;
}
.prompt-btn:hover {
	background: rgba(64, 182, 251, 0.15);
	border-color: var(--accent-cyan);
	transform: translateX(4px);
}

/* Buttons row */
.btn-row {
	display: flex;
	gap: 12px;
	width: 100%;
	margin-top: 8px;
}
.btn-row .btn { flex: 1; }

/* Loading spinner */
.spinner {
	display: inline-block;
	width: 18px;
	height: 18px;
	border: 2px solid rgba(255,255,255,0.2);
	border-top-color: var(--accent-cyan);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
	margin-right: 8px;
	vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<!-- SCREEN 1: Invite Code Entry -->
<div class="screen active" id="screen-invite">
	<div class="logo">TARX</div>
	<h1>Welcome</h1>
	<p class="subtitle">Local. Private. Proactive.</p>

	<div class="card">
		<div class="invite-group">
			<input type="text"
				class="invite-input"
				id="inviteCode"
				placeholder="TARX-WORD-1234"
				maxlength="20"
				autocomplete="off"
				spellcheck="false" />
			<button class="btn btn-primary" id="btnActivate" onclick="validateCode()">Activate</button>
		</div>
		<div class="msg" id="inviteMsg"></div>
	</div>

	<div class="divider">or switch from another AI</div>

	<button class="btn btn-import" onclick="importChatGPT()">
		Import from ChatGPT
	</button>

	<p class="skip">
		<a onclick="skipOnboarding()">Continue without invite code</a>
	</p>
</div>

<!-- SCREEN 2: Profile Confirmation -->
<div class="screen" id="screen-profile">
	<h1>Here's what TARX prepared for you</h1>
	<p class="subtitle">We set up your workspace based on your profile</p>

	<div class="card">
		<div class="profile-row">
			<span class="profile-label">Name</span>
			<span class="profile-value" id="profileName">—</span>
		</div>
		<div class="profile-row">
			<span class="profile-label">Role</span>
			<span class="profile-value" id="profileRole">—</span>
		</div>
		<div class="profile-row">
			<span class="profile-label">Project</span>
			<span class="profile-value" id="profileProject">—</span>
		</div>
	</div>

	<div class="section-label">Starter Prompts</div>
	<div class="chips" id="promptChips"></div>

	<div class="section-label">Skills Activated</div>
	<div class="chips" id="skillChips"></div>

	<div class="btn-row" style="margin-top:24px">
		<button class="btn btn-primary btn-full" id="btnConfirm" onclick="confirmProfile()">Looks good — let's go</button>
	</div>
	<p class="skip">
		<a onclick="skipOnboarding()">Skip personalization</a>
	</p>
</div>

<!-- SCREEN 3: Ready -->
<div class="screen" id="screen-ready">
	<div class="checkmark">&#10003;</div>
	<h1>TARX is ready</h1>
	<p class="subtitle">Your workspace is set up. Your prompts are loaded. Let's build.</p>

	<div class="section-label" style="margin-top:24px">Try your first prompt</div>
	<div id="readyPrompts" style="width:100%"></div>

	<button class="btn btn-secondary btn-full" style="margin-top:16px" onclick="closeFTUX()">
		I'll explore on my own
	</button>
</div>

<script>
const vscode = acquireVsCodeApi();

// State
let currentProfile = null;
let currentCode = '';
let currentPrompts = [];

// ── Screen 1: Invite Code ──

const codeInput = document.getElementById('inviteCode');
codeInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') validateCode();
});
// Auto-uppercase
codeInput.addEventListener('input', () => {
	codeInput.value = codeInput.value.toUpperCase();
});

function validateCode() {
	const code = codeInput.value.trim();
	if (!code) {
		showMsg('inviteMsg', 'Enter your invite code', 'error');
		return;
	}
	showMsg('inviteMsg', '<span class="spinner"></span>Validating...', 'info');
	document.getElementById('btnActivate').disabled = true;
	codeInput.classList.remove('error');
	vscode.postMessage({ command: 'validateInviteCode', code });
}

function importChatGPT() {
	vscode.postMessage({ command: 'importChatGPT' });
}

function skipOnboarding() {
	vscode.postMessage({ command: 'skipOnboarding' });
}

// ── Screen 2: Profile Confirmation ──

function confirmProfile() {
	document.getElementById('btnConfirm').disabled = true;
	document.getElementById('btnConfirm').innerHTML = '<span class="spinner"></span>Setting up...';
	vscode.postMessage({ command: 'confirmProfile', code: currentCode, profile: currentProfile });
}

// ── Screen 3: Ready ──

function sendFirstPrompt(prompt) {
	vscode.postMessage({ command: 'sendFirstPrompt', prompt });
}

function closeFTUX() {
	vscode.postMessage({ command: 'ftuxComplete' });
}

// ── Messaging ──

window.addEventListener('message', (event) => {
	const msg = event.data;

	switch (msg.type) {
		case 'profileLoaded': {
			const d = msg.data;
			currentCode = d.code;
			currentProfile = { code: d.code, name: d.name, role: d.role, project: d.project };
			currentPrompts = d.prompts || [];

			document.getElementById('profileName').textContent = d.name || '—';
			document.getElementById('profileRole').textContent = d.role || '—';
			document.getElementById('profileProject').textContent = d.project || '—';

			const promptChips = document.getElementById('promptChips');
			promptChips.innerHTML = (d.prompts || []).map(p =>
				'<span class="chip">' + escapeHtml(p) + '</span>'
			).join('');

			const skillChips = document.getElementById('skillChips');
			skillChips.innerHTML = (d.skills || []).map(s =>
				'<span class="chip skill">' + escapeHtml(s) + '</span>'
			).join('');

			showScreen('screen-profile');
			break;
		}

		case 'noProfile': {
			// Valid code but no profile — go straight to ready
			currentPrompts = ['What can you help me with?', 'Show me what TARX can do'];
			showReadyScreen();
			break;
		}

		case 'invalidCode': {
			showMsg('inviteMsg', 'Invalid or expired invite code', 'error');
			document.getElementById('btnActivate').disabled = false;
			codeInput.classList.add('error');
			codeInput.focus();
			break;
		}

		case 'setupComplete': {
			currentPrompts = currentPrompts.length > 0 ? currentPrompts : ['What can you help me with?'];
			if (msg.data?.firstPrompt && !currentPrompts.includes(msg.data.firstPrompt)) {
				currentPrompts.unshift(msg.data.firstPrompt);
			}
			showReadyScreen();
			break;
		}
	}
});

// ── Helpers ──

function showScreen(id) {
	document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
	document.getElementById(id).classList.add('active');
}

function showReadyScreen() {
	const container = document.getElementById('readyPrompts');
	container.innerHTML = currentPrompts.slice(0, 3).map(p =>
		'<button class="prompt-btn" onclick="sendFirstPrompt(this.textContent)">' + escapeHtml(p) + '</button>'
	).join('');
	showScreen('screen-ready');
}

function showMsg(id, html, cls) {
	const el = document.getElementById(id);
	el.innerHTML = html;
	el.className = 'msg ' + (cls || '');
}

function escapeHtml(str) {
	const div = document.createElement('div');
	div.textContent = str;
	return div.innerHTML;
}

// Focus input on load
setTimeout(() => codeInput.focus(), 100);
</script>
</body>
</html>`;
	}
}

// ============================================================================
// TYPES
// ============================================================================

export interface FTUXResult {
	completed: boolean;
	skipped: boolean;
	firstPrompt?: string;
}
