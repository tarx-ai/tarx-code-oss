/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Sentry Browser/Renderer Service — Stub
 *  @sentry/browser can't resolve as bare specifier in the renderer ESM context.
 *  Error tracking runs in the main process (@sentry/node) and extension host instead.
 *  This stub satisfies the ISentryService interface without importing @sentry/browser.
 *--------------------------------------------------------------------------------------------*/

import { ISentryService } from '../common/sentry.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';

export class SentryBrowserService implements ISentryService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProductService _productService: IProductService
	) { }

	init(): void {
		this.logService.info('[Sentry] Renderer tracking disabled — bare specifier not supported in ESM context');
	}

	captureException(_error: Error, _context?: Record<string, unknown>): string | undefined {
		return undefined;
	}

	captureMessage(_message: string, _level?: 'info' | 'warning' | 'error'): string | undefined {
		return undefined;
	}

	addBreadcrumb(_message: string, _category: string, _data?: Record<string, unknown>): void {
		// no-op
	}

	setUser(_userId: string | null): void {
		// no-op
	}

	isEnabled(): boolean {
		return false;
	}
}
