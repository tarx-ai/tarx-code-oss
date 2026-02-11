/**
 * Command tools - Execute commands, command palette, and quick open
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_command_execute", "Execute a VS Code command by ID", {
		command: z.string().describe("Command ID (e.g., 'workbench.action.toggleSidebarVisibility')"),
		args: z.array(z.string()).optional().describe("Command arguments"),
	}, async ({ command, args }) => {
		const result = await harnessRequest<{ success: boolean; command: string; result: unknown; latency_ms: number }>("/ui/command", "POST", { command, args });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_command_list", "List all available VS Code commands", {
		filter: z.string().optional().describe("Filter commands by prefix (e.g., 'tarx.', 'workbench.')"),
	}, async ({ filter }) => {
		const result = await harnessRequest<{ commands: string[]; count: number }>(`/ui/command/list?filter=${filter || ""}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_command_search", "Search commands by keyword", {
		query: z.string().describe("Search query"),
	}, async ({ query }) => {
		const result = await harnessRequest<{ commands: Array<{ id: string; title: string }>; count: number }>(`/ui/command/search?q=${encodeURIComponent(query)}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_command_palette_open", "Open the command palette", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/command/palette-open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_command_palette_type", "Type text into the command palette", {
		text: z.string().describe("Text to type"),
	}, async ({ text }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/command/palette-type", "POST", { text });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_quickopen_open", "Open the Quick Open file picker", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/quickopen/open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_quickopen_type", "Type text into Quick Open", {
		text: z.string().describe("Text to type (file name pattern)"),
	}, async ({ text }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/quickopen/type", "POST", { text });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_quickopen_select", "Select an item from Quick Open by index", {
		index: z.number().optional().describe("Item index (0-based, default: 0 for first item)"),
	}, async ({ index }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/quickopen/select", "POST", { index });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
