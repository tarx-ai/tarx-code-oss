/**
 * TARX Sidebar tools - Control the TARX React sidebar webview
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_sidebar_get_full_state", "Get the complete state of the TARX sidebar (projects, history, files, settings)", {}, async () => {
		const result = await harnessRequest<{ projects: unknown[]; selectedProject: string | null; history: unknown[]; files: unknown[]; connectionStatus: unknown }>("/sidebar/state");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_do_action", "Execute an action in the TARX sidebar", {
		action: z.enum(["selectProject", "openConversation", "openSession", "newChat", "openChat", "createProject", "deleteFile"]).describe("Action to execute"),
		projectId: z.string().optional().describe("Project ID (for selectProject)"),
		conversationId: z.string().optional().describe("Conversation ID (for openConversation)"),
		sessionId: z.string().optional().describe("Session ID (for openSession)"),
		spaceId: z.string().optional().describe("Space ID (for openSession)"),
		name: z.string().optional().describe("Name (for createProject)"),
		instructions: z.string().optional().describe("Instructions (for createProject)"),
		fileId: z.string().optional().describe("File ID (for deleteFile)"),
	}, async (params) => {
		const result = await harnessRequest<{ success: boolean; action: string; result: unknown }>("/sidebar/action", "POST", params);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_toggle_section", "Toggle a sidebar section (collapse/expand)", {
		section: z.enum(["projects", "history", "files"]).describe("Section to toggle"),
	}, async ({ section }) => {
		const result = await harnessRequest<{ success: boolean; section: string; collapsed: boolean }>("/ui/sidebar/toggle-section", "POST", { section });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_get_projects", "Get all projects from the sidebar", {}, async () => {
		const result = await harnessRequest<{ projects: Array<{ id: string; name: string; path: string; isActive: boolean }>; count: number }>("/project/list");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_get_history", "Get conversation history from the sidebar", {
		limit: z.number().optional().describe("Max items to return (default: 20)"),
	}, async ({ limit }) => {
		const result = await harnessRequest<{ history: unknown[]; count: number }>(`/ui/sidebar/history?limit=${limit || 20}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_get_files", "Get uploaded files from the sidebar", {}, async () => {
		const result = await harnessRequest<{ files: Array<{ id: string; filename: string; size: number; uploadedAt: number }> }>("/ui/sidebar/files");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_search_history", "Search conversation history", {
		query: z.string().describe("Search query"),
	}, async ({ query }) => {
		const result = await harnessRequest<{ results: unknown[]; count: number }>("/ui/sidebar/search-history", "POST", { query });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_delete_history", "Delete a conversation from history", {
		itemId: z.string().describe("History item ID to delete"),
	}, async ({ itemId }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/delete-history", "POST", { itemId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_navigate_to", "Navigate the sidebar to a specific view", {
		view: z.enum(["home", "settings", "chat", "project"]).describe("View to navigate to"),
		projectId: z.string().optional().describe("Project ID (for project view)"),
	}, async ({ view, projectId }) => {
		const result = await harnessRequest<{ success: boolean; view: string }>("/ui/sidebar/navigate", "POST", { view, projectId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_open_settings", "Open the TARX settings panel", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/settings", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_get_settings", "Get current TARX settings", {}, async () => {
		const result = await harnessRequest<{ settings: Record<string, unknown> }>("/ui/sidebar/get-settings");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_update_settings", "Update TARX settings", {
		key: z.string().describe("Setting key"),
		value: z.string().describe("Setting value (JSON string for objects)"),
	}, async ({ key, value }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/update-settings", "POST", { key, value });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_connection_status", "Get TARX connection status", {}, async () => {
		const result = await harnessRequest<{ tarx: boolean; mesh: boolean; inference: boolean }>("/ui/sidebar/connection-status");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_collapse", "Collapse all sidebar sections", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/collapse-all", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_expand", "Expand all sidebar sections", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/expand-all", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_sidebar_refresh", "Force refresh all sidebar data", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/sidebar/refresh", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
