/**
 * Editor tools - Open, edit, navigate, and inspect text editors
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_editor_open_file", "Open a file in the editor", {
		filePath: z.string().describe("Absolute or workspace-relative path to open"),
		viewColumn: z.number().optional().describe("Editor column (1=first, 2=second, etc.)"),
		preview: z.boolean().optional().describe("Open as preview tab (default: true)"),
	}, async ({ filePath, viewColumn, preview }) => {
		const result = await harnessRequest<{ success: boolean; filePath: string; languageId: string; lineCount: number }>("/ui/editor/open", "POST", { filePath, viewColumn, preview });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_close_file", "Close a specific editor tab", {
		filePath: z.string().optional().describe("File path to close (default: active editor)"),
	}, async ({ filePath }) => {
		const result = await harnessRequest<{ success: boolean; closed: string }>("/ui/editor/close", "POST", { filePath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_close_all", "Close all open editor tabs", {}, async () => {
		const result = await harnessRequest<{ success: boolean; closedCount: number }>("/ui/editor/close-all", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_get_active", "Get information about the active editor", {}, async () => {
		const result = await harnessRequest<{ hasActiveEditor: boolean; filePath: string | null; languageId: string | null; lineCount: number; cursorLine: number; cursorColumn: number; selectedText: string | null }>("/ui/editor/active");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_get_tabs", "List all open editor tabs", {}, async () => {
		const result = await harnessRequest<{ tabs: Array<{ filePath: string; isActive: boolean; isDirty: boolean; viewColumn: number; languageId: string }> }>("/ui/editor/tabs");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_select_tab", "Switch to a specific editor tab", {
		filePath: z.string().describe("File path of the tab to select"),
	}, async ({ filePath }) => {
		const result = await harnessRequest<{ success: boolean; selected: string }>("/ui/editor/select-tab", "POST", { filePath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_type_text", "Type text at the current cursor position in the active editor", {
		text: z.string().describe("Text to type"),
	}, async ({ text }) => {
		const result = await harnessRequest<{ success: boolean; insertedLength: number }>("/ui/editor/type", "POST", { text });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_insert_text", "Insert text at a specific line and column", {
		text: z.string().describe("Text to insert"),
		line: z.number().describe("Line number (1-based)"),
		column: z.number().optional().describe("Column number (1-based, default: 1)"),
	}, async ({ text, line, column }) => {
		const result = await harnessRequest<{ success: boolean; line: number; column: number }>("/ui/editor/insert", "POST", { text, line, column });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_replace_text", "Replace text in a range", {
		startLine: z.number().describe("Start line (1-based)"),
		startColumn: z.number().describe("Start column (1-based)"),
		endLine: z.number().describe("End line (1-based)"),
		endColumn: z.number().describe("End column (1-based)"),
		newText: z.string().describe("Replacement text"),
	}, async ({ startLine, startColumn, endLine, endColumn, newText }) => {
		const result = await harnessRequest<{ success: boolean; replacedLength: number }>("/ui/editor/replace", "POST", { startLine, startColumn, endLine, endColumn, newText });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_select_range", "Select a range of text in the active editor", {
		startLine: z.number().describe("Start line (1-based)"),
		startColumn: z.number().describe("Start column (1-based)"),
		endLine: z.number().describe("End line (1-based)"),
		endColumn: z.number().describe("End column (1-based)"),
	}, async ({ startLine, startColumn, endLine, endColumn }) => {
		const result = await harnessRequest<{ success: boolean; selectedText: string }>("/ui/editor/select-range", "POST", { startLine, startColumn, endLine, endColumn });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_get_selection", "Get the currently selected text", {}, async () => {
		const result = await harnessRequest<{ hasSelection: boolean; text: string | null; startLine: number; startColumn: number; endLine: number; endColumn: number }>("/ui/editor/selection");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_go_to_line", "Navigate to a specific line in the active editor", {
		line: z.number().describe("Line number to go to (1-based)"),
		column: z.number().optional().describe("Column number (1-based, default: 1)"),
	}, async ({ line, column }) => {
		const result = await harnessRequest<{ success: boolean; line: number; column: number }>("/ui/editor/goto", "POST", { line, column });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_fold", "Fold (collapse) code at a specific line", {
		line: z.number().optional().describe("Line number to fold at (default: current line)"),
	}, async ({ line }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/editor/fold", "POST", { line });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_unfold", "Unfold (expand) code at a specific line", {
		line: z.number().optional().describe("Line number to unfold at (default: current line)"),
	}, async ({ line }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/editor/unfold", "POST", { line });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_add_decoration", "Add a visual decoration to lines in the editor", {
		startLine: z.number().describe("Start line (1-based)"),
		endLine: z.number().describe("End line (1-based)"),
		color: z.string().optional().describe("Background color (CSS color, default: rgba(255,255,0,0.3))"),
		tag: z.string().optional().describe("Tag for the decoration (for later removal)"),
	}, async ({ startLine, endLine, color, tag }) => {
		const result = await harnessRequest<{ success: boolean; decorationId: string }>("/ui/editor/decorate", "POST", { startLine, endLine, color, tag });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_clear_decorations", "Clear decorations from the active editor", {
		tag: z.string().optional().describe("Only clear decorations with this tag (default: clear all)"),
	}, async ({ tag }) => {
		const result = await harnessRequest<{ success: boolean; cleared: number }>("/ui/editor/clear-decorations", "POST", { tag });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_get_diagnostics", "Get diagnostics (errors, warnings) for the active file", {
		filePath: z.string().optional().describe("File path (default: active editor)"),
		severity: z.enum(["error", "warning", "info", "hint", "all"]).optional().describe("Filter by severity (default: all)"),
	}, async ({ filePath, severity }) => {
		const result = await harnessRequest<{ diagnostics: Array<{ message: string; severity: string; line: number; column: number; source: string }>; count: number }>(`/ui/editor/diagnostics?filePath=${filePath || ""}&severity=${severity || "all"}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_editor_trigger_suggest", "Trigger IntelliSense/autocomplete suggestions", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/editor/trigger-suggest", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
