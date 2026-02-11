/**
 * Test Runner tools - Execute and manage the 2500 test suite
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_test_run_suite", "Run a test suite by tag or category", {
		tag: z.string().optional().describe("Tag to filter tests (e.g., 'smoke', 'p0', 'editor')"),
		category: z.string().optional().describe("Category to run (e.g., 'A', 'E', 'M')"),
		chaosMode: z.boolean().optional().describe("Enable chaos mode - interleave visual actions (default: false)"),
	}, async ({ tag, category, chaosMode }) => {
		const result = await harnessRequest<{ success: boolean; runId: string; totalTests: number; status: string }>("/ui/test/run-suite", "POST", { tag, category, chaosMode });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_run_single", "Run a single test case by ID", {
		testId: z.string().describe("Test case ID (e.g., 'A-001', 'E-042')"),
	}, async ({ testId }) => {
		const result = await harnessRequest<{ success: boolean; testId: string; passed: boolean; duration_ms: number; error: string | null }>("/ui/test/run-single", "POST", { testId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_run_category", "Run all tests in a specific category", {
		category: z.string().describe("Category letter (A-M)"),
		priority: z.enum(["P0", "P1", "P2", "all"]).optional().describe("Filter by priority (default: all)"),
	}, async ({ category, priority }) => {
		const result = await harnessRequest<{ success: boolean; runId: string; category: string; totalTests: number }>("/ui/test/run-category", "POST", { category, priority });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_run_all", "Run ALL 2500 test cases", {
		chaosMode: z.boolean().optional().describe("Enable chaos mode (default: false)"),
		screenshotOnFailure: z.boolean().optional().describe("Auto-screenshot on failure (default: true)"),
	}, async ({ chaosMode, screenshotOnFailure }) => {
		const result = await harnessRequest<{ success: boolean; runId: string; totalTests: number; estimatedMinutes: number }>("/ui/test/run-all", "POST", { chaosMode, screenshotOnFailure });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_get_results", "Get test results for a run", {
		runId: z.string().optional().describe("Run ID (default: latest run)"),
	}, async ({ runId }) => {
		const result = await harnessRequest<{ runId: string; status: string; passed: number; failed: number; skipped: number; duration_ms: number; failures: Array<{ testId: string; name: string; error: string; screenshot: string | null }> }>(`/ui/test/results?runId=${runId || "latest"}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_get_report", "Get a full test report with coverage", {
		runId: z.string().optional().describe("Run ID (default: latest run)"),
	}, async ({ runId }) => {
		const result = await harnessRequest<{ runId: string; summary: { total: number; passed: number; failed: number; skipped: number; duration_ms: number }; byCategory: Record<string, { passed: number; failed: number; skipped: number }>; coverage: { toolsCovered: number; totalTools: number; percentage: number }; topFailures: Array<{ testId: string; name: string; error: string }> }>(`/ui/test/report?runId=${runId || "latest"}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_list_suites", "List available test suites", {}, async () => {
		const result = await harnessRequest<{ suites: Array<{ name: string; category: string; testCount: number; tags: string[] }> }>("/ui/test/suites");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_list_cases", "List test cases with filtering", {
		category: z.string().optional().describe("Filter by category"),
		priority: z.string().optional().describe("Filter by priority"),
		tag: z.string().optional().describe("Filter by tag"),
		limit: z.number().optional().describe("Max results (default: 50)"),
	}, async ({ category, priority, tag, limit }) => {
		const result = await harnessRequest<{ tests: Array<{ id: string; name: string; category: string; priority: string; tags: string[] }>; total: number }>(`/ui/test/cases?category=${category || ""}&priority=${priority || ""}&tag=${tag || ""}&limit=${limit || 50}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_reset", "Reset test state and clear results", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/test/reset", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_test_get_coverage", "Get tool coverage report", {}, async () => {
		const result = await harnessRequest<{ totalTools: number; exercised: number; percentage: number; uncovered: string[] }>("/ui/test/coverage");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
