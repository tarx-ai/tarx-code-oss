/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project data from database
 */
export interface TarxProject {
	id: string;
	name: string;
	path: string;
	type: string | null;
	isActive: boolean;
	emoji?: string;
	createdAt: number;
}

/**
 * History item from conversation database
 */
export interface TarxHistoryItem {
	id: string;
	title: string;
	timestamp: number;
	source: 'claude' | 'tarx';
	spaceId?: string;
	spaceName?: string;
}

/**
 * Uploaded file item
 */
export interface TarxUploadedFile {
	id: string;
	filename: string;
	size: number;
	uploadedAt: number;
	sourceType?: 'upload' | 'scan' | 'git';
	originalPath?: string;
	isReference?: boolean;
	lastModified?: number;
}

/**
 * Connection status
 */
export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'reconnecting';

/**
 * Section collapse state
 */
export interface SectionState {
	code: boolean;
	files: boolean;
	projects: boolean;
	history: boolean;
}

/**
 * MCP Bridge state for sidebar
 */
export interface MCPBridgeSidebarState {
	selectedProjectId: string | null;
	selectedChatId: string | null;
	activeSection: 'chat' | 'projects' | 'history' | 'files';
	projects: TarxProject[];
	history: TarxHistoryItem[];
	files: TarxUploadedFile[];
	isLoading: { projects: boolean; history: boolean; files: boolean };
	errors: { projects: string | null; history: string | null; files: string | null };
	connectionStatus: ConnectionStatus;
	extensionReady: boolean;
}

/**
 * AI Provider connection status
 */
export type ProviderConnectionStatus = 'connected' | 'error' | 'not_configured';

/**
 * Stripe billing tier
 */
export type BillingTier = 'free' | 'lite' | 'pro' | 'max';

/**
 * Billing status for settings UI
 */
export interface BillingStatus {
	tier: BillingTier;
	tierLabel: string;
	priceMonthly: number;
	subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'trialing' | 'none';
	currentPeriodEnd: number | null;
	meshCreditsUsed: number;
	meshCreditsIncluded: number;
	meshCreditsOverage: number;
	overageRate: number;
	customerId: string | null;
	canUpgrade: boolean;
	canManage: boolean;
}

/**
 * Settings for the settings panel
 */
export interface TarxSettings {
	// User Profile
	userName?: string;
	// Claude API
	claudeApiKeyConfigured: boolean;
	claudeModel: string;
	claudeConnectionStatus: ProviderConnectionStatus;
	// Local Model
	localModelStatus: 'connected' | 'disconnected';
	localModelName: string;
	localModelPort: number;
	// Memory
	memoryEnabled: boolean;
	threadConversations: boolean;
	// Billing
	billing?: BillingStatus;
}

/**
 * Result of a connection test
 */
export interface ConnectionTestResult {
	success: boolean;
	error?: string;
	model?: string;
}

/**
 * Messages from extension to webview
 */
export type ExtensionMessage =
	| { command: 'refresh' }
	| { command: 'projectsLoaded'; projects: TarxProject[] }
	| { command: 'historyLoaded'; items: TarxHistoryItem[] }
	| { command: 'uploadedFilesLoaded'; files: TarxUploadedFile[] }
	| { command: 'connectionStatusChanged'; status: ConnectionStatus }
	| { command: 'uploadProgress'; text: string; percent: number }
	| { command: 'uploadProgressHide' }
	// MCP Bridge messages
	| { command: 'projectsUpdated'; data?: { projects: TarxProject[] } }
	| { command: 'historyUpdated'; data?: { items: TarxHistoryItem[] } }
	| { command: 'filesUpdated'; data?: { files: TarxUploadedFile[] } }
	| { command: 'navigate'; data?: { view: 'chat' | 'projects' | 'history' | 'files' } }
	| { command: 'loadingState'; data?: { section: string; isLoading: boolean } }
	| { command: 'errorState'; data?: { section: string; message: string | null } }
	| { command: 'connectionStatus'; data?: { status: ConnectionStatus } }
	| { command: 'projectSelected'; data?: { projectId: string | null } }
	| { command: 'extensionReady' }
	| { command: 'stateSync'; data?: Partial<MCPBridgeSidebarState> }
	// Settings messages
	| { command: 'settingsLoaded'; settings: TarxSettings }
	| { command: 'settingsUpdated'; settings: Partial<TarxSettings> }
	| { command: 'connectionTestResult'; result: ConnectionTestResult }
	| { command: 'apiKeySaved'; success: boolean; error?: string }
	| { command: 'apiKeyDeleted' }
	| { command: 'memoryClearResult'; success: boolean }
	// Folder browser
	| { command: 'folderSelected'; path: string }
	// Billing messages
	| { command: 'billingStatusLoaded'; billing: BillingStatus }
	| { command: 'billingCheckoutUrl'; url: string }
	| { command: 'billingPortalUrl'; url: string }
	| { command: 'billingError'; error: string }
	// HierarchyNav messages
	| { command: 'setCollapsed'; collapsed: boolean }
	| { command: 'claudeSessionsLoaded'; sessions: Array<{ id: string; title: string; spaceName?: string }> }
	| { command: 'contextFilesLoaded'; files: Array<{ id: string; filename: string; path: string }> }
	| { command: 'agentsLoaded'; agents: Array<{ id: string; name: string; description?: string; enabled?: boolean; toolCount?: number }> }
	| { command: 'ragSearchResults'; results: Array<{ id: string; filename: string; path: string; snippet: string; score: number }> }
	// PIN Overlay messages
	| { command: 'showPINOverlay'; mode: 'create' | 'verify' }
	| { command: 'hidePINOverlay' }
	| { command: 'pinCheckComplete' }
	| { command: 'pinError'; error: string }
	// Event confirmation messages (for VS Code native event firing)
	| { command: 'eventFired'; event: string; data?: Record<string, unknown> }
	| { command: 'eventError'; event: string; error: string }
	| { command: 'conversationOpened'; conversationId: string }
	| { command: 'sessionOpened'; sessionId: string };
