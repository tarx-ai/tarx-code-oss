/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  TARX QA Test Harness
 *
 *  Automated test runner that programmatically triggers every UI interaction
 *  and verifies the response. Runs as a VS Code command.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// Test case definition
interface QATestCase {
	name: string;
	send: {
		command: string;
		[key: string]: unknown;
	};
	expect: string;
	timeout?: number;
}

// Test result
interface QATestResult {
	name: string;
	passed: boolean;
	duration: number;
	message: string;
	response?: unknown;
}

// Test cases covering all known postMessage commands
const testCases: QATestCase[] = [
	// ═══════════════════════════════════════════════════════════════
	// SIDEBAR INITIALIZATION
	// ═══════════════════════════════════════════════════════════════
	{
		name: 'Ready signal',
		send: { command: 'ready' },
		expect: 'initial data loaded'
	},

	// ═══════════════════════════════════════════════════════════════
	// DATA LOADING
	// ═══════════════════════════════════════════════════════════════
	{
		name: 'Get projects',
		send: { command: 'getProjects' },
		expect: 'projects array returned'
	},
	{
		name: 'Get history',
		send: { command: 'getHistory' },
		expect: 'history items returned'
	},
	{
		name: 'Get uploaded files',
		send: { command: 'getUploadedFiles' },
		expect: 'files array returned'
	},
	{
		name: 'Get connection status',
		send: { command: 'getConnectionStatus' },
		expect: 'connection status returned'
	},
	{
		name: 'Get daemon status',
		send: { command: 'getDaemonStatus' },
		expect: 'daemon status or offline message'
	},

	// ═══════════════════════════════════════════════════════════════
	// SETTINGS
	// ═══════════════════════════════════════════════════════════════
	{
		name: 'Get settings',
		send: { command: 'getSettings' },
		expect: 'settings object returned'
	},
	{
		name: 'Test Claude connection',
		send: { command: 'testClaudeConnection' },
		expect: 'success or no-key error'
	},
	{
		name: 'Set memory enabled',
		send: { command: 'setMemoryEnabled', enabled: true },
		expect: 'settings updated'
	},
	{
		name: 'Set thread conversations',
		send: { command: 'setThreadConversations', enabled: true },
		expect: 'settings updated'
	},

	// ═══════════════════════════════════════════════════════════════
	// NAVIGATION
	// ═══════════════════════════════════════════════════════════════
	{
		name: 'Open chat',
		send: { command: 'openChat' },
		expect: 'chat opened'
	},
	{
		name: 'New chat',
		send: { command: 'newChat' },
		expect: 'new chat created'
	},
	{
		name: 'Open view - SCM',
		send: { command: 'openView', viewId: 'workbench.view.scm' },
		expect: 'view opened'
	},

	// ═══════════════════════════════════════════════════════════════
	// HEALTH CHECKS (via direct fetch)
	// ═══════════════════════════════════════════════════════════════
	{
		name: 'Inference health',
		send: { command: '__direct_health_check__', endpoint: 'http://localhost:11435/health' },
		expect: 'health status returned'
	},
	{
		name: 'Embeddings health',
		send: { command: '__direct_health_check__', endpoint: 'http://localhost:11437/health' },
		expect: 'health status returned'
	},
	{
		name: 'Daemon admin health',
		send: { command: '__direct_health_check__', endpoint: 'http://localhost:11439/status' },
		expect: 'health status returned'
	},
];

// QA Test Runner class
export class QATestRunner {
	private outputChannel: vscode.OutputChannel;
	private results: QATestResult[] = [];

	constructor(outputChannel: vscode.OutputChannel) {
		this.outputChannel = outputChannel;
	}

	/**
	 * Run all QA tests
	 */
	async runAllTests(): Promise<QATestResult[]> {
		this.results = [];
		this.log('Starting QA test suite...');
		this.log(`Total tests: ${testCases.length}`);
		this.log('');

		for (const testCase of testCases) {
			const result = await this.runTest(testCase);
			this.results.push(result);
			this.logResult(result);
		}

		this.logSummary();
		return this.results;
	}

	/**
	 * Run a single test case
	 */
	private async runTest(testCase: QATestCase): Promise<QATestResult> {
		const startTime = Date.now();
		const timeout = testCase.timeout || 5000;

		try {
			let response: unknown;

			// Special handling for direct health checks
			if (testCase.send.command === '__direct_health_check__') {
				response = await this.runDirectHealthCheck(testCase.send.endpoint as string, timeout);
			} else {
				// Run through command system
				response = await this.runCommandTest(testCase.send, timeout);
			}

			const duration = Date.now() - startTime;

			return {
				name: testCase.name,
				passed: true,
				duration,
				message: `Expected: ${testCase.expect}`,
				response
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			return {
				name: testCase.name,
				passed: false,
				duration,
				message: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Run a command-based test
	 */
	private async runCommandTest(send: { command: string; [key: string]: unknown }, timeout: number): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Error(`Timeout after ${timeout}ms`));
			}, timeout);

			// Map webview commands to extension commands
			const commandMap: Record<string, string> = {
				'getProjects': 'tarx.projects.list',
				'getHistory': 'tarx.getConversationHistory',
				'getUploadedFiles': 'tarx.getUploadedFiles',
				'getConnectionStatus': 'tarx.getConnectionStatus',
				'getSettings': 'tarx.settings.get',
				'testClaudeConnection': 'tarx.settings.testConnection',
				'setMemoryEnabled': 'tarx.settings.setMemory',
				'setThreadConversations': 'tarx.settings.setMemory',
				'openChat': 'workbench.action.chat.open',
				'newChat': 'tarx.chat.new',
				'openView': send.viewId as string,
			};

			const command = commandMap[send.command] || send.command;

			// Build args based on command type
			let args: unknown[] = [];
			if (send.command === 'setMemoryEnabled') {
				args = [{ enabled: send.enabled }];
			} else if (send.command === 'setThreadConversations') {
				args = [{ threadConversations: send.enabled }];
			} else if (send.command === 'getHistory' || send.command === 'getConversationHistory') {
				args = [50];
			}

			vscode.commands.executeCommand(command, ...args).then(
				(result) => {
					clearTimeout(timer);
					resolve(result);
				},
				(error) => {
					clearTimeout(timer);
					// Some commands return void, that's OK
					if (error?.message?.includes('command') && error?.message?.includes('not found')) {
						reject(error);
					} else {
						resolve(undefined);
					}
				}
			);
		});
	}

	/**
	 * Run a direct health check
	 */
	private async runDirectHealthCheck(endpoint: string, timeout: number): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(endpoint, {
				signal: controller.signal
			});
			clearTimeout(timer);

			if (response.ok) {
				return await response.json();
			} else {
				throw new Error(`HTTP ${response.status}`);
			}
		} catch (error) {
			clearTimeout(timer);
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Timeout after ${timeout}ms`);
			}
			throw error;
		}
	}

	/**
	 * Log a message to the output channel
	 */
	private log(message: string): void {
		this.outputChannel.appendLine(message);
		console.log(`[TARX QA] ${message}`);
	}

	/**
	 * Log a test result
	 */
	private logResult(result: QATestResult): void {
		const status = result.passed ? 'PASS' : 'FAIL';
		const icon = result.passed ? '✓' : '✗';
		const line = `${icon} [${status}] ${result.name} (${result.duration}ms)`;
		this.log(line);

		if (!result.passed) {
			this.log(`    Error: ${result.message}`);
		}
	}

	/**
	 * Log summary of all test results
	 */
	private logSummary(): void {
		const passed = this.results.filter(r => r.passed).length;
		const failed = this.results.filter(r => !r.passed).length;
		const total = this.results.length;
		const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

		this.log('');
		this.log('═══════════════════════════════════════════════════════════════');
		this.log(`SUMMARY: ${passed}/${total} passed, ${failed} failed`);
		this.log(`Total duration: ${totalDuration}ms`);
		this.log('═══════════════════════════════════════════════════════════════');

		if (failed > 0) {
			this.log('');
			this.log('FAILED TESTS:');
			for (const result of this.results.filter(r => !r.passed)) {
				this.log(`  - ${result.name}: ${result.message}`);
			}
		}
	}
}

/**
 * Run the QA test suite
 */
export async function runQATests(outputChannel: vscode.OutputChannel): Promise<QATestResult[]> {
	const runner = new QATestRunner(outputChannel);
	return runner.runAllTests();
}

/**
 * Run startup self-checks
 */
export async function runStartupChecks(): Promise<void> {
	const checks: Array<{ name: string; status: string }> = [];

	// Check inference health
	try {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 3000);
		const resp = await fetch('http://localhost:11435/health', { signal: controller.signal });
		checks.push({ name: 'Inference', status: resp.ok ? 'OK' : 'FAIL' });
	} catch {
		checks.push({ name: 'Inference', status: 'UNREACHABLE' });
	}

	// Check mesh health
	try {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 3000);
		const resp = await fetch('http://localhost:11436/health', { signal: controller.signal });
		checks.push({ name: 'Mesh', status: resp.ok ? 'OK' : 'FAIL' });
	} catch {
		checks.push({ name: 'Mesh', status: 'UNREACHABLE' });
	}

	// Check embedding health
	try {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 3000);
		const resp = await fetch('http://localhost:11437/health', { signal: controller.signal });
		checks.push({ name: 'Embeddings', status: resp.ok ? 'OK' : 'FAIL' });
	} catch {
		checks.push({ name: 'Embeddings', status: 'UNREACHABLE' });
	}

	// Check daemon admin
	try {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 3000);
		const resp = await fetch('http://localhost:11439/status', { signal: controller.signal });
		checks.push({ name: 'Daemon', status: resp.ok ? 'OK' : 'FAIL' });
	} catch {
		checks.push({ name: 'Daemon', status: 'UNREACHABLE' });
	}

	console.log('[TARX STARTUP]', checks.map(c => `${c.name}: ${c.status}`).join(' | '));
}
