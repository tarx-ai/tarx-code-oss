/**
 * TARX UI Test Framework Types
 */

export interface TestCase {
	id: string;            // "A-001", "E-042", "M-015"
	category: string;      // "editor", "tarx-sidebar", "integration"
	name: string;
	description: string;
	priority: 'P0' | 'P1' | 'P2';
	tags: string[];
	steps: TestStep[];
	verify: TestVerification;
	timeoutMs: number;
	retries: number;
}

export interface TestStep {
	tool: string;           // MCP tool name or harness endpoint
	params: Record<string, unknown>;
	expectSuccess: boolean;
	captureResult?: string; // Variable name to store result
	waitMs?: number;        // Wait after step
}

export interface TestVerification {
	type: 'state' | 'ocr' | 'screenshot' | 'value' | 'composite';
	stateCheck?: { endpoint: string; params?: Record<string, unknown>; expect: Record<string, unknown> };
	ocrCheck?: { region?: string; expectText: string[]; notExpectText?: string[] };
	screenshotCheck?: { baselinePath?: string; maxDiffPercent: number };
	valueCheck?: { variable: string; assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt'; expected: unknown };
}

export interface TestResult {
	testId: string;
	name: string;
	category: string;
	passed: boolean;
	duration_ms: number;
	error: string | null;
	screenshotPath: string | null;
	verificationDetails: string | null;
}

export interface TestRunReport {
	runId: string;
	startTime: number;
	endTime: number;
	duration_ms: number;
	total: number;
	passed: number;
	failed: number;
	skipped: number;
	results: TestResult[];
	byCategory: Record<string, { passed: number; failed: number; skipped: number }>;
	coverage: { toolsCovered: number; totalTools: number; percentage: number };
	topFailures: Array<{ testId: string; name: string; error: string }>;
}
