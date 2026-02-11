/**
 * Status Bar tools - Inspect and interact with status bar items
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_statusbar_get_items", "Get all visible status bar items", {}, async () => {
		const result = await harnessRequest<{ items: Array<{ id: string; text: string; tooltip: string; alignment: string; priority: number }>; count: number }>("/ui/statusbar/items");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_statusbar_click", "Click a status bar item by ID", {
		itemId: z.string().describe("Status bar item ID to click"),
	}, async ({ itemId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/statusbar/click", "POST", { itemId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_statusbar_get_tarx", "Get the TARX status bar item state", {}, async () => {
		const result = await harnessRequest<{ text: string; tooltip: string; color: string | null; command: string | null }>("/ui/statusbar/tarx");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_statusbar_set_tarx", "Update the TARX status bar item", {
		text: z.string().optional().describe("New text"),
		tooltip: z.string().optional().describe("New tooltip"),
		color: z.string().optional().describe("New color"),
	}, async ({ text, tooltip, color }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/statusbar/set-tarx", "POST", { text, tooltip, color });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
