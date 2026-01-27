/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IExtendedTelemetryItem, ITelemetryItem, ITelemetryUnloadState } from '@microsoft/1ds-core-js';
import type { IXHROverride } from '@microsoft/1ds-post-js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { mixin } from '../../../base/common/objects.js';
import { ITelemetryAppender, validateTelemetryData } from './telemetryUtils.js';

// Interface type which is a subset of @microsoft/1ds-core-js AppInsightsCore.
// Allows us to more easily build mock objects for testing as the interface is quite large and we only need a few properties.
export interface IAppInsightsCore {
	pluginVersionString: string;
	track(item: ITelemetryItem | IExtendedTelemetryItem): void;
	unload(isAsync: boolean, unloadComplete: (unloadState: ITelemetryUnloadState) => void): void;
}

// TARX: Telemetry disabled - local-first, no data leaves machine
const endpointUrl = '';
const endpointHealthUrl = '';

async function getClient(_instrumentationKey: string, _addInternalFlag?: boolean, _xhrOverride?: IXHROverride): Promise<IAppInsightsCore> {
	// TARX: Return a no-op client - telemetry disabled
	return {
		pluginVersionString: 'TARX-disabled',
		track: () => { /* no-op */ },
		unload: (_isAsync: boolean, unloadComplete: (unloadState: ITelemetryUnloadState) => void) => {
			unloadComplete({ reason: 0, isAsync: false });
		}
	};
}

// TODO @lramos15 maybe make more in line with src/vs/platform/telemetry/browser/appInsightsAppender.ts with caching support
export abstract class AbstractOneDataSystemAppender implements ITelemetryAppender {

	protected _aiCoreOrKey: IAppInsightsCore | string | undefined;
	private _asyncAiCore: Promise<IAppInsightsCore> | null;
	protected readonly endPointUrl = endpointUrl;
	protected readonly endPointHealthUrl = endpointHealthUrl;

	constructor(
		private readonly _isInternalTelemetry: boolean,
		private _eventPrefix: string,
		private _defaultData: { [key: string]: unknown } | null,
		iKeyOrClientFactory: string | (() => IAppInsightsCore), // allow factory function for testing
		private _xhrOverride?: IXHROverride
	) {
		if (!this._defaultData) {
			this._defaultData = {};
		}

		if (typeof iKeyOrClientFactory === 'function') {
			this._aiCoreOrKey = iKeyOrClientFactory();
		} else {
			this._aiCoreOrKey = iKeyOrClientFactory;
		}
		this._asyncAiCore = null;
	}

	private _withAIClient(callback: (aiCore: IAppInsightsCore) => void): void {
		if (!this._aiCoreOrKey) {
			return;
		}

		if (typeof this._aiCoreOrKey !== 'string') {
			callback(this._aiCoreOrKey);
			return;
		}

		if (!this._asyncAiCore) {
			this._asyncAiCore = getClient(this._aiCoreOrKey, this._isInternalTelemetry, this._xhrOverride);
		}

		this._asyncAiCore.then(
			(aiClient) => {
				callback(aiClient);
			},
			(err) => {
				onUnexpectedError(err);
				console.error(err);
			}
		);
	}

	log(eventName: string, data?: unknown): void {
		if (!this._aiCoreOrKey) {
			return;
		}
		data = mixin(data, this._defaultData);
		const validatedData = validateTelemetryData(data);
		const name = this._eventPrefix + '/' + eventName;

		try {
			this._withAIClient((aiClient) => {
				aiClient.pluginVersionString = validatedData?.properties.version ?? 'Unknown';
				aiClient.track({
					name,
					baseData: { name, properties: validatedData?.properties, measurements: validatedData?.measurements }
				});
			});
		} catch { }
	}

	flush(): Promise<void> {
		if (this._aiCoreOrKey) {
			return new Promise(resolve => {
				this._withAIClient((aiClient) => {
					aiClient.unload(true, () => {
						this._aiCoreOrKey = undefined;
						resolve(undefined);
					});
				});
			});
		}
		return Promise.resolve(undefined);
	}
}
