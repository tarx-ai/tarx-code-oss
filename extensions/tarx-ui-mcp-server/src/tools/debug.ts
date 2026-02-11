/**
 * Debug tools - Debug session control, breakpoints, stepping
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_debug_open", "Open the Debug view", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/debug/open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_debug_start", "Start a debug session", {
		configuration: z.string().optional().describe("Debug configuration name (from launch.json)"),
	}, async ({ configuration }) => {
		const result = await harnessRequest<{ success: boolean; sessionId: string | null }>("/ui/debug/start", "POST", { configuration });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_debug_stop", "Stop the active debug session", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/debug/stop", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_debug_pause", "Pause the active debug session", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/debug/pause", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_debug_continue", "Continue execution in debug session", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/debug/continue", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_debug_step_over", "Step over the next line", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/debug/step-over", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_debug_step_into", "Step into the next function call", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/debug/step-into", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_debug_get_state", "Get current debug session state", {}, async () => {
		const result = await harnessRequest<{ isDebugging: boolean; isPaused: boolean; currentFile: string | null; currentLine: number | null; callStack: string[]; variables: Record<string, unknown> }>("/ui/debug/state");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
