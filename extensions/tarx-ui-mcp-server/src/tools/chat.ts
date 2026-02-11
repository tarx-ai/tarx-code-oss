/**
 * Chat tools - Enhanced chat control (open, send, read, clear, participants)
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_chat_open", "Open the VS Code chat panel", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/chat/open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_close", "Close the VS Code chat panel", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/chat/close", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_new", "Start a new chat conversation", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/chat/new", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_send_enhanced", "Send a message with participant targeting and context", {
		message: z.string().describe("Message to send"),
		participant: z.string().optional().describe("Chat participant to target (e.g., '@tarx', '@workspace')"),
		attachFiles: z.array(z.string()).optional().describe("File paths to attach as context"),
	}, async ({ message, participant, attachFiles }) => {
		const result = await harnessRequest<{ success: boolean; response: string | null; latencyMs: number }>("/ui/chat/send-enhanced", "POST", { message, participant, attachFiles });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_read_enhanced", "Read chat messages with metadata", {
		count: z.number().optional().describe("Number of messages (default: 10)"),
		includeMetadata: z.boolean().optional().describe("Include message metadata"),
	}, async ({ count, includeMetadata }) => {
		const result = await harnessRequest<{ messages: unknown[]; totalCount: number }>(`/ui/chat/read-enhanced?count=${count || 10}&metadata=${includeMetadata || false}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_clear", "Clear the chat history", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/chat/clear", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_get_state", "Get current chat panel state", {}, async () => {
		const result = await harnessRequest<{ isOpen: boolean; messageCount: number; activeParticipant: string | null; isStreaming: boolean }>("/ui/chat/state");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_select_participant", "Select a chat participant", {
		participant: z.string().describe("Participant ID (e.g., 'tarx', 'workspace', 'copilot')"),
	}, async ({ participant }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/chat/select-participant", "POST", { participant });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_get_participants", "List available chat participants", {}, async () => {
		const result = await harnessRequest<{ participants: Array<{ id: string; name: string; description: string }> }>("/ui/chat/participants");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_attach_file", "Attach a file to the current chat context", {
		filePath: z.string().describe("File path to attach"),
	}, async ({ filePath }) => {
		const result = await harnessRequest<{ success: boolean; attached: string }>("/ui/chat/attach-file", "POST", { filePath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_attach_selection", "Attach the current editor selection to chat", {}, async () => {
		const result = await harnessRequest<{ success: boolean; selectedText: string }>("/ui/chat/attach-selection", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_chat_inline_start", "Start an inline chat at the current cursor position", {
		message: z.string().optional().describe("Initial message for inline chat"),
	}, async ({ message }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/chat/inline-start", "POST", { message });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
