/**
 * TARX Network Model - Claude API Adapter
 *
 * Handles streaming communication with Claude API for action-oriented tasks.
 * Used when the router classifies intent as requiring network model capabilities.
 *
 * SECURITY: API keys are stored using VS Code SecretStorage (OS keychain),
 * NOT in plain text configuration files.
 */

import * as vscode from 'vscode';

// Types for Claude API (inline to avoid SDK dependency issues)
interface ClaudeMessage {
	role: 'user' | 'assistant';
	content: string;
}

interface ClaudeStreamEvent {
	type: string;
	delta?: {
		type: string;
		text?: string;
	};
	content_block?: {
		type: string;
		text?: string;
	};
	message?: {
		content: Array<{ type: string; text?: string }>;
	};
}

export interface NetworkModelContext {
	files?: string[];
	cwd?: string;
	history?: Array<{ role: 'user' | 'assistant'; content: string }>;
	projectInstructions?: string;
	activeFile?: string;
	selection?: string;
}

export interface NetworkModelConfig {
	apiKey: string;
	model: string;
	maxTokens: number;
	baseUrl?: string;
}

// Settings interface for webview
export interface NetworkModelSettings {
	claudeApiKeyConfigured: boolean;
	claudeModel: string;
	claudeConnectionStatus: 'connected' | 'error' | 'not_configured';
	localModelStatus: 'connected' | 'disconnected';
	localModelName: string;
	localModelPort: number;
	memoryEnabled: boolean;
	threadConversations: boolean;
}

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const API_KEY_SECRET_KEY = 'tarx.claude.apiKey';
const SETTINGS_PREFIX = 'tarx.network';

// Module-level secrets storage (initialized via initNetworkModel)
let _secrets: vscode.SecretStorage | undefined;
let _globalState: vscode.Memento | undefined;

/**
 * Initialize the network model with extension context
 * MUST be called during extension activation
 */
export function initNetworkModel(context: vscode.ExtensionContext): void {
	_secrets = context.secrets;
	_globalState = context.globalState;
	console.log('[TARX NetworkModel] Initialized with SecretStorage');
}

/**
 * Build system prompt with workspace context
 */
function buildSystemPrompt(context: NetworkModelContext): string {
	const parts: string[] = [
		'You are TARX, a local AI assistant on the user\'s machine, routed through Claude API for complex tasks.',
		'',
		'RULES (follow these exactly):',
		'1. NO CODE BLOCKS unless the user explicitly asks you to write code.',
		'2. NO "Do you want me to proceed?" or "Would you like me to..." — just do it.',
		'3. NO bullet lists or numbered steps unless asked for a list.',
		'4. NO "Certainly!", "Great question!", "I\'d be happy to help!", "Let me help you with that!"',
		'5. NO "Let me know if you need anything else!"',
		'6. Under 3 sentences for simple questions. Talk like a coworker, not a manual.',
		'7. Plain text only for questions and chat. No markdown headers, no structured formats.',
		'8. Be direct. No hedging ("I think", "perhaps", "maybe").',
		'',
		'WHEN TO USE CODE: Only when the user says "write", "code", "implement", "fix this code", "show me how to", or shares a code snippet to modify.',
		'Questions about status, capabilities, or concepts get plain English.',
		'',
		'CODE FORMAT (when code IS needed):',
		'- Use fenced code blocks with file paths: ```typescript:src/path/to/file.ts',
		'- Suggest terminal commands in ```bash blocks',
		'',
	];

	if (context.cwd) {
		parts.push(`WORKSPACE: ${context.cwd}`);
	}

	if (context.files && context.files.length > 0) {
		parts.push(`OPEN FILES: ${context.files.join(', ')}`);
	}

	if (context.activeFile) {
		parts.push(`ACTIVE FILE: ${context.activeFile}`);
	}

	if (context.selection) {
		parts.push('', 'USER SELECTION:', '```', context.selection, '```');
	}

	if (context.projectInstructions) {
		parts.push('', 'PROJECT INSTRUCTIONS:', context.projectInstructions);
	}

	return parts.join('\n');
}

/**
 * Format conversation history for Claude API
 */
function formatHistory(history: NetworkModelContext['history']): ClaudeMessage[] {
	if (!history || history.length === 0) {
		return [];
	}

	return history.map(msg => ({
		role: msg.role,
		content: msg.content,
	}));
}

/**
 * Get API key from VS Code SecretStorage or environment
 * SECURE: Uses OS keychain via SecretStorage, not plain text config
 */
export async function getApiKey(): Promise<string | undefined> {
	// Try SecretStorage first (secure, encrypted via OS keychain)
	if (_secrets) {
		const storedKey = await _secrets.get(API_KEY_SECRET_KEY);
		if (storedKey) {
			return storedKey;
		}
	}

	// Fall back to environment variable (for CI/testing)
	return process.env.ANTHROPIC_API_KEY;
}

/**
 * Check if API key is available
 */
export async function hasApiKey(): Promise<boolean> {
	const key = await getApiKey();
	return Boolean(key && key.length > 0);
}

/**
 * Store API key in VS Code SecretStorage (encrypted via OS keychain)
 * SECURE: Never stored in plain text settings files
 */
export async function storeApiKey(key: string): Promise<void> {
	if (!_secrets) {
		throw new Error('NetworkModel not initialized. Call initNetworkModel() first.');
	}
	await _secrets.store(API_KEY_SECRET_KEY, key);
	console.log('[TARX NetworkModel] API key stored securely');
}

/**
 * Delete API key from SecretStorage
 */
export async function deleteApiKey(): Promise<void> {
	if (!_secrets) {
		throw new Error('NetworkModel not initialized. Call initNetworkModel() first.');
	}
	await _secrets.delete(API_KEY_SECRET_KEY);
	console.log('[TARX NetworkModel] API key deleted');
}

/**
 * Get the currently configured model
 */
export function getConfiguredModel(): string {
	const config = vscode.workspace.getConfiguration(SETTINGS_PREFIX);
	return config.get<string>('model', DEFAULT_MODEL);
}

/**
 * Set the model to use for Claude API calls
 */
export async function setConfiguredModel(model: string): Promise<void> {
	const config = vscode.workspace.getConfiguration(SETTINGS_PREFIX);
	await config.update('model', model, vscode.ConfigurationTarget.Global);
}

/**
 * Get memory settings
 */
export function getMemorySettings(): { enabled: boolean; threadConversations: boolean } {
	if (_globalState) {
		return {
			enabled: _globalState.get('tarx.memory.enabled', true),
			threadConversations: _globalState.get('tarx.memory.threadConversations', true)
		};
	}
	return { enabled: true, threadConversations: true };
}

/**
 * Set memory settings
 */
export async function setMemorySettings(settings: { enabled?: boolean; threadConversations?: boolean }): Promise<void> {
	if (!_globalState) {
		throw new Error('NetworkModel not initialized. Call initNetworkModel() first.');
	}
	if (settings.enabled !== undefined) {
		await _globalState.update('tarx.memory.enabled', settings.enabled);
	}
	if (settings.threadConversations !== undefined) {
		await _globalState.update('tarx.memory.threadConversations', settings.threadConversations);
	}
}

/**
 * Get all settings for the webview
 */
export async function getNetworkModelSettings(): Promise<NetworkModelSettings> {
	const hasKey = await hasApiKey();
	const memorySettings = getMemorySettings();

	// Default local model settings
	const localConfig = vscode.workspace.getConfiguration('tarx');
	const localUrl = localConfig.get<string>('localUrl', 'http://localhost:11435');
	const localPort = parseInt(localUrl.split(':').pop() || '11435', 10);

	return {
		claudeApiKeyConfigured: hasKey,
		claudeModel: getConfiguredModel(),
		claudeConnectionStatus: hasKey ? 'connected' : 'not_configured',
		localModelStatus: 'disconnected', // Will be updated by health check
		localModelName: 'Qwen 2.5 Coder 8B',
		localModelPort: localPort,
		memoryEnabled: memorySettings.enabled,
		threadConversations: memorySettings.threadConversations
	};
}

/**
 * Stream response from Claude API
 *
 * @param message - User's message
 * @param context - Workspace context
 * @param config - Optional configuration overrides
 */
export async function* streamNetworkResponse(
	message: string,
	context: NetworkModelContext,
	config?: Partial<NetworkModelConfig>
): AsyncGenerator<string, void, unknown> {
	// QA Timing: Track response timing
	const requestStart = Date.now();
	let firstTokenTime: number | null = null;
	let totalTokens = 0;

	const apiKey = config?.apiKey || await getApiKey();

	if (!apiKey) {
		throw new Error('No API key available. Please configure your Anthropic API key.');
	}

	const model = config?.model || DEFAULT_MODEL;
	const maxTokens = config?.maxTokens || DEFAULT_MAX_TOKENS;
	const baseUrl = config?.baseUrl || DEFAULT_BASE_URL;

	const systemPrompt = buildSystemPrompt(context);
	const messages = [
		...formatHistory(context.history),
		{ role: 'user' as const, content: message },
	];

	console.log(`[TARX QA] Claude API request started (model: ${model})`);

	const response = await fetch(`${baseUrl}/v1/messages`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			system: systemPrompt,
			messages,
			stream: true,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Claude API error (${response.status}): ${errorText}`);
	}

	if (!response.body) {
		throw new Error('No response body from Claude API');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			if (line.startsWith('data: ')) {
				const data = line.slice(6);

				if (data === '[DONE]') {
					return;
				}

				try {
					const event: ClaudeStreamEvent = JSON.parse(data);

					if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
						// QA Timing: Track first token
						if (firstTokenTime === null) {
							firstTokenTime = Date.now();
							console.log(`[TARX QA] Claude TTFT: ${firstTokenTime - requestStart}ms`);
						}
						totalTokens++;
						yield event.delta.text || '';
					}
				} catch {
					// Skip malformed JSON
				}
			}
		}
		}

		// QA Timing: Log response completion
		const totalTime = Date.now() - requestStart;
		const ttft = firstTokenTime ? firstTokenTime - requestStart : null;
		console.log(`[TARX QA] Claude response complete: ${totalTime}ms total, ${ttft ?? 'N/A'}ms TTFT, ${totalTokens} tokens`);
	} catch (error) {
		// QA Timing: Log error timing
		const errorTime = Date.now() - requestStart;
		console.log(`[TARX QA] Claude response error after ${errorTime}ms: ${error}`);
		throw error;
	}
}

/**
 * Non-streaming response from Claude API
 */
export async function getNetworkResponse(
	message: string,
	context: NetworkModelContext,
	config?: Partial<NetworkModelConfig>
): Promise<string> {
	const chunks: string[] = [];

	for await (const chunk of streamNetworkResponse(message, context, config)) {
		chunks.push(chunk);
	}

	return chunks.join('');
}

/**
 * Test Claude API connection
 */
export async function testConnection(apiKey?: string): Promise<{ success: boolean; error?: string; model?: string }> {
	const key = apiKey || await getApiKey();

	if (!key) {
		return { success: false, error: 'No API key configured' };
	}

	try {
		const response = await fetch(`${DEFAULT_BASE_URL}/v1/messages`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': key,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: DEFAULT_MODEL,
				max_tokens: 10,
				messages: [{ role: 'user', content: 'Hi' }],
			}),
		});

		if (response.ok) {
			return { success: true, model: DEFAULT_MODEL };
		} else {
			const errorText = await response.text();
			return { success: false, error: `API error: ${response.status} - ${errorText}` };
		}
	} catch (error) {
		return { success: false, error: `Connection failed: ${error}` };
	}
}

/**
 * Prompt user for API key with setup dialog
 */
export async function promptForApiKey(): Promise<string | undefined> {
	const getKeyAction = 'Get API Key';
	const enterKeyAction = 'Enter Key';

	const action = await vscode.window.showInformationMessage(
		'To handle this task, TARX needs access to Claude API.',
		{ modal: true },
		getKeyAction,
		enterKeyAction
	);

	if (action === getKeyAction) {
		vscode.env.openExternal(vscode.Uri.parse('https://console.anthropic.com/settings/keys'));
		// Follow up with key entry
		return promptForApiKeyEntry();
	} else if (action === enterKeyAction) {
		return promptForApiKeyEntry();
	}

	return undefined;
}

/**
 * Show input box for API key entry
 */
async function promptForApiKeyEntry(): Promise<string | undefined> {
	const key = await vscode.window.showInputBox({
		prompt: 'Enter your Anthropic API key',
		password: true,
		placeHolder: 'sk-ant-...',
		validateInput: (value) => {
			if (!value || value.length < 10) {
				return 'Please enter a valid API key';
			}
			if (!value.startsWith('sk-ant-')) {
				return 'API key should start with "sk-ant-"';
			}
			return undefined;
		},
	});

	if (key) {
		await storeApiKey(key);
		vscode.window.showInformationMessage('API key saved successfully!');
	}

	return key;
}
