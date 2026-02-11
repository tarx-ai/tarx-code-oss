/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Hardware Detection Service
 *  - Detects system RAM, CPU, platform
 *  - Selects optimal model based on hardware
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import { toastManager } from './toastManager';

export interface HardwareInfo {
	ram_gb: number;
	cpu_cores: number;
	platform: string;
	arch: string;
}

export async function detectHardware(): Promise<HardwareInfo> {
	await toastManager.show('hardware', {
		message: 'Detecting hardware...',
		duration: 2000,
		type: 'info'
	});

	const totalMemory = os.totalmem();
	const ram_gb = Math.round(totalMemory / (1024 ** 3));
	const cpu_cores = os.cpus().length;
	const platform = os.platform();
	const arch = os.arch();

	const hardware: HardwareInfo = {
		ram_gb,
		cpu_cores,
		platform,
		arch
	};

	console.log('[TARX] Hardware detected:', hardware);
	return hardware;
}

export function selectModel(hardware: HardwareInfo): string {
	// Select model based on available RAM
	if (hardware.ram_gb >= 32) {
		return 'qwen2.5-coder-14b';
	} else if (hardware.ram_gb >= 16) {
		return 'qwen2.5-coder-7b';
	} else {
		return 'qwen2.5-coder-3b';
	}
}

export function getModelSize(model: string): number {
	// Return model size in bytes
	const modelSizes: Record<string, number> = {
		'qwen2.5-coder-3b': 2 * (1024 ** 3),   // ~2GB
		'qwen2.5-coder-7b': 4 * (1024 ** 3),   // ~4GB
		'qwen2.5-coder-14b': 8 * (1024 ** 3),  // ~8GB
	};
	return modelSizes[model] || 4 * (1024 ** 3);
}
