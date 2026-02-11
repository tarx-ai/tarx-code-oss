/**
 * Legacy tools - Original 9 tools from the initial tarx-ui-mcp-server
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const LLAMA_URL = process.env.TARX_INFERENCE_URL || "http://localhost:11435";

const TARX_LOCAL_REASONING_PROMPT = `You are TARX, a local AI assistant running on the user's machine. You are a reasoning engine.

RULES:
1. You can THINK, ANALYZE, EXPLAIN, PLAN, and SUGGEST.
2. You CANNOT execute commands, create files, modify databases, send messages, or perform any system actions.
3. If the user asks you to DO something (create, delete, modify, send, build, install, run), explain what should be done step-by-step, then say: "I've outlined the plan. To execute these actions, they need to be routed through the TARX bridge."
4. NEVER say "Done", "Created", "Inserted", "Applied", "Executed" or similar past-tense completion words for actions you did not perform.
5. NEVER generate fake status reports, cycle logs, or step-by-step execution narratives for actions you cannot take.
6. Be direct. Be honest about what you can and cannot do.
7. You are excellent at reasoning, code review, architecture decisions, debugging analysis, and planning. Lean into those strengths.`;

async function checkLlamaServer(): Promise<{ online: boolean; latencyMs: number; error?: string }> {
	const start = Date.now();
	try {
		const response = await fetch(`${LLAMA_URL}/health`, { method: "GET", signal: AbortSignal.timeout(5000) });
		const latencyMs = Date.now() - start;
		if (response.ok) return { online: true, latencyMs };
		const modelsResponse = await fetch(`${LLAMA_URL}/v1/models`, { method: "GET", signal: AbortSignal.timeout(5000) });
		if (modelsResponse.ok) return { online: true, latencyMs: Date.now() - start };
		return { online: false, latencyMs, error: `HTTP ${response.status}` };
	} catch (error) {
		return { online: false, latencyMs: Date.now() - start, error: error instanceof Error ? error.message : "Connection failed" };
	}
}

async function testDirectChat(message: string, timeoutMs: number = 30000): Promise<{ success: boolean; response?: string; latencyMs: number; error?: string }> {
	const start = Date.now();
	try {
		const response = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: [{ role: "system", content: TARX_LOCAL_REASONING_PROMPT }, { role: "user", content: message }], stream: false }),
			signal: AbortSignal.timeout(timeoutMs),
		});
		const latencyMs = Date.now() - start;
		if (!response.ok) { const text = await response.text(); return { success: false, latencyMs, error: `HTTP ${response.status}: ${text}` }; }
		const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
		return { success: true, response: data.choices?.[0]?.message?.content || "", latencyMs };
	} catch (error) {
		return { success: false, latencyMs: Date.now() - start, error: error instanceof Error ? error.message : "Request failed" };
	}
}

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_get_status", "Get TARX app status including inference server connection and any visible errors", {}, async () => {
		const llamaStatus = await checkLlamaServer();
		const harnessResult = await harnessRequest<{ tarxStatus: string; meshStatus: string; currentModel: string; errorBanner: string | null; activeConversation: string | null; activeProject: string | null }>("/status");
		const status = {
			inference: { online: llamaStatus.online, url: LLAMA_URL, latencyMs: llamaStatus.latencyMs, error: llamaStatus.error },
			harness: { connected: harnessResult.success, url: process.env.TARX_UI_HARNESS_URL || "http://localhost:11439" },
			ui: harnessResult.success ? harnessResult.data : { tarxStatus: llamaStatus.online ? "Inference OK" : "Offline", meshStatus: "Unknown", currentModel: "Unknown", errorBanner: llamaStatus.error || null, activeConversation: null, activeProject: null, note: "UI harness not connected - showing inference status only" },
		};
		return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
	});

	server.tool("tarx_ui_send_chat", "Send a message through the TARX chat UI and capture the rendered response", {
		message: z.string().describe("Message to send"),
		waitForResponse: z.boolean().optional().describe("Wait for assistant response (default: true)"),
		timeoutMs: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
		directMode: z.boolean().optional().describe("Bypass UI and test inference directly (default: false)"),
	}, async ({ message, waitForResponse = true, timeoutMs = 30000, directMode = false }) => {
		const start = Date.now();
		if (directMode) {
			const result = await testDirectChat(message, timeoutMs);
			return { content: [{ type: "text", text: JSON.stringify({ mode: "direct", success: result.success, userMessage: message, assistantResponse: result.response || null, errorMessage: result.error || null, latencyMs: result.latencyMs, note: "Direct inference test (bypassed UI)" }, null, 2) }] };
		}
		const result = await harnessRequest<{ userMessageRendered: string; assistantResponse: string; errorMessage: string | null }>("/chat/send", "POST", { message, waitForResponse, timeoutMs });
		const latencyMs = Date.now() - start;
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ mode: "ui", success: false, error: result.error, latencyMs, suggestion: "UI harness not running. Use directMode: true to test inference directly." }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ mode: "ui", success: true, userMessageRendered: result.data?.userMessageRendered, assistantResponse: result.data?.assistantResponse, errorMessage: result.data?.errorMessage, latencyMs }, null, 2) }] };
	});

	server.tool("tarx_ui_read_chat", "Read recent messages from the TARX chat UI", {
		messageCount: z.number().optional().describe("Number of recent messages to read (default: 10)"),
	}, async ({ messageCount = 10 }) => {
		const result = await harnessRequest<{ messages: Array<{ role: string; content: string; timestamp: string }>; conversationTitle: string; projectName: string }>(`/chat/read?count=${messageCount}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error, suggestion: "UI harness not running." }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_capture_error", "Read any error state currently displayed in the TARX UI", {}, async () => {
		const llamaStatus = await checkLlamaServer();
		const result = await harnessRequest<{ hasError: boolean; errorType: string; errorMessage: string | null; errorLocation: string; timestamp: string }>("/error");
		const inferenceError = !llamaStatus.online ? { hasError: true, errorType: "connection", errorMessage: llamaStatus.error || "Inference server offline", errorLocation: "inference", timestamp: new Date().toISOString() } : null;
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ harnessConnected: false, inferenceStatus: { online: llamaStatus.online, error: llamaStatus.error }, detectedError: inferenceError, suggestion: "UI harness not running." }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ harnessConnected: true, uiError: result.data, inferenceStatus: { online: llamaStatus.online, error: llamaStatus.error } }, null, 2) }] };
	});

	server.tool("tarx_ui_start_voice", "Trigger voice input in the TARX UI", {
		durationMs: z.number().optional().describe("How long to listen in milliseconds (default: 5000)"),
	}, async ({ durationMs = 5000 }) => {
		const result = await harnessRequest<{ started: boolean; transcribedText: string | null; assistantResponse: string | null; audioResponsePlayed: boolean; errorMessage: string | null }>("/voice/start", "POST", { durationMs });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error, suggestion: "UI harness not running." }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_create_conversation", "Create a new conversation through the TARX UI", {
		title: z.string().optional().describe("Conversation title"),
		projectId: z.string().optional().describe("Project ID"),
	}, async ({ title, projectId }) => {
		const result = await harnessRequest<{ success: boolean; conversationId: string; visibleInSidebar: boolean }>("/conversation/create", "POST", { title, projectId });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_select_project", "Select a project in the TARX sidebar", {
		projectName: z.string().describe("Project name or ID to select"),
	}, async ({ projectName }) => {
		const result = await harnessRequest<{ success: boolean; projectName: string; conversationCount: number }>("/project/select", "POST", { projectName });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot", "Capture screenshot of the TARX app", {
		region: z.enum(["full", "chat", "sidebar", "input"]).optional().describe("Region to capture (default: full)"),
	}, async ({ region = "full" }) => {
		const result = await harnessRequest<{ screenshotPath: string; width: number; height: number }>("/screenshot", "POST", { region });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error, suggestion: "Screenshot requires the harness." }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_server_status", "Get MCP server status and configuration", {}, async () => {
		const llamaStatus = await checkLlamaServer();
		return { content: [{ type: "text", text: JSON.stringify({ server: "tarx-ui-mcp", version: "2.0.0", config: { harnessUrl: process.env.TARX_UI_HARNESS_URL || "http://localhost:11439", llamaUrl: LLAMA_URL }, inference: { online: llamaStatus.online, latencyMs: llamaStatus.latencyMs, error: llamaStatus.error }, toolCount: 168, note: "Use tarx_ui_send_chat with directMode:true to test inference without UI harness" }, null, 2) }] };
	});
};
