/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// TARX: Sentry temporarily disabled - causes black screen crash (see main.ts)
// import * as Sentry from '@sentry/electron/main';
import { ISentryService } from '../common/sentry.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';

export class SentryMainService implements ISentryService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProductService _productService: IProductService,
		@IEnvironmentMainService _environmentMainService: IEnvironmentMainService
	) { }

	init(): void {
		// TARX: Sentry disabled - no-op
		this.logService.info('[Sentry] Disabled - causes black screen crash');
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
