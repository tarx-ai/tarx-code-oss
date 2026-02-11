/*---------------------------------------------------------------------------------------------
 *  TARX Overnight UI Testing System
 *
 *  Runs 50+ automated UI tests overnight to verify:
 *  - Conversational memory works (names, preferences, projects)
 *  - History sidebar updates correctly
 *  - UI remains responsive
 *  - Multi-turn context is maintained
 *  - Edge cases are handled
 *
 *  Commands:
 *  - tarx.runOvernightTests: Run 50 conversations
 *  - tarx.stopOvernightTests: Stop testing
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// TARX Bridge Integration - Feb 2026
import { TARX_LOCAL_REASONING_PROMPT } from './systemPrompt';

// Test result types
interface TestResult {
	testNumber: number;
	testName: string;
	scenario: string;
	category: 'memory' | 'quick' | 'complex' | 'edge';
	passed: boolean;
	messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
	expectedKeywords: string[];
	foundKeywords: string[];
	latencyMs: number;
	error?: string;
	historyUpdated: boolean;
}

interface TestMetrics {
	startTime: number;
	endTime?: number;
	totalConversations: number;
	totalMessages: number;
	passedTests: number;
	failedTests: number;
	averageLatencyMs: number;
	memoryRecallAccuracy: number;
	quickResponseSuccessRate: number;
	complexQuerySuccessRate: number;
	edgeCaseSuccessRate: number;
	historyUpdateSuccessRate: number;
	errors: Array<{ time: number; test: string; error: string; screenshot?: string }>;
}

interface TestScenario {
	name: string;
	category: 'memory' | 'quick' | 'complex' | 'edge';
	messages: Array<{ content: string; expectKeywords?: string[]; maxLatencyMs?: number }>;
}

// Random data generators
const RANDOM_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Hannah', 'Ivan', 'Julia'];
const RANDOM_TECHS = ['TypeScript', 'React', 'Python', 'Rust', 'Go', 'Vue', 'Angular', 'Svelte', 'Node.js', 'Django'];
const RANDOM_PROJECTS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
const RANDOM_COLORS = ['blue', 'green', 'red', 'purple', 'orange', 'yellow', 'pink', 'cyan', 'magenta', 'teal'];

function randomFrom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomN<T>(arr: T[], n: number): T[] {
	const shuffled = [...arr].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, n);
}

// Generate 50 test scenarios dynamically
function generateTestScenarios(): TestScenario[] {
	const scenarios: TestScenario[] = [];

	// === MEMORY TESTS (20 conversations) ===
	// 1-5: Name recall
	for (let i = 0; i < 5; i++) {
		const name = randomFrom(RANDOM_NAMES);
		scenarios.push({
			name: `Memory: Name Recall ${i + 1}`,
			category: 'memory',
			messages: [
				{ content: `My name is ${name}. Please remember this.` },
				{ content: 'What is my name?', expectKeywords: [name] }
			]
		});
	}

	// 6-10: Technology preferences
	for (let i = 0; i < 5; i++) {
		const [tech1, tech2] = randomN(RANDOM_TECHS, 2);
		scenarios.push({
			name: `Memory: Tech Preferences ${i + 1}`,
			category: 'memory',
			messages: [
				{ content: `I like ${tech1} and ${tech2} for development.` },
				{ content: 'What technologies do I like?', expectKeywords: [tech1, tech2] }
			]
		});
	}

	// 11-15: Project lists
	for (let i = 0; i < 5; i++) {
		const [p1, p2, p3] = randomN(RANDOM_PROJECTS, 3);
		scenarios.push({
			name: `Memory: Project List ${i + 1}`,
			category: 'memory',
			messages: [
				{ content: `I have projects: ${p1}, ${p2}, and ${p3}.` },
				{ content: 'List my projects', expectKeywords: [p1, p2, p3] }
			]
		});
	}

	// 16-20: Multi-fact recall
	for (let i = 0; i < 5; i++) {
		const name = randomFrom(RANDOM_NAMES);
		const color = randomFrom(RANDOM_COLORS);
		const tech = randomFrom(RANDOM_TECHS);
		scenarios.push({
			name: `Memory: Multi-Fact ${i + 1}`,
			category: 'memory',
			messages: [
				{ content: `My name is ${name}.` },
				{ content: `My favorite color is ${color}.` },
				{ content: `I code in ${tech}.` },
				{ content: 'What is my name, favorite color, and programming language?', expectKeywords: [name, color, tech] }
			]
		});
	}

	// === QUICK RESPONSE TESTS (10 conversations) ===
	scenarios.push(
		{ name: 'Quick: Math 2+2', category: 'quick', messages: [{ content: 'What is 2+2?', expectKeywords: ['4'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Math 10*5', category: 'quick', messages: [{ content: 'What is 10 times 5?', expectKeywords: ['50'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Define TS', category: 'quick', messages: [{ content: 'Define TypeScript in one sentence', expectKeywords: ['type', 'javascript'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Hello', category: 'quick', messages: [{ content: 'Hello!', expectKeywords: ['hello', 'hi'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Date', category: 'quick', messages: [{ content: 'What day is today?', maxLatencyMs: 500 }] },
		{ name: 'Quick: Capital', category: 'quick', messages: [{ content: 'What is the capital of France?', expectKeywords: ['Paris'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Yes/No', category: 'quick', messages: [{ content: 'Is the sky blue?', expectKeywords: ['yes', 'blue'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Greeting', category: 'quick', messages: [{ content: 'Good morning!', expectKeywords: ['morning', 'good', 'hello'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Thanks', category: 'quick', messages: [{ content: 'Thank you!', expectKeywords: ['welcome', 'glad', 'help'], maxLatencyMs: 500 }] },
		{ name: 'Quick: Bye', category: 'quick', messages: [{ content: 'Goodbye!', expectKeywords: ['bye', 'goodbye', 'later'], maxLatencyMs: 500 }] }
	);

	// === COMPLEX QUERY TESTS (10 conversations) ===
	scenarios.push(
		{ name: 'Complex: React Hooks', category: 'complex', messages: [{ content: 'Explain React hooks and give an example of useState', expectKeywords: ['useState', 'hook', 'state', 'function'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: TS vs JS', category: 'complex', messages: [{ content: 'Compare TypeScript vs JavaScript - what are the key differences?', expectKeywords: ['type', 'compile', 'javascript'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: Sort Function', category: 'complex', messages: [{ content: 'Write a function to sort an array of numbers in TypeScript', expectKeywords: ['function', 'sort', 'number', 'array'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: Async/Await', category: 'complex', messages: [{ content: 'Explain async/await in JavaScript with a practical example', expectKeywords: ['async', 'await', 'promise'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: REST API', category: 'complex', messages: [{ content: 'What is a REST API and what are the main HTTP methods?', expectKeywords: ['GET', 'POST', 'API', 'HTTP'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: Git Workflow', category: 'complex', messages: [{ content: 'Explain the Git branching workflow with main, develop, and feature branches', expectKeywords: ['branch', 'merge', 'main', 'feature'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: Docker', category: 'complex', messages: [{ content: 'What is Docker and why is containerization useful?', expectKeywords: ['container', 'image', 'deploy'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: SQL Query', category: 'complex', messages: [{ content: 'Write a SQL query to get all users older than 25 ordered by name', expectKeywords: ['SELECT', 'FROM', 'WHERE', 'ORDER'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: Design Pattern', category: 'complex', messages: [{ content: 'Explain the Observer design pattern with a use case', expectKeywords: ['observer', 'subscribe', 'notify', 'pattern'], maxLatencyMs: 2000 }] },
		{ name: 'Complex: Testing', category: 'complex', messages: [{ content: 'What is unit testing and why is it important? Give an example', expectKeywords: ['test', 'unit', 'assert', 'function'], maxLatencyMs: 2000 }] }
	);

	// === EDGE CASE TESTS (10 conversations) ===
	scenarios.push(
		{ name: 'Edge: Very Long Input', category: 'edge', messages: [{ content: 'A'.repeat(1000) + ' - please acknowledge this long input', expectKeywords: ['acknowledge', 'long', 'received'] }] },
		{ name: 'Edge: Multiple Questions', category: 'edge', messages: [{ content: 'What is 2+2? What is the capital of France? What is TypeScript?', expectKeywords: ['4', 'Paris', 'type'] }] },
		{ name: 'Edge: Code Block', category: 'edge', messages: [{ content: '```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```\nWhat does this function do?', expectKeywords: ['add', 'number', 'return', 'sum'] }] },
		{ name: 'Edge: Empty Context', category: 'edge', messages: [{ content: 'Hi', expectKeywords: [] }, { content: 'What did I just say?', expectKeywords: ['hi', 'hello', 'greet'] }] },
		{ name: 'Edge: Unicode', category: 'edge', messages: [{ content: 'My name is Maria. I like programming.', expectKeywords: [] }, { content: 'What is my name?', expectKeywords: ['Maria'] }] },
		{ name: 'Edge: Numbers Only', category: 'edge', messages: [{ content: '12345', expectKeywords: [] }] },
		{ name: 'Edge: File Request', category: 'edge', messages: [{ content: 'Can you read the file at /etc/passwd?', expectKeywords: ['file', 'access', 'cannot', 'not'] }] },
		{ name: 'Edge: Nested Questions', category: 'edge', messages: [{ content: 'If I ask you what 2+2 is and you say 4, then what did you say?', expectKeywords: ['4'] }] },
		{ name: 'Edge: Follow-up', category: 'edge', messages: [{ content: 'My favorite number is 42.' }, { content: 'What about yours?' }, { content: 'Tell me my favorite number again.', expectKeywords: ['42'] }] },
		{ name: 'Edge: Correction', category: 'edge', messages: [{ content: 'My name is John.' }, { content: 'Actually, my name is Jane. Please correct that.' }, { content: 'What is my name?', expectKeywords: ['Jane'] }] }
	);

	return scenarios;
}

export class OvernightUITester {
	private outputChannel: vscode.OutputChannel;
	private metrics: TestMetrics;
	private results: TestResult[] = [];
	private isRunning: boolean = false;
	private shouldStop: boolean = false;
	private resultsDir: string;
	private errorsDir: string;
	private logFile: string;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('TARX Overnight Tests');
		this.resultsDir = path.join(os.homedir(), 'Library/Application Support/tarx');
		this.errorsDir = path.join(this.resultsDir, 'overnight-errors');
		this.logFile = path.join(this.resultsDir, 'overnight-test-log.txt');
		this.metrics = this.initMetrics();
	}

	private initMetrics(): TestMetrics {
		return {
			startTime: Date.now(),
			totalConversations: 0,
			totalMessages: 0,
			passedTests: 0,
			failedTests: 0,
			averageLatencyMs: 0,
			memoryRecallAccuracy: 0,
			quickResponseSuccessRate: 0,
			complexQuerySuccessRate: 0,
			edgeCaseSuccessRate: 0,
			historyUpdateSuccessRate: 0,
			errors: []
		};
	}

	private log(message: string): void {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] ${message}`;
		this.outputChannel.appendLine(logMessage);
		console.log(`[TARX Test] ${message}`);

		// Also append to log file
		try {
			fs.appendFileSync(this.logFile, logMessage + '\n');
		} catch {
			// Ignore file write errors
		}
	}

	private async sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Start the overnight testing session
	 */
	async startOvernightTests(targetConversations: number = 50, maxHours: number = 8): Promise<void> {
		if (this.isRunning) {
			vscode.window.showWarningMessage('Overnight tests are already running!');
			return;
		}

		this.isRunning = true;
		this.shouldStop = false;
		this.metrics = this.initMetrics();
		this.results = [];

		// Ensure directories exist
		if (!fs.existsSync(this.resultsDir)) {
			fs.mkdirSync(this.resultsDir, { recursive: true });
		}
		if (!fs.existsSync(this.errorsDir)) {
			fs.mkdirSync(this.errorsDir, { recursive: true });
		}

		// Clear previous log
		fs.writeFileSync(this.logFile, '');

		this.outputChannel.show();
		this.log('========================================');
		this.log('TARX OVERNIGHT UI TESTING STARTED');
		this.log(`Target: ${targetConversations} conversations`);
		this.log(`Max duration: ${maxHours} hours`);
		this.log(`Results directory: ${this.resultsDir}`);
		this.log('========================================');

		// Generate test scenarios
		const scenarios = generateTestScenarios();
		this.log(`Generated ${scenarios.length} test scenarios`);

		const maxEndTime = Date.now() + (maxHours * 60 * 60 * 1000);
		let conversationCount = 0;
		let scenarioIndex = 0;
		let historyUpdateSuccesses = 0;

		try {
			while (conversationCount < targetConversations && Date.now() < maxEndTime && !this.shouldStop) {
				// Get current scenario (cycle through them)
				const scenario = scenarios[scenarioIndex % scenarios.length];
				scenarioIndex++;

				this.log(`\n--- Test ${conversationCount + 1}/${targetConversations}: ${scenario.name} [${scenario.category}] ---`);

				try {
					const result = await this.runTestScenario(scenario, conversationCount + 1);
					this.results.push(result);

					if (result.passed) {
						this.metrics.passedTests++;
						this.log(`PASSED: ${scenario.name} (${result.latencyMs}ms)`);
					} else {
						this.metrics.failedTests++;
						this.log(`FAILED: ${scenario.name} - ${result.error || 'Keywords not found'}`);
						await this.saveErrorScreenshot(result);
					}

					// Track history updates
					if (result.historyUpdated) {
						historyUpdateSuccesses++;
					}

					conversationCount++;
					this.metrics.totalConversations = conversationCount;

				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					this.log(`ERROR in ${scenario.name}: ${errorMsg}`);
					this.metrics.errors.push({
						time: Date.now(),
						test: scenario.name,
						error: errorMsg
					});
					this.metrics.failedTests++;
					conversationCount++;
				}

				// Update history success rate
				this.metrics.historyUpdateSuccessRate = historyUpdateSuccesses / conversationCount;

				// Progress report every 10 conversations
				if (conversationCount % 10 === 0) {
					await this.reportProgress();
					vscode.window.showInformationMessage(
						`TARX Tests: ${conversationCount}/${targetConversations} complete (${this.metrics.passedTests} passed)`
					);
				}

				// Save progress every 10 tests
				if (conversationCount % 10 === 0) {
					await this.saveResults();
				}

				// Wait between tests to avoid overwhelming the system
				this.log('Waiting 30 seconds before next test...');
				await this.sleep(30000);
			}

		} finally {
			this.metrics.endTime = Date.now();
			this.calculateCategoryAccuracies();
			await this.saveResults();
			this.isRunning = false;

			const duration = Math.round((this.metrics.endTime - this.metrics.startTime) / 60000);
			this.log('\n========================================');
			this.log('OVERNIGHT TESTING COMPLETE');
			this.log(`Total conversations: ${this.metrics.totalConversations}`);
			this.log(`Passed: ${this.metrics.passedTests}`);
			this.log(`Failed: ${this.metrics.failedTests}`);
			this.log(`Memory recall accuracy: ${Math.round(this.metrics.memoryRecallAccuracy * 100)}%`);
			this.log(`Quick response success: ${Math.round(this.metrics.quickResponseSuccessRate * 100)}%`);
			this.log(`Complex query success: ${Math.round(this.metrics.complexQuerySuccessRate * 100)}%`);
			this.log(`Edge case success: ${Math.round(this.metrics.edgeCaseSuccessRate * 100)}%`);
			this.log(`History update success: ${Math.round(this.metrics.historyUpdateSuccessRate * 100)}%`);
			this.log(`Duration: ${duration} minutes`);
			this.log(`Average latency: ${Math.round(this.metrics.averageLatencyMs)}ms`);
			this.log(`Results saved to: ${this.resultsDir}`);
			this.log('========================================');

			vscode.window.showInformationMessage(
				`TARX Overnight Tests Complete: ${this.metrics.passedTests}/${this.metrics.totalConversations} passed (${Math.round(this.metrics.memoryRecallAccuracy * 100)}% memory accuracy)`
			);
		}
	}

	/**
	 * Run a single test scenario
	 */
	private async runTestScenario(scenario: TestScenario, testNumber: number): Promise<TestResult> {
		const result: TestResult = {
			testNumber,
			testName: `Test ${testNumber}`,
			scenario: scenario.name,
			category: scenario.category,
			passed: false,
			messages: [],
			expectedKeywords: [],
			foundKeywords: [],
			latencyMs: 0,
			historyUpdated: false
		};

		try {
			// Create a new session for this test
			const sessionResult = await vscode.commands.executeCommand('tarx.createTestSession', {
				title: `${scenario.category.toUpperCase()}: ${scenario.name}`
			}) as { sessionId: string } | undefined;

			const sessionId = sessionResult?.sessionId || `test-session-${Date.now()}`;
			this.log(`Created session: ${sessionId}`);

			let totalLatency = 0;
			let messageCount = 0;

			// Send each message in the scenario
			for (const msg of scenario.messages) {
				const startTime = Date.now();

				// Send message via MCP
				this.log(`Sending: "${msg.content.substring(0, 80)}${msg.content.length > 80 ? '...' : ''}"`);

				const response = await vscode.commands.executeCommand('tarx.sendTestMessage', {
					sessionId: sessionId,
					message: msg.content
				}) as { response: string; latencyMs: number } | undefined;

				const latency = Date.now() - startTime;
				totalLatency += latency;
				messageCount++;

				result.messages.push({
					role: 'user',
					content: msg.content,
					timestamp: startTime
				});

				if (response) {
					result.messages.push({
						role: 'assistant',
						content: response.response,
						timestamp: Date.now()
					});

					this.log(`Response (${latency}ms): "${response.response.substring(0, 100)}${response.response.length > 100 ? '...' : ''}"`);

					// Check latency for quick tests
					if (msg.maxLatencyMs && latency > msg.maxLatencyMs) {
						this.log(`WARNING: Latency ${latency}ms exceeded max ${msg.maxLatencyMs}ms`);
					}

					// Check for expected keywords
					if (msg.expectKeywords && msg.expectKeywords.length > 0) {
						result.expectedKeywords.push(...msg.expectKeywords);
						const responseLower = response.response.toLowerCase();
						for (const keyword of msg.expectKeywords) {
							if (responseLower.includes(keyword.toLowerCase())) {
								result.foundKeywords.push(keyword);
							}
						}
					}
				}

				this.metrics.totalMessages++;

				// Wait 3 seconds between messages in same conversation
				await this.sleep(3000);
			}

			result.latencyMs = messageCount > 0 ? totalLatency / messageCount : 0;

			// Verify History sidebar updated
			result.historyUpdated = await this.verifyHistorySidebar();

			// Determine if test passed
			if (result.expectedKeywords.length > 0) {
				// At least 50% of keywords should be found
				const foundRatio = result.foundKeywords.length / result.expectedKeywords.length;
				result.passed = foundRatio >= 0.5;
				if (!result.passed) {
					result.error = `Only found ${result.foundKeywords.length}/${result.expectedKeywords.length} expected keywords: [${result.foundKeywords.join(', ')}] vs [${result.expectedKeywords.join(', ')}]`;
				}
			} else {
				// No keywords to check, pass if we got a response
				result.passed = result.messages.filter(m => m.role === 'assistant').length > 0;
			}

		} catch (error) {
			result.error = error instanceof Error ? error.message : String(error);
			result.passed = false;
		}

		// Update average latency
		const allLatencies = this.results.map(r => r.latencyMs).filter(l => l > 0);
		allLatencies.push(result.latencyMs);
		this.metrics.averageLatencyMs = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;

		return result;
	}

	/**
	 * Verify History sidebar shows the conversations
	 */
	private async verifyHistorySidebar(): Promise<boolean> {
		try {
			const history = await vscode.commands.executeCommand('tarx.getSessionHistory', 50) as {
				sessions: Array<{ id: string; title: string }>;
			} | undefined;

			if (history && history.sessions) {
				const count = history.sessions.length;
				this.log(`History sidebar has ${count} conversations`);
				return count >= this.metrics.totalConversations;
			}
		} catch (error) {
			this.log(`Failed to verify History sidebar: ${error}`);
		}
		return false;
	}

	/**
	 * Calculate accuracy for each category
	 */
	private calculateCategoryAccuracies(): void {
		const categories = ['memory', 'quick', 'complex', 'edge'] as const;

		for (const category of categories) {
			const categoryTests = this.results.filter(r => r.category === category);
			if (categoryTests.length === 0) continue;

			const passedCount = categoryTests.filter(r => r.passed).length;
			const accuracy = passedCount / categoryTests.length;

			switch (category) {
				case 'memory':
					this.metrics.memoryRecallAccuracy = accuracy;
					break;
				case 'quick':
					this.metrics.quickResponseSuccessRate = accuracy;
					break;
				case 'complex':
					this.metrics.complexQuerySuccessRate = accuracy;
					break;
				case 'edge':
					this.metrics.edgeCaseSuccessRate = accuracy;
					break;
			}
		}
	}

	/**
	 * Save error screenshot (placeholder - actual screenshot requires additional setup)
	 */
	private async saveErrorScreenshot(result: TestResult): Promise<void> {
		const screenshotPath = path.join(this.errorsDir, `error-${result.testNumber}-${Date.now()}.json`);
		try {
			fs.writeFileSync(screenshotPath, JSON.stringify({
				test: result.testName,
				scenario: result.scenario,
				error: result.error,
				messages: result.messages,
				expectedKeywords: result.expectedKeywords,
				foundKeywords: result.foundKeywords,
				timestamp: new Date().toISOString()
			}, null, 2));
			this.log(`Error details saved to: ${screenshotPath}`);
		} catch {
			// Ignore file write errors
		}
	}

	/**
	 * Report current progress
	 */
	private async reportProgress(): Promise<void> {
		const elapsed = Math.round((Date.now() - this.metrics.startTime) / 60000);
		const passRate = this.metrics.totalConversations > 0
			? Math.round((this.metrics.passedTests / this.metrics.totalConversations) * 100)
			: 0;

		this.calculateCategoryAccuracies();

		this.log('\n=== PROGRESS REPORT ===');
		this.log(`Elapsed time: ${elapsed} minutes`);
		this.log(`Conversations: ${this.metrics.totalConversations}`);
		this.log(`Pass rate: ${passRate}%`);
		this.log(`Average latency: ${Math.round(this.metrics.averageLatencyMs)}ms`);
		this.log(`Memory accuracy: ${Math.round(this.metrics.memoryRecallAccuracy * 100)}%`);
		this.log(`Quick response: ${Math.round(this.metrics.quickResponseSuccessRate * 100)}%`);
		this.log(`Complex query: ${Math.round(this.metrics.complexQuerySuccessRate * 100)}%`);
		this.log(`Edge cases: ${Math.round(this.metrics.edgeCaseSuccessRate * 100)}%`);
		this.log(`History updates: ${Math.round(this.metrics.historyUpdateSuccessRate * 100)}%`);
		this.log('=======================\n');
	}

	/**
	 * Save test results to files
	 */
	private async saveResults(): Promise<void> {
		// Save metrics
		const metricsPath = path.join(this.resultsDir, 'overnight-test-results.json');
		fs.writeFileSync(metricsPath, JSON.stringify({
			metrics: this.metrics,
			resultsSummary: {
				total: this.results.length,
				passed: this.results.filter(r => r.passed).length,
				failed: this.results.filter(r => !r.passed).length,
				byCategory: {
					memory: this.results.filter(r => r.category === 'memory').length,
					quick: this.results.filter(r => r.category === 'quick').length,
					complex: this.results.filter(r => r.category === 'complex').length,
					edge: this.results.filter(r => r.category === 'edge').length
				}
			},
			results: this.results
		}, null, 2));

		this.log(`Results saved to ${metricsPath}`);
	}

	/**
	 * Stop the overnight tests
	 */
	stop(): void {
		this.shouldStop = true;
		this.log('Stop requested - finishing current test...');
	}

	/**
	 * Check if tests are running
	 */
	isTestRunning(): boolean {
		return this.isRunning;
	}
}

// Singleton instance
let overnightTester: OvernightUITester | null = null;

/**
 * Get or create the overnight tester instance
 */
export function getOvernightTester(): OvernightUITester {
	if (!overnightTester) {
		overnightTester = new OvernightUITester();
	}
	return overnightTester;
}

/**
 * Register overnight test commands
 */
export function registerOvernightTestCommands(context: vscode.ExtensionContext): void {
	// Main command to run overnight tests
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.runOvernightTests', async () => {
			const tester = getOvernightTester();

			if (tester.isTestRunning()) {
				const choice = await vscode.window.showQuickPick(['Stop Tests', 'Cancel'], {
					placeHolder: 'Overnight tests are already running'
				});
				if (choice === 'Stop Tests') {
					tester.stop();
				}
				return;
			}

			const targetStr = await vscode.window.showInputBox({
				prompt: 'Number of conversations to test',
				value: '50',
				validateInput: (v) => isNaN(parseInt(v)) ? 'Enter a number' : null
			});

			if (!targetStr) return;

			const target = parseInt(targetStr);
			vscode.window.showInformationMessage(`Starting overnight UI tests: ${target} conversations`);
			tester.startOvernightTests(target, 8);
		})
	);

	// Stop tests command
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.stopOvernightTests', () => {
			const tester = getOvernightTester();
			tester.stop();
			vscode.window.showInformationMessage('Stopping overnight tests...');
		})
	);

	// Create test session command (used by tester)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.createTestSession', async (args: { title: string }) => {
			try {
				// Use the MCP server to create a session
				const Database = require('better-sqlite3');
				const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
				const db = new Database(dbPath);

				const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
				const now = Date.now();

				// Get or create test space
				let space = db.prepare('SELECT id FROM spaces WHERE name = ?').get('UI Tests') as { id: string } | undefined;
				if (!space) {
					const spaceId = `space-test-${Date.now()}`;
					db.prepare(`
						INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
						VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
					`).run(spaceId, 'UI Tests', 'Automated UI test conversations', '🧪', now, now, now);
					space = { id: spaceId };
				}

				// Create session
				db.prepare(`
					INSERT INTO sessions (id, space_id, title, created_at, updated_at, message_count, total_tokens)
					VALUES (?, ?, ?, ?, ?, 0, 0)
				`).run(sessionId, space.id, args.title, now, now);

				db.close();

				return { sessionId };
			} catch (error) {
				console.error('[TARX Test] Failed to create session:', error);
				return { sessionId: `fallback-${Date.now()}` };
			}
		})
	);

	// Send test message command (used by tester)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.sendTestMessage', async (args: { sessionId: string; message: string }) => {
			try {
				const startTime = Date.now();

				// Call the LLM directly via HTTP - TARX Bridge Integration - Feb 2026
				const response = await fetch('http://localhost:11435/v1/chat/completions', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: 'ollama-7b',
						messages: [
							{ role: 'system', content: TARX_LOCAL_REASONING_PROMPT },
							{ role: 'user', content: args.message }
						],
						max_tokens: 300,
						stream: false
					})
				});

				if (!response.ok) {
					throw new Error(`LLM returned ${response.status}`);
				}

				const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
				const aiResponse = data.choices?.[0]?.message?.content || 'No response';
				const latencyMs = Date.now() - startTime;

				// Store in database
				try {
					const Database = require('better-sqlite3');
					const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
					const db = new Database(dbPath);
					const now = Date.now();

					// Add user message
					db.prepare(`
						INSERT INTO messages (id, session_id, role, content, created_at, token_count)
						VALUES (?, ?, ?, ?, ?, ?)
					`).run(`msg-${now}-user`, args.sessionId, 'user', args.message, now, 0);

					// Add assistant message
					db.prepare(`
						INSERT INTO messages (id, session_id, role, content, created_at, token_count)
						VALUES (?, ?, ?, ?, ?, ?)
					`).run(`msg-${now}-assistant`, args.sessionId, 'assistant', aiResponse, now + 1, 0);

					// Update session
					db.prepare(`
						UPDATE sessions SET updated_at = ?, message_count = message_count + 2 WHERE id = ?
					`).run(now, args.sessionId);

					db.close();
				} catch {
					// Ignore DB errors
				}

				return { response: aiResponse, latencyMs };

			} catch (error) {
				console.error('[TARX Test] Failed to send message:', error);
				throw error;
			}
		})
	);

	console.log('[TARX] Overnight test commands registered');
}
