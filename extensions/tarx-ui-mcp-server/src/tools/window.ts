/**
 * Window tools - Window management, zoom, fullscreen, workspace
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_window_reload", "Reload the VS Code window", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/window/reload", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_window_toggle_fullscreen", "Toggle fullscreen mode", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/window/toggle-fullscreen", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_window_toggle_zen", "Toggle Zen Mode", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/window/toggle-zen", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_window_zoom_in", "Zoom in the UI", {}, async () => {
		const result = await harnessRequest<{ success: boolean; zoomLevel: number }>("/ui/window/zoom-in", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_window_zoom_out", "Zoom out the UI", {}, async () => {
		const result = await harnessRequest<{ success: boolean; zoomLevel: number }>("/ui/window/zoom-out", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_window_zoom_reset", "Reset zoom to default", {}, async () => {
		const result = await harnessRequest<{ success: boolean; zoomLevel: number }>("/ui/window/zoom-reset", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_window_workspace_open", "Open a workspace or folder", {
		path: z.string().describe("Path to folder or .code-workspace file"),
		newWindow: z.boolean().optional().describe("Open in new window (default: false)"),
	}, async ({ path, newWindow }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/window/workspace-open", "POST", { path, newWindow });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_window_workspace_add_folder", "Add a folder to the workspace", {
		path: z.string().describe("Folder path to add"),
	}, async ({ path }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/window/workspace-add-folder", "POST", { path });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
