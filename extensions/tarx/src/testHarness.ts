/*---------------------------------------------------------------------------------------------
 *  TARX Test Harness - HTTP server for automated UI testing
 *
 *  Runs on port 11439, exposes endpoints for Claude to interact with the extension:
 *
 *  Core endpoints:
 *  - GET /status - Current UI state
 *  - POST /chat/send - Send message through chat
 *  - GET /chat/read - Read recent messages
 *  - GET /error - Current error state
 *  - POST /voice/start - Start voice mode
 *  - POST /voice/stop - Stop voice mode
 *
 *  Project/Space Management:
 *  - GET /project/list - List all projects
 *  - GET /project/:id - Get project details
 *  - POST /project/create - Create new project
 *  - POST /project/select - Switch to project
 *  - POST /project/rename - Rename project
 *  - DELETE /project/:id - Delete project
 *
 *  Conversation Management:
 *  - POST /conversation/create - Create new conversation
 *  - GET /conversation/list - List conversations in current project
 *
 *  UI Control:
 *  - POST /pane/open - Open sidebar pane
 *  - GET /screenshot - Capture UI screenshot (placeholder)
 *  - GET /database/stats - Get database statistics
 *
 *  UI Testing (NEW):
 *  - POST /ui/panel/open - Open Project Context Panel
 *  - GET /ui/panel/state - Get panel state (tabs, data)
 *  - POST /ui/panel/tab - Switch panel tab
 *  - POST /ui/panel/save-instructions - Save instructions
 *  - GET /ui/components - List all UI components and their states
 *  - POST /ui/command - Execute any VS Code command
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as vscode from 'vscode';
import { HealthService, HealthStatus } from './healthService';
import { TarxClient } from './tarxClient';
import {
	listMCPSpaces,
	getMCPSpace,
	createMCPSpace,
	renameMCPSpace,
	deleteMCPSpace,
	createMCPSession,
	listMCPSessions,
	getMCPDatabaseStats,
	MCPSpace,
	MCPSession
} from './mcpKnowledge';
import { ProjectContextPanel } from './projectContextPanel';

const HARNESS_PORT = 11439;

interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
}

interface HarnessState {
	connectionStatus: string;
	healthStatus: HealthStatus | null;
	recentMessages: ChatMessage[];
	currentError: string | null;
	voiceActive: boolean;
	lastActivity: number;
	currentProjectId: string | null;
	currentSessionId: string | null;
}

/**
 * Test Harness Service - Exposes extension state via HTTP for automated testing
 */
export class TestHarnessService implements vscode.Disposable {
	private server: http.Server | null = null;
	private state: HarnessState = {
		connectionStatus: 'unknown',
		healthStatus: null,
		recentMessages: [],
		currentError: null,
		voiceActive: false,
		lastActivity: Date.now(),
		currentProjectId: null,
		currentSessionId: null
	};

	constructor(
		private readonly healthService: HealthService,
		private readonly tarxClient: TarxClient
	) {
		// Subscribe to health changes
		healthService.onStatusChange((status) => {
			this.state.healthStatus = status;
			this.state.connectionStatus = status.status;
			this.state.lastActivity = Date.now();
		});
	}

	/**
	 * Start the test harness HTTP server
	 */
	start(): void {
		if (this.server) {
			console.log('[TARX Harness] Already running');
			return;
		}

		try {
			console.log('[TARX Harness] Creating HTTP server...');
			this.server = http.createServer((req, res) => {
				// CORS headers for local testing
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
				res.setHeader('Content-Type', 'application/json');

				if (req.method === 'OPTIONS') {
					res.writeHead(200);
					res.end();
					return;
				}

				const url = new URL(req.url || '/', `http://localhost:${HARNESS_PORT}`);
				this.handleRequest(req, res, url);
			});

			console.log('[TARX Harness] Server created, binding to port', HARNESS_PORT);

			// Register error handler BEFORE calling listen() to catch EADDRINUSE immediately
			this.server.on('error', (err: NodeJS.ErrnoException) => {
				if (err.code === 'EADDRINUSE') {
					// Port already in use — likely another instance. Silent fallback.
					console.warn(`[TARX Harness] Port ${HARNESS_PORT} in use, skipping harness startup`);
					return;
				}
				console.error('[TARX Harness] Server error:', err.message);
				// Only show critical errors to user (not EADDRINUSE)
				if (err.code !== 'EADDRINUSE') {
					vscode.window.showErrorMessage(`TARX Harness error: ${err.message}`);
				}
			});

			this.server.on('listening', () => {
				const addr = this.server?.address();
				console.log(`[TARX Harness] ✓ LISTENING event fired, address:`, JSON.stringify(addr));
			});

			console.log(`[TARX Harness] About to call listen(${HARNESS_PORT}, '0.0.0.0')...`);
			try {
				this.server.listen(HARNESS_PORT, '0.0.0.0', () => {
					console.log(`[TARX Harness] ✓ Test harness running on http://0.0.0.0:${HARNESS_PORT}`);
				});
				console.log(`[TARX Harness] listen() returned. Server listening:`, this.server.listening);
			} catch (listenErr) {
				console.error(`[TARX Harness] listen() THREW:`, listenErr);
			}

			// Fallback check after 2 seconds
			setTimeout(() => {
				if (this.server) {
					console.log(`[TARX Harness] Deferred check: server.listening=${this.server.listening}, address=${JSON.stringify(this.server.address())}`);
				} else {
					console.warn('[TARX Harness] Deferred check: server is null');
				}
			}, 2000);

			console.log('[TARX Harness] Server setup complete, waiting for listen callback...');
		} catch (error) {
			// Only show error if it's not EADDRINUSE
			const isAddrInUse = (error as NodeJS.ErrnoException)?.code === 'EADDRINUSE' ||
				(error as Error)?.message?.includes('EADDRINUSE');

			if (isAddrInUse) {
				console.warn('[TARX Harness] Port in use, skipping startup');
			} else {
				console.error('[TARX Harness] Failed to start server:', error);
				vscode.window.showErrorMessage(`TARX Harness failed: ${error}`);
			}
		}
	}

	/**
	 * Handle incoming HTTP requests
	 */
	private async handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		url: URL
	): Promise<void> {
		const path = url.pathname;
		const method = req.method || 'GET';

		try {
			// Handle dynamic routes (e.g., /project/:id)
			const projectIdMatch = path.match(/^\/project\/([a-f0-9-]+)$/);

			switch (true) {
				case path === '/' || path === '/health':
					this.sendJson(res, {
						status: 'ok',
						service: 'tarx-test-harness',
						port: HARNESS_PORT,
						endpoints: {
							core: ['/status', '/chat/send', '/chat/read', '/error', '/voice/start', '/voice/stop', '/reconnect'],
							projects: ['/project/list', '/project/:id', '/project/create', '/project/select', '/project/rename', '/project/:id (DELETE)'],
							conversations: ['/conversation/create', '/conversation/list'],
							sidebar: ['/sidebar/state', '/sidebar/action'],
							ui: ['/pane/open', '/screenshot', '/database/stats', '/ui/panel/open', '/ui/panel/state', '/ui/panel/tab', '/ui/components', '/ui/command']
						}
					});
					break;

				case path === '/status':
					await this.handleStatus(res);
					break;

				case path === '/chat/send':
					if (method === 'POST') {
						await this.handleChatSend(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/chat/read':
					this.handleChatRead(res);
					break;

				case path === '/error':
					this.handleError(res);
					break;

				case path === '/voice/start':
					if (method === 'POST') {
						await this.handleVoiceStart(res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/voice/stop':
					if (method === 'POST') {
						await this.handleVoiceStop(res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/reconnect':
					if (method === 'POST') {
						await this.handleReconnect(res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				// ========================================
				// PROJECT/SPACE ENDPOINTS
				// ========================================

				case path === '/project/list':
					await this.handleProjectList(res);
					break;

				case path === '/project/create':
					if (method === 'POST') {
						await this.handleProjectCreate(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/project/select':
					if (method === 'POST') {
						await this.handleProjectSelect(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/project/rename':
					if (method === 'POST') {
						await this.handleProjectRename(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case projectIdMatch !== null:
					if (method === 'GET') {
						await this.handleProjectGet(projectIdMatch[1], res);
					} else if (method === 'DELETE') {
						await this.handleProjectDelete(projectIdMatch[1], res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				// ========================================
				// CONVERSATION ENDPOINTS
				// ========================================

				case path === '/conversation/create':
					if (method === 'POST') {
						await this.handleConversationCreate(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/conversation/list':
					await this.handleConversationList(res);
					break;

				// ========================================
				// UI CONTROL ENDPOINTS
				// ========================================

				case path === '/pane/open':
					if (method === 'POST') {
						await this.handlePaneOpen(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/screenshot':
					await this.handleScreenshot(url, res);
					break;

				case path === '/database/stats':
					await this.handleDatabaseStats(res);
					break;

				// ========================================
				// SIDEBAR STATE ENDPOINTS (for tarx-ui MCP)
				// ========================================

				case path === '/sidebar/state':
					await this.handleSidebarState(res);
					break;

				case path === '/sidebar/action':
					if (method === 'POST') {
						await this.handleSidebarAction(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				// ========================================
				// UI TESTING ENDPOINTS
				// ========================================

				case path === '/ui/panel/open':
					if (method === 'POST') {
						await this.handleUIPanelOpen(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/ui/panel/state':
					await this.handleUIPanelState(res);
					break;

				case path === '/ui/panel/tab':
					if (method === 'POST') {
						await this.handleUIPanelTab(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/ui/panel/save-instructions':
					if (method === 'POST') {
						await this.handleUIPanelSaveInstructions(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				case path === '/ui/components':
					await this.handleUIComponents(res);
					break;

				case path === '/ui/command':
					if (method === 'POST') {
						await this.handleUICommand(req, res);
					} else {
						this.sendError(res, 405, 'Method not allowed');
					}
					break;

				// ========================================
				// EDITOR ENDPOINTS (v2)
				// ========================================
				case path === '/ui/editor/open' && method === 'POST':
					await this.handleEditorOpen(req, res); break;
				case path === '/ui/editor/close' && method === 'POST':
					await this.handleEditorClose(req, res); break;
				case path === '/ui/editor/close-all' && method === 'POST':
					await this.handleEditorCloseAll(res); break;
				case path === '/ui/editor/active':
					await this.handleEditorActive(res); break;
				case path === '/ui/editor/tabs':
					await this.handleEditorTabs(res); break;
				case path === '/ui/editor/select-tab' && method === 'POST':
					await this.handleEditorSelectTab(req, res); break;
				case path === '/ui/editor/type' && method === 'POST':
					await this.handleEditorType(req, res); break;
				case path === '/ui/editor/insert' && method === 'POST':
					await this.handleEditorInsert(req, res); break;
				case path === '/ui/editor/replace' && method === 'POST':
					await this.handleEditorReplace(req, res); break;
				case path === '/ui/editor/select-range' && method === 'POST':
					await this.handleEditorSelectRange(req, res); break;
				case path === '/ui/editor/selection':
					await this.handleEditorSelection(res); break;
				case path === '/ui/editor/goto' && method === 'POST':
					await this.handleEditorGoto(req, res); break;
				case path === '/ui/editor/fold' && method === 'POST':
					await this.handleEditorFold(req, res); break;
				case path === '/ui/editor/unfold' && method === 'POST':
					await this.handleEditorUnfold(req, res); break;
				case path === '/ui/editor/diagnostics':
					await this.handleEditorDiagnostics(url, res); break;
				case path === '/ui/editor/trigger-suggest' && method === 'POST':
					await this.handleEditorTriggerSuggest(res); break;

				// ========================================
				// TERMINAL ENDPOINTS (v2)
				// ========================================
				case path === '/ui/terminal/create' && method === 'POST':
					await this.handleTerminalCreate(req, res); break;
				case path === '/ui/terminal/send' && method === 'POST':
					await this.handleTerminalSend(req, res); break;
				case path === '/ui/terminal/list':
					await this.handleTerminalList(res); break;
				case path === '/ui/terminal/close' && method === 'POST':
					await this.handleTerminalClose(req, res); break;
				case path === '/ui/terminal/close-all' && method === 'POST':
					await this.handleTerminalCloseAll(res); break;
				case path === '/ui/terminal/split' && method === 'POST':
					await this.handleTerminalSplit(res); break;
				case path === '/ui/terminal/show' && method === 'POST':
					await this.handleTerminalShow(res); break;
				case path === '/ui/terminal/hide' && method === 'POST':
					await this.handleTerminalHide(res); break;

				// ========================================
				// PANEL, VIEW, LAYOUT ENDPOINTS (v2)
				// ========================================
				case path === '/ui/panel/show' && method === 'POST':
					await this.handlePanelShow(req, res); break;
				case path === '/ui/panel/hide' && method === 'POST':
					await this.handlePanelHide(res); break;
				case path === '/ui/panel/toggle' && method === 'POST':
					await this.handlePanelToggle(res); break;
				case path === '/ui/sidebar/show' && method === 'POST':
					await this.handleSidebarShow(req, res); break;
				case path === '/ui/sidebar/hide' && method === 'POST':
					await this.handleSidebarHide(res); break;
				case path === '/ui/sidebar/toggle' && method === 'POST':
					await this.handleSidebarToggle(res); break;
				case path === '/ui/view/open' && method === 'POST':
					await this.handleViewOpen(req, res); break;
				case path === '/ui/secondary-sidebar/toggle' && method === 'POST':
					await this.handleSecondarySidebarToggle(res); break;
				case path === '/ui/layout/set' && method === 'POST':
					await this.handleLayoutSet(req, res); break;

				// ========================================
				// NOTIFICATIONS & DIALOGS (v2)
				// ========================================
				case path === '/ui/notification/info' && method === 'POST':
					await this.handleNotification(req, res, 'info'); break;
				case path === '/ui/notification/warning' && method === 'POST':
					await this.handleNotification(req, res, 'warning'); break;
				case path === '/ui/notification/error' && method === 'POST':
					await this.handleNotification(req, res, 'error'); break;
				case path === '/ui/notification/progress' && method === 'POST':
					await this.handleNotificationProgress(req, res); break;
				case path === '/ui/notification/dismiss-all' && method === 'POST':
					await this.handleNotificationDismissAll(res); break;
				case path === '/ui/dialog/input' && method === 'POST':
					await this.handleDialogInput(req, res); break;
				case path === '/ui/dialog/quickpick' && method === 'POST':
					await this.handleDialogQuickPick(req, res); break;
				case path === '/ui/dialog/message' && method === 'POST':
					await this.handleDialogMessage(req, res); break;
				case path === '/ui/status/message' && method === 'POST':
					await this.handleStatusMessage(req, res); break;

				// ========================================
				// CHAT ENHANCED (v2)
				// ========================================
				case path === '/ui/chat/open' && method === 'POST':
					await this.handleChatOpen(res); break;
				case path === '/ui/chat/close' && method === 'POST':
					await this.handleChatClose(res); break;
				case path === '/ui/chat/new' && method === 'POST':
					await this.handleChatNew(res); break;
				case path === '/ui/chat/send-enhanced' && method === 'POST':
					await this.handleChatSendEnhanced(req, res); break;
				case path === '/ui/chat/clear' && method === 'POST':
					await this.handleChatClear(res); break;
				case path === '/ui/chat/state':
					await this.handleChatGetState(res); break;

				// ========================================
				// EXPLORER (v2)
				// ========================================
				case path === '/ui/explorer/open' && method === 'POST':
					await this.handleExplorerOpen(res); break;
				case path === '/ui/explorer/tree':
					await this.handleExplorerTree(url, res); break;
				case path === '/ui/explorer/reveal' && method === 'POST':
					await this.handleExplorerReveal(req, res); break;
				case path === '/ui/explorer/create-file' && method === 'POST':
					await this.handleExplorerCreateFile(req, res); break;
				case path === '/ui/explorer/create-folder' && method === 'POST':
					await this.handleExplorerCreateFolder(req, res); break;
				case path === '/ui/explorer/delete' && method === 'POST':
					await this.handleExplorerDelete(req, res); break;
				case path === '/ui/explorer/rename' && method === 'POST':
					await this.handleExplorerRename(req, res); break;
				case path === '/ui/explorer/workspace':
					await this.handleExplorerWorkspace(res); break;

				// ========================================
				// SCM (v2)
				// ========================================
				case path === '/ui/scm/open' && method === 'POST':
					await this.handleScmOpen(res); break;
				case path === '/ui/scm/changes':
					await this.handleScmChanges(res); break;
				case path === '/ui/scm/stage' && method === 'POST':
					await this.handleScmStage(req, res); break;
				case path === '/ui/scm/stage-all' && method === 'POST':
					await this.handleScmStageAll(res); break;
				case path === '/ui/scm/commit' && method === 'POST':
					await this.handleScmCommit(req, res); break;
				case path === '/ui/scm/branch':
					await this.handleScmBranch(res); break;

				// ========================================
				// DEBUG (v2)
				// ========================================
				case path === '/ui/debug/open' && method === 'POST':
					await this.handleDebugOpen(res); break;
				case path === '/ui/debug/start' && method === 'POST':
					await this.handleDebugStart(req, res); break;
				case path === '/ui/debug/stop' && method === 'POST':
					await this.handleDebugStop(res); break;
				case path === '/ui/debug/state':
					await this.handleDebugState(res); break;

				// ========================================
				// WINDOW (v2)
				// ========================================
				case path === '/ui/window/reload' && method === 'POST':
					await this.handleWindowReload(res); break;
				case path === '/ui/window/toggle-fullscreen' && method === 'POST':
					await this.handleWindowCommand(res, 'workbench.action.toggleFullScreen'); break;
				case path === '/ui/window/toggle-zen' && method === 'POST':
					await this.handleWindowCommand(res, 'workbench.action.toggleZenMode'); break;
				case path === '/ui/window/zoom-in' && method === 'POST':
					await this.handleWindowCommand(res, 'workbench.action.zoomIn'); break;
				case path === '/ui/window/zoom-out' && method === 'POST':
					await this.handleWindowCommand(res, 'workbench.action.zoomOut'); break;
				case path === '/ui/window/zoom-reset' && method === 'POST':
					await this.handleWindowCommand(res, 'workbench.action.zoomReset'); break;

				// ========================================
				// THEME (v2)
				// ========================================
				case path === '/ui/theme/set' && method === 'POST':
					await this.handleThemeSet(req, res); break;
				case path === '/ui/theme/get':
					await this.handleThemeGet(res); break;
				case path === '/ui/theme/list':
					await this.handleThemeList(res); break;
				case path === '/ui/theme/font-size' && method === 'POST':
					await this.handleThemeFontSize(req, res); break;
				case path === '/ui/theme/font-family' && method === 'POST':
					await this.handleThemeFontFamily(req, res); break;

				// ========================================
				// SETTINGS (v2)
				// ========================================
				case path === '/ui/settings/open-ui' && method === 'POST':
					await this.handleSettingsOpenUI(res); break;
				case path === '/ui/settings/open-json' && method === 'POST':
					await this.handleSettingsOpenJSON(res); break;
				case path === '/ui/settings/get':
					await this.handleSettingsGet(url, res); break;
				case path === '/ui/settings/set' && method === 'POST':
					await this.handleSettingsSet(req, res); break;
				case path === '/ui/settings/reset' && method === 'POST':
					await this.handleSettingsReset(req, res); break;

				// ========================================
				// SCREENSHOT & OCR (v2)
				// ========================================
				case path === '/ui/screenshot/full' && method === 'POST':
					await this.handleScreenshotCapture(res, 'full'); break;
				case path === '/ui/screenshot/region' && method === 'POST':
					await this.handleScreenshotCaptureRegion(req, res); break;
				case path === '/ui/screenshot/ocr' && method === 'POST':
					await this.handleScreenshotOCR(req, res); break;
				case path === '/ui/screenshot/find-text' && method === 'POST':
					await this.handleScreenshotFindText(req, res); break;
				case path === '/ui/screenshot/list':
					await this.handleScreenshotList(url, res); break;

				// ========================================
				// COMMAND LIST/SEARCH (v2)
				// ========================================
				case path === '/ui/command/list':
					await this.handleCommandList(url, res); break;
				case path === '/ui/command/palette-open' && method === 'POST':
					await this.handleCommandPaletteOpen(res); break;

				// ========================================
				// EXTENSIONS (v2)
				// ========================================
				case path === '/ui/extensions/open' && method === 'POST':
					await this.handleExtensionsOpen(res); break;
				case path === '/ui/extensions/installed':
					await this.handleExtensionsInstalled(res); break;

				// ========================================
				// SIDEBAR EXTENDED (v2)
				// ========================================
				case path === '/ui/sidebar/toggle-section' && method === 'POST':
					await this.handleSidebarToggleSection(req, res); break;
				case path === '/ui/sidebar/history':
					await this.handleSidebarHistory(url, res); break;
				case path === '/ui/sidebar/files':
					await this.handleSidebarFiles(res); break;
				case path === '/ui/sidebar/navigate' && method === 'POST':
					await this.handleSidebarNavigate(req, res); break;
				case path === '/ui/sidebar/settings' && method === 'POST':
					await this.handleSidebarOpenSettings(res); break;
				case path === '/ui/sidebar/refresh' && method === 'POST':
					await this.handleSidebarRefresh(res); break;
				case path === '/ui/sidebar/collapse-all' && method === 'POST':
					await this.handleSidebarCollapseAll(res); break;
				case path === '/ui/sidebar/expand-all' && method === 'POST':
					await this.handleSidebarExpandAll(res); break;
				case path === '/ui/sidebar/state': await this.handleSidebarGetState(res); break;
				case path === '/ui/sidebar/search-history': await this.handleSidebarSearchHistory(url, res); break;
				case path === '/ui/sidebar/delete-history' && method === 'POST': await this.handleSidebarDeleteHistory(req, res); break;
				case path === '/ui/sidebar/get-settings': await this.handleSidebarGetSettings(res); break;
				case path === '/ui/sidebar/update-settings' && method === 'POST': await this.handleSidebarUpdateSettings(req, res); break;
				case path === '/ui/sidebar/connection-status': await this.handleSidebarConnectionStatus(res); break;
				case path === '/ui/chat/select-participant' && method === 'POST': await this.handleChatSelectParticipant(req, res); break;
				case path === '/ui/chat/participants': await this.handleChatParticipants(res); break;
				case path === '/ui/chat/attach-file' && method === 'POST': await this.handleChatAttachFile(req, res); break;
				case path === '/ui/chat/attach-selection' && method === 'POST': await this.handleChatAttachSelection(res); break;
				case path === '/ui/chat/inline-start' && method === 'POST': await this.handleChatInlineStart(req, res); break;
				case path === '/ui/command/search': await this.handleCommandSearch(url, res); break;
				case path === '/ui/command/palette-type' && method === 'POST': await this.handleCommandPaletteType(req, res); break;
				case path === '/ui/quickopen/open' && method === 'POST': await this.handleQuickOpenOpen(res); break;
				case path === '/ui/quickopen/type' && method === 'POST': await this.handleQuickOpenType(req, res); break;
				case path === '/ui/quickopen/select' && method === 'POST': await this.handleQuickOpenSelect(req, res); break;
				case path === '/ui/editor/decorate' && method === 'POST': await this.handleEditorDecorate(req, res); break;
				case path === '/ui/editor/clear-decorations' && method === 'POST': await this.handleEditorClearDecorations(res); break;
				case path === '/ui/terminal/state': await this.handleTerminalState(url, res); break;
				case path === '/ui/terminal/select' && method === 'POST': await this.handleTerminalSelect(req, res); break;
				case path === '/ui/terminal/rename' && method === 'POST': await this.handleTerminalRename(req, res); break;
				case path === '/ui/terminal/set-profile' && method === 'POST': await this.handleTerminalSetProfile(req, res); break;
				case path === '/ui/explorer/expand' && method === 'POST': await this.handleExplorerExpand(req, res); break;
				case path === '/ui/explorer/collapse' && method === 'POST': await this.handleExplorerCollapse(req, res); break;
				case path === '/ui/explorer/select' && method === 'POST': await this.handleExplorerSelect(req, res); break;
				case path === '/ui/explorer/copy' && method === 'POST': await this.handleExplorerCopy(req, res); break;
				case path === '/ui/scm/unstage' && method === 'POST': await this.handleScmUnstage(req, res); break;
				case path === '/ui/scm/discard' && method === 'POST': await this.handleScmDiscard(req, res); break;
				case path === '/ui/debug/pause' && method === 'POST': await this.handleDebugPause(res); break;
				case path === '/ui/debug/continue' && method === 'POST': await this.handleDebugContinue(res); break;
				case path === '/ui/debug/step-over' && method === 'POST': await this.handleDebugStepOver(res); break;
				case path === '/ui/debug/step-into' && method === 'POST': await this.handleDebugStepInto(res); break;
				case path === '/ui/extensions/search': await this.handleExtensionsSearch(url, res); break;
				case path === '/ui/extensions/install' && method === 'POST': await this.handleExtensionsInstall(req, res); break;
				case path === '/ui/extensions/uninstall' && method === 'POST': await this.handleExtensionsUninstall(req, res); break;
				case path === '/ui/extensions/toggle' && method === 'POST': await this.handleExtensionsToggle(req, res); break;
				case path === '/ui/settings/search': await this.handleSettingsSearch(url, res); break;
				case path === '/ui/keybindings/open' && method === 'POST': await this.handleKeybindingsOpen(res); break;
				case path === '/ui/keybindings/get': await this.handleKeybindingsGet(url, res); break;
				case path === '/ui/layout/get': await this.handleLayoutGet(res); break;
				case path === '/ui/notification/visible': await this.handleNotificationVisible(res); break;
				case path === '/ui/view/close' && method === 'POST': await this.handleViewClose(req, res); break;
				case path === '/ui/view/focus' && method === 'POST': await this.handleViewFocus(req, res); break;
				case path === '/ui/window/workspace-open' && method === 'POST': await this.handleWindowWorkspaceOpen(req, res); break;
				case path === '/ui/window/workspace-add-folder' && method === 'POST': await this.handleWindowWorkspaceAddFolder(req, res); break;
				case path === '/ui/statusbar/items': await this.handleStatusBarItems(res); break;
				case path === '/ui/statusbar/click' && method === 'POST': await this.handleStatusBarClick(req, res); break;
				case path === '/ui/statusbar/tarx': await this.handleStatusBarTarx(res); break;
				case path === '/ui/statusbar/set-tarx' && method === 'POST': await this.handleStatusBarSetTarx(req, res); break;
				case path === '/ui/theme/icon-set' && method === 'POST': await this.handleThemeIconSet(req, res); break;
				case path === '/ui/screenshot/compare' && method === 'POST': await this.handleScreenshotCompare(req, res); break;
				case path === '/ui/screenshot/ocr-region' && method === 'POST': await this.handleScreenshotOcrRegion(req, res); break;
				case path === '/ui/screenshot/verify-element' && method === 'POST': await this.handleScreenshotVerifyElement(req, res); break;
				case path === '/ui/test/run-suite' && method === 'POST': await this.handleTestRunSuite(req, res); break;
				case path === '/ui/test/run-single' && method === 'POST': await this.handleTestRunSingle(req, res); break;
				case path === '/ui/test/run-category' && method === 'POST': await this.handleTestRunCategory(req, res); break;
				case path === '/ui/test/run-all' && method === 'POST': await this.handleTestRunAll(res); break;
				case path === '/ui/test/suites': await this.handleTestSuites(res); break;
				case path === '/ui/test/reset' && method === 'POST': await this.handleTestReset(res); break;
				case path === '/ui/test/coverage': await this.handleTestCoverage(res); break;
				case path === '/ui/test/results': await this.handleTestResults(url, res); break;
				case path === '/ui/test/report': await this.handleTestReport(url, res); break;
				case path === '/ui/test/cases': await this.handleTestCases(url, res); break;

				default:
					this.sendError(res, 404, `Unknown endpoint: ${path}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.sendError(res, 500, message);
		}
	}

	/**
	 * GET /status - Return current UI state
	 */
	private async handleStatus(res: http.ServerResponse): Promise<void> {
		// Get fresh health check
		const health = await this.tarxClient.checkHealth();

		this.sendJson(res, {
			connection: {
				status: this.state.connectionStatus,
				healthy: health.healthy,
				latencyMs: health.latencyMs,
				model: health.model
			},
			health: this.state.healthStatus,
			messageCount: this.state.recentMessages.length,
			currentError: this.state.currentError,
			voiceActive: this.state.voiceActive,
			lastActivity: this.state.lastActivity,
			timestamp: Date.now()
		});
	}

	/**
	 * POST /chat/send - Send a message through the chat UI
	 */
	private async handleChatSend(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { message, stream = true } = JSON.parse(body);

		if (!message) {
			this.sendError(res, 400, 'Missing message field');
			return;
		}

		// Record user message
		const userMsg: ChatMessage = {
			role: 'user',
			content: message,
			timestamp: Date.now()
		};
		this.state.recentMessages.push(userMsg);
		this.state.lastActivity = Date.now();

		try {
			// Send through VS Code chat command
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: `@tarx ${message}`
			});

			// Build full message history for direct API call
			// CRITICAL: Must include system prompt + history for context retention!
			const systemPrompt = `You are TARX — Local. Private. Proactive. You remember all previous messages in this conversation. Be helpful, concise, and reference prior context when relevant.`;

			const messagesForLLM: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

			// 1. System prompt FIRST
			messagesForLLM.push({ role: 'system', content: systemPrompt });

			// 2. Add conversation history (exclude system messages, keep user/assistant)
			for (const msg of this.state.recentMessages) {
				if (msg.role !== 'system') {
					messagesForLLM.push({ role: msg.role, content: msg.content });
				}
			}

			// 3. Current user message is already in recentMessages from earlier push
			// (No need to add again - it was pushed before this try block)

			console.log(`[TARX Harness] Sending ${messagesForLLM.length} messages (system + ${this.state.recentMessages.length} history)`);

			// Also try direct API call for response
			if (stream) {
				const chunks: string[] = [];
				for await (const chunk of this.tarxClient.chatCompletionStream(
					messagesForLLM,
					{ maxTokens: 500 }
				)) {
					chunks.push(chunk);
				}
				const responseText = chunks.join('');

				const assistantMsg: ChatMessage = {
					role: 'assistant',
					content: responseText,
					timestamp: Date.now()
				};
				this.state.recentMessages.push(assistantMsg);

				this.sendJson(res, {
					success: true,
					userMessage: userMsg,
					response: assistantMsg,
					totalMessages: this.state.recentMessages.length
				});
			} else {
				const response = await this.tarxClient.chatCompletion(
					messagesForLLM,
					{ maxTokens: 500 }
				);

				const assistantMsg: ChatMessage = {
					role: 'assistant',
					content: response.choices[0]?.message?.content || '',
					timestamp: Date.now()
				};
				this.state.recentMessages.push(assistantMsg);

				this.sendJson(res, {
					success: true,
					userMessage: userMsg,
					response: assistantMsg,
					totalMessages: this.state.recentMessages.length
				});
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			this.state.currentError = errorMsg;

			this.sendJson(res, {
				success: false,
				userMessage: userMsg,
				error: errorMsg
			});
		}
	}

	/**
	 * GET /chat/read - Read recent messages
	 */
	private handleChatRead(res: http.ServerResponse): void {
		this.sendJson(res, {
			messages: this.state.recentMessages.slice(-20), // Last 20 messages
			totalCount: this.state.recentMessages.length,
			timestamp: Date.now()
		});
	}

	/**
	 * GET /error - Get current error state
	 */
	private handleError(res: http.ServerResponse): void {
		this.sendJson(res, {
			hasError: this.state.currentError !== null,
			error: this.state.currentError,
			connectionStatus: this.state.connectionStatus,
			timestamp: Date.now()
		});
	}

	/**
	 * POST /voice/start - Start voice mode
	 */
	private async handleVoiceStart(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.voice.start');
			this.state.voiceActive = true;
			this.state.lastActivity = Date.now();

			this.sendJson(res, {
				success: true,
				voiceActive: true,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to start voice';
			this.state.currentError = errorMsg;

			this.sendJson(res, {
				success: false,
				error: errorMsg
			});
		}
	}

	/**
	 * POST /voice/stop - Stop voice mode
	 */
	private async handleVoiceStop(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.voice.stop');
			this.state.voiceActive = false;
			this.state.lastActivity = Date.now();

			this.sendJson(res, {
				success: true,
				voiceActive: false,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to stop voice';
			this.sendJson(res, {
				success: false,
				error: errorMsg
			});
		}
	}

	/**
	 * POST /reconnect - Force reconnection to server
	 */
	private async handleReconnect(res: http.ServerResponse): Promise<void> {
		try {
			const connected = await this.healthService.forceReconnect();

			this.sendJson(res, {
				success: connected,
				connectionStatus: this.state.connectionStatus,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Reconnect failed';
			this.sendJson(res, {
				success: false,
				error: errorMsg
			});
		}
	}

	// ========================================
	// PROJECT/SPACE HANDLERS
	// ========================================

	/**
	 * GET /project/list - List all projects/spaces
	 */
	private async handleProjectList(res: http.ServerResponse): Promise<void> {
		try {
			const projects = await listMCPSpaces();
			this.sendJson(res, {
				success: true,
				projects,
				count: projects.length,
				currentProjectId: this.state.currentProjectId,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to list projects';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * GET /project/:id - Get project details
	 */
	private async handleProjectGet(projectId: string, res: http.ServerResponse): Promise<void> {
		try {
			const project = await getMCPSpace(projectId);
			if (!project) {
				this.sendError(res, 404, 'Project not found');
				return;
			}
			this.sendJson(res, {
				success: true,
				project,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to get project';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * POST /project/create - Create a new project/space
	 */
	private async handleProjectCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { name, description, emoji } = JSON.parse(body);

			if (!name) {
				this.sendError(res, 400, 'Project name is required');
				return;
			}

			const project = await createMCPSpace(name, description, emoji);
			if (!project) {
				this.sendError(res, 500, 'Failed to create project');
				return;
			}

			console.log(`[TARX Harness] Created project: ${project.name} (${project.id})`);

			this.sendJson(res, {
				success: true,
				project,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to create project';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * POST /project/select - Select/switch to a project
	 */
	private async handleProjectSelect(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { project_id } = JSON.parse(body);

			if (!project_id) {
				this.sendError(res, 400, 'project_id is required');
				return;
			}

			const project = await getMCPSpace(project_id);
			if (!project) {
				this.sendError(res, 404, 'Project not found');
				return;
			}

			this.state.currentProjectId = project_id;
			this.state.currentSessionId = null; // Reset session when switching projects
			this.state.lastActivity = Date.now();

			console.log(`[TARX Harness] Selected project: ${project.name} (${project_id})`);

			this.sendJson(res, {
				success: true,
				project_id,
				project,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to select project';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * POST /project/rename - Rename a project
	 */
	private async handleProjectRename(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { project_id, new_name } = JSON.parse(body);

			if (!project_id || !new_name) {
				this.sendError(res, 400, 'project_id and new_name are required');
				return;
			}

			const project = await renameMCPSpace(project_id, new_name);
			if (!project) {
				this.sendError(res, 404, 'Project not found or rename failed');
				return;
			}

			console.log(`[TARX Harness] Renamed project ${project_id} to: ${new_name}`);

			this.sendJson(res, {
				success: true,
				project,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to rename project';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * DELETE /project/:id - Delete a project
	 */
	private async handleProjectDelete(projectId: string, res: http.ServerResponse): Promise<void> {
		try {
			const success = await deleteMCPSpace(projectId);
			if (!success) {
				this.sendError(res, 500, 'Failed to delete project');
				return;
			}

			// Clear current project if it was deleted
			if (this.state.currentProjectId === projectId) {
				this.state.currentProjectId = null;
				this.state.currentSessionId = null;
			}

			console.log(`[TARX Harness] Deleted project: ${projectId}`);

			this.sendJson(res, {
				success: true,
				deleted_id: projectId,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to delete project';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	// ========================================
	// CONVERSATION HANDLERS
	// ========================================

	/**
	 * POST /conversation/create - Create a new conversation/session
	 */
	private async handleConversationCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { project_id, title } = JSON.parse(body);

			const spaceId = project_id || this.state.currentProjectId;
			if (!spaceId) {
				this.sendError(res, 400, 'No project selected. Provide project_id or select a project first.');
				return;
			}

			const session = await createMCPSession(spaceId, title);
			if (!session) {
				this.sendError(res, 500, 'Failed to create conversation');
				return;
			}

			this.state.currentSessionId = session.id;
			this.state.lastActivity = Date.now();

			console.log(`[TARX Harness] Created conversation: ${session.title} (${session.id})`);

			this.sendJson(res, {
				success: true,
				conversation: session,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to create conversation';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * GET /conversation/list - List conversations in current project
	 */
	private async handleConversationList(res: http.ServerResponse): Promise<void> {
		try {
			if (!this.state.currentProjectId) {
				this.sendError(res, 400, 'No project selected. Select a project first.');
				return;
			}

			const conversations = await listMCPSessions(this.state.currentProjectId);
			this.sendJson(res, {
				success: true,
				conversations,
				count: conversations.length,
				currentProjectId: this.state.currentProjectId,
				currentSessionId: this.state.currentSessionId,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to list conversations';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	// ========================================
	// SIDEBAR STATE HANDLERS (for tarx-ui MCP)
	// ========================================

	/**
	 * GET /sidebar/state - Get current sidebar state
	 * Returns projects, history, files, and connection status from the React sidebar
	 */
	private async handleSidebarState(res: http.ServerResponse): Promise<void> {
		try {
			// Helper to safely execute commands
			const safeExecute = async <T>(command: string, ...args: unknown[]): Promise<T | null> => {
				try {
					const result = await vscode.commands.executeCommand<T>(command, ...args);
					return result ?? null;
				} catch {
					return null;
				}
			};

			// Fetch all sidebar data via commands
			const [projects, conversations, sessions, uploadedFiles, connectionStatus] = await Promise.all([
				safeExecute<Array<{
					id: string;
					name: string;
					path: string;
					type: string | null;
					isActive: boolean;
				}>>('tarx.projects.list'),

				safeExecute<{
					conversations: Array<{
						id: string;
						title: string;
						timestamp: number;
						source?: 'claude' | 'tarx';
					}>;
				}>('tarx.getConversationHistory', 20),

				safeExecute<{
					sessions: Array<{
						id: string;
						title: string;
						updatedAt: number;
						spaceId: string;
						spaceName: string;
					}>;
				}>('tarx.getSessionHistory', 20),

				safeExecute<Array<{
					id: string;
					filename: string;
					size: number;
				}>>('tarx.getUploadedFiles'),

				safeExecute<{
					status: string;
					isOnline: boolean;
				}>('tarx.getConnectionStatus')
			]);

			// Build history items from both sources
			const historyItems: Array<{
				id: string;
				title: string;
				timestamp: number;
				source: string;
				spaceId?: string;
			}> = [];

			if (conversations?.conversations) {
				for (const c of conversations.conversations) {
					historyItems.push({
						id: c.id,
						title: c.title || 'Untitled',
						timestamp: c.timestamp,
						source: c.source || 'tarx'
					});
				}
			}

			if (sessions?.sessions) {
				for (const s of sessions.sessions) {
					historyItems.push({
						id: s.id,
						title: s.title || 'Untitled',
						timestamp: s.updatedAt,
						source: 'tarx',
						spaceId: s.spaceId
					});
				}
			}

			// Sort by timestamp descending
			historyItems.sort((a, b) => b.timestamp - a.timestamp);

			// Find selected project (the active one)
			const selectedProject = (projects || []).find((p: { isActive: boolean; id: string }) => p.isActive)?.id || null;

			this.sendJson(res, {
				success: true,
				projects: projects || [],
				selectedProject,
				history: historyItems.slice(0, 20),
				files: uploadedFiles || [],
				connectionStatus: {
					tarx: connectionStatus?.isOnline || false,
					mesh: false // TODO: Add mesh status when available
				},
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to get sidebar state';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * POST /sidebar/action - Execute a sidebar action
	 * Supports: selectProject, openConversation, uploadFile, deleteFile, newChat
	 */
	private async handleSidebarAction(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { action, ...params } = JSON.parse(body);

			if (!action) {
				this.sendError(res, 400, 'Missing action parameter');
				return;
			}

			let result: unknown = null;

			switch (action) {
				case 'selectProject':
					if (!params.projectId) {
						this.sendError(res, 400, 'Missing projectId');
						return;
					}
					await vscode.commands.executeCommand('tarx.projects.open', params.projectId);
					this.state.currentProjectId = params.projectId;
					result = { projectId: params.projectId };
					break;

				case 'openConversation':
					if (!params.conversationId) {
						this.sendError(res, 400, 'Missing conversationId');
						return;
					}
					await vscode.commands.executeCommand('tarx.openConversation', params.conversationId);
					result = { conversationId: params.conversationId };
					break;

				case 'openSession':
					if (!params.sessionId) {
						this.sendError(res, 400, 'Missing sessionId');
						return;
					}
					await vscode.commands.executeCommand('tarx.openSession', params.sessionId, params.spaceId);
					this.state.currentSessionId = params.sessionId;
					result = { sessionId: params.sessionId };
					break;

				case 'newChat':
					await vscode.commands.executeCommand('tarx.chat.new');
					result = { action: 'newChat' };
					break;

				case 'openChat':
					await vscode.commands.executeCommand('workbench.action.chat.open');
					result = { action: 'openChat' };
					break;

				case 'createProject':
					if (!params.name) {
						this.sendError(res, 400, 'Missing project name');
						return;
					}
					await vscode.commands.executeCommand('tarx.projects.create', params.name, params.instructions);
					result = { name: params.name };
					break;

				case 'deleteFile':
					if (!params.fileId) {
						this.sendError(res, 400, 'Missing fileId');
						return;
					}
					await vscode.commands.executeCommand('tarx.deleteUploadedFile', params.fileId);
					result = { fileId: params.fileId };
					break;

				default:
					this.sendError(res, 400, `Unknown action: ${action}`);
					return;
			}

			console.log(`[TARX Harness] Executed sidebar action: ${action}`);

			this.sendJson(res, {
				success: true,
				action,
				result,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to execute action';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	// ========================================
	// UI CONTROL HANDLERS
	// ========================================

	/**
	 * POST /pane/open - Open a sidebar pane
	 */
	private async handlePaneOpen(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { pane } = JSON.parse(body);

			const validPanes: Record<string, string> = {
				'explorer': 'workbench.view.explorer',
				'files': 'workbench.view.explorer',
				'search': 'workbench.view.search',
				'extensions': 'workbench.view.extensions',
				'scm': 'workbench.view.scm',
				'git': 'workbench.view.scm',
				'debug': 'workbench.view.debug',
				'testing': 'workbench.view.testing',
				'chat': 'workbench.action.chat.open',
				'tarx': 'tarx.sidebar.focus'
			};

			if (!pane || !validPanes[pane.toLowerCase()]) {
				this.sendError(res, 400, `Invalid pane. Must be one of: ${Object.keys(validPanes).join(', ')}`);
				return;
			}

			const command = validPanes[pane.toLowerCase()];
			await vscode.commands.executeCommand(command);

			console.log(`[TARX Harness] Opened pane: ${pane}`);

			this.sendJson(res, {
				success: true,
				pane,
				command,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to open pane';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * GET /screenshot - Capture UI screenshot (placeholder)
	 */
	private async handleScreenshot(url: URL, res: http.ServerResponse): Promise<void> {
		const region = url.searchParams.get('region') || 'full';

		// Screenshot capture requires additional setup in VS Code
		// For now, return a placeholder response
		this.sendJson(res, {
			success: false,
			error: 'Screenshot capture not implemented',
			message: 'Screenshot capture requires webview panel integration. This is a placeholder endpoint.',
			region,
			suggestion: 'Use VS Code Developer Tools or external tools for screenshots',
			timestamp: Date.now()
		});
	}

	/**
	 * GET /database/stats - Get MCP database statistics
	 */
	private async handleDatabaseStats(res: http.ServerResponse): Promise<void> {
		try {
			const stats = await getMCPDatabaseStats();
			if (!stats) {
				this.sendError(res, 500, 'Failed to get database stats');
				return;
			}

			this.sendJson(res, {
				success: true,
				stats,
				currentState: {
					currentProjectId: this.state.currentProjectId,
					currentSessionId: this.state.currentSessionId,
					messageCount: this.state.recentMessages.length
				},
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to get database stats';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * Record an error from the extension
	 */
	recordError(error: string): void {
		this.state.currentError = error;
		this.state.lastActivity = Date.now();
	}

	/**
	 * Clear current error
	 */
	clearError(): void {
		this.state.currentError = null;
	}

	/**
	 * Record a chat message
	 */
	recordMessage(role: 'user' | 'assistant' | 'system', content: string): void {
		this.state.recentMessages.push({
			role,
			content,
			timestamp: Date.now()
		});
		this.state.lastActivity = Date.now();

		// Keep only last 100 messages
		if (this.state.recentMessages.length > 100) {
			this.state.recentMessages = this.state.recentMessages.slice(-100);
		}
	}

	/**
	 * Set voice active state
	 */
	setVoiceActive(active: boolean): void {
		this.state.voiceActive = active;
		this.state.lastActivity = Date.now();
	}

	// Helper methods
	private sendJson(res: http.ServerResponse, data: unknown): void {
		res.writeHead(200);
		res.end(JSON.stringify(data, null, 2));
	}

	private sendError(res: http.ServerResponse, status: number, message: string): void {
		res.writeHead(status);
		res.end(JSON.stringify({ error: message, status }));
	}

	private readBody(req: http.IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			req.on('data', (chunk) => chunks.push(chunk));
			req.on('end', () => resolve(Buffer.concat(chunks).toString()));
			req.on('error', reject);
		});
	}

	// ========================================
	// UI TESTING HANDLERS
	// ========================================

	/**
	 * POST /ui/panel/open - Open Project Context Panel for a project
	 */
	private async handleUIPanelOpen(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { project_id } = JSON.parse(body);

			const projectId = project_id || this.state.currentProjectId;
			if (!projectId) {
				this.sendError(res, 400, 'No project specified. Provide project_id or select a project first.');
				return;
			}

			// Open the panel via command
			await vscode.commands.executeCommand('tarx.openProjectContext', projectId);

			console.log(`[TARX Harness] Opened Project Context Panel for: ${projectId}`);

			this.sendJson(res, {
				success: true,
				project_id: projectId,
				panelOpen: ProjectContextPanel.currentPanel !== undefined,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to open panel';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * GET /ui/panel/state - Get current state of Project Context Panel
	 */
	private async handleUIPanelState(res: http.ServerResponse): Promise<void> {
		try {
			const panel = ProjectContextPanel.currentPanel;

			if (!panel) {
				this.sendJson(res, {
					success: true,
					panelOpen: false,
					state: null,
					timestamp: Date.now()
				});
				return;
			}

			// Get full panel state through public getters
			const state = panel.getState();

			this.sendJson(res, {
				success: true,
				panelOpen: true,
				viewType: ProjectContextPanel.viewType,
				state,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to get panel state';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * POST /ui/panel/tab - Switch tab in Project Context Panel
	 */
	private async handleUIPanelTab(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { tab } = JSON.parse(body);

			if (!tab || !['conversations', 'sources', 'memory'].includes(tab)) {
				this.sendError(res, 400, 'Invalid tab. Must be: conversations, sources, or memory');
				return;
			}

			const panel = ProjectContextPanel.currentPanel;
			if (!panel) {
				this.sendError(res, 400, 'Panel not open. Open panel first via /ui/panel/open');
				return;
			}

			// Switch tab using public method
			panel.switchTab(tab as 'conversations' | 'sources' | 'memory');
			const newState = panel.getState();

			console.log(`[TARX Harness] Switched to tab: ${tab}`);

			this.sendJson(res, {
				success: true,
				tab,
				activeTab: newState.activeTab,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to switch tab';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * POST /ui/panel/save-instructions - Save instructions via panel
	 */
	private async handleUIPanelSaveInstructions(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { content } = JSON.parse(body);

			if (content === undefined) {
				this.sendError(res, 400, 'Missing content field');
				return;
			}

			const panel = ProjectContextPanel.currentPanel;
			if (!panel) {
				this.sendError(res, 400, 'Panel not open. Open panel first via /ui/panel/open');
				return;
			}

			// Save instructions using public method
			const saved = await panel.saveInstructions(content);

			console.log(`[TARX Harness] Instructions saved: ${saved}, length: ${content.length}`);

			this.sendJson(res, {
				success: saved,
				contentLength: content.length,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to save instructions';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * GET /ui/components - List all UI components and their states
	 */
	private async handleUIComponents(res: http.ServerResponse): Promise<void> {
		try {
			// List known UI components and their availability
			const components = {
				// Sidebar components
				projectsView: {
					id: 'tarx.projects',
					type: 'tree',
					description: 'Projects tree view in sidebar'
				},
				conversationsView: {
					id: 'tarx.sidebar',
					type: 'tree',
					description: 'Conversations tree view in sidebar'
				},
				// Panel components
				projectContextPanel: {
					id: 'tarx.projectContext',
					type: 'webview',
					open: ProjectContextPanel.currentPanel !== undefined,
					description: 'Project Context Panel with tabs'
				},
				// Commands that create/interact with UI
				commands: {
					openChat: 'workbench.action.chat.open',
					openProjectContext: 'tarx.openProjectContext',
					createProject: 'tarx.projects.createFromWorkspace',
					refreshProjects: 'tarx.projects.refresh',
					startConversation: 'tarx.chat.new'
				}
			};

			this.sendJson(res, {
				success: true,
				components,
				totalViews: 2,
				totalCommands: 5,
				panelOpen: ProjectContextPanel.currentPanel !== undefined,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to list components';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	/**
	 * POST /ui/command - Execute any VS Code command
	 */
	private async handleUICommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { command, args } = JSON.parse(body);

			if (!command) {
				this.sendError(res, 400, 'Missing command field');
				return;
			}

			// Security: Allow tarx.*, workbench.*, editor.*, git.*, debug.*, and other VS Code built-in commands
			const allowedPrefixes = ['tarx.', 'workbench.', 'editor.', 'git.', 'debug.', 'vscode.', 'type', 'cursorMove', 'deleteLeft', 'deleteRight', 'undo', 'redo', 'scrollEditorTop', 'scrollEditorBottom'];
			if (!allowedPrefixes.some(p => command.startsWith(p))) {
				this.sendError(res, 403, `Command prefix not allowed: ${command}`);
				return;
			}

			const start = Date.now();
			let result: unknown;

			if (args && Array.isArray(args)) {
				result = await vscode.commands.executeCommand(command, ...args);
			} else if (args) {
				result = await vscode.commands.executeCommand(command, args);
			} else {
				result = await vscode.commands.executeCommand(command);
			}

			const latency = Date.now() - start;

			console.log(`[TARX Harness] Executed command: ${command} (${latency}ms)`);

			this.sendJson(res, {
				success: true,
				command,
				args: args || null,
				result: result !== undefined ? String(result) : null,
				latency_ms: latency,
				timestamp: Date.now()
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to execute command';
			this.sendJson(res, { success: false, error: errorMsg });
		}
	}

	// ========================================
	// V2 HANDLER IMPLEMENTATIONS
	// ========================================

	// --- Editor Handlers ---

	private async handleEditorOpen(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { filePath, viewColumn, preview } = JSON.parse(body);
			const uri = vscode.Uri.file(filePath);
			const doc = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(doc, {
				viewColumn: viewColumn || vscode.ViewColumn.Active,
				preview: preview !== false
			});
			this.sendJson(res, { success: true, filePath: doc.fileName, languageId: doc.languageId, lineCount: doc.lineCount });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorClose(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorCloseAll(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorActive(res: http.ServerResponse): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			this.sendJson(res, { hasActiveEditor: false, filePath: null, languageId: null, lineCount: 0, cursorLine: 0, cursorColumn: 0, selectedText: null });
			return;
		}
		const sel = editor.selection;
		this.sendJson(res, {
			hasActiveEditor: true,
			filePath: editor.document.fileName,
			languageId: editor.document.languageId,
			lineCount: editor.document.lineCount,
			cursorLine: sel.active.line + 1,
			cursorColumn: sel.active.character + 1,
			selectedText: editor.document.getText(sel) || null
		});
	}

	private async handleEditorTabs(res: http.ServerResponse): Promise<void> {
		const tabs: Array<{ filePath: string; isActive: boolean; isDirty: boolean; viewColumn: number }> = [];
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const input = tab.input as { uri?: vscode.Uri } | undefined;
				tabs.push({
					filePath: input?.uri?.fsPath || 'untitled',
					isActive: tab.isActive,
					isDirty: tab.isDirty,
					viewColumn: group.viewColumn
				});
			}
		}
		this.sendJson(res, { tabs, count: tabs.length });
	}

	private async handleEditorSelectTab(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { filePath } = JSON.parse(body);
			const uri = vscode.Uri.file(filePath);
			const doc = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(doc, { preview: false });
			this.sendJson(res, { success: true, selected: filePath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorType(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { text } = JSON.parse(body);
			const editor = vscode.window.activeTextEditor;
			if (!editor) { this.sendError(res, 400, 'No active editor'); return; }
			await editor.edit(eb => eb.insert(editor.selection.active, text));
			this.sendJson(res, { success: true, insertedLength: text.length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorInsert(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { text, line, column } = JSON.parse(body);
			const editor = vscode.window.activeTextEditor;
			if (!editor) { this.sendError(res, 400, 'No active editor'); return; }
			const pos = new vscode.Position((line || 1) - 1, (column || 1) - 1);
			await editor.edit(eb => eb.insert(pos, text));
			this.sendJson(res, { success: true, line, column: column || 1 });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorReplace(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { startLine, startColumn, endLine, endColumn, newText } = JSON.parse(body);
			const editor = vscode.window.activeTextEditor;
			if (!editor) { this.sendError(res, 400, 'No active editor'); return; }
			const range = new vscode.Range(startLine - 1, startColumn - 1, endLine - 1, endColumn - 1);
			await editor.edit(eb => eb.replace(range, newText));
			this.sendJson(res, { success: true, replacedLength: newText.length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorSelectRange(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { startLine, startColumn, endLine, endColumn } = JSON.parse(body);
			const editor = vscode.window.activeTextEditor;
			if (!editor) { this.sendError(res, 400, 'No active editor'); return; }
			editor.selection = new vscode.Selection(startLine - 1, startColumn - 1, endLine - 1, endColumn - 1);
			const selectedText = editor.document.getText(editor.selection);
			this.sendJson(res, { success: true, selectedText });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorSelection(res: http.ServerResponse): Promise<void> {
		const editor = vscode.window.activeTextEditor;
		if (!editor) { this.sendJson(res, { hasSelection: false, text: null }); return; }
		const sel = editor.selection;
		this.sendJson(res, {
			hasSelection: !sel.isEmpty,
			text: sel.isEmpty ? null : editor.document.getText(sel),
			startLine: sel.start.line + 1, startColumn: sel.start.character + 1,
			endLine: sel.end.line + 1, endColumn: sel.end.character + 1
		});
	}

	private async handleEditorGoto(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { line, column } = JSON.parse(body);
			const editor = vscode.window.activeTextEditor;
			if (!editor) { this.sendError(res, 400, 'No active editor'); return; }
			const pos = new vscode.Position((line || 1) - 1, (column || 1) - 1);
			editor.selection = new vscode.Selection(pos, pos);
			editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
			this.sendJson(res, { success: true, line, column: column || 1 });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorFold(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { line } = JSON.parse(body);
			if (line) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					const pos = new vscode.Position(line - 1, 0);
					editor.selection = new vscode.Selection(pos, pos);
				}
			}
			await vscode.commands.executeCommand('editor.fold');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorUnfold(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { line } = JSON.parse(body);
			if (line) {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					const pos = new vscode.Position(line - 1, 0);
					editor.selection = new vscode.Selection(pos, pos);
				}
			}
			await vscode.commands.executeCommand('editor.unfold');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorDiagnostics(url: URL, res: http.ServerResponse): Promise<void> {
		const filePath = url.searchParams.get('filePath');
		const severity = url.searchParams.get('severity') || 'all';
		let uri: vscode.Uri | undefined;
		if (filePath) {
			uri = vscode.Uri.file(filePath);
		} else if (vscode.window.activeTextEditor) {
			uri = vscode.window.activeTextEditor.document.uri;
		}
		if (!uri) { this.sendJson(res, { diagnostics: [], count: 0 }); return; }
		const allDiags = vscode.languages.getDiagnostics(uri);
		const severityMap: Record<string, vscode.DiagnosticSeverity> = {
			'error': vscode.DiagnosticSeverity.Error,
			'warning': vscode.DiagnosticSeverity.Warning,
			'info': vscode.DiagnosticSeverity.Information,
			'hint': vscode.DiagnosticSeverity.Hint
		};
		const filtered = severity === 'all' ? allDiags : allDiags.filter(d => d.severity === severityMap[severity]);
		const diagnostics = filtered.map(d => ({
			message: d.message,
			severity: ['Error', 'Warning', 'Information', 'Hint'][d.severity],
			line: d.range.start.line + 1,
			column: d.range.start.character + 1,
			source: d.source || 'unknown'
		}));
		this.sendJson(res, { diagnostics, count: diagnostics.length });
	}

	private async handleEditorTriggerSuggest(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('editor.action.triggerSuggest');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Terminal Handlers ---

	private async handleTerminalCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { name, cwd, shellPath } = JSON.parse(body);
			const terminal = vscode.window.createTerminal({ name, cwd, shellPath });
			terminal.show();
			this.sendJson(res, { success: true, name: terminal.name });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleTerminalSend(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { command, addNewLine } = JSON.parse(body);
			const terminal = vscode.window.activeTerminal;
			if (!terminal) { this.sendError(res, 400, 'No active terminal'); return; }
			terminal.sendText(command, addNewLine !== false);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleTerminalList(res: http.ServerResponse): Promise<void> {
		const terminals = vscode.window.terminals.map((t, i) => ({
			id: i, name: t.name, isActive: t === vscode.window.activeTerminal
		}));
		this.sendJson(res, { terminals, count: terminals.length });
	}

	private async handleTerminalClose(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const terminal = vscode.window.activeTerminal;
			if (!terminal) { this.sendError(res, 400, 'No active terminal'); return; }
			terminal.dispose();
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleTerminalCloseAll(res: http.ServerResponse): Promise<void> {
		const count = vscode.window.terminals.length;
		vscode.window.terminals.forEach(t => t.dispose());
		this.sendJson(res, { success: true, closedCount: count });
	}

	private async handleTerminalSplit(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.terminal.split');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleTerminalShow(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.terminal.toggleTerminal');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleTerminalHide(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.togglePanel');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Panel/View/Layout Handlers ---

	private async handlePanelShow(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { panel } = JSON.parse(body);
			const panelCommands: Record<string, string> = {
				'terminal': 'workbench.action.terminal.toggleTerminal',
				'output': 'workbench.action.output.toggleOutput',
				'problems': 'workbench.actions.view.problems',
				'debug-console': 'workbench.debug.action.toggleRepl'
			};
			await vscode.commands.executeCommand(panelCommands[panel] || 'workbench.action.togglePanel');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handlePanelHide(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.closePanel');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handlePanelToggle(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.togglePanel');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarShow(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { viewId } = JSON.parse(body);
			const viewCommands: Record<string, string> = {
				'explorer': 'workbench.view.explorer',
				'search': 'workbench.view.search',
				'scm': 'workbench.view.scm',
				'debug': 'workbench.view.debug',
				'extensions': 'workbench.view.extensions'
			};
			await vscode.commands.executeCommand(viewCommands[viewId] || 'workbench.action.focusSideBar');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarHide(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.closeSidebar');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarToggle(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleViewOpen(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { viewId } = JSON.parse(body);
			await vscode.commands.executeCommand(`${viewId}.focus`);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSecondarySidebarToggle(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleLayoutSet(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { layout } = JSON.parse(body);
			const layoutCommands: Record<string, string> = {
				'single': 'workbench.action.editorLayoutSingle',
				'two-columns': 'workbench.action.editorLayoutTwoColumns',
				'two-rows': 'workbench.action.editorLayoutTwoRows',
				'grid': 'workbench.action.editorLayoutTwoByTwoGrid'
			};
			await vscode.commands.executeCommand(layoutCommands[layout] || layoutCommands['single']);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Notification/Dialog Handlers ---

	private async handleNotification(req: http.IncomingMessage, res: http.ServerResponse, level: 'info' | 'warning' | 'error'): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { message, actions } = JSON.parse(body);
			const fns = { info: vscode.window.showInformationMessage, warning: vscode.window.showWarningMessage, error: vscode.window.showErrorMessage };
			// Fire-and-forget: don't await user interaction, respond immediately
			const promise = actions?.length ? fns[level](message, ...actions) : fns[level](message);
			promise.then(selected => { /* notification dismissed with: ${selected} */ });
			this.sendJson(res, { success: true, shown: true, message });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleNotificationProgress(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { title, cancellable } = JSON.parse(body);
			vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: !!cancellable },
				async (progress) => { progress.report({ increment: 100 }); await new Promise(r => setTimeout(r, 3000)); });
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleNotificationDismissAll(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('notifications.clearAll');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDialogInput(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { prompt, placeholder, value, password } = JSON.parse(body);
			const result = await vscode.window.showInputBox({ prompt, placeHolder: placeholder, value, password: !!password });
			this.sendJson(res, { success: true, value: result ?? null, cancelled: result === undefined });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDialogQuickPick(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { items, placeholder, canPickMany } = JSON.parse(body);
			const result = await vscode.window.showQuickPick(items, { placeHolder: placeholder, canPickMany: !!canPickMany });
			this.sendJson(res, { success: true, selected: result ?? null, cancelled: result === undefined });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDialogMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { message, detail, actions } = JSON.parse(body);
			const opts: vscode.MessageOptions = { modal: true, detail };
			const selected = actions?.length ? await vscode.window.showInformationMessage(message, opts, ...actions) : await vscode.window.showInformationMessage(message, opts);
			this.sendJson(res, { success: true, selectedAction: selected || null });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleStatusMessage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { text, durationMs } = JSON.parse(body);
			vscode.window.setStatusBarMessage(text, durationMs || 5000);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Chat Enhanced Handlers ---

	private async handleChatOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.chat.open');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatClose(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.closePanel');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatNew(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.chat.newChat');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatSendEnhanced(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { message, participant } = JSON.parse(body);
			const query = participant ? `${participant} ${message}` : message;
			await vscode.commands.executeCommand('workbench.action.chat.open', { query });
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatClear(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.chat.clearHistory');
			this.state.recentMessages = [];
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatGetState(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, {
			isOpen: true,
			messageCount: this.state.recentMessages.length,
			activeParticipant: null,
			isStreaming: false
		});
	}

	// --- Explorer Handlers ---

	private async handleExplorerOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.view.explorer');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerTree(url: URL, res: http.ServerResponse): Promise<void> {
		try {
			const folders = vscode.workspace.workspaceFolders;
			if (!folders?.length) { this.sendJson(res, { tree: [], count: 0 }); return; }
			const rootUri = folders[0].uri;
			const entries = await vscode.workspace.fs.readDirectory(rootUri);
			const tree = entries.slice(0, 100).map(([name, type]) => ({
				name,
				type: type === vscode.FileType.Directory ? 'directory' : 'file',
				path: vscode.Uri.joinPath(rootUri, name).fsPath
			}));
			this.sendJson(res, { tree, count: tree.length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerReveal(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { path: filePath } = JSON.parse(body);
			await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(filePath));
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerCreateFile(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { path: filePath, content } = JSON.parse(body);
			const uri = vscode.Uri.file(filePath);
			await vscode.workspace.fs.writeFile(uri, Buffer.from(content || '', 'utf8'));
			this.sendJson(res, { success: true, path: filePath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerCreateFolder(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { path: folderPath } = JSON.parse(body);
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(folderPath));
			this.sendJson(res, { success: true, path: folderPath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerDelete(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { path: filePath, recursive } = JSON.parse(body);
			await vscode.workspace.fs.delete(vscode.Uri.file(filePath), { recursive: !!recursive });
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerRename(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { oldPath, newPath } = JSON.parse(body);
			await vscode.workspace.fs.rename(vscode.Uri.file(oldPath), vscode.Uri.file(newPath));
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerWorkspace(res: http.ServerResponse): Promise<void> {
		const folders = (vscode.workspace.workspaceFolders || []).map((f, i) => ({
			name: f.name, path: f.uri.fsPath, index: i
		}));
		this.sendJson(res, { folders, name: vscode.workspace.name || null });
	}

	// --- SCM Handlers ---

	private async handleScmOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.view.scm');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScmChanges(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('git.refresh');
			this.sendJson(res, { success: true, note: 'Use git CLI for detailed change info' });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScmStage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { filePath } = JSON.parse(body);
			await vscode.commands.executeCommand('git.stage', vscode.Uri.file(filePath));
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScmStageAll(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('git.stageAll');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScmCommit(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { message } = JSON.parse(body);
			await vscode.commands.executeCommand('git.commit', message);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScmBranch(res: http.ServerResponse): Promise<void> {
		try {
			const gitExt = vscode.extensions.getExtension('vscode.git');
			if (gitExt?.isActive) {
				const git = gitExt.exports.getAPI(1);
				const repo = git.repositories[0];
				if (repo) {
					this.sendJson(res, { branch: repo.state.HEAD?.name || 'unknown', ahead: repo.state.HEAD?.ahead || 0, behind: repo.state.HEAD?.behind || 0 });
					return;
				}
			}
			this.sendJson(res, { branch: 'unknown', ahead: 0, behind: 0 });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Debug Handlers ---

	private async handleDebugOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.view.debug');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDebugStart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { configuration } = JSON.parse(body);
			if (configuration) {
				await vscode.debug.startDebugging(undefined, configuration);
			} else {
				await vscode.commands.executeCommand('workbench.action.debug.start');
			}
			this.sendJson(res, { success: true, sessionId: vscode.debug.activeDebugSession?.id || null });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDebugStop(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.debug.stop');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDebugState(res: http.ServerResponse): Promise<void> {
		const session = vscode.debug.activeDebugSession;
		this.sendJson(res, {
			isDebugging: !!session,
			sessionName: session?.name || null,
			sessionType: session?.type || null
		});
	}

	// --- Window Handlers ---

	private async handleWindowReload(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, { success: true, note: 'Reloading window...' });
		setTimeout(() => vscode.commands.executeCommand('workbench.action.reloadWindow'), 100);
	}

	private async handleWindowCommand(res: http.ServerResponse, command: string): Promise<void> {
		try {
			await vscode.commands.executeCommand(command);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Theme Handlers ---

	private async handleThemeSet(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { theme } = JSON.parse(body);
			await vscode.workspace.getConfiguration().update('workbench.colorTheme', theme, vscode.ConfigurationTarget.Global);
			this.sendJson(res, { success: true, theme });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleThemeGet(res: http.ServerResponse): Promise<void> {
		const theme = vscode.workspace.getConfiguration().get<string>('workbench.colorTheme') || 'unknown';
		this.sendJson(res, { theme, kind: vscode.window.activeColorTheme.kind === 2 ? 'dark' : 'light' });
	}

	private async handleThemeList(res: http.ServerResponse): Promise<void> {
		try {
			const extensions = vscode.extensions.all;
			const themes: Array<{ id: string; label: string }> = [];
			for (const ext of extensions) {
				const contributes = ext.packageJSON?.contributes?.themes;
				if (contributes) {
					for (const t of contributes) {
						themes.push({ id: t.id || t.label, label: t.label });
					}
				}
			}
			this.sendJson(res, { themes, count: themes.length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleThemeFontSize(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { size } = JSON.parse(body);
			await vscode.workspace.getConfiguration().update('editor.fontSize', size, vscode.ConfigurationTarget.Global);
			this.sendJson(res, { success: true, fontSize: size });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleThemeFontFamily(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { fontFamily } = JSON.parse(body);
			await vscode.workspace.getConfiguration().update('editor.fontFamily', fontFamily, vscode.ConfigurationTarget.Global);
			this.sendJson(res, { success: true, fontFamily });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Settings Handlers ---

	private async handleSettingsOpenUI(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.openSettings');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSettingsOpenJSON(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.openSettingsJson');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSettingsGet(url: URL, res: http.ServerResponse): Promise<void> {
		const key = url.searchParams.get('key') || '';
		const parts = key.split('.');
		const section = parts.slice(0, -1).join('.');
		const prop = parts[parts.length - 1];
		const config = vscode.workspace.getConfiguration(section);
		const value = config.get(prop);
		const inspect = config.inspect(prop);
		this.sendJson(res, { key, value, defaultValue: inspect?.defaultValue ?? null });
	}

	private async handleSettingsSet(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { key, value, target } = JSON.parse(body);
			const parts = key.split('.');
			const section = parts.slice(0, -1).join('.');
			const prop = parts[parts.length - 1];
			let parsedValue: unknown;
			try { parsedValue = JSON.parse(value); } catch { parsedValue = value; }
			const configTarget = target === 'workspace' ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
			await vscode.workspace.getConfiguration(section).update(prop, parsedValue, configTarget);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSettingsReset(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { key } = JSON.parse(body);
			const parts = key.split('.');
			const section = parts.slice(0, -1).join('.');
			const prop = parts[parts.length - 1];
			await vscode.workspace.getConfiguration(section).update(prop, undefined, vscode.ConfigurationTarget.Global);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Screenshot & OCR Handlers ---

	private async handleScreenshotCapture(res: http.ServerResponse, _mode: string): Promise<void> {
		try {
			const { execSync } = require('child_process');
			const os = require('os');
			const path = require('path');
			const fs = require('fs');
			const screenshotDir = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'screenshots');
			fs.mkdirSync(screenshotDir, { recursive: true });
			const filename = `screenshot-${Date.now()}.png`;
			const filepath = path.join(screenshotDir, filename);
			execSync(`screencapture -x -o "${filepath}"`);
			const stats = fs.statSync(filepath);
			const sizeInfo = execSync(`sips -g pixelWidth -g pixelHeight "${filepath}"`).toString();
			const widthMatch = sizeInfo.match(/pixelWidth:\s*(\d+)/);
			const heightMatch = sizeInfo.match(/pixelHeight:\s*(\d+)/);
			this.sendJson(res, {
				success: true,
				path: filepath,
				width: widthMatch ? parseInt(widthMatch[1]) : 0,
				height: heightMatch ? parseInt(heightMatch[1]) : 0,
				sizeKB: Math.round(stats.size / 1024)
			});
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScreenshotCaptureRegion(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		// For now, capture full screen — region cropping can be added later
		await this.handleScreenshotCapture(res, 'region');
	}

	private async handleScreenshotOCR(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { imagePath } = JSON.parse(body);
			const { execSync } = require('child_process');
			const path = require('path');
			const ocrBinary = path.join(__dirname, '..', '..', 'tarx-ui-mcp-server', 'tools', 'tarx-ocr');
			const output = execSync(`"${ocrBinary}" "${imagePath}"`, { timeout: 30000 }).toString();
			const result = JSON.parse(output);
			this.sendJson(res, result);
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScreenshotFindText(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { text, caseSensitive } = JSON.parse(body);
			// Take screenshot first, then OCR it
			const { execSync } = require('child_process');
			const os = require('os');
			const path = require('path');
			const fs = require('fs');
			const screenshotDir = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'screenshots');
			fs.mkdirSync(screenshotDir, { recursive: true });
			const filepath = path.join(screenshotDir, `find-text-${Date.now()}.png`);
			execSync(`screencapture -x -o "${filepath}"`);
			const ocrBinary = path.join(__dirname, '..', '..', 'tarx-ui-mcp-server', 'tools', 'tarx-ocr');
			const output = execSync(`"${ocrBinary}" "${filepath}"`, { timeout: 30000 }).toString();
			const ocrResult = JSON.parse(output);
			const searchText = caseSensitive ? text : text.toLowerCase();
			const matches = (ocrResult.regions || []).filter((r: { text: string }) => {
				const t = caseSensitive ? r.text : r.text.toLowerCase();
				return t.includes(searchText);
			});
			this.sendJson(res, { success: true, found: matches.length > 0, matches, screenshotPath: filepath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScreenshotList(url: URL, res: http.ServerResponse): Promise<void> {
		try {
			const os = require('os');
			const path = require('path');
			const fs = require('fs');
			const limit = parseInt(url.searchParams.get('limit') || '20');
			const screenshotDir = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'screenshots');
			if (!fs.existsSync(screenshotDir)) { this.sendJson(res, { screenshots: [], count: 0 }); return; }
			const files = fs.readdirSync(screenshotDir).filter((f: string) => f.endsWith('.png')).slice(-limit);
			const screenshots = files.map((f: string) => {
				const stats = fs.statSync(path.join(screenshotDir, f));
				return { path: path.join(screenshotDir, f), timestamp: stats.mtimeMs, sizeKB: Math.round(stats.size / 1024) };
			});
			this.sendJson(res, { screenshots, count: screenshots.length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Command List Handlers ---

	private async handleCommandList(url: URL, res: http.ServerResponse): Promise<void> {
		try {
			const filter = url.searchParams.get('filter') || '';
			const allCommands = await vscode.commands.getCommands(true);
			const commands = filter ? allCommands.filter(c => c.startsWith(filter)) : allCommands.slice(0, 200);
			this.sendJson(res, { commands, count: commands.length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleCommandPaletteOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.showCommands');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// --- Extensions Handlers ---

	private async handleExtensionsOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.view.extensions');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExtensionsInstalled(res: http.ServerResponse): Promise<void> {
		const extensions = vscode.extensions.all
			.filter(e => !e.id.startsWith('vscode.'))
			.map(e => ({
				id: e.id,
				name: e.packageJSON?.displayName || e.id,
				version: e.packageJSON?.version || 'unknown',
				enabled: e.isActive,
				publisher: e.packageJSON?.publisher || 'unknown'
			}));
		this.sendJson(res, { extensions, count: extensions.length });
	}

	// --- StatusBar Handler ---

	private async handleStatusBarItems(res: http.ServerResponse): Promise<void> {
		// VS Code doesn't expose status bar items programmatically, return what we know
		this.sendJson(res, { items: [], note: 'Status bar items are not directly accessible via API' });
	}

	// --- Sidebar Extended Handlers ---

	private async handleSidebarToggleSection(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { section } = JSON.parse(body);
			// Toggle via webview postMessage
			await vscode.commands.executeCommand('tarx.sidebar.toggleSection', section);
			this.sendJson(res, { success: true, section });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarHistory(url: URL, res: http.ServerResponse): Promise<void> {
		try {
			const limit = parseInt(url.searchParams.get('limit') || '20');
			const history = await vscode.commands.executeCommand<unknown[]>('tarx.getConversationHistory', limit);
			this.sendJson(res, { history: history || [], count: (history || []).length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarFiles(res: http.ServerResponse): Promise<void> {
		try {
			const files = await vscode.commands.executeCommand<unknown[]>('tarx.getUploadedFiles');
			this.sendJson(res, { files: files || [], count: (files || []).length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarNavigate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		try {
			const body = await this.readBody(req);
			const { view, projectId } = JSON.parse(body);
			const viewCommands: Record<string, string> = {
				'home': 'tarx.sidebar.focus',
				'settings': 'tarx.settings.open',
				'chat': 'workbench.action.chat.open',
				'project': 'tarx.projects.open'
			};
			if (view === 'project' && projectId) {
				await vscode.commands.executeCommand('tarx.projects.open', projectId);
			} else {
				await vscode.commands.executeCommand(viewCommands[view] || 'tarx.sidebar.focus');
			}
			this.sendJson(res, { success: true, view });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarOpenSettings(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.settings.open');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarRefresh(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.projects.refresh');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarCollapseAll(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.sidebar.collapseAll');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarExpandAll(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.sidebar.expandAll');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarGetState(res: http.ServerResponse): Promise<void> {
		// Delegate to existing handler
		await this.handleSidebarState(res);
	}

	// =============================================
	// v3 HANDLERS — Sidebar Extended
	// =============================================

	private async handleSidebarSearchHistory(url: URL, res: http.ServerResponse): Promise<void> {
		const query = url.searchParams.get('q') || '';
		try {
			const result = await vscode.commands.executeCommand('tarx.sidebar.searchHistory', query);
			this.sendJson(res, { query, results: result || [] });
		} catch (e) { this.sendJson(res, { query, results: [], error: (e as Error).message }); }
	}

	private async handleSidebarDeleteHistory(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { id } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('tarx.sidebar.deleteHistory', id);
			this.sendJson(res, { success: true, id });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarGetSettings(res: http.ServerResponse): Promise<void> {
		try {
			const result = await vscode.commands.executeCommand('tarx.sidebar.getSettings');
			this.sendJson(res, { settings: result || {} });
		} catch (e) { this.sendJson(res, { settings: {}, error: (e as Error).message }); }
	}

	private async handleSidebarUpdateSettings(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const settings = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('tarx.sidebar.updateSettings', settings);
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleSidebarConnectionStatus(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, {
			status: this.state.connectionStatus || 'unknown',
			healthStatus: this.state.healthStatus || null,
			lastActivity: this.state.lastActivity || null
		});
	}

	// =============================================
	// v3 HANDLERS — Chat Extended
	// =============================================

	private async handleChatSelectParticipant(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { participant } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.action.chat.selectParticipant', participant);
			this.sendJson(res, { success: true, participant });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatParticipants(res: http.ServerResponse): Promise<void> {
		try {
			const participants = await vscode.commands.executeCommand('workbench.action.chat.listParticipants');
			this.sendJson(res, { participants: participants || [] });
		} catch (e) { this.sendJson(res, { participants: [], note: 'Participants API may not be available' }); }
	}

	private async handleChatAttachFile(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { filePath } = JSON.parse(body || '{}');
		try {
			const uri = vscode.Uri.file(filePath);
			await vscode.commands.executeCommand('workbench.action.chat.attachFile', uri);
			this.sendJson(res, { success: true, filePath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatAttachSelection(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.chat.attachSelection');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleChatInlineStart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { prompt } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('inlineChat.start', { message: prompt });
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Command & QuickOpen Extended
	// =============================================

	private async handleCommandSearch(url: URL, res: http.ServerResponse): Promise<void> {
		const query = url.searchParams.get('q') || '';
		const allCommands = await vscode.commands.getCommands(true);
		const filtered = allCommands.filter(c => c.toLowerCase().includes(query.toLowerCase()));
		this.sendJson(res, { query, commands: filtered.slice(0, 100), totalMatches: filtered.length });
	}

	private async handleCommandPaletteType(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { text } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.action.showCommands');
			// Type into the palette after a short delay
			setTimeout(async () => {
				await vscode.commands.executeCommand('type', { text });
			}, 100);
			this.sendJson(res, { success: true, text });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleQuickOpenOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.quickOpen');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleQuickOpenType(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { text } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.action.quickOpen', text);
			this.sendJson(res, { success: true, text });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleQuickOpenSelect(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { index } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');
			this.sendJson(res, { success: true, index });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Editor Decorations
	// =============================================

	private _decorationType: vscode.TextEditorDecorationType | null = null;

	private async handleEditorDecorate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { ranges, style } = JSON.parse(body || '{}');
		try {
			const editor = vscode.window.activeTextEditor;
			if (!editor) { this.sendError(res, 400, 'No active editor'); return; }
			if (this._decorationType) { this._decorationType.dispose(); }
			this._decorationType = vscode.window.createTextEditorDecorationType(style || {
				backgroundColor: 'rgba(255,255,0,0.3)',
				border: '1px solid yellow'
			});
			const decorations = (ranges || []).map((r: any) =>
				new vscode.Range(r.startLine, r.startColumn, r.endLine, r.endColumn)
			);
			editor.setDecorations(this._decorationType, decorations);
			this.sendJson(res, { success: true, decorationCount: decorations.length });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleEditorClearDecorations(res: http.ServerResponse): Promise<void> {
		if (this._decorationType) {
			this._decorationType.dispose();
			this._decorationType = null;
		}
		this.sendJson(res, { success: true });
	}

	// =============================================
	// v3 HANDLERS — Terminal Extended
	// =============================================

	private async handleTerminalState(url: URL, res: http.ServerResponse): Promise<void> {
		const terminalId = url.searchParams.get('terminalId') || '';
		try {
			const terminals = vscode.window.terminals;
			if (terminalId) {
				const t = terminals.find((_t, i) => String(i) === terminalId);
				this.sendJson(res, t ? { name: t.name, processId: await t.processId, exitStatus: t.exitStatus } : { error: 'Terminal not found' });
			} else {
				const active = vscode.window.activeTerminal;
				this.sendJson(res, {
					activeTerminal: active ? { name: active.name, processId: await active.processId } : null,
					totalTerminals: terminals.length
				});
			}
		} catch (e) { this.sendError(res, 500, (e as Error).message); }
	}

	private async handleTerminalSelect(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { index } = JSON.parse(body || '{}');
		try {
			const terminals = vscode.window.terminals;
			if (index >= 0 && index < terminals.length) {
				terminals[index].show();
				this.sendJson(res, { success: true, name: terminals[index].name });
			} else {
				this.sendError(res, 400, `Terminal index ${index} out of range (0-${terminals.length - 1})`);
			}
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleTerminalRename(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { index, name } = JSON.parse(body || '{}');
		try {
			const terminals = vscode.window.terminals;
			if (index >= 0 && index < terminals.length) {
				await vscode.commands.executeCommand('workbench.action.terminal.rename', { name });
				this.sendJson(res, { success: true, name });
			} else {
				this.sendError(res, 400, `Terminal index ${index} out of range`);
			}
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleTerminalSetProfile(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { profile } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.action.terminal.selectDefaultProfile');
			this.sendJson(res, { success: true, profile, note: 'Profile selection dialog opened' });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Explorer Extended
	// =============================================

	private async handleExplorerExpand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { path: folderPath } = JSON.parse(body || '{}');
		try {
			const uri = vscode.Uri.file(folderPath);
			await vscode.commands.executeCommand('revealInExplorer', uri);
			this.sendJson(res, { success: true, path: folderPath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerCollapse(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { path: folderPath } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.files.action.collapseExplorerFolders');
			this.sendJson(res, { success: true, path: folderPath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerSelect(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { path: filePath } = JSON.parse(body || '{}');
		try {
			const uri = vscode.Uri.file(filePath);
			await vscode.commands.executeCommand('revealInExplorer', uri);
			this.sendJson(res, { success: true, path: filePath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExplorerCopy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { source, destination } = JSON.parse(body || '{}');
		try {
			const sourceUri = vscode.Uri.file(source);
			const destUri = vscode.Uri.file(destination);
			await vscode.workspace.fs.copy(sourceUri, destUri);
			this.sendJson(res, { success: true, source, destination });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — SCM Extended
	// =============================================

	private async handleScmUnstage(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { path: filePath } = JSON.parse(body || '{}');
		try {
			if (filePath) {
				const uri = vscode.Uri.file(filePath);
				await vscode.commands.executeCommand('git.unstage', uri);
			} else {
				await vscode.commands.executeCommand('git.unstageAll');
			}
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScmDiscard(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { path: filePath } = JSON.parse(body || '{}');
		try {
			if (filePath) {
				const uri = vscode.Uri.file(filePath);
				await vscode.commands.executeCommand('git.clean', uri);
			} else {
				await vscode.commands.executeCommand('git.cleanAll');
			}
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Debug Extended
	// =============================================

	private async handleDebugPause(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.debug.pause');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDebugContinue(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.debug.continue');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDebugStepOver(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.debug.stepOver');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleDebugStepInto(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.debug.stepInto');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Extensions Extended
	// =============================================

	private async handleExtensionsSearch(url: URL, res: http.ServerResponse): Promise<void> {
		const query = url.searchParams.get('q') || '';
		try {
			await vscode.commands.executeCommand('workbench.extensions.search', query);
			this.sendJson(res, { success: true, query });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExtensionsInstall(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { extensionId } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.extensions.installExtension', extensionId);
			this.sendJson(res, { success: true, extensionId });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExtensionsUninstall(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { extensionId } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extensionId);
			this.sendJson(res, { success: true, extensionId });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleExtensionsToggle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { extensionId, enable } = JSON.parse(body || '{}');
		try {
			const cmd = enable ? 'workbench.extensions.enableExtension' : 'workbench.extensions.disableExtension';
			await vscode.commands.executeCommand(cmd, extensionId);
			this.sendJson(res, { success: true, extensionId, enable });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Settings & Keybindings
	// =============================================

	private async handleSettingsSearch(url: URL, res: http.ServerResponse): Promise<void> {
		const query = url.searchParams.get('q') || '';
		try {
			await vscode.commands.executeCommand('workbench.action.openSettings', query);
			this.sendJson(res, { success: true, query });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleKeybindingsOpen(res: http.ServerResponse): Promise<void> {
		try {
			await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleKeybindingsGet(url: URL, res: http.ServerResponse): Promise<void> {
		const command = url.searchParams.get('command') || '';
		try {
			const keybindings = await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', command);
			this.sendJson(res, { command, keybindings: keybindings || [] });
		} catch (e) { this.sendJson(res, { command, keybindings: [], note: 'Keybinding lookup not directly available' }); }
	}

	// =============================================
	// v3 HANDLERS — Layout & Notifications
	// =============================================

	private async handleLayoutGet(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, {
			sidebarVisible: vscode.window.tabGroups.all.length > 0,
			panelVisible: true, // No direct API to check
			tabGroups: vscode.window.tabGroups.all.map(g => ({
				viewColumn: g.viewColumn,
				isActive: g.isActive,
				tabs: g.tabs.length
			}))
		});
	}

	private async handleNotificationVisible(res: http.ServerResponse): Promise<void> {
		// VS Code doesn't expose visible notifications via API
		this.sendJson(res, { notifications: [], note: 'Notification list not directly accessible via API' });
	}

	// =============================================
	// v3 HANDLERS — View Extended
	// =============================================

	private async handleViewClose(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { viewId } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand(`${viewId}.removeView`);
			this.sendJson(res, { success: true, viewId });
		} catch (e) {
			// Try generic close
			try {
				await vscode.commands.executeCommand('workbench.action.closePanel');
				this.sendJson(res, { success: true, viewId, note: 'Closed via generic panel close' });
			} catch (e2) { this.sendJson(res, { success: false, error: (e as Error).message }); }
		}
	}

	private async handleViewFocus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { viewId } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand(`${viewId}.focus`);
			this.sendJson(res, { success: true, viewId });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Window Extended
	// =============================================

	private async handleWindowWorkspaceOpen(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { path: wsPath } = JSON.parse(body || '{}');
		try {
			const uri = vscode.Uri.file(wsPath);
			await vscode.commands.executeCommand('vscode.openFolder', uri);
			this.sendJson(res, { success: true, path: wsPath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleWindowWorkspaceAddFolder(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { path: folderPath } = JSON.parse(body || '{}');
		try {
			const uri = vscode.Uri.file(folderPath);
			vscode.workspace.updateWorkspaceFolders(
				vscode.workspace.workspaceFolders?.length || 0, null,
				{ uri }
			);
			this.sendJson(res, { success: true, path: folderPath });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — StatusBar
	// =============================================

	private async handleStatusBarClick(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { command } = JSON.parse(body || '{}');
		try {
			if (command) {
				await vscode.commands.executeCommand(command);
			}
			this.sendJson(res, { success: true, command });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleStatusBarTarx(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, {
			status: this.state.connectionStatus || 'unknown',
			model: this.state.healthStatus?.model || null,
			lastActivity: this.state.lastActivity || null
		});
	}

	private async handleStatusBarSetTarx(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { text, tooltip, command } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('tarx.statusBar.update', { text, tooltip, command });
			this.sendJson(res, { success: true });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Theme Extended
	// =============================================

	private async handleThemeIconSet(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { theme } = JSON.parse(body || '{}');
		try {
			await vscode.commands.executeCommand('workbench.action.selectIconTheme');
			if (theme) {
				const config = vscode.workspace.getConfiguration('workbench');
				await config.update('iconTheme', theme, vscode.ConfigurationTarget.Global);
			}
			this.sendJson(res, { success: true, theme });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Screenshot Extended
	// =============================================

	private async handleScreenshotCompare(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { baseline, current, threshold } = JSON.parse(body || '{}');
		try {
			const { execSync } = require('child_process');
			const fs = require('fs');
			if (!fs.existsSync(baseline) || !fs.existsSync(current)) {
				this.sendError(res, 400, 'One or both screenshot files do not exist');
				return;
			}
			// Simple size comparison as a baseline check
			const baselineStat = fs.statSync(baseline);
			const currentStat = fs.statSync(current);
			const sizeDiff = Math.abs(baselineStat.size - currentStat.size) / Math.max(baselineStat.size, 1);
			this.sendJson(res, {
				match: sizeDiff < (threshold || 0.05),
				sizeDiffPercent: (sizeDiff * 100).toFixed(2),
				baseline, current
			});
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScreenshotOcrRegion(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { imagePath, x, y, width, height } = JSON.parse(body || '{}');
		try {
			const { execSync } = require('child_process');
			const os = require('os');
			const path = require('path');
			// Crop with sips, then OCR
			const croppedPath = path.join(os.tmpdir(), `tarx-crop-${Date.now()}.png`);
			execSync(`sips -c ${height} ${width} --cropOffset ${y} ${x} "${imagePath}" --out "${croppedPath}" 2>/dev/null`);
			const ocrBin = path.join(__dirname, '../../tarx-ui-mcp-server/tools/tarx-ocr');
			const ocrResult = execSync(`"${ocrBin}" "${croppedPath}" 2>/dev/null`, { encoding: 'utf-8' });
			const parsed = JSON.parse(ocrResult || '[]');
			this.sendJson(res, { success: true, text: parsed, region: { x, y, width, height } });
		} catch (e) { this.sendJson(res, { success: false, error: (e as Error).message }); }
	}

	private async handleScreenshotVerifyElement(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { expectedText, region } = JSON.parse(body || '{}');
		try {
			// Take screenshot, OCR, check for expected text
			const { execSync } = require('child_process');
			const os = require('os');
			const path = require('path');
			const screenshotPath = path.join(os.tmpdir(), `tarx-verify-${Date.now()}.png`);
			execSync(`screencapture -x -o "${screenshotPath}"`);
			const ocrBin = path.join(__dirname, '../../tarx-ui-mcp-server/tools/tarx-ocr');
			const ocrResult = execSync(`"${ocrBin}" "${screenshotPath}" 2>/dev/null`, { encoding: 'utf-8' });
			const parsed = JSON.parse(ocrResult || '[]');
			const allText = parsed.map((r: any) => r.text).join(' ');
			const found = expectedText ? allText.toLowerCase().includes(expectedText.toLowerCase()) : false;
			this.sendJson(res, { found, expectedText, allText: allText.substring(0, 500) });
		} catch (e) { this.sendJson(res, { found: false, error: (e as Error).message }); }
	}

	// =============================================
	// v3 HANDLERS — Test Runner
	// =============================================

	private testResults: Map<string, any> = new Map();
	private testRunning = false;

	private async handleTestRunSuite(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { suite, tags } = JSON.parse(body || '{}');
		this.sendJson(res, { started: true, suite, tags, note: 'Test execution delegated to MCP test runner' });
	}

	private async handleTestRunSingle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { testId } = JSON.parse(body || '{}');
		this.sendJson(res, { started: true, testId, note: 'Single test execution delegated to MCP test runner' });
	}

	private async handleTestRunCategory(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this.readBody(req);
		const { category } = JSON.parse(body || '{}');
		this.sendJson(res, { started: true, category, note: 'Category test execution delegated to MCP test runner' });
	}

	private async handleTestRunAll(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, { started: true, note: 'Full test suite execution delegated to MCP test runner' });
	}

	private async handleTestSuites(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, {
			suites: [
				{ name: 'editor', count: 350, category: 'A' },
				{ name: 'terminal', count: 200, category: 'B' },
				{ name: 'panels', count: 200, category: 'C' },
				{ name: 'notifications', count: 150, category: 'D' },
				{ name: 'tarx-sidebar', count: 400, category: 'E' },
				{ name: 'chat', count: 300, category: 'F' },
				{ name: 'commands', count: 100, category: 'G' },
				{ name: 'explorer', count: 200, category: 'H' },
				{ name: 'scm', count: 100, category: 'I' },
				{ name: 'debug', count: 100, category: 'J' },
				{ name: 'settings', count: 100, category: 'K' },
				{ name: 'screenshot', count: 100, category: 'L' },
				{ name: 'integration', count: 200, category: 'M' }
			],
			totalTests: 2500
		});
	}

	private async handleTestReset(res: http.ServerResponse): Promise<void> {
		this.testResults.clear();
		this.testRunning = false;
		this.sendJson(res, { success: true, note: 'Test state reset' });
	}

	private async handleTestCoverage(res: http.ServerResponse): Promise<void> {
		this.sendJson(res, {
			totalEndpoints: 182,
			coveredEndpoints: this.testResults.size,
			coveragePercent: ((this.testResults.size / 182) * 100).toFixed(1),
			results: Object.fromEntries(this.testResults)
		});
	}

	private async handleTestResults(url: URL, res: http.ServerResponse): Promise<void> {
		const runId = url.searchParams.get('runId') || 'latest';
		this.sendJson(res, {
			runId,
			status: 'no_results',
			passed: 0,
			failed: 0,
			skipped: 0,
			total: 0,
			results: [],
			note: 'No test runs have been executed yet. Use /ui/test/run-all to start.'
		});
	}

	private async handleTestReport(url: URL, res: http.ServerResponse): Promise<void> {
		const runId = url.searchParams.get('runId') || 'latest';
		this.sendJson(res, {
			runId,
			status: 'no_report',
			summary: { passed: 0, failed: 0, skipped: 0, total: 0 },
			categories: {},
			duration: 0,
			note: 'No test runs have been executed yet.'
		});
	}

	private async handleTestCases(url: URL, res: http.ServerResponse): Promise<void> {
		const category = url.searchParams.get('category') || '';
		const priority = url.searchParams.get('priority') || '';
		const tag = url.searchParams.get('tag') || '';
		const limit = parseInt(url.searchParams.get('limit') || '50', 10);
		const suiteMap: Record<string, { count: number; prefix: string }> = {
			'editor': { count: 350, prefix: 'A' },
			'terminal': { count: 200, prefix: 'B' },
			'panels': { count: 200, prefix: 'C' },
			'notifications': { count: 150, prefix: 'D' },
			'tarx-sidebar': { count: 400, prefix: 'E' },
			'chat': { count: 300, prefix: 'F' },
			'commands': { count: 100, prefix: 'G' },
			'explorer': { count: 200, prefix: 'H' },
			'scm': { count: 100, prefix: 'I' },
			'debug': { count: 100, prefix: 'J' },
			'settings': { count: 100, prefix: 'K' },
			'screenshot': { count: 100, prefix: 'L' },
			'integration': { count: 200, prefix: 'M' }
		};
		const cases: Array<{ id: string; name: string; category: string; priority: string }> = [];
		const entries: Array<[string, { count: number; prefix: string }]> = category && suiteMap[category]
			? [[category, suiteMap[category]]]
			: Object.entries(suiteMap) as Array<[string, { count: number; prefix: string }]>;
		for (const [cat, info] of entries) {
			if (!info) continue;
			const count = Math.min(info.count, limit - cases.length);
			for (let i = 1; i <= count && cases.length < limit; i++) {
				cases.push({
					id: `${info.prefix}-${String(i).padStart(3, '0')}`,
					name: `${cat} test ${i}`,
					category: cat as string,
					priority: i <= 10 ? 'P0' : i <= 50 ? 'P1' : 'P2'
				});
			}
		}
		this.sendJson(res, { cases, total: cases.length, filter: { category, priority, tag, limit } });
	}

	/**
	 * Stop the test harness
	 */
	stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
			console.log('[TARX Harness] Server stopped');
		}
	}

	dispose(): void {
		this.stop();
	}
}
