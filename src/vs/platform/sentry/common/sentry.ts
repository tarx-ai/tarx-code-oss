/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ISentryService = createDecorator<ISentryService>('sentryService');

export interface ISentryService {
	readonly _serviceBrand: undefined;

	/**
	 * Initialize Sentry error tracking
	 */
	init(): void;

	/**
	 * Capture an exception
	 */
	captureException(error: Error, context?: Record<string, unknown>): string | undefined;

	/**
	 * Capture a message
	 */
	captureMessage(message: string, level?: 'info' | 'warning' | 'error'): string | undefined;

	/**
	 * Add breadcrumb for debugging
	 */
	addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void;

	/**
	 * Set user context
	 */
	setUser(userId: string | null): void;

	/**
	 * Check if Sentry is enabled
	 */
	isEnabled(): boolean;
}

/**
 * Sentry configuration
 */
export interface ISentryConfig {
	dsn: string;
	environment: string;
	release: string;
	tracesSampleRate: number;
}

/**
 * Default Sentry DSN for Workbench (workbench project)
 * Project: workbench (Electron)
 * Project ID: 4510756453679104
 * Org: tarx-fo
 */
export const TARX_SENTRY_DSN = 'https://e26a15caf7e811f08e2b9eddb9ce5e9a@o4510712283791360.ingest.us.sentry.io/4510756453679104';
