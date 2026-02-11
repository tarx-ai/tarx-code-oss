/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Conversational Test Harness
 *
 * Programmatically sends messages through the TARX chat participant and validates responses.
 * Tests action intent detection, direct execution, and response quality.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { handleActionIntent, parseActionIntent, detectActionIntent } from '../claude-bridge';

// ============================================================
// TEST CASE DEFINITIONS
// ============================================================

interface TestCase {
	id: string;
	input: string;
	description: string;
	expectPattern?: RegExp;
	expectNotPattern?: RegExp;
	expectInDB?: {
		table: string;
		where: Record<string, string>;
	};
	expectAction?: string;
	cleanup?: () => Promise<void>;
}

interface TestResult {
	id: string;
	input: string;
	description: string;
	passed: boolean;
	response?: string;
	error?: string;
	duration: number;
	checks: {
		name: string;
		passed: boolean;
		details?: string;
	}[];
}

interface TestSuiteResult {
	timestamp: string;
	totalTests: number;
	passed: number;
	failed: number;
	duration: number;
	results: TestResult[];
}

// ============================================================
// TEST CASES
// ============================================================

const TEST_CASES: TestCase[] = [
	// Action Intent Detection Tests
	{
		id: 'detect-list-spaces',
		input: 'List all my spaces',
		description: 'Should detect list_spaces action intent',
		expectAction: 'list_spaces',
		expectPattern: /spaces/i,
		expectNotPattern: /would|could|steps|hypothetical/i
	},
	{
		id: 'detect-show-spaces',
		input: 'Show me my spaces',
		description: 'Should detect list_spaces from "show" variant',
		expectAction: 'list_spaces',
		expectPattern: /spaces/i
	},
	{
		id: 'detect-create-space',
		input: 'Create a new space called TestHarness with emoji 🧪',
		description: 'Should detect create_space action and execute',
		expectAction: 'create_space',
		expectPattern: /created.*TestHarness|TestHarness.*created/i,
		expectInDB: { table: 'spaces', where: { name: 'TestHarness' } },
		cleanup: async () => {
			// Delete the test space after test
			try {
				const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
				execSync(`sqlite3 "${dbPath}" "DELETE FROM spaces WHERE name = 'TestHarness'"`, { encoding: 'utf8' });
			} catch (e) {
				console.warn('[Test] Cleanup failed:', e);
			}
		}
	},
	{
		id: 'detect-list-sessions',
		input: 'List my sessions',
		description: 'Should detect list_sessions action',
		expectAction: 'list_sessions',
		expectPattern: /session/i
	},

	// Non-Action Queries (should NOT trigger direct execution)
	{
		id: 'non-action-weather',
		input: "What's the weather like today?",
		description: 'Weather query should not trigger action execution',
		expectNotPattern: /created|deleted|space|session/i
	},
	{
		id: 'non-action-explain',
		input: 'Explain how React hooks work',
		description: 'Explanation query should not trigger action execution',
		expectNotPattern: /created|deleted|space|session/i
	},

	// Edge Cases
	{
		id: 'edge-spaces-in-sentence',
		input: 'Tell me about the spaces between atoms',
		description: 'Should NOT trigger list_spaces (spaces is not an action target)',
		expectNotPattern: /📂.*Spaces \(/i  // Should not list database spaces
	},
	{
		id: 'edge-create-mention',
		input: 'What does the create function do in React?',
		description: 'Mentioning "create" in non-action context should not execute',
		expectNotPattern: /created.*space|space.*created/i
	},

	// Direct Execution Tests
	{
		id: 'direct-get-spaces',
		input: 'Get all spaces',
		description: 'Should directly execute and return real data',
		expectAction: 'list_spaces',
		expectPattern: /spaces/i,
		expectNotPattern: /would.*list|here.*are.*steps/i
	}
];

// ============================================================
// TEST RUNNER
// ============================================================

/**
 * Run a single test case
 */
async function runTestCase(testCase: TestCase): Promise<TestResult> {
	const startTime = Date.now();
	const checks: TestResult['checks'] = [];

	console.log(`\n[Test] Running: ${testCase.id}`);
	console.log(`[Test] Input: "${testCase.input}"`);

	try {
		// Check 1: Action intent detection
		if (testCase.expectAction) {
			const hasIntent = detectActionIntent(testCase.input);
			const parsed = parseActionIntent(testCase.input);

			checks.push({
				name: 'detectActionIntent',
				passed: hasIntent,
				details: `Expected intent detection: true, Got: ${hasIntent}`
			});

			checks.push({
				name: 'parseActionIntent',
				passed: parsed.action === testCase.expectAction,
				details: `Expected action: ${testCase.expectAction}, Got: ${parsed.action}`
			});
		}

		// Check 2: Execute action and get response
		const result = await handleActionIntent(testCase.input);
		const response = result.success ? result.result : `[No direct execution] action=${result.action}`;

		console.log(`[Test] Response: ${response.slice(0, 200)}...`);

		// Check 3: Pattern matching
		if (testCase.expectPattern) {
			const matches = testCase.expectPattern.test(response);
			checks.push({
				name: 'expectPattern',
				passed: matches,
				details: `Pattern ${testCase.expectPattern} ${matches ? 'matched' : 'did NOT match'}`
			});
		}

		// Check 4: Negative pattern matching
		if (testCase.expectNotPattern) {
			const matches = testCase.expectNotPattern.test(response);
			checks.push({
				name: 'expectNotPattern',
				passed: !matches,
				details: `Pattern ${testCase.expectNotPattern} should NOT match, ${matches ? 'but it DID' : 'and it did not'}`
			});
		}

		// Check 5: Database verification
		if (testCase.expectInDB) {
			const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			const whereClause = Object.entries(testCase.expectInDB.where)
				.map(([k, v]) => `${k} = '${v}'`)
				.join(' AND ');

			try {
				const query = `SELECT COUNT(*) as count FROM ${testCase.expectInDB.table} WHERE ${whereClause}`;
				const dbResult = execSync(`sqlite3 "${dbPath}" -json "${query}"`, { encoding: 'utf8' });
				const rows = JSON.parse(dbResult || '[]');
				const count = rows[0]?.count || 0;

				checks.push({
					name: 'expectInDB',
					passed: count > 0,
					details: `Found ${count} row(s) in ${testCase.expectInDB.table} where ${whereClause}`
				});
			} catch (e) {
				checks.push({
					name: 'expectInDB',
					passed: false,
					details: `DB query failed: ${e instanceof Error ? e.message : 'Unknown error'}`
				});
			}
		}

		// Cleanup if needed
		if (testCase.cleanup) {
			await testCase.cleanup();
		}

		const allPassed = checks.every(c => c.passed);
		const duration = Date.now() - startTime;

		return {
			id: testCase.id,
			input: testCase.input,
			description: testCase.description,
			passed: allPassed,
			response: response.slice(0, 500),
			duration,
			checks
		};

	} catch (error) {
		const duration = Date.now() - startTime;
		return {
			id: testCase.id,
			input: testCase.input,
			description: testCase.description,
			passed: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			duration,
			checks
		};
	}
}

/**
 * Run all test cases
 */
export async function runConversationalTestSuite(): Promise<TestSuiteResult> {
	const startTime = Date.now();
	const results: TestResult[] = [];

	console.log('='.repeat(60));
	console.log('TARX Conversational Test Suite');
	console.log('='.repeat(60));

	// Show progress
	const progress = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Running TARX Conversational Tests',
			cancellable: true
		},
		async (progress, token) => {
			for (let i = 0; i < TEST_CASES.length; i++) {
				if (token.isCancellationRequested) {
					break;
				}

				const testCase = TEST_CASES[i];
				progress.report({
					message: `Test ${i + 1}/${TEST_CASES.length}: ${testCase.id}`,
					increment: (100 / TEST_CASES.length)
				});

				const result = await runTestCase(testCase);
				results.push(result);

				// Brief delay between tests
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			return results;
		}
	);

	const passed = results.filter(r => r.passed).length;
	const failed = results.filter(r => !r.passed).length;
	const duration = Date.now() - startTime;

	const suiteResult: TestSuiteResult = {
		timestamp: new Date().toISOString(),
		totalTests: results.length,
		passed,
		failed,
		duration,
		results
	};

	// Print summary
	console.log('\n' + '='.repeat(60));
	console.log('TEST SUMMARY');
	console.log('='.repeat(60));
	console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
	console.log(`Duration: ${duration}ms`);
	console.log('');

	// Print details for failed tests
	const failedTests = results.filter(r => !r.passed);
	if (failedTests.length > 0) {
		console.log('FAILED TESTS:');
		for (const test of failedTests) {
			console.log(`\n  ❌ ${test.id}: ${test.description}`);
			console.log(`     Input: "${test.input}"`);
			if (test.error) {
				console.log(`     Error: ${test.error}`);
			}
			for (const check of test.checks.filter(c => !c.passed)) {
				console.log(`     - ${check.name}: ${check.details}`);
			}
		}
	}

	// Print passed tests
	const passedTests = results.filter(r => r.passed);
	if (passedTests.length > 0) {
		console.log('\nPASSED TESTS:');
		for (const test of passedTests) {
			console.log(`  ✅ ${test.id}: ${test.description}`);
		}
	}

	// Save results to file
	const resultsPath = path.join(os.homedir(), 'TARX', 'test-results.json');
	try {
		const tarxDir = path.join(os.homedir(), 'TARX');
		if (!fs.existsSync(tarxDir)) {
			fs.mkdirSync(tarxDir, { recursive: true });
		}
		fs.writeFileSync(resultsPath, JSON.stringify(suiteResult, null, 2));
		console.log(`\nResults saved to: ${resultsPath}`);
	} catch (e) {
		console.error('Failed to save results:', e);
	}

	// Show notification
	if (failed === 0) {
		vscode.window.showInformationMessage(
			`✅ All ${passed} conversational tests passed!`
		);
	} else {
		vscode.window.showWarningMessage(
			`⚠️ ${failed}/${results.length} tests failed. Check ~/TARX/test-results.json`,
			'View Results'
		).then(selection => {
			if (selection === 'View Results') {
				vscode.workspace.openTextDocument(resultsPath).then(doc => {
					vscode.window.showTextDocument(doc);
				});
			}
		});
	}

	return suiteResult;
}

/**
 * Run a quick smoke test (subset of tests)
 */
export async function runSmokeTest(): Promise<boolean> {
	console.log('[Smoke Test] Running quick validation...');

	const smokeTests = TEST_CASES.filter(t =>
		['detect-list-spaces', 'detect-create-space', 'non-action-weather'].includes(t.id)
	);

	let passed = 0;
	for (const test of smokeTests) {
		const result = await runTestCase(test);
		if (result.passed) {
			passed++;
			console.log(`  ✅ ${test.id}`);
		} else {
			console.log(`  ❌ ${test.id}`);
		}
	}

	const success = passed === smokeTests.length;
	console.log(`[Smoke Test] ${passed}/${smokeTests.length} passed`);
	return success;
}

// ============================================================
// COMMAND REGISTRATION
// ============================================================

/**
 * Register test harness commands
 */
export function registerConversationalTestCommands(context: vscode.ExtensionContext): void {
	// Full test suite
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.test.runConversationalSuite', async () => {
			await runConversationalTestSuite();
		})
	);

	// Quick smoke test
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.test.runSmokeTest', async () => {
			const passed = await runSmokeTest();
			if (passed) {
				vscode.window.showInformationMessage('✅ Smoke test passed!');
			} else {
				vscode.window.showErrorMessage('❌ Smoke test failed. Check console for details.');
			}
		})
	);

	// Test single action
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.test.testSingleAction', async () => {
			const input = await vscode.window.showInputBox({
				prompt: 'Enter a message to test',
				placeHolder: 'List all my spaces'
			});

			if (!input) return;

			const hasIntent = detectActionIntent(input);
			const parsed = parseActionIntent(input);
			const result = await handleActionIntent(input);

			const output = [
				`Input: "${input}"`,
				``,
				`Detection:`,
				`  hasActionIntent: ${hasIntent}`,
				`  parsedAction: ${parsed.action}`,
				`  confidence: ${parsed.confidence}`,
				`  params: ${JSON.stringify(parsed.params)}`,
				``,
				`Execution:`,
				`  success: ${result.success}`,
				`  action: ${result.action}`,
				``,
				`Response:`,
				result.result || '(no response)'
			].join('\n');

			// Show in output channel
			const channel = vscode.window.createOutputChannel('TARX Test');
			channel.clear();
			channel.appendLine(output);
			channel.show();
		})
	);

	console.log('[TARX] Conversational test commands registered');
}
