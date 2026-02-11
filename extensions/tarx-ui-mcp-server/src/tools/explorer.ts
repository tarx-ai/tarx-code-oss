/**
 * Explorer tools - File explorer, workspace, and file management
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_explorer_open", "Open the file explorer view", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_get_tree", "Get the file tree from the explorer", {
		path: z.string().optional().describe("Path to list (default: workspace root)"),
		depth: z.number().optional().describe("Max depth (default: 2)"),
	}, async ({ path, depth }) => {
		const result = await harnessRequest<{ tree: Array<{ name: string; type: string; path: string; children?: unknown[] }>; count: number }>(`/ui/explorer/tree?path=${encodeURIComponent(path || "")}&depth=${depth || 2}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_expand_folder", "Expand a folder in the explorer", {
		path: z.string().describe("Folder path to expand"),
	}, async ({ path }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/expand", "POST", { path });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_collapse_folder", "Collapse a folder in the explorer", {
		path: z.string().describe("Folder path to collapse"),
	}, async ({ path }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/collapse", "POST", { path });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_select_file", "Select a file in the explorer", {
		path: z.string().describe("File path to select"),
	}, async ({ path }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/select", "POST", { path });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_reveal_file", "Reveal a file in the explorer and scroll to it", {
		path: z.string().describe("File path to reveal"),
	}, async ({ path }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/reveal", "POST", { path });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_create_file", "Create a new file", {
		path: z.string().describe("File path to create"),
		content: z.string().optional().describe("Initial file content"),
	}, async ({ path, content }) => {
		const result = await harnessRequest<{ success: boolean; path: string }>("/ui/explorer/create-file", "POST", { path, content });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_create_folder", "Create a new folder", {
		path: z.string().describe("Folder path to create"),
	}, async ({ path }) => {
		const result = await harnessRequest<{ success: boolean; path: string }>("/ui/explorer/create-folder", "POST", { path });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_delete", "Delete a file or folder", {
		path: z.string().describe("Path to delete"),
		recursive: z.boolean().optional().describe("Delete recursively for folders (default: false)"),
	}, async ({ path, recursive }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/delete", "POST", { path, recursive });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_rename", "Rename a file or folder", {
		oldPath: z.string().describe("Current path"),
		newPath: z.string().describe("New path"),
	}, async ({ oldPath, newPath }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/rename", "POST", { oldPath, newPath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_copy", "Copy a file or folder", {
		sourcePath: z.string().describe("Source path"),
		destinationPath: z.string().describe("Destination path"),
	}, async ({ sourcePath, destinationPath }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/explorer/copy", "POST", { sourcePath, destinationPath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_explorer_get_workspace", "Get workspace folder information", {}, async () => {
		const result = await harnessRequest<{ folders: Array<{ name: string; path: string; index: number }>; name: string | null }>("/ui/explorer/workspace");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
