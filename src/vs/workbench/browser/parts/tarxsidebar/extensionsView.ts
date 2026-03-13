/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Extensions View - Custom webview for TARX extensions marketplace
 */

export interface TarxExtension {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	installed: boolean;
	category: 'installed' | 'browse';
	icon?: string;
}

const INSTALLED_EXTENSIONS: TarxExtension[] = [
	{
		id: 'tarx-core',
		name: 'TARX Core',
		description: 'Core AI inference engine with local llama-server integration',
		version: '1.0.0',
		author: 'TARX AI',
		installed: true,
		category: 'installed',
		icon: 'brain'
	},
	{
		id: 'tarx-rag',
		name: 'TARX RAG',
		description: 'Retrieval-Augmented Generation with local embeddings and vector search',
		version: '1.0.0',
		author: 'TARX AI',
		installed: true,
		category: 'installed',
		icon: 'book'
	},
	{
		id: 'tarx-mesh',
		name: 'TARX SuperComputer',
		description: 'Distributed SuperComputer for sharing GPU resources across devices',
		version: '1.0.0',
		author: 'TARX AI',
		installed: true,
		category: 'installed',
		icon: 'globe'
	}
];

const BROWSE_EXTENSIONS: TarxExtension[] = [
	{
		id: 'tarx-themes',
		name: 'TARX Themes',
		description: 'Beautiful dark and light themes optimized for AI coding',
		version: '1.0.0',
		author: 'TARX AI',
		installed: false,
		category: 'browse',
		icon: 'paintcan'
	},
	{
		id: 'tarx-voice',
		name: 'TARX Voice',
		description: 'Voice input and TTS output for hands-free coding',
		version: '1.0.0',
		author: 'TARX AI',
		installed: false,
		category: 'browse',
		icon: 'mic'
	},
	{
		id: 'tarx-integrations',
		name: 'TARX Integrations',
		description: 'Connect to GitHub, Jira, Slack, and other developer tools',
		version: '1.0.0',
		author: 'TARX AI',
		installed: false,
		category: 'browse',
		icon: 'plug'
	},
	{
		id: 'tarx-analytics',
		name: 'TARX Analytics',
		description: 'Track your coding productivity and AI usage metrics',
		version: '1.0.0',
		author: 'TARX AI',
		installed: false,
		category: 'browse',
		icon: 'graph'
	},
	{
		id: 'tarx-sentinel',
		name: 'TARX Sentinel',
		description: 'Security scanning and code vulnerability detection',
		version: '1.0.0',
		author: 'TARX AI',
		installed: false,
		category: 'browse',
		icon: 'shield'
	}
];

function renderExtensionCard(ext: TarxExtension): string {
	return `
		<div class="tarx-ext-card" data-ext-id="${ext.id}">
			<div class="tarx-ext-icon"><span class="codicon codicon-${ext.icon || 'package'}"></span></div>
			<div class="tarx-ext-info">
				<div class="tarx-ext-name">${ext.name}</div>
				<div class="tarx-ext-description">${ext.description}</div>
				<div class="tarx-ext-meta">
					<span class="tarx-ext-version">v${ext.version}</span>
					<span class="tarx-ext-author">by ${ext.author}</span>
				</div>
			</div>
			<div class="tarx-ext-actions">
				${ext.installed
					? '<button class="tarx-ext-btn tarx-ext-btn-installed" disabled>Installed</button>'
					: '<button class="tarx-ext-btn tarx-ext-btn-install">Install</button>'
				}
			</div>
		</div>
	`;
}

/**
 * Returns HTML string for the TARX Extensions view
 */
export function getExtensionsHtml(): string {
	const installedCards = INSTALLED_EXTENSIONS.map(renderExtensionCard).join('');
	const browseCards = BROWSE_EXTENSIONS.map(renderExtensionCard).join('');

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>TARX Extensions</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
			font-size: var(--vscode-font-size, 13px);
			color: var(--vscode-foreground, #cccccc);
			background: var(--vscode-editor-background, #1e1e1e);
			padding: 20px;
			line-height: 1.5;
		}

		.tarx-ext-container {
			max-width: 800px;
			margin: 0 auto;
		}

		.tarx-ext-header {
			display: flex;
			align-items: center;
			gap: 12px;
			margin-bottom: 24px;
			padding-bottom: 16px;
			border-bottom: 1px solid var(--vscode-panel-border, #454545);
		}

		.tarx-ext-header h1 {
			font-size: 24px;
			font-weight: 600;
			color: var(--vscode-foreground, #cccccc);
		}

		.tarx-ext-search {
			width: 100%;
			padding: 10px 14px;
			font-size: 14px;
			background: var(--vscode-input-background, #3c3c3c);
			color: var(--vscode-input-foreground, #cccccc);
			border: 1px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 6px;
			outline: none;
			margin-bottom: 20px;
		}

		.tarx-ext-search:focus {
			border-color: var(--vscode-focusBorder, #007acc);
		}

		.tarx-ext-search::placeholder {
			color: var(--vscode-input-placeholderForeground, #888888);
		}

		.tarx-ext-tabs {
			display: flex;
			gap: 0;
			margin-bottom: 20px;
			border-bottom: 1px solid var(--vscode-panel-border, #454545);
		}

		.tarx-ext-tab {
			padding: 10px 20px;
			background: transparent;
			border: none;
			color: var(--vscode-foreground, #cccccc);
			cursor: pointer;
			font-size: 14px;
			border-bottom: 2px solid transparent;
			margin-bottom: -1px;
			transition: all 0.2s;
		}

		.tarx-ext-tab:hover {
			color: var(--vscode-textLink-foreground, #3794ff);
		}

		.tarx-ext-tab.active {
			color: var(--vscode-textLink-foreground, #3794ff);
			border-bottom-color: var(--vscode-textLink-foreground, #3794ff);
		}

		.tarx-ext-tab-badge {
			background: var(--vscode-badge-background, #4d4d4d);
			color: var(--vscode-badge-foreground, #ffffff);
			font-size: 11px;
			padding: 2px 6px;
			border-radius: 10px;
			margin-left: 6px;
		}

		.tarx-ext-section {
			display: none;
		}

		.tarx-ext-section.active {
			display: block;
		}

		.tarx-ext-grid {
			display: flex;
			flex-direction: column;
			gap: 12px;
		}

		.tarx-ext-card {
			display: flex;
			align-items: flex-start;
			gap: 16px;
			padding: 16px;
			background: var(--vscode-list-hoverBackground, #2a2d2e);
			border-radius: 8px;
			border: 1px solid transparent;
			transition: all 0.15s;
		}

		.tarx-ext-card:hover {
			border-color: var(--vscode-focusBorder, #007acc);
			background: var(--vscode-list-activeSelectionBackground, #094771);
		}

		.tarx-ext-icon {
			font-size: 32px;
			width: 48px;
			height: 48px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: var(--vscode-editor-background, #1e1e1e);
			border-radius: 8px;
			flex-shrink: 0;
		}

		.tarx-ext-info {
			flex: 1;
			min-width: 0;
		}

		.tarx-ext-name {
			font-size: 15px;
			font-weight: 600;
			color: var(--vscode-foreground, #cccccc);
			margin-bottom: 4px;
		}

		.tarx-ext-description {
			font-size: 13px;
			color: var(--vscode-descriptionForeground, #888888);
			margin-bottom: 8px;
			line-height: 1.4;
		}

		.tarx-ext-meta {
			display: flex;
			gap: 12px;
			font-size: 12px;
			color: var(--vscode-descriptionForeground, #888888);
		}

		.tarx-ext-actions {
			flex-shrink: 0;
		}

		.tarx-ext-btn {
			padding: 8px 16px;
			font-size: 13px;
			border: none;
			border-radius: 4px;
			cursor: pointer;
			transition: all 0.15s;
		}

		.tarx-ext-btn-install {
			background: var(--vscode-button-background, #0e639c);
			color: var(--vscode-button-foreground, #ffffff);
		}

		.tarx-ext-btn-install:hover {
			background: var(--vscode-button-hoverBackground, #1177bb);
		}

		.tarx-ext-btn-installed {
			background: var(--vscode-button-secondaryBackground, #3c3c3c);
			color: var(--vscode-button-secondaryForeground, #cccccc);
			cursor: default;
		}

		.tarx-ext-empty {
			text-align: center;
			padding: 48px 24px;
			color: var(--vscode-descriptionForeground, #888888);
		}
	</style>
</head>
<body>
	<div class="tarx-ext-container">
		<div class="tarx-ext-header">
			<h1>🧩 TARX Extensions</h1>
		</div>

		<input type="text" class="tarx-ext-search" placeholder="Search extensions..." id="searchInput">

		<div class="tarx-ext-tabs">
			<button class="tarx-ext-tab active" data-tab="installed">
				Installed
				<span class="tarx-ext-tab-badge">${INSTALLED_EXTENSIONS.length}</span>
			</button>
			<button class="tarx-ext-tab" data-tab="browse">
				Browse
				<span class="tarx-ext-tab-badge">${BROWSE_EXTENSIONS.length}</span>
			</button>
		</div>

		<div class="tarx-ext-section active" id="installed">
			<div class="tarx-ext-grid">
				${installedCards}
			</div>
		</div>

		<div class="tarx-ext-section" id="browse">
			<div class="tarx-ext-grid">
				${browseCards}
			</div>
		</div>
	</div>

	<script>
		(function() {
			// Tab switching
			const tabs = document.querySelectorAll('.tarx-ext-tab');
			const sections = document.querySelectorAll('.tarx-ext-section');

			tabs.forEach(tab => {
				tab.addEventListener('click', () => {
					const targetId = tab.dataset.tab;

					tabs.forEach(t => t.classList.remove('active'));
					sections.forEach(s => s.classList.remove('active'));

					tab.classList.add('active');
					document.getElementById(targetId)?.classList.add('active');
				});
			});

			// Search functionality
			const searchInput = document.getElementById('searchInput');
			searchInput?.addEventListener('input', (e) => {
				const query = e.target.value.toLowerCase();
				const cards = document.querySelectorAll('.tarx-ext-card');

				cards.forEach(card => {
					const name = card.querySelector('.tarx-ext-name')?.textContent?.toLowerCase() || '';
					const desc = card.querySelector('.tarx-ext-description')?.textContent?.toLowerCase() || '';

					if (name.includes(query) || desc.includes(query)) {
						card.style.display = 'flex';
					} else {
						card.style.display = 'none';
					}
				});
			});

			// Install button clicks
			document.querySelectorAll('.tarx-ext-btn-install').forEach(btn => {
				btn.addEventListener('click', (e) => {
					const card = e.target.closest('.tarx-ext-card');
					const extId = card?.dataset.extId;
					console.log('[TARX Extensions] Install clicked:', extId);

					// TODO: Send message to VS Code to install extension
					// For now, just show visual feedback
					e.target.textContent = 'Installing...';
					e.target.disabled = true;

					setTimeout(() => {
						e.target.textContent = 'Installed';
						e.target.classList.remove('tarx-ext-btn-install');
						e.target.classList.add('tarx-ext-btn-installed');
					}, 1500);
				});
			});
		})();
	</script>
</body>
</html>
	`;
}

/**
 * Shows the TARX Extensions view as a modal overlay
 * Uses direct DOM manipulation to avoid TrustedHTML/CSP issues
 */
export class TarxExtensionsModal {
	private overlay: HTMLElement | null = null;
	private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

	public show(): void {
		if (this.overlay) {
			return; // Already showing
		}

		// Create overlay
		this.overlay = document.createElement('div');
		this.overlay.className = 'tarx-extensions-overlay';
		this.overlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: var(--vscode-editor-background, #1e1e1e);
			z-index: 9999;
			overflow: auto;
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
			font-size: var(--vscode-font-size, 13px);
			color: var(--vscode-foreground, #cccccc);
			padding: 20px;
			line-height: 1.5;
		`;

		// Create close button
		const closeBtn = document.createElement('button');
		closeBtn.textContent = '✕';
		closeBtn.style.cssText = `
			position: fixed;
			top: 16px;
			right: 16px;
			width: 32px;
			height: 32px;
			border: none;
			background: var(--vscode-button-secondaryBackground, #3c3c3c);
			color: var(--vscode-foreground, #cccccc);
			border-radius: 4px;
			cursor: pointer;
			font-size: 16px;
			z-index: 10000;
		`;
		closeBtn.addEventListener('click', () => this.hide());

		// Create container
		const container = document.createElement('div');
		container.style.cssText = `
			max-width: 800px;
			margin: 0 auto;
		`;

		// Create header
		const header = document.createElement('div');
		header.style.cssText = `
			display: flex;
			align-items: center;
			gap: 12px;
			margin-bottom: 24px;
			padding-bottom: 16px;
			border-bottom: 1px solid var(--vscode-panel-border, #454545);
		`;
		const headerTitle = document.createElement('h1');
		headerTitle.textContent = '🧩 TARX Extensions';
		headerTitle.style.cssText = `
			font-size: 24px;
			font-weight: 600;
			color: var(--vscode-foreground, #cccccc);
			margin: 0;
		`;
		header.appendChild(headerTitle);

		// Create search input
		const searchInput = document.createElement('input');
		searchInput.type = 'text';
		searchInput.placeholder = 'Search extensions...';
		searchInput.style.cssText = `
			width: 100%;
			padding: 10px 14px;
			font-size: 14px;
			background: var(--vscode-input-background, #3c3c3c);
			color: var(--vscode-input-foreground, #cccccc);
			border: 1px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 6px;
			outline: none;
			margin-bottom: 20px;
			box-sizing: border-box;
		`;
		searchInput.addEventListener('focus', () => {
			searchInput.style.borderColor = 'var(--vscode-focusBorder, #007acc)';
		});
		searchInput.addEventListener('blur', () => {
			searchInput.style.borderColor = 'var(--vscode-input-border, #3c3c3c)';
		});

		// Create tabs container
		const tabsContainer = document.createElement('div');
		tabsContainer.style.cssText = `
			display: flex;
			gap: 0;
			margin-bottom: 20px;
			border-bottom: 1px solid var(--vscode-panel-border, #454545);
		`;

		// Create sections
		const installedSection = document.createElement('div');
		installedSection.id = 'installed-section';
		installedSection.style.display = 'block';

		const browseSection = document.createElement('div');
		browseSection.id = 'browse-section';
		browseSection.style.display = 'none';

		// Create tabs
		const installedTab = this.createTab('Installed', INSTALLED_EXTENSIONS.length, true);
		const browseTab = this.createTab('Browse', BROWSE_EXTENSIONS.length, false);

		// Tab click handlers
		installedTab.addEventListener('click', () => {
			installedTab.style.color = 'var(--vscode-textLink-foreground, #3794ff)';
			installedTab.style.borderBottomColor = 'var(--vscode-textLink-foreground, #3794ff)';
			browseTab.style.color = 'var(--vscode-foreground, #cccccc)';
			browseTab.style.borderBottomColor = 'transparent';
			installedSection.style.display = 'block';
			browseSection.style.display = 'none';
		});

		browseTab.addEventListener('click', () => {
			browseTab.style.color = 'var(--vscode-textLink-foreground, #3794ff)';
			browseTab.style.borderBottomColor = 'var(--vscode-textLink-foreground, #3794ff)';
			installedTab.style.color = 'var(--vscode-foreground, #cccccc)';
			installedTab.style.borderBottomColor = 'transparent';
			browseSection.style.display = 'block';
			installedSection.style.display = 'none';
		});

		tabsContainer.appendChild(installedTab);
		tabsContainer.appendChild(browseTab);

		// Create extension grids
		const installedGrid = document.createElement('div');
		installedGrid.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
		INSTALLED_EXTENSIONS.forEach(ext => {
			installedGrid.appendChild(this.createExtensionCard(ext));
		});
		installedSection.appendChild(installedGrid);

		const browseGrid = document.createElement('div');
		browseGrid.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
		BROWSE_EXTENSIONS.forEach(ext => {
			browseGrid.appendChild(this.createExtensionCard(ext));
		});
		browseSection.appendChild(browseGrid);

		// Search functionality
		searchInput.addEventListener('input', () => {
			const query = searchInput.value.toLowerCase();
			const allCards = container.querySelectorAll('.tarx-ext-card') as NodeListOf<HTMLElement>;
			allCards.forEach(card => {
				const name = card.dataset.name?.toLowerCase() || '';
				const desc = card.dataset.desc?.toLowerCase() || '';
				if (name.includes(query) || desc.includes(query)) {
					card.style.display = 'flex';
				} else {
					card.style.display = 'none';
				}
			});
		});

		// Assemble container
		container.appendChild(header);
		container.appendChild(searchInput);
		container.appendChild(tabsContainer);
		container.appendChild(installedSection);
		container.appendChild(browseSection);

		this.overlay.appendChild(closeBtn);
		this.overlay.appendChild(container);
		document.body.appendChild(this.overlay);

		// Close on Escape
		this.keydownHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.hide();
			}
		};
		document.addEventListener('keydown', this.keydownHandler);
	}

	private createTab(label: string, count: number, isActive: boolean): HTMLElement {
		const tab = document.createElement('button');
		tab.style.cssText = `
			padding: 10px 20px;
			background: transparent;
			border: none;
			color: ${isActive ? 'var(--vscode-textLink-foreground, #3794ff)' : 'var(--vscode-foreground, #cccccc)'};
			cursor: pointer;
			font-size: 14px;
			border-bottom: 2px solid ${isActive ? 'var(--vscode-textLink-foreground, #3794ff)' : 'transparent'};
			margin-bottom: -1px;
			transition: all 0.2s;
		`;

		const labelSpan = document.createElement('span');
		labelSpan.textContent = label;

		const badge = document.createElement('span');
		badge.textContent = String(count);
		badge.style.cssText = `
			background: var(--vscode-badge-background, #4d4d4d);
			color: var(--vscode-badge-foreground, #ffffff);
			font-size: 11px;
			padding: 2px 6px;
			border-radius: 10px;
			margin-left: 6px;
		`;

		tab.appendChild(labelSpan);
		tab.appendChild(badge);

		tab.addEventListener('mouseenter', () => {
			tab.style.color = 'var(--vscode-textLink-foreground, #3794ff)';
		});
		tab.addEventListener('mouseleave', () => {
			if (tab.style.borderBottomColor === 'transparent') {
				tab.style.color = 'var(--vscode-foreground, #cccccc)';
			}
		});

		return tab;
	}

	private createExtensionCard(ext: TarxExtension): HTMLElement {
		const card = document.createElement('div');
		card.className = 'tarx-ext-card';
		card.dataset.extId = ext.id;
		card.dataset.name = ext.name;
		card.dataset.desc = ext.description;
		card.style.cssText = `
			display: flex;
			align-items: flex-start;
			gap: 16px;
			padding: 16px;
			background: var(--vscode-list-hoverBackground, #2a2d2e);
			border-radius: 8px;
			border: 1px solid transparent;
			transition: all 0.15s;
		`;

		card.addEventListener('mouseenter', () => {
			card.style.borderColor = 'var(--vscode-focusBorder, #007acc)';
			card.style.background = 'var(--vscode-list-activeSelectionBackground, #094771)';
		});
		card.addEventListener('mouseleave', () => {
			card.style.borderColor = 'transparent';
			card.style.background = 'var(--vscode-list-hoverBackground, #2a2d2e)';
		});

		// Icon
		const icon = document.createElement('div');
		icon.textContent = ext.icon || '📦';
		icon.style.cssText = `
			font-size: 32px;
			width: 48px;
			height: 48px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: var(--vscode-editor-background, #1e1e1e);
			border-radius: 8px;
			flex-shrink: 0;
		`;

		// Info container
		const info = document.createElement('div');
		info.style.cssText = 'flex: 1; min-width: 0;';

		const name = document.createElement('div');
		name.textContent = ext.name;
		name.style.cssText = `
			font-size: 15px;
			font-weight: 600;
			color: var(--vscode-foreground, #cccccc);
			margin-bottom: 4px;
		`;

		const description = document.createElement('div');
		description.textContent = ext.description;
		description.style.cssText = `
			font-size: 13px;
			color: var(--vscode-descriptionForeground, #888888);
			margin-bottom: 8px;
			line-height: 1.4;
		`;

		const meta = document.createElement('div');
		meta.style.cssText = `
			display: flex;
			gap: 12px;
			font-size: 12px;
			color: var(--vscode-descriptionForeground, #888888);
		`;

		const version = document.createElement('span');
		version.textContent = `v${ext.version}`;

		const author = document.createElement('span');
		author.textContent = `by ${ext.author}`;

		meta.appendChild(version);
		meta.appendChild(author);

		info.appendChild(name);
		info.appendChild(description);
		info.appendChild(meta);

		// Actions
		const actions = document.createElement('div');
		actions.style.cssText = 'flex-shrink: 0;';

		const btn = document.createElement('button');
		btn.textContent = ext.installed ? 'Installed' : 'Install';
		btn.disabled = ext.installed;
		btn.style.cssText = `
			padding: 8px 16px;
			font-size: 13px;
			border: none;
			border-radius: 4px;
			cursor: ${ext.installed ? 'default' : 'pointer'};
			background: ${ext.installed ? 'var(--vscode-button-secondaryBackground, #3c3c3c)' : 'var(--vscode-button-background, #0e639c)'};
			color: ${ext.installed ? 'var(--vscode-button-secondaryForeground, #cccccc)' : 'var(--vscode-button-foreground, #ffffff)'};
			transition: all 0.15s;
		`;

		if (!ext.installed) {
			btn.addEventListener('mouseenter', () => {
				btn.style.background = 'var(--vscode-button-hoverBackground, #1177bb)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = 'var(--vscode-button-background, #0e639c)';
			});
			btn.addEventListener('click', () => {
				console.log('[TARX Extensions] Install clicked:', ext.id);
				btn.textContent = 'Installing...';
				btn.disabled = true;
				setTimeout(() => {
					btn.textContent = 'Installed';
					btn.style.background = 'var(--vscode-button-secondaryBackground, #3c3c3c)';
					btn.style.color = 'var(--vscode-button-secondaryForeground, #cccccc)';
					btn.style.cursor = 'default';
				}, 1500);
			});
		}

		actions.appendChild(btn);

		card.appendChild(icon);
		card.appendChild(info);
		card.appendChild(actions);

		return card;
	}

	public hide(): void {
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = null;
		}
		if (this.keydownHandler) {
			document.removeEventListener('keydown', this.keydownHandler);
			this.keydownHandler = null;
		}
	}
}
