/**
 * TARX Sidebar Color System
 * Neon Cyberpunk color-coded projects with Shadcn-style minimal UI
 *
 * @file extensions/tarx/src/sidebar-color.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// ========================================
// NEON CYBERPUNK PALETTE
// ========================================

export const NEON_PALETTE = {
	electricBlue: '#00F0FF',
	neonPurple: '#B026FF',
	cyberPink: '#FF2E97',
	plasmaGreen: '#00FF94',
	violetGlow: '#7B2FF7',
	neonMint: '#00FFCC',
	hotMagenta: '#FF00B8',
	azureBright: '#0080FF',
	lavaOrange: '#FF6B00',
	hologramBlue: '#4D4DFF',
	limeShock: '#CCFF00',
} as const;

export const NEON_COLORS = Object.values(NEON_PALETTE);
export type NeonColor = typeof NEON_COLORS[number];

export const TARX_COLORS = {
	// Primary brand colors
	primary: '#0066FF',      // TARX Blue
	primaryLight: '#3385FF',
	primaryDark: '#0052CC',

	// Neon project color presets
	presets: [
		{ name: 'Electric Blue', hex: NEON_PALETTE.electricBlue },
		{ name: 'Neon Purple', hex: NEON_PALETTE.neonPurple },
		{ name: 'Cyber Pink', hex: NEON_PALETTE.cyberPink },
		{ name: 'Plasma Green', hex: NEON_PALETTE.plasmaGreen },
		{ name: 'Violet Glow', hex: NEON_PALETTE.violetGlow },
		{ name: 'Neon Mint', hex: NEON_PALETTE.neonMint },
		{ name: 'Hot Magenta', hex: NEON_PALETTE.hotMagenta },
		{ name: 'Azure Bright', hex: NEON_PALETTE.azureBright },
		{ name: 'Lava Orange', hex: NEON_PALETTE.lavaOrange },
		{ name: 'Hologram Blue', hex: NEON_PALETTE.hologramBlue },
		{ name: 'Lime Shock', hex: NEON_PALETTE.limeShock },
	],

	// Semantic colors (neon style)
	success: '#00FF94',
	warning: '#FF6B00',
	error: '#FF2E97',
	info: '#00F0FF',

	// Neutral (Shadcn-style)
	background: '#FFFFFF',
	backgroundDark: '#09090B',
	foreground: '#09090B',
	foregroundDark: '#FAFAFA',
	muted: '#F4F4F5',
	mutedDark: '#27272A',
	border: '#E4E4E7',
	borderDark: '#27272A',
};

// ========================================
// COLOR UTILITIES
// ========================================

/**
 * Hash a string to get a consistent index (djb2 algorithm)
 */
export function hashString(str: string): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
	}
	return Math.abs(hash);
}

/**
 * Get a consistent color for a project based on its name or ID
 */
export function getProjectColorFromHash(projectNameOrId: string): NeonColor {
	const index = hashString(projectNameOrId) % NEON_COLORS.length;
	return NEON_COLORS[index];
}

/**
 * Get color index for data attribute
 */
export function getColorIndex(projectId: string): number {
	return hashString(projectId) % NEON_COLORS.length;
}

/**
 * Convert hex color to RGBA with alpha
 */
export function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Generate a gradient for active tabs
 */
export function getGradient(color: string, direction: 'horizontal' | 'vertical' = 'horizontal'): string {
	const angle = direction === 'horizontal' ? '90deg' : '180deg';
	return `linear-gradient(${angle}, ${hexToRgba(color, 0.2)} 0%, ${hexToRgba(color, 0.05)} 100%)`;
}

// ========================================
// PROJECT COLOR MANAGEMENT
// ========================================

export interface ProjectWithColor {
	id: string;
	name: string;
	root: string;
	color: string;
	isActive: boolean;
}

/**
 * Get all projects with their colors from DB
 */
export async function getProjectsWithColors(): Promise<ProjectWithColor[]> {
	const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

	try {
		const result = execSync(`sqlite3 "${dbPath}" -json "SELECT id, name, root, color, is_active FROM projects"`, {
			encoding: 'utf8'
		});

		const rows = JSON.parse(result || '[]') as Array<{
			id: string;
			name: string;
			root: string;
			color: string;
			is_active: number;
		}>;

		return rows.map(row => ({
			id: row.id,
			name: row.name,
			root: row.root,
			// Use hash-based color if no color set
			color: row.color || getProjectColorFromHash(row.id || row.name),
			isActive: row.is_active === 1
		}));
	} catch (e) {
		console.error('[TARX] Failed to get projects with colors:', e);
		return [];
	}
}

/**
 * Update project color in DB
 */
export async function setProjectColor(projectId: string, color: string): Promise<boolean> {
	const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

	try {
		execSync(`sqlite3 "${dbPath}" "UPDATE projects SET color = '${color}' WHERE id = '${projectId}'"`, {
			encoding: 'utf8'
		});
		return true;
	} catch (e) {
		console.error('[TARX] Failed to set project color:', e);
		return false;
	}
}

/**
 * Show color picker for project
 */
export async function pickProjectColor(projectId: string, currentColor?: string): Promise<string | undefined> {
	interface ColorPickItem {
		label: string;
		description: string;
		color: string;
		picked: boolean;
	}

	const items: ColorPickItem[] = TARX_COLORS.presets.map(preset => ({
		label: preset.name,
		description: preset.hex,
		color: preset.hex,
		picked: preset.hex === currentColor
	}));

	// Add custom option
	items.push({
		label: 'Custom Color',
		description: 'Enter hex code',
		color: 'custom',
		picked: false
	});

	const selected = await vscode.window.showQuickPick(items, {
		title: 'Choose Project Color',
		placeHolder: 'Select a neon color for this project'
	});

	if (!selected) return undefined;

	if (selected.color === 'custom') {
		const customColor = await vscode.window.showInputBox({
			title: 'Custom Color',
			prompt: 'Enter hex color code',
			placeHolder: '#00F0FF',
			value: currentColor || '#00F0FF',
			validateInput: (value) => {
				if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
					return 'Invalid hex color (use format #RRGGBB)';
				}
				return null;
			}
		});
		return customColor;
	}

	return selected.color;
}

// ========================================
// COLORED TREE ITEMS
// ========================================

/**
 * Create a colored folder icon using ThemeColor
 */
export function getColoredFolderIcon(color: string, isActive: boolean): vscode.ThemeIcon {
	// Map neon color to closest ThemeColor
	const colorMap: Record<string, string> = {
		[NEON_PALETTE.electricBlue]: 'charts.blue',
		[NEON_PALETTE.neonPurple]: 'charts.purple',
		[NEON_PALETTE.cyberPink]: 'charts.red',
		[NEON_PALETTE.plasmaGreen]: 'charts.green',
		[NEON_PALETTE.violetGlow]: 'charts.purple',
		[NEON_PALETTE.neonMint]: 'charts.green',
		[NEON_PALETTE.hotMagenta]: 'charts.red',
		[NEON_PALETTE.azureBright]: 'charts.blue',
		[NEON_PALETTE.lavaOrange]: 'charts.orange',
		[NEON_PALETTE.hologramBlue]: 'charts.blue',
		[NEON_PALETTE.limeShock]: 'charts.yellow',
	};

	const themeColor = colorMap[color] || 'charts.blue';
	const iconName = isActive ? 'folder-opened' : 'folder';

	return new vscode.ThemeIcon(iconName, new vscode.ThemeColor(themeColor));
}

/**
 * Create colored project tree item
 */
export class ColoredProjectItem extends vscode.TreeItem {
	constructor(
		public readonly project: ProjectWithColor,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
	) {
		super(project.name, collapsibleState);

		this.contextValue = project.isActive ? 'activeProject' : 'project';
		this.iconPath = getColoredFolderIcon(project.color, project.isActive);
		this.tooltip = `${project.name}\n${project.root}\nColor: ${project.color}`;
		this.description = project.isActive ? '● Active' : '';

		// Click to set active
		this.command = {
			command: 'tarx.setActiveProject',
			title: 'Set Active',
			arguments: [project.id]
		};
	}
}

// ========================================
// TAB & UI STYLING (CSS GENERATION)
// ========================================

/**
 * Generate CSS for colored active tab with neon glow
 */
export function generateTabCSS(color: string): string {
	return `
/* TARX Active Tab Color - Neon Glow */
.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active {
	border-bottom: 2px solid ${color} !important;
	box-shadow: 0 2px 8px ${hexToRgba(color, 0.3)} !important;
}

.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active .tab-label {
	color: ${color} !important;
	text-shadow: 0 0 8px ${hexToRgba(color, 0.5)};
}

/* TARX Chat Panel Header - Neon Border */
.monaco-workbench .part.panel .pane-header.expanded {
	border-left: 3px solid ${color};
	background: ${getGradient(color, 'horizontal')};
}

/* TARX Sidebar Project Highlight */
.tarx-project-active {
	background: ${getGradient(color, 'horizontal')} !important;
	border-left: 3px solid ${color} !important;
	box-shadow: inset 0 0 20px ${hexToRgba(color, 0.1)};
}

/* Neon Focus Ring */
.tarx-focus-ring:focus {
	outline: none;
	box-shadow: 0 0 0 2px ${hexToRgba(color, 0.5)}, 0 0 12px ${hexToRgba(color, 0.3)};
}

/* Neon Glow Animation */
@keyframes tarx-neon-pulse {
	0%, 100% { box-shadow: 0 0 5px ${hexToRgba(color, 0.5)}; }
	50% { box-shadow: 0 0 20px ${hexToRgba(color, 0.8)}, 0 0 30px ${hexToRgba(color, 0.4)}; }
}

.tarx-neon-glow {
	animation: tarx-neon-pulse 2s ease-in-out infinite;
}
`;
}

/**
 * Generate complete sidebar CSS with neon theme
 */
export function generateSidebarCSS(): string {
	return `
/* ============================================================
   TARX SIDEBAR - Neon Cyberpunk Theme
   ============================================================ */

:root {
  /* Neon Palette */
  --electric-blue: ${NEON_PALETTE.electricBlue};
  --neon-purple: ${NEON_PALETTE.neonPurple};
  --cyber-pink: ${NEON_PALETTE.cyberPink};
  --plasma-green: ${NEON_PALETTE.plasmaGreen};
  --violet-glow: ${NEON_PALETTE.violetGlow};
  --neon-mint: ${NEON_PALETTE.neonMint};
  --hot-magenta: ${NEON_PALETTE.hotMagenta};
  --azure-bright: ${NEON_PALETTE.azureBright};
  --lava-orange: ${NEON_PALETTE.lavaOrange};
  --hologram-blue: ${NEON_PALETTE.hologramBlue};
  --lime-shock: ${NEON_PALETTE.limeShock};

  /* Shadcn tokens */
  --radius: 6px;
  --ring: 2px;
  --transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ============================================================
   PROJECT ITEM STYLING
   ============================================================ */

.tarx-project-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin: 2px 8px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition);
  border-left: 3px solid transparent;
  position: relative;
}

.tarx-project-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.tarx-project-item.active {
  background: var(--vscode-list-activeSelectionBackground);
}

/* Color-coded per index */
${NEON_COLORS.map((color, i) => `
.tarx-project-item[data-color-index="${i}"] {
  border-left-color: ${color};
}

.tarx-project-item[data-color-index="${i}"] .project-icon {
  color: ${color};
  filter: drop-shadow(0 0 3px ${hexToRgba(color, 0.5)});
}

.tarx-project-item[data-color-index="${i}"] .project-name {
  color: ${color};
}

.tarx-project-item[data-color-index="${i}"]:hover {
  background: ${hexToRgba(color, 0.1)};
  box-shadow: inset 0 0 15px ${hexToRgba(color, 0.08)};
}

.tarx-project-item[data-color-index="${i}"].active {
  background: linear-gradient(90deg, ${hexToRgba(color, 0.2)} 0%, transparent 100%);
  box-shadow: inset 0 0 25px ${hexToRgba(color, 0.15)};
}

.tarx-project-item[data-color-index="${i}"].active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: ${color};
  box-shadow: 0 0 8px ${color};
}
`).join('')}

/* Project icon */
.tarx-project-item .project-icon {
  width: 16px;
  height: 16px;
  margin-right: 8px;
  flex-shrink: 0;
  transition: all var(--transition);
}

.tarx-project-item:hover .project-icon {
  transform: scale(1.1);
}

/* Project name */
.tarx-project-item .project-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--transition);
}

/* ============================================================
   ACTIVE CHAT TAB STYLING
   ============================================================ */

.tarx-chat-tab {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: var(--radius) var(--radius) 0 0;
  cursor: pointer;
  transition: all var(--transition);
  position: relative;
}

.tarx-chat-tab::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: transparent;
  transition: all var(--transition);
}

/* Color-coded active tabs */
${NEON_COLORS.map((color, i) => `
.tarx-chat-tab[data-color-index="${i}"].active {
  background: linear-gradient(180deg, ${hexToRgba(color, 0.15)} 0%, transparent 100%);
}

.tarx-chat-tab[data-color-index="${i}"].active::after {
  background: ${color};
  box-shadow: 0 0 12px ${hexToRgba(color, 0.6)}, 0 2px 4px ${hexToRgba(color, 0.4)};
}

.tarx-chat-tab[data-color-index="${i}"] .tab-icon {
  color: ${color};
  filter: drop-shadow(0 0 4px ${hexToRgba(color, 0.5)});
}
`).join('')}

/* ============================================================
   CONVERSATION HISTORY ITEM
   ============================================================ */

.tarx-history-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  margin: 1px 8px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: all var(--transition);
  border-left: 2px solid transparent;
}

${NEON_COLORS.map((color, i) => `
.tarx-history-item[data-color-index="${i}"] {
  border-left-color: ${hexToRgba(color, 0.4)};
}

.tarx-history-item[data-color-index="${i}"]:hover {
  background: ${hexToRgba(color, 0.08)};
  border-left-color: ${color};
}

.tarx-history-item[data-color-index="${i}"] .history-time {
  color: ${color};
}
`).join('')}

/* ============================================================
   MEMORY/RAG INDICATOR
   ============================================================ */

.tarx-memory-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 500;
}

${NEON_COLORS.map((color, i) => `
.tarx-memory-indicator[data-color-index="${i}"] {
  background: ${hexToRgba(color, 0.15)};
  color: ${color};
  border: 1px solid ${hexToRgba(color, 0.3)};
  text-shadow: 0 0 4px ${hexToRgba(color, 0.3)};
}
`).join('')}

/* ============================================================
   NEON GLOW EFFECTS
   ============================================================ */

@keyframes neon-pulse {
  0%, 100% {
    opacity: 0.7;
    filter: brightness(1);
  }
  50% {
    opacity: 1;
    filter: brightness(1.2);
  }
}

.tarx-glow {
  animation: neon-pulse 2s ease-in-out infinite;
}

@keyframes neon-border-glow {
  0%, 100% { box-shadow: 0 0 5px currentColor; }
  50% { box-shadow: 0 0 15px currentColor, 0 0 25px currentColor; }
}

.tarx-border-glow {
  animation: neon-border-glow 2s ease-in-out infinite;
}
`;
}

/**
 * Inject custom CSS into workbench
 */
export async function injectTabStyles(color: string): Promise<void> {
	const config = vscode.workspace.getConfiguration('tarx');
	await config.update('activeProjectColor', color, vscode.ConfigurationTarget.Global);
	console.log(`[TARX] Tab color set to ${color}`);
}

// ========================================
// SHADCN CSS VARIABLES
// ========================================

export const SHADCN_CSS_VARIABLES = `
:root {
	/* TARX Brand */
	--tarx-primary: 217 91% 50%;
	--tarx-primary-foreground: 0 0% 100%;

	/* Neon accents */
	--tarx-neon-blue: 187 100% 50%;
	--tarx-neon-purple: 272 100% 57%;
	--tarx-neon-pink: 337 100% 60%;
	--tarx-neon-green: 155 100% 50%;

	/* Shadcn Base (Light) */
	--background: 0 0% 100%;
	--foreground: 240 10% 3.9%;
	--card: 0 0% 100%;
	--card-foreground: 240 10% 3.9%;
	--popover: 0 0% 100%;
	--popover-foreground: 240 10% 3.9%;
	--primary: 217 91% 50%;
	--primary-foreground: 0 0% 100%;
	--secondary: 240 4.8% 95.9%;
	--secondary-foreground: 240 5.9% 10%;
	--muted: 240 4.8% 95.9%;
	--muted-foreground: 240 3.8% 46.1%;
	--accent: 240 4.8% 95.9%;
	--accent-foreground: 240 5.9% 10%;
	--destructive: 0 84.2% 60.2%;
	--destructive-foreground: 0 0% 98%;
	--border: 240 5.9% 90%;
	--input: 240 5.9% 90%;
	--ring: 217 91% 50%;
	--radius: 0.5rem;
}

.dark {
	/* Shadcn Base (Dark) - Enhanced for neon */
	--background: 240 10% 3.9%;
	--foreground: 0 0% 98%;
	--card: 240 10% 3.9%;
	--card-foreground: 0 0% 98%;
	--popover: 240 10% 3.9%;
	--popover-foreground: 0 0% 98%;
	--primary: 217 91% 60%;
	--primary-foreground: 0 0% 100%;
	--secondary: 240 3.7% 15.9%;
	--secondary-foreground: 0 0% 98%;
	--muted: 240 3.7% 15.9%;
	--muted-foreground: 240 5% 64.9%;
	--accent: 240 3.7% 15.9%;
	--accent-foreground: 0 0% 98%;
	--destructive: 0 62.8% 30.6%;
	--destructive-foreground: 0 0% 98%;
	--border: 240 3.7% 15.9%;
	--input: 240 3.7% 15.9%;
	--ring: 217 91% 60%;
}
`;

// ========================================
// COMMAND REGISTRATION
// ========================================

export function registerColorCommands(context: vscode.ExtensionContext): void {
	// Change project color
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.changeProjectColor', async (projectId?: string) => {
			const projects = await getProjectsWithColors();

			let targetProject: ProjectWithColor | undefined;

			if (projectId) {
				targetProject = projects.find(p => p.id === projectId);
			} else {
				// Pick from list
				const items = projects.map(p => ({
					label: p.name,
					description: p.color,
					project: p
				}));

				const selected = await vscode.window.showQuickPick(items, {
					title: 'Select Project',
					placeHolder: 'Choose a project to change its color'
				});

				if (selected) {
					targetProject = selected.project;
				}
			}

			if (!targetProject) return;

			const newColor = await pickProjectColor(targetProject.id, targetProject.color);
			if (newColor) {
				await setProjectColor(targetProject.id, newColor);
				await injectTabStyles(newColor);
				await vscode.commands.executeCommand('tarx.projects.refresh');
				vscode.window.showInformationMessage(`Project color changed to ${newColor}`);
			}
		})
	);

	// Set active project
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.setActiveProject', async (projectId: string) => {
			const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

			try {
				// Deactivate all, activate selected
				execSync(`sqlite3 "${dbPath}" "UPDATE projects SET is_active = 0; UPDATE projects SET is_active = 1 WHERE id = '${projectId}'"`, {
					encoding: 'utf8'
				});

				// Get project color and apply to tabs
				const projects = await getProjectsWithColors();
				const active = projects.find(p => p.id === projectId);
				if (active) {
					await injectTabStyles(active.color);
				}

				await vscode.commands.executeCommand('tarx.projects.refresh');
				vscode.window.showInformationMessage(`✓ Active project set`);
			} catch (e) {
				console.error('[TARX] Failed to set active project:', e);
			}
		})
	);

	console.log('[TARX] Neon color commands registered');
}

// All exports are inline with declarations above
