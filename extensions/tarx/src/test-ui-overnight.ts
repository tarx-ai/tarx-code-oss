/*---------------------------------------------------------------------------------------------
 *  TARX Overnight UI Testing System
 *
 *  Runs 50+ automated UI tests overnight to verify:
 *  - Conversational memory works
 *  - History sidebar updates correctly
 *  - UI remains responsive
 *  - Multi-turn context is maintained
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test result types
interface TestResult {
	testName: string;
	scenario: string;
	passed: boolean;
	messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
	expectedKeywords: string[];
	foundKeywords: string[];
	latencyMs: number;
	error?: string;
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
	historyUpdateSuccessRate: number;
	errors: Array<{ time: number; test: string; error: string }>;
}

interface TestScenario {
	name: string;
	messages: Array<{ content: string; expectKeywords?: string[]; waitMs?: number }>;
	verifyMemory?: boolean;
}

// Test scenarios to run
const TEST_SCENARIOS: TestScenario[] = [
	// Test 1: Basic Memory
	{
		name: 'Basic Memory - Name Recall',
		messages: [
			{ content: 'My name is John. Please remember this.', waitMs: 3000 },
			{ content: 'What is my name?', expectKeywords: ['John'], waitMs: 3000 }
		],
		verifyMemory: true
	},
	// Test 2: Multi-turn Context
	{
		name: 'Multi-turn Context - Preferences',
		messages: [
			{ content: 'I really like TypeScript for web development.', waitMs: 3000 },
			{ content: 'I also prefer using React for UI.', waitMs: 3000 },
			{ content: 'What programming preferences have I mentioned?', expectKeywords: ['TypeScript', 'React'], waitMs: 3000 }
		],
		verifyMemory: true
	},
	// Test 3: Project Context
	{
		name: 'Project Memory - List Projects',
		messages: [
			{ content: 'I have 3 projects I am working on: Alpha, Beta, and Gamma.', waitMs: 3000 },
			{ content: 'Can you list my projects?', expectKeywords: ['Alpha', 'Beta', 'Gamma'], waitMs: 3000 }
		],
		verifyMemory: true
	},
	// Test 4: Quick Math
	{
		name: 'Quick Response - Math',
		messages: [
			{ content: 'What is 2+2?', expectKeywords: ['4'], waitMs: 2000 }
		],
		verifyMemory: false
	},
	// Test 5: Code Generation
	{
		name: 'Code Generation - Hello World',
		messages: [
			{ content: 'Write a simple hello world function in TypeScript', expectKeywords: ['function', 'string', 'hello', 'world'], waitMs: 5000 }
		],
		verifyMemory: false
	},
	// Test 6: Color Memory
	{
		name: 'Color Memory',
		messages: [
			{ content: 'My favorite color is blue.', waitMs: 3000 },
			{ content: 'What is my favorite color?', expectKeywords: ['blue'], waitMs: 3000 }
		],
		verifyMemory: true
	},
	// Test 7: Number Memory
	{
		name: 'Number Memory',
		messages: [
			{ content: 'I have 5 cats and 3 dogs.', waitMs: 3000 },
			{ content: 'How many pets do I have?', expectKeywords: ['5', '3', '8', 'cats', 'dogs'], waitMs: 3000 }
		],
		verifyMemory: true
	},
	// Test 8: Task List
	{
		name: 'Task List Memory',
		messages: [
			{ content: 'I need to do three things today: buy groceries, write code, and call mom.', waitMs: 3000 },
			{ content: 'What do I need to do today?', expectKeywords: ['groceries', 'code', 'mom'], waitMs: 3000 }
		],
		verifyMemory: true
	},
	// Test 9: Technical Question
	{
		name: 'Technical Question',
		messages: [
			{ content: 'What is the difference between let and const in JavaScript?', expectKeywords: ['let', 'const', 'reassign', 'variable'], waitMs: 5000 }
		],
		verifyMemory: false
	},
	// Test 10: Context Chain
	{
		name: 'Context Chain - 3 Facts',
		messages: [
			{ content: 'Fact 1: The sky is blue.', waitMs: 2000 },
			{ content: 'Fact 2: Grass is green.', waitMs: 2000 },
			{ content: 'Fact 3: Water is wet.', waitMs: 2000 },
			{ content: 'List all three facts I told you.', expectKeywords: ['sky', 'blue', 'grass', 'green', 'water', 'wet'], waitMs: 4000 }
		],
		verifyMemory: true
	}
];

export class OvernightUITester {
	private outputChannel: vscode.OutputChannel;
	private metrics: TestMetrics;
	private results: TestResult[] = [];
	private isRunning: boolean = false;
	private shouldStop: boolean = false;
	private resultsDir: string;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('TARX Overnight Tests');
		this.resultsDir = path.join(os.homedir(), '.tarx', 'test-results');
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
			historyUpdateSuccessRate: 0,
			errors: []
		};
	}

	private log(message: string): void {
		const timestamp = new Date().toISOString();
		const logMessage = `[${timestamp}] ${message}`;
		this.outputChannel.appendLine(logMessage);
		console.log(`[TARX Test] ${message}`);
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

		// Ensure results directory exists
		if (!fs.existsSync(this.resultsDir)) {
			fs.mkdirSync(this.resultsDir, { recursive: true });
		}

		this.outputChannel.show();
		this.log('========================================');
		this.log('TARX OVERNIGHT UI TESTING STARTED');
		this.log(`Target: ${targetConversations} conversations`);
		this.log(`Max duration: ${maxHours} hours`);
		this.log('========================================');

		const maxEndTime = Date.now() + (maxHours * 60 * 60 * 1000);
		let conversationCount = 0;
		let scenarioIndex = 0;

		try {
			while (conversationCount < targetConversations && Date.now() < maxEndTime && !this.shouldStop) {
				// Get current scenario (cycle through them)
				const scenario = TEST_SCENARIOS[scenarioIndex % TEST_SCENARIOS.length];
				scenarioIndex++;

				this.log(`\n--- Test ${conversationCount + 1}/${targetConversations}: ${scenario.name} ---`);

				try {
					const result = await this.runTestScenario(scenario, conversationCount + 1);
					this.results.push(result);

					if (result.passed) {
						this.metrics.passedTests++;
						this.log(`PASSED: ${scenario.name}`);
					} else {
						this.metrics.failedTests++;
						this.log(`FAILED: ${scenario.name} - ${result.error || 'Keywords not found'}`);
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

				// Progress report every 10 conversations
				if (conversationCount % 10 === 0) {
					await this.reportProgress();
				}

				// Wait between tests to avoid overwhelming the system
				this.log('Waiting 30 seconds before next test...');
				await this.sleep(30000);

				// Verify History sidebar updated
				await this.verifyHistorySidebar();
			}

		} finally {
			this.metrics.endTime = Date.now();
			await this.saveResults();
			this.isRunning = false;

			this.log('\n========================================');
			this.log('OVERNIGHT TESTING COMPLETE');
			this.log(`Total conversations: ${this.metrics.totalConversations}`);
			this.log(`Passed: ${this.metrics.passedTests}`);
			this.log(`Failed: ${this.metrics.failedTests}`);
			this.log(`Memory recall accuracy: ${this.calculateMemoryAccuracy()}%`);
			this.log(`Duration: ${Math.round((this.metrics.endTime - this.metrics.startTime) / 60000)} minutes`);
			this.log('========================================');

			vscode.window.showInformationMessage(
				`TARX Overnight Tests Complete: ${this.metrics.passedTests}/${this.metrics.totalConversations} passed`
			);
		}
	}

	/**
	 * Run a single test scenario
	 */
	private async runTestScenario(scenario: TestScenario, testNumber: number): Promise<TestResult> {
		const result: TestResult = {
			testName: `Test ${testNumber}`,
			scenario: scenario.name,
			passed: false,
			messages: [],
			expectedKeywords: [],
			foundKeywords: [],
			latencyMs: 0
		};

		try {
			// Create a new session for this test
			const sessionResult = await vscode.commands.executeCommand('tarx.createTestSession', {
				title: `UI Test ${testNumber}: ${scenario.name}`
			}) as { sessionId: string } | undefined;

			const sessionId = sessionResult?.sessionId || `test-session-${Date.now()}`;
			this.log(`Created session: ${sessionId}`);

			let totalLatency = 0;
			let messageCount = 0;

			// Send each message in the scenario
			for (const msg of scenario.messages) {
				const startTime = Date.now();

				// Send message via MCP
				this.log(`Sending: "${msg.content.substring(0, 50)}..."`);

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

					this.log(`Response (${latency}ms): "${response.response.substring(0, 100)}..."`);

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

				// Wait between messages
				if (msg.waitMs) {
					await this.sleep(msg.waitMs);
				}
			}

			result.latencyMs = messageCount > 0 ? totalLatency / messageCount : 0;

			// Determine if test passed
			if (result.expectedKeywords.length > 0) {
				// At least 50% of keywords should be found
				const foundRatio = result.foundKeywords.length / result.expectedKeywords.length;
				result.passed = foundRatio >= 0.5;
				if (!result.passed) {
					result.error = `Only found ${result.foundKeywords.length}/${result.expectedKeywords.length} expected keywords`;
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
	 * Calculate memory recall accuracy
	 */
	private calculateMemoryAccuracy(): number {
		const memoryTests = this.results.filter(r =>
			TEST_SCENARIOS.find(s => s.name === r.scenario)?.verifyMemory
		);

		if (memoryTests.length === 0) return 100;

		const passedMemoryTests = memoryTests.filter(r => r.passed).length;
		return Math.round((passedMemoryTests / memoryTests.length) * 100);
	}

	/**
	 * Report current progress
	 */
	private async reportProgress(): Promise<void> {
		const elapsed = Math.round((Date.now() - this.metrics.startTime) / 60000);
		const passRate = this.metrics.totalConversations > 0
			? Math.round((this.metrics.passedTests / this.metrics.totalConversations) * 100)
			: 0;

		this.log('\n--- PROGRESS REPORT ---');
		this.log(`Elapsed time: ${elapsed} minutes`);
		this.log(`Conversations: ${this.metrics.totalConversations}`);
		this.log(`Pass rate: ${passRate}%`);
		this.log(`Average latency: ${Math.round(this.metrics.averageLatencyMs)}ms`);
		this.log(`Memory accuracy: ${this.calculateMemoryAccuracy()}%`);
		this.log('-----------------------\n');

		// Save intermediate results
		await this.saveResults();
	}

	/**
	 * Save test results to files
	 */
	private async saveResults(): Promise<void> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

		// Save metrics
		const metricsPath = path.join(this.resultsDir, `test-metrics-${timestamp}.json`);
		fs.writeFileSync(metricsPath, JSON.stringify({
			...this.metrics,
			memoryRecallAccuracy: this.calculateMemoryAccuracy()
		}, null, 2));

		// Save detailed results
		const resultsPath = path.join(this.resultsDir, `test-results-${timestamp}.json`);
		fs.writeFileSync(resultsPath, JSON.stringify(this.results, null, 2));

		// Save latest results (overwrite)
		const latestMetricsPath = path.join(this.resultsDir, 'latest-metrics.json');
		fs.writeFileSync(latestMetricsPath, JSON.stringify({
			...this.metrics,
			memoryRecallAccuracy: this.calculateMemoryAccuracy()
		}, null, 2));

		this.log(`Results saved to ${this.resultsDir}`);
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
		vscode.commands.registerCommand('tarx.runOvernightUITests', async () => {
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

	// Quick test command (5 conversations)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.runQuickUITests', async () => {
			const tester = getOvernightTester();
			if (tester.isTestRunning()) {
				vscode.window.showWarningMessage('Tests already running');
				return;
			}
			vscode.window.showInformationMessage('Starting quick UI test: 5 conversations');
			tester.startOvernightTests(5, 1);
		})
	);

	// Stop tests command
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.stopUITests', () => {
			const tester = getOvernightTester();
			tester.stop();
			vscode.window.showInformationMessage('Stopping UI tests...');
		})
	);

	// NOTE: tarx.createTestSession and tarx.sendTestMessage are registered in overnight-test.ts
	// to avoid duplicate registrations

	console.log('[TARX] UI test commands registered');
}
