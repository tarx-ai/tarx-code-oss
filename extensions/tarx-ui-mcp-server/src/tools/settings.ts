/**
 * Settings tools - VS Code settings, keybindings, and preferences
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_settings_open_ui", "Open VS Code Settings UI", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/settings/open-ui", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_settings_open_json", "Open settings.json in editor", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/settings/open-json", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_settings_get", "Get a VS Code setting value", {
		key: z.string().describe("Setting key (e.g., 'editor.fontSize')"),
	}, async ({ key }) => {
		const result = await harnessRequest<{ key: string; value: unknown; defaultValue: unknown }>(`/ui/settings/get?key=${encodeURIComponent(key)}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_settings_set", "Set a VS Code setting value", {
		key: z.string().describe("Setting key"),
		value: z.string().describe("Setting value (JSON string for objects)"),
		target: z.enum(["global", "workspace"]).optional().describe("Setting scope (default: global)"),
	}, async ({ key, value, target }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/settings/set", "POST", { key, value, target });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_settings_search", "Search settings by keyword", {
		query: z.string().describe("Search query"),
	}, async ({ query }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/settings/search", "POST", { query });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_settings_reset", "Reset a setting to its default value", {
		key: z.string().describe("Setting key to reset"),
	}, async ({ key }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/settings/reset", "POST", { key });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_keybindings_open", "Open the Keyboard Shortcuts editor", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/keybindings/open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_keybindings_get", "Get keybinding for a command", {
		command: z.string().describe("Command ID to look up keybinding for"),
	}, async ({ command }) => {
		const result = await harnessRequest<{ command: string; keybinding: string | null; when: string | null }>(`/ui/keybindings/get?command=${encodeURIComponent(command)}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
