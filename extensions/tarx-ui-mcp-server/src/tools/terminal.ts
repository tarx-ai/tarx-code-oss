/**
 * Terminal tools - Create, manage, and interact with integrated terminals
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_terminal_create", "Create a new integrated terminal", {
		name: z.string().optional().describe("Terminal name"),
		cwd: z.string().optional().describe("Working directory"),
		shellPath: z.string().optional().describe("Shell executable path"),
	}, async ({ name, cwd, shellPath }) => {
		const result = await harnessRequest<{ success: boolean; terminalId: number; name: string }>("/ui/terminal/create", "POST", { name, cwd, shellPath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_send_command", "Send a command to a terminal", {
		command: z.string().describe("Command to send"),
		terminalId: z.number().optional().describe("Terminal ID (default: active terminal)"),
		addNewLine: z.boolean().optional().describe("Append newline (default: true)"),
	}, async ({ command, terminalId, addNewLine }) => {
		const result = await harnessRequest<{ success: boolean; terminalId: number }>("/ui/terminal/send", "POST", { command, terminalId, addNewLine });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_list", "List all open terminals", {}, async () => {
		const result = await harnessRequest<{ terminals: Array<{ id: number; name: string; isActive: boolean; processId: number | null }> }>("/ui/terminal/list");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_select", "Focus a specific terminal", {
		terminalId: z.number().describe("Terminal ID to focus"),
	}, async ({ terminalId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/terminal/select", "POST", { terminalId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_close", "Close a specific terminal", {
		terminalId: z.number().optional().describe("Terminal ID to close (default: active)"),
	}, async ({ terminalId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/terminal/close", "POST", { terminalId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_close_all", "Close all terminals", {}, async () => {
		const result = await harnessRequest<{ success: boolean; closedCount: number }>("/ui/terminal/close-all", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_get_state", "Get the state of a terminal", {
		terminalId: z.number().optional().describe("Terminal ID (default: active)"),
	}, async ({ terminalId }) => {
		const result = await harnessRequest<{ name: string; isActive: boolean; processId: number | null; exitStatus: number | null }>(`/ui/terminal/state?terminalId=${terminalId || ""}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_split", "Split the active terminal", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/terminal/split", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_rename", "Rename a terminal", {
		terminalId: z.number().optional().describe("Terminal ID (default: active)"),
		name: z.string().describe("New name"),
	}, async ({ terminalId, name }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/terminal/rename", "POST", { terminalId, name });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_show", "Show the terminal panel", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/terminal/show", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_hide", "Hide the terminal panel", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/terminal/hide", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_terminal_set_profile", "Set the default terminal profile", {
		profileName: z.string().describe("Profile name (e.g., 'bash', 'zsh', 'pwsh')"),
	}, async ({ profileName }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/terminal/set-profile", "POST", { profileName });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
