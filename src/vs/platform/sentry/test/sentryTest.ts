/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  SENTRY TEST FILE - DISABLED: Remove after verifying Sentry integration
 *--------------------------------------------------------------------------------------------*/

// TARX: Sentry temporarily disabled
// import * as Sentry from '@sentry/electron/main';

/**
 * Test functions to verify Sentry error reporting (DISABLED)
 */

export function testMainProcessError(): void {
	console.log('[Sentry Test] Sentry is disabled - no-op');
}

export function testRendererError(): void {
	console.log('[Sentry Test] Sentry is disabled - no-op');
}

export function testCaptureMessage(): void {
	console.log('[Sentry Test] Sentry is disabled - no-op');
}

// Expose globally for easy console testing
if (typeof globalThis !== 'undefined') {
	(globalThis as any).tarxSentryTest = {
		testMainProcessError,
		testRendererError,
		testCaptureMessage,
	};
}
