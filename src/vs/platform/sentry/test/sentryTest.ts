/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Sentry Test Functions — verify error reporting from DevTools console
 *--------------------------------------------------------------------------------------------*/

// Use globalThis.Sentry if available — avoids bare specifier resolution failure
const Sentry: any = (globalThis as any).Sentry || {};

export function testMainProcessError(): string {
	try {
		if (typeof Sentry.captureException !== 'function') {
			return 'Sentry is not initialized in this context';
		}
		const err = new Error('TARX Sentry Test — main process error');
		const eventId = Sentry.captureException(err);
		return `Captured exception with event ID: ${eventId}`;
	} catch {
		return 'Sentry is not initialized — no event captured';
	}
}

export function testRendererError(): string {
	try {
		if (typeof Sentry.captureException !== 'function') {
			return 'Sentry is not initialized in this context';
		}
		const err = new Error('TARX Sentry Test — renderer error');
		const eventId = Sentry.captureException(err);
		return `Captured exception with event ID: ${eventId}`;
	} catch {
		return 'Sentry is not initialized — no event captured';
	}
}

export function testCaptureMessage(): string {
	try {
		if (typeof Sentry.captureMessage !== 'function') {
			return 'Sentry is not initialized in this context';
		}
		const eventId = Sentry.captureMessage('TARX Sentry Test — manual message', 'info');
		return `Captured message with event ID: ${eventId}`;
	} catch {
		return 'Sentry is not initialized — no event captured';
	}
}

// Expose globally for easy console testing
if (typeof globalThis !== 'undefined') {
	(globalThis as any).tarxSentryTest = {
		testMainProcessError,
		testRendererError,
		testCaptureMessage,
	};
}
