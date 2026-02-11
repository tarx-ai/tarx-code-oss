/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Sentry Main Process Service — @sentry/node
 *  Uses @sentry/node instead of @sentry/electron/main to avoid black screen crash.
 *--------------------------------------------------------------------------------------------*/

import * as Sentry from '@sentry/node';
import { ISentryService, TARX_SENTRY_DSN } from '../common/sentry.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';

export class SentryMainService implements ISentryService {

	declare readonly _serviceBrand: undefined;

	private _enabled = false;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) { }

	init(): void {
		try {
			const release = `tarx-code@${this.productService.version || '1.0.0'}`;
			const environment = this.environmentMainService.isBuilt ? 'production' : 'development';

			Sentry.init({
				dsn: TARX_SENTRY_DSN,
				environment,
				release,
				tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
				beforeSend(event) {
					// Tag for filtering in dashboard
					event.tags = { ...event.tags, app_type: 'tarx-code-oss', process_type: 'main' };
					// PII scrub
					if (event.user) {
						delete event.user.ip_address;
						delete event.user.email;
					}
					return event;
				},
				ignoreErrors: [
					'EPIPE',
					'Channel closed',
					'Canceled',
				],
			});

			this._enabled = true;
			this.logService.info(`[Sentry] Main process initialized (${environment}, ${release})`);
		} catch (err) {
			this.logService.warn('[Sentry] Failed to initialize main process tracking', err);
		}
	}

	captureException(error: Error, context?: Record<string, unknown>): string | undefined {
		if (!this._enabled) { return undefined; }
		try {
			return Sentry.captureException(error, context ? { extra: context } : undefined);
		} catch {
			return undefined;
		}
	}

	captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): string | undefined {
		if (!this._enabled) { return undefined; }
		try {
			return Sentry.captureMessage(message, level);
		} catch {
			return undefined;
		}
	}

	addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
		if (!this._enabled) { return; }
		try {
			Sentry.addBreadcrumb({ message, category, data, level: 'info' });
		} catch {
			// safe to ignore
		}
	}

	setUser(userId: string | null): void {
		if (!this._enabled) { return; }
		try {
			Sentry.setUser(userId ? { id: userId } : null);
		} catch {
			// safe to ignore
		}
	}

	isEnabled(): boolean {
		return this._enabled;
	}
}
