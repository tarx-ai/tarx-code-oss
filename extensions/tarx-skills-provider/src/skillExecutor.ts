/**
 * TARX Skill Executor
 *
 * Takes a resolved skill + user message, validates route preference,
 * calls the appropriate MCP tools, and formats the response.
 */

import type { ResolvedSkill, SkillRoute } from './types.js';

/** MCP server health status */
export interface ServerHealth {
	inference: boolean;   // port 11435
	embeddings: boolean;  // port 11437
	mesh: boolean;        // port 11436
}

/** Skill execution result */
export interface SkillExecutionResult {
	skillName: string;
	route: SkillRoute;
	response: string;
	toolsCalled: string[];
	latencyMs: number;
	error?: string;
}

/**
 * Check health of local inference/embedding servers.
 */
export async function checkServerHealth(): Promise<ServerHealth> {
	const check = async (port: number): Promise<boolean> => {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 2000);
			const res = await fetch(`http://localhost:${port}/health`, {
				signal: controller.signal,
			});
			clearTimeout(timeout);
			return res.ok;
		} catch {
			return false;
		}
	};

	const [inference, embeddings, mesh] = await Promise.all([
		check(11435),
		check(11437),
		check(11436),
	]);

	return { inference, embeddings, mesh };
}

/**
 * Validate that the required route is available.
 */
export function validateRoute(route: SkillRoute, health: ServerHealth): {
	valid: boolean;
	actualRoute: SkillRoute;
	reason?: string;
} {
	switch (route) {
		case 'local':
			if (health.inference) return { valid: true, actualRoute: 'local' };
			return { valid: false, actualRoute: 'local', reason: 'Local inference server (port 11435) is offline' };

		case 'mesh':
			if (health.mesh) return { valid: true, actualRoute: 'mesh' };
			if (health.inference) return { valid: true, actualRoute: 'local', reason: 'Mesh unavailable, falling back to local' };
			return { valid: false, actualRoute: 'mesh', reason: 'Mesh network (port 11436) is offline' };

		case 'cloud':
			return { valid: true, actualRoute: 'cloud' };

		case 'auto':
			if (health.inference) return { valid: true, actualRoute: 'local' };
			if (health.mesh) return { valid: true, actualRoute: 'mesh' };
			return { valid: true, actualRoute: 'cloud' };

		default:
			return { valid: true, actualRoute: 'local' };
	}
}

/**
 * Check which MCP tools from a skill are actually available.
 * In V1, this checks against a known tool list.
 * In V2, this will query running MCP servers dynamically.
 */
export function validateToolAvailability(
	requiredTools: string[],
	availableTools: Set<string>,
): { available: string[]; missing: string[] } {
	const available: string[] = [];
	const missing: string[] = [];

	for (const tool of requiredTools) {
		if (availableTools.has(tool)) {
			available.push(tool);
		} else {
			missing.push(tool);
		}
	}

	return { available, missing };
}

/** All known MCP tools across tarx-core, tarx-ops, tarx-ui */
export const ALL_KNOWN_TOOLS = new Set([
	// tarx-core (35 tools)
	'tarx_health', 'tarx_chat', 'tarx_stress_test', 'tarx_reason_stream',
	'tarx_prewarm', 'tarx_cancel', 'tarx_list_active',
	'tarx_list_spaces', 'tarx_create_space', 'tarx_get_space',
	'tarx_list_sessions', 'tarx_create_session', 'tarx_get_chat_history', 'tarx_send_message',
	'memory_store', 'memory_search', 'memory_recall', 'memory_list', 'memory_forget', 'memory_stats',
	'memory_create_session', 'memory_thread_to_session', 'memory_get_session', 'memory_list_sessions',
	'thread_message',
	'tarx_list_files', 'tarx_upload_file', 'tarx_get_file', 'tarx_search_knowledge', 'tarx_knowledge_stats',
	'tarx_sidebar_refresh', 'tarx_sidebar_navigate', 'tarx_sidebar_get_state',
	'tarx_system_brief', 'tarx_project_context',

	// tarx-ops (47 tools)
	'tarx_admin_sentry_projects', 'tarx_admin_sentry_events', 'tarx_admin_sentry_issues',
	'tarx_admin_sentry_event_details', 'tarx_admin_sentry_issue_events', 'tarx_admin_sentry_trace',
	'tarx_admin_sentry_search',
	'tarx_admin_list_code_sessions', 'tarx_admin_start_code_session', 'tarx_admin_stop_code_session',
	'tarx_admin_send_to_session', 'tarx_admin_get_session_output', 'tarx_admin_clear_code_sessions',
	'tarx_admin_read_console', 'tarx_admin_tail_console',
	'tarx_admin_file_lock', 'tarx_admin_file_unlock', 'tarx_admin_file_conflicts',
	'tarx_admin_status', 'tarx_admin_performance_metrics',
	'tarx_daemon_start', 'tarx_daemon_stop', 'tarx_daemon_status',
	'tarx_orchestrate_register_session', 'tarx_orchestrate_list_sessions',
	'tarx_orchestrate_session_state', 'tarx_orchestrate_session_activity',
	'tarx_orchestrate_task_list', 'tarx_orchestrate_task_update',
	'tarx_orchestrate_assign_task', 'tarx_orchestrate_status_report',
	'tarx_orchestrate_create_doc', 'tarx_orchestrate_list_docs',
	'tarx_orchestrate_read_file', 'tarx_orchestrate_update_file', 'tarx_orchestrate_doc_history',
	'tarx_orchestrate_milestone_create', 'tarx_orchestrate_milestone_list', 'tarx_orchestrate_milestone_update',
	'tarx_orchestrate_push_context', 'tarx_orchestrate_broadcast',
	'tarx_orchestrate_request_feedback', 'tarx_orchestrate_list_feedback_requests',
	'tarx_orchestrate_mark_delivered', 'tarx_orchestrate_report_activity', 'tarx_orchestrate_get_updates',
	'tarx_orchestrate_session_pause',

	// tarx-ui (9 tools)
	'tarx_ui_get_status', 'tarx_ui_send_chat', 'tarx_ui_read_chat',
	'tarx_ui_capture_error', 'tarx_ui_start_voice', 'tarx_ui_create_conversation',
	'tarx_ui_select_project', 'tarx_ui_screenshot', 'tarx_ui_server_status',
]);

/**
 * Execute a skill against a user message.
 *
 * In V1, this prepares the execution context and returns instructions
 * for the chat handler to execute. Actual MCP tool calls happen
 * through the chat system, not directly here.
 */
export async function executeSkill(
	skill: ResolvedSkill,
	userMessage: string,
): Promise<SkillExecutionResult> {
	const start = Date.now();

	// Validate tools
	const { available, missing } = validateToolAvailability(
		skill.frontmatter.tools,
		ALL_KNOWN_TOOLS,
	);

	if (missing.length > 0) {
		return {
			skillName: skill.frontmatter.name,
			route: skill.frontmatter.route,
			response: '',
			toolsCalled: [],
			latencyMs: Date.now() - start,
			error: `Missing MCP tools: ${missing.join(', ')}`,
		};
	}

	// Check route health
	const health = await checkServerHealth();
	const routeCheck = validateRoute(skill.frontmatter.route, health);

	if (!routeCheck.valid) {
		return {
			skillName: skill.frontmatter.name,
			route: skill.frontmatter.route,
			response: '',
			toolsCalled: [],
			latencyMs: Date.now() - start,
			error: routeCheck.reason,
		};
	}

	// Build execution context for the chat handler
	const context = [
		`[TARX Skill: ${skill.frontmatter.name}]`,
		`[Route: ${routeCheck.actualRoute}${routeCheck.reason ? ` (${routeCheck.reason})` : ''}]`,
		`[Tools: ${available.join(', ')}]`,
		`[Tier: ${skill.frontmatter.tier}]`,
		'',
		skill.instructions,
		'',
		`User message: ${userMessage}`,
	].join('\n');

	return {
		skillName: skill.frontmatter.name,
		route: routeCheck.actualRoute,
		response: context,
		toolsCalled: available,
		latencyMs: Date.now() - start,
	};
}
