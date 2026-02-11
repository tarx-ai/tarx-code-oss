/**
 * Tool registry - imports all tool modules and registers them with the MCP server
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HarnessRequestFn } from "./types.js";

import { apply as legacyTools } from "./legacy.js";
import { apply as editorTools } from "./editor.js";
import { apply as terminalTools } from "./terminal.js";
import { apply as panelTools } from "./panels.js";
import { apply as notificationTools } from "./notifications.js";
import { apply as tarxSidebarTools } from "./tarx-sidebar.js";
import { apply as chatTools } from "./chat.js";
import { apply as commandTools } from "./commands.js";
import { apply as explorerTools } from "./explorer.js";
import { apply as scmTools } from "./scm.js";
import { apply as debugTools } from "./debug.js";
import { apply as extensionTools } from "./extensions.js";
import { apply as settingsTools } from "./settings.js";
import { apply as screenshotTools } from "./screenshot.js";
import { apply as windowTools } from "./window.js";
import { apply as statusbarTools } from "./statusbar.js";
import { apply as themeTools } from "./theme.js";
import { apply as testRunnerTools } from "./test-runner.js";

const allModules = [
	{ name: "legacy", apply: legacyTools, count: 9 },
	{ name: "editor", apply: editorTools, count: 18 },
	{ name: "terminal", apply: terminalTools, count: 12 },
	{ name: "panels", apply: panelTools, count: 14 },
	{ name: "notifications", apply: notificationTools, count: 10 },
	{ name: "tarx-sidebar", apply: tarxSidebarTools, count: 16 },
	{ name: "chat", apply: chatTools, count: 12 },
	{ name: "commands", apply: commandTools, count: 8 },
	{ name: "explorer", apply: explorerTools, count: 12 },
	{ name: "scm", apply: scmTools, count: 8 },
	{ name: "debug", apply: debugTools, count: 8 },
	{ name: "extensions", apply: extensionTools, count: 6 },
	{ name: "settings", apply: settingsTools, count: 8 },
	{ name: "screenshot", apply: screenshotTools, count: 8 },
	{ name: "window", apply: windowTools, count: 8 },
	{ name: "statusbar", apply: statusbarTools, count: 4 },
	{ name: "theme", apply: themeTools, count: 6 },
	{ name: "test-runner", apply: testRunnerTools, count: 10 },
];

export function registerAllTools(server: McpServer, harnessRequest: HarnessRequestFn): number {
	let totalRegistered = 0;

	for (const mod of allModules) {
		try {
			mod.apply(server, harnessRequest);
			totalRegistered += mod.count;
			console.error(`[tarx-ui] Registered ${mod.count} tools from ${mod.name}`);
		} catch (error) {
			console.error(`[tarx-ui] Failed to register ${mod.name} tools:`, error);
		}
	}

	console.error(`[tarx-ui] Total tools registered: ${totalRegistered}`);
	return totalRegistered;
}

export const TOOL_COUNT = allModules.reduce((sum, m) => sum + m.count, 0);
