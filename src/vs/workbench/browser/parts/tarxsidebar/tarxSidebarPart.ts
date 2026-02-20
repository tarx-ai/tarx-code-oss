/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/tarxSidebarPart.css';
import { $, append, addDisposableListener, EventType, clearNode, getWindow } from '../../../../base/browser/dom.js';
import { IWorkbenchLayoutService, Parts, Position as SideBarPosition } from '../../../services/layout/browser/layoutService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER } from '../../../common/theme.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { LayoutPriority } from '../../../../base/browser/ui/grid/grid.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ActivityBarCompositeBar, ActivitybarPart } from '../activitybar/activitybarPart.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SidebarFocusContext, ActiveViewletContext } from '../../../common/contextkeys.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICommandService, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { TarxProjectModal } from './tarxProjectModal.js';
import { TarxExtensionsModal } from './extensionsView.js';
import { IWebviewService, IWebviewElement } from '../../../contrib/webview/browser/webview.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { URI } from '../../../../base/common/uri.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { TARX_CODICON_CSS, TARX_CODICON_FONT_URL, TARX_SIDEBAR_CSS, TARX_SIDEBAR_JS } from './webviewContent.js';
import { TarxSidebarCommands, TarxMessageTypes, TarxSidebarState, createInitialSidebarState } from './tarxCommands.js';


/**
 * TARX Sidebar Navigation Item
 */
interface TarxNavItem {
	id: string;
	label: string;
	icon: ThemeIcon;
	command?: string;
}

/**
 * History item from conversation database
 */
interface TarxHistoryItem {
	id: string;
	title: string;
	timestamp: number;
	source: 'claude' | 'tarx';
	spaceId?: string;
	spaceName?: string;
}

/**
 * Project item from database
 */
interface TarxProject {
	id: string;
	name: string;
	path: string;
	type: string | null;
	isActive: boolean;
	emoji?: string;
	createdAt: number;
}

/**
 * TARX Custom Sidebar Part
 *
 * Structure:
 * - Header: Logo + SuperComputer toggle
 * - Chat row with hover [+] action
 * - Voice row with hover play/pause action
 * - Collapsible sections: CREATE, CODE, FILES, PROJECTS
 * - History section (grouped by time)
 * - Footer: Extensions, Settings
 */
export class TarxSidebarPart extends AbstractPaneCompositePart {

	static readonly activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';
	private static readonly SUPERCOMPUTER_KEY = 'tarx.supercomputer.enabled';
	private static readonly COLLAPSED_KEY = 'tarx.sidebar.collapsed';

	//#region IView

	// Allow collapsing to 48px icon-only mode
	// snap: false prevents the sidebar from snapping closed at minimum size
	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 400;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	override get snap(): boolean { return false; }

	readonly priority: LayoutPriority = LayoutPriority.Low;

	// Override setVisible to prevent the sidebar from being hidden when in collapsed mode
	// This ensures the 48px icon strip remains visible instead of completely hiding
	override setVisible(visible: boolean): void {
		console.log('[TARX] setVisible called with visible=', visible, ', isCollapsed=', this.isCollapsed);

		// If trying to hide the sidebar while it's collapsed, prevent it
		// The sidebar should remain visible at 48px, not become completely hidden
		if (!visible && this.isCollapsed) {
			console.log('[TARX] BLOCKING sidebar hide while collapsed - staying at 48px');
			return; // Don't fire visibility change event, keep sidebar visible
		}

		// Also block if trying to hide but we're in the process of collapsing
		// (catches cases where isCollapsed might not be set yet)
		if (!visible) {
			console.log('[TARX] WARNING: Something is trying to hide the sidebar!');
			// Log the call stack to see what's calling this
			console.trace('[TARX] setVisible(false) call stack:');
		}

		super.setVisible(visible);
	}

	//#endregion

	private readonly activityBarPart = this._register(this.instantiationService.createInstance(ActivitybarPart, this));

	// DOM elements
	private tarxContainer: HTMLElement | undefined;
	private webviewPlaceholder: HTMLElement | undefined;
	private readonly _webview = this._register(new MutableDisposable<IWebviewElement>());
	private headerElement: HTMLElement | undefined;
	private navRowsElement: HTMLElement | undefined;
	private sectionsContainer: HTMLElement | undefined;
	private historyElement: HTMLElement | undefined;
	private footerElement: HTMLElement | undefined;
	private logoIcon: HTMLImageElement | undefined;

	// Webview mode toggle - set to true to use React webview
	private readonly USE_WEBVIEW_MODE = true;

	// State
	private sectionState: Map<string, boolean> = new Map();
	// private isVoiceActive: boolean = false; // DISABLED FOR V1 RELEASE
	private superEnabled: boolean = false;
	private peerCount: number = 0;
	private superDot: HTMLElement | undefined;
	private superLabel: HTMLElement | undefined;
	private localDot: HTMLElement | undefined;
	private localLabel: HTMLElement | undefined;
	private connectionStatus: 'online' | 'offline' | 'connecting' | 'reconnecting' = 'online'; // Default to online to avoid loading flash
	private static readonly CONNECTION_STATUS_KEY = 'tarx.sidebar.connectionStatus';
	private connectionCheckInterval: ReturnType<typeof setInterval> | undefined;
	private readonly navDisposables = this._register(new DisposableStore());
	private isCollapsed: boolean = false;

	// History data
	private historyItems: TarxHistoryItem[] = [];

	// Projects data
	private projects: TarxProject[] = [];
	private projectsContentEl: HTMLElement | undefined;

	// Unified sidebar state for MCP bridge
	private sidebarState: TarxSidebarState = createInitialSidebarState();

	// Model loading indicator
	private modelLoadingElement: HTMLElement | undefined;

	// File upload/indexing progress
	private uploadProgressElement: HTMLElement | undefined;
	private uploadProgressText: HTMLElement | undefined;
	private uploadProgressBarFill: HTMLElement | undefined;
	private uploadProgressPercent: HTMLElement | undefined;

	constructor(
		@INotificationService private readonly tarxNotificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
	) {
		super(
			Parts.SIDEBAR_PART,
			{ hasTitle: true, trailingSeparator: false, borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0 },
			TarxSidebarPart.activeViewletSettingsKey,
			ActiveViewletContext.bindTo(contextKeyService),
			SidebarFocusContext.bindTo(contextKeyService),
			'sideBar',
			'viewlet',
			undefined,
			undefined,
			tarxNotificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			hoverService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			menuService,
		);

		// Section states (collapsed by default except CONTEXT, PROJECTS and HISTORY)
		// this.sectionState.set('create', true); // DISABLED FOR V1 RELEASE
		this.sectionState.set('code', true);
		this.sectionState.set('context', false); // Context panel expanded by default
		this.sectionState.set('files', true);
		this.sectionState.set('projects', false);
		this.sectionState.set('history', false);

		// Load saved super computer state
		this.superEnabled = this.storageService.getBoolean(TarxSidebarPart.SUPERCOMPUTER_KEY, StorageScope.APPLICATION, false);

		// Load saved collapsed state
		this.isCollapsed = this.storageService.getBoolean(TarxSidebarPart.COLLAPSED_KEY, StorageScope.PROFILE, false);

		// Load cached connection status (default to 'online' to avoid loading flash on startup)
		const cachedStatus = this.storageService.get(TarxSidebarPart.CONNECTION_STATUS_KEY, StorageScope.APPLICATION, 'online');
		this.connectionStatus = cachedStatus as 'online' | 'offline' | 'connecting' | 'reconnecting';

		// Register the toggle collapse command so it can be called from the header button
		this._register(CommandsRegistry.registerCommand('tarx.toggleSidebarCollapse', () => {
			console.log('[TARX] tarx.toggleSidebarCollapse command executed');
			this.toggleCollapse();
		}));

		// Register all MCP bridge sidebar commands
		this.registerSidebarCommands();

		// Listen for TARX extension activation and reload data when ready
		this._register(extensionService.onDidRegisterExtensions(() => {
			console.log('[TARX Sidebar] Extensions registered - checking for tarx extension');
			// Give the extension a moment to fully activate and register commands
			setTimeout(() => {
				console.log('[TARX Sidebar] Reloading data after extension registration');
				this.loadProjectsWithRetry(3);
				this.loadHistoryWithRetry(3);
				// Notify webview that extension is ready
				this.sendWebviewMessage({ command: 'extensionReady' });
			}, 500);
		}));

		// Periodic empty-data check: if sidebar is still empty after startup, keep retrying
		const emptyDataCheck = setInterval(() => {
			if (this.projects.length === 0 || this.historyItems.length === 0) {
				console.log(`[TARX Sidebar] Empty data check: projects=${this.projects.length}, history=${this.historyItems.length} - retrying`);
				if (this.projects.length === 0) {
					this.loadProjectsWithRetry(2);
				}
				if (this.historyItems.length === 0) {
					this.loadHistoryWithRetry(2);
				}
			} else {
				// Data loaded, stop checking
				clearInterval(emptyDataCheck);
			}
		}, 3000);
		// Stop checking after 30 seconds regardless
		setTimeout(() => clearInterval(emptyDataCheck), 30000);
	}

	/**
	 * Register all MCP bridge sidebar commands
	 * These commands allow MCP tools to control the sidebar UI
	 */
	private registerSidebarCommands(): void {
		// ======================================================================
		// UI STATE COMMANDS
		// ======================================================================

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.UI_REFRESH,
			async (_accessor, section?: 'projects' | 'history' | 'files' | 'all') => {
				console.log('[TARX Sidebar] UI_REFRESH:', section);
				if (!section || section === 'all' || section === 'projects') {
					await this.loadProjects();
				}
				if (!section || section === 'all' || section === 'history') {
					await this.loadHistory();
				}
				if (!section || section === 'all' || section === 'files') {
					await this.loadUploadedFiles();
				}
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.UI_NAVIGATE,
			(_accessor, view: 'chat' | 'projects' | 'history' | 'files') => {
				console.log('[TARX Sidebar] UI_NAVIGATE:', view);
				this.sidebarState.activeSection = view;
				this.sendWebviewMessage({
					command: TarxMessageTypes.NAVIGATE,
					data: { view }
				});
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.UI_SET_LOADING,
			(_accessor, section: 'projects' | 'history' | 'files', isLoading: boolean) => {
				console.log('[TARX Sidebar] UI_SET_LOADING:', section, isLoading);
				this.sidebarState.isLoading[section] = isLoading;
				this.sendWebviewMessage({
					command: TarxMessageTypes.LOADING_STATE,
					data: { section, isLoading }
				});
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.UI_SHOW_ERROR,
			(_accessor, section: 'projects' | 'history' | 'files', message: string) => {
				console.log('[TARX Sidebar] UI_SHOW_ERROR:', section, message);
				this.sidebarState.errors[section] = message;
				this.sendWebviewMessage({
					command: TarxMessageTypes.ERROR_STATE,
					data: { section, message }
				});
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.UI_CLEAR_ERROR,
			(_accessor, section: 'projects' | 'history' | 'files') => {
				console.log('[TARX Sidebar] UI_CLEAR_ERROR:', section);
				this.sidebarState.errors[section] = null;
				this.sendWebviewMessage({
					command: TarxMessageTypes.ERROR_STATE,
					data: { section, message: null }
				});
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.UI_GET_STATE,
			() => {
				console.log('[TARX Sidebar] UI_GET_STATE');
				return { ...this.sidebarState };
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.UI_SET_CONNECTION_STATUS,
			(_accessor, status: 'online' | 'offline' | 'connecting' | 'reconnecting') => {
				console.log('[TARX Sidebar] UI_SET_CONNECTION_STATUS:', status);
				this.sidebarState.connectionStatus = status;
				this.connectionStatus = status;
				this.sendWebviewMessage({
					command: TarxMessageTypes.CONNECTION_STATUS,
					data: { status }
				});
			}
		));

		// ======================================================================
		// PROJECT COMMANDS
		// ======================================================================

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.PROJECT_SELECT,
			(_accessor, projectId: string) => {
				console.log('[TARX Sidebar] PROJECT_SELECT:', projectId);
				this.sidebarState.selectedProjectId = projectId;
				this.sendWebviewMessage({
					command: TarxMessageTypes.PROJECT_SELECTED,
					data: { projectId }
				});
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.PROJECT_REFRESH,
			async () => {
				console.log('[TARX Sidebar] PROJECT_REFRESH');
				await this.loadProjects();
			}
		));

		// ======================================================================
		// HISTORY COMMANDS
		// ======================================================================

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.HISTORY_REFRESH,
			async () => {
				console.log('[TARX Sidebar] HISTORY_REFRESH');
				await this.loadHistory();
			}
		));

		// ======================================================================
		// INTERNAL COMMANDS
		// ======================================================================

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.INTERNAL_POST_MESSAGE,
			(_accessor, message: { command: string; data?: unknown }) => {
				console.log('[TARX Sidebar] INTERNAL_POST_MESSAGE:', message.command);
				this.sendWebviewMessage(message);
			}
		));

		this._register(CommandsRegistry.registerCommand(
			TarxSidebarCommands.INTERNAL_UPDATE_STATE,
			(_accessor, stateUpdate: Partial<TarxSidebarState>) => {
				console.log('[TARX Sidebar] INTERNAL_UPDATE_STATE:', Object.keys(stateUpdate));
				Object.assign(this.sidebarState, stateUpdate);
				this.sendWebviewMessage({
					command: TarxMessageTypes.STATE_SYNC,
					data: this.sidebarState
				});
			}
		));
	}

	override create(parent: HTMLElement): void {
		console.log('[TARX CRASH-GUARD] TarxSidebarPart.create() called at', new Date().toISOString());
		try {
			super.create(parent);

			// Get the actual container from the part
			const container = this.getContainer();
			console.log('[TARX CRASH-GUARD] Container:', container ? 'exists' : 'NULL');
			if (container) {
				// Add tarx-sidebar class to the part element for CSS targeting
				// This allows us to override the nosidebar behavior specifically for TARX
				container.classList.add('tarx-sidebar');
				this.createTarxNavigation(container);
				console.log('[TARX CRASH-GUARD] createTarxNavigation completed');
			}
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.stack || err.message : String(err);
			console.error('[TARX CRASH-GUARD] TarxSidebarPart.create() CRASHED:', errMsg);
			// Don't re-throw - let workbench survive with a broken sidebar rather than crash entirely
		}
	}

	private createTarxNavigation(parent: HTMLElement): void {
		// Clear any existing content using VS Code's safe DOM utility
		clearNode(parent);

		this.tarxContainer = append(parent, $('.tarx-sidebar-container'));

		// Check if we should use webview mode
		if (this.USE_WEBVIEW_MODE) {
			this.createWebviewSidebar();
			return;
		}

		// Legacy DOM-based UI (fallback)
		this.createHeader();
		this.createModelLoadingIndicator();
		this.createNavRows();
		this.createSections();
		// History is now part of sections (called from createSections)
		this.createFooter();

		// Restore super status if was connected
		if (this.superEnabled) {
			this.updateSuperStatus('connected');
		}

		// Start polling connection status from TARX extension
		this.startConnectionStatusPolling();

		// Listen for upload progress commands
		this.registerUploadProgressCommands();

		// Load history and projects from database (async, runs after UI is ready)
		// 2000ms delay to ensure TARX extension is activated
		setTimeout(() => {
			this.loadHistoryWithRetry(5);
			this.loadProjectsWithRetry(5);
		}, 2000);

		// Apply collapsed state if it was saved
		console.log('[TARX Sidebar] Sidebar container isCollapsed:', this.isCollapsed);
		if (this.isCollapsed) {
			if (this.tarxContainer) {
				this.tarxContainer.classList.add('collapsed');
			}
			// Also apply the collapsed width - use setTimeout to ensure layout is ready
			setTimeout(() => {
				this.layoutService.setSize(Parts.SIDEBAR_PART, { width: 48, height: -1 });
			}, 0);
		}
	}

	/**
	 * Create the React-based webview sidebar using VS Code's native IWebviewService
	 * This replaces the legacy DOM-based UI with a modern React implementation
	 */
	private createWebviewSidebar(): void {
		console.log('[TARX Webview] Creating webview sidebar via IWebviewService');

		if (!this.tarxContainer) {
			console.error('[TARX Webview] No container available');
			return;
		}

				try {

		// Create a placeholder element for the webview with explicit dimensions
		this.webviewPlaceholder = document.createElement('div');
		this.webviewPlaceholder.className = 'tarx-webview-placeholder';
		this.webviewPlaceholder.style.cssText = `
			width: 100%;
			height: 100%;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			flex: 1;
		`;
		this.tarxContainer.appendChild(this.webviewPlaceholder);

		// Create webview element using VS Code's native webview service
		const webview = this.webviewService.createWebviewElement({
			providedViewType: 'tarx.sidebar',
			title: 'TARX Sidebar',
			options: {
				retainContextWhenHidden: true,
			},
			contentOptions: {
				allowScripts: true,
				localResourceRoots: [
					URI.file('/Users/master/Desktop/tarx-code-oss/extensions/tarx/out/webview'),
					FileAccess.asBrowserUri('vs/workbench/browser/parts/tarxsidebar/media'),
				],
			},
			extension: undefined,
		});

		this._webview.value = webview;

		// Generate HTML with inline styles and scripts (no external file loading)
		const htmlContent = this.getWebviewHtml();

		// Set the HTML content
		webview.setHtml(htmlContent);

		// Mount the webview to the placeholder container
		const targetWindow = getWindow(this.tarxContainer);
		webview.mountTo(this.webviewPlaceholder, targetWindow);

		// Set up message passing
		this.setupWebviewMessagePassing();

		// Log initial layout info
		setTimeout(() => {
			const bounds = this.webviewPlaceholder?.getBoundingClientRect();
			console.log('[TARX Webview] Container bounds:', bounds?.width, 'x', bounds?.height);
		}, 100);

		console.log('[TARX Webview] Webview created and mounted via IWebviewService');
		} catch (error) {
			console.error('[TARX Webview] *** WEBVIEW CREATION FAILED ***', error);
			console.error('[TARX Webview] Error name:', (error as any)?.name);
			console.error('[TARX Webview] Error message:', (error as any)?.message);
			console.error('[TARX Webview] Error stack:', (error as any)?.stack);
			console.log('[TARX Webview] Falling back to legacy DOM sidebar');
			// Fall back to legacy DOM-based sidebar
			this.createHeader();
			this.createModelLoadingIndicator();
			this.createNavRows();
			this.createSections();
			this.createFooter();
			if (this.superEnabled) {
				this.updateSuperStatus('connected');
			}
			this.startConnectionStatusPolling();
			this.registerUploadProgressCommands();
			setTimeout(() => {
				this.loadHistoryWithRetry(5);
				this.loadProjectsWithRetry(5);
			}, 2000);
		}
	}

	/**
	 * Generate the HTML content for the webview
	 * Uses the pre-built React bundle from webviewContent.ts (generated at build time)
	 */
	private getWebviewHtml(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:; font-src data:;">
	<title>TARX Sidebar</title>
	<style>
		/* Codicon font (@font-face + icon classes) */
		${TARX_CODICON_CSS}
		/* Base styles and VS Code theme variables */
		:root {
			--vscode-font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
			--vscode-font-size: 13px;
		}
		html, body {
			margin: 0;
			padding: 0;
			width: 100%;
			height: 100%;
			overflow: hidden;
			background: var(--vscode-sideBar-background, #1e1e1e);
			color: var(--vscode-sideBar-foreground, #cccccc);
		}
		#root {
			width: 100%;
			height: 100%;
		}
		/* React bundle CSS */
		${TARX_SIDEBAR_CSS}
	</style>
</head>
<body>
	<div id="root"></div>
	<script>
		// Load codicon font via FontFace API (more reliable than CSS @font-face in sandboxed webviews)
		(function() {
			try {
				var font = new FontFace('codicon', 'url(${TARX_CODICON_FONT_URL})');
				font.load().then(function(loaded) {
					document.fonts.add(loaded);
					console.log('[TARX] Codicon font loaded via FontFace API');
				}).catch(function(e) {
					console.warn('[TARX] FontFace API load failed, falling back to CSS @font-face:', e);
				});
			} catch(e) {
				console.warn('[TARX] FontFace API unavailable:', e);
			}
		})();
	</script>
	<script>
		// VS Code API - must be acquired before React bundle runs
		(function() {
			const vscode = acquireVsCodeApi();
			window.vscode = vscode;

			// Wrapper that adds message type for TARX communication
			window.tarxVscode = {
				postMessage: (msg) => vscode.postMessage({ type: 'tarx-webview', ...msg }),
				getState: () => vscode.getState(),
				setState: (state) => vscode.setState(state)
			};
		})();
	</script>
	<script>
		// React bundle (IIFE)
		${TARX_SIDEBAR_JS}
	</script>
</body>
</html>`;
	}

	/**
	 * Set up message passing between the webview and the host
	 */
	private setupWebviewMessagePassing(): void {
		const webview = this._webview.value;
		if (!webview) {
			console.error('[TARX Webview] No webview available for message passing');
			return;
		}

		// Listen for messages from the webview using IWebview's onMessage event
		this._register(webview.onMessage((e) => {
			if (e.message && e.message.type === 'tarx-webview') {
				this.handleWebviewMessage(e.message);
			}
		}));

		// Send initial state after a short delay to ensure webview is ready
		setTimeout(() => {
			console.log('[TARX Webview] Sending initial state to webview');

			// Send collapsed state
			this.sendWebviewMessage({
				command: 'setCollapsed',
				collapsed: this.isCollapsed
			});

			// Send connection status
			this.sendWebviewMessage({
				command: 'connectionStatusChanged',
				status: this.connectionStatus
			});

			// Send existing projects if any
			if (this.projects.length > 0) {
				this.sendWebviewMessage({
					command: 'projectsLoaded',
					projects: this.projects
				});
			}

			// Send existing history if any
			if (this.historyItems.length > 0) {
				this.sendWebviewMessage({
					command: 'historyLoaded',
					items: this.historyItems
				});
			}

			// Load data from database
			setTimeout(() => {
				this.loadHistoryWithRetry(5);
				this.loadProjectsWithRetry(5);
			}, 500);
		}, 100);
	}

	/**
	 * Handle messages from the webview
	 */
	private handleWebviewMessage(message: any): void {
		console.log('[TARX Webview] Received message:', message);

		switch (message.command) {
			case 'ready':
				// Webview is ready - send initial data
				console.log('[TARX Webview] Ready');
				this.sendWebviewMessage({
					command: 'connectionStatusChanged',
					status: this.connectionStatus
				});
				this.loadHistoryWithRetry(3);
				this.loadProjectsWithRetry(3);
				break;
			case 'getProjects':
				this.sendWebviewMessage({
					command: 'projectsLoaded',
					projects: this.projects
				});
				break;
			case 'getHistory':
				this.sendWebviewMessage({
					command: 'historyLoaded',
					items: this.historyItems
				});
				break;
			case 'getConnectionStatus':
				this.sendWebviewMessage({
					command: 'connectionStatusChanged',
					status: this.connectionStatus
				});
				break;
			case 'getUploadedFiles':
				// Forward to extension
				this.commandService.executeCommand('tarx.getUploadedFiles').then((files: any) => {
					this.sendWebviewMessage({
						command: 'uploadedFilesLoaded',
						files: files || []
					});
				});
				break;
			case 'openChat':
				// Spawn TARX chat panel in right column (ViewColumn.Beside)
				this.commandService.executeCommand('tarx.openChat');
				break;
			case 'newChat':
				this.commandService.executeCommand('tarx.chat.new');
				break;
			case 'openSession':
				console.log('[TARX Deep Link] openSession', message.sessionId, 'space:', message.spaceId);
				this.commandService.executeCommand('tarx.openSession', message.sessionId, message.spaceId);
				break;
			case 'openConversation':
				console.log('[TARX Deep Link] openConversation', message.conversationId);
				this.commandService.executeCommand('tarx.openConversation', message.conversationId);
				break;
			case 'selectProject':
				console.log('[TARX Deep Link] selectProject', message.projectId);
				this.commandService.executeCommand('tarx.projects.open', message.projectId);
				break;
			case 'openProject':
				console.log('[TARX Deep Link] openProject', message.projectPath || message.projectId);
				this.commandService.executeCommand('tarx.projects.open', message.projectPath || message.projectId);
				break;
			case 'createProject':
			case 'openCreateProjectTab':
				this.commandService.executeCommand('tarx.openCreateProject');
				break;
			case 'openProjectTab':
				if (message.projectId) {
					this.commandService.executeCommand('tarx.openProjectContext', message.projectId);
					this.commandService.executeCommand('tarx.projects.select', message.projectId);
					this.sendWebviewMessage({ command: 'projectSelected', data: { projectId: message.projectId } });
				}
				break;
			case 'uploadFile':
				this.commandService.executeCommand('tarx.uploadFile', {
					filename: message.filename,
					content: message.content,
					size: message.size,
					mimeType: message.mimeType
				});
				break;
			case 'deleteFile':
				this.commandService.executeCommand('tarx.deleteUploadedFile', message.fileId).then(() => {
					this.loadUploadedFiles();
				});
				break;
			case 'scanDirectory':
				// Open folder picker then trigger scan via extension command
				this.fileDialogService.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					title: 'Select Directory to Scan'
				}).then((result: URI[] | undefined) => {
					if (result && result.length > 0) {
						const folderPath = result[0].fsPath;
						console.log('[TARX] Scanning directory:', folderPath);
						this.commandService.executeCommand('tarx.scanDirectory', folderPath).then(() => {
							this.loadUploadedFiles();
						});
					}
				});
				break;
			case 'openView':
				// Open views in the Auxiliary Bar (right side)
				// Use the proper openViewInAuxiliaryBar for view containers
				if (message.viewId.startsWith('workbench.view.')) {
					this.openViewInAuxiliaryBar(message.viewId, message.viewId);
				} else {
					// For actions like terminal, just execute directly
					this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
					this.commandService.executeCommand(message.viewId);
				}
				break;
			case 'openSettings':
				this.commandService.executeCommand('workbench.action.openSettings');
				break;
			case 'openExtensions':
				this.openViewInAuxiliaryBar('workbench.view.extensions', 'Extensions');
				break;
			case 'openFolder':
				this.commandService.executeCommand('workbench.action.files.openFolder');
				break;
			case 'showAllHistory':
				this.commandService.executeCommand('tarx.history.showAll');
				break;
			case 'toggleCollapse':
				this.toggleCollapse();
				break;
			case 'refresh':
				this.loadHistoryWithRetry(3);
				this.loadProjectsWithRetry(3);
				this.loadUploadedFiles();
				break;
			case 'getSettings':
				this.commandService.executeCommand('tarx.settings.get').then((settings: any) => {
					if (settings) {
						this.sendWebviewMessage({ command: 'settingsLoaded', settings });
					}
				}).catch(() => { /* settings not available yet */ });
				break;
			case 'getDaemonStatus':
				// Forward to extension
				this.commandService.executeCommand('tarx.injectDaemonStatus', 'Checking daemon status...');
				break;
			default:
				console.log('[TARX Webview] Unknown command:', message.command);
		}
	}

	/**
	 * Send a message to the webview
	 */
	private sendWebviewMessage(message: any): void {
		const webview = this._webview.value;
		if (webview) {
			webview.postMessage({
				type: 'tarx-host',
				...message
			});
		}
	}

	/**
	 * Get time-based greeting
	 */
	private getGreeting(): string {
		const hour = new Date().getHours();
		let greeting: string;
		if (hour < 12) {
			greeting = 'Morning';
		} else if (hour < 17) {
			greeting = 'Afternoon';
		} else {
			greeting = 'Evening';
		}
		return `${greeting}, Holly`;
	}

	// Compute dropdown elements
	private computePill: HTMLElement | undefined;
	private computeDropdown: HTMLElement | undefined;
	private superToggle: HTMLInputElement | undefined;

	/**
	 * Create the chip/CPU SVG icon programmatically (to avoid TrustedTypes innerHTML)
	 */
	private createChipSvg(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'currentColor');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M14.5 8.5C14.633 8.5 14.76 8.447 14.854 8.354C14.948 8.26 15 8.133 15 8C15 7.867 14.947 7.74 14.854 7.646C14.76 7.552 14.633 7.5 14.5 7.5H13V6H14.5C14.633 6 14.76 5.947 14.854 5.854C14.948 5.76 15 5.633 15 5.5C15 5.367 14.947 5.24 14.854 5.146C14.76 5.052 14.633 5 14.5 5H13C13 4.47 12.789 3.961 12.414 3.586C12.039 3.211 11.53 3 11 3V1.5C11 1.367 10.947 1.24 10.854 1.146C10.76 1.052 10.633 1 10.5 1C10.367 1 10.24 1.053 10.146 1.146C10.052 1.24 10 1.367 10 1.5V3H8.5V1.5C8.5 1.367 8.447 1.24 8.354 1.146C8.26 1.052 8.133 1 8 1C7.867 1 7.74 1.053 7.646 1.146C7.552 1.24 7.5 1.367 7.5 1.5V3H6V1.5C6 1.367 5.947 1.24 5.854 1.146C5.76 1.052 5.633 1 5.5 1C5.367 1 5.24 1.053 5.146 1.146C5.052 1.24 5 1.367 5 1.5V3C4.47 3 3.961 3.211 3.586 3.586C3.211 3.961 3 4.47 3 5H1.5C1.367 5 1.24 5.053 1.146 5.146C1.052 5.24 1 5.367 1 5.5C1 5.633 1.053 5.76 1.146 5.854C1.24 5.948 1.367 6 1.5 6H3V7.5H1.5C1.367 7.5 1.24 7.553 1.146 7.646C1.052 7.74 1 7.867 1 8C1 8.133 1.053 8.26 1.146 8.354C1.24 8.448 1.367 8.5 1.5 8.5H3V10H1.5C1.367 10 1.24 10.053 1.146 10.146C1.052 10.24 1 10.367 1 10.5C1 10.633 1.053 10.76 1.146 10.854C1.24 10.948 1.367 11 1.5 11H3C3 11.53 3.211 12.039 3.586 12.414C3.961 12.789 4.47 13 5 13V14.5C5 14.633 5.053 14.76 5.146 14.854C5.24 14.948 5.367 15 5.5 15C5.633 15 5.76 14.947 5.854 14.854C5.948 14.76 6 14.633 6 14.5V13H7.5V14.5C7.5 14.633 7.553 14.76 7.646 14.854C7.74 14.948 7.867 15 8 15C8.133 15 8.26 14.947 8.354 14.854C8.448 14.76 8.5 14.633 8.5 14.5V13H10V14.5C10 14.633 10.053 14.76 10.146 14.854C10.24 14.948 10.367 15 10.5 15C10.633 15 10.76 14.947 10.854 14.854C10.948 14.76 11 14.633 11 14.5V13C11.53 13 12.039 12.789 12.414 12.414C12.789 12.039 13 11.53 13 11H14.5C14.633 11 14.76 10.947 14.854 10.854C14.948 10.76 15 10.633 15 10.5C15 10.367 14.947 10.24 14.854 10.146C14.76 10.052 14.633 10 14.5 10H13V8.5H14.5ZM12 11C12 11.265 11.895 11.52 11.707 11.707C11.519 11.894 11.265 12 11 12H5C4.735 12 4.48 11.895 4.293 11.707C4.105 11.519 4 11.265 4 11V5C4 4.735 4.105 4.48 4.293 4.293C4.481 4.105 4.735 4 5 4H11C11.265 4 11.52 4.105 11.707 4.293C11.895 4.481 12 4.735 12 5V11ZM8 10.5C6.621 10.5 5.5 9.379 5.5 8C5.5 6.621 6.621 5.5 8 5.5C9.379 5.5 10.5 6.621 10.5 8C10.5 9.379 9.379 10.5 8 10.5ZM8 6.5C7.173 6.5 6.5 7.173 6.5 8C6.5 8.827 7.173 9.5 8 9.5C8.827 9.5 9.5 8.827 9.5 8C9.5 7.173 8.827 6.5 8 6.5Z');
		svg.appendChild(path);

		return svg;
	}

	/**
	 * Header: Logo + Greeting (simplified - no project selector)
	 * Project switching happens via the Projects section
	 */
	private createHeader(): void {
		if (!this.tarxContainer) { return; }

		this.headerElement = append(this.tarxContainer, $('.tarx-header'));

		// Logo row with greeting
		const logoRow = append(this.headerElement, $('.tarx-logo-row'));

		// Logo icon (shows in both expanded and collapsed states)
		this.logoIcon = append(logoRow, $('img.tarx-logo-icon')) as HTMLImageElement;
		this.logoIcon.src = FileAccess.asBrowserUri('vs/workbench/browser/parts/tarxsidebar/media/tarx-logo.png').toString(true);
		this.logoIcon.alt = 'TARX';
		const logoText = append(logoRow, $('span.tarx-logo-text'));
		logoText.textContent = this.getGreeting();
	}

	/**
	 * Create the Compute dropdown menu
	 */
	private createComputeDropdown(): void {
		if (!this.footerElement) { return; }

		this.computeDropdown = append(this.footerElement, $('.tarx-compute-dropdown'));
		this.computeDropdown.style.display = 'none';

		// Local option (checked when connected)
		const localOption = append(this.computeDropdown, $('.tarx-compute-option.local'));
		const localCheck = append(localOption, $('span.tarx-compute-check'));
		localCheck.classList.add(...ThemeIcon.asClassNameArray(Codicon.passFilled));
		this.localDot = append(localOption, $('span.tarx-compute-dot'));
		this.localLabel = append(localOption, $('span.tarx-compute-option-label'));
		this.localLabel.textContent = 'TARX LOCAL';
		// Set initial status
		this.updateLocalStatus(this.connectionStatus);

		// Super option with toggle switch - DISABLED FOR V1 (mesh networking not implemented)
		const superOption = append(this.computeDropdown, $('.tarx-compute-option.super'));
		superOption.title = 'Coming in V2 - Distributed GPU mesh networking';
		superOption.style.opacity = '0.5';
		superOption.style.cursor = 'not-allowed';
		this.superDot = append(superOption, $('span.tarx-compute-dot'));
		this.superLabel = append(superOption, $('span.tarx-compute-option-label'));
		this.superLabel.textContent = 'TARX NETWORK (Coming Soon)';

		// Toggle switch - disabled for V1
		const toggleLabel = append(superOption, $('label.tarx-toggle'));
		toggleLabel.style.pointerEvents = 'none';
		this.superToggle = append(toggleLabel, $('input.tarx-toggle-input')) as HTMLInputElement;
		this.superToggle.type = 'checkbox';
		this.superToggle.checked = false; // Always off for V1
		this.superToggle.disabled = true; // Disabled for V1
		append(toggleLabel, $('span.tarx-toggle-slider'));

		// Join Private Compute link - hidden for V1
		// const joinLink = append(this.computeDropdown, $('.tarx-compute-link'));
		// joinLink.textContent = 'Join Private Compute';
		// this.navDisposables.add(addDisposableListener(joinLink, EventType.CLICK, () => {
		// 	this.commandService.executeCommand('tarx.privateCompute.join');
		// 	this.hideComputeDropdown();
		// }));

		// Prevent dropdown close when clicking inside
		this.navDisposables.add(addDisposableListener(this.computeDropdown, EventType.CLICK, (e) => {
			e.stopPropagation();
		}));
	}

	/**
	 * Toggle Compute dropdown visibility
	 */
	private toggleComputeDropdown(): void {
		if (!this.computeDropdown || !this.computePill) { return; }

		const isVisible = this.computeDropdown.style.display !== 'none';
		if (isVisible) {
			this.hideComputeDropdown();
		} else {
			this.computeDropdown.style.display = 'block';
			this.computePill.classList.add('open');
		}
	}

	/**
	 * Hide Compute dropdown
	 */
	private hideComputeDropdown(): void {
		if (this.computeDropdown) {
			this.computeDropdown.style.display = 'none';
		}
		if (this.computePill) {
			this.computePill.classList.remove('open');
		}
	}

	// DISABLED FOR V1 RELEASE - SuperComputer mesh networking not implemented
	// Re-enable in V2 when mesh networking is ready
	// private toggleSuperComputer(): void {
	// 	const shouldConnect = this.superToggle?.checked ?? false;
	// 	if (shouldConnect) {
	// 		this.updateSuperStatus('connecting');
	// 		this.commandService.executeCommand('tarx.mesh.connect').then(() => {
	// 			this.superEnabled = true;
	// 			this.updateSuperStatus('connected');
	// 			this.storageService.store(TarxSidebarPart.SUPERCOMPUTER_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
	// 		}).catch(() => {
	// 			this.superEnabled = false;
	// 			if (this.superToggle) { this.superToggle.checked = false; }
	// 			this.updateSuperStatus('disconnected');
	// 		});
	// 	} else {
	// 		this.superEnabled = false;
	// 		this.commandService.executeCommand('tarx.mesh.disconnect');
	// 		this.updateSuperStatus('disconnected');
	// 		this.storageService.store(TarxSidebarPart.SUPERCOMPUTER_KEY, false, StorageScope.APPLICATION, StorageTarget.USER);
	// 	}
	// }

	/**
	 * Update Super status display
	 */
	private updateSuperStatus(state: 'disconnected' | 'connecting' | 'connected'): void {
		if (!this.superDot || !this.superLabel) { return; }

		this.superDot.classList.remove('active', 'connecting');

		switch (state) {
			case 'disconnected':
				this.superLabel.textContent = 'TARX NETWORK';
				break;
			case 'connecting':
				this.superDot.classList.add('connecting');
				this.superLabel.textContent = 'TARX NETWORK (connecting...)';
				break;
			case 'connected':
				this.superDot.classList.add('active');
				this.superLabel.textContent = this.peerCount > 0
					? `TARX NETWORK (${this.peerCount} peer${this.peerCount !== 1 ? 's' : ''})`
					: 'TARX NETWORK';
				break;
		}
	}

	/**
	 * Update peer count from mesh network
	 */
	public updatePeerCount(count: number): void {
		this.peerCount = count;
		if (this.superEnabled && this.superLabel) {
			this.superLabel.textContent = `TARX NETWORK (${count} peer${count !== 1 ? 's' : ''})`;
		}
	}

	/**
	 * Update local server connection status
	 */
	private updateLocalStatus(status: 'online' | 'offline' | 'connecting' | 'reconnecting'): void {
		if (!this.localDot || !this.localLabel) { return; }

		this.connectionStatus = status;
		// Cache status to avoid loading flash on restart
		this.storageService.store(TarxSidebarPart.CONNECTION_STATUS_KEY, status, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this.localDot.classList.remove('active', 'connecting');

		switch (status) {
			case 'online':
				this.localDot.classList.add('active');
				this.localLabel.textContent = 'TARX LOCAL';
				this.setModelLoadingVisible(false);
				break;
			case 'offline':
				this.localLabel.textContent = 'TARX LOCAL (offline)';
				this.setModelLoadingVisible(false);
				break;
			case 'connecting':
				this.localDot.classList.add('connecting');
				this.localLabel.textContent = 'TARX LOCAL (connecting...)';
				this.setModelLoadingVisible(true);
				break;
			case 'reconnecting':
				this.localDot.classList.add('connecting');
				this.localLabel.textContent = 'TARX LOCAL (reconnecting...)';
				this.setModelLoadingVisible(false); // Only show on initial connect
				break;
		}
	}

	/**
	 * Create the model loading indicator (shown when model is starting)
	 */
	private createModelLoadingIndicator(): void {
		if (!this.tarxContainer) { return; }

		this.modelLoadingElement = append(this.tarxContainer, $('.tarx-model-loading'));
		this.modelLoadingElement.style.display = 'none'; // Hidden by default

		// Spinner element (styled via CSS animation)
		append(this.modelLoadingElement, $('.tarx-model-loading-spinner'));

		const text = append(this.modelLoadingElement, $('.tarx-model-loading-text'));
		text.textContent = 'Starting TARX engine...';

		const subtext = append(this.modelLoadingElement, $('.tarx-model-loading-subtext'));
		subtext.textContent = 'This may take a moment on first launch';
	}

	/**
	 * Show or hide the model loading indicator
	 */
	private setModelLoadingVisible(visible: boolean): void {
		if (this.modelLoadingElement) {
			this.modelLoadingElement.style.display = visible ? 'flex' : 'none';
		}
		// Also hide nav/sections when loading
		if (this.navRowsElement) {
			this.navRowsElement.style.display = visible ? 'none' : 'block';
		}
		if (this.sectionsContainer) {
			this.sectionsContainer.style.display = visible ? 'none' : 'block';
		}
	}

	/**
	 * Create the file upload/indexing progress element
	 */
	private createUploadProgressElement(): void {
		if (!this.tarxContainer) { return; }

		this.uploadProgressElement = append(this.tarxContainer, $('.tarx-upload-progress'));
		this.uploadProgressElement.style.display = 'none';

		// Header row with icon, text, and percentage
		const header = append(this.uploadProgressElement, $('.tarx-upload-progress-header'));

		const info = append(header, $('.tarx-upload-progress-info'));
		const icon = append(info, $('.tarx-upload-progress-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading));
		icon.classList.add('spinning');

		this.uploadProgressText = append(info, $('.tarx-upload-progress-text'));
		this.uploadProgressText.textContent = 'Uploading...';

		this.uploadProgressPercent = append(header, $('.tarx-upload-progress-percent'));
		this.uploadProgressPercent.textContent = '0%';

		// Progress bar
		const progressBar = append(this.uploadProgressElement, $('.tarx-upload-progress-bar'));
		this.uploadProgressBarFill = append(progressBar, $('.tarx-upload-progress-bar-fill'));
		this.uploadProgressBarFill.style.width = '0%';
	}

	/**
	 * Show upload/indexing progress
	 * @param text Progress text (e.g., "Uploading file.pdf...", "Indexing document...")
	 * @param percent Progress percentage (0-100)
	 */
	public showUploadProgress(text: string, percent: number): void {
		// Lazily create if needed
		if (!this.uploadProgressElement) {
			this.createUploadProgressElement();
		}

		if (this.uploadProgressElement) {
			this.uploadProgressElement.style.display = 'flex';
		}
		if (this.uploadProgressText) {
			this.uploadProgressText.textContent = text;
		}
		if (this.uploadProgressPercent) {
			this.uploadProgressPercent.textContent = `${Math.round(percent)}%`;
		}
		if (this.uploadProgressBarFill) {
			this.uploadProgressBarFill.style.width = `${percent}%`;
		}
	}

	/**
	 * Hide upload/indexing progress
	 */
	public hideUploadProgress(): void {
		if (this.uploadProgressElement) {
			this.uploadProgressElement.style.display = 'none';
		}
	}

	/**
	 * Register command handlers for upload progress
	 */
	private registerUploadProgressCommands(): void {
		// Override command handlers for sidebar integration
		this.navDisposables.add(
			this.commandService.onWillExecuteCommand(e => {
				if (e.commandId === 'tarx.showUploadProgress') {
					const args = e.args || [];
					if (args.length >= 2) {
						const text = args[0] as string;
						const percent = args[1] as number;
						this.showUploadProgress(text, percent);
					}
				} else if (e.commandId === 'tarx.hideUploadProgress') {
					this.hideUploadProgress();
				} else if (e.commandId === 'tarx.projects.refresh') {
					// Refresh projects list when command is executed
					console.log('[TARX Sidebar] Projects refresh triggered');
					this.loadProjects();
				} else if (e.commandId === 'tarx.history.refresh') {
					// Refresh history list when command is executed
					console.log('[TARX Sidebar] History refresh triggered');
					this.loadHistory();
				}
			})
		);
	}

	/**
	 * Start polling connection status from TARX extension
	 */
	private startConnectionStatusPolling(): void {
		// Initial check
		this.checkConnectionStatus();

		// Poll every 5 seconds
		this.connectionCheckInterval = setInterval(() => {
			this.checkConnectionStatus();
		}, 5000);
	}

	/**
	 * Check connection status from TARX extension
	 */
	private async checkConnectionStatus(): Promise<void> {
		try {
			const status = await this.commandService.executeCommand<{
				status: 'online' | 'offline' | 'connecting' | 'reconnecting';
				isOnline: boolean;
			}>('tarx.getConnectionStatus');

			if (status && status.status !== this.connectionStatus) {
				this.updateLocalStatus(status.status);
			}
		} catch {
			// Extension not loaded yet or command not available
		}
	}

	/**
	 * Nav rows: Chat and Voice with hover action buttons
	 */
	private createNavRows(): void {
		if (!this.tarxContainer) { return; }

		this.navRowsElement = append(this.tarxContainer, $('.tarx-nav-rows'));

		// Chat row
		const chatRow = append(this.navRowsElement, $('.tarx-nav-row'));
		chatRow.dataset.id = 'chat';

		const chatIcon = append(chatRow, $('.tarx-nav-row-icon'));
		chatIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussion));

		const chatLabel = append(chatRow, $('.tarx-nav-row-label'));
		chatLabel.textContent = 'Chat';

		const chatAction = append(chatRow, $('.tarx-action-btn'));
		chatAction.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
		chatAction.title = 'New Chat';

		// Row click opens existing chat, [+] button creates NEW chat
		const openChat = () => {
			console.log('[TARX Sidebar] Chat row clicked - opening existing chat');
			this.commandService.executeCommand('workbench.action.chat.open');
		};
		const newChat = () => {
			console.log('[TARX Sidebar] New Chat button clicked - creating new conversation');
			this.commandService.executeCommand('tarx.chat.new');
		};
		this.navDisposables.add(addDisposableListener(chatRow, EventType.CLICK, openChat));
		this.navDisposables.add(addDisposableListener(chatAction, EventType.CLICK, (e) => {
			e.stopPropagation();
			newChat();
		}));

		// Voice row - DISABLED FOR V1 RELEASE (re-enable in next release)
		// const voiceRow = append(this.navRowsElement, $('.tarx-nav-row'));
		// voiceRow.dataset.id = 'voice';
		// const voiceIcon = append(voiceRow, $('.tarx-nav-row-icon'));
		// voiceIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.mic));
		// const voiceLabel = append(voiceRow, $('.tarx-nav-row-label'));
		// voiceLabel.textContent = 'Voice';
		// const voiceAction = append(voiceRow, $('.tarx-action-btn.tarx-voice-btn'));
		// voiceAction.classList.add(...ThemeIcon.asClassNameArray(Codicon.play));
		// voiceAction.title = 'Start Voice';
		// this.navDisposables.add(addDisposableListener(voiceRow, EventType.CLICK, () => {
		// 	this.toggleVoice(voiceAction);
		// }));
		// this.navDisposables.add(addDisposableListener(voiceAction, EventType.CLICK, (e) => {
		// 	e.stopPropagation();
		// 	this.toggleVoice(voiceAction);
		// }));
	}

	// DISABLED FOR V1 RELEASE (re-enable in next release)
	// private toggleVoice(btn: HTMLElement): void {
	// 	this.isVoiceActive = !this.isVoiceActive;
	// 	btn.className = 'tarx-action-btn tarx-voice-btn';
	// 	if (this.isVoiceActive) {
	// 		console.log('[TARX Sidebar] Voice starting...');
	// 		btn.classList.add(...ThemeIcon.asClassNameArray(Codicon.debugPause));
	// 		btn.classList.add('recording');
	// 		btn.title = 'Stop Voice';
	// 		this.commandService.executeCommand('tarx.voice.start');
	// 	} else {
	// 		console.log('[TARX Sidebar] Voice stopping...');
	// 		btn.classList.add(...ThemeIcon.asClassNameArray(Codicon.play));
	// 		btn.classList.remove('recording');
	// 		btn.title = 'Start Voice';
	// 		this.commandService.executeCommand('tarx.voice.stop');
	// 	}
	// }

	/**
	 * Collapsible sections: CREATE, CODE, FILES, PROJECTS, HISTORY
	 */
	private createSections(): void {
		if (!this.tarxContainer) { return; }

		this.sectionsContainer = append(this.tarxContainer, $('.tarx-sections'));

		// CREATE - DISABLED FOR V1 RELEASE (re-enable in next release)
		// this.createSection('create', 'Create', Codicon.wand, [
		// 	{ id: 'design', label: 'Design', icon: Codicon.paintcan, command: 'tarx.create.design' },
		// 	{ id: 'imagine', label: 'Imagine', icon: Codicon.sparkle, command: 'tarx.create.imagine' }
		// ]);

		// CODE
		this.createSection('code', 'Code', Codicon.code, [
			{ id: 'scm', label: 'Source Control', icon: Codicon.sourceControl, command: 'workbench.view.scm' },
			{ id: 'debug', label: 'Run & Debug', icon: Codicon.debug, command: 'workbench.view.debug' },
			{ id: 'terminal', label: 'Terminal', icon: Codicon.terminal, command: 'workbench.action.terminal.toggleTerminal' }
		]);

		// FILES (with upload button)
		this.createFilesSection();

		// PROJECTS (with + button)
		this.createProjectsSection();

		// HISTORY (collapsible section)
		this.createHistorySection();
	}

	private createSection(id: string, title: string, icon: ThemeIcon, items: TarxNavItem[]): void {
		if (!this.sectionsContainer) { return; }

		console.log('[TARX Sidebar] Creating section:', id, 'with', items.length, 'items');

		const section = append(this.sectionsContainer, $('.tarx-section'));
		section.dataset.sectionId = id;

		// Default to expanded (false = not collapsed)
		const isCollapsed = this.sectionState.get(id) ?? false;
		console.log('[TARX Sidebar] Section', id, 'collapsed state:', isCollapsed);
		if (isCollapsed) {
			section.classList.add('collapsed');
		}

		// Header: icon + title + chevron
		const header = append(section, $('.tarx-section-header'));
		const iconEl = append(header, $('.tarx-section-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(icon));
		const titleEl = append(header, $('.tarx-section-title'));
		titleEl.textContent = title;
		const chevron = append(header, $('.tarx-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Content
		const content = append(section, $('.tarx-section-content'));

		for (const item of items) {
			const itemEl = append(content, $('.tarx-section-item'));
			itemEl.dataset.itemId = item.id;
			itemEl.title = item.label;

			const iconEl = append(itemEl, $('.tarx-section-item-icon'));
			// Always use codicons - customSvg not supported due to Trusted Types
			iconEl.classList.add(...ThemeIcon.asClassNameArray(item.icon));

			const label = append(itemEl, $('.tarx-section-item-label'));
			label.textContent = item.label;

			if (item.command) {
				console.log('[TARX Sidebar] Attaching click handler for:', item.label, '->', item.command);
				this.navDisposables.add(addDisposableListener(itemEl, EventType.CLICK, (e) => {
					e.stopPropagation(); // Prevent header collapse toggle
					console.log('[TARX Sidebar] Item clicked:', item.label, '-> executing:', item.command);
					this.openViewInAuxiliaryBar(item.command!, item.label);
				}));
			}
		}

		this.navDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const collapsed = section.classList.toggle('collapsed');
			this.sectionState.set(id, collapsed);
		}));
	}

	// Uploaded files data
	private uploadedFiles: Array<{ id: string; filename: string; size: number; uploadedAt: number }> = [];
	private filesContentEl: HTMLElement | undefined;

	/**
	 * FILES section with upload button and uploaded files list
	 */
	private createFilesSection(): void {
		if (!this.sectionsContainer) { return; }

		const section = append(this.sectionsContainer, $('.tarx-section'));
		section.dataset.sectionId = 'files';

		if (this.sectionState.get('files') ?? false) {
			section.classList.add('collapsed');
		}

		// Header: icon + title + upload button + chevron
		const header = append(section, $('.tarx-section-header'));
		const iconEl = append(header, $('.tarx-section-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.files));
		const titleEl = append(header, $('.tarx-section-title'));
		titleEl.textContent = 'Files';

		// Upload button (paperclip icon)
		const uploadBtn = append(header, $('.tarx-action-btn.tarx-section-upload'));
		uploadBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.cloudUpload));
		uploadBtn.title = 'Upload File';

		const chevron = append(header, $('.tarx-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Content container
		this.filesContentEl = append(section, $('.tarx-section-content'));

		// Default items (Explorer, Search)
		const defaultItems: TarxNavItem[] = [
			{ id: 'explorer', label: 'Explorer', icon: Codicon.files, command: 'workbench.view.explorer' },
			{ id: 'search', label: 'Search', icon: Codicon.search, command: 'workbench.view.search' }
		];

		for (const item of defaultItems) {
			const itemEl = append(this.filesContentEl, $('.tarx-section-item'));
			itemEl.dataset.itemId = item.id;
			itemEl.title = item.label;

			const iconEl = append(itemEl, $('.tarx-section-item-icon'));
			iconEl.classList.add(...ThemeIcon.asClassNameArray(item.icon));

			const label = append(itemEl, $('.tarx-section-item-label'));
			label.textContent = item.label;

			if (item.command) {
				this.navDisposables.add(addDisposableListener(itemEl, EventType.CLICK, (e) => {
					e.stopPropagation();
					this.openViewInAuxiliaryBar(item.command!, item.label);
				}));
			}
		}

		// Divider for uploaded files
		const divider = append(this.filesContentEl, $('.tarx-section-divider'));
		divider.textContent = 'Uploaded';

		// Uploaded files list container
		const uploadedFilesContainer = append(this.filesContentEl, $('.tarx-uploaded-files'));
		uploadedFilesContainer.dataset.containerId = 'uploaded-files';

		// Upload button click handler - opens native file picker
		this.navDisposables.add(addDisposableListener(uploadBtn, EventType.CLICK, (e) => {
			e.stopPropagation();
			this.handleFileUpload();
		}));

		// Header collapse toggle
		this.navDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const collapsed = section.classList.toggle('collapsed');
			this.sectionState.set('files', collapsed);
		}));

		// Load uploaded files
		this.loadUploadedFiles();

		// Setup drag and drop on the section
		this.setupFileDragDrop(section);
	}

	/**
	 * Handle file upload via native file picker
	 */
	private handleFileUpload(): void {
		console.log('[TARX] Opening file picker...');

		// Create hidden file input
		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.multiple = true;
		fileInput.accept = '.txt,.md,.pdf,.doc,.docx,.py,.js,.ts,.json,.yaml,.yml,.xml,.html,.css';

		fileInput.onchange = async () => {
			const files = Array.from(fileInput.files || []);
			console.log('[TARX] Files selected:', files.map(f => f.name));

			for (const file of files) {
				await this.uploadFile(file);
			}
		};

		fileInput.click();
	}

	/**
	 * Upload a single file
	 */
	private async uploadFile(file: File): Promise<void> {
		console.log('[TARX] Uploading file:', file.name, 'size:', file.size);

		// Show upload progress
		this.commandService.executeCommand('tarx.showUploadProgress', `Uploading ${file.name}...`, 0);

		try {
			// Read file content
			const content = await this.readFileAsText(file);

			// Call TARX extension command to upload and index
			await this.commandService.executeCommand('tarx.uploadFile', {
				filename: file.name,
				content: content,
				size: file.size,
				mimeType: file.type || 'text/plain'
			});

			// Update progress
			this.commandService.executeCommand('tarx.showUploadProgress', `Indexing ${file.name}...`, 50);

			// Refresh uploaded files list
			await this.loadUploadedFiles();

			// Hide progress
			this.commandService.executeCommand('tarx.hideUploadProgress');

			// Show success notification
			this.tarxNotificationService.info(`Uploaded ${file.name}`);

		} catch (error) {
			console.error('[TARX] Upload failed:', error);
			this.commandService.executeCommand('tarx.hideUploadProgress');
			this.tarxNotificationService.error(`Failed to upload ${file.name}: ${error}`);
		}
	}

	/**
	 * Read file as text
	 */
	private readFileAsText(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = () => reject(reader.error);
			reader.readAsText(file);
		});
	}

	/**
	 * Setup drag and drop for file uploads
	 */
	private setupFileDragDrop(section: HTMLElement): void {
		let dragCounter = 0;

		this.navDisposables.add(addDisposableListener(section, 'dragenter', (e: DragEvent) => {
			e.preventDefault();
			dragCounter++;
			section.classList.add('drag-over');
		}));

		this.navDisposables.add(addDisposableListener(section, 'dragleave', (e: DragEvent) => {
			e.preventDefault();
			dragCounter--;
			if (dragCounter === 0) {
				section.classList.remove('drag-over');
			}
		}));

		this.navDisposables.add(addDisposableListener(section, 'dragover', (e: DragEvent) => {
			e.preventDefault();
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'copy';
			}
		}));

		this.navDisposables.add(addDisposableListener(section, 'drop', async (e: DragEvent) => {
			e.preventDefault();
			dragCounter = 0;
			section.classList.remove('drag-over');

			const files = Array.from(e.dataTransfer?.files || []);
			console.log('[TARX] Files dropped:', files.map(f => f.name));

			for (const file of files) {
				await this.uploadFile(file);
			}
		}));
	}

	/**
	 * Load uploaded files from TARX extension
	 */
	private async loadUploadedFiles(): Promise<void> {
		try {
			const result = await this.commandService.executeCommand<Array<{
				id: string;
				filename: string;
				size: number;
				uploadedAt: number;
			}>>('tarx.getUploadedFiles');

			this.uploadedFiles = result || [];
			this.renderUploadedFiles();
		} catch (error) {
			console.log('[TARX] Could not load uploaded files:', error);
			this.uploadedFiles = [];
			this.renderUploadedFiles();
		}
	}

	/**
	 * Render uploaded files list
	 */
	private renderUploadedFiles(): void {
		const container = this.filesContentEl?.querySelector('[data-container-id="uploaded-files"]');
		if (!container) { return; }

		clearNode(container as HTMLElement);

		if (this.uploadedFiles.length === 0) {
			const emptyEl = append(container as HTMLElement, $('.tarx-empty-state'));
			emptyEl.textContent = 'Drop files here or click to attach';
			return;
		}

		for (const file of this.uploadedFiles) {
			const itemEl = append(container as HTMLElement, $('.tarx-uploaded-file'));
			itemEl.dataset.fileId = file.id;

			const iconEl = append(itemEl, $('.tarx-file-icon'));
			iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.file));

			const nameEl = append(itemEl, $('.tarx-file-name'));
			nameEl.textContent = file.filename;
			nameEl.title = file.filename;

			const sizeEl = append(itemEl, $('.tarx-file-size'));
			sizeEl.textContent = this.formatFileSize(file.size);

			// Delete button (appears on hover)
			const deleteBtn = append(itemEl, $('.tarx-file-delete'));
			deleteBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.trash));
			deleteBtn.title = 'Remove file';

			this.navDisposables.add(addDisposableListener(deleteBtn, EventType.CLICK, async (e) => {
				e.stopPropagation();
				await this.commandService.executeCommand('tarx.deleteUploadedFile', file.id);
				await this.loadUploadedFiles();
			}));
		}
	}

	/**
	 * Format file size for display
	 */
	private formatFileSize(bytes: number): string {
		if (bytes < 1024) { return `${bytes} B`; }
		if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	private createProjectsSection(): void {
		if (!this.sectionsContainer) { return; }

		const section = append(this.sectionsContainer, $('.tarx-section'));
		section.dataset.sectionId = 'projects';

		if (this.sectionState.get('projects') ?? false) {
			section.classList.add('collapsed');
		}

		// Header: icon + title + add button + chevron
		const header = append(section, $('.tarx-section-header'));
		const iconEl = append(header, $('.tarx-section-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.project));
		const titleEl = append(header, $('.tarx-section-title'));
		titleEl.textContent = 'Projects';

		const addBtn = append(header, $('.tarx-action-btn.tarx-section-add'));
		addBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
		addBtn.title = 'New Project';

		const chevron = append(header, $('.tarx-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Content container (we'll populate this dynamically)
		this.projectsContentEl = append(section, $('.tarx-section-content'));

		// Add button click handler - show modal
		this.navDisposables.add(addDisposableListener(addBtn, EventType.CLICK, async (e) => {
			e.stopPropagation();
			const modal = new TarxProjectModal();
			const result = await modal.show();
			if (result) {
				// Create project with the provided name and instructions
				console.log('[TARX Sidebar] Creating project:', result.name);
				await this.commandService.executeCommand('tarx.projects.create', result.name, result.instructions);
				// Refresh the projects list
				this.loadProjects();
			}
		}));

		// Header collapse toggle
		this.navDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const collapsed = section.classList.toggle('collapsed');
			this.sectionState.set('projects', collapsed);
		}));

		// Load projects from database with retry (extension may not be ready on window reload)
		this.loadProjectsWithRetry(10);  // 10 retries with exponential backoff
	}

	/**
	 * Load projects with retry logic (extension may not be ready yet)
	 * Uses exponential backoff: 500ms, 1s, 2s, 4s, 8s, etc.
	 */
	private async loadProjectsWithRetry(retries: number, delayMs: number = 500): Promise<void> {
		console.log(`[TARX Sidebar] loadProjectsWithRetry called (${retries} retries left, ${delayMs}ms delay)`);
		try {
			await this.loadProjects();
			if (this.projects.length === 0 && retries > 0) {
				// No projects found - could be extension not ready OR actually no projects
				// Retry with exponential backoff
				console.log(`[TARX Sidebar] No projects, retrying in ${delayMs}ms (${retries} left)`);
				setTimeout(() => this.loadProjectsWithRetry(retries - 1, Math.min(delayMs * 2, 8000)), delayMs);
			} else if (this.projects.length > 0) {
				console.log(`[TARX Sidebar] Got ${this.projects.length} projects - stopping retries`);
			}
		} catch (e) {
			if (retries > 0) {
				console.log(`[TARX Sidebar] loadProjects failed, retrying in ${delayMs}ms (${retries} left):`, e);
				setTimeout(() => this.loadProjectsWithRetry(retries - 1, Math.min(delayMs * 2, 8000)), delayMs);
			} else {
				console.log('[TARX Sidebar] loadProjects failed, no retries left');
			}
		}
	}

	/**
	 * Load projects from the TARX extension database
	 */
	private async loadProjects(): Promise<void> {
		console.log('[TARX Sidebar] loadProjects called');
		try {
			const projects = await this.commandService.executeCommand<TarxProject[]>('tarx.projects.list');
			console.log('[TARX Sidebar] Got projects:', projects?.length || 0, projects);
			this.projects = projects || [];

			// In webview mode, send data to webview instead of rendering DOM
			if (this.USE_WEBVIEW_MODE) {
				this.sendWebviewMessage({
					command: 'projectsLoaded',
					projects: this.projects
				});
			} else {
				this.renderProjects();
			}
		} catch (e) {
			console.log('[TARX Sidebar] Failed to load projects:', e);
			this.projects = [];
			if (this.USE_WEBVIEW_MODE) {
				this.sendWebviewMessage({
					command: 'projectsLoaded',
					projects: []
				});
			} else {
				this.renderProjects();
			}
		}
	}

	/**
	 * Render project items in the Projects section
	 */
	private renderProjects(): void {
		console.log('[TARX Sidebar] renderProjects() called');
		console.log('[TARX Sidebar] projectsContentEl exists:', !!this.projectsContentEl);
		console.log('[TARX Sidebar] projects count:', this.projects.length);

		if (!this.projectsContentEl) {
			console.error('[TARX Sidebar] ERROR: projectsContentEl is null/undefined!');
			return;
		}

		// Clear existing content
		this.projectsContentEl.textContent = '';
		console.log('[TARX Sidebar] Cleared existing content');

		if (this.projects.length === 0) {
			console.log('[TARX Sidebar] No projects - showing empty state');
			// Show empty state with text link
			const emptyState = append(this.projectsContentEl, $('.tarx-section-empty-state'));

			const emptyText = append(emptyState, $('.tarx-empty-state-text'));
			emptyText.textContent = 'No projects yet';

			// Create Project as text link (not button)
			const createLink = append(emptyState, $('a.tarx-text-link'));
			createLink.textContent = '+ Create Project';
			createLink.style.cssText = 'color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 12px; text-decoration: none;';

			this.navDisposables.add(addDisposableListener(createLink, EventType.CLICK, () => {
				this.commandService.executeCommand('workbench.action.files.openFolder');
			}));
		} else {
			// Render project items
			console.log('[TARX Sidebar] Rendering', this.projects.length, 'projects');
			for (const project of this.projects) {
				console.log('[TARX Sidebar] Rendering project:', project.name, 'id:', project.id, 'path:', project.path);
				const item = append(this.projectsContentEl, $('.tarx-section-item'));
				item.dataset.projectId = project.id;

				if (project.isActive) {
					item.classList.add('active');
				}

				const icon = append(item, $('.tarx-section-item-icon'));
				// Use different icon based on project type
				const iconType = project.type === 'typescript' || project.type === 'javascript'
					? Codicon.json
					: project.type === 'python'
						? Codicon.symbolMethod
						: Codicon.folder;
				icon.classList.add(...ThemeIcon.asClassNameArray(iconType));

				const label = append(item, $('.tarx-section-item-label'));
				label.textContent = project.name;
				label.title = project.path;

				// Click to open project - use project.path (filesystem path), NOT project.id (UUID)
				this.navDisposables.add(addDisposableListener(item, EventType.CLICK, async () => {
					try {
						if (!project.path) {
							console.error('[TARX Sidebar] Project has no path:', project);
							return;
						}
						console.log('[TARX Sidebar] Opening project:', project.name, 'at', project.path);
						await this.commandService.executeCommand('tarx.projects.open', project.path);
					} catch (err) {
						console.error('[TARX Sidebar] Project open crashed:', err);
						// Don't crash - just log the error
					}
				}));
			}

			console.log('[TARX Sidebar] Finished rendering', this.projects.length, 'projects');

			// Add "Open Folder" at the end
			const openFolder = append(this.projectsContentEl, $('.tarx-section-item'));
			openFolder.dataset.itemId = 'openFolder';
			const openFolderIcon = append(openFolder, $('.tarx-section-item-icon'));
			openFolderIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.folderOpened));
			const openFolderLabel = append(openFolder, $('.tarx-section-item-label'));
			openFolderLabel.textContent = 'Open Folder...';
			console.log('[TARX Sidebar] Added Open Folder button. projectsContentEl children:', this.projectsContentEl.childElementCount);

			this.navDisposables.add(addDisposableListener(openFolder, EventType.CLICK, () => {
				this.commandService.executeCommand('workbench.action.files.openFolder');
			}));
		}
	}

	/**
	 * Refresh projects list (can be called externally)
	 */
	public refreshProjects(): void {
		this.loadProjects();
	}

	/**
	 * History section: collapsible, grouped by Today, Yesterday, This Week
	 */
	private createHistorySection(): void {
		if (!this.sectionsContainer) { return; }

		const section = append(this.sectionsContainer, $('.tarx-section'));
		section.dataset.sectionId = 'history';
		this.historyElement = section;

		if (this.sectionState.get('history') ?? false) {
			section.classList.add('collapsed');
		}

		// Header: icon + title + "See all" button + chevron
		const header = append(section, $('.tarx-section-header'));
		const iconEl = append(header, $('.tarx-section-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.history));
		const titleEl = append(header, $('.tarx-section-title'));
		titleEl.textContent = 'History';

		const seeAllBtn = append(header, $('.tarx-action-btn.tarx-section-see-all'));
		seeAllBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowRight));
		seeAllBtn.title = 'See all history';

		const chevron = append(header, $('.tarx-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Content
		const content = append(section, $('.tarx-section-content.tarx-history-content'));
		this.renderHistoryItems(content);

		// See all button click
		this.navDisposables.add(addDisposableListener(seeAllBtn, EventType.CLICK, (e) => {
			e.stopPropagation();
			this.commandService.executeCommand('tarx.history.showAll');
		}));

		// Collapse toggle
		this.navDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const collapsed = section.classList.toggle('collapsed');
			this.sectionState.set('history', collapsed);
		}));
	}

	private renderHistoryItems(container: HTMLElement): void {
		container.textContent = '';

		if (this.historyItems.length === 0) {
			// Show empty state (no CTA button)
			const emptyState = append(container, $('.tarx-section-empty-state'));

			const emptyText = append(emptyState, $('.tarx-empty-state-text'));
			emptyText.textContent = 'No conversations yet';
			return;
		}

		const dayMs = 24 * 60 * 60 * 1000;
		const todayStart = new Date().setHours(0, 0, 0, 0);
		const yesterdayStart = todayStart - dayMs;
		const weekStart = todayStart - 6 * dayMs;

		const today: TarxHistoryItem[] = [];
		const yesterday: TarxHistoryItem[] = [];
		const thisWeek: TarxHistoryItem[] = [];

		for (const item of this.historyItems) {
			if (item.timestamp >= todayStart) {
				today.push(item);
			} else if (item.timestamp >= yesterdayStart) {
				yesterday.push(item);
			} else if (item.timestamp >= weekStart) {
				thisWeek.push(item);
			}
		}

		if (today.length > 0) { this.renderHistoryGroup(container, 'Today', today); }
		if (yesterday.length > 0) { this.renderHistoryGroup(container, 'Yesterday', yesterday); }
		if (thisWeek.length > 0) { this.renderHistoryGroup(container, 'This Week', thisWeek); }
	}

	private renderHistoryGroup(container: HTMLElement, label: string, items: TarxHistoryItem[]): void {
		const groupLabel = append(container, $('.tarx-history-group-label'));
		groupLabel.textContent = label;

		for (const item of items) {
			const el = append(container, $('.tarx-history-item'));
			el.dataset.id = item.id;
			el.dataset.source = item.source;
			if (item.spaceId) {
				el.dataset.spaceId = item.spaceId;
			}

			// Icon based on source (no emojis)
			const iconEl = append(el, $('.tarx-history-item-icon'));
			const isClaude = this.isClaudeSource(item.source, item.title);
			if (isClaude) {
				// Use Claude SVG logo via img element (avoids TrustedHTML issues)
				const img = document.createElement('img');
				img.src = this.getClaudeSvgDataUri();
				img.width = 16;
				img.height = 16;
				img.alt = 'Claude';
				iconEl.appendChild(img);
			} else {
				// Use TARX eyes icon for TARX chats
				const img = document.createElement('img');
				img.src = FileAccess.asBrowserUri('vs/workbench/browser/parts/tarxsidebar/media/tarx-eyes.png').toString(true);
				img.width = 16;
				img.height = 16;
				img.alt = 'TARX';
				iconEl.appendChild(img);
			}

			// Title and time
			const timeAgo = this.formatTimeAgo(item.timestamp);
			const titleEl = append(el, $('.tarx-history-item-title'));
			titleEl.textContent = item.title;

			const timeEl = append(el, $('.tarx-history-item-time'));
			timeEl.textContent = timeAgo;

			this.navDisposables.add(addDisposableListener(el, EventType.CLICK, () => {
				console.log('[TARX Sidebar] History item clicked:', item.id, 'spaceId:', item.spaceId);
				// Route to appropriate handler based on source
				if (item.spaceId) {
					this.commandService.executeCommand('tarx.openSession', item.id, item.spaceId);
				} else {
					this.commandService.executeCommand('tarx.openConversation', item.id);
				}
			}));
		}
	}

	private isClaudeSource(source?: string, title?: string): boolean {
		if (source) {
			const s = source.toLowerCase();
			if (s === 'claude' || s.includes('claude')) return true;
		}
		if (title) {
			const t = title.toLowerCase();
			if (t.includes('claude')) return true;
		}
		return false;
	}

	private getClaudeSvgDataUri(): string {
		// Claude logo SVG as data URI (avoids TrustedHTML security issues)
		const svg = `<svg width="16" height="16" viewBox="0 -.01 39.5 39.53" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m7.75 26.27 7.77-4.36.13-.38-.13-.21h-.38l-1.3-.08-4.44-.12-3.85-.16-3.73-.2-.94-.2-.88-1.16.09-.58.79-.53 1.13.1 2.5.17 3.75.26 2.72.16 4.03.42h.64l.09-.26-.22-.16-.17-.16-3.88-2.63-4.2-2.78-2.2-1.6-1.19-.81-.6-.76-.26-1.66 1.08-1.19 1.45.1.37.1 1.47 1.13 3.14 2.43 4.1 3.02.6.5.24-.17.03-.12-.27-.45-2.23-4.03-2.38-4.1-1.06-1.7-.28-1.02c-.1-.42-.17-.77-.17-1.2l1.23-1.67.68-.22 1.64.22.69.6 1.02 2.33 1.65 3.67 2.56 4.99.75 1.48.4 1.37.15.42h.26v-.24l.21-2.81.39-3.45.38-4.44.13-1.25.62-1.5 1.23-.81.96.46.79 1.13-.11.73-.47 3.05-.92 4.78-.6 3.2h.35l.4-.4 1.62-2.15 2.72-3.4 1.2-1.35 1.4-1.49.9-.71h1.7l1.25 1.86-.56 1.92-1.75 2.22-1.45 1.88-2.08 2.8-1.3 2.24.12.18.31-.03 4.7-1 2.54-.46 3.03-.52 1.37.64.15.65-.54 1.33-3.24.8-3.8.76-5.66 1.34-.07.05.08.1 2.55.24 1.09.06h2.67l4.97.37 1.3.86.78 1.05-.13.8-2 1.02-2.7-.64-6.3-1.5-2.16-.54h-.3v.18l1.8 1.76 3.3 2.98 4.13 3.84.21.95-.53.75-.56-.08-3.63-2.73-1.4-1.23-3.17-2.67h-.21v.28l.73 1.07 3.86 5.8.2 1.78-.28.58-1 .35-1.1-.2-2.26-3.17-2.33-3.57-1.88-3.2-.23.13-1.11 11.95-.52.61-1.2.46-1-.76-.53-1.23.53-2.43.64-3.17.52-2.52.47-3.13.28-1.04-.02-.07-.23.03-2.36 3.24-3.59 4.85-2.84 3.04-.68.27-1.18-.61.11-1.09.66-.97 3.93-5 2.37-3.1 1.53-1.79-.01-.26h-.09l-10.44 6.78-1.86.24-.8-.75.1-1.23.38-.4 3.14-2.16z" fill="#d97757"/></svg>`;
		return `data:image/svg+xml;base64,${btoa(svg)}`;
	}

	private formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	public updateHistory(items: TarxHistoryItem[]): void {
		this.historyItems = items;

		// In webview mode, send data to webview instead of rendering DOM
		if (this.USE_WEBVIEW_MODE) {
			this.sendWebviewMessage({
				command: 'historyLoaded',
				items: this.historyItems
			});
		} else if (this.historyElement) {
			const content = this.historyElement.querySelector('.tarx-history-content');
			if (content) { this.renderHistoryItems(content as HTMLElement); }
		}
	}

	/**
	 * Load history with retry logic (extension may not be ready yet)
	 * Uses exponential backoff: 500ms, 1s, 2s, 4s, 8s
	 */
	private async loadHistoryWithRetry(retries: number, delayMs: number = 500): Promise<void> {
		console.log(`[TARX Sidebar] loadHistoryWithRetry called (${retries} retries left, ${delayMs}ms delay)`);
		try {
			const foundData = await this.loadHistory();
			// Retry if no data found (extension may not be ready yet)
			if (!foundData && retries > 0) {
				console.log(`[TARX Sidebar] loadHistory returned no data, retrying in ${delayMs}ms (${retries} left)`);
				setTimeout(() => this.loadHistoryWithRetry(retries - 1, Math.min(delayMs * 2, 8000)), delayMs);
			} else if (foundData) {
				console.log('[TARX Sidebar] Got history data - stopping retries');
			}
		} catch (e) {
			if (retries > 0) {
				console.log(`[TARX Sidebar] loadHistory failed, retrying in ${delayMs}ms (${retries} left):`, e);
				setTimeout(() => this.loadHistoryWithRetry(retries - 1, Math.min(delayMs * 2, 8000)), delayMs);
			} else {
				console.log('[TARX Sidebar] loadHistory failed, no retries left');
			}
		}
	}

	/**
	 * Load history from both conversations table AND sessions table
	 * Returns true if any data was found
	 * OPTIMIZED: Runs both queries in parallel with Promise.all for ~50% faster load
	 */
	private async loadHistory(): Promise<boolean> {
		console.log('[TARX Sidebar] loadHistory called - loading from both tables in parallel');
		const allItems: TarxHistoryItem[] = [];

		try {
			// Run both queries in parallel for faster loading
			const [convResult, sessResult] = await Promise.all([
				// Query 1: Load from conversations table (legacy/internal chats)
				this.commandService.executeCommand<{
					conversations: Array<{
						id: string;
						title: string;
						timestamp: number;
						source?: 'claude' | 'tarx';
					}>;
					turns: unknown[];
				}>('tarx.getConversationHistory', 50).catch(() => undefined),

				// Query 2: Load from sessions table (MCP-based chats)
				this.commandService.executeCommand<{
					sessions: Array<{
						id: string;
						title: string;
						updatedAt: number;
						spaceId: string;
						spaceName: string;
						model?: string;
					}>;
				}>('tarx.getSessionHistory', 50).catch(() => undefined)
			]);

			// Process conversations
			if (convResult && convResult.conversations && convResult.conversations.length > 0) {
				const convItems: TarxHistoryItem[] = convResult.conversations.map(c => ({
					id: c.id,
					title: c.title || 'Untitled',
					timestamp: c.timestamp,
					source: c.source || (c.title?.startsWith('Claude') ? 'claude' : 'tarx')
				}));
				console.log('[TARX Sidebar] Loaded from conversations table:', convItems.length);
				allItems.push(...convItems);
			}

			// Process sessions
			if (sessResult && sessResult.sessions && sessResult.sessions.length > 0) {
				const sessItems: TarxHistoryItem[] = sessResult.sessions.map(s => ({
					id: s.id,
					title: s.title || 'Untitled',
					timestamp: s.updatedAt,
					source: s.model === 'claude' ? 'claude' : 'tarx',
					spaceId: s.spaceId,
					spaceName: s.spaceName
				}));
				console.log('[TARX Sidebar] Loaded from sessions table:', sessItems.length);
				allItems.push(...sessItems);
			}

			// Deduplicate by ID (prefer newer timestamp)
			const uniqueMap = new Map<string, TarxHistoryItem>();
			for (const item of allItems) {
				const existing = uniqueMap.get(item.id);
				if (!existing || item.timestamp > existing.timestamp) {
					uniqueMap.set(item.id, item);
				}
			}
			const uniqueItems = Array.from(uniqueMap.values());

			// Sort by timestamp descending
			uniqueItems.sort((a, b) => b.timestamp - a.timestamp);

			console.log('[TARX Sidebar] Total unique history items:', uniqueItems.length);
			this.updateHistory(uniqueItems);

			// Return true if we found any data
			return uniqueItems.length > 0;

		} catch (e) {
			console.log('[TARX Sidebar] Failed to load history:', e);
			return false;
		}
	}

	/**
	 * Open a view in the Auxiliary Bar (right side).
	 * Since TARX sidebar replaces the primary sidebar, we show views on the right.
	 * This method ensures the Auxiliary Bar is visible before opening views.
	 */
	private async openViewInAuxiliaryBar(viewContainerId: string, label: string): Promise<void> {
		console.log(`[TARX Sidebar] Opening view in Auxiliary Bar: ${label} -> ${viewContainerId}`);
		try {
			// Get services - use IViewsService which handles location properly
			const viewsService = this.instantiationService.invokeFunction(
				accessor => accessor.get(IViewsService)
			);
			const viewDescriptorService = this.instantiationService.invokeFunction(
				accessor => accessor.get(IViewDescriptorService)
			);

			// Ensure Auxiliary Bar is visible FIRST
			if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
				console.log('[TARX Sidebar] Showing Auxiliary Bar...');
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			// Get the view container
			const viewContainer = viewDescriptorService.getViewContainerById(viewContainerId);
			if (!viewContainer) {
				console.error(`[TARX Sidebar] View container not found: ${viewContainerId}`);
				return;
			}

			const currentLocation = viewDescriptorService.getViewContainerLocation(viewContainer);
			console.log(`[TARX Sidebar] View container ${viewContainerId} current location: ${currentLocation}`);

			// Move to Auxiliary Bar if not already there
			if (currentLocation !== ViewContainerLocation.AuxiliaryBar) {
				console.log('[TARX Sidebar] Moving view container to Auxiliary Bar...');
				viewDescriptorService.moveViewContainerToLocation(
					viewContainer,
					ViewContainerLocation.AuxiliaryBar,
					undefined,
					'tarx.sidebar'
				);
				// Wait for the move event to process and re-register the pane composite
				await new Promise(resolve => setTimeout(resolve, 150));
			}

			// Get pane composite service to explicitly open the view
			const paneCompositeService = this.instantiationService.invokeFunction(
				accessor => accessor.get(IPaneCompositePartService)
			);

			// Explicitly open the pane composite in Auxiliary Bar
			console.log('[TARX Sidebar] Opening pane composite via IPaneCompositePartService... v4');
			const pane = await paneCompositeService.openPaneComposite(
				viewContainerId,
				ViewContainerLocation.AuxiliaryBar,
				true // focus
			);

			if (pane) {
				console.log(`[TARX Sidebar] Successfully opened: ${label} - pane ID: ${pane.getId()}`);
				// Ensure auxiliary bar has proper size
				const currentSize = this.layoutService.getSize(Parts.AUXILIARYBAR_PART);
				console.log(`[TARX Sidebar] Current auxiliary bar size:`, currentSize);
				if (!currentSize || currentSize.width < 200) {
					console.log('[TARX Sidebar] Setting auxiliary bar size to 300px');
					this.layoutService.setSize(Parts.AUXILIARYBAR_PART, { width: 300, height: -1 });
				}
				this.layoutService.focusPart(Parts.AUXILIARYBAR_PART);
			} else {
				console.warn(`[TARX Sidebar] Pane composite returned null - Extensions may not be registered in AuxiliaryBar`);
				// Fallback: try opening via viewsService
				console.log('[TARX Sidebar] Trying fallback via viewsService.openViewContainer...');
				await viewsService.openViewContainer(viewContainerId, true);
			}
		} catch (err) {
			console.error(`[TARX Sidebar] Failed to open: ${viewContainerId}`, err);
		}
	}

	/**
	 * Footer: Compute, Extensions, Settings, and Collapse toggle (stacked vertically)
	 */
	private createFooter(): void {
		if (!this.tarxContainer) { return; }

		this.footerElement = append(this.tarxContainer, $('.tarx-footer'));
		console.log('[TARX DEBUG] Footer element created:', this.footerElement);
		// Force footer to be clickable
		this.footerElement.style.pointerEvents = 'auto';
		this.footerElement.style.position = 'relative';
		this.footerElement.style.zIndex = '100';

		// Compute row with dropdown
		const computeRow = append(this.footerElement, $('.tarx-footer-row.tarx-compute-row'));
		computeRow.title = 'Compute';
		this.computePill = computeRow; // Reuse computePill reference for dropdown toggle
		const computeIcon = append(computeRow, $('span.tarx-compute-chip-icon'));
		computeIcon.appendChild(this.createChipSvg());
		const computeLabel = append(computeRow, $('span.tarx-footer-label'));
		computeLabel.textContent = 'Compute';
		const computeChevron = append(computeRow, $('span.tarx-compute-chevron'));
		computeChevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Click to show dropdown
		this.navDisposables.add(addDisposableListener(computeRow, EventType.CLICK, (e) => {
			e.stopPropagation();
			this.toggleComputeDropdown();
		}));

		// Create dropdown (hidden by default)
		this.createComputeDropdown();

		// Close dropdown when clicking outside
		this.navDisposables.add(addDisposableListener(document, EventType.CLICK, () => {
			this.hideComputeDropdown();
		}));

		// Extensions row - with nuclear debugging
		const extRow = append(this.footerElement, $('.tarx-footer-row'));
		console.log('[TARX DEBUG] extRow created:', extRow);
		extRow.title = 'Extensions';
		// Force clickability
		extRow.style.cursor = 'pointer';
		extRow.style.pointerEvents = 'auto';
		extRow.style.zIndex = '1000';

		const extIcon = append(extRow, $('span'));
		extIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.extensions));
		const extLabel = append(extRow, $('span.tarx-footer-label'));
		extLabel.textContent = 'Extensions';

		// Mousedown fires before click - debug if events reach element at all
		extRow.addEventListener('mousedown', () => console.log('[TARX DEBUG] mousedown on extRow'));
		extRow.addEventListener('mouseup', () => console.log('[TARX DEBUG] mouseup on extRow'));

		this.navDisposables.add(addDisposableListener(extRow, EventType.CLICK, (e) => {
			e.stopPropagation();
			e.preventDefault();
			console.log('[TARX Sidebar] Extensions clicked - opening custom view');

			// Show custom TARX Extensions modal (no native VS Code viewlet)
			const modal = new TarxExtensionsModal();
			modal.show();
		}));

		// Settings row
		const settingsRow = append(this.footerElement, $('.tarx-footer-row'));
		settingsRow.title = 'Settings';
		const settingsIcon = append(settingsRow, $('span'));
		settingsIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gear));
		const settingsLabel = append(settingsRow, $('span.tarx-footer-label'));
		settingsLabel.textContent = 'Settings';
		this.navDisposables.add(addDisposableListener(settingsRow, EventType.CLICK, () => {
			this.commandService.executeCommand('workbench.action.openSettings');
		}));

		// Collapse row
		const collapseRow = append(this.footerElement, $('.tarx-footer-row.tarx-collapse-row'));
		collapseRow.title = this.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
		this.collapseIcon = append(collapseRow, $('span'));
		// Use correct icon based on current collapsed state
		const collapseIconType = this.isCollapsed ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft;
		this.collapseIcon.classList.add(...ThemeIcon.asClassNameArray(collapseIconType));
		const collapseLabel = append(collapseRow, $('span.tarx-footer-label'));
		collapseLabel.textContent = 'Collapse';
		this.navDisposables.add(addDisposableListener(collapseRow, EventType.CLICK, () => {
			this.toggleCollapse();
		}));

		console.log('[TARX INIT] createFooter completed - footer has', this.footerElement?.childNodes.length, 'children');
	}

	private collapseIcon: HTMLElement | undefined;
	private static readonly EXPANDED_WIDTH_KEY = 'tarx.sidebar.expandedWidth';
	private static readonly COLLAPSED_WIDTH = 48;
	private static readonly DEFAULT_EXPANDED_WIDTH = 240;

	private toggleCollapse(): void {
		console.log('[TARX] toggleCollapse called, current isCollapsed:', this.isCollapsed);
		this.isCollapsed = !this.isCollapsed;
		console.log('[TARX] new isCollapsed:', this.isCollapsed);

		// Toggle CSS class on our container
		if (this.tarxContainer) {
			this.tarxContainer.classList.toggle('collapsed', this.isCollapsed);
		}

		// Notify the webview of the collapsed state
		if (this._webview.value) {
			this._webview.value.postMessage({ command: 'setCollapsed', collapsed: this.isCollapsed });
		}

		// Actually resize the Part via layout service
		const container = this.getContainer();
		if (this.isCollapsed) {
			// Store current width before collapsing
			if (container) {
				const currentWidth = container.offsetWidth;
				if (currentWidth > TarxSidebarPart.COLLAPSED_WIDTH) {
					this.storageService.store(TarxSidebarPart.EXPANDED_WIDTH_KEY, currentWidth, StorageScope.PROFILE, StorageTarget.USER);
				}
			}
			// Resize to collapsed width
			console.log('[TARX] About to call setSize to collapse to', TarxSidebarPart.COLLAPSED_WIDTH);
			this.layoutService.setSize(Parts.SIDEBAR_PART, { width: TarxSidebarPart.COLLAPSED_WIDTH, height: -1 });

			// CRITICAL: Ensure sidebar remains visible after resize
			// The grid may try to hide the sidebar when it reaches minimum size
			// Use setTimeout to ensure this runs after the grid's layout cycle
			setTimeout(() => {
				console.log('[TARX] Post-resize: ensuring sidebar stays visible');
				// Force the sidebar part to be visible at the DOM level
				const partContainer = this.getContainer();
				if (partContainer) {
					partContainer.style.display = '';
					partContainer.style.visibility = 'visible';
					partContainer.classList.remove('invisible');
				}
				// Also ensure the part is registered as visible with the layout service
				if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
					console.log('[TARX] Sidebar was hidden! Forcing visible...');
					this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
				}
			}, 0);
		} else {
			// Restore previous width
			const expandedWidth = this.storageService.getNumber(TarxSidebarPart.EXPANDED_WIDTH_KEY, StorageScope.PROFILE, TarxSidebarPart.DEFAULT_EXPANDED_WIDTH);
			this.layoutService.setSize(Parts.SIDEBAR_PART, { width: expandedWidth, height: -1 });
		}

		// Update the footer collapse icon
		if (this.collapseIcon) {
			this.collapseIcon.className = '';
			if (this.isCollapsed) {
				this.collapseIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeftOff));
			} else {
				this.collapseIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeft));
			}
		}

		// Persist collapsed state
		this.storageService.store(TarxSidebarPart.COLLAPSED_KEY, this.isCollapsed, StorageScope.PROFILE, StorageTarget.USER);
	}

	//#region AbstractPaneCompositePart overrides

	override updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();
		if (container) {
			container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || '';
			container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';

			const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
			const isPositionLeft = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT;
			container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : '';
			container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : '';
			container.style.borderRightColor = isPositionLeft ? borderColor || '' : '';
			container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : '';
			container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : '';
			container.style.borderLeftColor = !isPositionLeft ? borderColor || '' : '';
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return;
		}

		super.layout(width, height, top, left);

		if (this.tarxContainer) {
			this.tarxContainer.style.width = `${width}px`;
			this.tarxContainer.style.height = `${height}px`;
		}

		// Webview layout is handled automatically via CSS when mounted with mountTo()
	}

	protected override createCompositeBar(): ActivityBarCompositeBar {
		return this.instantiationService.createInstance(ActivityBarCompositeBar, this.getCompositeBarOptions(), this.partId, this, false);
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'sidebar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
			icon: true,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: { position: () => HoverPosition.BELOW },
			fillExtraContextMenuActions: () => { },
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 30,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				activeBorderBottomColor: undefined,
				activeForegroundColor: theme.getColor(SIDE_BAR_FOREGROUND),
				inactiveForegroundColor: theme.getColor(SIDE_BAR_FOREGROUND),
				badgeBackground: undefined,
				badgeForeground: undefined,
				dragAndDropBorder: undefined
			}),
			compact: true
		};
	}

	protected shouldShowCompositeBar(): boolean {
		return false;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		return CompositeBarPosition.TITLE;
	}

	override getPinnedPaneCompositeIds(): string[] {
		return this.activityBarPart.getPinnedPaneCompositeIds();
	}

	override getVisiblePaneCompositeIds(): string[] {
		return this.activityBarPart.getVisiblePaneCompositeIds();
	}

	override getPaneCompositeIds(): string[] {
		return this.activityBarPart.getPaneCompositeIds();
	}

	/**
	 * Focus the activity bar (required by layout.ts)
	 */
	async focusActivityBar(): Promise<void> {
		console.log('[TARX] focusActivityBar called');
		this.activityBarPart.show(true);
	}

	//#endregion

	override dispose(): void {
		// Clean up connection status polling
		if (this.connectionCheckInterval) {
			clearInterval(this.connectionCheckInterval);
			this.connectionCheckInterval = undefined;
		}
		super.dispose();
	}

	toJSON(): object {
		return { type: Parts.SIDEBAR_PART };
	}
}
