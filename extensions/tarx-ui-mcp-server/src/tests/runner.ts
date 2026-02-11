/**
 * TARX UI Test Runner - Executes test cases via harness HTTP API
 */

import type { TestCase, TestResult, TestRunReport, TestStep } from './types.js';

const HARNESS_URL = process.env.TARX_UI_HARNESS_URL || 'http://localhost:11439';

async function harnessCall(endpoint: string, method: string = 'GET', body?: unknown): Promise<unknown> {
	const response = await fetch(`${HARNESS_URL}${endpoint}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	return response.json();
}

async function executeStep(step: TestStep, context: Map<string, unknown>): Promise<{ success: boolean; result: unknown; error?: string }> {
	try {
		const method = step.tool.includes('/') ? (step.params ? 'POST' : 'GET') : 'POST';
		const endpoint = step.tool.startsWith('/') ? step.tool : `/ui/${step.tool.replace(/_/g, '/')}`;
		const result = await harnessCall(endpoint, method, Object.keys(step.params).length > 0 ? step.params : undefined);

		if (step.captureResult) {
			context.set(step.captureResult, result);
		}

		if (step.waitMs) {
			await new Promise(r => setTimeout(r, step.waitMs));
		}

		const resultObj = result as Record<string, unknown>;
		const success = step.expectSuccess ? (resultObj.success !== false) : (resultObj.success === false);
		return { success, result };
	} catch (error) {
		return { success: !step.expectSuccess, result: null, error: (error as Error).message };
	}
}

async function verifyTest(test: TestCase, context: Map<string, unknown>): Promise<{ passed: boolean; details: string }> {
	const v = test.verify;

	if (v.type === 'state' && v.stateCheck) {
		try {
			const result = await harnessCall(v.stateCheck.endpoint) as Record<string, unknown>;
			for (const [key, expected] of Object.entries(v.stateCheck.expect)) {
				if (JSON.stringify(result[key]) !== JSON.stringify(expected)) {
					return { passed: false, details: `State check failed: ${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(result[key])}` };
				}
			}
			return { passed: true, details: 'State check passed' };
		} catch (e) {
			return { passed: false, details: `State check error: ${(e as Error).message}` };
		}
	}

	if (v.type === 'value' && v.valueCheck) {
		const actual = context.get(v.valueCheck.variable);
		switch (v.valueCheck.assertion) {
			case 'equals': return { passed: actual === v.valueCheck.expected, details: `${actual} === ${v.valueCheck.expected}` };
			case 'contains': return { passed: String(actual).includes(String(v.valueCheck.expected)), details: `contains check` };
			case 'truthy': return { passed: !!actual, details: `truthy check: ${actual}` };
			case 'falsy': return { passed: !actual, details: `falsy check: ${actual}` };
			default: return { passed: true, details: 'No assertion' };
		}
	}

	if (v.type === 'ocr' && v.ocrCheck) {
		try {
			const screenshot = await harnessCall('/ui/screenshot/full', 'POST') as { path: string };
			const ocrResult = await harnessCall('/ui/screenshot/ocr', 'POST', { imagePath: screenshot.path }) as { text: string };
			const text = ocrResult.text?.toLowerCase() || '';
			for (const expected of v.ocrCheck.expectText) {
				if (!text.includes(expected.toLowerCase())) {
					return { passed: false, details: `OCR: expected "${expected}" not found` };
				}
			}
			if (v.ocrCheck.notExpectText) {
				for (const notExpected of v.ocrCheck.notExpectText) {
					if (text.includes(notExpected.toLowerCase())) {
						return { passed: false, details: `OCR: unexpected "${notExpected}" found` };
					}
				}
			}
			return { passed: true, details: 'OCR verification passed' };
		} catch (e) {
			return { passed: false, details: `OCR error: ${(e as Error).message}` };
		}
	}

	return { passed: true, details: 'No verification configured' };
}

export async function runTest(test: TestCase): Promise<TestResult> {
	const start = Date.now();
	const context = new Map<string, unknown>();

	try {
		// Execute all steps
		for (const step of test.steps) {
			const { success, error } = await executeStep(step, context);
			if (!success) {
				return {
					testId: test.id,
					name: test.name,
					category: test.category,
					passed: false,
					duration_ms: Date.now() - start,
					error: error || `Step failed: ${step.tool}`,
					screenshotPath: null,
					verificationDetails: null
				};
			}
		}

		// Verify
		const { passed, details } = await verifyTest(test, context);

		return {
			testId: test.id,
			name: test.name,
			category: test.category,
			passed,
			duration_ms: Date.now() - start,
			error: passed ? null : details,
			screenshotPath: null,
			verificationDetails: details
		};
	} catch (error) {
		return {
			testId: test.id,
			name: test.name,
			category: test.category,
			passed: false,
			duration_ms: Date.now() - start,
			error: (error as Error).message,
			screenshotPath: null,
			verificationDetails: null
		};
	}
}

export async function runSuite(
	tests: TestCase[],
	options: { chaosMode?: boolean; screenshotOnFailure?: boolean; onProgress?: (completed: number, total: number) => void } = {}
): Promise<TestRunReport> {
	const runId = `run-${Date.now()}`;
	const startTime = Date.now();
	const results: TestResult[] = [];
	const byCategory: Record<string, { passed: number; failed: number; skipped: number }> = {};
	const toolsCovered = new Set<string>();

	const chaosActions = [
		'/ui/window/zoom-in', '/ui/window/zoom-out', '/ui/window/zoom-reset',
		'/ui/window/toggle-fullscreen', '/ui/window/toggle-zen'
	];

	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];

		// Chaos mode: interleave visual actions every 10 tests
		if (options.chaosMode && i > 0 && i % 10 === 0) {
			const chaosAction = chaosActions[Math.floor(Math.random() * chaosActions.length)];
			try { await harnessCall(chaosAction, 'POST'); } catch { /* ignore chaos failures */ }
			await new Promise(r => setTimeout(r, 500));
		}

		const result = await runTest(test);
		results.push(result);

		// Track category stats
		if (!byCategory[test.category]) {
			byCategory[test.category] = { passed: 0, failed: 0, skipped: 0 };
		}
		if (result.passed) {
			byCategory[test.category].passed++;
		} else {
			byCategory[test.category].failed++;
		}

		// Track tool coverage
		for (const step of test.steps) {
			toolsCovered.add(step.tool);
		}

		// Screenshot on failure
		if (!result.passed && options.screenshotOnFailure) {
			try {
				const ss = await harnessCall('/ui/screenshot/full', 'POST') as { path: string };
				result.screenshotPath = ss.path;
			} catch { /* ignore screenshot failures */ }
		}

		options.onProgress?.(i + 1, tests.length);
	}

	const endTime = Date.now();
	const passed = results.filter(r => r.passed).length;
	const failed = results.filter(r => !r.passed).length;

	return {
		runId,
		startTime,
		endTime,
		duration_ms: endTime - startTime,
		total: tests.length,
		passed,
		failed,
		skipped: 0,
		results,
		byCategory,
		coverage: {
			toolsCovered: toolsCovered.size,
			totalTools: 168,
			percentage: Math.round((toolsCovered.size / 168) * 100)
		},
		topFailures: results
			.filter(r => !r.passed)
			.slice(0, 10)
			.map(r => ({ testId: r.testId, name: r.name, error: r.error || 'Unknown' }))
	};
}
