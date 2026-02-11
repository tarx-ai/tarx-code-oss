/**
 * Shared types for TARX UI MCP tool modules
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface HarnessResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

export type HarnessRequestFn = <T>(
	endpoint: string,
	method?: "GET" | "POST" | "DELETE",
	body?: unknown
) => Promise<HarnessResponse<T>>;

export type ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => void;
