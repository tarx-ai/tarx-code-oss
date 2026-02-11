/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Sentry AI Agent Monitoring — Manual Instrumentation
 *  Uses globalThis.Sentry (set by main process or ext host) for span creation.
 *  All calls are safe (try/catch) — if Sentry is not available, functions pass through.
 *--------------------------------------------------------------------------------------------*/

// Use globalThis.Sentry if available (set by @sentry/node in main/ext host)
// Avoids bare specifier import which fails in renderer ESM context
const Sentry: any = (globalThis as any).Sentry || {};

type SentrySpan = { setAttribute: (key: string, value: unknown) => void; setStatus: (status: { code: number; message: string }) => void };

const stubSpan: SentrySpan = {
	setAttribute: () => { },
	setStatus: () => { },
};

/**
 * AI Request span attributes
 */
export interface AIRequestAttributes {
	model: string;
	inputTokens?: number;
	outputTokens?: number;
	cachedTokens?: number;
	promptTemplate?: string;
}

/**
 * AI Agent span attributes
 */
export interface AIAgentAttributes {
	agentName: string;
	model: string;
	tools?: string[];
}

/**
 * AI Tool execution attributes
 */
export interface AIToolAttributes {
	toolName: string;
	input?: unknown;
	output?: unknown;
}

/**
 * Wrap an AI/LLM request with Sentry tracing
 */
export async function traceAIRequest<T>(
	attrs: AIRequestAttributes,
	fn: (span: SentrySpan) => Promise<T>
): Promise<T> {
	try {
		if (typeof Sentry.startSpan !== 'function') { return fn(stubSpan); }
		return await Sentry.startSpan(
			{
				name: `ai.request.${attrs.model}`,
				op: 'gen_ai.request',
				attributes: {
					'gen_ai.request.model': attrs.model,
					'gen_ai.usage.input_tokens': attrs.inputTokens,
					'gen_ai.usage.output_tokens': attrs.outputTokens,
					'gen_ai.usage.cached_tokens': attrs.cachedTokens,
					'gen_ai.prompt.template': attrs.promptTemplate,
				},
			},
			(span: unknown) => fn(span as SentrySpan)
		);
	} catch {
		return fn(stubSpan);
	}
}

/**
 * Wrap an AI agent invocation with Sentry tracing
 */
export async function traceAIAgent<T>(
	attrs: AIAgentAttributes,
	fn: (span: SentrySpan) => Promise<T>
): Promise<T> {
	try {
		if (typeof Sentry.startSpan !== 'function') { return fn(stubSpan); }
		return await Sentry.startSpan(
			{
				name: `ai.agent.${attrs.agentName}`,
				op: 'gen_ai.invoke_agent',
				attributes: {
					'gen_ai.agent.name': attrs.agentName,
					'gen_ai.request.model': attrs.model,
					'gen_ai.agent.tools': attrs.tools?.join(','),
				},
			},
			(span: unknown) => fn(span as SentrySpan)
		);
	} catch {
		return fn(stubSpan);
	}
}

/**
 * Wrap a tool execution with Sentry tracing
 */
export async function traceAITool<T>(
	attrs: AIToolAttributes,
	fn: () => Promise<T>
): Promise<T> {
	try {
		if (typeof Sentry.startSpan !== 'function') { return fn(); }
		return await Sentry.startSpan(
			{
				name: `ai.tool.${attrs.toolName}`,
				op: 'gen_ai.execute_tool',
				attributes: {
					'gen_ai.tool.name': attrs.toolName,
				},
			},
			() => fn()
		);
	} catch {
		return fn();
	}
}

/**
 * Record a handoff between agents
 */
export function traceAIHandoff(fromAgent: string, toAgent: string): void {
	try {
		Sentry.addBreadcrumb?.({
			category: 'ai.handoff',
			message: `Agent handoff: ${fromAgent} → ${toAgent}`,
			level: 'info',
			data: { fromAgent, toAgent },
		});
	} catch {
		// safe to ignore
	}
}

/**
 * Add AI-specific breadcrumb
 */
export function addAIBreadcrumb(
	message: string,
	data?: Record<string, unknown>
): void {
	try {
		Sentry.addBreadcrumb?.({
			category: 'ai',
			message,
			level: 'info',
			data,
		});
	} catch {
		// safe to ignore
	}
}

/**
 * Set user context for AI monitoring
 */
export function setAIUser(userId: string, traits?: Record<string, unknown>): void {
	try {
		Sentry.setUser?.({ id: userId, ...traits });
	} catch {
		// safe to ignore
	}
}
