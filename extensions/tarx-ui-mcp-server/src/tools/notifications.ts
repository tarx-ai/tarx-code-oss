/**
 * Notification & Dialog tools - Show messages, progress, and interactive dialogs
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_notification_show_info", "Show an information notification", {
		message: z.string().describe("Message to show"),
		actions: z.array(z.string()).optional().describe("Button labels"),
	}, async ({ message, actions }) => {
		const result = await harnessRequest<{ success: boolean; selectedAction: string | null }>("/ui/notification/info", "POST", { message, actions });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_notification_show_warning", "Show a warning notification", {
		message: z.string().describe("Warning message"),
		actions: z.array(z.string()).optional().describe("Button labels"),
	}, async ({ message, actions }) => {
		const result = await harnessRequest<{ success: boolean; selectedAction: string | null }>("/ui/notification/warning", "POST", { message, actions });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_notification_show_error", "Show an error notification", {
		message: z.string().describe("Error message"),
		actions: z.array(z.string()).optional().describe("Button labels"),
	}, async ({ message, actions }) => {
		const result = await harnessRequest<{ success: boolean; selectedAction: string | null }>("/ui/notification/error", "POST", { message, actions });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_notification_show_progress", "Show a progress notification", {
		title: z.string().describe("Progress title"),
		increment: z.number().optional().describe("Progress increment (0-100)"),
		cancellable: z.boolean().optional().describe("Whether the operation can be cancelled"),
	}, async ({ title, increment, cancellable }) => {
		const result = await harnessRequest<{ success: boolean; progressId: string }>("/ui/notification/progress", "POST", { title, increment, cancellable });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_notification_dismiss_all", "Dismiss all visible notifications", {}, async () => {
		const result = await harnessRequest<{ success: boolean; dismissed: number }>("/ui/notification/dismiss-all", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_notification_get_visible", "Get currently visible notifications", {}, async () => {
		const result = await harnessRequest<{ notifications: Array<{ message: string; severity: string; source: string }> }>("/ui/notification/visible");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_dialog_input", "Show an input dialog and get user response", {
		prompt: z.string().describe("Input prompt"),
		placeholder: z.string().optional().describe("Placeholder text"),
		value: z.string().optional().describe("Default value"),
		password: z.boolean().optional().describe("Mask input as password"),
	}, async ({ prompt, placeholder, value, password }) => {
		const result = await harnessRequest<{ success: boolean; value: string | null; cancelled: boolean }>("/ui/dialog/input", "POST", { prompt, placeholder, value, password });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_dialog_quickpick", "Show a quick pick selection dialog", {
		items: z.array(z.string()).describe("Items to pick from"),
		placeholder: z.string().optional().describe("Placeholder text"),
		canPickMany: z.boolean().optional().describe("Allow multiple selections"),
	}, async ({ items, placeholder, canPickMany }) => {
		const result = await harnessRequest<{ success: boolean; selected: string[] | string | null; cancelled: boolean }>("/ui/dialog/quickpick", "POST", { items, placeholder, canPickMany });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_dialog_message", "Show a modal message dialog with actions", {
		message: z.string().describe("Message to display"),
		detail: z.string().optional().describe("Detail text"),
		modal: z.boolean().optional().describe("Show as modal dialog (default: true)"),
		actions: z.array(z.string()).optional().describe("Button labels"),
	}, async ({ message, detail, modal, actions }) => {
		const result = await harnessRequest<{ success: boolean; selectedAction: string | null }>("/ui/dialog/message", "POST", { message, detail, modal, actions });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_status_message", "Show a message in the status bar", {
		text: z.string().describe("Status bar message"),
		durationMs: z.number().optional().describe("How long to show (default: 5000ms)"),
	}, async ({ text, durationMs }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/status/message", "POST", { text, durationMs });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
