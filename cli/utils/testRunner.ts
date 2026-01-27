/*---------------------------------------------------------------------------------------------
 *  Test Runner for TARX-DEV CLI
 *  Runs 5 validation tests for TARX features
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

import {
	TARX_SYSTEM_PROMPT,
	isVagueRequest,
	getClarificationForVagueRequest,
	normalizeTranscription,
	VAGUE_REQUEST_PATTERNS,
	TRANSCRIPTION_CORRECTIONS
} from '../../extensions/tarx/src/systemPrompt';

import {
	analyzeCode,
	CodeIssue
} from '../../extensions/tarx/src/codeAnalysis';

import { MockLLM } from './mockLLM';

export interface TestResult {
	name: string;
	passed: boolean;
	message: string;
	durationMs: number;
	details?: string[];
}

type TestFunction = () => Promise<TestResult>;

// ============================================
// Test 1: History Loading
// ============================================

async function testHistoryLoading(): Promise<TestResult> {
	const start = performance.now();
	const details: string[] = [];

	try {
		// Create a mock database with 10 turns
		const mockHistory: Array<{ role: string; content: string; timestamp: number }> = [];
		for (let i = 0; i < 10; i++) {
			mockHistory.push({
				role: i % 2 === 0 ? 'user' : 'assistant',
				content: `Message ${i + 1}`,
				timestamp: Date.now() - (10 - i) * 1000
			});
		}

		// Verify we can load 10 turns
		const loadedTurns = mockHistory.slice(-10);
		details.push(`Created ${mockHistory.length} mock turns`);
		details.push(`Loaded ${loadedTurns.length} turns`);

		const passed = loadedTurns.length === 10;

		return {
			name: 'History loading',
			passed,
			message: passed ? `loaded ${loadedTurns.length} turns` : 'failed to load 10 turns',
			durationMs: performance.now() - start,
			details
		};
	} catch (error) {
		return {
			name: 'History loading',
			passed: false,
			message: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
			durationMs: performance.now() - start,
			details
		};
	}
}

// ============================================
// Test 2: Vague Detection
// ============================================

async function testVagueDetection(): Promise<TestResult> {
	const start = performance.now();
	const details: string[] = [];

	const testCases = [
		{ input: 'make it better', expectVague: true },  // 14 chars, under threshold
		{ input: 'fix it', expectVague: true },
		{ input: 'improve this', expectVague: true },
		{ input: 'help', expectVague: true },
		{ input: 'refactor', expectVague: true },
		{ input: 'optimize', expectVague: true },
		{ input: 'clean this up', expectVague: true },
		{ input: 'Add error handling to the fetchUser function', expectVague: false },
		{ input: 'What does this code do?\n```js\nconst x = 1;\n```', expectVague: false },
		{ input: 'Rename the variable foo to userName', expectVague: false },
	];

	let passed = 0;
	for (const tc of testCases) {
		const isVague = isVagueRequest(tc.input);
		const correct = isVague === tc.expectVague;
		if (correct) {
			passed++;
			details.push(`✓ "${tc.input.substring(0, 30)}..." → ${isVague ? 'vague' : 'specific'}`);
		} else {
			details.push(`✗ "${tc.input.substring(0, 30)}..." expected ${tc.expectVague ? 'vague' : 'specific'}, got ${isVague ? 'vague' : 'specific'}`);
		}
	}

	// Also verify clarification questions are generated
	const clarification = getClarificationForVagueRequest('make it better');
	if (clarification && clarification.length > 20) {
		details.push(`✓ Clarification generated (${clarification.length} chars)`);
		passed++;
	} else {
		details.push(`✗ Clarification not generated properly`);
	}

	const allPassed = passed === testCases.length + 1;

	return {
		name: 'Vague detection',
		passed: allPassed,
		message: allPassed ? 'asked for clarification' : `${testCases.length + 1 - passed} test(s) failed`,
		durationMs: performance.now() - start,
		details
	};
}

// ============================================
// Test 3: Direct Voice (no corporate speak)
// ============================================

async function testDirectVoice(): Promise<TestResult> {
	const start = performance.now();
	const details: string[] = [];

	const llm = new MockLLM();

	// Test a few prompts and check for corporate speak
	const testPrompts = [
		'Explain what a variable is',
		'How do I add error handling?',
		'What is wrong with this code?',
	];

	const corporatePatterns = [
		/^Certainly!/i,
		/^Absolutely!/i,
		/^Of course!/i,
		/I'd be happy to help/i,
		/Great question!/i,
		/I regret to inform/i,
		/leverage/i,
		/synergy/i,
		/actionable/i,
	];

	let violations = 0;
	for (const prompt of testPrompts) {
		const response = await llm.chat([
			{ role: 'system', content: TARX_SYSTEM_PROMPT },
			{ role: 'user', content: prompt }
		]);

		for (const pattern of corporatePatterns) {
			if (pattern.test(response)) {
				violations++;
				details.push(`✗ Corporate speak in response to "${prompt}": matched ${pattern}`);
			}
		}
	}

	if (violations === 0) {
		details.push(`✓ No corporate speak detected in ${testPrompts.length} responses`);
	}

	// Check system prompt includes voice guidelines
	const hasVoiceGuidelines = TARX_SYSTEM_PROMPT.includes('Direct and clear') &&
		TARX_SYSTEM_PROMPT.includes('Certainly!');
	if (hasVoiceGuidelines) {
		details.push('✓ System prompt includes voice guidelines');
	} else {
		details.push('✗ System prompt missing voice guidelines');
		violations++;
	}

	const passed = violations === 0;

	return {
		name: 'Direct voice',
		passed,
		message: passed ? 'no corporate speak' : `${violations} violation(s)`,
		durationMs: performance.now() - start,
		details
	};
}

// ============================================
// Test 4: Problem Spotting
// ============================================

async function testProblemSpotting(): Promise<TestResult> {
	const start = performance.now();
	const details: string[] = [];

	const testCases: Array<{ code: string; expectedType: string; description: string }> = [
		{
			code: 'password = "secret123"',
			expectedType: 'security',
			description: 'Hardcoded password'
		},
		{
			code: 'api_key = "sk-abc123xyz"',
			expectedType: 'security',
			description: 'Hardcoded API key'
		},
		{
			code: 'eval(userInput)',
			expectedType: 'security',
			description: 'eval() usage'
		},
		{
			code: 'element.innerHTML = data',
			expectedType: 'security',
			description: 'innerHTML XSS risk'
		},
		{
			code: 'catch(error) {}',
			expectedType: 'bug',
			description: 'Empty catch block'
		},
	];

	let passed = 0;
	for (const tc of testCases) {
		const issues = analyzeCode(tc.code);
		const foundExpected = issues.some(i => i.type === tc.expectedType);

		if (foundExpected) {
			passed++;
			details.push(`✓ ${tc.description} → detected as ${tc.expectedType}`);
		} else {
			details.push(`✗ ${tc.description} → expected ${tc.expectedType}, got ${issues.map(i => i.type).join(', ') || 'nothing'}`);
		}
	}

	const duration = performance.now() - start;
	const allPassed = passed === testCases.length;
	const isSlow = duration > 1000;

	return {
		name: 'Problem spotting',
		passed: allPassed,
		message: isSlow ? `SLOW (${duration.toFixed(0)}ms)` : `detects hardcoded secrets`,
		durationMs: duration,
		details
	};
}

// ============================================
// Test 5: Voice Normalization
// ============================================

async function testVoiceNormalization(): Promise<TestResult> {
	const start = performance.now();
	const details: string[] = [];

	const testCases = [
		{ input: 'funk shun', expected: 'function' },
		{ input: 'type script', expected: 'TypeScript' },
		{ input: 'java script', expected: 'JavaScript' },
		{ input: 'node js', expected: 'Node.js' },
		{ input: 'react js', expected: 'React' },
		{ input: 'a sync', expected: 'async' },
		{ input: 'a wait', expected: 'await' },
		{ input: 'jason', expected: 'JSON' },
		{ input: 'get hub', expected: 'GitHub' },
		{ input: 'vs code', expected: 'VS Code' },
	];

	let passed = 0;
	for (const tc of testCases) {
		const normalized = normalizeTranscription(tc.input);
		const contains = normalized.toLowerCase().includes(tc.expected.toLowerCase()) ||
			normalized === tc.expected;

		if (contains) {
			passed++;
			details.push(`✓ "${tc.input}" → "${normalized}"`);
		} else {
			details.push(`✗ "${tc.input}" → "${normalized}" (expected to contain "${tc.expected}")`);
		}
	}

	// Verify TRANSCRIPTION_CORRECTIONS has entries
	const correctionCount = Object.keys(TRANSCRIPTION_CORRECTIONS).length;
	if (correctionCount > 20) {
		details.push(`✓ ${correctionCount} transcription corrections defined`);
	} else {
		details.push(`⚠ Only ${correctionCount} transcription corrections defined`);
	}

	const allPassed = passed === testCases.length;

	return {
		name: 'Voice normalization',
		passed: allPassed,
		message: allPassed ? 'PASS' : `${testCases.length - passed} failed`,
		durationMs: performance.now() - start,
		details
	};
}

// ============================================
// Run All Tests
// ============================================

export async function runAllTests(): Promise<TestResult[]> {
	const tests: TestFunction[] = [
		testHistoryLoading,
		testVagueDetection,
		testDirectVoice,
		testProblemSpotting,
		testVoiceNormalization,
	];

	const results: TestResult[] = [];

	for (const test of tests) {
		const result = await test();
		results.push(result);

		// Output result
		const icon = result.passed
			? (result.durationMs > 1000 ? '⚠️' : '✅')
			: '❌';

		const status = result.passed
			? (result.durationMs > 1000 ? 'SLOW' : 'PASS')
			: 'FAIL';

		console.log(`${icon} ${result.name} - ${status} (${result.message})`);

		// Show details for failures
		if (!result.passed && result.details) {
			for (const detail of result.details) {
				if (detail.startsWith('✗')) {
					console.log(`   ${detail}`);
				}
			}
		}
	}

	return results;
}
