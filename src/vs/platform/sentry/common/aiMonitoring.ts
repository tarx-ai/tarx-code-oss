/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Sentry AI Agent Monitoring - Manual Instrumentation
 *  TARX: Temporarily disabled - module resolution issue in browser context
 *--------------------------------------------------------------------------------------------*/

// TARX: Sentry temporarily disabled
// import * as Sentry from '@sentry/electron/renderer';

// Stub type for disabled Sentry span
type SentrySpan = { setAttribute: (key: string, value: unknown) => void; setStatus: (status: { code: number; message: string }) => void };

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

// Stub span for disabled Sentry
const stubSpan: SentrySpan = {
	setAttribute: () => { },
	setStatus: () => { },
};

/**
 * Wrap an AI/LLM request with Sentry tracing (DISABLED)
 */
export async function traceAIRequest<T>(
	_attrs: AIRequestAttributes,
	fn: (span: SentrySpan) => Promise<T>
): Promise<T> {
	return fn(stubSpan);
}

/**
 * Wrap an AI agent invocation with Sentry tracing (DISABLED)
 */
export async function traceAIAgent<T>(
	_attrs: AIAgentAttributes,
	fn: (span: SentrySpan) => Promise<T>
): Promise<T> {
	return fn(stubSpan);
}

/**
 * Wrap a tool execution with Sentry tracing (DISABLED)
 */
export async function traceAITool<T>(
	_attrs: AIToolAttributes,
	fn: () => Promise<T>
): Promise<T> {
	return fn();
}

/**
 * Record a handoff between agents (DISABLED)
 */
export function traceAIHandoff(_fromAgent: string, _toAgent: string): void {
	// no-op
}

/**
 * Add AI-specific breadcrumb (DISABLED)
 */
export function addAIBreadcrumb(
	_message: string,
	_data?: Record<string, unknown>
): void {
	// no-op
}

/**
 * Set user context for AI monitoring (DISABLED)
 */
export function setAIUser(_userId: string, _traits?: Record<string, unknown>): void {
	// no-op
}
