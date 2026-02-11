/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Event } from '../../../base/common/event.js';

/**
 * Health state of the TARX inference service
 */
export const enum TarxHealthState {
	Unknown = 0,
	Healthy = 1,
	Degraded = 2,
	Critical = 3
}

/**
 * Status of the llama-server inference engine
 */
export interface ITarxInferenceStatus {
	readonly running: boolean;
	readonly port: number;
	readonly modelLoaded: boolean;
	readonly loadedModels: string[];
	readonly healthState: TarxHealthState;
	readonly lastHealthCheckMs: number;
	readonly meshFallbackActive: boolean;
}

/**
 * Result of a spawn attempt
 */
export interface ITarxSpawnResult {
	readonly success: boolean;
	readonly attempt: number;
	readonly elapsedMs: number;
	readonly error?: string;
	readonly meshFallbackTriggered: boolean;
	readonly pid?: number;
	readonly healthCheckLatencyMs?: number;
}

/**
 * Hardware configuration for inference
 */
export interface ITarxHardwareConfig {
	readonly maxRamUsageGb?: number;
	readonly useGpu?: boolean;
	readonly contextSize?: number;
	readonly gpuLayers?: number;
}

/**
 * Model information
 */
export interface ITarxModelInfo {
	readonly id: string;
	readonly path: string;
	readonly sizeBytes: number;
	readonly sizeDisplay: string;
	readonly hasMmproj: boolean;
}

/**
 * Pre-flight validation result
 */
export interface ITarxPreflightResult {
	readonly binaryExists: boolean;
	readonly portAvailable: boolean;
	readonly modelFound: boolean;
	readonly modelPath?: string;
	readonly systemRamGb: number;
	readonly recommendedCtxSize: number;
	readonly errors: string[];
	isReady(): boolean;
}

/**
 * Configuration for spawn retry behavior
 */
export interface ITarxSpawnRetryConfig {
	readonly maxAttempts: number;
	readonly baseDelayMs: number;
	readonly meshFallbackTimeoutMs: number;
}

export const DEFAULT_SPAWN_RETRY_CONFIG: ITarxSpawnRetryConfig = {
	maxAttempts: 3,
	baseDelayMs: 1000,
	meshFallbackTimeoutMs: 15000
};

/**
 * TARX Sidecar Service - manages llama-server lifecycle
 */
export interface ITarxSidecarService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when inference status changes
	 */
	readonly onDidChangeStatus: Event<ITarxInferenceStatus>;

	/**
	 * Event fired when a log line is received from llama-server
	 */
	readonly onDidReceiveLog: Event<string>;

	/**
	 * Start the inference engine with retry logic
	 */
	startInference(config?: ITarxHardwareConfig): Promise<ITarxSpawnResult>;

	/**
	 * Stop the inference engine
	 */
	stopInference(): Promise<void>;

	/**
	 * Restart the inference engine
	 */
	restartInference(config?: ITarxHardwareConfig): Promise<ITarxSpawnResult>;

	/**
	 * Get current inference status
	 */
	getStatus(): ITarxInferenceStatus;

	/**
	 * Check if inference is running
	 */
	isRunning(): boolean;

	/**
	 * Run pre-flight validation
	 */
	preflightCheck(): Promise<ITarxPreflightResult>;

	/**
	 * Check health endpoint
	 */
	checkHealth(): Promise<{ healthy: boolean; latencyMs: number }>;

	/**
	 * List available models
	 */
	listModels(): Promise<ITarxModelInfo[]>;

	/**
	 * Get the inference port
	 */
	readonly port: number;
}

export const ITarxSidecarService = createDecorator<ITarxSidecarService>('tarxSidecarService');

/**
 * TARX default ports
 */
export const TARX_INFERENCE_PORT = 11435;
export const TARX_MESH_PORT = 11436;
export const TARX_EMBEDDINGS_PORT = 11437;

/**
 * TARX embedding model pattern (prefix match for nomic-embed blob in ~/.ollama/models/blobs/)
 */
export const TARX_EMBEDDINGS_MODEL_PATTERN = 'sha256-970aa74c';

/**
 * TARX Embedding Sidecar Service - manages embedding server lifecycle
 */
export interface ITarxEmbeddingSidecarService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when embedding server status changes
	 */
	readonly onDidChangeStatus: Event<ITarxEmbeddingsStatus>;

	/**
	 * Start the embedding server
	 */
	startEmbeddings(): Promise<ITarxSpawnResult>;

	/**
	 * Stop the embedding server
	 */
	stopEmbeddings(): Promise<void>;

	/**
	 * Check if embedding server is running
	 */
	isRunning(): boolean;

	/**
	 * Check health endpoint
	 */
	checkHealth(): Promise<{ healthy: boolean; latencyMs: number }>;

	/**
	 * Get the embeddings port
	 */
	readonly port: number;
}

export const ITarxEmbeddingSidecarService = createDecorator<ITarxEmbeddingSidecarService>('tarxEmbeddingSidecarService');

/**
 * Status of the embedding server
 */
export interface ITarxEmbeddingsStatus {
	readonly running: boolean;
	readonly port: number;
	readonly modelLoaded: boolean;
	readonly healthState: TarxHealthState;
}

/**
 * TARX paths
 */
export function getTarxModelsDir(): string {
	const home = process.env.HOME || process.env.USERPROFILE || '';
	return `${home}/Library/Application Support/tarx/models`;
}

export function getTarxDataDir(): string {
	const home = process.env.HOME || process.env.USERPROFILE || '';
	return `${home}/Library/Application Support/com.tarx.supercomputer`;
}
