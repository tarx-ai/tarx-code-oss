/**
 * Extensions tools - Manage VS Code extensions
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_extensions_open", "Open the Extensions view", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/extensions/open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_extensions_list_installed", "List all installed extensions", {}, async () => {
		const result = await harnessRequest<{ extensions: Array<{ id: string; name: string; version: string; enabled: boolean; publisher: string }>; count: number }>("/ui/extensions/installed");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_extensions_search", "Search for extensions in the marketplace", {
		query: z.string().describe("Search query"),
	}, async ({ query }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/extensions/search", "POST", { query });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_extensions_install", "Install an extension by ID", {
		extensionId: z.string().describe("Extension ID (publisher.name)"),
	}, async ({ extensionId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/extensions/install", "POST", { extensionId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_extensions_uninstall", "Uninstall an extension", {
		extensionId: z.string().describe("Extension ID to uninstall"),
	}, async ({ extensionId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/extensions/uninstall", "POST", { extensionId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_extensions_enable_disable", "Enable or disable an extension", {
		extensionId: z.string().describe("Extension ID"),
		enable: z.boolean().describe("true to enable, false to disable"),
	}, async ({ extensionId, enable }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/extensions/toggle", "POST", { extensionId, enable });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
