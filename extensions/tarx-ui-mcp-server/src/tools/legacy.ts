/**
 * Legacy tools - 4 core tools from the initial tarx-ui-mcp-server
 * (5 superseded tools removed in audit Mar 2026: send_chat, read_chat, start_voice, create_conversation, screenshot)
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const LLAMA_URL = process.env.TARX_INFERENCE_URL || "http://localhost:11435";

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

	server.tool("tarx_ui_capture_error", "Read any error state currently displayed in the TARX UI", {}, async () => {
		const llamaStatus = await checkLlamaServer();
		const result = await harnessRequest<{ hasError: boolean; errorType: string; errorMessage: string | null; errorLocation: string; timestamp: string }>("/error");
		const inferenceError = !llamaStatus.online ? { hasError: true, errorType: "connection", errorMessage: llamaStatus.error || "Inference server offline", errorLocation: "inference", timestamp: new Date().toISOString() } : null;
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ harnessConnected: false, inferenceStatus: { online: llamaStatus.online, error: llamaStatus.error }, detectedError: inferenceError, suggestion: "UI harness not running." }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ harnessConnected: true, uiError: result.data, inferenceStatus: { online: llamaStatus.online, error: llamaStatus.error } }, null, 2) }] };
	});

	server.tool("tarx_ui_select_project", "Select a project in the TARX sidebar", {
		projectName: z.string().describe("Project name or ID to select"),
	}, async ({ projectName }) => {
		const result = await harnessRequest<{ success: boolean; projectName: string; conversationCount: number }>("/project/select", "POST", { projectName });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_server_status", "Get MCP server status and configuration", {}, async () => {
		const llamaStatus = await checkLlamaServer();
		return { content: [{ type: "text", text: JSON.stringify({ server: "tarx-ui-mcp", version: "2.0.0", config: { harnessUrl: process.env.TARX_UI_HARNESS_URL || "http://localhost:11439", llamaUrl: LLAMA_URL }, inference: { online: llamaStatus.online, latencyMs: llamaStatus.latencyMs, error: llamaStatus.error }, toolCount: 172, note: "Use tarx_ui_chat_send_enhanced for chat testing, tarx_ui_screenshot_full for captures" }, null, 2) }] };
	});
};
