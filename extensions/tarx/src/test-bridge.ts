/**
 * TARX Bridge Round-Trip Test
 * TARX Bridge Integration - Feb 2026
 *
 * Tests the bridge architecture:
 * 1. Reasoning-only prompt to local model - should analyze, NOT fake execution
 * 2. Action prompt through bridge - should actually create data in SQLite
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
	detectActionIntent,
	getBridgeStatus,
	buildPayload,
	invokeClaudeWithPayload,
	executeNextSteps
} from './claude-bridge';
import { TARX_LOCAL_REASONING_PROMPT } from './systemPrompt';

const CONFIG = {
	DB_PATH: path.join(os.homedir(), 'Library/Application Support/tarx/memory.db'),
	LOG_PATH: path.join(os.homedir(), 'TARX', 'bridge-test.log'),
	LOCAL_URL: 'http://localhost:11435'
};

interface TestResult {
	name: string;
	passed: boolean;
	message: string;
	response?: string;
}

function log(message: string): void {
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] [Bridge Test] ${message}\n`;
	console.log(logMessage);

	try {
		const logDir = path.dirname(CONFIG.LOG_PATH);
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
		fs.appendFileSync(CONFIG.LOG_PATH, logMessage);
	} catch (e) {
		// Ignore log errors
	}
}

/**
 * Test 1: Reasoning-only prompt to local model
 * Should respond with analysis, NOT fake execution
 */
async function testLocalReasoning(): Promise<TestResult> {
	const testName = 'Local Reasoning (No Fake Execution)';
	log(`=== TEST: ${testName} ===`);

	const prompt = 'What are the pros and cons of using SQLite for chat persistence?';

	try {
		// Call local model with reasoning prompt
		const response = await fetch(`${CONFIG.LOCAL_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'ollama-7b',
				messages: [
					{ role: 'system', content: TARX_LOCAL_REASONING_PROMPT },
					{ role: 'user', content: prompt }
				],
				max_tokens: 500,
				stream: false
			})
		});

		if (!response.ok) {
			return { name: testName, passed: false, message: `HTTP ${response.status}` };
		}

		const data = await response.json() as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content || '';

		log(`Response: ${content.slice(0, 300)}...`);

		// Check for fake execution keywords
		const fakeKeywords = ['done', 'created', 'inserted', 'applied', 'executed', 'completed'];
		const hasFakeExecution = fakeKeywords.some(kw =>
			content.toLowerCase().includes(`${kw}!`) ||
			content.toLowerCase().includes(`${kw}.`) ||
			content.toLowerCase().includes(`successfully ${kw}`)
		);

		// Should contain reasoning, not fake execution
		const hasAnalysis = content.toLowerCase().includes('pros') ||
			content.toLowerCase().includes('cons') ||
			content.toLowerCase().includes('advantage') ||
			content.toLowerCase().includes('disadvantage');

		if (hasFakeExecution) {
			return {
				name: testName,
				passed: false,
				message: 'Model generated fake execution language',
				response: content
			};
		}

		if (hasAnalysis) {
			return {
				name: testName,
				passed: true,
				message: 'Model provided reasoning without fake execution',
				response: content
			};
		}

		return {
			name: testName,
			passed: false,
			message: 'Response did not contain expected analysis',
			response: content
		};

	} catch (e) {
		return { name: testName, passed: false, message: `Error: ${e}` };
	}
}

/**
 * Test 2: Action prompt through bridge
 * Should actually create a space in SQLite
 */
async function testBridgeAction(context: vscode.ExtensionContext): Promise<TestResult> {
	const testName = 'Bridge Action (Real Execution)';
	log(`=== TEST: ${testName} ===`);

	const bridgeStatus = await getBridgeStatus();
	if (bridgeStatus !== 'active') {
		return {
			name: testName,
			passed: false,
			message: `Bridge not available (status: ${bridgeStatus}). Need ANTHROPIC_API_KEY or Claude CLI.`
		};
	}

	const testSpaceName = `Bridge Test ${Date.now()}`;
	const prompt = `Create a new space called "${testSpaceName}" with emoji test-tube`;

	try {
		// Verify action intent detection
		const hasIntent = detectActionIntent(prompt);
		if (!hasIntent) {
			return {
				name: testName,
				passed: false,
				message: 'Action intent not detected'
			};
		}
		log('Action intent detected correctly');

		// Build payload and invoke bridge
		const payload = await buildPayload({
			type: 'reason',
			query: prompt,
			session_id: `test-${Date.now()}`,
			project_id: 'bridge-test'
		});

		log('Invoking Claude bridge...');
		const response = await invokeClaudeWithPayload(payload, 'cli');

		log(`Bridge response: ${response.response.slice(0, 200)}...`);
		log(`Next steps: ${response.next_steps.length}`);

		// Execute next steps
		if (response.next_steps.length > 0) {
			await executeNextSteps(context, response.next_steps);
			log(`Executed ${response.next_steps.length} next step(s)`);
		}

		// Verify space was created in database
		const result = execSync(`sqlite3 "${CONFIG.DB_PATH}" -json "SELECT * FROM spaces WHERE name LIKE '%Bridge Test%' ORDER BY created_at DESC LIMIT 1;"`, {
			encoding: 'utf8',
			timeout: 5000
		});

		const spaces = JSON.parse(result || '[]');
		if (spaces.length > 0) {
			log(`Space created in database: ${JSON.stringify(spaces[0])}`);
			return {
				name: testName,
				passed: true,
				message: `Space "${spaces[0].name}" created successfully`,
				response: response.response
			};
		}

		return {
			name: testName,
			passed: false,
			message: 'Space not found in database after bridge execution',
			response: response.response
		};

	} catch (e) {
		return { name: testName, passed: false, message: `Error: ${e}` };
	}
}

/**
 * Test 3: Intent detection accuracy
 */
function testIntentDetection(): TestResult {
	const testName = 'Intent Detection';
	log(`=== TEST: ${testName} ===`);

	const actionPrompts = [
		'Create a new project called Test',
		'Delete the old session',
		'Build the project and run tests',
		'Send this message to the user',
		'Update the configuration file'
	];

	const reasoningPrompts = [
		'What are the pros and cons of SQLite?',
		'How does the chat system work?',
		'Explain the architecture of TARX',
		'What is the difference between spaces and sessions?',
		'Why would I use RAG for this?'
	];

	let passed = 0;
	let failed = 0;

	for (const prompt of actionPrompts) {
		if (detectActionIntent(prompt)) {
			log(`PASS: Action detected in "${prompt}"`);
			passed++;
		} else {
			log(`FAIL: Action NOT detected in "${prompt}"`);
			failed++;
		}
	}

	for (const prompt of reasoningPrompts) {
		if (!detectActionIntent(prompt)) {
			log(`PASS: No action detected in "${prompt}"`);
			passed++;
		} else {
			log(`FAIL: False positive action in "${prompt}"`);
			failed++;
		}
	}

	const total = actionPrompts.length + reasoningPrompts.length;
	const accuracy = Math.round((passed / total) * 100);

	return {
		name: testName,
		passed: accuracy >= 80,
		message: `${passed}/${total} correct (${accuracy}% accuracy)`
	};
}

/**
 * Run all bridge tests
 */
export async function runBridgeTests(context: vscode.ExtensionContext): Promise<void> {
	log('========================================');
	log('TARX BRIDGE TEST SUITE');
	log('========================================');

	const results: TestResult[] = [];

	// Test 1: Intent detection
	results.push(testIntentDetection());

	// Test 2: Local reasoning (only if local model available)
	try {
		const healthCheck = await fetch(`${CONFIG.LOCAL_URL}/health`, {
			signal: AbortSignal.timeout(2000)
		});
		if (healthCheck.ok) {
			results.push(await testLocalReasoning());
		} else {
			results.push({
				name: 'Local Reasoning',
				passed: false,
				message: 'Local model not available'
			});
		}
	} catch (e) {
		results.push({
			name: 'Local Reasoning',
			passed: false,
			message: 'Local model not reachable'
		});
	}

	// Test 3: Bridge action (only if bridge available)
	const bridgeStatus = await getBridgeStatus();
	if (bridgeStatus === 'active') {
		results.push(await testBridgeAction(context));
	} else {
		results.push({
			name: 'Bridge Action',
			passed: false,
			message: `Bridge not available (${bridgeStatus})`
		});
	}

	// Summary
	log('========================================');
	log('TEST RESULTS');
	log('========================================');

	let passedCount = 0;
	for (const result of results) {
		const status = result.passed ? '✅ PASS' : '❌ FAIL';
		log(`${status}: ${result.name}`);
		log(`  ${result.message}`);
		if (result.passed) passedCount++;
	}

	log('----------------------------------------');
	log(`Total: ${passedCount}/${results.length} passed`);
	log('========================================');

	// Show summary in VS Code
	const passed = results.filter(r => r.passed).length;
	if (passed === results.length) {
		vscode.window.showInformationMessage(`TARX Bridge: All ${results.length} tests passed!`);
	} else {
		vscode.window.showWarningMessage(`TARX Bridge: ${passed}/${results.length} tests passed`);
	}
}

/**
 * Register bridge test commands
 */
export function registerBridgeTestCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.bridge.runTests', () => runBridgeTests(context))
	);

	log('Bridge test commands registered');
}
