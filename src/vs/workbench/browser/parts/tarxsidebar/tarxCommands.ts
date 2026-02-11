/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Sidebar Commands - Unified Registry
 * All commands that control the sidebar from MCP, Extension, or Workbench
 */

export const TarxSidebarCommands = {
	// ═══════════════════════════════════════════════════════════════════════
	// PROJECT COMMANDS
	// ═══════════════════════════════════════════════════════════════════════
	PROJECT_LIST: 'tarx.sidebar.projects.list',
	PROJECT_CREATE: 'tarx.sidebar.projects.create',
	PROJECT_OPEN: 'tarx.sidebar.projects.open',
	PROJECT_DELETE: 'tarx.sidebar.projects.delete',
	PROJECT_REFRESH: 'tarx.sidebar.projects.refresh',
	PROJECT_SELECT: 'tarx.sidebar.projects.select',

	// ═══════════════════════════════════════════════════════════════════════
	// CHAT/CONVERSATION COMMANDS
	// ═══════════════════════════════════════════════════════════════════════
	CHAT_NEW: 'tarx.sidebar.chat.new',
	CHAT_OPEN: 'tarx.sidebar.chat.open',
	CHAT_LIST: 'tarx.sidebar.chat.list',
	CHAT_DELETE: 'tarx.sidebar.chat.delete',
	CHAT_SEND_MESSAGE: 'tarx.sidebar.chat.sendMessage',

	// ═══════════════════════════════════════════════════════════════════════
	// SESSION COMMANDS
	// ═══════════════════════════════════════════════════════════════════════
	SESSION_CREATE: 'tarx.sidebar.session.create',
	SESSION_OPEN: 'tarx.sidebar.session.open',
	SESSION_LIST: 'tarx.sidebar.session.list',
	SESSION_THREAD_MESSAGE: 'tarx.sidebar.session.threadMessage',

	// ═══════════════════════════════════════════════════════════════════════
	// HISTORY COMMANDS
	// ═══════════════════════════════════════════════════════════════════════
	HISTORY_REFRESH: 'tarx.sidebar.history.refresh',
	HISTORY_CLEAR: 'tarx.sidebar.history.clear',
	HISTORY_SHOW_ALL: 'tarx.sidebar.history.showAll',

	// ═══════════════════════════════════════════════════════════════════════
	// FILE/CONTEXT COMMANDS
	// ═══════════════════════════════════════════════════════════════════════
	FILES_LIST: 'tarx.sidebar.files.list',
	FILES_UPLOAD: 'tarx.sidebar.files.upload',
	FILES_DELETE: 'tarx.sidebar.files.delete',
	FILES_SEARCH: 'tarx.sidebar.files.search',

	// ═══════════════════════════════════════════════════════════════════════
	// UI STATE COMMANDS
	// ═══════════════════════════════════════════════════════════════════════
	UI_REFRESH: 'tarx.sidebar.ui.refresh',
	UI_NAVIGATE: 'tarx.sidebar.ui.navigate',
	UI_SET_LOADING: 'tarx.sidebar.ui.setLoading',
	UI_SHOW_ERROR: 'tarx.sidebar.ui.showError',
	UI_CLEAR_ERROR: 'tarx.sidebar.ui.clearError',
	UI_GET_STATE: 'tarx.sidebar.ui.getState',
	UI_SET_CONNECTION_STATUS: 'tarx.sidebar.ui.setConnectionStatus',

	// ═══════════════════════════════════════════════════════════════════════
	// INTERNAL COMMANDS (workbench only)
	// ═══════════════════════════════════════════════════════════════════════
	INTERNAL_POST_MESSAGE: 'tarx.sidebar.internal.postMessage',
	INTERNAL_UPDATE_STATE: 'tarx.sidebar.internal.updateState',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE TYPES (Webview ↔ Workbench)
// ═══════════════════════════════════════════════════════════════════════════

export const TarxMessageTypes = {
	// Host → Webview
	PROJECTS_UPDATED: 'projectsUpdated',
	HISTORY_UPDATED: 'historyUpdated',
	FILES_UPDATED: 'filesUpdated',
	CONNECTION_STATUS: 'connectionStatus',
	LOADING_STATE: 'loadingState',
	ERROR_STATE: 'errorState',
	NAVIGATE: 'navigate',
	EXTENSION_READY: 'extensionReady',
	STATE_SYNC: 'stateSync',
	PROJECT_SELECTED: 'projectSelected',

	// Webview → Host
	READY: 'ready',
	REQUEST_PROJECTS: 'getProjects',
	REQUEST_HISTORY: 'getHistory',
	REQUEST_FILES: 'getUploadedFiles',
	REQUEST_STATUS: 'getConnectionStatus',
	ACTION_OPEN_CHAT: 'openChat',
	ACTION_OPEN_SESSION: 'openSession',
	ACTION_OPEN_PROJECT: 'openProject',
	ACTION_CREATE_PROJECT: 'createProject',
	ACTION_UPLOAD_FILE: 'uploadFile',
	ACTION_REFRESH: 'refresh',
	ACTION_NAVIGATE: 'navigate',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface TarxProject {
	id: string;
	name: string;
	path: string;
	type?: string | null;
	description?: string;
	color?: string;
	icon?: string;
	isActive?: boolean;
	lastOpened?: number;
	createdAt?: number;
}

export interface TarxHistoryItem {
	id: string;
	type: 'conversation' | 'session';
	title: string;
	preview?: string;
	timestamp: number;
	source?: 'claude' | 'tarx';
	projectId?: string;
	spaceId?: string;
	spaceName?: string;
}

export interface TarxUploadedFile {
	id: string;
	name: string;
	path: string;
	size: number;
	type: string;
	uploadedAt: number;
}

export interface TarxSidebarLoadingState {
	projects: boolean;
	history: boolean;
	files: boolean;
}

export interface TarxSidebarErrorState {
	projects: string | null;
	history: string | null;
	files: string | null;
}

export interface TarxSidebarState {
	// Selection state
	selectedProjectId: string | null;
	selectedChatId: string | null;
	activeSection: 'chat' | 'projects' | 'history' | 'files';

	// Data
	projects: TarxProject[];
	history: TarxHistoryItem[];
	files: TarxUploadedFile[];

	// UI state
	isLoading: TarxSidebarLoadingState;
	errors: TarxSidebarErrorState;

	// Connection
	connectionStatus: 'online' | 'offline' | 'connecting' | 'reconnecting';
	extensionReady: boolean;
}

export interface TarxSidebarMessage {
	type: 'tarx-sidebar' | 'tarx-webview' | 'tarx-host';
	command: string;
	data?: unknown;
	requestId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIAL STATE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createInitialSidebarState(): TarxSidebarState {
	return {
		selectedProjectId: null,
		selectedChatId: null,
		activeSection: 'chat',
		projects: [],
		history: [],
		files: [],
		isLoading: {
			projects: false,
			history: false,
			files: false,
		},
		errors: {
			projects: null,
			history: null,
			files: null,
		},
		connectionStatus: 'connecting',
		extensionReady: false,
	};
}
