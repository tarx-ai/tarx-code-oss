/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// TARX: Sentry temporarily disabled - module resolution issue in browser context
// import * as Sentry from '@sentry/electron/renderer';
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
		// TARX: Sentry disabled - no-op
		this.logService.info('[Sentry] Disabled - browser module resolution issue');
	}

	captureException(_error: Error, _context?: Record<string, unknown>): string | undefined {
		return undefined;
	}

	captureMessage(_message: string, _level: 'info' | 'warning' | 'error' = 'info'): string | undefined {
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
