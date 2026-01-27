/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Early activation log - this runs when module is loaded
console.log('[TARX] ========== EXTENSION MODULE LOADING ==========');

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { TarxCompletionProvider } from './completionProvider';
import { TarxStatusBar } from './statusBar';
import { TarxClient, ChatMessage } from './tarxClient';
import { TarxLanguageModelProvider } from './languageModelProvider';
import { registerSpeechProvider } from './speechProvider';
import { JsonDatabase, DatabaseOperations, Project, Conversation, ConversationTurn, detectProjectType } from './database';
import { RagClient } from './ragClient';
import { ProjectIndexer, createFileWatcher } from './projectIndexer';
import {
	parseFileReferences,
	loadContext,
	buildPrompt,
	parseArtifacts,
	applyArtifact
} from './chatContext';
import {
	TARX_SYSTEM_PROMPT,
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
import { HealthService, ConnectionStatus } from './healthService';

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
		console.log(`[TARX] Command ${commandId} already registered, skipping`);
		return;
	}
	registeredCommands.add(commandId);
	context.subscriptions.push(
		vscode.commands.registerCommand(commandId, handler)
	);
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
let languageModelProvider: TarxLanguageModelProvider | undefined;
let db: DatabaseOperations | undefined;
let ragClient: RagClient | undefined;
let projectIndexer: ProjectIndexer | undefined;
let activeProject: Project | undefined;
let activeConversation: Conversation | undefined;
let fileWatcher: vscode.Disposable | undefined;

// Pre-loaded conversation history for restored conversations
// Key: conversationId, Value: array of turns loaded when opening from history
const conversationHistory = new Map<string, ConversationTurn[]>();

// Maximum number of conversation turns to load for context
const MAX_HISTORY_TURNS = 10;

export function activate(context: vscode.ExtensionContext) {
	console.log('[TARX] Extension activating...');

	// Initialize analytics
	analytics = new TarxAnalytics();
	analytics.track('app_launched', {
		version: context.extension.packageJSON.version || '1.0.0',
		platform: process.platform
	});

	// Initialize TARX client
	const config = vscode.workspace.getConfiguration('tarx');
	const serverUrl = config.get<string>('serverUrl', 'http://localhost:11435');
	const ragUrl = config.get<string>('ragUrl', 'http://localhost:11437');
	const tarxClient = new TarxClient(serverUrl);

	// Initialize RAG client
	ragClient = new RagClient(ragUrl);

	// Initialize Health Service for connection monitoring
	healthService = new HealthService(tarxClient);
	healthService.startPolling();
	context.subscriptions.push(healthService);

	// Subscribe to health status changes
	healthService.onStatusChange((status) => {
		console.log(`[TARX] Connection status: ${status.status}`);
		// Update sidebar provider with connection status
		if (sidebarProvider) {
			sidebarProvider.setConnectionStatus(status.status);
		}
	});

	// Initialize database (using extension storage path)
	const storagePath = context.globalStorageUri.fsPath;
	db = new JsonDatabase(storagePath);
	console.log('[TARX] Database initialized at:', storagePath);

	// Initialize project indexer
	projectIndexer = new ProjectIndexer(db, ragClient);

	// Subscribe to indexing progress
	projectIndexer.onProgress((progress) => {
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

	// Auto-index workspace folders on startup
	initializeWorkspace(context);

	// Track context files
	const contextFiles: vscode.Uri[] = [];

	// ========================================
	// 1. Register Chat Participant (@tarx)
	// ========================================
	const chatParticipant = vscode.chat.createChatParticipant('tarx.chat', async (request, chatContext, response, token) => {
		const prompt = request.prompt;
		const command = request.command;

		// Build message history from context
		const messages: ChatMessage[] = [];

		// Get or create conversation for history persistence
		const projectId = activeProject?.id || null;
		if (db) {
			try {
				// Get or create active conversation
				if (!activeConversation || activeConversation.projectId !== projectId) {
					activeConversation = await db.getRecentConversation(projectId) || undefined;
					if (!activeConversation) {
						activeConversation = await db.createConversation(projectId);
						console.log('[TARX] Created new conversation:', activeConversation.id);
					}
				}

				// Check if we have pre-loaded history (from tarx.openConversation)
				let recentTurns: ConversationTurn[] = [];
				const conversationId = activeConversation?.id;
				if (conversationId && conversationHistory.has(conversationId)) {
					// Use pre-loaded history from restored conversation
					recentTurns = conversationHistory.get(conversationId) || [];
					console.log(`[TARX] Using pre-loaded history: ${recentTurns.length} turns from restored conversation`);
					// Clear after first use - subsequent messages will use normal flow
					conversationHistory.delete(conversationId);
				} else {
					// Normal flow: load recent turns from database
					recentTurns = await db.getRecentTurns(projectId, MAX_HISTORY_TURNS);
					if (recentTurns.length > 0) {
						console.log(`[TARX] Loaded ${recentTurns.length} turns from conversation history`);
					}
				}

				// Add persisted history to messages (before VS Code chat context)
				for (const turn of recentTurns) {
					if (turn.role !== 'system') {
						messages.push({
							role: turn.role as 'user' | 'assistant',
							content: turn.content
						});
					}
				}
			} catch (e) {
				console.warn('[TARX] Failed to load conversation history:', e);
			}
		}

		// Get active editor for context
		const activeEditor = vscode.window.activeTextEditor;
		const activeFilePath = activeEditor?.document.uri.fsPath;

		// Get project root
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		const projectRoot = activeProject?.root || workspaceFolder?.uri.fsPath;

		// Use the comprehensive TARX system prompt
		let systemPrompt = TARX_SYSTEM_PROMPT;

		// Parse file references and load context if we have a project
		let loadedContext = null;
		if (projectRoot && activeProject && db && ragClient) {
			response.progress('Loading context...');

			try {
				// Get project files for reference parsing
				const projectFiles = await db.getProjectFiles(activeProject.id);

				// Parse file references from the prompt
				const fileRefs = parseFileReferences(prompt, projectRoot, activeFilePath, projectFiles);

				if (fileRefs.length > 0) {
					console.log(`[TARX] Found ${fileRefs.length} file references:`, fileRefs.map(r => r.path));

					// Load context from referenced files and RAG
					loadedContext = await loadContext(
						fileRefs,
						projectRoot,
						activeProject.id,
						db,
						ragClient,
						prompt,
						4000 // Max tokens for context
					);

					console.log(`[TARX] Loaded context: ${loadedContext.files.length} files, ${loadedContext.chunks.length} chunks`);
				}
			} catch (e) {
				console.warn('[TARX] Context loading failed:', e);
			}
		}

		// Build the full prompt with context
		if (loadedContext && (loadedContext.files.length > 0 || loadedContext.chunks.length > 0)) {
			systemPrompt = buildPrompt('', loadedContext, systemPrompt);
		}

		messages.push({
			role: 'system',
			content: systemPrompt
		});

		// Add context from previous turns
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

		// Normalize transcription (handles voice input)
		const normalizedPrompt = normalizeTranscription(prompt);

		// Check for vague requests and ask for clarification
		if (!command && isVagueRequest(normalizedPrompt)) {
			const clarification = getClarificationForVagueRequest(normalizedPrompt);
			response.markdown(clarification);
			return { metadata: { command: 'clarification' } };
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

		// Collect full response for artifact parsing
		let fullResponse = '';

		try {
			// Stream response from llama-server
			for await (const chunk of tarxClient.chatCompletionStream(messages, {
				temperature: 0.7,
				maxTokens: 2048
			})) {
				if (token.isCancellationRequested) {
					break;
				}
				fullResponse += chunk;
				response.markdown(chunk);
			}

			// Parse artifacts from response
			const artifacts = parseArtifacts(fullResponse);
			if (artifacts.length > 0 && projectRoot) {
				console.log(`[TARX] Found ${artifacts.length} code artifacts`);

				// Add buttons for artifacts with file paths
				for (const artifact of artifacts) {
					if (artifact.filePath) {
						response.button({
							command: 'tarx.applyArtifact',
							title: `Apply to ${artifact.filePath}`,
							arguments: [artifact, projectRoot]
						});
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

								// Refresh sidebar with new title
								if (sidebarProvider) {
									const convs = await db.getRecentConversations(projectId, 10);
									sidebarProvider.setConversations(convs.map(c => ({
										id: c.id,
										title: c.title || 'Untitled conversation',
										timestamp: c.updatedAt
									})));
								}
							}
						}).catch((e) => {
							console.log('[TARX] LLM title generation failed:', e);
						});
					}

					// Update sidebar with latest conversations
					if (sidebarProvider) {
						const conversations = await db.getRecentConversations(projectId, 10);
						sidebarProvider.setConversations(conversations.map(c => ({
							id: c.id,
							title: c.title || 'Untitled conversation',
							timestamp: c.updatedAt
						})));
					}
				} catch (e) {
					console.warn('[TARX] Failed to save conversation turns:', e);
				}
			}
		} catch (error: unknown) {
			// Enhanced error handling with specific error types
			const err = error as { status?: number; code?: string; message?: string };
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

	chatParticipant.iconPath = new vscode.ThemeIcon('comment-discussion');

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
	try {
		const lmDisposable = vscode.lm.registerLanguageModelChatProvider('tarx', languageModelProvider);
		context.subscriptions.push(lmDisposable);
		console.log('[TARX] Language model provider registered');
	} catch (error) {
		console.log('[TARX] Language model provider registration failed (API may not be available):', error);
	}

	// ========================================
	// 1c. Register Speech Provider (Voice)
	// ========================================
	registerSpeechProvider(context);

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

	// ========================================
	// 4. Register Commands
	// ========================================

	// Open Chat - opens the native chat panel
	safeRegisterCommand(context, 'tarx.openChat', () => {
		vscode.commands.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
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

	// ========================================
	// 4b. SIDEBAR NAV COMMANDS
	// ========================================

	// Voice Start - Start voice input
	safeRegisterCommand(context, 'tarx.voice.start', async () => {
		analytics.track('voice_used');
		try {
			// Try native VS Code voice chat first
			await vscode.commands.executeCommand('workbench.action.chat.startVoiceChat');
			console.log('[TARX] Voice started via native VS Code');
		} catch (e) {
			// Fallback notification
			vscode.window.showInformationMessage('Voice input starting...');
			console.log('[TARX] Voice start (fallback)');
		}
	});

	// Voice Stop - Stop voice input
	safeRegisterCommand(context, 'tarx.voice.stop', async () => {
		try {
			await vscode.commands.executeCommand('workbench.action.chat.stopVoiceChat');
			console.log('[TARX] Voice stopped');
		} catch (e) {
			console.log('[TARX] Voice stop (fallback)');
		}
	});

	// Chat New - Start a new chat conversation
	safeRegisterCommand(context, 'tarx.chat.new', async () => {
		// Clear current conversation state
		activeConversation = undefined;

		// Create a new conversation in the database
		if (db) {
			try {
				const projectId = activeProject?.id || null;
				activeConversation = await db.createConversation(projectId);
				console.log('[TARX] Created new conversation:', activeConversation.id);

				// Trigger history refresh so sidebar shows the new conversation
				await vscode.commands.executeCommand('tarx.history.refresh');
			} catch (e) {
				console.warn('[TARX] Failed to create new conversation:', e);
			}
		}

		// Open chat panel with @tarx
		await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
		console.log('[TARX] New chat started');
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

			// Load ALL turns for this conversation
			const turns = await db.getConversationTurns(conversationId);
			console.log(`[TARX] Loading conversation "${conversation.title}" with ${turns.length} turns`);

			// Store turns in pre-loaded history map
			conversationHistory.set(conversationId, turns);

			// Set as active conversation
			activeConversation = conversation;

			// Open chat panel
			await vscode.commands.executeCommand('workbench.action.chat.open', {
				query: '@tarx '
			});

			// Show notification with conversation context
			const turnCount = turns.length;
			const title = conversation.title || 'Conversation';
			vscode.window.showInformationMessage(
				`Resumed: ${title} (${turnCount} messages)`
			);

			console.log(`[TARX] Conversation ${conversationId} loaded and ready`);
		} catch (e) {
			console.error('[TARX] Failed to open conversation:', e);
			vscode.window.showErrorMessage('Failed to load conversation');
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
	safeRegisterCommand(context, 'tarx.projects.new', async () => {
		// Ask for project name first (better UX - no folder picker)
		const projectName = await vscode.window.showInputBox({
			prompt: 'Project name',
			placeHolder: 'my-awesome-project',
			title: 'Create New TARX Project',
			validateInput: (value) => {
				if (!value || value.trim().length === 0) {
					return 'Project name is required';
				}
				if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
					return 'Use only letters, numbers, hyphens and underscores';
				}
				return null;
			}
		});

		if (!projectName) {
			return;
		}

		// Create in ~/TARX/ folder by default
		const tarxHome = path.join(os.homedir(), 'TARX');
		const folderPath = path.join(tarxHome, projectName);

		// Create directories if needed
		if (!fs.existsSync(tarxHome)) {
			fs.mkdirSync(tarxHome, { recursive: true });
		}

		if (fs.existsSync(folderPath)) {
			vscode.window.showErrorMessage(`Project "${projectName}" already exists at ${folderPath}`);
			return;
		}

		// Create project folder and basic structure
		fs.mkdirSync(folderPath, { recursive: true });
		fs.writeFileSync(
			path.join(folderPath, 'README.md'),
			`# ${projectName}\n\nCreated with TARX\n`
		);

		// Create .tarx directory for project config
		const tarxDir = path.join(folderPath, '.tarx');
		fs.mkdirSync(tarxDir, { recursive: true });

		// Create project.md overview file
		const projectType = 'general';
		const createdDate = new Date().toISOString();
		const projectMd = `---
name: ${projectName}
created: ${createdDate}
type: ${projectType}
---

# ${projectName}

## Instructions
_Add project-specific instructions for TARX here. These will be included in the AI context._

## Quick Links
- [README](../README.md)

## Notes
_Add any project notes here_
`;
		fs.writeFileSync(path.join(tarxDir, 'project.md'), projectMd);

		// Create config.json for structured data
		const projectConfig = {
			name: projectName,
			created: Date.now(),
			type: projectType,
			instructions: '',
			pinnedFiles: [],
			conversationIds: []
		};
		fs.writeFileSync(path.join(tarxDir, 'config.json'), JSON.stringify(projectConfig, null, 2));

		console.log('[TARX] Created .tarx folder with project.md and config.json');

		// Save project to database
		if (db) {
			try {
				const newProject = await db.createProject({
					name: projectName,
					root: folderPath,
					type: projectType,
					isActive: true
				});

				activeProject = newProject;
				await db.setActiveProject(newProject.id);
				analytics.track('project_created', { project_id: newProject.id });
				console.log('[TARX] Created project:', newProject.id, projectName, folderPath);
				vscode.window.showInformationMessage(`Project "${projectName}" created in ~/TARX/`);

				// Trigger sidebar refresh
				await vscode.commands.executeCommand('tarx.projects.refresh');
			} catch (e) {
				console.error('[TARX] Failed to create project:', e);
				vscode.window.showErrorMessage('Failed to create project');
			}
		}

		// Open the folder as workspace
		await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath));
	});

	// Projects List - Get all projects (for sidebar)
	safeRegisterCommand(context, 'tarx.projects.list', async () => {
		if (!db) {
			return [];
		}

		try {
			const projects = await db.listProjects();
			return projects.map(p => ({
				id: p.id,
				name: p.name,
				path: p.root,
				type: p.type,
				isActive: p.isActive,
				createdAt: p.createdAt
			}));
		} catch (e) {
			console.error('[TARX] Failed to list projects:', e);
			return [];
		}
	});

	// Projects Open - Open a specific project
	safeRegisterCommand(context, 'tarx.projects.open', async (projectId: string) => {
		if (!db) {
			return false;
		}

		try {
			const project = await db.getProject(projectId);
			if (!project) {
				vscode.window.showErrorMessage('Project not found');
				return false;
			}

			// Set as active project
			await db.setActiveProject(projectId);
			activeProject = project;

			// Check if project overview exists, create if not (migration)
			const overviewPath = path.join(project.root, '.tarx', 'project.md');
			if (!fs.existsSync(overviewPath)) {
				// Migrate: create .tarx folder for existing project
				const tarxDir = path.join(project.root, '.tarx');
				if (!fs.existsSync(tarxDir)) {
					fs.mkdirSync(tarxDir, { recursive: true });
				}
				const projectMd = `---
name: ${project.name}
created: ${new Date(project.createdAt).toISOString()}
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
				console.log('[TARX] Created project overview for existing project:', project.name);
			}

			// Open the folder (this will reload the window)
			const uri = vscode.Uri.file(project.root);
			await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });

			// Note: Opening the overview file after openFolder won't work because
			// the window reloads. Instead, we'll open it on workspace init.
			// For now, show info message
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

	// Projects Refresh - Signal sidebar to reload projects list
	safeRegisterCommand(context, 'tarx.projects.refresh', async () => {
		console.log('[TARX] Projects refresh command triggered');
		// This is a signal command - the sidebar Part listens for this
		// and calls loadProjects() when it fires
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

	console.log('[TARX] Sidebar nav commands registered');

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
		if (!db) {
			return { conversations: [], turns: [] };
		}

		try {
			const projectId = activeProject?.id || null;
			const conversations = await db.getRecentConversations(projectId, limit);
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
	// 8. Workspace change listeners
	// ========================================
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
			// Handle added folders
			for (const folder of e.added) {
				if (projectIndexer && db) {
					const project = await projectIndexer.ensureProject(folder.uri);
					activeProject = project;
					// Start background indexing
					projectIndexer.startIndexing(project);
				}
			}
		})
	);

	console.log('[TARX] Extension activated - Use @tarx in chat');
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
}
