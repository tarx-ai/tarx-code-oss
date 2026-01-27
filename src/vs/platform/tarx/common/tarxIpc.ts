/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import {
	ITarxSidecarService,
	ITarxInferenceStatus,
	ITarxHardwareConfig,
	ITarxSpawnResult,
	ITarxPreflightResult,
	ITarxModelInfo
} from './tarx.js';

/**
 * IPC channel name for TARX sidecar service
 */
export const TARX_SIDECAR_CHANNEL_NAME = 'tarxSidecar';

/**
 * Server-side IPC channel for TARX sidecar service (runs in main process)
 */
export class TarxSidecarChannel implements IServerChannel {

	constructor(private readonly service: ITarxSidecarService) { }

	listen(_context: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDidChangeStatus': return this.service.onDidChangeStatus;
			case 'onDidReceiveLog': return this.service.onDidReceiveLog;
		}
		throw new Error(`Event not found: ${event}`);
	}

	call(_context: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'startInference': return this.service.startInference(arg);
			case 'stopInference': return this.service.stopInference();
			case 'restartInference': return this.service.restartInference(arg);
			case 'getStatus': return Promise.resolve(this.service.getStatus());
			case 'isRunning': return Promise.resolve(this.service.isRunning());
			case 'preflightCheck': return this.service.preflightCheck();
			case 'checkHealth': return this.service.checkHealth();
			case 'listModels': return this.service.listModels();
			case 'getPort': return Promise.resolve(this.service.port);
		}
		throw new Error(`Call not found: ${command}`);
	}
}

/**
 * Client-side IPC channel for TARX sidecar service (runs in renderer/browser process)
 */
export class TarxSidecarChannelClient implements ITarxSidecarService {

	readonly _serviceBrand: undefined;

	get onDidChangeStatus(): Event<ITarxInferenceStatus> {
		return this.channel.listen<ITarxInferenceStatus>('onDidChangeStatus');
	}

	get onDidReceiveLog(): Event<string> {
		return this.channel.listen<string>('onDidReceiveLog');
	}

	private _port: number = 11435;
	get port(): number {
		return this._port;
	}

	constructor(private readonly channel: IChannel) {
		// Fetch port asynchronously
		this.channel.call<number>('getPort').then(port => {
			this._port = port;
		});
	}

	startInference(config?: ITarxHardwareConfig): Promise<ITarxSpawnResult> {
		return this.channel.call('startInference', config);
	}

	stopInference(): Promise<void> {
		return this.channel.call('stopInference');
	}

	restartInference(config?: ITarxHardwareConfig): Promise<ITarxSpawnResult> {
		return this.channel.call('restartInference', config);
	}

	getStatus(): ITarxInferenceStatus {
		// Note: This is synchronous in the interface but we need to return a default
		// For proper async support, call getStatusAsync instead
		return {
			running: false,
			port: this._port,
			modelLoaded: false,
			loadedModels: [],
			healthState: 0, // Unknown
			lastHealthCheckMs: 0,
			meshFallbackActive: false
		};
	}

	async getStatusAsync(): Promise<ITarxInferenceStatus> {
		return this.channel.call('getStatus');
	}

	isRunning(): boolean {
		// Note: Synchronous - returns cached value. Use isRunningAsync for fresh value.
		return false;
	}

	async isRunningAsync(): Promise<boolean> {
		return this.channel.call('isRunning');
	}

	preflightCheck(): Promise<ITarxPreflightResult> {
		return this.channel.call('preflightCheck');
	}

	checkHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
		return this.channel.call('checkHealth');
	}

	listModels(): Promise<ITarxModelInfo[]> {
		return this.channel.call('listModels');
	}
}
