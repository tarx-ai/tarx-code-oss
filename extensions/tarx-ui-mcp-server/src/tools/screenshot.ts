/**
 * Screenshot & OCR tools - Capture, compare, and read screenshots
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_screenshot_full", "Take a full screenshot of the TARX app window", {
		format: z.enum(["png", "jpg"]).optional().describe("Image format (default: png)"),
	}, async ({ format }) => {
		const result = await harnessRequest<{ success: boolean; path: string; width: number; height: number; sizeKB: number }>("/ui/screenshot/full", "POST", { format });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot_region", "Take a screenshot of a specific region", {
		region: z.enum(["sidebar", "editor", "panel", "statusbar", "titlebar", "chat"]).describe("UI region to capture"),
	}, async ({ region }) => {
		const result = await harnessRequest<{ success: boolean; path: string; width: number; height: number; sizeKB: number }>("/ui/screenshot/region", "POST", { region });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot_compare", "Compare two screenshots for visual differences", {
		baselinePath: z.string().describe("Path to baseline screenshot"),
		currentPath: z.string().describe("Path to current screenshot"),
		threshold: z.number().optional().describe("Max acceptable difference percentage (default: 5)"),
	}, async ({ baselinePath, currentPath, threshold }) => {
		const result = await harnessRequest<{ success: boolean; match: boolean; diffPercent: number; diffPath: string | null }>("/ui/screenshot/compare", "POST", { baselinePath, currentPath, threshold });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot_ocr", "Extract text from a screenshot using OCR", {
		imagePath: z.string().describe("Path to the screenshot image"),
	}, async ({ imagePath }) => {
		const result = await harnessRequest<{ success: boolean; text: string; regions: Array<{ text: string; confidence: number; x: number; y: number; width: number; height: number }> }>("/ui/screenshot/ocr", "POST", { imagePath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot_ocr_region", "Extract text from a specific region of the screen", {
		region: z.enum(["sidebar", "editor", "panel", "statusbar", "titlebar", "chat"]).describe("UI region to OCR"),
	}, async ({ region }) => {
		const result = await harnessRequest<{ success: boolean; text: string; regions: Array<{ text: string; confidence: number; x: number; y: number; width: number; height: number }> }>("/ui/screenshot/ocr-region", "POST", { region });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot_find_text", "Find text on screen and return its coordinates", {
		text: z.string().describe("Text to search for"),
		caseSensitive: z.boolean().optional().describe("Case sensitive search (default: false)"),
	}, async ({ text, caseSensitive }) => {
		const result = await harnessRequest<{ success: boolean; found: boolean; matches: Array<{ text: string; x: number; y: number; width: number; height: number; confidence: number }> }>("/ui/screenshot/find-text", "POST", { text, caseSensitive });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot_verify_element", "Verify a UI element exists on screen by checking for expected text", {
		expectedText: z.array(z.string()).describe("Text strings that should be visible"),
		region: z.enum(["sidebar", "editor", "panel", "statusbar", "titlebar", "chat", "full"]).optional().describe("Region to check (default: full)"),
	}, async ({ expectedText, region }) => {
		const result = await harnessRequest<{ success: boolean; allFound: boolean; results: Array<{ text: string; found: boolean; confidence: number }> }>("/ui/screenshot/verify-element", "POST", { expectedText, region });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_screenshot_list", "List all captured screenshots", {
		limit: z.number().optional().describe("Max screenshots to return (default: 20)"),
	}, async ({ limit }) => {
		const result = await harnessRequest<{ screenshots: Array<{ path: string; timestamp: number; sizeKB: number }>; count: number }>(`/ui/screenshot/list?limit=${limit || 20}`);
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
