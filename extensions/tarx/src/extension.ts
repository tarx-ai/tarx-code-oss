/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Early activation log - this runs when module is loaded
console.log('[TARX] ========== EXTENSION MODULE LOADING ==========');

// Version tracking - update this on each release
const TARX_VERSION = "2026-02-04-v1-sidebar-polish";
console.log(`[TARX] Version loaded: ${TARX_VERSION}`);

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, spawn as spawnProcess, ChildProcess } from 'child_process';
import { TarxCompletionProvider } from './completionProvider';
import { TarxStatusBar } from './statusBar';
import { TarxClient, ChatMessage } from './tarxClient';
import { TarxLanguageModelProvider } from './languageModelProvider';
// DISABLED FOR V1 - Voice services deferred to V1.5
// import { registerSpeechProvider, setTranscriptPanel, TarxSpeechProvider } from './speechProvider';
// import { VoiceTranscriptPanel } from './voiceTranscriptPanel';
import { JsonDatabase, DatabaseOperations, Project, Conversation, ConversationTurn, detectProjectType } from './database';
import { SqliteDatabase } from './sqliteDatabase';
import { RagClient, chunkText, chunkCode } from './ragClient';
import { ProjectIndexer, createFileWatcher } from './projectIndexer';
import { execute, executeTransaction, queryOne } from './secureDatabase';
import * as crypto from 'crypto';
import {
	parseFileReferences,
	loadContext,
	buildPrompt,
	parseArtifacts,
	applyArtifact
} from './chatContext';
import {
	TARX_SYSTEM_PROMPT,
	TARX_LOCAL_REASONING_PROMPT,
	buildTarxSystemPrompt,
	isVagueRequest,
	getClarificationForVagueRequest,
	normalizeTranscription
} from './systemPrompt';
import {
	analyzeUserCode,
	formatIssuesForResponse
} from './codeAnalysis';
import { registerSidebarProvider, TarxSidebarProvider } from './sidebarProvider';
import { registerMcpSettingsProvider, McpSettingsProvider } from './core/config/McpSettingsProvider';
import { HealthService, ConnectionStatus } from './healthService';
import { TestHarnessService } from './testHarness';
import { fitToContextWindow, getContextUsage, Message as ContextMessage } from './contextWindow';
import {
	getProactiveSystem,
	ProactiveSystem,
	getContextObserver
	// getProactiveVoiceInterface // DISABLED FOR V1
} from './proactive';
import { executeFirstRunFlow } from './services/firstRunFlow.js';
// projectDashboard imports removed — replaced by ProjectContextPanel
import { registerProjectContextCommands, ProjectContextPanel } from './projectContextPanel';
import { registerSessionPanelCommands, TarxSessionPanel } from './sessionPanel';
import { registerProjectTreeProvider, ProjectTreeProvider } from './projectTreeProvider';
import { registerColorCommands } from './sidebar-color';
import { registerInteractionCommands } from './sidebar-interactions';
// project-creation-flow import removed — consolidated into ProjectContextPanel
import { registerOvernightTestCommands } from './overnight-test';
import { registerConversationalTestCommands } from './test/conversational-test-harness';
import { AuthManager, registerAuthCommands, AuthChatView, AuthStateManager } from './auth';
import { closeMCPDatabase, searchMCPKnowledge, getMCPKnowledgeCount, storeMCPEmbeddings } from './mcpKnowledge';
import { TarxSidebarProvider as TarxSidebarWebviewProvider } from './webview/TarxSidebarProvider';
import { registerClaudeSessionsProvider, ClaudeSessionsProvider } from './claudeSessionsProvider';
// project-creation import removed — consolidated into ProjectContextPanel
import { registerSectionsSidebar, TarxSectionsSidebarProvider } from './sidebar-sections';
import { registerContextFilesProvider, ContextFilesProvider } from './contextFilesProvider';
import { registerClaudeWorkerCommands } from './claude-worker';
import { registerSidebarFullUX } from './sidebar-full-ux';
import { initTarxLogger, flushTarxLogs } from './tarxLogger';
// TARX Bridge Integration - Feb 2026
import {
	registerClaudeBridgeCommands,
	detectActionIntent,
	handleActionIntent,
	getBridgeStatus,
	getBridgeStatusDisplay,
	buildPayload,
	invokeClaudeWithPayload,
	executeNextSteps,
	BridgeStatus
} from './claude-bridge';
import { registerBridgeTestCommands } from './test-bridge';
// TARX Skills Bridge - Connects to tarx-skills-provider
import { checkSkillsFirst } from './skillsBridge';
// TARX Autonomic Daemon - Feb 2026
import { startDaemon, stopDaemon, getDaemon } from './daemon';
// TARX QA Test Harness - Feb 2026
import { runQATests, runStartupChecks } from './test/qa-harness';
// TARX Chat Panel - Feb 2026: Webview panel in right column (ViewColumn.Beside)
import { TarxChatPanel } from './chatPanel';
// TARX Dashboard Panel - Feb 2026: Webview panel in center tab (ViewColumn.Active)
import { TarxDashboardPanel } from './dashboardPanel';
// TARX Model Router - Feb 2026
import {
	routeMessage,
	classifyIntent,
	getRouteIndicator,
	setRouterConfig,
	getRouterConfig,
	type ModelRoute,
	type RouteDecision
} from './router';
import {
	initNetworkModel,
	streamNetworkResponse,
	hasApiKey as hasNetworkApiKey,
	promptForApiKey,
	getNetworkModelSettings,
	storeApiKey,
	deleteApiKey,
	setMemorySettings,
	testConnection as testClaudeConnection,
	type NetworkModelContext,
	type NetworkModelSettings
} from './networkModel';
import {
	initStripeService,
	getBillingStatus,
	createCheckoutSession,
	createPortalSession,
	storeStripeSecretKey,
	deleteStripeSecretKey,
	type BillingTier
} from './stripeService';
import { CreditBridge } from './creditBridge';
import { registerChatInputIntegration, ChatInputIntegration } from './chatInputIntegration';

// ═══════════════════════════════════════════════════════════════
// CRASH-GUARD: All static imports loaded — module parsing succeeded.
// If you see this log, the extension host loaded our module cleanly.
// If you DON'T see this log, check for import/native-module errors above.
// ═══════════════════════════════════════════════════════════════
console.log('[TARX CRASH-GUARD] All imports loaded successfully at', new Date().toISOString());

// ========================================
// Debug Flag - Set TARX_DEBUG=true for verbose logging
// ========================================
const DEBUG = process.env.TARX_DEBUG === 'true';

// ========================================
// Dev Mode Auth Bypass - Skip PIN screen for MCP testing
// Can be enabled via:
// 1. Environment variable: TARX_DEV_BYPASS_AUTH=true
// 2. VS Code setting: tarx.security.devBypassAuth = true
// ========================================
function isDevBypassAuthEnabled(): boolean {
	// Check environment variable first
	if (process.env.TARX_DEV_BYPASS_AUTH === 'true') {
		return true;
	}
	// Check VS Code setting
	const config = vscode.workspace.getConfiguration('tarx.security');
	return config.get<boolean>('devBypassAuth', false);
}

/** Conditional debug logging - only logs when TARX_DEBUG=true */
function debugLog(...args: unknown[]): void {
	if (DEBUG) {
		console.log('[TARX]', ...args);
	}
}

/** Always log important messages */
function log(...args: unknown[]): void {
	console.log('[TARX]', ...args);
}

/**
 * Load project instructions from .tarx/instructions.md
 * Used to inject project-specific context into the system prompt
 */
async function loadProjectInstructions(projectRoot: string): Promise<string | undefined> {
	const instructionsPath = path.join(projectRoot, '.tarx', 'instructions.md');
	try {
		if (fs.existsSync(instructionsPath)) {
			const content = fs.readFileSync(instructionsPath, 'utf-8');
			return content.trim() || undefined;
		}
	} catch (e) {
		console.warn('[TARX] Failed to load project instructions:', e);
	}
	return undefined;
}

// ========================================
// Command Registration Guard
// Prevents duplicate command registration on hot-reload
// ========================================
const registeredCommands = new Set<string>();

function safeRegisterCommand(
	context: vscode.ExtensionContext,
	commandId: string,
	handler: (...args: any[]) => any
): void {
	if (registeredCommands.has(commandId)) {
		console.log(`[TARX] Command ${commandId} already registered locally, skipping`);
		return;
	}
	registeredCommands.add(commandId);
	try {
		context.subscriptions.push(
			vscode.commands.registerCommand(commandId, handler)
		);
	} catch (error) {
		// Command may already be registered by core TARX app - this is OK
		if (error instanceof Error && error.message.includes('already exists')) {
			console.log(`[TARX] Command ${commandId} already exists in VS Code, skipping`);
		} else {
			console.error(`[TARX] Failed to register command ${commandId}:`, error);
		}
	}
}

// ========================================
// TARX Analytics - Lightweight event tracking
// ========================================
class TarxAnalytics {
	private enabled: boolean = true;
	private sessionStart: number = Date.now();
	private events: Array<{ event: string; properties: Record<string, unknown>; timestamp: number }> = [];
	private firstChatSent: boolean = false;

	constructor() {
		// Read telemetry setting
		const config = vscode.workspace.getConfiguration('tarx');
		this.enabled = config.get<boolean>('telemetry', true);

		// Listen for config changes
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('tarx.telemetry')) {
				this.enabled = vscode.workspace.getConfiguration('tarx').get<boolean>('telemetry', true);
				console.log(`[TARX Analytics] Telemetry ${this.enabled ? 'enabled' : 'disabled'}`);
			}
		});
	}

	track(event: string, properties?: Record<string, unknown>): void {
		if (!this.enabled) { return; }

		// Auto-track first chat
		if (event === 'chat_sent' && !this.firstChatSent) {
			this.firstChatSent = true;
			this.track('first_chat_sent', properties);
		}

		const entry = {
			event,
			properties: {
				...properties,
				session_ms: Date.now() - this.sessionStart
			},
			timestamp: Date.now()
		};

		this.events.push(entry);
		console.log(`[TARX Analytics] ${event}`, properties || '');

		// TODO: Batch write to SQLite every 30s or on app close
	}

	trackError(error: Error, context?: Record<string, unknown>): void {
		this.track('error_occurred', {
			error_type: error.name,
			message: error.message,
			stack: error.stack?.slice(0, 500),
			...context
		});
	}

	getSessionDuration(): number {
		return Date.now() - this.sessionStart;
	}

	getEvents(): Array<{ event: string; properties: Record<string, unknown>; timestamp: number }> {
		return this.events;
	}
}

// Global analytics instance
let analytics: TarxAnalytics;

let statusBar: TarxStatusBar | undefined;
let healthService: HealthService | undefined;
let sidebarProvider: TarxSidebarProvider | undefined;
let webviewSidebarProvider: TarxSidebarWebviewProvider | undefined;
let projectTreeProvider: ProjectTreeProvider | undefined;
let languageModelProvider: TarxLanguageModelProvider | undefined;
let db: DatabaseOperations | undefined;
let ragClient: RagClient | undefined;
let projectIndexer: ProjectIndexer | undefined;
let activeProject: Project | undefined;
let activeConversation: Conversation | undefined;
let fileWatcher: vscode.Disposable | undefined;
let proactiveSystem: ProactiveSystem | undefined;
let creditBridge: CreditBridge | undefined;
let grokDispatchProcess: ChildProcess | undefined;

// Auth objects - module level for guard access
let authManager: AuthManager | undefined;
let authChatView: AuthChatView | undefined;
let isAuthenticatedSession: boolean = false;

/** Sync activeConversation ID to the language model provider for history injection */
function syncConversationToProvider(): void {
	languageModelProvider?.setActiveConversation(activeConversation?.id);
}

/**
 * Ensure the user is authenticated before proceeding.
 * Re-shows auth panel if needed and waits for completion.
 * @returns true if authenticated, false if cancelled/failed
 */
async function ensureAuthenticated(): Promise<boolean> {
	// Already authenticated this session
	if (isAuthenticatedSession) {
		return true;
	}

	// No auth manager means auth wasn't initialized
	if (!authManager || !authChatView) {
		console.warn('[TARX] Auth not initialized');
		return false;
	}

	// Check if auth is even required
	const isConfigured = await authManager.isAuthEnabled();
	if (!isConfigured) {
		// No auth configured, user can proceed
		isAuthenticatedSession = true;
		return true;
	}

	// Check if already unlocked
	const requiresUnlock = await authManager.requiresUnlock();
	if (!requiresUnlock) {
		isAuthenticatedSession = true;
		return true;
	}

	// Need to show auth panel
	console.log('[TARX] Auth required - showing auth panel');
	const success = await authChatView.showAndWait();

	if (success) {
		isAuthenticatedSession = true;
		// Update sidebar if available
		sidebarProvider?.setLocked(false);
	}

	return success;
}

// Pre-loaded conversation history for restored conversations
// Key: conversationId, Value: array of turns loaded when opening from history
const conversationHistory = new Map<string, ConversationTurn[]>();

// Maximum number of conversation turns to load for context
const MAX_HISTORY_TURNS = 10;

export async function activate(context: vscode.ExtensionContext) {
	// Initialize console log capture FIRST - before any other logging
	initTarxLogger();

	// TARX: Global error filter — intercept known noise errors BEFORE Sentry sees them.
	// These are VS Code internals or benign race conditions that spam Sentry without user impact.
	//
	// FIX (Feb 2026): Previous version appended a listener but never removed the originals,
	// so Sentry's handler (registered at process startup in extensionHostProcess.ts) still
	// fired for every error. Now we remove all existing handlers, install our filter as the
	// sole gatekeeper, and forward non-noise errors to the original handlers.
	const noisePatterns = [
		'HostProvider not setup',                              // NODE-A: 2,792 events - External auth remnant
		'Channel has been closed',                             // NODE-1,3,7,1B: 166 events - IPC race
		'Canceled: Canceled',                                  // NODE-2,4,5,6,19,1A: 863 events - User cancellations
		'Canceled',                                            // Catch-all for cancellations
		"permission denied, mkdir '/mock'",                    // NODE-B: 730 events - Test artifact
		'EACCES',                                              // Permission errors (non-critical)
		'spawn docker ENOENT',                                 // NODE-S: 6 events - Docker not installed
		'EADDRINUSE',                                          // Port conflicts (handled gracefully)
		'address already in use',                              // Alternative EADDRINUSE message
		'Pending response rejected since connection got disposed', // NODE-P: 4 events - Extension shutdown
		'Harness error',                                       // Test harness HTTP errors (non-critical)
		'No messages returned'                                 // MCP/harness expected condition
	];

	// Capture and REMOVE all existing uncaughtException handlers (including Sentry's)
	const origExceptionHandlers = process.listeners('uncaughtException').slice();
	process.removeAllListeners('uncaughtException');

	// Install our filter as the sole gatekeeper
	process.on('uncaughtException', (err: Error) => {
		const msg = err?.message || '';
		const code = (err as NodeJS.ErrnoException)?.code || '';

		for (const pattern of noisePatterns) {
			if (msg.includes(pattern) || code === pattern) {
				// Silently ignore — noise error, do NOT forward to Sentry or other handlers
				return;
			}
		}

		// Non-noise: forward to original handlers (Sentry, VS Code, etc.)
		for (const handler of origExceptionHandlers) {
			(handler as (err: Error) => void)(err);
		}
	});

	// Also filter unhandled promise rejections (HostProvider can throw as rejected promise)
	const origRejectionHandlers = process.listeners('unhandledRejection').slice();
	process.removeAllListeners('unhandledRejection');

	process.on('unhandledRejection', (reason: unknown) => {
		const msg = reason instanceof Error ? (reason.message || '') : String(reason || '');

		for (const pattern of noisePatterns) {
			if (msg.includes(pattern)) {
				return;
			}
		}

		for (const handler of origRejectionHandlers) {
			(handler as (reason: unknown, promise: Promise<unknown>) => void)(reason, Promise.resolve());
		}
	});

	console.log('[TARX CRASH-GUARD] ========== TARX EXTENSION ACTIVATING ==========');
	console.log('[TARX CRASH-GUARD] Time:', new Date().toISOString());
	console.log('[TARX CRASH-GUARD] PID:', process.pid, 'Platform:', process.platform);

  try { // ══════ TOP-LEVEL CRASH GUARD ══════

	// ========== DIAGNOSTIC: DB PATH CHECK ==========
	const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
	console.log('[TARX DIAG] DB path:', mcpDbPath);
	console.log('[TARX DIAG] DB exists:', fs.existsSync(mcpDbPath));
	if (fs.existsSync(mcpDbPath)) {
		try {
			const stats = fs.statSync(mcpDbPath);
			console.log('[TARX DIAG] DB size:', stats.size, 'bytes');
			console.log('[TARX DIAG] DB mtime:', stats.mtime.toISOString());
			// Quick query to count spaces
			const countResult = execSync(
				`sqlite3 "${mcpDbPath}" "SELECT COUNT(*) FROM spaces WHERE deleted_at IS NULL"`,
				{ encoding: 'utf8', timeout: 5000 }
			).trim();
			console.log('[TARX DIAG] Space count:', countResult);
		} catch (e) {
			console.error('[TARX DIAG] DB stat/query error:', e);
		}
	}
	// ========== END DIAGNOSTIC ==========

	// Version command - register early so it's always available
	context.subscriptions.push(vscode.commands.registerCommand('tarx.version', () => {
		vscode.window.showInformationMessage(`TARX Version: ${TARX_VERSION}`);
	}));

	// Initialize analytics
	analytics = new TarxAnalytics();
	analytics.track('app_launched', {
		version: context.extension.packageJSON.version || '1.0.0',
		platform: process.platform
	});

	// Initialize network model with SecretStorage for secure API key storage
	initNetworkModel(context);
	console.log('[TARX] Network model initialized with SecretStorage');

	// Initialize Stripe billing service
	initStripeService(context);
	console.log('[TARX] Stripe billing service initialized');

	// Initialize credit bridge (mesh → Stripe metered billing)
	creditBridge = new CreditBridge();
	creditBridge.initialize(context);
	context.subscriptions.push(creditBridge);
	// Delay polling start to let extension fully activate
	setTimeout(() => creditBridge?.startPolling(), 10000);
	console.log('[TARX] Credit bridge initialized (polling starts in 10s)');

	// ═══ CRASH-GUARD: Auth init ═══
	try {
		authManager = new AuthManager(context);
		await authManager.initialize();
		console.log('[TARX] Auth manager initialized');

		const authStateManager = AuthStateManager.getInstance();
		authChatView = new AuthChatView(context, authManager);

		registerAuthCommands(context, authManager, async () => {
			if (!authChatView || !authManager) {
				vscode.window.showErrorMessage('Auth not initialized');
				return false;
			}

			const isConfigured = await authManager.isAuthEnabled();
			if (!isConfigured) {
				vscode.window.showInformationMessage('No PIN is configured. Use "TARX: Set Up Authentication" first.');
				return false;
			}

			const success = await authChatView.showAndWait();
			if (success) {
				isAuthenticatedSession = true;
				sidebarProvider?.setLocked(false);
				vscode.window.showInformationMessage('TARX unlocked');
			}
			return success;
		});

		if (isDevBypassAuthEnabled()) {
			console.log('[TARX] ⚠️  DEV MODE: Auth bypass enabled (env or setting)');
			authStateManager.setState('unlocked');
			isAuthenticatedSession = true;
		} else {
			const isConfigured = await authManager.isAuthEnabled();
			const requiresUnlock = await authManager.requiresUnlock();
			const requireOnStartup = authManager.isRequiredOnStartup();

			if (!isConfigured || (requireOnStartup && requiresUnlock)) {
				console.log('[TARX] Auth required - showing auth screen (requireOnStartup:', requireOnStartup, ')');
				// NON-BLOCKING: Show auth screen but continue with command registration
				// Commands must be available even before auth completes (for sidebar data loading)
				authChatView.showAndWait().then((success) => {
					if (!success) {
						console.log('[TARX] Auth cancelled or failed - extension will require auth on use');
						isAuthenticatedSession = false;
					} else {
						console.log('[TARX] Auth successful - TARX unlocked');
						isAuthenticatedSession = true;
						sidebarProvider?.setLocked(false);
					}
				}).catch((err) => {
					console.error('[TARX] Auth error:', err);
					isAuthenticatedSession = false;
				});
				// Continue immediately without waiting for auth
				console.log('[TARX] Continuing with command registration while auth is pending...');
			} else {
				authStateManager.setState('unlocked');
				isAuthenticatedSession = true;
				console.log('[TARX] Skipping startup auth (configured:', isConfigured, ', requireOnStartup:', requireOnStartup, ')');
			}
		}
	} catch (authErr) {
		console.error('[TARX CRASH-GUARD] Auth init failed — continuing without auth:', authErr);
		isAuthenticatedSession = true; // Allow access if auth system itself is broken
	}

	console.log('[TARX] Continuing extension initialization...');

	// Execute first-run onboarding flow (non-blocking)
	executeFirstRunFlow(context).catch(err => {
		console.error('[TARX] First-run flow error:', err);
	});

	// ═══ CRASH-GUARD: Core services init ═══
	const config = vscode.workspace.getConfiguration('tarx');
	const serverUrl = config.get<string>('serverUrl', 'http://localhost:11435');
	const ragUrl = config.get<string>('ragUrl', 'http://localhost:11437');
	let tarxClient: TarxClient;

	try {
		tarxClient = new TarxClient(serverUrl);
		ragClient = new RagClient(ragUrl);
		console.log('[TARX] Client + RAG initialized');
	} catch (clientErr) {
		console.error('[TARX CRASH-GUARD] Client/RAG init failed:', clientErr);
		tarxClient = new TarxClient(serverUrl); // Fallback — TarxClient constructor shouldn't throw
	}

	try {
		healthService = new HealthService(tarxClient);
		healthService.startPolling();
		context.subscriptions.push(healthService);
		healthService.onStatusChange((status) => {
			console.log(`[TARX] Connection status: ${status.status}`);
			if (sidebarProvider) {
				sidebarProvider.setConnectionStatus(status.status);
			}
		});
		console.log('[TARX] Health service started');
	} catch (healthErr) {
		console.error('[TARX CRASH-GUARD] Health service init failed:', healthErr);
	}

	try {
		const testHarness = new TestHarnessService(healthService!, tarxClient);
		testHarness.start();
		context.subscriptions.push(testHarness);
		console.log('[TARX] Test harness started on port 11439');
	} catch (harnessErr) {
		console.error('[TARX CRASH-GUARD] Test harness init failed:', harnessErr);
	}

	// ═══ CRASH-GUARD: Database init ═══
	try {
		const sharedTarxPath = path.join(os.homedir(), 'Library/Application Support/tarx');
		if (!fs.existsSync(sharedTarxPath)) {
			fs.mkdirSync(sharedTarxPath, { recursive: true });
		}
		db = new SqliteDatabase(sharedTarxPath);
		console.log('[TARX] Database initialized at:', sharedTarxPath);
	} catch (dbErr) {
		console.error('[TARX CRASH-GUARD] Database init failed:', dbErr);
	}

	// Initialize chat input integration for file upload/drop
	const outputChannel = vscode.window.createOutputChannel('TARX');
	if (db) {
		const chatInputIntegration = registerChatInputIntegration(context, db, outputChannel);
		console.log('[TARX] Chat input integration registered (upload button + drag-and-drop)');
	} else {
		console.warn('[TARX CRASH-GUARD] Skipping chat input integration — DB unavailable');
	}

	// Initialize project indexer
	if (db) {
		projectIndexer = new ProjectIndexer(db, ragClient!);
	} else {
		console.warn('[TARX CRASH-GUARD] Skipping project indexer — DB unavailable');
	}

	// Subscribe to indexing progress
	projectIndexer?.onProgress((progress) => {
		const percent = progress.totalFiles > 0
			? (progress.filesIndexed / progress.totalFiles) * 100
			: 0;

		if (progress.status === 'scanning') {
			vscode.commands.executeCommand('tarx.showUploadProgress',
				`Scanning files...`,
				10
			);
		} else if (progress.status === 'indexing' || progress.status === 'embedding') {
			const currentFile = progress.currentFile
				? progress.currentFile.split('/').pop() || 'files'
				: 'files';
			vscode.commands.executeCommand('tarx.showUploadProgress',
				`Indexing ${currentFile}...`,
				percent
			);
			vscode.window.setStatusBarMessage(
				`TARX: Indexing ${progress.filesIndexed}/${progress.totalFiles} files...`,
				3000
			);
		} else if (progress.status === 'complete') {
			vscode.commands.executeCommand('tarx.hideUploadProgress');
			vscode.window.setStatusBarMessage(
				`TARX: Indexing complete (${progress.filesIndexed} files)`,
				5000
			);
		} else if (progress.status === 'error') {
			vscode.commands.executeCommand('tarx.hideUploadProgress');
		}
	});

	// Initialize sidebar provider
	sidebarProvider = registerSidebarProvider(context);
	console.log('[TARX] Sidebar provider registered');

	// Set sidebar locked state based on auth session
	sidebarProvider.setLocked(!isAuthenticatedSession);
	console.log('[TARX] Sidebar locked state:', !isAuthenticatedSession);

	// Initialize project tree provider for VS Code native tree view
	console.log('[TARX DEBUG] About to register Project Tree Provider...');
	try {
		projectTreeProvider = registerProjectTreeProvider(context);
		console.log('[TARX DEBUG] Project tree provider registered successfully');
	} catch (error) {
		console.error('[TARX DEBUG] ERROR registering Project Tree Provider:', error);
	}

	// Initialize Claude Sessions provider for browsing Claude.ai conversations
	const claudeSessionsProvider = registerClaudeSessionsProvider(context);
	console.log('[TARX] Claude Sessions provider registered');

	// Initialize MCP settings provider for server configuration
	const mcpSettingsProvider = registerMcpSettingsProvider(context);
	console.log('[TARX] MCP settings provider registered');

	// ═══════════════════════════════════════════════════════════════
	// WEBVIEW SIDEBAR PROVIDER - Custom React left nav
	// Provides collapsible hierarchy: Projects, Explorer, Conversations,
	// Claude Sessions, Context Files, Agents
	// ═══════════════════════════════════════════════════════════════
	try {
		console.log('[TARX] Registering webview sidebar provider...');
		webviewSidebarProvider = new TarxSidebarWebviewProvider(context.extensionUri);
		context.subscriptions.push(
			vscode.window.registerWebviewViewProvider(
				TarxSidebarWebviewProvider.viewType,
				webviewSidebarProvider,
				{
					webviewOptions: {
						retainContextWhenHidden: true
					}
				}
			)
		);
		console.log('[TARX] Webview sidebar provider registered - custom React left nav ready');

		// Force the TARX sidebar to show instead of Explorer
		setTimeout(async () => {
			try {
				console.log('[TARX] Forcing TARX sidebar to show...');
				// Show the activity bar first
				await vscode.commands.executeCommand('workbench.action.activityBarLocation.default');
				// Focus the TARX sidebar container
				await vscode.commands.executeCommand('workbench.view.extension.tarx-sidebar');
				console.log('[TARX] TARX sidebar forced to show - custom React nav should be visible');
			} catch (e) {
				console.log('[TARX] Could not auto-show sidebar:', e);
			}
		}, 500);
	} catch (err) {
		const errMsg = err instanceof Error ? err.stack || err.message : String(err);
		console.error('[TARX CRASH-GUARD] Failed to register webview sidebar provider:', errMsg);
	}

	// Register refresh command for webview sidebar
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.sidebarWebview.refresh', () => {
			webviewSidebarProvider?.refresh();
		})
	);

	// Sync project tree provider with active project when it changes
	if (projectTreeProvider) {
		const currentProject = projectTreeProvider.getCurrentProject();
		if (currentProject && db) {
			// Sync with database
			db.getProject(currentProject.id).then(dbProject => {
				if (!dbProject) {
					// Project exists in workspace state but not DB - create it
					db?.createProject({
						name: currentProject.name,
						root: currentProject.path,
						type: currentProject.type || 'general',
						isActive: true
					}).then(newProject => {
						activeProject = newProject;
						console.log('[TARX] Synced workspace project to database:', newProject.id);
					}).catch(e => console.warn('[TARX] Failed to sync project:', e));
				} else {
					// Validate the database project has a valid root path
					const uuidCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
					if (dbProject.root && !uuidCheck.test(dbProject.root) && fs.existsSync(dbProject.root)) {
						activeProject = dbProject;
					} else {
						console.warn('[TARX] Database project has invalid root path, skipping:', dbProject.root);
					}
				}
			}).catch(e => console.warn('[TARX] Project sync error:', e));
		}
	}

	// ========================================
	// SYNC SQLite PROJECTS → WORKSPACE STATE
	// This ensures DB projects appear in Projects sidebar
	// ========================================
	async function syncProjectsFromDB() {
		if (!db || !projectTreeProvider) {
			console.log('[TARX] syncProjectsFromDB: db or projectTreeProvider not available');
			return;
		}

		try {
			const dbProjects = await db.listProjects();
			console.log(`[TARX] syncProjectsFromDB: Found ${dbProjects.length} projects in SQLite`);

			if (dbProjects.length === 0) {
				console.log('[TARX] syncProjectsFromDB: No projects in DB to sync');
				return;
			}

			let syncedCount = 0;
			for (const dbProject of dbProjects) {
				// Validate path exists and is not a UUID
				const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
				if (!dbProject.root || uuidPattern.test(dbProject.root)) {
					console.log(`[TARX] syncProjectsFromDB: Skipping invalid root: ${dbProject.root}`);
					continue;
				}
				if (!fs.existsSync(dbProject.root)) {
					console.log(`[TARX] syncProjectsFromDB: Path doesn't exist: ${dbProject.root}`);
					continue;
				}

				// Convert DB project to ProjectData format for tree provider
				const projectData = {
					id: dbProject.id,
					name: dbProject.name,
					path: dbProject.root,
					type: dbProject.type || 'general',
					createdAt: dbProject.createdAt,
					updatedAt: dbProject.createdAt,
					instructions: undefined,
					fileCount: 0
				};

				// Add to tree provider (this also updates workspaceState)
				projectTreeProvider.addProject(projectData);
				syncedCount++;

				// Set as current if it's active in DB
				if (dbProject.isActive) {
					projectTreeProvider.setCurrentProject(projectData);
					console.log(`[TARX] syncProjectsFromDB: Set active project: ${dbProject.name}`);
				}
			}

			console.log(`[TARX] syncProjectsFromDB: Synced ${syncedCount} projects from DB to sidebar`);
			projectTreeProvider.refresh();
		} catch (e) {
			console.error('[TARX] syncProjectsFromDB error:', e);
		}
	}

	// Run initial sync after short delay to ensure everything is initialized
	setTimeout(async () => {
		await syncProjectsFromDB();
	}, 1000);

	// Register overnight UI test commands
	registerOvernightTestCommands(context);
	console.log('[TARX] Overnight test commands registered');

	// Register conversational test harness
	registerConversationalTestCommands(context);
	console.log('[TARX] Conversational test commands registered');

	// Register Project Context Panel commands
	console.log('[TARX DEBUG] About to register Project Context Panel commands...');
	try {
		registerProjectContextCommands(context);
		console.log('[TARX DEBUG] Project context panel commands registered successfully');
	} catch (error) {
		console.error('[TARX DEBUG] ERROR registering Project Context Panel commands:', error);
	}

	// Register Session Panel commands (live polling webview)
	registerSessionPanelCommands(context);
	console.log('[TARX] Session panel commands registered');

	// Register color-coded project commands (Shadcn-style)
	registerColorCommands(context);
	console.log('[TARX] Color commands registered');

	// Register sidebar interaction commands (history click, file context)
	registerInteractionCommands(context);
	console.log('[TARX] Interaction commands registered');

	// Register context files provider (shows files added to chat context)
	const contextFilesProvider = registerContextFilesProvider(context);
	console.log('[TARX] Context files provider registered');

	// Register Grok-style expandable sidebar sections (Instructions, Files, Conversations, Memory)
	registerSectionsSidebar(context);
	console.log('[TARX] Sections sidebar registered with neon accents');

	// Register full UX sidebar (icons, hover, collapsible, history click, file inject)
	registerSidebarFullUX(context);
	console.log('[TARX] Sidebar Full UX registered');

	// Register Claude worker commands (hive polling, autonomous tasks)
	registerClaudeWorkerCommands(context);
	console.log('[TARX] Claude worker commands registered');

	// Register Claude Bridge (stateless reasoning architecture)
	registerClaudeBridgeCommands(context);
	console.log('[TARX] Claude Bridge commands registered');

	// TARX Bridge Integration - Feb 2026: Register bridge test commands
	registerBridgeTestCommands(context);
	console.log('[TARX] Bridge test commands registered');

	// Flag: set to true once history commands are registered (prevents HostProvider race condition)
	let historyCommandsReady = false;

	// Load conversation history into sidebar from BOTH:
	// 1. memory.db sessions table (MCP/Claude sessions)
	// 2. conversations table (TARX native chats)
	async function loadSidebarHistory() {
		try {
			// Guard: wait for commands to be registered (fixes Sentry NODE-A: HostProvider not setup)
			if (!historyCommandsReady) {
				console.log('[TARX] loadSidebarHistory: commands not yet registered, skipping');
				return;
			}

			const allConversations: Array<{
				id: string;
				title: string;
				timestamp: number;
				source: 'claude' | 'tarx' | 'mcp' | 'test';
				spaceId?: string;
				spaceName?: string;
			}> = [];

			// 1. Load MCP sessions from sessions table
			const sessionResult = await vscode.commands.executeCommand('tarx.getSessionHistory', 50) as {
				sessions: Array<{
					id: string;
					title: string;
					updatedAt: number;
					spaceId: string;
					spaceName: string;
					model: string | null;
					messageCount: number;
				}>;
			} | undefined;

			if (sessionResult?.sessions && Array.isArray(sessionResult.sessions)) {
				console.log(`[TARX] Loaded ${sessionResult.sessions.length} sessions from memory.db`);

				for (const session of sessionResult.sessions) {
					// Clean up title - remove redundant date/time patterns
					let cleanTitle = session.title || 'Untitled';
					cleanTitle = cleanTitle.replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?/gi, '').trim();
					if (!cleanTitle || cleanTitle === 'Claude') {
						cleanTitle = session.spaceName || 'Untitled';
					}

					// Determine source for icon selection
					const titleLower = (session.title || '').toLowerCase();
					const spaceNameLower = (session.spaceName || '').toLowerCase();
					let source: 'claude' | 'tarx' | 'mcp' | 'test' = 'tarx';

					if (session.model === 'claude' || titleLower.includes('claude') || spaceNameLower.includes('claude')) {
						source = 'claude';
					} else if (titleLower.includes('test') || spaceNameLower.includes('test')) {
						source = 'test';
					} else if (titleLower.includes('mcp') || spaceNameLower.includes('memory')) {
						source = 'mcp';
					}

					allConversations.push({
						id: session.id,
						title: cleanTitle,
						timestamp: session.updatedAt,
						source: source,
						spaceId: session.spaceId,
						spaceName: session.spaceName || 'Unnamed Space'
					});
				}
			}

			// 2. Load TARX native conversations from conversations table
			const convResult = await vscode.commands.executeCommand('tarx.getConversationHistory', 50) as {
				conversations: Array<{
					id: string;
					title: string;
					timestamp: number;
					type: string;
				}>;
			} | undefined;

			if (convResult?.conversations && Array.isArray(convResult.conversations)) {
				console.log(`[TARX] Loaded ${convResult.conversations.length} native conversations`);

				for (const conv of convResult.conversations) {
					// Avoid duplicates (same ID from different sources)
					if (!allConversations.find(c => c.id === conv.id)) {
						allConversations.push({
							id: conv.id,
							title: conv.title || 'Untitled',
							timestamp: conv.timestamp,
							source: 'tarx'  // Native TARX conversations
						});
					}
				}
			}

			// Sort by timestamp (most recent first)
			allConversations.sort((a, b) => b.timestamp - a.timestamp);

			console.log(`[TARX] Total conversations for sidebar: ${allConversations.length}`);

			// Update sidebar
			if (sidebarProvider) {
				sidebarProvider.setConversations(allConversations);
			}

		} catch (error) {
			console.error('[TARX] Error loading sidebar history:', error);
		}
	}

	// Load history after a short delay (ensure commands are registered)
	// Ensure Claude.ai Sessions space exists on startup
	async function ensureClaudeAISpace() {
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(mcpDbPath)) {
				// Create directory if needed
				const mcpDbDir = path.dirname(mcpDbPath);
				if (!fs.existsSync(mcpDbDir)) {
					fs.mkdirSync(mcpDbDir, { recursive: true });
				}
				console.log('[TARX] MCP database not found, will be created by MCP server');
				return;
			}

			// Check if Claude.ai Sessions space exists using sqlite3 CLI
			const checkQuery = "SELECT id FROM spaces WHERE name = 'Claude.ai Sessions' AND deleted_at IS NULL LIMIT 1";
			const result = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: checkQuery
			});

			const existingSpaces = JSON.parse(result || '[]') as Array<{ id: string }>;

			if (existingSpaces.length === 0) {
				const now = Date.now();
				const spaceId = crypto.randomUUID();
				execute(`INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					spaceId, 'Claude.ai Sessions', 'Conversations synced from Claude.ai', '🤖', now, now, now, 0, 0);
				console.log('[TARX] Created Claude.ai Sessions space:', spaceId);
			} else {
				console.log('[TARX] Claude.ai Sessions space already exists:', existingSpaces[0].id);
			}
		} catch (e) {
			console.warn('[TARX] Failed to ensure Claude.ai Sessions space:', e);
		}
	}

	// NOTE: Initial history load deferred until after command registration
	// (see historyCommandsReady flag below — fixes Sentry NODE-A race condition)

	// Refresh history every 30 seconds with error boundary
	const historyRefreshInterval = setInterval(async () => {
		try {
			await loadSidebarHistory();
		} catch (e) {
			// Silent degradation - don't crash on refresh failure
			console.error('[TARX] History refresh failed:', e);
		}
	}, 30000);

	// Clean up interval on deactivation
	context.subscriptions.push({
		dispose: () => clearInterval(historyRefreshInterval)
	});

	// ========================================
	// GOD-MODE: KEEP-ALIVE LOOP & SELF-HEAL
	// Polls MCP, self-heals DB/UI, logs progress
	// ========================================
	const godModeLogPath = path.join(os.homedir(), 'TARX', 'tarx-god.log');

	function godModeLog(message: string) {
		try {
			const logDir = path.dirname(godModeLogPath);
			if (!fs.existsSync(logDir)) {
				fs.mkdirSync(logDir, { recursive: true });
			}
			const timestamp = new Date().toISOString();
			fs.appendFileSync(godModeLogPath, `[${timestamp}] ${message}\n`);
		} catch (e) {
			// Silent fail for logging
		}
	}

	async function selfHealDB() {
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(mcpDbPath)) {
				godModeLog('SELF-HEAL: Database missing, waiting for creation...');
				return false;
			}

			// Check if sessions table has data
			const result = execSync(`sqlite3 "${mcpDbPath}" "SELECT COUNT(*) FROM sessions"`, {
				encoding: 'utf8'
			}).trim();

			const sessionCount = parseInt(result, 10);
			if (sessionCount === 0) {
				godModeLog('SELF-HEAL: Sessions empty, re-seeding...');
				// Re-seed with minimal data
				const now = Date.now();
				const seedSQL = `
					INSERT OR IGNORE INTO spaces (id, name, emoji, created_at, updated_at)
					VALUES ('space-default', 'TARX Workspace', '🚀', ${now}, ${now});
					INSERT OR IGNORE INTO sessions (id, title, space_id, model, created_at, updated_at)
					VALUES ('session-init', 'Welcome to TARX', 'space-default', 'tarx', ${now}, ${now});
				`;
				execSync(`sqlite3 "${mcpDbPath}"`, { input: seedSQL, encoding: 'utf8' });
				godModeLog('SELF-HEAL: Re-seeded sessions table');
				return true;
			}
			return false;
		} catch (e) {
			godModeLog(`SELF-HEAL ERROR: ${e instanceof Error ? e.message : 'Unknown'}`);
			return false;
		}
	}

	// Keep-alive loop - runs every 60 seconds
	const keepAliveInterval = setInterval(async () => {
		try {
			godModeLog('KEEP-ALIVE: Tick');

			// 1. Self-heal DB if empty
			const healed = await selfHealDB();
			if (healed) {
				// Refresh sidebar after heal
				await loadSidebarHistory();
				await syncProjectsFromDB();
			}

			// 2. Sync projects from DB
			await syncProjectsFromDB();

			// 3. Refresh sidebar history
			await loadSidebarHistory();

			godModeLog('KEEP-ALIVE: Complete');
		} catch (e) {
			godModeLog(`KEEP-ALIVE ERROR: ${e instanceof Error ? e.message : 'Unknown'}`);
		}
	}, 60000); // Every 60 seconds

	context.subscriptions.push({
		dispose: () => {
			clearInterval(keepAliveInterval);
			godModeLog('KEEP-ALIVE: Disposed');
		}
	});

	godModeLog('GOD-MODE: Initialized - keep-alive active');

	// Register manual refresh command
	safeRegisterCommand(context, 'tarx.refreshSidebarHistory', () => {
		loadSidebarHistory();
	});

	// Auto-index workspace folders on startup
	initializeWorkspace(context);

	// Track context files
	const contextFiles: vscode.Uri[] = [];

	// ========================================
	// 1. Register Chat Participant (@tarx)
	// ========================================
	const chatParticipant = vscode.chat.createChatParticipant('tarx.chat', async (request, chatContext, response, token) => {
		const chatT0 = Date.now();
		console.log(`[TARX PERF] Chat participant START`);

		// Auth guard - ensure user is authenticated before processing
		const authenticated = await ensureAuthenticated();
		if (!authenticated) {
			response.markdown('🔒 **TARX is locked.** Please authenticate to continue.\n\nUse the command `TARX: Unlock` or close and reopen the authentication panel.');
			return;
		}
		console.log(`[TARX PERF] Auth check: +${Date.now() - chatT0}ms`);

		const prompt = request.prompt;
		const command = request.command;

		// Build message history from context
		// CRITICAL: Messages must be in order: [system, user, assistant, user, assistant, ..., user]
		let messages: ChatMessage[] = [];
		let dbHistoryLoaded = false; // Track if we loaded from DB to avoid duplication

		// Get or create conversation for history persistence
		const projectId = activeProject?.id || null;
		let recentTurns: ConversationTurn[] = [];

		if (db) {
			try {
				// Get or create active conversation
				if (!activeConversation || activeConversation.projectId !== projectId) {
					activeConversation = await db.getRecentConversation(projectId) || undefined;
					if (!activeConversation) {
						activeConversation = await db.createConversation(projectId);
						console.log('[TARX] Created new conversation:', activeConversation.id);
					}
					syncConversationToProvider();
				}

				// Check if we have pre-loaded history (from tarx.openConversation)
				const conversationId = activeConversation?.id;
				if (conversationId && conversationHistory.has(conversationId)) {
					// Use pre-loaded history from restored conversation
					recentTurns = conversationHistory.get(conversationId) || [];
					console.log(`[TARX] Using pre-loaded history: ${recentTurns.length} turns from restored conversation`);
					// Clear after first use - subsequent messages will use normal flow
					conversationHistory.delete(conversationId);
					dbHistoryLoaded = recentTurns.length > 0;
				} else if (conversationId) {
					// Normal flow: load turns for the ACTIVE conversation only
					// CRITICAL: Must scope to conversationId, not projectId,
					// otherwise turns from other conversations bleed into this one
					const allTurns = await db.getConversationTurns(conversationId);
					recentTurns = allTurns.slice(-MAX_HISTORY_TURNS);
					if (recentTurns.length > 0) {
						console.log(`[TARX] Loaded ${recentTurns.length} turns for conversation ${conversationId}`);
						dbHistoryLoaded = true;
					}
				}
			} catch (e) {
				console.warn('[TARX] Failed to load conversation history:', e);
			}
		}

		console.log(`[TARX PERF] History loaded: +${Date.now() - chatT0}ms`);

		// Get active editor for context
		const activeEditor = vscode.window.activeTextEditor;
		const activeFilePath = activeEditor?.document.uri.fsPath;

		// Get project root
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const projectRoot = activeProject?.root || workspaceFolder?.uri.fsPath;

		// ========================================
		// CONTEXT INJECTION (FIX: Use dynamic prompt)
		// ========================================

		// 1. Load project instructions from .tarx/instructions.md
		let projectInstructions: string | undefined;
		if (projectRoot) {
			projectInstructions = await loadProjectInstructions(projectRoot);
			// DEBUG: Log project context
			if (projectInstructions) {
				console.log(`[TARX] Project instructions loaded (${projectInstructions.length} chars): "${projectInstructions.substring(0, 100)}..."`);
			} else {
				console.log('[TARX] No project instructions found');
			}
		}

		// 2. Load RAG context — PERF: only when file refs exist or MCP knowledge is available
		let loadedContext: Awaited<ReturnType<typeof loadContext>> | null = null;
		let fileRefs: ReturnType<typeof parseFileReferences> = [];
		if (projectRoot && activeProject && db && ragClient) {
			try {
				// Get project files for reference parsing
				const projectFiles = await db.getProjectFiles(activeProject.id);

				// Parse file references from the prompt
				fileRefs = parseFileReferences(prompt, projectRoot, activeFilePath, projectFiles);

				if (fileRefs.length > 0) {
					console.log(`[TARX] Found ${fileRefs.length} file references:`, fileRefs.map(r => r.path));
				}

				// PERF: Only load full RAG context (which embeds the query — GPU-intensive)
				// when there are file references or uploaded knowledge files.
				// This avoids GPU contention with the inference server on every message.
				const knowledgeCount = await getMCPKnowledgeCount();
				if (fileRefs.length > 0 || knowledgeCount > 0) {
					response.progress('Loading context...');
					loadedContext = await loadContext(
						fileRefs,
						projectRoot,
						activeProject.id,
						db,
						ragClient,
						prompt,
						4000 // Max tokens for context
					);
					console.log(`[TARX PERF] RAG context loaded: +${Date.now() - chatT0}ms (${loadedContext.files.length} files, ${loadedContext.chunks.length} chunks)`);
				} else {
					console.log(`[TARX PERF] RAG skipped (no file refs, no knowledge): +${Date.now() - chatT0}ms`);
				}
			} catch (e) {
				console.warn('[TARX] Context loading failed:', e);
			}
		}

		// 3. Build file context string from loaded context
		let fileContextStr: string | undefined;
		if (loadedContext && (loadedContext.files.length > 0 || loadedContext.chunks.length > 0)) {
			fileContextStr = buildPrompt('', loadedContext, '').trim();
		}

		// 4. Build dynamic system prompt with all context (FIX: Use buildTarxSystemPrompt)
		let systemPrompt = buildTarxSystemPrompt({
			projectContext: projectInstructions,
			fileContext: fileContextStr,
			// conversationSummary could be added here if needed
		});

		// Add context about conversation source if resuming a Claude conversation
		const isClaudeConversation = activeConversation?.title?.startsWith('Claude') || false;
		if (isClaudeConversation && messages.length > 0) {
			systemPrompt += '\n\n[Context: This conversation was originally with Claude. You are continuing where Claude left off. Maintain continuity with the previous discussion.]';
		}

		// DEBUG: Log final system prompt (first 300 + last 300 chars)
		console.log(`[TARX] System prompt built (${systemPrompt.length} chars)`);
		console.log(`[TARX] Prompt start: "${systemPrompt.substring(0, 300)}..."`);
		console.log(`[TARX] Prompt end: "...${systemPrompt.substring(systemPrompt.length - 300)}"`);

		// CRITICAL FIX: System prompt must be FIRST for context window management to work correctly
		messages.push({
			role: 'system',
			content: systemPrompt
		});

		// Add conversation history AFTER system prompt
		// Priority: Use DB history if available (persists across sessions), otherwise VS Code context
		if (dbHistoryLoaded && recentTurns.length > 0) {
			// Use persisted DB history (includes previous sessions)
			for (const turn of recentTurns) {
				if (turn.role !== 'system') {
					messages.push({
						role: turn.role as 'user' | 'assistant',
						content: turn.content
					});
				}
			}
			console.log(`[TARX] Added ${recentTurns.length} turns from DB to messages (after system prompt)`);
		} else if (chatContext.history.length > 0) {
			// Fallback: Use VS Code in-session context if DB not available
			for (const turn of chatContext.history) {
				if (turn instanceof vscode.ChatRequestTurn) {
					messages.push({ role: 'user', content: turn.prompt });
				} else if (turn instanceof vscode.ChatResponseTurn) {
					// Extract text from response parts
					const responseText = turn.response
						.map(part => {
							if (part instanceof vscode.ChatResponseMarkdownPart) {
								return part.value.value;
							}
							return '';
						})
						.join('');
					if (responseText) {
						messages.push({ role: 'assistant', content: responseText });
					}
				}
			}
			console.log(`[TARX] Added ${chatContext.history.length} turns from VS Code context (DB empty)`);
		}

		// Normalize transcription (handles voice input)
		const normalizedPrompt = normalizeTranscription(prompt);

		// Check for vague requests and ask for clarification
		if (!command && isVagueRequest(normalizedPrompt)) {
			const clarification = getClarificationForVagueRequest(normalizedPrompt);
			response.markdown(clarification);
			return { metadata: { command: 'clarification' } };
		}

		// TARX Skills Bridge - Check skills registry FIRST (Feb 2026)
		// This allows custom skills/agents to intercept messages before direct execution
		console.log(`[TARX PERF] Pre-skills check: +${Date.now() - chatT0}ms`);
		const skillsResult = await checkSkillsFirst(normalizedPrompt);
		console.log(`[TARX PERF] Skills check done: +${Date.now() - chatT0}ms`);
		if (skillsResult.handled && skillsResult.result) {
			console.log('[TARX] Skills bridge handled the message');
			response.markdown(skillsResult.result);

			// Store in conversation history
			if (db && activeConversation) {
				try {
					await db.addConversationTurn({
						conversationId: activeConversation.id,
						role: 'user',
						content: normalizedPrompt,
						fileRefs: [],
						artifacts: null
					});
					await db.addConversationTurn({
						conversationId: activeConversation.id,
						role: 'assistant',
						content: skillsResult.result,
						fileRefs: [],
						artifacts: null
					});
					console.log('[TARX] Saved skills execution to history');
				} catch (e) {
					console.error('[TARX] Failed to store skills execution:', e);
				}
			}

			return { metadata: { command: 'skills_executed' } };
		}
		console.log('[TARX] No skill match, continuing to direct action detection');

		// TARX Bridge Integration - Feb 2026: Direct Action Execution
		// First try direct execution for CRUD operations, fall back to Claude for complex reasoning
		const hasActionIntent = detectActionIntent(normalizedPrompt);
		const bridgeStatus = await getBridgeStatus();
		console.log(`[TARX PERF] Bridge check done: +${Date.now() - chatT0}ms (intent=${hasActionIntent}, bridge=${bridgeStatus})`);

		if (hasActionIntent) {
			console.log('[TARX Bridge] Action intent detected, trying direct execution first');
			response.progress('Processing action...');

			// Path A: Try direct MCP execution (no Claude needed for CRUD)
			console.log('[TARX Bridge] Calling handleActionIntent...');
			const actionResult = await handleActionIntent(normalizedPrompt);
			console.log(`[TARX Bridge] handleActionIntent result: success=${actionResult.success}, action=${actionResult.action}`);

			if (actionResult.success) {
				// Direct execution succeeded - show REAL result
				console.log(`[TARX] Direct action executed: ${actionResult.action}`);
				response.markdown(actionResult.result);

				// Refresh sidebar to show new data
				try {
					await vscode.commands.executeCommand('tarx.sidebar.refresh');
				} catch (e) {
					// Silent - sidebar refresh is non-critical
				}

				// Store the exchange in conversation history
				if (db && activeConversation) {
					try {
						await db.addConversationTurn({
							conversationId: activeConversation.id,
							role: 'user',
							content: normalizedPrompt,
							fileRefs: [],
							artifacts: null
						});
						await db.addConversationTurn({
							conversationId: activeConversation.id,
							role: 'assistant',
							content: actionResult.result,
							fileRefs: [],
							artifacts: null
						});
						console.log('[TARX] Saved direct action exchange to history');
					} catch (e) {
						console.error('[TARX] Failed to store action exchange:', e);
					}
				}

				return { metadata: { command, routed: 'direct_action', action: actionResult.action } };
			}

			// Path B: Action not recognized - use Claude bridge for complex reasoning
			if (bridgeStatus === 'active') {
				console.log('[TARX] Action not recognized, routing through Claude bridge for reasoning');
				response.progress('Routing through TARX Bridge...');

				try {
					const payload = await buildPayload({
						type: 'reason',
						query: normalizedPrompt,
						session_id: activeConversation?.id || `session-${Date.now()}`,
						project_id: activeProject?.id || 'default'
					});

					response.progress('Invoking Claude...');
					const bridgeResponse = await invokeClaudeWithPayload(payload, 'cli');

					// Display response
					response.markdown(bridgeResponse.response);

					// Execute next steps
					if (bridgeResponse.next_steps.length > 0) {
						response.progress('Executing actions...');
						await executeNextSteps(context, bridgeResponse.next_steps);
						response.markdown(`\n\n---\n*${bridgeResponse.next_steps.length} action(s) executed via TARX Bridge*`);
					}

					// Store the exchange in conversation history
					if (db && activeConversation) {
						try {
							await db.addConversationTurn({
								conversationId: activeConversation.id,
								role: 'user',
								content: normalizedPrompt,
								fileRefs: [],
								artifacts: null
							});
							await db.addConversationTurn({
								conversationId: activeConversation.id,
								role: 'assistant',
								content: bridgeResponse.response,
								fileRefs: [],
								artifacts: null
							});
							console.log('[TARX] Saved bridge conversation turns to history');
						} catch (e) {
							console.error('[TARX] Failed to store bridge exchange:', e);
						}
					}

					return { metadata: { command, routed: 'bridge' } };

				} catch (e) {
					console.error('[TARX] Bridge invocation failed:', e);
					response.markdown(`**Bridge Error:** ${e}\n\nFalling back to local reasoning...\n\n---\n\n`);
					// Fall through to local model
				}

			} else if (bridgeStatus === 'local_only') {
				// Local model only - explain limitations
				const statusDisplay = getBridgeStatusDisplay(bridgeStatus);
				console.log('[TARX] Action intent detected but bridge not available, using local reasoning');
				response.markdown(`*${statusDisplay.icon} ${statusDisplay.text}*\n\n`);
			}

			// CRITICAL: When action intent was detected but NOT executed (direct or bridge),
			// we MUST add the local reasoning constraint to prevent Qwen from faking execution
			if (!actionResult.success) {
				console.log('[TARX] Adding local reasoning constraint - action not executed');
				// Find and update the system message with reasoning-only constraint
				const systemMsgIndex = messages.findIndex(m => m.role === 'system');
				if (systemMsgIndex >= 0) {
					messages[systemMsgIndex].content += '\n\n' + TARX_LOCAL_REASONING_PROMPT;
				} else {
					messages.unshift({ role: 'system', content: TARX_LOCAL_REASONING_PROMPT });
				}
			}
		}

		// Proactive problem-spotting: analyze code in the user's message
		const codeIssues = analyzeUserCode(normalizedPrompt);
		let issuesNote = '';
		if (codeIssues.length > 0) {
			// Add issues context to the system prompt for model awareness
			const highSeverityIssues = codeIssues.filter(i => i.severity === 'high');
			if (highSeverityIssues.length > 0) {
				issuesNote = formatIssuesForResponse(highSeverityIssues) || '';
				console.log(`[TARX] Detected ${highSeverityIssues.length} high-severity code issues`);
			}
		}

		// Build the user prompt based on command
		let userPrompt = normalizedPrompt;
		if (command === 'explain') {
			userPrompt = `Explain this code:\n\n${normalizedPrompt}`;
		} else if (command === 'refactor') {
			userPrompt = `Refactor this code to be cleaner and more maintainable:\n\n${normalizedPrompt}`;
		} else if (command === 'fix') {
			userPrompt = `Find and fix bugs in this code:\n\n${normalizedPrompt}`;
		} else if (command === 'tests') {
			userPrompt = `Generate comprehensive unit tests for this code:\n\n${normalizedPrompt}`;
		}

		messages.push({ role: 'user', content: userPrompt });

		// If we have pre-loaded history, show transcript first (even if server offline)
		if (dbHistoryLoaded && recentTurns.length > 0) {
			response.markdown('### Conversation Transcript\n\n');
			for (const turn of recentTurns) {
				if (turn.role === 'user') {
					response.markdown(`**You:** ${turn.content}\n\n`);
				} else if (turn.role === 'assistant') {
					response.markdown(`**TARX:** ${turn.content}\n\n`);
				}
			}
			response.markdown('---\n\n');
		}

		// Check if server is online
		if (healthService && !healthService.isOnline) {
			response.markdown('**Server offline** - llama-server is not available.\n\n');
			response.markdown('Your message has been queued and will be sent when the connection is restored.\n\n');
			response.button({
				command: 'tarx.reconnect',
				title: 'Retry Connection'
			});

			// Queue the message for when we're back online
			healthService.queueMessage(messages, { temperature: 0.7, maxTokens: 2048 });

			return { metadata: { command, queued: true } };
		}

		// Show progress
		response.progress('Thinking...');
		console.log(`[TARX PERF] Pre-router: +${Date.now() - chatT0}ms`);

		// ========================================
		// MODEL ROUTER - Route to Local or Network model
		// ========================================
		const routeDecision = routeMessage(normalizedPrompt);
		const routeIndicator = getRouteIndicator(routeDecision.route);

		console.log(`[TARX PERF] Router decided: ${routeDecision.route} +${Date.now() - chatT0}ms`);

		// Show route indicator in response (subtle)
		response.markdown(`*${routeIndicator.icon} ${routeIndicator.label}*\n\n`);

		// NETWORK MODEL PATH - Use Claude API for action-oriented tasks
		if (routeDecision.route === 'network') {
			// Check for API key
			const hasKey = await hasNetworkApiKey();
			if (!hasKey) {
				response.markdown('**Claude API key required** for this task.\n\n');
				const key = await promptForApiKey();
				if (!key) {
					response.markdown('Falling back to local model...\n\n---\n\n');
					// Continue to local model path below
				} else {
					// Retry with new key
					response.markdown('API key configured. Processing...\n\n---\n\n');
				}
			}

			// If we have a key now, use network model
			const hasKeyNow = await hasNetworkApiKey();
			if (hasKeyNow) {
				response.progress('Connecting to Claude...');

				try {
					// Build network model context
					const networkContext: NetworkModelContext = {
						cwd: projectRoot,
						files: activeFilePath ? [activeFilePath] : undefined,
						projectInstructions,
						activeFile: activeFilePath,
						selection: activeEditor?.selection && !activeEditor.selection.isEmpty
							? activeEditor.document.getText(activeEditor.selection)
							: undefined,
						history: recentTurns.map(t => ({
							role: t.role as 'user' | 'assistant',
							content: t.content
						}))
					};

					// Stream from Claude API
					let networkResponse = '';
					for await (const chunk of streamNetworkResponse(userPrompt, networkContext)) {
						if (token.isCancellationRequested) {
							break;
						}
						networkResponse += chunk;
						response.markdown(chunk);
					}

					// Parse artifacts from response
					const artifacts = parseArtifacts(networkResponse);
					if (artifacts.length > 0) {
						console.log(`[TARX] Found ${artifacts.length} code artifacts from network model`);

						for (let i = 0; i < artifacts.length; i++) {
							const artifact = artifacts[i];
							const artifactLabel = artifact.filePath
								? artifact.filePath.split('/').pop()
								: `${artifact.language || 'code'} snippet ${i + 1}`;

							response.markdown(`\n---\n**${artifactLabel}**\n`);

							response.button({
								command: 'tarx.copyArtifact',
								title: '$(copy) Copy',
								arguments: [artifact]
							});

							response.button({
								command: 'tarx.viewArtifact',
								title: '$(eye) View',
								arguments: [artifact]
							});

							if (artifact.filePath && projectRoot) {
								response.button({
									command: 'tarx.applyArtifact',
									title: `$(check) Apply to ${artifact.filePath}`,
									arguments: [artifact, projectRoot]
								});
							}
						}
					}

					// Store the exchange in conversation history
					if (db && activeConversation) {
						try {
							await db.addConversationTurn({
								conversationId: activeConversation.id,
								role: 'user',
								content: normalizedPrompt,
								fileRefs: fileRefs.map(f => f.path),
								artifacts: null
							});
							await db.addConversationTurn({
								conversationId: activeConversation.id,
								role: 'assistant',
								content: networkResponse,
								fileRefs: [],
								artifacts: artifacts.length > 0 ? JSON.stringify(artifacts) : null
							});
							console.log('[TARX] Saved network model exchange to history');
						} catch (e) {
							console.error('[TARX] Failed to store network model exchange:', e);
						}
					}

					return { metadata: { command, routed: 'network', model: 'claude' } };

				} catch (e) {
					const errMsg = e instanceof Error ? e.message : String(e);
					console.error('[TARX] Network model error:', e);
					response.markdown(`\n\n**Network model error:** ${errMsg}\n\nFalling back to local model...\n\n---\n\n`);
					// Fall through to local model
				}
			}
		}

		// LOCAL MODEL PATH - Use Qwen via llama-server

		// Context window management - ensure messages fit within 4096 token limit
		const contextUsage = getContextUsage(messages as ContextMessage[]);
		if (!contextUsage.willFit) {
			console.log(`[TARX] Context overflow: ${contextUsage.totalTokens} tokens > ${contextUsage.available} available`);
			messages = fitToContextWindow(messages as ContextMessage[], 4096, 512) as ChatMessage[];
			const newUsage = getContextUsage(messages as ContextMessage[]);
			console.log(`[TARX] After truncation: ${newUsage.totalTokens} tokens (${newUsage.utilization}% utilization)`);
		} else {
			console.log(`[TARX] Context OK: ${contextUsage.totalTokens}/${contextUsage.available} tokens (${contextUsage.utilization}%)`);
		}

		// Collect full response for artifact parsing
		let fullResponse = '';
		let fullThinking = '';

		try {
			console.log(`[TARX PERF] Inference start: +${Date.now() - chatT0}ms`);
			let chatFirstToken = true;
			// Unique ID for this thinking sequence (used by VS Code's thinking renderer)
			const thinkingId = `tarx-thinking-${Date.now()}`;

			// Stream response from llama-server
			for await (const chunk of tarxClient.chatCompletionStream(messages, {
				temperature: 0.7,
				maxTokens: 2048
			})) {
				if (token.isCancellationRequested) {
					break;
				}
				if (chatFirstToken) {
					console.log(`[TARX PERF] First token (TTFT): +${Date.now() - chatT0}ms`);
					chatFirstToken = false;
				}

				// TARX V1: Handle structured chunks for thinking token UX
				if (chunk.type === 'thinking') {
					// Accumulate thinking for potential storage/display
					fullThinking += chunk.content;
					// Stream thinking to VS Code's collapsible thinking UI
					// Cast to access proposed API method (chatParticipantAdditions)
					(response as any).thinkingProgress({ text: chunk.content, id: thinkingId });
				} else if (chunk.type === 'content') {
					// Accumulate content for artifact parsing
					fullResponse += chunk.content;
					// Stream content to markdown renderer
					response.markdown(chunk.content);
				}
			}
			console.log(`[TARX PERF] Inference complete: +${Date.now() - chatT0}ms (${fullResponse.length} chars)`);

			// Parse artifacts from response
			const artifacts = parseArtifacts(fullResponse);
			if (artifacts.length > 0) {
				console.log(`[TARX] Found ${artifacts.length} code artifacts`);

				// Add artifact action buttons (Copy, View, Insert, Apply)
				for (let i = 0; i < artifacts.length; i++) {
					const artifact = artifacts[i];
					const artifactLabel = artifact.filePath
						? artifact.filePath.split('/').pop()
						: `${artifact.language || 'code'} snippet ${i + 1}`;

					// Add a separator line before artifact actions
					response.markdown(`\n---\n**${artifactLabel}**\n`);

					// Copy to clipboard - always available
					response.button({
						command: 'tarx.copyArtifact',
						title: '$(copy) Copy',
						arguments: [artifact]
					});

					// View in new editor - always available
					response.button({
						command: 'tarx.viewArtifact',
						title: '$(eye) View',
						arguments: [artifact]
					});

					// Insert at cursor - always available
					response.button({
						command: 'tarx.insertArtifact',
						title: '$(insert) Insert',
						arguments: [artifact]
					});

					// Apply to file - only if we have a file path and project root
					if (artifact.filePath && projectRoot) {
						response.button({
							command: 'tarx.applyArtifact',
							title: `$(check) Apply to ${artifact.filePath}`,
							arguments: [artifact, projectRoot]
						});
					}
				}

				// ========================================
				// DEV MODE: AUTO-APPLY ARTIFACTS
				// Auto-applies all artifacts with file paths without user confirmation
				// ========================================
				const autoApplyEnabled = vscode.workspace.getConfiguration('tarx').get<boolean>('devMode.autoApply', false);
				if (autoApplyEnabled && projectRoot) {
					const applyableArtifacts = artifacts.filter(a => a.filePath);
					if (applyableArtifacts.length > 0) {
						response.markdown(`\n\n**Dev Mode: Auto-applying ${applyableArtifacts.length} artifacts...**\n`);
						for (const artifact of applyableArtifacts) {
							try {
								const result = await applyArtifact(artifact, projectRoot);
								if (result.success) {
									response.markdown(`$(check) ${result.message}\n`);
									console.log(`[TARX] Auto-applied: ${artifact.filePath}`);
								} else {
									response.markdown(`$(error) ${result.message}\n`);
									console.warn(`[TARX] Auto-apply failed: ${artifact.filePath} - ${result.message}`);
								}
							} catch (e) {
								const errMsg = e instanceof Error ? e.message : 'Unknown error';
								response.markdown(`$(error) Failed: ${artifact.filePath} - ${errMsg}\n`);
								console.error(`[TARX] Auto-apply error:`, e);
							}
						}
						// Trigger reload if any files were applied
						response.markdown(`\n*Reload window to see changes: \`Cmd+Shift+P → Reload Window\`*\n`);
					}
				}
			}

			// Append proactive issue detection note if we found issues
			if (issuesNote) {
				response.markdown(issuesNote);
				fullResponse += issuesNote;
			}

			// Track chat analytics
			analytics.track('chat_sent', {
				conversation_id: activeConversation?.id,
				char_count: userPrompt.length,
				response_length: fullResponse.length
			});

			// Save conversation turns to database for history persistence
			if (db && activeConversation) {
				try {
					// Save user turn
					await db.addConversationTurn({
						conversationId: activeConversation.id,
						role: 'user',
						content: userPrompt,
						fileRefs: [],
						artifacts: null
					});

					// Save assistant turn
					await db.addConversationTurn({
						conversationId: activeConversation.id,
						role: 'assistant',
						content: fullResponse,
						fileRefs: [],
						artifacts: artifacts.length > 0 ? JSON.stringify(artifacts) : null
					});

					console.log('[TARX] Saved conversation turns to history');

					// Generate title if conversation doesn't have one
					if (!activeConversation.title) {
						// Immediate fallback: use truncated user message
						const fallbackTitle = userPrompt.split('\n')[0].substring(0, 50) +
							(userPrompt.length > 50 ? '...' : '');
						await db.updateConversationTitle(activeConversation.id, fallbackTitle);
						activeConversation.title = fallbackTitle;
						console.log('[TARX] Set fallback title:', fallbackTitle);

						// Async: generate better title via LLM (don't await)
						tarxClient.chatCompletion([
							{
								role: 'system',
								content: 'Generate a very short title (3-6 words max) for this chat. Reply with ONLY the title, no quotes or punctuation.'
							},
							{ role: 'user', content: userPrompt }
						], { maxTokens: 20, temperature: 0.3 }).then(async (titleResponse) => {
							const betterTitle = titleResponse.choices?.[0]?.message?.content?.trim();
							if (betterTitle && betterTitle.length > 0 && betterTitle.length < 60 && db && activeConversation) {
								await db.updateConversationTitle(activeConversation.id, betterTitle);
								activeConversation.title = betterTitle;
								console.log('[TARX] Updated to LLM title:', betterTitle);

								// Refresh sidebar with new title - then reload full history
								loadSidebarHistory();
							}
						}).catch((e) => {
							console.log('[TARX] LLM title generation failed:', e);
						});
					}

					// Update sidebar with latest conversations from both tables
					loadSidebarHistory();
				} catch (e) {
					console.warn('[TARX] Failed to save conversation turns:', e);
				}
			}
		} catch (error: unknown) {
			// Check for cancellation - user stopped the request, not an error
			if (token.isCancellationRequested) {
				console.log('[TARX] Chat request canceled by user');
				return { metadata: { command, canceled: true } };
			}

			// Check for CancellationError explicitly
			const err = error as { status?: number; code?: string; message?: string; name?: string };
			if (err.name === 'CancellationError' || err.message === 'Canceled') {
				console.log('[TARX] Chat request canceled');
				return { metadata: { command, canceled: true } };
			}

			// Enhanced error handling with specific error types
			const errorMessage = err.message || 'Unknown error';

			if (err.status === 429) {
				// Rate limited
				response.markdown('\n\n**Rate limited** - Please wait a moment and try again.');
			} else if (err.status === 401 || err.status === 403) {
				// Auth error
				response.markdown('\n\n**Authentication error** - Please check your API configuration in settings.');
			} else if (err.code === 'ECONNREFUSED') {
				// Server not running
				response.markdown('\n\n**Connection refused** - Make sure llama-server is running on port 11435.\n\nStart it with: `llama-server -m <model.gguf> --port 11435`');
			} else if (err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
				// Network error
				response.markdown('\n\n**Connection failed** - Check your network connection and try again.');
			} else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
				// Request timeout
				response.markdown('\n\n**Request timed out** - The server took too long to respond. Try a shorter prompt or check server status.');
			} else {
				// Generic error
				response.markdown(`\n\n**Error:** ${errorMessage}\n\nMake sure llama-server is running on port 11435.`);
			}

			console.error('[TARX] Chat error:', error);
			analytics.trackError(error as Error, { context: 'chat_completion' });

			// Don't save failed turns, but keep conversation active for retry
			return { metadata: { command, error: true } };
		}

		return { metadata: { command } };
	});

	chatParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'tarx-eyes.png');

	// Set title provider to generate chat session titles (proposed API)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(chatParticipant as any).titleProvider = {
		provideChatTitle: async (context: vscode.ChatContext, token: vscode.CancellationToken): Promise<string | undefined> => {
			// Get the first user message to generate a title
			const firstRequest = context.history.find((turn: vscode.ChatRequestTurn | vscode.ChatResponseTurn) => turn instanceof vscode.ChatRequestTurn);
			if (!firstRequest || !(firstRequest instanceof vscode.ChatRequestTurn)) {
				return undefined;
			}

			const userMessage = firstRequest.prompt;
			if (!userMessage) {
				return undefined;
			}

			try {
				// Ask the model to generate a short title
				const titleResponse = await tarxClient.chatCompletion([
					{
						role: 'system',
						content: 'Generate a very short title (3-6 words max) for this chat conversation. Reply with ONLY the title, no quotes or punctuation.'
					},
					{
						role: 'user',
						content: userMessage
					}
				], {
					maxTokens: 20,
					temperature: 0.3
				});

				const title = titleResponse.choices?.[0]?.message?.content?.trim();
				if (title && title.length > 0 && title.length < 100) {
					console.log('[TARX] Generated chat title:', title);
					return title;
				}
			} catch (error) {
				console.log('[TARX] Failed to generate title:', error);
			}

			// Fallback: use first 50 chars of user message
			return userMessage.substring(0, 50).split('\n')[0];
		}
	};

	context.subscriptions.push(chatParticipant);
	console.log('[TARX] Chat participant @tarx registered');

	// ========================================
	// 1b. Register Language Model Provider
	// ========================================
	languageModelProvider = new TarxLanguageModelProvider(serverUrl);
	// Wire DB for conversation history persistence in the VS Code chat panel path
	if (db) {
		languageModelProvider.setDatabase(db);
	}
	try {
		const lmDisposable = vscode.lm.registerLanguageModelChatProvider('tarx', languageModelProvider);
		context.subscriptions.push(lmDisposable);
		console.log('[TARX] Language model provider registered');
	} catch (error) {
		console.log('[TARX] Language model provider registration failed (API may not be available):', error);
	}

	// ========================================
	// 1c. Register Speech Provider (Voice) - DISABLED FOR V1
	// ========================================
	// registerSpeechProvider(context);
	console.log('[TARX] Voice/Speech disabled for V1 release');

	// ========================================
	// 1d. Initialize Proactive System (Phase 6) - DISABLED FOR V1
	// ========================================
	proactiveSystem = getProactiveSystem();
	// const proactiveVoice = getProactiveVoiceInterface(); // DISABLED FOR V1
	const contextObserver = getContextObserver();

	// Wire proactive voice events to UI - DISABLED FOR V1
	// proactiveVoice.on('proposal', (action) => {
	// 	console.log('[TARX] Proactive proposal:', action.voiceProposal);
	// 	vscode.commands.executeCommand('tarx.proactive.showProposal', action);
	// });
	// proactiveVoice.on('response', ({ action, response, result }) => {
	// 	console.log('[TARX] Proactive response:', response.classified, result.message);
	// });
	// proactiveVoice.on('speak', (text) => {
	// 	console.log('[TARX] Proactive speak:', text);
	// });
	// proactiveVoice.on('enabled', () => {
	// 	analytics.track('proactive_enabled');
	// });
	// proactiveVoice.on('disabled', () => {
	// 	analytics.track('proactive_disabled');
	// });

	console.log('[TARX] Proactive system initialized (voice disabled for V1)');

	// ========================================
	// 2. Register Inline Completions
	// ========================================
	const completionsEnabled = config.get<boolean>('completions.enabled', true);
	if (completionsEnabled) {
		const completionProvider = new TarxCompletionProvider(tarxClient);
		context.subscriptions.push(
			vscode.languages.registerInlineCompletionItemProvider(
				{ pattern: '**' },
				completionProvider
			)
		);
		console.log('[TARX] Inline completions enabled');
	}

	// ========================================
	// 3. Register Status Bar
	// ========================================
	statusBar = new TarxStatusBar(tarxClient);
	context.subscriptions.push(statusBar);

	// Claude Code status bar button — hidden from end users (dev-only)
	if (context.extensionMode === vscode.ExtensionMode.Development) {
		const claudeCodeStatusBar = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			99
		);
		claudeCodeStatusBar.text = '$(hubot) Claude Code';
		claudeCodeStatusBar.tooltip = 'Open Claude Code CLI (Cmd+Shift+;)';
		claudeCodeStatusBar.command = 'tarx.spawnClaudeCode';
		claudeCodeStatusBar.show();
		context.subscriptions.push(claudeCodeStatusBar);
	}

	// ========================================
	// 4. Register Commands
	// ========================================

	// Open Chat - spawns TARX chat panel in right column (ViewColumn.Beside)
	safeRegisterCommand(context, 'tarx.openChat', (prompt?: string) => {
		TarxChatPanel.createOrShow(context, prompt || undefined);
		console.log('[TARX] Chat panel opened in right column (ViewColumn.Beside)');
	});

	// Open Dashboard - spawns TARX dashboard in center editor tab
	safeRegisterCommand(context, 'tarx.openDashboard', () => {
		TarxDashboardPanel.createOrShow(context.extensionUri);
		console.log('[TARX] Dashboard opened in center tab (ViewColumn.Active)');
	});

	// Toggle Secondary Sidebar - allows toggling left sidebar via ⌥⌘B
	safeRegisterCommand(context, 'tarx.toggleSecondarySidebar', () => {
		vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
		console.log('[TARX] Toggled secondary sidebar');
	});

	// Explain Selection - sends to @tarx /explain
	safeRegisterCommand(context, 'tarx.explainSelection', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor');
			return;
		}

		const selection = editor.document.getText(editor.selection);
		if (!selection) {
			vscode.window.showWarningMessage('No text selected');
			return;
		}

		const language = editor.document.languageId;
		const code = `\`\`\`${language}\n${selection}\n\`\`\``;
		vscode.commands.executeCommand('workbench.action.chat.open', {
			query: `@tarx /explain ${code}`
		});
	});

	// Refactor Selection - sends to @tarx /refactor
	safeRegisterCommand(context, 'tarx.refactorSelection', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor');
			return;
		}

		const selection = editor.document.getText(editor.selection);
		if (!selection) {
			vscode.window.showWarningMessage('No text selected');
			return;
		}

		const language = editor.document.languageId;
		const code = `\`\`\`${language}\n${selection}\n\`\`\``;
		vscode.commands.executeCommand('workbench.action.chat.open', {
			query: `@tarx /refactor ${code}`
		});
	});

	// Generate Tests - sends to @tarx /tests
	safeRegisterCommand(context, 'tarx.generateTests', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor');
			return;
		}

		const selection = editor.document.getText(editor.selection);
		if (!selection) {
			vscode.window.showWarningMessage('No text selected');
			return;
		}

		const language = editor.document.languageId;
		const code = `\`\`\`${language}\n${selection}\n\`\`\``;
		vscode.commands.executeCommand('workbench.action.chat.open', {
			query: `@tarx /tests ${code}`
		});
	});

	// Fix Code - sends to @tarx /fix
	safeRegisterCommand(context, 'tarx.fixCode', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor');
			return;
		}

		const selection = editor.document.getText(editor.selection);
		if (!selection) {
			vscode.window.showWarningMessage('No text selected');
			return;
		}

		const language = editor.document.languageId;
		const code = `\`\`\`${language}\n${selection}\n\`\`\``;
		vscode.commands.executeCommand('workbench.action.chat.open', {
			query: `@tarx /fix ${code}`
		});
	});

	// Spawn Claude Code - Interactive CLI
	safeRegisterCommand(context, 'tarx.spawnClaudeCode', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		// TARX app root: where .mcp.json and extensions/ live
		const tarxAppRoot = path.resolve(context.extensionPath, '..', '..');
		const mcpConfigPath = path.join(tarxAppRoot, '.mcp.json');
		const hasMcpConfig = fs.existsSync(mcpConfigPath);
		const cwd = hasMcpConfig ? tarxAppRoot : (workspaceFolder?.uri.fsPath || tarxAppRoot);

		// Create integrated terminal running claude CLI
		const terminal = vscode.window.createTerminal({
			name: 'Claude Code',
			cwd: cwd,
			env: {
				TARX_WORKSPACE: workspaceFolder?.uri.fsPath || '',
				TARX_APP_ROOT: tarxAppRoot
			},
			iconPath: new vscode.ThemeIcon('hubot')
		});

		terminal.show();
		terminal.sendText('claude', true);

		analytics.track('claude_code_spawned', {
			has_workspace: !!workspaceFolder,
			has_mcp_config: hasMcpConfig,
			cwd: cwd
		});
	});

	// Spawn Claude Code with Prompt - Non-interactive CLI with prompt
	safeRegisterCommand(context, 'tarx.spawnClaudeCodeWithPrompt', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		// TARX app root for .mcp.json access
		const tarxAppRoot = path.resolve(context.extensionPath, '..', '..');
		const mcpConfigPath = path.join(tarxAppRoot, '.mcp.json');
		const hasMcpConfig = fs.existsSync(mcpConfigPath);
		const cwd = hasMcpConfig ? tarxAppRoot : (workspaceFolder?.uri.fsPath || tarxAppRoot);

		// Prompt user for the task
		const prompt = await vscode.window.showInputBox({
			prompt: 'Enter a prompt for Claude Code',
			placeHolder: 'e.g., Add unit tests for the user service',
			ignoreFocusOut: true
		});

		if (!prompt) {
			return;
		}

		// Create integrated terminal running claude with the prompt
		const terminal = vscode.window.createTerminal({
			name: 'Claude Code',
			cwd: cwd,
			iconPath: new vscode.ThemeIcon('hubot')
		});

		terminal.show();
		// Escape single quotes in the prompt
		const escapedPrompt = prompt.replace(/'/g, "'\\''");
		terminal.sendText(`claude -p '${escapedPrompt}' --dangerously-skip-permissions`, true);

		analytics.track('claude_code_with_prompt_spawned', {
			has_workspace: !!workspaceFolder,
			prompt_length: prompt.length,
			cwd: cwd
		});
	});

	// Add to Context
	safeRegisterCommand(context, 'tarx.addToContext', (uri?: vscode.Uri) => {
		const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
		if (targetUri && !contextFiles.some(f => f.toString() === targetUri.toString())) {
			contextFiles.push(targetUri);
			vscode.window.showInformationMessage(`Added ${vscode.workspace.asRelativePath(targetUri)} to TARX context`);
		}
	});

	// Clear Context
	safeRegisterCommand(context, 'tarx.clearContext', () => {
		contextFiles.length = 0;
		vscode.window.showInformationMessage('TARX context cleared');
	});

	// Show Status
	safeRegisterCommand(context, 'tarx.showStatus', async () => {
		const health = await tarxClient.checkHealth();
		if (health.healthy) {
			vscode.window.showInformationMessage(
				`TARX: Connected to ${health.model || 'server'} (${health.latencyMs}ms)`
			);
		} else {
			vscode.window.showWarningMessage(
				'TARX: Not connected. Is llama-server running on port 11435?'
			);
		}
	});

	// Reconnect - Force reconnection attempt
	safeRegisterCommand(context, 'tarx.reconnect', async () => {
		if (!healthService) {
			vscode.window.showErrorMessage('Health service not initialized');
			return;
		}

		vscode.window.showInformationMessage('Attempting to reconnect...');
		const success = await healthService.forceReconnect();

		if (success) {
			vscode.window.showInformationMessage(
				`TARX: Reconnected to ${healthService.healthStatus.model || 'server'}`
			);
		} else {
			vscode.window.showWarningMessage(
				'TARX: Reconnection failed. Is llama-server running?'
			);
		}
	});

	// Test Execution - Verify real file/process execution works
	safeRegisterCommand(context, 'tarx.testExecution', async () => {
		const tarxDir = path.join(os.homedir(), 'TARX');
		const testFilePath = path.join(tarxDir, 'tarx-real-test.js');
		const externalLogPath = path.join(tarxDir, 'external-test.log');
		const realLogPath = path.join(tarxDir, 'tarx-real-log.txt');

		const logStep = (step: string, success: boolean) => {
			const timestamp = new Date().toISOString();
			const status = success ? 'SUCCESS' : 'FAILED';
			const logLine = `[${timestamp}] [${status}] ${step}\n`;
			console.log(`[TARX-TEST] ${logLine.trim()}`);
			try {
				fs.appendFileSync(realLogPath, logLine);
			} catch (e) {
				console.error('[TARX-TEST] Failed to write log:', e);
			}
		};

		try {
			// Step 0: Ensure TARX directory exists
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
				logStep('Created ~/TARX directory', true);
			}

			// Clear previous log
			fs.writeFileSync(realLogPath, `=== TARX Execution Test @ ${new Date().toISOString()} ===\n`);
			logStep('Initialized test log', true);

			// Step 1: Write test file using fs.writeFileSync
			const testContent = `// TARX Real Execution Test\n// Generated at: ${new Date().toISOString()}\nconsole.log('Real execution test - this file was written by TARX extension');\n`;
			fs.writeFileSync(testFilePath, testContent, 'utf8');

			// Verify the file was actually written
			if (fs.existsSync(testFilePath)) {
				const written = fs.readFileSync(testFilePath, 'utf8');
				if (written.includes('Real execution test')) {
					logStep(`File written: ${testFilePath} (${written.length} bytes)`, true);
				} else {
					logStep('File write verification failed - content mismatch', false);
				}
			} else {
				logStep('File write failed - file does not exist', false);
			}

			// Step 2: Run external command using child_process.execSync
			try {
				execSync(`echo "External command executed at $(date)" > "${externalLogPath}"`, { shell: '/bin/bash' });
				if (fs.existsSync(externalLogPath)) {
					logStep(`External command executed: ${externalLogPath}`, true);
				} else {
					logStep('External command ran but file not created', false);
				}
			} catch (execError) {
				logStep(`External command failed: ${execError}`, false);
			}

			// Step 3: Open the test file in VS Code tab
			const fileUri = vscode.Uri.file(testFilePath);
			const doc = await vscode.workspace.openTextDocument(fileUri);
			const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
			logStep('Opened file in editor tab', true);

			// Step 4: Append comment using VS Code edit API
			const lastLine = doc.lineCount - 1;
			const lastChar = doc.lineAt(lastLine).text.length;
			const appendPosition = new vscode.Position(lastLine, lastChar);

			const edit = new vscode.WorkspaceEdit();
			edit.insert(fileUri, appendPosition, '\n// Test passed - VS Code edit API works!');
			const editApplied = await vscode.workspace.applyEdit(edit);
			logStep(`Applied VS Code edit: ${editApplied}`, editApplied);

			// Step 5: Save the document
			const saved = await doc.save();
			logStep(`Saved document: ${saved}`, saved);

			// Step 6: Verify final file content
			const finalContent = fs.readFileSync(testFilePath, 'utf8');
			const hasAppendedComment = finalContent.includes('Test passed');
			logStep(`Final verification - has appended content: ${hasAppendedComment}`, hasAppendedComment);

			// Show success message with results
			const result = await vscode.window.showInformationMessage(
				`TARX Execution Test Complete! Check ~/TARX/ for output files.`,
				'Reload Window',
				'Open Log'
			);

			if (result === 'Reload Window') {
				await vscode.commands.executeCommand('workbench.action.reloadWindow');
			} else if (result === 'Open Log') {
				const logUri = vscode.Uri.file(realLogPath);
				await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(logUri));
			}

		} catch (error) {
			logStep(`FATAL ERROR: ${error}`, false);
			vscode.window.showErrorMessage(`TARX Execution Test Failed: ${error}`);
		}
	});
	console.log('[TARX] Registered tarx.testExecution command');

	// Get Connection Status - For programmatic access
	safeRegisterCommand(context, 'tarx.getConnectionStatus', () => {
		if (!healthService) {
			return { status: 'unknown', isOnline: false, queueLength: 0 };
		}
		const health = healthService.healthStatus;
		return {
			status: health.status,
			isOnline: healthService.isOnline,
			queueLength: healthService.queueLength,
			latencyMs: health.latencyMs,
			model: health.model,
			lastCheck: health.lastCheck,
			consecutiveFailures: health.consecutiveFailures
		};
	});

	// Inject Daemon Status - Display daemon status in chat/notification
	safeRegisterCommand(context, 'tarx.injectDaemonStatus', async (message: string) => {
		console.log('[TARX] Injecting daemon status:', message);

		// Open chat panel and show status as information message
		await vscode.commands.executeCommand('workbench.action.chat.open');

		// Show status as an information message with action button
		const action = await vscode.window.showInformationMessage(
			message,
			'Open Dashboard'
		);

		if (action === 'Open Dashboard') {
			// Open daemon dashboard in browser
			vscode.env.openExternal(vscode.Uri.parse('http://localhost:11439'));
		}
	});
	console.log('[TARX] Registered tarx.injectDaemonStatus command');

	// Inject Session Context - Display loaded session context in chat
	safeRegisterCommand(context, 'tarx.injectSessionContext', async (message: string) => {
		console.log('[TARX] Injecting session context');

		// Show context as information message
		vscode.window.showInformationMessage(message);

		// Store context in workspace state so chat participant can access it
		await context.workspaceState.update('tarx.sessionContext', {
			message,
			timestamp: Date.now()
		});
	});
	console.log('[TARX] Registered tarx.injectSessionContext command');

	// ========================================
	// 4b. FILE UPLOAD COMMANDS
	// ========================================

	// File operations — persistent via MCP server's SQLite database (memory.db)
	const tarxFilesDir = path.join(os.homedir(), 'Library/Application Support/tarx/files');

	// Upload File — persists to disk + SQLite via MCP database
	safeRegisterCommand(context, 'tarx.uploadFile', async (params: { filename: string; content: string; size: number; mimeType: string }) => {
		console.log('[TARX] Uploading file:', params.filename);

		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			const contentHash = crypto.createHash('sha256').update(params.content).digest('hex');

			// Dedup check — skip if identical content already exists
			if (fs.existsSync(mcpDbPath)) {
				try {
					const dupCheck = execSync(
						`sqlite3 "${mcpDbPath}" "SELECT id, filename FROM files WHERE sha256_hash = '${contentHash}' AND deleted_at IS NULL LIMIT 1;"`,
						{ encoding: 'utf8' }
					).trim();
					if (dupCheck) {
						console.log(`[TARX] Duplicate file detected (hash match), skipping: ${params.filename}`);
						return { id: dupCheck.split('|')[0], success: true, duplicate: true };
					}
				} catch {}
			}

			const fileId = crypto.randomUUID();
			const storagePath = `${fileId}-${params.filename}`;
			const now = Date.now();

			// Write file to disk
			if (!fs.existsSync(tarxFilesDir)) {
				fs.mkdirSync(tarxFilesDir, { recursive: true });
			}
			fs.writeFileSync(path.join(tarxFilesDir, storagePath), params.content, 'utf8');

			// Insert into SQLite
			const escapedFilename = params.filename.replace(/'/g, "''");
			const sql = `INSERT INTO files (id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at, last_accessed_at, reference_count, source_type) VALUES ('${fileId}', '${escapedFilename}', '${params.mimeType || 'text/plain'}', ${params.content.length}, '${storagePath}', '${contentHash}', ${now}, ${now}, 1, 'upload');`;
			execSync(`sqlite3 "${mcpDbPath}" "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });

			// Add file to context for chat
			const uploadedFileUri = vscode.Uri.parse(`tarx-upload:/${params.filename}`);
			if (!contextFiles.some(f => f.toString() === uploadedFileUri.toString())) {
				contextFiles.push(uploadedFileUri);
			}

			// RAG embedding (fire-and-forget via local embedding server)
			try {
				const config = vscode.workspace.getConfiguration('tarx');
				const ragUrl = config.get<string>('ragUrl', 'http://localhost:11437');
				const ragClient = new RagClient(ragUrl);
				const health = await ragClient.checkHealth();
				if (health.healthy) {
					const ext = path.extname(params.filename).slice(1).toLowerCase();
					const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp'];
					const isCode = codeExtensions.includes(ext);
					const chunks = isCode
						? chunkCode(params.content, ext, 512, 128)
						: chunkText(params.content, 512, 128);
					if (chunks.length > 0) {
						const chunkContents = chunks.map(c => c.content);
						const embeddings = await ragClient.embedBatch(chunkContents);
						await storeMCPEmbeddings(fileId, params.filename, chunks, embeddings);
						// Mark as indexed using parameterized query
						try {
							execute('UPDATE files SET indexed_at = ? WHERE id = ?', Date.now(), fileId);
						} catch {}
						console.log(`[TARX] Embedded ${params.filename}: ${embeddings.length} chunks`);
					}
				}
			} catch (ragError) {
				console.error('[TARX] RAG pipeline error (non-fatal):', ragError);
			}

			analytics.track('file_uploaded', { filename: params.filename, size: params.size, hash: contentHash.slice(0, 16) });
			return { id: fileId, success: true, hash: contentHash };
		} catch (e) {
			console.error('[TARX] Upload failed:', e);
			return { success: false, error: e instanceof Error ? e.message : 'Upload failed' };
		}
	});

	// Get Uploaded Files — reads from SQLite (persistent across restarts)
	safeRegisterCommand(context, 'tarx.getUploadedFiles', () => {
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(mcpDbPath)) return [];

			const result = execSync(
				`sqlite3 "${mcpDbPath}" -json "SELECT id, filename, size_bytes as size, created_at as uploadedAt, source_type as sourceType, original_path as originalPath, COALESCE(is_reference, 0) as isReference FROM files WHERE deleted_at IS NULL ORDER BY created_at DESC;"`,
				{ encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
			);
			return JSON.parse(result || '[]');
		} catch (e) {
			console.error('[TARX] Failed to get files:', e);
			return [];
		}
	});

	// Delete Uploaded File — soft-deletes in SQLite, removes embeddings
	safeRegisterCommand(context, 'tarx.deleteUploadedFile', (fileId: string) => {
		try {
			const now = Date.now();

			// Get file info first using parameterized query
			const file = queryOne<{ id: string; storage_path: string; is_reference: number }>(
				'SELECT id, storage_path, COALESCE(is_reference, 0) as is_reference FROM files WHERE id = ? AND deleted_at IS NULL',
				fileId
			);
			if (!file) return { success: false, error: 'File not found' };

			// Soft-delete + remove embeddings from ALL tables using transaction
			const success = executeTransaction([
				['UPDATE files SET deleted_at = ? WHERE id = ?', now, fileId],
				['DELETE FROM chunk_embeddings WHERE file_id = ?', fileId],
				['DELETE FROM knowledge_embeddings WHERE source_type = ? AND source_id = ?', 'file', fileId],
				['DELETE FROM space_files WHERE file_id = ?', fileId]
			]);

			if (!success) {
				return { success: false, error: 'Database transaction failed' };
			}

			// Remove from disk if not a reference file
			if (!file.is_reference && file.storage_path && !file.storage_path.startsWith('ref:')) {
				const fullPath = path.join(tarxFilesDir, file.storage_path);
				try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch {}
			}

			console.log('[TARX] Deleted file:', fileId);
			return { success: true };
		} catch (e) {
			console.error('[TARX] Delete failed:', e);
			return { success: false, error: e instanceof Error ? e.message : 'Delete failed' };
		}
	});

	// Scan Directory — scans a directory, indexes files as references, and embeds for RAG
	safeRegisterCommand(context, 'tarx.scanDirectory', async (dirPath: string) => {
		console.log('[TARX] Scanning directory:', dirPath);
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(mcpDbPath)) return { success: false, error: 'Database not found' };

			const IGNORED = new Set(['node_modules', '.git', '.build', 'dist', 'out', '.cache', '.next', 'coverage', '.yarn', 'vendor']);
			const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.html', '.css', '.sh', '.sql', '.csv', '.xml', '.toml', '.env', '.gitignore']);
			const CODE_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp']);
			let indexed = 0;
			let embedded = 0;

			// Collect files that need embedding
			const filesToEmbed: Array<{ fileId: string; filename: string; fullPath: string; ext: string }> = [];

			function walk(dir: string, depth: number): void {
				if (depth > 3) return;
				let entries: string[];
				try { entries = fs.readdirSync(dir); } catch { return; }
				for (const entry of entries) {
					if (IGNORED.has(entry) || entry.startsWith('.')) continue;
					const full = path.join(dir, entry);
					let stat;
					try { stat = fs.statSync(full); } catch { continue; }
					if (stat.isDirectory()) { walk(full, depth + 1); continue; }
					if (!stat.isFile() || stat.size > 1024 * 1024) continue;
					const ext = path.extname(entry).toLowerCase();
					if (!TEXT_EXTS.has(ext)) continue;

					// Check if already indexed
					const escapedPath = full.replace(/'/g, "''");
					try {
						const existing = execSync(
							`sqlite3 "${mcpDbPath}" "SELECT COUNT(*) FROM files WHERE original_path = '${escapedPath}' AND deleted_at IS NULL;"`,
							{ encoding: 'utf8' }
						).trim();
						if (parseInt(existing) > 0) continue;
					} catch { continue; }

					// Hash from content (not just metadata) for proper dedup
					let content = '';
					let hash = '';
					try {
						content = fs.readFileSync(full, 'utf8');
						hash = crypto.createHash('sha256').update(content).digest('hex');
					} catch {
						hash = crypto.createHash('sha256').update(`${full}:${stat.size}:${stat.mtimeMs}`).digest('hex');
					}

					// Check hash dedup
					try {
						const dup = execSync(
							`sqlite3 "${mcpDbPath}" "SELECT COUNT(*) FROM files WHERE sha256_hash = '${hash}' AND deleted_at IS NULL;"`,
							{ encoding: 'utf8' }
						).trim();
						if (parseInt(dup) > 0) continue;
					} catch {}

					const fileId = crypto.randomUUID();
					const escapedName = entry.replace(/'/g, "''");
					const now = Date.now();

					try {
						execSync(
							`sqlite3 "${mcpDbPath}" "INSERT INTO files (id, filename, mime_type, size_bytes, storage_path, sha256_hash, created_at, last_accessed_at, reference_count, source_type, original_path, is_reference, last_modified) VALUES ('${fileId}', '${escapedName}', 'text/plain', ${stat.size}, 'ref:${escapedPath}', '${hash}', ${now}, ${now}, 1, 'scan', '${escapedPath}', 1, ${Math.floor(stat.mtimeMs)});"`,
							{ encoding: 'utf8' }
						);
						indexed++;
						// Queue for embedding if we have content
						if (content.trim().length > 0) {
							filesToEmbed.push({ fileId, filename: entry, fullPath: full, ext: ext.slice(1) });
						}
					} catch {}
				}
			}

			walk(dirPath, 0);
			console.log(`[TARX] Scanned ${dirPath}: ${indexed} files indexed, ${filesToEmbed.length} queued for embedding`);

			// RAG embedding pass — embed all scanned text files into knowledge_embeddings
			if (filesToEmbed.length > 0) {
				try {
					const config = vscode.workspace.getConfiguration('tarx');
					const ragUrl = config.get<string>('ragUrl', 'http://localhost:11437');
					const ragClient = new RagClient(ragUrl);
					const health = await ragClient.checkHealth();

					if (health.healthy) {
						for (const file of filesToEmbed) {
							try {
								const content = fs.readFileSync(file.fullPath, 'utf8');
								const isCode = CODE_EXTS.has(file.ext);
								const chunks = isCode
									? chunkCode(content, file.ext, 512, 128)
									: chunkText(content, 512, 128);

								if (chunks.length > 0) {
									const chunkContents = chunks.map(c => c.content);
									const embeddings = await ragClient.embedBatch(chunkContents);
									const stored = await storeMCPEmbeddings(file.fileId, file.filename, chunks, embeddings);
									if (stored > 0) {
										embedded++;
										// Mark indexed_at
										try {
											execSync(
												`sqlite3 "${mcpDbPath}" "UPDATE files SET indexed_at = ${Date.now()} WHERE id = '${file.fileId}';"`,
												{ encoding: 'utf8' }
											);
										} catch {}
									}
								}
							} catch (embedErr) {
								console.error(`[TARX] Embed failed for ${file.filename}:`, embedErr);
							}
						}
						console.log(`[TARX] Embedded ${embedded}/${filesToEmbed.length} scanned files into knowledge_embeddings`);
					} else {
						console.warn('[TARX] Embedding server offline — files indexed but not embedded');
					}
				} catch (ragError) {
					console.error('[TARX] RAG pipeline error during scan (non-fatal):', ragError);
				}
			}

			return { success: true, filesIndexed: indexed, filesEmbedded: embedded, path: dirPath };
		} catch (e) {
			console.error('[TARX] Scan failed:', e);
			return { success: false, error: e instanceof Error ? e.message : 'Scan failed' };
		}
	});

	// Attach File to Chat - Opens file picker and attaches selected files to active chat
	safeRegisterCommand(context, 'tarx.attachFileToChat', async () => {
		try {
			// Open file picker dialog
			const fileUris = await vscode.window.showOpenDialog({
				canSelectMany: true,
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: 'Attach to Chat',
				filters: {
					'All Files': ['*'],
					'Text Files': ['txt', 'md'],
					'Code Files': ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java'],
					'Config Files': ['json', 'yaml', 'yml', 'xml', 'toml']
				}
			});

			if (!fileUris || fileUris.length === 0) {
				return;
			}

			console.log(`[TARX] Attaching ${fileUris.length} files to chat`);

			// Process each file through the RAG pipeline and attach to chat
			for (const uri of fileUris) {
				const filePath = uri.fsPath;
				const filename = path.basename(filePath);

				// Read file content
				const content = await vscode.workspace.fs.readFile(uri);
				const text = Buffer.from(content).toString('utf8');

				// Upload file (triggers RAG pipeline)
				const uploadResult = await vscode.commands.executeCommand('tarx.uploadFile', {
					filename,
					content: text,
					size: text.length,
					mimeType: 'text/plain'
				}) as { id: string; success: boolean };

				if (uploadResult.success) {
					// Attach to VS Code chat
					await vscode.commands.executeCommand('workbench.action.chat.attachFile', uri);
					console.log(`[TARX] ✓ Attached ${filename} to chat`);
				}
			}

			vscode.window.showInformationMessage(
				`Attached ${fileUris.length} file(s) to chat`
			);

		} catch (error) {
			console.error('[TARX] Error attaching files to chat:', error);
			vscode.window.showErrorMessage('Failed to attach files to chat');
		}
	});

	// Attach Uploaded File to Chat - Attach a previously uploaded file from the sidebar
	safeRegisterCommand(context, 'tarx.attachUploadedFileToChat', async (fileId: string) => {
		try {
			// Use parameterized query to prevent SQL injection
			const file = queryOne<{ filename: string; storage_path: string; is_reference: number; original_path: string }>(
				'SELECT filename, storage_path, is_reference, original_path FROM files WHERE id = ? AND deleted_at IS NULL LIMIT 1',
				fileId
			);
			if (!file) {
				vscode.window.showErrorMessage('File not found');
				return;
			}
			const filename = file.filename;

			// Create a virtual URI for the uploaded file
			const uri = vscode.Uri.parse(`tarx-upload:/${filename}`);

			// Attach to VS Code chat
			await vscode.commands.executeCommand('workbench.action.chat.attachFile', uri);

			console.log(`[TARX] Attached uploaded file ${filename} to chat`);
			vscode.window.showInformationMessage(`Attached ${filename} to chat`);
		} catch (error) {
			console.error('[TARX] Error attaching uploaded file:', error);
			vscode.window.showErrorMessage('Failed to attach file to chat');
		}
	});

	// ========================================
	// 4c. CHAT MESSAGE COMMAND (for Session Panel)
	// ========================================

	// Send message from Session Panel with attached files
	// PERF FIX: Switched from non-streaming chatCompletion to streaming chatCompletionStream,
	// skipped RAG health check (check knowledge count first), batched DB writes into single execSync.
	safeRegisterCommand(context, 'tarx.chat.sendMessage', async (params: {
		sessionId: string;
		message: string;
		fileRefs?: string[];
	}) => {
		const { sessionId, message, fileRefs = [] } = params;
		const t0 = Date.now();
		console.log(`[TARX PERF] Session Panel message START: sessionId=${sessionId}, files=${fileRefs.length}`);

		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

			if (!fs.existsSync(mcpDbPath)) {
				vscode.window.showErrorMessage('TARX database not found');
				return { success: false, error: 'Database not found' };
			}

			// 1. Load session message history (last 10 messages)
			const historyQuery = `
				SELECT id, role, content, created_at
				FROM messages
				WHERE session_id = '${sessionId.replace(/'/g, "''")}'
				ORDER BY created_at DESC
				LIMIT 10;
			`;
			const historyResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: historyQuery
			});
			const historyMessages = JSON.parse(historyResult || '[]').reverse();
			console.log(`[TARX PERF] History loaded: +${Date.now() - t0}ms (${historyMessages.length} messages)`);

			// 2. RAG context injection - PERF: skip health check, check knowledge count first
			let ragContext = '';
			if (ragClient) {
				try {
					const knowledgeCount = await getMCPKnowledgeCount();
					if (knowledgeCount > 0) {
						console.log(`[TARX PERF] RAG: ${knowledgeCount} embeddings, starting embed +${Date.now() - t0}ms`);
						const queryEmbedding = await ragClient.embed(`search_query: ${message}`);
						console.log(`[TARX PERF] RAG embed done: +${Date.now() - t0}ms`);

						const ragResults = await searchMCPKnowledge(null, queryEmbedding, 5);
						const relevantResults = ragResults.filter(r => r.similarity > 0.5);

						if (relevantResults.length > 0) {
							ragContext = '\n\n<relevant_context>\n';
							for (const result of relevantResults) {
								ragContext += `[File: ${result.title}] (similarity: ${result.similarity.toFixed(2)})\n`;
								ragContext += result.content + '\n\n';
							}
							ragContext += '</relevant_context>';
							console.log(`[TARX PERF] RAG injected ${relevantResults.length} chunks: +${Date.now() - t0}ms`);
						}
					} else {
						console.log(`[TARX PERF] RAG skipped (0 embeddings): +${Date.now() - t0}ms`);
					}
				} catch (ragErr) {
					console.warn('[TARX] Session Panel RAG search failed (non-fatal):', ragErr);
				}
			}

			// 3. Build messages array
			const messages: ChatMessage[] = [];

			// System prompt (with RAG context if available)
			messages.push({
				role: 'system',
				content: buildTarxSystemPrompt({}) + ragContext
			});

			// History (alternating user/assistant)
			for (const msg of historyMessages) {
				messages.push({
					role: msg.role as 'user' | 'assistant',
					content: msg.content
				});
			}

			// Current user message
			messages.push({
				role: 'user',
				content: message
			});

			console.log(`[TARX PERF] Pre-inference: +${Date.now() - t0}ms (${messages.length} messages)`);

			// 4. Call LLM with STREAMING — stream tokens to Session Panel in real-time
			let assistantContent = '';
			let firstToken = true;
			const activePanel = TarxSessionPanel.currentPanel;

			for await (const chunk of tarxClient.chatCompletionStream(messages, {
				temperature: 0.7,
				maxTokens: 2048
			})) {
				if (firstToken) {
					console.log(`[TARX PERF] First token (TTFT): +${Date.now() - t0}ms`);
					firstToken = false;
				}
				// Only stream content to session panel, skip thinking tokens
				if (chunk.type === 'content') {
					assistantContent += chunk.content;
					// Stream token to webview for real-time display
					if (activePanel) {
						activePanel.postStreamToken(chunk.content);
					}
				}
				// Note: thinking tokens are not displayed in session panel view
			}

			if (!assistantContent) {
				assistantContent = 'No response generated.';
			}

			// Signal streaming complete — webview replaces streaming element with final message
			if (activePanel) {
				activePanel.postStreamEnd(assistantContent);
			}

			console.log(`[TARX PERF] Inference complete: +${Date.now() - t0}ms (${assistantContent.length} chars)`);

			// 5. Store user message + assistant message + update session in ONE execSync call
			const userMsgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const assistantMsgId = `msg_${Date.now() + 1}_${Math.random().toString(36).slice(2, 8)}`;
			const nowTimestamp = Math.floor(Date.now() / 1000);
			const escapedSessionId = sessionId.replace(/'/g, "''");
			const escapedMessage = message.replace(/'/g, "''");
			const escapedAssistant = assistantContent.replace(/'/g, "''");

			const batchSql = `
				INSERT INTO messages (id, session_id, role, content, created_at)
				VALUES ('${userMsgId}', '${escapedSessionId}', 'user', '${escapedMessage}', ${nowTimestamp});
				INSERT INTO messages (id, session_id, role, content, created_at)
				VALUES ('${assistantMsgId}', '${escapedSessionId}', 'assistant', '${escapedAssistant}', ${nowTimestamp});
				UPDATE sessions SET updated_at = ${nowTimestamp}, message_count = message_count + 2 WHERE id = '${escapedSessionId}';
			`;
			execSync(`sqlite3 "${mcpDbPath}"`, { encoding: 'utf8', input: batchSql });

			console.log(`[TARX PERF] DB writes done: +${Date.now() - t0}ms`);
			console.log(`[TARX PERF] Session Panel TOTAL: ${Date.now() - t0}ms`);

			return { success: true, response: assistantContent };

		} catch (error) {
			console.error('[TARX] Session Panel message error:', error);
			console.log(`[TARX PERF] Session Panel FAILED: +${Date.now() - t0}ms`);
			vscode.window.showErrorMessage('Failed to process message');
			return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
		}
	});

	// ========================================
	// 4d. SIDEBAR NAV COMMANDS
	// ========================================

	// ========================================
	// VOICE COMMANDS - DISABLED FOR V1 RELEASE
	// Re-enable in V1.5 when voice services are ready
	// ========================================
	// Voice commands disabled - register stub commands to prevent errors
	safeRegisterCommand(context, 'tarx.voice.start', () => {
		vscode.window.showInformationMessage('Voice features coming in V1.5');
	});
	safeRegisterCommand(context, 'tarx.voice.stop', () => {});
	safeRegisterCommand(context, 'tarx.voice.test', () => {
		vscode.window.showInformationMessage('Voice features coming in V1.5');
	});
	safeRegisterCommand(context, 'tarx.voice.testStop', () => {});
	safeRegisterCommand(context, 'tarx.voice.showTranscript', () => {
		vscode.window.showInformationMessage('Voice features coming in V1.5');
	});
	safeRegisterCommand(context, 'tarx.voice.toggleTranscript', () => {
		vscode.window.showInformationMessage('Voice features coming in V1.5');
	});

	// ========================================
	// SETTINGS COMMANDS - Claude API & Memory
	// ========================================

	// Get all settings for webview
	safeRegisterCommand(context, 'tarx.settings.get', async () => {
		try {
			const settings = await getNetworkModelSettings();
			// Update local model status from health service
			if (healthService) {
				settings.localModelStatus = healthService.healthStatus.status === 'online' ? 'connected' : 'disconnected';
			}
			return settings;
		} catch (e) {
			console.error('[TARX] Failed to get settings:', e);
			return null;
		}
	});

	// Save Claude API key securely
	safeRegisterCommand(context, 'tarx.settings.saveApiKey', async (key: string) => {
		try {
			await storeApiKey(key);
			console.log('[TARX] API key saved securely');
		} catch (e) {
			console.error('[TARX] Failed to save API key:', e);
			throw e;
		}
	});

	// Delete Claude API key
	safeRegisterCommand(context, 'tarx.settings.deleteApiKey', async () => {
		try {
			await deleteApiKey();
			console.log('[TARX] API key deleted');
		} catch (e) {
			console.error('[TARX] Failed to delete API key:', e);
			throw e;
		}
	});

	// Test Claude API connection
	safeRegisterCommand(context, 'tarx.settings.testConnection', async () => {
		try {
			const result = await testClaudeConnection();
			return result;
		} catch (e) {
			console.error('[TARX] Failed to test connection:', e);
			return { success: false, error: String(e) };
		}
	});

	// Set memory settings
	safeRegisterCommand(context, 'tarx.settings.setMemory', async (settings: { enabled?: boolean; threadConversations?: boolean }) => {
		try {
			await setMemorySettings(settings);
			console.log('[TARX] Memory settings updated:', settings);
		} catch (e) {
			console.error('[TARX] Failed to set memory settings:', e);
			throw e;
		}
	});

	// Clear all memory
	safeRegisterCommand(context, 'tarx.settings.clearMemory', async () => {
		try {
			// TODO: Implement memory clearing via memory service
			console.log('[TARX] Memory cleared');
			return true;
		} catch (e) {
			console.error('[TARX] Failed to clear memory:', e);
			return false;
		}
	});

	// ========================================
	// 4c. BILLING COMMANDS
	// ========================================

	safeRegisterCommand(context, 'tarx.billing.getStatus', async () => {
		try {
			return await getBillingStatus();
		} catch (e) {
			console.error('[TARX] Failed to get billing status:', e);
			return null;
		}
	});

	safeRegisterCommand(context, 'tarx.billing.createCheckout', async (tier: BillingTier) => {
		try {
			const url = await createCheckoutSession(tier);
			if (url) {
				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
			return url;
		} catch (e) {
			console.error('[TARX] Failed to create checkout session:', e);
			throw e;
		}
	});

	safeRegisterCommand(context, 'tarx.billing.openPortal', async () => {
		try {
			const url = await createPortalSession();
			if (url) {
				await vscode.env.openExternal(vscode.Uri.parse(url));
			}
			return url;
		} catch (e) {
			console.error('[TARX] Failed to open billing portal:', e);
			throw e;
		}
	});

	safeRegisterCommand(context, 'tarx.billing.saveKey', async (key: string) => {
		try {
			await storeStripeSecretKey(key);
			// Restart credit bridge polling with new key
			creditBridge?.startPolling();
			return true;
		} catch (e) {
			console.error('[TARX] Failed to save Stripe key:', e);
			throw e;
		}
	});

	safeRegisterCommand(context, 'tarx.billing.deleteKey', async () => {
		try {
			await deleteStripeSecretKey();
			// Stop credit bridge polling
			creditBridge?.stopPolling();
			return true;
		} catch (e) {
			console.error('[TARX] Failed to delete Stripe key:', e);
			throw e;
		}
	});

	// ========================================
	// 4d. QA TEST HARNESS COMMANDS
	// ========================================

	// QA Output Channel for test results
	const qaOutputChannel = vscode.window.createOutputChannel('TARX QA');
	context.subscriptions.push(qaOutputChannel);

	// Run QA Tests - Executes the automated test harness
	safeRegisterCommand(context, 'tarx.runQA', async () => {
		qaOutputChannel.show(true);
		qaOutputChannel.appendLine('');
		qaOutputChannel.appendLine('═══════════════════════════════════════════════════════════════');
		qaOutputChannel.appendLine('TARX QA Test Suite');
		qaOutputChannel.appendLine(`Started at: ${new Date().toISOString()}`);
		qaOutputChannel.appendLine('═══════════════════════════════════════════════════════════════');
		qaOutputChannel.appendLine('');

		try {
			const results = await runQATests(qaOutputChannel);
			const passed = results.filter(r => r.passed).length;
			const failed = results.filter(r => !r.passed).length;

			vscode.window.showInformationMessage(
				`TARX QA: ${passed}/${results.length} tests passed, ${failed} failed`
			);
		} catch (error) {
			qaOutputChannel.appendLine(`ERROR: ${error}`);
			vscode.window.showErrorMessage(`TARX QA Error: ${error}`);
		}
	});

	// ========================================
	// 4d. PROACTIVE INTELLIGENCE COMMANDS (Phase 6)
	// ========================================

	// Proactive Start - Enable proactive mode
	safeRegisterCommand(context, 'tarx.proactive.start', async () => {
		if (!proactiveSystem) {
			vscode.window.showErrorMessage('Proactive system not initialized');
			return;
		}
		proactiveSystem.start();
		vscode.window.showInformationMessage('TARX Proactive mode enabled');
		console.log('[TARX] Proactive mode started');
	});

	// Proactive Stop - Disable proactive mode
	safeRegisterCommand(context, 'tarx.proactive.stop', async () => {
		if (!proactiveSystem) {
			return;
		}
		proactiveSystem.stop();
		vscode.window.showInformationMessage('TARX Proactive mode disabled');
		console.log('[TARX] Proactive mode stopped');
	});

	// Proactive Toggle - Toggle proactive mode
	safeRegisterCommand(context, 'tarx.proactive.toggle', async () => {
		if (!proactiveSystem) {
			vscode.window.showErrorMessage('Proactive system not initialized');
			return;
		}
		const isRunning = proactiveSystem.toggle();
		vscode.window.showInformationMessage(
			isRunning ? 'TARX Proactive mode enabled' : 'TARX Proactive mode disabled'
		);
		return isRunning;
	});

	// Proactive Show Proposal - Display a proposal in UI
	safeRegisterCommand(context, 'tarx.proactive.showProposal', (action: any) => {
		// This command is called when a proposal is generated
		// The sidebar provider handles displaying it
		console.log('[TARX] Showing proposal:', action?.title);
		if (sidebarProvider) {
			sidebarProvider.setProactiveAction(action);
		}
	});

	// Proactive Approve - Approve current proposal
	safeRegisterCommand(context, 'tarx.proactive.approve', async (optionId?: string) => {
		if (!proactiveSystem) return;

		const proposal = proactiveSystem.services.actionProposer.getActiveProposal();
		if (!proposal) {
			console.log('[TARX] No active proposal to approve');
			return;
		}

		const result = await proactiveSystem.services.actionExecutor.handleResponse(
			proposal,
			'approve',
			optionId
		);
		console.log('[TARX] Proposal approved:', result.message);
		return result;
	});

	// Proactive Reject - Reject current proposal
	safeRegisterCommand(context, 'tarx.proactive.reject', async () => {
		if (!proactiveSystem) return;

		const proposal = proactiveSystem.services.actionProposer.getActiveProposal();
		if (!proposal) {
			return;
		}

		const result = await proactiveSystem.services.actionExecutor.handleResponse(
			proposal,
			'reject'
		);
		console.log('[TARX] Proposal rejected');
		return result;
	});

	// Proactive Explain - Get explanation for current proposal
	safeRegisterCommand(context, 'tarx.proactive.explain', async () => {
		if (!proactiveSystem) return;

		const proposal = proactiveSystem.services.actionProposer.getActiveProposal();
		if (!proposal) {
			return;
		}

		const result = await proactiveSystem.services.actionExecutor.handleResponse(
			proposal,
			'explain'
		);
		console.log('[TARX] Proposal explanation requested');
		return result;
	});

	// Proactive Undo - Undo last proactive action
	safeRegisterCommand(context, 'tarx.proactive.undo', async () => {
		if (!proactiveSystem) return;

		const result = await proactiveSystem.services.actionExecutor.undo();
		if (result.success) {
			vscode.window.showInformationMessage(result.message);
		} else {
			vscode.window.showWarningMessage(result.message);
		}
		return result;
	});

	// Proactive Status - Get current proactive status
	safeRegisterCommand(context, 'tarx.proactive.status', () => {
		if (!proactiveSystem) {
			return { running: false, hasProposal: false };
		}

		const proposal = proactiveSystem.services.actionProposer.getActiveProposal();
		const pattern = proactiveSystem.services.patternDetector.getCurrentPattern();

		return {
			running: proactiveSystem.running,
			hasProposal: !!proposal,
			proposal: proposal?.title,
			pattern: pattern?.pattern,
			confidence: pattern?.confidence,
			canUndo: proactiveSystem.services.actionExecutor.canUndo()
		};
	});

	console.log('[TARX] Proactive commands registered');

	// Chat New - Start a new chat conversation in a NEW TAB
	safeRegisterCommand(context, 'tarx.chat.new', async () => {
		// Clear current conversation state
		activeConversation = undefined;
		syncConversationToProvider();

		// Create a new conversation in the database
		if (db) {
			try {
				const projectId = activeProject?.id || null;
				activeConversation = await db.createConversation(projectId);
				syncConversationToProvider();
				console.log('[TARX] Created new conversation:', activeConversation.id);

				// Trigger history refresh so sidebar shows the new conversation
				await vscode.commands.executeCommand('tarx.history.refresh');
			} catch (e) {
				console.warn('[TARX] Failed to create new conversation:', e);
			}
		}

		// Open TARX chat panel in right column (new conversation)
		TarxChatPanel.createOrShow(context);
		console.log('[TARX] New chat started in right panel (ViewColumn.Beside)');
	});

	// History Show All - Show conversation history panel
	safeRegisterCommand(context, 'tarx.history.showAll', async () => {
		if (!db) {
			vscode.window.showInformationMessage('No conversation history available');
			return;
		}

		try {
			const projectId = activeProject?.id || null;
			const conversations = await db.getRecentConversations(projectId, 50);

			if (conversations.length === 0) {
				vscode.window.showInformationMessage('No conversations yet. Start chatting with @tarx!');
				return;
			}

			// Show quick pick with conversations
			const items = conversations.map(conv => ({
				label: conv.title || 'Untitled conversation',
				description: new Date(conv.updatedAt).toLocaleString(),
				id: conv.id
			}));

			const selected = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select a conversation to open',
				title: 'TARX Conversation History'
			});

			if (selected) {
				// Load the selected conversation
				await vscode.commands.executeCommand('tarx.openConversation', selected.id);
			}
		} catch (e) {
			console.error('[TARX] Failed to show history:', e);
			vscode.window.showErrorMessage('Failed to load conversation history');
		}
	});

	// Open Conversation - Load a specific conversation with full context
	safeRegisterCommand(context, 'tarx.openConversation', async (conversationId: string) => {
		if (!db || !conversationId) {
			return;
		}

		try {
			// Get conversation metadata
			const projectId = activeProject?.id || null;
			const conversations = await db.getRecentConversations(projectId, 100);
			const conversation = conversations.find(c => c.id === conversationId);

			if (!conversation) {
				vscode.window.showErrorMessage('Conversation not found');
				return;
			}

			// Determine if this is a Claude conversation
			const isClaudeConversation = conversation.title?.startsWith('Claude') || false;
			const source = isClaudeConversation ? 'Claude' : 'TARX';

			// Load ALL turns for this conversation
			const turns = await db.getConversationTurns(conversationId);
			console.log(`[TARX] Loading ${source} conversation "${conversation.title}" with ${turns.length} turns`);

			// Store turns in pre-loaded history map
			conversationHistory.set(conversationId, turns);

			// Set as active conversation
			activeConversation = conversation;
			syncConversationToProvider();

			// Convert turns to message format for session panel
			const messagesForDisplay = turns.map(turn => ({
				id: turn.id,
				role: turn.role,
				content: turn.content,
				created_at: turn.createdAt
			}));

			// Open session panel to display full conversation history (user + assistant messages)
			TarxSessionPanel.createOrShowWithMessages(
				context.extensionUri,
				conversationId,
				conversation.title || 'Conversation',
				messagesForDisplay
			);

			// Also open native chat for continuing the conversation
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: '@tarx '
			});

			// Show notification with conversation context and source
			const turnCount = turns.length;
			const title = conversation.title || 'Conversation';
			vscode.window.showInformationMessage(
				`Resumed ${source} conversation: ${title} (${turnCount} messages) - History visible in panel`
			);

			console.log(`[TARX] Conversation ${conversationId} loaded and ready`);
		} catch (e) {
			console.error('[TARX] Failed to open conversation:', e);
			vscode.window.showErrorMessage('Failed to load conversation');
		}
	});

	// Get Recent Conversations — used by TARX Dashboard in workbench
	safeRegisterCommand(context, 'tarx.getRecentConversations', async () => {
		if (!db) { return []; }
		try {
			const dbRef = db;
			const projectId = activeProject?.id || null;
			const conversations = await dbRef.getRecentConversations(projectId, 10);
			// Return summaries with message count for dashboard display
			const summaries = await Promise.all(conversations.map(async (c) => {
				const turns = await dbRef.getConversationTurns(c.id);
				return {
					id: c.id,
					title: c.title || 'Untitled',
					updatedAt: c.updatedAt,
					messageCount: turns.filter(t => t.role !== 'system').length,
				};
			}));
			return summaries;
		} catch (e) {
			console.error('[TARX] getRecentConversations failed:', e);
			return [];
		}
	});

	// Internal: List all projects (used by chat panel dropdown)
	safeRegisterCommand(context, 'tarx.internal.listProjects', async () => {
		if (!db) { return []; }
		try {
			const projects = await db.listProjects();
			return projects.map(p => ({ id: p.id, name: p.name, root: p.root, type: p.type }));
		} catch (e) {
			console.error('[TARX] internal.listProjects failed:', e);
			return [];
		}
	});

	// Internal: Get conversation turns (used by chat panel swap)
	safeRegisterCommand(context, 'tarx.internal.getConversationTurns', async (conversationId: string) => {
		if (!db || !conversationId) { return []; }
		try {
			const turns = await db.getConversationTurns(conversationId);
			return turns.map(t => ({ role: t.role, content: t.content, createdAt: t.createdAt }));
		} catch (e) {
			console.error('[TARX] internal.getConversationTurns failed:', e);
			return [];
		}
	});

	// Open Session - Load a session from the sessions table (MCP-based data)
	safeRegisterCommand(context, 'tarx.openSession', async (sessionId: string, spaceId?: string) => {
		if (!sessionId) {
			console.log('[TARX] openSession: No sessionId provided');
			return;
		}

		try {
			console.log(`[TARX] Opening session: ${sessionId} from space: ${spaceId}`);

			// Read from MCP server's memory.db database (same as getSessionHistory)
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

			if (!fs.existsSync(mcpDbPath)) {
				console.log('[TARX] openSession: MCP database not found at', mcpDbPath);
				vscode.window.showErrorMessage('Memory database not found');
				return;
			}

			// Get session details using sqlite3 CLI
			const sessionQuery = `
				SELECT s.id, s.title, s.space_id, s.model, sp.name as space_name, sp.emoji as space_emoji
				FROM sessions s
				LEFT JOIN spaces sp ON s.space_id = sp.id
				WHERE s.id = '${sessionId}'
			`;
			const sessionResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: sessionQuery
			});

			const sessions = JSON.parse(sessionResult || '[]') as Array<{
				id: string;
				title: string;
				space_id: string;
				model: string | null;
				space_name: string | null;
				space_emoji: string | null;
			}>;

			if (sessions.length === 0) {
				vscode.window.showErrorMessage('Session not found');
				return;
			}

			const session = sessions[0];

			// Load messages for this session
			const messagesQuery = `
				SELECT id, role, content, created_at
				FROM messages
				WHERE session_id = '${sessionId}'
				ORDER BY created_at ASC
			`;
			const messagesResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: messagesQuery
			});

			const messages = JSON.parse(messagesResult || '[]') as Array<{
				id: string;
				role: string;
				content: string;
				created_at: number;
			}>;

			console.log(`[TARX] Loaded session "${session.title}" with ${messages.length} messages`);

			// Convert messages to turns format for compatibility
			const turns = messages.map(m => ({
				id: m.id,
				conversationId: sessionId,
				role: m.role as 'user' | 'assistant' | 'system',
				content: m.content,
				createdAt: m.created_at,
				fileRefs: [],
				artifacts: null
			}));

			// Store in pre-loaded history map (using same mechanism as openConversation)
			conversationHistory.set(sessionId, turns);

			// Create a pseudo-conversation object for compatibility
			activeConversation = {
				id: sessionId,
				projectId: null,
				title: session.title,
				createdAt: Date.now(),
				updatedAt: Date.now()
			};
			syncConversationToProvider();

			// Open session panel to display full conversation history (user + assistant messages)
			const displayTitle = session.title || 'Session';
			const spaceName = session.space_name ? ` (${session.space_name})` : '';

			TarxSessionPanel.createOrShowWithMessages(
				context.extensionUri,
				sessionId,
				`${displayTitle}${spaceName}`,
				messages
			);

			console.log(`[TARX] Session ${sessionId} opened in session panel with ${messages.length} messages`);
		} catch (e) {
			console.error('[TARX] Failed to open session:', e);
			vscode.window.showErrorMessage('Failed to load session');
		}
	});

	// SuperComputer Mesh Connect
	safeRegisterCommand(context, 'tarx.mesh.connect', async () => {
		vscode.window.showInformationMessage('Connecting to SuperComputer mesh...');
		console.log('[TARX] Mesh connect initiated');

		// TODO: Actual mesh connection via localhost:11436
		// Simulating async connection
		return new Promise<boolean>((resolve) => {
			setTimeout(() => {
				analytics.track('mesh_connected', { peer_count: 0 });
				console.log('[TARX] Mesh connected');
				resolve(true);
			}, 1000);
		});
	});

	// SuperComputer Mesh Disconnect
	safeRegisterCommand(context, 'tarx.mesh.disconnect', async () => {
		vscode.window.showInformationMessage('Disconnected from SuperComputer');
		console.log('[TARX] Mesh disconnected');
		return true;
	});

	// Private Compute Join
	safeRegisterCommand(context, 'tarx.privateCompute.join', async () => {
		const poolId = await vscode.window.showInputBox({
			prompt: 'Enter Private Compute Pool ID',
			placeHolder: 'pool-xxxx-xxxx',
			title: 'Join Private Compute'
		});

		if (poolId) {
			vscode.window.showInformationMessage(`Joining private pool: ${poolId}`);
			console.log('[TARX] Join private compute:', poolId);
			// TODO: Actual pool join logic
		}
	});

	// Create Design - Placeholder for design tools
	safeRegisterCommand(context, 'tarx.create.design', async () => {
		vscode.window.showInformationMessage('Design tools coming soon! Stay tuned.');
		console.log('[TARX] Create design (placeholder)');
	});

	// Create Imagine - Placeholder for AI image generation
	safeRegisterCommand(context, 'tarx.create.imagine', async () => {
		vscode.window.showInformationMessage('AI image generation coming soon! Stay tuned.');
		console.log('[TARX] Create imagine (placeholder)');
	});

	// Projects New - Create a new TARX project
	// Projects New — redirect to full-tab create mode
	safeRegisterCommand(context, 'tarx.projects.new', async () => {
		await vscode.commands.executeCommand('tarx.openCreateProject');
	});

	// Projects Select - Set active project/space (for sidebar filtering)
	safeRegisterCommand(context, 'tarx.projects.select', async (projectId: string) => {
		console.log('[TARX] tarx.projects.select called with projectId:', projectId);

		// Store selected project in workspace state
		await context.workspaceState.update('tarx.selectedProjectId', projectId);

		// Update status bar if it exists
		const statusBar = context.workspaceState.get('tarx.statusBar') as vscode.StatusBarItem | undefined;
		if (statusBar) {
			// Fetch project name from MCP
			try {
				const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
				if (fs.existsSync(mcpDbPath)) {
					const query = `SELECT name FROM spaces WHERE id = '${projectId}'`;
					const result = execSync(`sqlite3 "${mcpDbPath}" -json`, {
						encoding: 'utf8',
						input: query
					});
					const rows = JSON.parse(result || '[]') as Array<{ name: string }>;
					if (rows.length > 0) {
						statusBar.text = `$(folder) ${rows[0].name}`;
						statusBar.show();
					}
				}
			} catch (e) {
				console.error('[TARX] Failed to update status bar:', e);
			}
		}

		console.log('[TARX] Project selected:', projectId);
	});

	// Projects List - Get all projects/spaces (for sidebar)
	// Reads from MCP memory.db spaces table
	safeRegisterCommand(context, 'tarx.projects.list', async () => {
		console.log('[TARX DIAG] tarx.projects.list CALLED');
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			console.log('[TARX DIAG] projects.list: DB path:', mcpDbPath);
			console.log('[TARX DIAG] projects.list: DB exists:', fs.existsSync(mcpDbPath));

			if (!fs.existsSync(mcpDbPath)) {
				console.log('[TARX] projects.list: MCP database not found');
				return [];
			}

			const query = `
				SELECT id, name, emoji, created_at as createdAt, updated_at as updatedAt
				FROM spaces
				WHERE deleted_at IS NULL
				ORDER BY last_accessed_at DESC
				LIMIT 50
			`;
			console.log('[TARX DIAG] projects.list: Running query');

			const result = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: query
			});
			console.log('[TARX DIAG] projects.list: Raw result length:', result?.length || 0);

			const rows = JSON.parse(result || '[]') as Array<{
				id: string;
				name: string;
				emoji: string | null;
				createdAt: number;
				updatedAt: number;
			}>;
			console.log('[TARX DIAG] projects.list: Parsed', rows.length, 'rows');

			const projects = rows.map(row => ({
				id: row.id,
				name: row.name,
				path: row.id, // Use space ID so sidebar can open it correctly
				type: null,
				isActive: false,
				createdAt: row.createdAt
			}));

			console.log('[TARX] Loaded', projects.length, 'spaces from MCP memory.db');
			return projects;
		} catch (e) {
			console.error('[TARX] Failed to list projects:', e);
			console.error('[TARX DIAG] projects.list error details:', e instanceof Error ? e.message : e);
			return [];
		}
	});

	// Projects Select - Switch to a project (simpler than open, no dashboard)
	safeRegisterCommand(context, 'tarx.projects.select', async (projectId: string) => {
		if (!db) {
			return false;
		}

		try {
			const project = await db.getProject(projectId);
			if (!project) {
				console.error('[TARX] Project not found:', projectId);
				return false;
			}

			// Set as active project
			await db.setActiveProject(projectId);
			activeProject = project;

			console.log('[TARX] Switched to project:', project.name);
			return true;
		} catch (e) {
			console.error('[TARX] Failed to select project:', e);
			return false;
		}
	});

	// Projects Open - Open a specific project with rich dashboard
	// Handles both file paths (from sidebar) and project IDs (from tree view)
	safeRegisterCommand(context, 'tarx.projects.open', async (projectIdOrPath: string) => {
		if (!projectIdOrPath) {
			vscode.window.showErrorMessage('No project specified');
			return false;
		}

		// Check if this looks like a space ID (UUID format or space-* prefix)
		const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		const spacePrefix = /^space-/i;
		const sessionPrefix = /^session-/i;
		const cleanPath = projectIdOrPath.replace(/^\//, ''); // Remove leading slash if present
		const isSpaceId = uuidPattern.test(cleanPath) || spacePrefix.test(cleanPath) || sessionPrefix.test(cleanPath);

		if (isSpaceId) {
			// This is a space/session ID - open the space's most recent session
			console.log('[TARX] Opening space:', projectIdOrPath);
			try {
				const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
				if (fs.existsSync(mcpDbPath)) {
					// Get the most recent session in this space
					const query = `
						SELECT id FROM sessions
						WHERE space_id = '${projectIdOrPath}' AND deleted_at IS NULL
						ORDER BY updated_at DESC LIMIT 1
					`;
					const result = execSync(`sqlite3 "${mcpDbPath}" -json`, {
						encoding: 'utf8',
						input: query
					});
					const sessions = JSON.parse(result || '[]') as Array<{ id: string }>;

					if (sessions.length > 0) {
						// Open the most recent session in this space
						await vscode.commands.executeCommand('tarx.openSession', sessions[0].id, projectIdOrPath);
					} else {
						// No sessions in this space - open chat with space context
						await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
						vscode.window.showInformationMessage('No sessions in this space yet. Start a new conversation!');
					}
					return true;
				}
			} catch (e) {
				console.error('[TARX] Failed to open space:', e);
			}
			// Fallback: just open chat
			await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
			return true;
		}

		// Detect if this is a file path (starts with / on Mac/Linux or contains drive letter on Windows)
		const isFilePath = projectIdOrPath.startsWith('/') || /^[a-zA-Z]:/.test(projectIdOrPath);

		if (isFilePath) {
			// Verify the path actually exists before trying to open
			if (!fs.existsSync(projectIdOrPath)) {
				console.error('[TARX] Project path does not exist:', projectIdOrPath);
				vscode.window.showErrorMessage(`Project folder not found: "${projectIdOrPath}"`);
				return false;
			}

			// It's a file path - just open the folder
			console.log('[TARX] Opening project folder:', projectIdOrPath);
			const uri = vscode.Uri.file(projectIdOrPath);
			await vscode.commands.executeCommand('vscode.openFolder', uri);
			return true;
		}

		// It's a project ID - use dashboard flow
		if (!db) {
			return false;
		}

		try {
			const project = await db.getProject(projectIdOrPath);
			if (!project) {
				vscode.window.showErrorMessage('Project not found');
				return false;
			}

			// Validate project.root is a valid file path (not a UUID)
			const uuidCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
			if (!project.root || uuidCheck.test(project.root) || uuidCheck.test(project.root.replace(/^\//, ''))) {
				console.error('[TARX] Project has invalid root path:', project.root);
				vscode.window.showErrorMessage(
					`Project "${project.name}" has an invalid root path. ` +
					`Please remove and re-create the project.`
				);
				return false;
			}

			// Verify the root path exists
			if (!fs.existsSync(project.root)) {
				console.error('[TARX] Project root does not exist:', project.root);
				vscode.window.showErrorMessage(`Project folder not found: "${project.root}"`);
				return false;
			}

			// Set as active project
			await db.setActiveProject(projectIdOrPath);
			activeProject = project;

			// Open the Project Context Panel (full tab)
			ProjectContextPanel.createOrShow(context.extensionUri, project.id);
			console.log('[TARX] Project opened:', project.name);
			return true;
		} catch (e) {
			console.error('[TARX] Failed to open project:', e);
			return false;
		}
	});

	// Projects Delete - Delete a project from database
	safeRegisterCommand(context, 'tarx.projects.delete', async (projectId: string) => {
		if (!db) {
			return false;
		}

		try {
			const project = await db.getProject(projectId);
			if (!project) {
				return false;
			}

			const confirm = await vscode.window.showWarningMessage(
				`Delete project "${project.name}"? This only removes it from TARX, not the actual files.`,
				'Delete',
				'Cancel'
			);

			if (confirm === 'Delete') {
				await db.deleteProject(projectId);
				if (activeProject?.id === projectId) {
					activeProject = undefined;
				}
				vscode.window.showInformationMessage(`Project "${project.name}" removed`);

				// Trigger sidebar refresh
				await vscode.commands.executeCommand('tarx.projects.refresh');
				return true;
			}
			return false;
		} catch (e) {
			console.error('[TARX] Failed to delete project:', e);
			return false;
		}
	});

	// Projects Refresh - Reload projects list in tree provider
	safeRegisterCommand(context, 'tarx.projects.refresh', async () => {
		console.log('[TARX] Projects refresh command triggered');
		// First sync from SQLite to ensure we have latest DB data
		await syncProjectsFromDB();
		if (projectTreeProvider) {
			projectTreeProvider.refresh();
		}
	});

	// History Refresh - Signal sidebar to reload history list
	safeRegisterCommand(context, 'tarx.history.refresh', async () => {
		console.log('[TARX] History refresh command triggered');
		// This is a signal command - the sidebar Part listens for this
		// and calls loadHistory() when it fires
	});

	// Projects Show Overview - Open the project.md overview file
	safeRegisterCommand(context, 'tarx.projects.showOverview', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showWarningMessage('No workspace folder open');
			return;
		}

		const overviewPath = path.join(workspaceFolder.uri.fsPath, '.tarx', 'project.md');
		if (fs.existsSync(overviewPath)) {
			const doc = await vscode.workspace.openTextDocument(overviewPath);
			await vscode.window.showTextDocument(doc, { preview: false });
			console.log('[TARX] Opened project overview:', overviewPath);
		} else {
			// Create the overview file if it doesn't exist
			const tarxDir = path.join(workspaceFolder.uri.fsPath, '.tarx');
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}

			const projectName = workspaceFolder.name;
			const projectMd = `---
name: ${projectName}
created: ${new Date().toISOString()}
type: general
---

# ${projectName}

## Instructions
_Add project-specific instructions for TARX here._

## Quick Links
- [README](../README.md)

## Notes
_Add any project notes here_
`;
			fs.writeFileSync(overviewPath, projectMd);

			const doc = await vscode.workspace.openTextDocument(overviewPath);
			await vscode.window.showTextDocument(doc, { preview: false });
			console.log('[TARX] Created and opened project overview:', overviewPath);
		}
	});

	// Projects - Refresh Dashboard (now opens ProjectContextPanel)
	safeRegisterCommand(context, 'tarx.projects.refreshDashboard', async () => {
		if (!activeProject) {
			vscode.window.showWarningMessage('No active project');
			return;
		}
		ProjectContextPanel.createOrShow(context.extensionUri, activeProject.id);
	});

	// Projects - Edit Instructions
	safeRegisterCommand(context, 'tarx.projects.editInstructions', async (projectId?: string) => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showWarningMessage('No workspace folder open');
			return;
		}

		// Open the config.json file for editing instructions
		const configPath = path.join(workspaceFolder.uri.fsPath, '.tarx', 'config.json');
		if (fs.existsSync(configPath)) {
			const doc = await vscode.workspace.openTextDocument(configPath);
			await vscode.window.showTextDocument(doc, { preview: false });
		} else {
			// Create default config
			const tarxDir = path.join(workspaceFolder.uri.fsPath, '.tarx');
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}
			const defaultConfig = {
				instructions: 'Add your project instructions here. These will be included in every TARX conversation.',
				pinnedFiles: [],
				ignorePatterns: ['node_modules', '.git', 'dist', 'build']
			};
			fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
			const doc = await vscode.workspace.openTextDocument(configPath);
			await vscode.window.showTextDocument(doc, { preview: false });
		}
		console.log('[TARX] Opened project config for editing');
	});

	// Projects - Edit Settings (alias for editInstructions)
	safeRegisterCommand(context, 'tarx.projects.editSettings', async (projectId?: string) => {
		await vscode.commands.executeCommand('tarx.projects.editInstructions', projectId);
	});

	// Projects - Create (called by TARX sidebar modal)
	// This saves to the DATABASE so tarx.projects.list returns it
	safeRegisterCommand(context, 'tarx.projects.create', async (name: string, mode?: string, importPath?: string, instructions?: string) => {
		console.log('[TARX] tarx.projects.create called with name:', name, 'mode:', mode);

		if (!name || name.trim().length === 0) {
			vscode.window.showErrorMessage('Project name is required');
			return;
		}

		// Validate project name format
		const trimmedName = name.trim();
		if (trimmedName.length > 50) {
			vscode.window.showErrorMessage('Project name too long (max 50 characters)');
			return;
		}
		if (!/^[a-zA-Z0-9][a-zA-Z0-9_\- .]*$/.test(trimmedName)) {
			vscode.window.showErrorMessage('Project name must start with letter/number and contain only letters, numbers, spaces, dashes, underscores, dots');
			return;
		}

		let workspacePath: string;

		if (mode === 'import' && importPath) {
			// Import mode — use the user-selected folder
			workspacePath = importPath;

			if (!fs.existsSync(workspacePath)) {
				vscode.window.showErrorMessage('Selected folder does not exist');
				return;
			}

			try {
				fs.accessSync(workspacePath, fs.constants.R_OK);
			} catch {
				vscode.window.showErrorMessage('No read permission for selected folder');
				return;
			}
		} else {
			// Create mode — make a new folder under ~/TARX Projects/
			const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
			const projectsRoot = path.join(homeDir, 'TARX Projects');

			// Ensure ~/TARX Projects/ exists
			if (!fs.existsSync(projectsRoot)) {
				fs.mkdirSync(projectsRoot, { recursive: true });
			}

			workspacePath = path.join(projectsRoot, trimmedName);

			if (fs.existsSync(workspacePath)) {
				const use = await vscode.window.showWarningMessage(
					`Folder "${trimmedName}" already exists in ~/TARX Projects/. Use it?`,
					'Use Existing',
					'Cancel'
				);
				if (use !== 'Use Existing') {
					return;
				}
			} else {
				fs.mkdirSync(workspacePath, { recursive: true });
			}
		}

		console.log('[TARX] Creating project at:', workspacePath);

		if (!db) {
			vscode.window.showErrorMessage('Database not initialized');
			return;
		}

		try {
			// Create project in database
			const newProject = await db.createProject({
				name: trimmedName,
				root: workspacePath,
				type: 'general',
				isActive: true
			});

			// Set as active project
			activeProject = newProject;
			await db.setActiveProject(newProject.id);

			console.log('[TARX] Project created in database:', newProject.id);

			// Build project data object once
			const projectData = {
				id: newProject.id,
				name: newProject.name,
				path: newProject.root,
				type: newProject.type || 'general',
				createdAt: newProject.createdAt,
				updatedAt: Date.now(),
				instructions: instructions?.trim()
			};

			// Update tree provider directly (no DB re-sync needed since we just wrote)
			if (projectTreeProvider) {
				projectTreeProvider.addProject(projectData);
				projectTreeProvider.setCurrentProject(projectData);
				projectTreeProvider.refresh();
			}

			vscode.window.showInformationMessage(`Project "${trimmedName}" created!`);

			// Open the new folder in the workspace
			const folderUri = vscode.Uri.file(workspacePath);
			await vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: false });

		} catch (error) {
			console.error('[TARX] Error creating project:', error);
			vscode.window.showErrorMessage(`Failed to create project: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Open Chat with pre-filled prompt (duplicate registration — uses new chat panel)
	safeRegisterCommand(context, 'tarx.openChat', (prompt?: string) => {
		TarxChatPanel.createOrShow(context, prompt || undefined);
	});

	console.log('[TARX] Sidebar nav commands registered');

	// ═══════════════════════════════════════════════════════════════
	// PIN LOCKOUT COMMANDS
	// Handles PIN creation, verification, and status checks
	// ═══════════════════════════════════════════════════════════════

	// Check if PIN is set
	safeRegisterCommand(context, 'tarx.pin.isSet', () => {
		try {
			const hasSetPIN = context.globalState.get<boolean>('tarx.hasSetPIN', false);
			console.log('[TARX] PIN isSet check:', hasSetPIN);
			return hasSetPIN;
		} catch (e) {
			console.error('[TARX] Failed to check PIN status:', e);
			return false;
		}
	});

	// Set or verify PIN
	safeRegisterCommand(context, 'tarx.pin.set', async (pin: string, mode: 'create' | 'verify') => {
		try {
			console.log('[TARX] PIN set command, mode:', mode);

			// Hash the PIN using simple hash (crypto.subtle not available in extension host)
			// Use a simple hash for now - in production use proper crypto
			const hashPin = (p: string): string => {
				let hash = 0;
				for (let i = 0; i < p.length; i++) {
					const char = p.charCodeAt(i);
					hash = ((hash << 5) - hash) + char;
					hash = hash & hash;
				}
				// Add salt and convert to hex string
				const salted = `tarx_${Math.abs(hash).toString(16)}_${p.length}`;
				let finalHash = 0;
				for (let i = 0; i < salted.length; i++) {
					finalHash = ((finalHash << 5) - finalHash) + salted.charCodeAt(i);
					finalHash = finalHash & finalHash;
				}
				return Math.abs(finalHash).toString(16).padStart(16, '0');
			};

			const pinHash = hashPin(pin);

			if (mode === 'create') {
				// Store the hash
				await context.globalState.update('tarx.pinHash', pinHash);
				await context.globalState.update('tarx.hasSetPIN', true);
				console.log('[TARX] PIN created and stored');
				return { success: true };
			} else {
				// Verify mode - check against stored hash
				const storedHash = context.globalState.get<string>('tarx.pinHash');
				if (pinHash === storedHash) {
					console.log('[TARX] PIN verified successfully');
					return { success: true };
				} else {
					console.log('[TARX] PIN verification failed');
					return { success: false, error: 'Incorrect PIN' };
				}
			}
		} catch (e) {
			console.error('[TARX] Failed to set/verify PIN:', e);
			return { success: false, error: 'An error occurred' };
		}
	});

	// Verify PIN only
	safeRegisterCommand(context, 'tarx.pin.verify', async (pin: string) => {
		try {
			const hashPin = (p: string): string => {
				let hash = 0;
				for (let i = 0; i < p.length; i++) {
					const char = p.charCodeAt(i);
					hash = ((hash << 5) - hash) + char;
					hash = hash & hash;
				}
				const salted = `tarx_${Math.abs(hash).toString(16)}_${p.length}`;
				let finalHash = 0;
				for (let i = 0; i < salted.length; i++) {
					finalHash = ((finalHash << 5) - finalHash) + salted.charCodeAt(i);
					finalHash = finalHash & finalHash;
				}
				return Math.abs(finalHash).toString(16).padStart(16, '0');
			};

			const pinHash = hashPin(pin);
			const storedHash = context.globalState.get<string>('tarx.pinHash');

			if (pinHash === storedHash) {
				console.log('[TARX] PIN verified');
				return { success: true };
			} else {
				console.log('[TARX] PIN incorrect');
				return { success: false, error: 'Incorrect PIN' };
			}
		} catch (e) {
			console.error('[TARX] Failed to verify PIN:', e);
			return { success: false, error: 'An error occurred' };
		}
	});

	// Reset PIN (for development/testing)
	safeRegisterCommand(context, 'tarx.pin.reset', async () => {
		try {
			await context.globalState.update('tarx.pinHash', undefined);
			await context.globalState.update('tarx.hasSetPIN', false);
			console.log('[TARX] PIN reset');
			return { success: true };
		} catch (e) {
			console.error('[TARX] Failed to reset PIN:', e);
			return { success: false };
		}
	});

	console.log('[TARX] PIN lockout commands registered');

	// ========================================
	// 5. Configuration change listener
	// ========================================
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('tarx.serverUrl')) {
				const newUrl = vscode.workspace.getConfiguration('tarx')
					.get<string>('serverUrl', 'http://localhost:11435');
				tarxClient.setServerUrl(newUrl);
				console.log(`[TARX] Server URL changed to: ${newUrl}`);
			}
			if (e.affectsConfiguration('tarx.ragUrl') && ragClient) {
				const newUrl = vscode.workspace.getConfiguration('tarx')
					.get<string>('ragUrl', 'http://localhost:11437');
				ragClient.setServerUrl(newUrl);
				console.log(`[TARX] RAG URL changed to: ${newUrl}`);
			}
		})
	);

	// ========================================
	// 6. Apply Artifact command
	// ========================================
	safeRegisterCommand(context, 'tarx.applyArtifact', async (artifact: any, projectRoot: string) => {
		if (!artifact || !projectRoot) {
			vscode.window.showErrorMessage('Invalid artifact data');
			return;
		}

		const result = await applyArtifact(artifact, projectRoot);
		if (result.success) {
			vscode.window.showInformationMessage(`TARX: ${result.message}`);

			// Refresh the file in the editor if it's open
			if (artifact.filePath) {
				const fullPath = path.join(projectRoot, artifact.filePath);
				const uri = vscode.Uri.file(fullPath);
				const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === fullPath);
				if (doc) {
					// Revert to reload from disk
					await vscode.commands.executeCommand('workbench.action.files.revert', uri);
				}
			}
		} else {
			vscode.window.showErrorMessage(`TARX: ${result.message}`);
		}
	});

	// Copy artifact content to clipboard
	safeRegisterCommand(context, 'tarx.copyArtifact', async (artifact: any) => {
		if (!artifact?.content) {
			vscode.window.showErrorMessage('No artifact content to copy');
			return;
		}
		await vscode.env.clipboard.writeText(artifact.content);
		vscode.window.showInformationMessage('Code copied to clipboard');
	});

	// View artifact in new untitled editor
	safeRegisterCommand(context, 'tarx.viewArtifact', async (artifact: any) => {
		if (!artifact?.content) {
			vscode.window.showErrorMessage('No artifact content to view');
			return;
		}
		// Create untitled document with proper language
		const languageMap: { [key: string]: string } = {
			'js': 'javascript', 'ts': 'typescript', 'tsx': 'typescriptreact',
			'jsx': 'javascriptreact', 'py': 'python', 'rb': 'ruby',
			'rs': 'rust', 'go': 'go', 'java': 'java', 'cpp': 'cpp',
			'c': 'c', 'cs': 'csharp', 'php': 'php', 'swift': 'swift',
			'kt': 'kotlin', 'scala': 'scala', 'html': 'html', 'css': 'css',
			'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'md': 'markdown',
			'sql': 'sql', 'sh': 'shellscript', 'bash': 'shellscript'
		};
		const lang = languageMap[artifact.language] || artifact.language || 'plaintext';
		const doc = await vscode.workspace.openTextDocument({
			content: artifact.content,
			language: lang
		});
		await vscode.window.showTextDocument(doc, { preview: false });
	});

	// Insert artifact at cursor position in active editor
	safeRegisterCommand(context, 'tarx.insertArtifact', async (artifact: any) => {
		if (!artifact?.content) {
			vscode.window.showErrorMessage('No artifact content to insert');
			return;
		}
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showWarningMessage('No active editor to insert code into');
			return;
		}
		await editor.edit(editBuilder => {
			editBuilder.insert(editor.selection.active, artifact.content);
		});
		vscode.window.showInformationMessage('Code inserted at cursor');
	});

	// ========================================
	// 7. Project Management Commands
	// ========================================
	safeRegisterCommand(context, 'tarx.indexProject', async () => {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			vscode.window.showWarningMessage('No workspace folder open');
			return;
		}

		if (!projectIndexer || !db) {
			vscode.window.showErrorMessage('TARX not fully initialized');
			return;
		}

		try {
			const project = await projectIndexer.ensureProject(workspaceFolder.uri);
			activeProject = project;
			await projectIndexer.startIndexing(project);
		} catch (e) {
			const error = e instanceof Error ? e.message : 'Unknown error';
			vscode.window.showErrorMessage(`Failed to index: ${error}`);
		}
	});

	safeRegisterCommand(context, 'tarx.showIndexingProgress', () => {
		if (!activeProject || !projectIndexer) {
			vscode.window.showInformationMessage('No project being indexed');
			return;
		}

		const progress = projectIndexer.getProgress(activeProject.id);
		if (progress) {
			vscode.window.showInformationMessage(
				`TARX Indexing: ${progress.status} - ${progress.filesIndexed}/${progress.totalFiles} files`
			);
		}
	});

	// ========================================
	// 7a. Upload Progress Commands (for sidebar integration)
	// ========================================
	safeRegisterCommand(context, 'tarx.showUploadProgress', (text: string, percent: number) => {
		// This command is handled by the TarxSidebarPart in the workbench
		// The command just needs to be registered here
		console.log(`[TARX] Upload progress: ${text} (${percent}%)`);
	});

	safeRegisterCommand(context, 'tarx.hideUploadProgress', () => {
		// This command is handled by the TarxSidebarPart in the workbench
		console.log('[TARX] Upload progress hidden');
	});

	// ========================================
	// 7b. Conversation History Command (for sidebar integration)
	// ========================================
	safeRegisterCommand(context, 'tarx.getConversationHistory', async (limit: number = 10) => {
		console.log('[TARX] getConversationHistory called with limit:', limit);
		if (!db) {
			console.log('[TARX] getConversationHistory: No database instance');
			return { conversations: [], turns: [] };
		}

		try {
			const projectId = activeProject?.id || null;
			console.log('[TARX] getConversationHistory: projectId =', projectId);
			const conversations = await db.getRecentConversations(projectId, limit);
			console.log('[TARX] getConversationHistory: found', conversations.length, 'conversations');
			const turns = await db.getRecentTurns(projectId, limit * 2);

			// Format for sidebar display
			const historyItems = conversations.map(conv => ({
				id: conv.id,
				title: conv.title || 'Untitled conversation',
				timestamp: conv.updatedAt,
				type: 'chat' as const
			}));

			return {
				conversations: historyItems,
				turns: turns.map(t => ({
					id: t.id,
					conversationId: t.conversationId,
					role: t.role,
					content: t.content.substring(0, 100) + (t.content.length > 100 ? '...' : ''),
					timestamp: t.createdAt
				}))
			};
		} catch (e) {
			console.error('[TARX] Failed to get conversation history:', e);
			return { conversations: [], turns: [] };
		}
	});

	// ========================================
	// 7c. Session History Command (for unified sidebar - reads MCP memory.db)
	// ========================================
	safeRegisterCommand(context, 'tarx.getSessionHistory', async (limit: number = 50) => {
		console.log('[TARX] getSessionHistory called, limit:', limit);
		try {
			// Read from MCP server's memory.db database (not extension's tarx.db)
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			console.log('[TARX] getSessionHistory: checking path:', mcpDbPath);

			if (!fs.existsSync(mcpDbPath)) {
				console.log('[TARX] getSessionHistory: MCP database not found at', mcpDbPath);
				return { sessions: [] };
			}
			console.log('[TARX] getSessionHistory: database file exists');

			// Use sqlite3 CLI to avoid native module version issues
			const query = `
				SELECT
					s.id,
					s.title,
					s.updated_at as updatedAt,
					s.space_id as spaceId,
					s.model,
					s.message_count as messageCount,
					sp.name as spaceName,
					sp.emoji as spaceEmoji
				FROM sessions s
				LEFT JOIN spaces sp ON s.space_id = sp.id
				WHERE s.deleted_at IS NULL
				ORDER BY s.updated_at DESC
				LIMIT ${limit}
			`;

			const result = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: query
			});

			const rows = JSON.parse(result || '[]') as Array<{
				id: string;
				title: string;
				updatedAt: number;
				spaceId: string;
				model: string | null;
				messageCount: number;
				spaceName: string | null;
				spaceEmoji: string | null;
			}>;

			const allSessions = rows.map(row => ({
				id: row.id,
				title: row.title || 'Untitled',
				updatedAt: row.updatedAt,
				spaceId: row.spaceId,
				spaceName: row.spaceName || 'Unknown Space',
				spaceEmoji: row.spaceEmoji || '💬',
				model: row.model,
				messageCount: row.messageCount || 0
			}));

			// Deduplicate sessions with identical titles in the same space
			// (e.g., "Autonomic Daemon Session" flood). Keep the most recent,
			// append count if duplicates exist.
			const seen = new Map<string, { session: typeof allSessions[0]; count: number }>();
			for (const s of allSessions) {
				const key = `${s.spaceId}::${s.title}`;
				const existing = seen.get(key);
				if (existing) {
					existing.count++;
				} else {
					seen.set(key, { session: s, count: 1 });
				}
			}
			const sessions = Array.from(seen.values()).map(({ session, count }) => ({
				...session,
				title: count > 1 ? `${session.title} (${count})` : session.title
			}));

			console.log('[TARX] Loaded', allSessions.length, 'sessions, deduped to', sessions.length);
			return { sessions };
		} catch (e) {
			console.error('[TARX] Failed to get session history from MCP database:', e);
			return { sessions: [] };
		}
	});

	// Mark history commands as ready — allows loadSidebarHistory() to proceed safely
	// (Fixes Sentry NODE-A: "HostProvider not setup" — 2533 errors from race condition)
	historyCommandsReady = true;
	console.log('[TARX] History commands registered — loadSidebarHistory() now safe to call');

	// Trigger initial history load now that commands are ready
	ensureClaudeAISpace().then(() => loadSidebarHistory()).catch(e => console.error('[TARX] Deferred history load failed:', e));

	// ========================================
	// 7d. Claude.ai Sessions Command - List sessions from Claude.ai Sessions space only
	// ========================================
	safeRegisterCommand(context, 'tarx.getClaudeAISessions', async (limit: number = 50) => {
		console.log('[TARX] getClaudeAISessions called, limit:', limit);
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(mcpDbPath)) {
				console.log('[TARX] getClaudeAISessions: MCP database not found');
				return { sessions: [], spaceId: null };
			}

			// First find the Claude.ai Sessions space
			const spaceQuery = "SELECT id, name, emoji, message_count, created_at FROM spaces WHERE name = 'Claude.ai Sessions' AND deleted_at IS NULL LIMIT 1";
			const spaceResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: spaceQuery
			});

			const spaces = JSON.parse(spaceResult || '[]') as Array<{
				id: string;
				name: string;
				emoji: string;
				message_count: number;
				created_at: number;
			}>;

			if (spaces.length === 0) {
				console.log('[TARX] Claude.ai Sessions space not found');
				return { sessions: [], spaceId: null };
			}

			const space = spaces[0];

			// Query sessions from this space only
			const sessionsQuery = `
				SELECT
					s.id,
					s.title,
					s.topic,
					s.updated_at as updatedAt,
					s.last_activity as lastActivity,
					s.message_count as messageCount,
					s.total_tokens as totalTokens,
					s.model
				FROM sessions s
				WHERE s.space_id = '${space.id}' AND s.deleted_at IS NULL
				ORDER BY COALESCE(s.last_activity, s.updated_at) DESC
				LIMIT ${limit}
			`;

			const sessionsResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: sessionsQuery
			});

			const rows = JSON.parse(sessionsResult || '[]') as Array<{
				id: string;
				title: string | null;
				topic: string | null;
				updatedAt: number;
				lastActivity: number | null;
				messageCount: number;
				totalTokens: number;
				model: string | null;
			}>;

			const sessions = rows.map(row => ({
				id: row.id,
				title: row.title || 'Untitled',
				topic: row.topic,
				updatedAt: row.updatedAt,
				lastActivity: row.lastActivity || row.updatedAt,
				messageCount: row.messageCount || 0,
				totalTokens: row.totalTokens || 0,
				model: row.model || 'claude.ai',
				viewUrl: `tarx://session/${row.id}`
			}));

			console.log('[TARX] Loaded', sessions.length, 'Claude.ai sessions');
			return {
				sessions,
				spaceId: space.id,
				spaceName: space.name,
				spaceEmoji: space.emoji,
				totalSessions: sessions.length
			};
		} catch (e) {
			console.error('[TARX] Failed to get Claude.ai sessions:', e);
			return { sessions: [], spaceId: null };
		}
	});

	// ========================================
	// 8. Workspace change listeners
	// ========================================
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
			// Handle added folders
			for (const folder of e.added) {
				if (projectIndexer && db) {
					const project = await projectIndexer.ensureProject(folder.uri);
					activeProject = project;

					// Sync with ProjectTreeProvider
					if (projectTreeProvider) {
						projectTreeProvider.addProject({
							id: project.id,
							name: project.name,
							path: project.root,
							type: project.type || 'general',
							createdAt: project.createdAt,
							updatedAt: Date.now()
						});
						projectTreeProvider.setCurrentProject({
							id: project.id,
							name: project.name,
							path: project.root,
							type: project.type || 'general',
							createdAt: project.createdAt,
							updatedAt: Date.now()
						});
					}

					// Start background indexing
					projectIndexer.startIndexing(project);
				}
			}

			// Handle removed folders
			for (const folder of e.removed) {
				// Clear current project if it matches the removed folder
				if (activeProject && activeProject.root === folder.uri.fsPath) {
					activeProject = undefined;
					if (projectTreeProvider) {
						projectTreeProvider.setCurrentProject(null);
					}
				}
			}
		})
	);

	// ========================================
	// 9. Welcome Command (Manual access)
	// Note: First-run onboarding is handled by executeFirstRunFlow()
	// ========================================

	// Show Welcome command - opens the welcome markdown file (manual access)
	safeRegisterCommand(context, 'tarx.showWelcome', async () => {
		const welcomePath = path.join(context.extensionPath, 'media', 'welcome.md');
		const welcomeUri = vscode.Uri.file(welcomePath);
		try {
			await vscode.commands.executeCommand('markdown.showPreview', welcomeUri);
			console.log('[TARX] Welcome file opened');
		} catch (e) {
			// Fallback: open as text
			const doc = await vscode.workspace.openTextDocument(welcomeUri);
			await vscode.window.showTextDocument(doc);
		}
	});

	// Reset first-run command (for testing/debugging)
	safeRegisterCommand(context, 'tarx.resetFirstRun', async () => {
		const { FirstRunManager } = await import('./services/firstRunFlow.js');
		const firstRunMgr = new FirstRunManager(context);
		await firstRunMgr.resetFirstRun();
		vscode.window.showInformationMessage('TARX: First-run state reset. Restart to see onboarding.');
	});

	// Start the Autonomic Daemon (background self-healing and mesh compute)
	initAutonomicDaemon(context).catch(e => {
		console.error('[TARX] Autonomic daemon init error:', e);
	});

	// Run startup self-checks (non-blocking)
	runStartupChecks().catch(e => {
		console.error('[TARX] Startup checks error:', e);
	});

	// ═══════════════════════════════════════════════════════════════
	// AUTO-OPEN DASHBOARD ON LAUNCH (center tab default)
	// Opens TARXDashboard in ViewColumn.Active on first launch
	// or always if user prefers dashboard landing
	// ═══════════════════════════════════════════════════════════════
	try {
		const hasSeenDashboard = context.globalState.get<boolean>('hasSeenDashboard', false);
		const alwaysOpenDashboard = vscode.workspace.getConfiguration('tarx').get<boolean>('alwaysOpenDashboard', false);

		console.log('[TARX] Dashboard check - hasSeenDashboard:', hasSeenDashboard, 'alwaysOpen:', alwaysOpenDashboard);

		if (!hasSeenDashboard || alwaysOpenDashboard) {
			// Small delay to let the workbench finish layout
			setTimeout(() => {
				try {
					console.log('[TARX] Opening dashboard center tab...');
					TarxDashboardPanel.createOrShow(context.extensionUri);
					context.globalState.update('hasSeenDashboard', true);
					console.log('[TARX] Dashboard center opened - first launch or alwaysOpen');
				} catch (err) {
					console.error('[TARX CRASH-GUARD] Failed to auto-open dashboard:', err);
				}
			}, 1500);
		} else {
			console.log('[TARX] Skipping dashboard auto-open (already seen)');
		}
	} catch (err) {
		console.error('[TARX CRASH-GUARD] Dashboard auto-open check failed:', err);
	}

	// ═══════════════════════════════════════════════════════════════
	// AUTO-OPEN RIGHT CHAT PANE ON LAUNCH
	// Opens the native VS Code chat with TARX participant ready
	// ═══════════════════════════════════════════════════════════════
	try {
		const hasOpenedChat = context.globalState.get<boolean>('tarx.hasAutoOpenedChat', false);
		console.log('[TARX] Chat auto-open check - hasOpenedChat:', hasOpenedChat);

		if (!hasOpenedChat) {
			// Auto-open chat in right pane after a short delay
			setTimeout(async () => {
				try {
					console.log('[TARX EVENT] Auto-opening chat in right pane...');
					// Open VS Code native chat panel
					await vscode.commands.executeCommand('workbench.action.chat.open');
					// Mark that we've auto-opened
					await context.globalState.update('tarx.hasAutoOpenedChat', true);
					console.log('[TARX EVENT] ✓ Chat auto-opened successfully');
				} catch (chatErr) {
					console.error('[TARX] Failed to auto-open chat:', chatErr);
				}
			}, 2000); // 2s delay to let workbench settle
		} else {
			console.log('[TARX] Skipping chat auto-open (already opened before)');
		}
	} catch (err) {
		console.error('[TARX CRASH-GUARD] Chat auto-open check failed:', err);
	}

	console.log('[TARX CRASH-GUARD] TARX activated safely at', new Date().toISOString());

  } catch (activationError: unknown) { // ══════ END TOP-LEVEL CRASH GUARD ══════
	const errMsg = activationError instanceof Error ? activationError.stack || activationError.message : String(activationError);
	console.error('[TARX CRASH-GUARD] !!!!! ACTIVATION CRASHED !!!!!');
	console.error('[TARX CRASH-GUARD] Error:', errMsg);
	console.error('[TARX CRASH-GUARD] Time:', new Date().toISOString());
	// Do NOT re-throw — let extension host survive even if TARX activation fails
	vscode.window.showErrorMessage(`TARX activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`);
  }
}

/**
 * Initialize workspace and start indexing
 */
async function initializeWorkspace(context: vscode.ExtensionContext): Promise<void> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder || !projectIndexer || !db) return;

	try {
		// Create or get project
		const project = await projectIndexer.ensureProject(workspaceFolder.uri);
		activeProject = project;
		console.log(`[TARX] Active project: ${project.name} (${project.type || 'unknown'})`);

		// Sync with ProjectTreeProvider
		if (projectTreeProvider) {
			const projectData = {
				id: project.id,
				name: project.name,
				path: project.root,
				type: project.type || 'general',
				createdAt: project.createdAt,
				updatedAt: Date.now()
			};
			projectTreeProvider.addProject(projectData);
			projectTreeProvider.setCurrentProject(projectData);
			console.log('[TARX] Project synced with tree provider');
		}

		// Check if this is a TARX project (has .tarx folder)
		const tarxDir = path.join(workspaceFolder.uri.fsPath, '.tarx');
		const overviewPath = path.join(tarxDir, 'project.md');
		const isTarxProject = fs.existsSync(tarxDir);

		// If not a TARX project yet but opened from ~/TARX/, create the config
		const isInTarxHome = workspaceFolder.uri.fsPath.includes(path.join(os.homedir(), 'TARX'));
		if (!isTarxProject && isInTarxHome) {
			// Create .tarx folder for projects in ~/TARX/
			fs.mkdirSync(tarxDir, { recursive: true });
			const projectMd = `---
name: ${project.name}
created: ${new Date().toISOString()}
type: ${project.type || 'general'}
---

# ${project.name}

## Instructions
_Add project-specific instructions for TARX here._

## Quick Links
- [README](../README.md)

## Notes
_Add any project notes here_
`;
			fs.writeFileSync(overviewPath, projectMd);
			console.log('[TARX] Created .tarx folder for project in ~/TARX/');

			// Open the overview file for new TARX projects
			setTimeout(async () => {
				const doc = await vscode.workspace.openTextDocument(overviewPath);
				await vscode.window.showTextDocument(doc, { preview: false });
			}, 500);
		} else if (isTarxProject && fs.existsSync(overviewPath)) {
			// Open project.md for existing TARX projects
			console.log('[TARX] Opening project dashboard for existing project');
			setTimeout(async () => {
				try {
					const doc = await vscode.workspace.openTextDocument(overviewPath);
					await vscode.window.showTextDocument(doc, { preview: false });
				} catch (e) {
					console.error('[TARX] Failed to open project overview:', e);
				}
			}, 500);
		}

		// Set up file watcher for incremental indexing
		if (fileWatcher) {
			fileWatcher.dispose();
		}

		fileWatcher = createFileWatcher(project.root, async (relativePath, type) => {
			console.log(`[TARX] File ${type}: ${relativePath}`);
			if (projectIndexer && activeProject) {
				// Debounce re-indexing
				setTimeout(() => {
					projectIndexer?.reindexFile(activeProject!, relativePath);
				}, 500);
			}
		});

		context.subscriptions.push(fileWatcher);

		// Check if project needs indexing
		const projectFiles = await db.getProjectFiles(project.id);
		if (projectFiles.length === 0) {
			// First time - start full indexing
			console.log('[TARX] Starting initial project indexing...');
			projectIndexer.startIndexing(project);
		} else {
			console.log(`[TARX] Project already indexed: ${projectFiles.length} files`);
		}
	} catch (e) {
		console.error('[TARX] Workspace initialization failed:', e);
	}
}

// Start the Autonomic Daemon (background self-healing service)
async function initAutonomicDaemon(context: vscode.ExtensionContext): Promise<void> {
	// Check if autonomic mode is enabled (default: true)
	const config = vscode.workspace.getConfiguration('tarx');
	const autonomicEnabled = config.get<boolean>('autonomic.enabled', true);

	if (!autonomicEnabled) {
		console.log('[TARX Autonomic] Disabled via settings (tarx.autonomic.enabled)');
		return;
	}

	try {
		console.log('[TARX Autonomic] Starting daemon...');
		await startDaemon();
		console.log('[TARX Autonomic] Daemon started successfully');

		// Register daemon commands
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.autonomic.status', async () => {
				const daemon = getDaemon();
				const state = daemon.getState();
				const uptimeMin = Math.floor((Date.now() - state.startedAt) / 60000);
				vscode.window.showInformationMessage(
					`TARX Autonomic: ${state.mode} | ` +
					`Node: ${state.nodeId.substring(0, 8)}... | ` +
					`Uptime: ${uptimeMin}m | ` +
					`Healed: ${state.errorsHealed}/${state.errorsAnalyzed} | ` +
					`Rep: ${state.reputation.toFixed(2)}`
				);
			}),
			vscode.commands.registerCommand('tarx.autonomic.stop', async () => {
				const daemon = getDaemon();
				daemon.emergencyStop();
				vscode.window.showWarningMessage('TARX Autonomic: Emergency stop activated - observe only mode');
			}),
			vscode.commands.registerCommand('tarx.autonomic.dashboard', async () => {
				// Open the admin dashboard in browser
				const dashboardUrl = 'http://localhost:11439';
				vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
			})
		);
	} catch (e) {
		console.error('[TARX Autonomic] Failed to start daemon:', e);
	}

	// ════════════════════════════════════════════════════════════════
	// GROK DISPATCH — Background orchestration hook
	// Spawns scripts/grok-dispatch.js, registers session, watches inbox.
	// ════════════════════════════════════════════════════════════════
	try {
		const dispatchScript = path.join(context.extensionPath, '..', '..', 'scripts', 'grok-dispatch.js');
		const dispatchCwd = path.join(context.extensionPath, '..', 'tarx-core');

		if (fs.existsSync(dispatchScript) && fs.existsSync(dispatchCwd)) {
			// Only start if not already running (check PID file or state)
			const stateFile = path.join(os.homedir(), 'Library/Application Support/tarx/grok-dispatch-state.json');
			let alreadyRunning = false;
			if (fs.existsSync(stateFile)) {
				try {
					const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
					// If state was updated in the last 90s, assume running
					const age = Date.now() - new Date(state.timestamp).getTime();
					alreadyRunning = age < 90_000;
				} catch { /* stale file, proceed */ }
			}

			if (!alreadyRunning) {
				grokDispatchProcess = spawnProcess('node', [dispatchScript], {
					cwd: dispatchCwd,
					stdio: ['ignore', 'pipe', 'pipe'],
					detached: false,
					env: { ...process.env, TARX_WORKSPACE: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.join(os.homedir(), 'Desktop/tarx-code-oss') }
				});

				grokDispatchProcess.stdout?.on('data', (data: Buffer) => {
					const msg = data.toString().trim();
					if (msg) console.log('[TARX Grok]', msg);
				});
				grokDispatchProcess.stderr?.on('data', (data: Buffer) => {
					const msg = data.toString().trim();
					if (msg) console.error('[TARX Grok ERR]', msg);
				});
				grokDispatchProcess.on('exit', (code) => {
					console.log(`[TARX Grok] Process exited (code=${code})`);
					grokDispatchProcess = undefined;
				});

				console.log(`[TARX Grok] Dispatch started, PID=${grokDispatchProcess.pid}`);
			} else {
				console.log('[TARX Grok] Dispatch already running (recent state file), skipping spawn');
			}
		} else {
			console.log('[TARX Grok] Dispatch script not found, skipping');
		}
	} catch (e) {
		console.error('[TARX Grok] Failed to start dispatch:', e);
	}

	// ── Grok Dispatch Commands: Approve / Reject tasks via orch_tasks ──
	const orchDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.grokDispatch.approveTask', (taskId: string) => {
			try {
				if (!taskId) return;
				execSync(
					`sqlite3 "${orchDbPath}" "UPDATE orch_tasks SET status='pending', blocked_by=NULL WHERE id='${taskId.replace(/'/g, "''")}' AND status='blocked'"`,
					{ encoding: 'utf8' }
				);
				console.log(`[TARX Grok] Task ${taskId} approved → pending`);
				// Notify webview
				webviewSidebarProvider?.updateTaskApproval(taskId, 'approved');
			} catch (e) {
				console.error('[TARX Grok] Approve failed:', e);
			}
		}),
		vscode.commands.registerCommand('tarx.grokDispatch.rejectTask', (taskId: string, reason?: string) => {
			try {
				if (!taskId) return;
				const result = reason ? `[REJECTED] ${reason}` : '[REJECTED] User rejected';
				execSync(
					`sqlite3 "${orchDbPath}" "UPDATE orch_tasks SET status='completed', completed_at=${Date.now()}, result='${result.replace(/'/g, "''")}' WHERE id='${taskId.replace(/'/g, "''")}'"`,
					{ encoding: 'utf8' }
				);
				console.log(`[TARX Grok] Task ${taskId} rejected`);
				webviewSidebarProvider?.updateTaskApproval(taskId, 'rejected');
			} catch (e) {
				console.error('[TARX Grok] Reject failed:', e);
			}
		}),
		vscode.commands.registerCommand('tarx.grokDispatch.getBlockedTasks', () => {
			try {
				const result = execSync(
					`sqlite3 "${orchDbPath}" -json "SELECT id, title, description, priority, blocked_by FROM orch_tasks WHERE status='blocked' AND blocked_by='approval_required' ORDER BY assigned_at DESC LIMIT 20"`,
					{ encoding: 'utf8', timeout: 3000 }
				);
				return JSON.parse(result || '[]');
			} catch {
				return [];
			}
		})
	);
	console.log('[TARX Grok] Approval commands registered');

	// ========================================
	// FINAL: PUSH data to sidebar (not pull via commands)
	// The webview's 'ready' message fires before extension activates,
	// causing stubs to return empty arrays. Fix: extension PUSHES data.
	// ========================================
	console.log('[TARX] All commands registered - PUSHING data to sidebar...');

	const pushDataToSidebar = async () => {
		if (!webviewSidebarProvider) {
			console.log('[TARX] No webviewSidebarProvider - skipping push');
			return;
		}

		try {
			// Query projects directly from DB (bypass command system)
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (fs.existsSync(mcpDbPath)) {
				const projectQuery = `
					SELECT id, name, emoji, created_at as createdAt, updated_at as updatedAt
					FROM spaces
					WHERE deleted_at IS NULL
					ORDER BY last_accessed_at DESC
					LIMIT 50
				`;
				const projectResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
					encoding: 'utf8',
					input: projectQuery
				});
				const projectRows = JSON.parse(projectResult || '[]') as Array<{
					id: string;
					name: string;
					emoji: string | null;
					createdAt: number;
					updatedAt: number;
				}>;
				const projects = projectRows.map(row => ({
					id: row.id,
					name: row.name,
					path: row.name,
					type: null,
					isActive: false,
					createdAt: row.createdAt
				}));

				console.log('[TARX] PUSHING', projects.length, 'projects to sidebar');
				webviewSidebarProvider.updateProjects(projects);

				// Query sessions/history directly from DB
				const historyQuery = `
					SELECT s.id, s.title, s.updated_at as updatedAt, s.space_id as spaceId, sp.name as spaceName
					FROM sessions s
					LEFT JOIN spaces sp ON s.space_id = sp.id
					WHERE s.deleted_at IS NULL
					ORDER BY s.updated_at DESC
					LIMIT 50
				`;
				const historyResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
					encoding: 'utf8',
					input: historyQuery
				});
				const historyRows = JSON.parse(historyResult || '[]') as Array<{
					id: string;
					title: string | null;
					updatedAt: number;
					spaceId: string;
					spaceName: string | null;
				}>;
				const history = historyRows.map(row => ({
					id: row.id,
					title: row.title || 'Untitled',
					timestamp: row.updatedAt,
					source: 'claude' as const,
					spaceId: row.spaceId,
					spaceName: row.spaceName || undefined
				}));

				console.log('[TARX] PUSHING', history.length, 'history items to sidebar');
				webviewSidebarProvider.updateHistory(history);
			} else {
				console.log('[TARX] DB not found, pushing empty arrays');
				webviewSidebarProvider.updateProjects([]);
				webviewSidebarProvider.updateHistory([]);
			}
		} catch (e) {
			console.error('[TARX] Failed to push data to sidebar:', e);
		}
	};

	// Push data with extended retry window (webview may still be loading)
	const pushDelays = [100, 500, 1500, 3000, 5000, 8000];
	for (const delay of pushDelays) {
		setTimeout(() => {
			console.log(`[TARX] Push attempt at ${delay}ms`);
			pushDataToSidebar();
		}, delay);
	}

	console.log('[TARX] ========== EXTENSION ACTIVATION COMPLETE ==========');
}

export function deactivate() {
	console.log('[TARX] Extension deactivating...');

	// Track session end
	if (analytics) {
		analytics.track('session_ended', {
			duration_ms: analytics.getSessionDuration(),
			events_count: analytics.getEvents().length
		});
	}

	statusBar?.dispose();
	languageModelProvider?.dispose();
	projectIndexer?.dispose();
	fileWatcher?.dispose();
	proactiveSystem?.dispose();
	creditBridge?.dispose();

	// Stop Autonomic Daemon
	stopDaemon().catch(e => {
		console.error('[TARX Autonomic] Failed to stop daemon:', e);
	});

	// Stop Grok Dispatch
	if (grokDispatchProcess) {
		grokDispatchProcess.kill('SIGTERM');
		grokDispatchProcess = undefined;
	}

	// Close MCP database connection (performance optimization cleanup)
	closeMCPDatabase();

	// Flush console logs to disk before shutdown
	flushTarxLogs();
}
