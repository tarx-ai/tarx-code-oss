/**
 * SCM (Source Control) tools - Git operations through the VS Code SCM interface
 */

import { z } from "zod";
import type { HarnessRequestFn, ToolRegistrar } from "./types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const apply: ToolRegistrar = (server: McpServer, harnessRequest: HarnessRequestFn) => {
	server.tool("tarx_ui_scm_open", "Open the Source Control view", {}, async () => {
		const result = await harnessRequest<{ success: boolean }>("/ui/scm/open", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_scm_get_changes", "Get current git changes (staged, unstaged, untracked)", {}, async () => {
		const result = await harnessRequest<{ staged: string[]; unstaged: string[]; untracked: string[]; totalChanges: number }>("/ui/scm/changes");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_scm_stage_file", "Stage a file for commit", {
		filePath: z.string().describe("File path to stage"),
	}, async ({ filePath }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/scm/stage", "POST", { filePath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_scm_unstage_file", "Unstage a file", {
		filePath: z.string().describe("File path to unstage"),
	}, async ({ filePath }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/scm/unstage", "POST", { filePath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_scm_stage_all", "Stage all changes", {}, async () => {
		const result = await harnessRequest<{ success: boolean; stagedCount: number }>("/ui/scm/stage-all", "POST");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_scm_commit", "Create a git commit", {
		message: z.string().describe("Commit message"),
	}, async ({ message }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/scm/commit", "POST", { message });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_scm_discard", "Discard changes to a file", {
		filePath: z.string().describe("File path to discard changes"),
	}, async ({ filePath }) => {
		const result = await harnessRequest<{ success: boolean }>("/ui/scm/discard", "POST", { filePath });
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});

	server.tool("tarx_ui_scm_get_branch", "Get current git branch info", {}, async () => {
		const result = await harnessRequest<{ branch: string; ahead: number; behind: number; remoteTrackingBranch: string | null }>("/ui/scm/branch");
		if (!result.success) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: result.error }, null, 2) }] };
		return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result.data }, null, 2) }] };
	});
};
