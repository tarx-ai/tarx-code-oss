/**
 * Panel & View tools - Control panels, sidebars, and views
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_panel_show", "Show the bottom panel", {
		panel: z.string().optional().describe("Panel ID (terminal, output, problems, debug-console)"),
	}, async ({ panel }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/panel/show", "POST", { panel });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_panel_hide", "Hide the bottom panel", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/panel/hide", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_panel_toggle", "Toggle the bottom panel visibility", {}, async () => {
		const result = await harnessRequest<{ success: boolean; visible: boolean }>("/ui/panel/toggle", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_panel_get_state", "Get the state of the bottom panel", {}, async () => {
		const result = await harnessRequest<{ visible: boolean; activePanel: string | null; availablePanels: string[] }>("/ui/panel/state");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_show", "Show the primary sidebar", {
		viewId: z.string().optional().describe("View container ID to show (e.g., 'explorer', 'search', 'scm')"),
	}, async ({ viewId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/show", "POST", { viewId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_hide", "Hide the primary sidebar", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/hide", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_toggle", "Toggle the primary sidebar visibility", {}, async () => {
		const result = await harnessRequest<{ success: boolean; visible: boolean }>("/ui/sidebar/toggle", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_get_state", "Get the state of the primary sidebar", {}, async () => {
		const result = await harnessRequest<{ visible: boolean; activeView: string | null; width: number }>("/ui/sidebar/state");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_view_open", "Open a specific view by ID", {
		viewId: z.string().describe("View ID to open (e.g., 'workbench.view.explorer', 'tarx.sidebar')"),
	}, async ({ viewId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/view/open", "POST", { viewId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_view_close", "Close a specific view", {
		viewId: z.string().describe("View ID to close"),
	}, async ({ viewId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/view/close", "POST", { viewId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_view_focus", "Focus a specific view", {
		viewId: z.string().describe("View ID to focus"),
	}, async ({ viewId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/view/focus", "POST", { viewId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_secondary_sidebar_toggle", "Toggle the secondary sidebar visibility", {}, async () => {
		const result = await harnessRequest<{ success: boolean; visible: boolean }>("/ui/secondary-sidebar/toggle", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_layout_get", "Get the current editor layout configuration", {}, async () => {
		const result = await harnessRequest<{ groups: Array<{ viewColumn: number; tabs: number; isActive: boolean }>; orientation: string }>("/ui/layout/get");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_layout_set", "Set the editor layout", {
		layout: z.string().describe("Layout preset: 'single', 'two-columns', 'two-rows', 'grid'"),
	}, async ({ layout }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/layout/set", "POST", { layout });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
