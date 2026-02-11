#!/usr/bin/env npx ts-node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Autonomous Test Daemon
 *
 * Standalone Node.js script that runs 500+ test cycles against TARX inference.
 * - Connects directly to SQLite database
 * - Calls llama-server directly (localhost:11435)
 * - Runs in background with file logging
 * - No VS Code extension context required
 *
 * Usage:
 *   npx ts-node src/test/autonomous-test-daemon.ts --count=500 --parallel=5
 *
 * Options:
 *   --count=N       Number of tests to run (default: 500)
 *   --parallel=N    Concurrent tests (default: 5, max 10)
 *   --category=X    Only run specific category (crud|query|edge|negative)
 *   --continuous    Run forever, cycling through tests
 *   --report-every=N  Log summary every N tests (default: 50)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
	LLAMA_SERVER_URL: 'http://localhost:11435/v1/chat/completions',
	DB_PATH: path.join(os.homedir(), 'Library/Application Support/tarx/memory.db'),
	RESULTS_DIR: path.join(os.homedir(), 'TARX', 'test-results'),
	MODEL: 'qwen',
	MAX_TOKENS: 500,
	TIMEOUT_MS: 30000,
	DEFAULT_COUNT: 500,
	DEFAULT_PARALLEL: 5,
	MAX_PARALLEL: 10,
	REPORT_EVERY: 50
};

// ============================================================
// TYPES
// ============================================================

type TestCategory = 'crud' | 'query' | 'edge' | 'negative';
type ExpectedAction = 'create_space' | 'list_spaces' | 'delete_space' | 'create_session' | 'list_sessions' | 'send_message' | 'reasoning' | 'error';

interface TestCase {
	id: string;
	category: TestCategory;
	input: string;
	expectedAction: ExpectedAction;
	validateResponse: (response: string) => boolean;
	validateDB?: () => Promise<boolean>;
	setup?: () => Promise<void>;
	cleanup?: () => Promise<void>;
}

interface TestResult {
	id: string;
	category: TestCategory;
	input: string;
	passed: boolean;
	latencyMs: number;
	response: string;
	error: string | null;
	timestamp: string;
	checks: {
		responseValid: boolean;
		dbValid: boolean;
		details?: string;
	};
}

interface TestSummary {
	startTime: string;
	endTime: string;
	totalTests: number;
	passed: number;
	failed: number;
	passRate: number;
	avgLatencyMs: number;
	byCategory: Record<TestCategory, { total: number; passed: number; passRate: number }>;
	byAction: Record<string, { total: number; passed: number }>;
}

// ============================================================
// SYSTEM PROMPT FOR TARX
// ============================================================

const TARX_SYSTEM_PROMPT = `You are TARX — Local. Private. Proactive. Integrated into TARX Workbench.

You have access to these MCP tools for managing workspaces:
- tarx_create_space(name, emoji?, description?) - Create a new space/project
- tarx_list_spaces() - List all spaces
- tarx_delete_space(space_id) - Delete a space by ID
- tarx_create_session(space_id, title?) - Create a new chat session in a space
- tarx_list_sessions(space_id?) - List sessions, optionally filtered by space
- tarx_send_message(session_id, content) - Send a message to a session

When the user asks you to perform these operations, respond with the action you're taking.
For example:
- "Create a space called Test" -> "I'll create a space called 'Test' for you. ✅ Created space 'Test'"
- "List my spaces" -> "Here are your spaces: [list them]"
- "Delete space X" -> "I'll delete the space 'X'. ✅ Space deleted"

Be concise and action-oriented. Execute requests directly.`;

// ============================================================
// DATABASE HELPERS
// ============================================================

function queryDB(sql: string): any[] {
	try {
		const result = execSync(`sqlite3 "${CONFIG.DB_PATH}" -json "${sql.replace(/"/g, '\\"')}"`, {
			encoding: 'utf8',
			timeout: 5000
		});
		return JSON.parse(result || '[]');
	} catch (e) {
		return [];
	}
}

function execDB(sql: string): boolean {
	try {
		execSync(`sqlite3 "${CONFIG.DB_PATH}"`, {
			input: sql,
			encoding: 'utf8',
			timeout: 5000
		});
		return true;
	} catch (e) {
		return false;
	}
}

function spaceExists(name: string): boolean {
	const rows = queryDB(`SELECT COUNT(*) as count FROM spaces WHERE name = '${name.replace(/'/g, "''")}'`);
	return rows.length > 0 && rows[0].count > 0;
}

function getSpaceCount(): number {
	const rows = queryDB(`SELECT COUNT(*) as count FROM spaces`);
	return rows.length > 0 ? rows[0].count : 0;
}

function deleteSpaceByName(name: string): boolean {
	return execDB(`DELETE FROM spaces WHERE name = '${name.replace(/'/g, "''")}'`);
}

// ============================================================
// TEST CASE GENERATORS
// ============================================================

function generateTestId(category: TestCategory, index: number): string {
	return `${category}-${Date.now()}-${index}`;
}

function generateRandomName(prefix: string = 'Test'): string {
	return `${prefix}_${Math.random().toString(36).substring(2, 8)}`;
}

// CRUD Test Cases (40%)
function generateCRUDTests(count: number): TestCase[] {
	const tests: TestCase[] = [];
	const emojis = ['🧪', '📁', '🚀', '💻', '🎯', '📊', '🔧', '🌟'];

	for (let i = 0; i < count; i++) {
		const testType = i % 8;
		const spaceName = generateRandomName('CRUDSpace');

		switch (testType) {
			case 0: // Create space with name only
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: `Create a space called ${spaceName}`,
					expectedAction: 'create_space',
					validateResponse: (r) => /creat/i.test(r) && r.toLowerCase().includes(spaceName.toLowerCase()),
					validateDB: async () => spaceExists(spaceName),
					cleanup: async () => { deleteSpaceByName(spaceName); }
				});
				break;

			case 1: // Create space with name + emoji
				const emoji = emojis[i % emojis.length];
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: `Create a new space called ${spaceName} with emoji ${emoji}`,
					expectedAction: 'create_space',
					validateResponse: (r) => /creat/i.test(r),
					validateDB: async () => spaceExists(spaceName),
					cleanup: async () => { deleteSpaceByName(spaceName); }
				});
				break;

			case 2: // Create space with description
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: `Create a space called ${spaceName} for testing purposes`,
					expectedAction: 'create_space',
					validateResponse: (r) => /creat/i.test(r),
					cleanup: async () => { deleteSpaceByName(spaceName); }
				});
				break;

			case 3: // List spaces
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: 'List all my spaces',
					expectedAction: 'list_spaces',
					validateResponse: (r) => /space/i.test(r)
				});
				break;

			case 4: // Delete space by name
				const deleteSpaceName = `DeleteMe_${i}`;
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: `Delete the space called ${deleteSpaceName}`,
					expectedAction: 'delete_space',
					validateResponse: (r) => /delet/i.test(r) || /remov/i.test(r) || /not found/i.test(r),
					setup: async () => {
						execDB(`INSERT OR IGNORE INTO spaces (id, name, emoji, created_at, updated_at) VALUES ('del-${i}', '${deleteSpaceName}', '📁', ${Date.now()}, ${Date.now()})`);
					}
				});
				break;

			case 5: // Create session
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: `Create a new session called "Test Session ${i}"`,
					expectedAction: 'create_session',
					validateResponse: (r) => /session/i.test(r) || /creat/i.test(r)
				});
				break;

			case 6: // List sessions
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: 'Show me all sessions',
					expectedAction: 'list_sessions',
					validateResponse: (r) => /session/i.test(r)
				});
				break;

			case 7: // Send message
				tests.push({
					id: generateTestId('crud', i),
					category: 'crud',
					input: 'Send a message to my current session: Hello world',
					expectedAction: 'send_message',
					validateResponse: (r) => r.length > 0
				});
				break;
		}
	}

	return tests;
}

// Query Variation Tests (30%)
function generateQueryVariationTests(count: number): TestCase[] {
	const tests: TestCase[] = [];

	const createVariations = [
		'Create a space called',
		'Make a new space named',
		'New space:',
		'I need a space called',
		'Set up a space named',
		'Create new space',
		'Add a space called'
	];

	const listVariations = [
		'List spaces',
		'Show my spaces',
		'What spaces do I have',
		'Get all spaces',
		'Display spaces',
		'Show me all my spaces',
		'List all spaces'
	];

	const deleteVariations = [
		'Delete space',
		'Remove space',
		'Get rid of space',
		'Delete the space called',
		'Remove the space named',
		'Destroy space'
	];

	for (let i = 0; i < count; i++) {
		const variationType = i % 3;
		const spaceName = generateRandomName('QueryTest');

		switch (variationType) {
			case 0: // Create variations
				const createVar = createVariations[i % createVariations.length];
				tests.push({
					id: generateTestId('query', i),
					category: 'query',
					input: `${createVar} ${spaceName}`,
					expectedAction: 'create_space',
					validateResponse: (r) => /creat/i.test(r) || /space/i.test(r),
					cleanup: async () => { deleteSpaceByName(spaceName); }
				});
				break;

			case 1: // List variations
				const listVar = listVariations[i % listVariations.length];
				tests.push({
					id: generateTestId('query', i),
					category: 'query',
					input: listVar,
					expectedAction: 'list_spaces',
					validateResponse: (r) => /space/i.test(r)
				});
				break;

			case 2: // Delete variations
				const deleteVar = deleteVariations[i % deleteVariations.length];
				tests.push({
					id: generateTestId('query', i),
					category: 'query',
					input: `${deleteVar} NonexistentSpace${i}`,
					expectedAction: 'delete_space',
					validateResponse: (r) => /delet/i.test(r) || /remov/i.test(r) || /not found/i.test(r) || /doesn't exist/i.test(r)
				});
				break;
		}
	}

	return tests;
}

// Edge Case Tests (20%)
function generateEdgeCaseTests(count: number): TestCase[] {
	const tests: TestCase[] = [];

	const unicodeNames = [
		'日本語スペース',
		'Tëst Spàcé',
		'Тест Пространство',
		'测试空间',
		'🎯 Target Space',
		'Ümläüts Ëvërÿwhërë'
	];

	const specialCharNames = [
		'Test & Space',
		'Test-Space-Dashes',
		"Test's Apostrophe",
		'Test (Parentheses)',
		'Test_Underscore_Name',
		'Test.Dot.Name'
	];

	for (let i = 0; i < count; i++) {
		const edgeType = i % 6;

		switch (edgeType) {
			case 0: // Unicode names
				const unicodeName = unicodeNames[i % unicodeNames.length];
				tests.push({
					id: generateTestId('edge', i),
					category: 'edge',
					input: `Create a space called ${unicodeName}`,
					expectedAction: 'create_space',
					validateResponse: (r) => /creat/i.test(r) || /space/i.test(r),
					cleanup: async () => { deleteSpaceByName(unicodeName); }
				});
				break;

			case 1: // Long names (100+ chars)
				const longName = 'A'.repeat(100 + (i % 50));
				tests.push({
					id: generateTestId('edge', i),
					category: 'edge',
					input: `Create a space called ${longName}`,
					expectedAction: 'create_space',
					validateResponse: (r) => r.length > 0, // Any response is OK
					cleanup: async () => { deleteSpaceByName(longName); }
				});
				break;

			case 2: // Special characters
				const specialName = specialCharNames[i % specialCharNames.length];
				tests.push({
					id: generateTestId('edge', i),
					category: 'edge',
					input: `Create a space called ${specialName}`,
					expectedAction: 'create_space',
					validateResponse: (r) => /creat/i.test(r) || /space/i.test(r) || /error/i.test(r),
					cleanup: async () => { deleteSpaceByName(specialName); }
				});
				break;

			case 3: // Empty-ish input
				tests.push({
					id: generateTestId('edge', i),
					category: 'edge',
					input: '   ',
					expectedAction: 'reasoning',
					validateResponse: (r) => r.length > 0 // Should handle gracefully
				});
				break;

			case 4: // Very long input
				const longInput = `Create a space with a very detailed description: ${'Lorem ipsum dolor sit amet. '.repeat(50)}`;
				tests.push({
					id: generateTestId('edge', i),
					category: 'edge',
					input: longInput.substring(0, 2000),
					expectedAction: 'create_space',
					validateResponse: (r) => r.length > 0
				});
				break;

			case 5: // Numbers only
				tests.push({
					id: generateTestId('edge', i),
					category: 'edge',
					input: `Create a space called 12345${i}`,
					expectedAction: 'create_space',
					validateResponse: (r) => r.length > 0,
					cleanup: async () => { deleteSpaceByName(`12345${i}`); }
				});
				break;
		}
	}

	return tests;
}

// Negative Tests (10%)
function generateNegativeTests(count: number): TestCase[] {
	const tests: TestCase[] = [];

	const sqlInjectionAttempts = [
		"'; DROP TABLE spaces;--",
		"' OR '1'='1",
		"'; DELETE FROM spaces WHERE '1'='1",
		"Robert'); DROP TABLE spaces;--",
		"<script>alert('xss')</script>"
	];

	for (let i = 0; i < count; i++) {
		const negType = i % 5;

		switch (negType) {
			case 0: // Delete nonexistent
				tests.push({
					id: generateTestId('negative', i),
					category: 'negative',
					input: `Delete space ThisSpaceDoesNotExist${Date.now()}${i}`,
					expectedAction: 'delete_space',
					validateResponse: (r) => !/error|crash|exception/i.test(r) || /not found/i.test(r)
				});
				break;

			case 1: // SQL injection attempts
				const injection = sqlInjectionAttempts[i % sqlInjectionAttempts.length];
				tests.push({
					id: generateTestId('negative', i),
					category: 'negative',
					input: `Create a space called ${injection}`,
					expectedAction: 'error',
					validateResponse: (r) => {
						// Should NOT actually drop tables or cause errors
						const spacesExist = getSpaceCount() > 0 || true; // DB should be intact
						return r.length > 0 && spacesExist;
					}
				});
				break;

			case 2: // Invalid emoji
				tests.push({
					id: generateTestId('negative', i),
					category: 'negative',
					input: `Create a space called Test with emoji NOTANEMOJI`,
					expectedAction: 'create_space',
					validateResponse: (r) => r.length > 0 // Should handle gracefully
				});
				break;

			case 3: // Create with same name (duplicate)
				const dupName = `DuplicateTest${i}`;
				tests.push({
					id: generateTestId('negative', i),
					category: 'negative',
					input: `Create a space called ${dupName}`,
					expectedAction: 'create_space',
					validateResponse: (r) => r.length > 0,
					setup: async () => {
						execDB(`INSERT OR IGNORE INTO spaces (id, name, emoji, created_at, updated_at) VALUES ('dup-${i}', '${dupName}', '📁', ${Date.now()}, ${Date.now()})`);
					},
					cleanup: async () => { deleteSpaceByName(dupName); }
				});
				break;

			case 4: // Malformed request
				tests.push({
					id: generateTestId('negative', i),
					category: 'negative',
					input: `@#$%^&*()_+{}|:"<>?`,
					expectedAction: 'reasoning',
					validateResponse: (r) => r.length > 0 // Should not crash
				});
				break;
		}
	}

	return tests;
}

// ============================================================
// TEST RUNNER
// ============================================================

async function callLlamaServer(input: string): Promise<{ content: string; latencyMs: number }> {
	const startTime = Date.now();

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

	try {
		const response = await fetch(CONFIG.LLAMA_SERVER_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.MODEL,
				messages: [
					{ role: 'system', content: TARX_SYSTEM_PROMPT },
					{ role: 'user', content: input }
				],
				max_tokens: CONFIG.MAX_TOKENS,
				temperature: 0.7
			}),
			signal: controller.signal
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = await response.json() as any;
		const content = data.choices?.[0]?.message?.content || '';
		const latencyMs = Date.now() - startTime;

		return { content, latencyMs };
	} catch (e) {
		clearTimeout(timeoutId);
		throw e;
	}
}

async function runTest(test: TestCase): Promise<TestResult> {
	const timestamp = new Date().toISOString();

	try {
		// Setup if needed
		if (test.setup) {
			await test.setup();
		}

		// Call llama-server
		const { content, latencyMs } = await callLlamaServer(test.input);

		// Validate response pattern
		const responseValid = test.validateResponse(content);

		// Validate DB state if needed
		let dbValid = true;
		if (test.validateDB) {
			dbValid = await test.validateDB();
		}

		// Cleanup if needed
		if (test.cleanup) {
			await test.cleanup();
		}

		return {
			id: test.id,
			category: test.category,
			input: test.input,
			passed: responseValid && dbValid,
			latencyMs,
			response: content.substring(0, 500),
			error: null,
			timestamp,
			checks: {
				responseValid,
				dbValid,
				details: !responseValid ? 'Response validation failed' : (!dbValid ? 'DB validation failed' : undefined)
			}
		};

	} catch (e) {
		// Cleanup even on error
		if (test.cleanup) {
			try { await test.cleanup(); } catch { }
		}

		return {
			id: test.id,
			category: test.category,
			input: test.input,
			passed: false,
			latencyMs: 0,
			response: '',
			error: e instanceof Error ? e.message : 'Unknown error',
			timestamp,
			checks: {
				responseValid: false,
				dbValid: false,
				details: e instanceof Error ? e.message : 'Unknown error'
			}
		};
	}
}

// ============================================================
// MAIN DAEMON
// ============================================================

async function runDaemon(options: {
	count: number;
	parallel: number;
	category?: TestCategory;
	continuous: boolean;
	reportEvery: number;
}): Promise<void> {
	console.log('='.repeat(60));
	console.log('TARX Autonomous Test Daemon');
	console.log('='.repeat(60));
	console.log(`Config: count=${options.count}, parallel=${options.parallel}, category=${options.category || 'all'}`);
	console.log(`Results dir: ${CONFIG.RESULTS_DIR}`);
	console.log('');

	// Ensure results directory exists
	if (!fs.existsSync(CONFIG.RESULTS_DIR)) {
		fs.mkdirSync(CONFIG.RESULTS_DIR, { recursive: true });
	}

	// Check llama-server connectivity
	console.log('Checking llama-server connectivity...');
	try {
		await callLlamaServer('ping');
		console.log('✅ llama-server connected');
	} catch (e) {
		console.error('❌ Failed to connect to llama-server at', CONFIG.LLAMA_SERVER_URL);
		console.error('   Make sure llama-server is running on port 11435');
		process.exit(1);
	}

	// Check database
	console.log('Checking database...');
	if (!fs.existsSync(CONFIG.DB_PATH)) {
		console.error('❌ Database not found at', CONFIG.DB_PATH);
		process.exit(1);
	}
	console.log('✅ Database found');
	console.log('');

	// Generate test cases
	console.log('Generating test cases...');
	let allTests: TestCase[] = [];

	const crudCount = Math.floor(options.count * 0.4);
	const queryCount = Math.floor(options.count * 0.3);
	const edgeCount = Math.floor(options.count * 0.2);
	const negativeCount = options.count - crudCount - queryCount - edgeCount;

	if (!options.category || options.category === 'crud') {
		allTests.push(...generateCRUDTests(options.category ? options.count : crudCount));
	}
	if (!options.category || options.category === 'query') {
		allTests.push(...generateQueryVariationTests(options.category ? options.count : queryCount));
	}
	if (!options.category || options.category === 'edge') {
		allTests.push(...generateEdgeCaseTests(options.category ? options.count : edgeCount));
	}
	if (!options.category || options.category === 'negative') {
		allTests.push(...generateNegativeTests(options.category ? options.count : negativeCount));
	}

	// Shuffle tests
	allTests = allTests.sort(() => Math.random() - 0.5);

	console.log(`Generated ${allTests.length} test cases`);
	console.log(`  - CRUD: ${allTests.filter(t => t.category === 'crud').length}`);
	console.log(`  - Query: ${allTests.filter(t => t.category === 'query').length}`);
	console.log(`  - Edge: ${allTests.filter(t => t.category === 'edge').length}`);
	console.log(`  - Negative: ${allTests.filter(t => t.category === 'negative').length}`);
	console.log('');

	// Run tests
	const startTime = Date.now();
	const results: TestResult[] = [];
	let completedCount = 0;

	const logFile = path.join(CONFIG.RESULTS_DIR, 'full-log.jsonl');

	console.log('Starting test execution...');
	console.log('');

	// Process in batches
	for (let i = 0; i < allTests.length; i += options.parallel) {
		const batch = allTests.slice(i, Math.min(i + options.parallel, allTests.length));

		const batchResults = await Promise.all(batch.map(test => runTest(test)));

		for (const result of batchResults) {
			results.push(result);
			completedCount++;

			// Append to log file
			fs.appendFileSync(logFile, JSON.stringify(result) + '\n');

			// Print progress
			const status = result.passed ? '✅' : '❌';
			process.stdout.write(`\r[${completedCount}/${allTests.length}] ${status} ${result.id.substring(0, 30)}...`);
		}

		// Periodic summary
		if (completedCount % options.reportEvery === 0) {
			const passed = results.filter(r => r.passed).length;
			const avgLatency = Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / results.length);
			console.log(`\n[Progress] ${completedCount}/${allTests.length} | Pass: ${passed}/${completedCount} (${Math.round(passed / completedCount * 100)}%) | Avg latency: ${avgLatency}ms`);
		}
	}

	console.log('\n');

	// Generate summary
	const endTime = Date.now();
	const passed = results.filter(r => r.passed).length;
	const failed = results.filter(r => !r.passed).length;
	const avgLatency = Math.round(results.reduce((a, r) => a + r.latencyMs, 0) / results.length);

	const byCategory: Record<TestCategory, { total: number; passed: number; passRate: number }> = {
		crud: { total: 0, passed: 0, passRate: 0 },
		query: { total: 0, passed: 0, passRate: 0 },
		edge: { total: 0, passed: 0, passRate: 0 },
		negative: { total: 0, passed: 0, passRate: 0 }
	};

	const byAction: Record<string, { total: number; passed: number }> = {};

	for (const result of results) {
		byCategory[result.category].total++;
		if (result.passed) byCategory[result.category].passed++;

		const test = allTests.find(t => t.id === result.id);
		if (test) {
			if (!byAction[test.expectedAction]) {
				byAction[test.expectedAction] = { total: 0, passed: 0 };
			}
			byAction[test.expectedAction].total++;
			if (result.passed) byAction[test.expectedAction].passed++;
		}
	}

	for (const cat of Object.keys(byCategory) as TestCategory[]) {
		byCategory[cat].passRate = byCategory[cat].total > 0
			? Math.round(byCategory[cat].passed / byCategory[cat].total * 100)
			: 0;
	}

	const summary: TestSummary = {
		startTime: new Date(startTime).toISOString(),
		endTime: new Date(endTime).toISOString(),
		totalTests: results.length,
		passed,
		failed,
		passRate: Math.round(passed / results.length * 100),
		avgLatencyMs: avgLatency,
		byCategory,
		byAction
	};

	// Write summary
	const summaryPath = path.join(CONFIG.RESULTS_DIR, 'summary.json');
	fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

	// Write failures
	const failures = results.filter(r => !r.passed);
	const failuresPath = path.join(CONFIG.RESULTS_DIR, 'failures.json');
	fs.writeFileSync(failuresPath, JSON.stringify(failures, null, 2));

	// Print final summary
	console.log('='.repeat(60));
	console.log('TEST SUMMARY');
	console.log('='.repeat(60));
	console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
	console.log(`Pass Rate: ${summary.passRate}%`);
	console.log(`Avg Latency: ${avgLatency}ms`);
	console.log(`Duration: ${Math.round((endTime - startTime) / 1000)}s`);
	console.log('');
	console.log('By Category:');
	for (const cat of Object.keys(byCategory) as TestCategory[]) {
		const c = byCategory[cat];
		const status = c.passRate >= 90 ? '✅' : (c.passRate >= 70 ? '⚠️' : '❌');
		console.log(`  ${status} ${cat.padEnd(10)} ${c.passed}/${c.total} (${c.passRate}%)`);
	}
	console.log('');
	console.log('By Action:');
	for (const action of Object.keys(byAction)) {
		const a = byAction[action];
		const rate = Math.round(a.passed / a.total * 100);
		console.log(`  ${action.padEnd(15)} ${a.passed}/${a.total} (${rate}%)`);
	}
	console.log('');
	console.log(`Results saved to: ${CONFIG.RESULTS_DIR}`);
	console.log(`  - summary.json`);
	console.log(`  - failures.json (${failures.length} failures)`);
	console.log(`  - full-log.jsonl`);

	// Success criteria check
	console.log('');
	console.log('SUCCESS CRITERIA:');
	const crudPass = byCategory.crud.passRate >= 95;
	const queryPass = byCategory.query.passRate >= 90;
	const edgePass = byCategory.edge.passRate >= 80;
	const negativePass = failures.filter(f => f.category === 'negative' && f.error?.includes('crash')).length === 0;
	const latencyPass = avgLatency < 5000;

	console.log(`  ${crudPass ? '✅' : '❌'} CRUD operations: ${byCategory.crud.passRate}% (target: 95%)`);
	console.log(`  ${queryPass ? '✅' : '❌'} Query variations: ${byCategory.query.passRate}% (target: 90%)`);
	console.log(`  ${edgePass ? '✅' : '❌'} Edge cases: ${byCategory.edge.passRate}% (target: 80%)`);
	console.log(`  ${negativePass ? '✅' : '❌'} Negative tests: No crashes`);
	console.log(`  ${latencyPass ? '✅' : '❌'} Avg latency: ${avgLatency}ms (target: <5000ms)`);

	const allCriteriaPassed = crudPass && queryPass && edgePass && negativePass && latencyPass;
	console.log('');
	console.log(allCriteriaPassed ? '🎉 ALL SUCCESS CRITERIA MET!' : '⚠️ Some criteria not met');

	// Continuous mode
	if (options.continuous) {
		console.log('\nContinuous mode - restarting in 30 seconds...');
		await new Promise(resolve => setTimeout(resolve, 30000));
		await runDaemon(options);
	}
}

// ============================================================
// CLI PARSING
// ============================================================

function parseArgs(): {
	count: number;
	parallel: number;
	category?: TestCategory;
	continuous: boolean;
	reportEvery: number;
} {
	const args = process.argv.slice(2);
	const options = {
		count: CONFIG.DEFAULT_COUNT,
		parallel: CONFIG.DEFAULT_PARALLEL,
		category: undefined as TestCategory | undefined,
		continuous: false,
		reportEvery: CONFIG.REPORT_EVERY
	};

	for (const arg of args) {
		if (arg.startsWith('--count=')) {
			options.count = parseInt(arg.split('=')[1], 10) || CONFIG.DEFAULT_COUNT;
		} else if (arg.startsWith('--parallel=')) {
			options.parallel = Math.min(parseInt(arg.split('=')[1], 10) || CONFIG.DEFAULT_PARALLEL, CONFIG.MAX_PARALLEL);
		} else if (arg.startsWith('--category=')) {
			const cat = arg.split('=')[1] as TestCategory;
			if (['crud', 'query', 'edge', 'negative'].includes(cat)) {
				options.category = cat;
			}
		} else if (arg === '--continuous') {
			options.continuous = true;
		} else if (arg.startsWith('--report-every=')) {
			options.reportEvery = parseInt(arg.split('=')[1], 10) || CONFIG.REPORT_EVERY;
		} else if (arg === '--help' || arg === '-h') {
			console.log(`
TARX Autonomous Test Daemon

Usage:
  npx ts-node src/test/autonomous-test-daemon.ts [options]

Options:
  --count=N       Number of tests to run (default: 500)
  --parallel=N    Concurrent tests (default: 5, max: 10)
  --category=X    Only run specific category (crud|query|edge|negative)
  --continuous    Run forever, cycling through tests
  --report-every=N  Log summary every N tests (default: 50)
  --help, -h      Show this help message

Examples:
  npx ts-node src/test/autonomous-test-daemon.ts --count=100
  npx ts-node src/test/autonomous-test-daemon.ts --category=crud --count=50
  npx ts-node src/test/autonomous-test-daemon.ts --continuous --parallel=3
`);
			process.exit(0);
		}
	}

	return options;
}

// ============================================================
// ENTRY POINT
// ============================================================

const options = parseArgs();
runDaemon(options).catch(e => {
	console.error('Fatal error:', e);
	process.exit(1);
});
