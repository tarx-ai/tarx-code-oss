/**
 * Theme & Appearance tools - Control themes, fonts, and visual settings
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_theme_set", "Set the color theme", {
		theme: z.string().describe("Theme ID (e.g., 'Default Dark Modern', 'Default Light Modern')"),
	}, async ({ theme }) => {
		const result = await harnessRequest<{ success: boolean; theme: string }>("/ui/theme/set", "POST", { theme });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_theme_get", "Get the current color theme", {}, async () => {
		const result = await harnessRequest<{ theme: string; kind: string }>("/ui/theme/get");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_theme_list", "List all available color themes", {}, async () => {
		const result = await harnessRequest<{ themes: Array<{ id: string; label: string; kind: string }>; count: number }>("/ui/theme/list");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_theme_icon_set", "Set the icon theme", {
		theme: z.string().describe("Icon theme ID"),
	}, async ({ theme }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/theme/icon-set", "POST", { theme });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_theme_font_size_set", "Set the editor font size", {
		size: z.number().describe("Font size in pixels"),
	}, async ({ size }) => {
		const result = await harnessRequest<{ success: boolean; fontSize: number }>("/ui/theme/font-size", "POST", { size });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_theme_font_family_set", "Set the editor font family", {
		fontFamily: z.string().describe("Font family name (e.g., 'Fira Code', 'JetBrains Mono')"),
	}, async ({ fontFamily }) => {
		const result = await harnessRequest<{ success: boolean; fontFamily: string }>("/ui/theme/font-family", "POST", { fontFamily });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
