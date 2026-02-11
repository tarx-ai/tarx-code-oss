#!/usr/bin/env node
/**
 * TARX UI MCP Server v2.0.0
 *
 * Full UI control for TARX desktop app — 168 tools across 17 categories.
 * Allows Claude to programmatically control every aspect of the VS Code UI,
 * capture screenshots, run OCR, and execute 2500 automated test cases.
 *
 * Required environment variables:
 * - TARX_UI_HARNESS_URL: Test harness endpoint (default: http://localhost:11439)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools, TOOL_COUNT } from "./tools/index.js";
import type { HarnessResponse } from "./tools/types.js";

// Configuration from environment
const HARNESS_URL = process.env.TARX_UI_HARNESS_URL || "http://localhost:11439";

// =============================================================================
// TEST HARNESS CLIENT
// =============================================================================

async function harnessRequest<T>(
	endpoint: string,
	method: "GET" | "POST" | "DELETE" = "GET",
	body?: unknown
): Promise<HarnessResponse<T>> {
	try {
		const response = await fetch(`${HARNESS_URL}${endpoint}`, {
			method,
			headers: { "Content-Type": "application/json" },
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			const text = await response.text();
			return { success: false, error: `HTTP ${response.status}: ${text}` };
		}

		const data = (await response.json()) as T;
		return { success: true, data };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Request failed",
		};
	}
}

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new McpServer({
	name: "tarx-ui",
	version: "2.0.0",
});

// Register all 168 tools from modular files
const registered = registerAllTools(server, harnessRequest);

// Resource: UI test config
server.resource("tarx-ui://config", "UI MCP server configuration", async () => ({
	contents: [
		{
			uri: "tarx-ui://config",
			mimeType: "application/json",
			text: JSON.stringify(
				{
					server: "tarx-ui-mcp",
					version: "2.0.0",
					harnessUrl: HARNESS_URL,
					toolCount: registered,
					expectedToolCount: TOOL_COUNT,
				},
				null,
				2
			),
		},
	],
}));

// Start server
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error(`TARX UI MCP Server v2.0.0 started (${registered}/${TOOL_COUNT} tools, harness: ${HARNESS_URL})`);
}

main().catch(console.error);
