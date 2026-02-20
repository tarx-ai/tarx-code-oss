/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Services - Barrel Export
 *--------------------------------------------------------------------------------------------*/

export { ToastManager, toastManager } from './toastManager';
export { detectHardware, selectModel, getModelSize, HardwareInfo } from './hardwareDetection';
export { trackModelDownload, checkModelExists, DownloadProgress } from './modelDownload';
export { FirstRunManager } from './firstRunManager';
export { executeFirstRunFlow } from './firstRunFlow';
export { MCPBridgeService, mcpBridge } from './mcpBridge';
export type { MCPBridgeEvent, SidebarSection, SidebarView, ConnectionStatus, SidebarStateUpdate } from './mcpBridge';
export { ContextProtocol } from './contextProtocol';
export type { UserIdentity, ContextBudget, ComputePath, QueryType, SamplingParams, Observation, RetrievedChunk } from './contextProtocol';
export { buildProtocolPrompt } from './promptBuilder';
export type { PromptOptions } from './promptBuilder';
