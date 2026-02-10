/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useCallback } from 'react';
import { postMessage, getState, setState } from './hooks/useVSCodeAPI';
import { Header } from './components/Header';
import { NavRow } from './components/NavRow';
import { CollapsibleSection } from './components/CollapsibleSection';
import { SectionItem } from './components/SectionItem';
import { ProjectsSection } from './components/ProjectsSection';
import { HistorySection } from './components/HistorySection';
import { FilesSection } from './components/FilesSection';
import { Footer } from './components/Footer';
import { ModelLoadingIndicator } from './components/ModelLoadingIndicator';
import { UploadProgress } from './components/UploadProgress';
import { SettingsView } from './components/SettingsView';
import { ProjectModal } from './components/ProjectModal';
import type {
	TarxProject,
	TarxHistoryItem,
	TarxUploadedFile,
	ConnectionStatus,
	SectionState,
	ExtensionMessage,
	TarxSettings
} from './types';

// Custom branded chat icon - larger and more prominent than codicons
const ChatIcon: React.FC = () => (
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		<path d="M8 10h.01" strokeWidth="2.5"/>
		<path d="M12 10h.01" strokeWidth="2.5"/>
		<path d="M16 10h.01" strokeWidth="2.5"/>
	</svg>
);

interface AppProps {
	logoUri: string;
	eyesUri: string;
}

// Default section state (collapsed by default except projects and history)
const defaultSectionState: SectionState = {
	code: true,
	files: true,
	projects: false,
	history: false
};

export const App: React.FC<AppProps> = ({ logoUri, eyesUri }) => {
	// State
	const [projects, setProjects] = useState<TarxProject[]>([]);
	const [historyItems, setHistoryItems] = useState<TarxHistoryItem[]>([]);
	const [uploadedFiles, setUploadedFiles] = useState<TarxUploadedFile[]>([]);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
	const [sectionState, setSectionState] = useState<SectionState>(() => {
		const saved = getState<{ sections: SectionState }>();
		return saved?.sections || defaultSectionState;
	});
	const [uploadProgress, setUploadProgress] = useState<{ text: string; percent: number } | null>(null);

	// Settings state
	const [showSettings, setShowSettings] = useState(false);
	const [settings, setSettings] = useState<TarxSettings | null>(null);

	// Project modal state
	const [showProjectModal, setShowProjectModal] = useState(false);

	// MCP Bridge state
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
	const [activeSection, setActiveSection] = useState<'chat' | 'projects' | 'history' | 'files'>('chat');
	const [isLoading, setIsLoading] = useState<{ projects: boolean; history: boolean; files: boolean }>({
		projects: false,
		history: false,
		files: false
	});
	const [errors, setErrors] = useState<{ projects: string | null; history: string | null; files: string | null }>({
		projects: null,
		history: null,
		files: null
	});
	const [extensionReady, setExtensionReady] = useState(false);

	// Handlers
	const toggleSection = useCallback((sectionId: keyof SectionState) => {
		setSectionState(prev => {
			const newState = { ...prev, [sectionId]: !prev[sectionId] };
			setState({ sections: newState });
			return newState;
		});
	}, []);

	const handleOpenChat = useCallback(() => {
		postMessage({ command: 'openChat' });
	}, []);

	const handleNewChat = useCallback(() => {
		postMessage({ command: 'newChat' });
	}, []);

	const handleOpenProject = useCallback((projectId: string) => {
		// Set selected project in state
		setSelectedProjectId(projectId);

		// Save to vscode state
		setState({ ...getState(), selectedProjectId: projectId });

		// Post select message to extension (not open)
		postMessage({ command: 'selectProject', projectId });
	}, []);

	const handleCreateProject = useCallback(() => {
		// Show inline modal in sidebar
		setShowProjectModal(true);
	}, []);

	const handleProjectSubmit = useCallback((name: string) => {
		// Send to extension to create project with auto-folder
		postMessage({ command: 'createProject', name });
		setShowProjectModal(false);
	}, []);

	const handleProjectModalCancel = useCallback(() => {
		setShowProjectModal(false);
	}, []);

	const handleOpenView = useCallback((viewId: string) => {
		postMessage({ command: 'openView', viewId });
	}, []);

	const handleOpenSettings = useCallback(() => {
		// Open in-webview settings panel
		setShowSettings(true);
		postMessage({ command: 'getSettings' });
	}, []);

	const handleCloseSettings = useCallback(() => {
		setShowSettings(false);
	}, []);

	const handleSettingsChange = useCallback((newSettings: Partial<TarxSettings>) => {
		setSettings(prev => prev ? { ...prev, ...newSettings } : null);
	}, []);

	const handleOpenExtensions = useCallback(() => {
		postMessage({ command: 'openExtensions' });
	}, []);

	const handleOpenSession = useCallback((sessionId: string, spaceId?: string) => {
		postMessage({ command: 'openSession', sessionId, spaceId });
	}, []);

	const handleOpenConversation = useCallback((conversationId: string) => {
		postMessage({ command: 'openConversation', conversationId });
	}, []);

	const handleShowAllHistory = useCallback(() => {
		postMessage({ command: 'showAllHistory' });
	}, []);

	const handleUploadFile = useCallback((filename: string, content: string, size: number, mimeType: string) => {
		postMessage({ command: 'uploadFile', filename, content, size, mimeType });
	}, []);

	const handleDeleteFile = useCallback((fileId: string) => {
		postMessage({ command: 'deleteFile', fileId });
	}, []);

	const handleLogoClick = useCallback(() => {
		postMessage({ command: 'getDaemonStatus' });
	}, []);

	// Track if we've received initial data
	const [hasReceivedProjects, setHasReceivedProjects] = useState(false);

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data;

			console.log('[TARX WEBVIEW] Received message:', message.command);
			switch (message.command) {
				case 'refresh':
					console.log('[TARX WEBVIEW] Handling refresh - requesting all data');
					postMessage({ command: 'getProjects' });
					postMessage({ command: 'getHistory' });
					postMessage({ command: 'getUploadedFiles' });
					postMessage({ command: 'getConnectionStatus' });
					break;

				case 'projectsLoaded':
					console.log('[TARX WEBVIEW] projectsLoaded received:', message.projects?.length ?? 0, 'projects');
					setProjects(message.projects);
					setHasReceivedProjects(true);
					setIsLoading(prev => ({ ...prev, projects: false }));
					break;

				case 'historyLoaded':
					setHistoryItems(message.items);
					break;

				case 'uploadedFilesLoaded':
					setUploadedFiles(message.files);
					break;

				case 'connectionStatusChanged':
					setConnectionStatus(message.status);
					break;

				case 'uploadProgress':
					setUploadProgress({ text: message.text, percent: message.percent });
					break;

				case 'uploadProgressHide':
					setUploadProgress(null);
					break;

				// ═══════════════════════════════════════════════════════════════
				// MCP BRIDGE MESSAGES
				// ═══════════════════════════════════════════════════════════════

				case 'projectsUpdated':
					setProjects(message.data?.projects || []);
					break;

				case 'historyUpdated':
					setHistoryItems(message.data?.items || []);
					break;

				case 'filesUpdated':
					setUploadedFiles(message.data?.files || []);
					break;

				case 'navigate':
					if (message.data?.view) {
						setActiveSection(message.data.view);
					}
					break;

				case 'loadingState':
					if (message.data?.section) {
						setIsLoading(prev => ({
							...prev,
							[message.data.section]: message.data.isLoading
						}));
					}
					break;

				case 'errorState':
					if (message.data?.section) {
						setErrors(prev => ({
							...prev,
							[message.data.section]: message.data.message
						}));
					}
					break;

				case 'connectionStatus':
					if (message.data?.status) {
						setConnectionStatus(message.data.status);
					}
					break;

				case 'projectSelected':
					if (message.data?.projectId !== undefined) {
						setSelectedProjectId(message.data.projectId);
					}
					break;

				case 'extensionReady':
					setExtensionReady(true);
					break;

				case 'stateSync':
					// Full state sync from host
					if (message.data) {
						const data = message.data;
						if (data.projects) setProjects(data.projects);
						if (data.history) setHistoryItems(data.history);
						if (data.files) setUploadedFiles(data.files);
						if (data.connectionStatus) setConnectionStatus(data.connectionStatus);
						if (data.selectedProjectId !== undefined) setSelectedProjectId(data.selectedProjectId);
						if (data.activeSection) setActiveSection(data.activeSection);
						if (data.isLoading) setIsLoading(data.isLoading);
						if (data.errors) setErrors(data.errors);
						if (data.extensionReady !== undefined) setExtensionReady(data.extensionReady);
					}
					break;

				// ═══════════════════════════════════════════════════════════════
				// SETTINGS MESSAGES
				// ═══════════════════════════════════════════════════════════════

				case 'settingsLoaded':
					setSettings(message.settings);
					break;

				case 'settingsUpdated':
					setSettings(prev => prev ? { ...prev, ...message.settings } : null);
					break;

				case 'billingStatusLoaded':
					setSettings(prev => prev ? { ...prev, billing: message.billing } : null);
					break;
			}
		};

		window.addEventListener('message', handleMessage);

		// Tell extension we're ready
		console.log('[TARX WEBVIEW] >>>>>> SENDING "ready" TO EXTENSION <<<<<<');
		postMessage({ command: 'ready' });

		return () => window.removeEventListener('message', handleMessage);
	}, []);

	// Retry loading projects if still empty after initial load (race condition fix)
	useEffect(() => {
		// Only retry if we've received initial response but projects are empty
		if (hasReceivedProjects && projects.length === 0) {
			console.log('[TARX WEBVIEW] Projects empty after initial load - scheduling retry');
			const retryTimer = setTimeout(() => {
				console.log('[TARX WEBVIEW] Retrying getProjects due to empty response');
				postMessage({ command: 'getProjects' });
			}, 1000);

			return () => clearTimeout(retryTimer);
		}
	}, [hasReceivedProjects, projects.length]);

	// Show loading indicator when connecting
	const showLoading = connectionStatus === 'connecting';

	// If showing settings, render SettingsView
	if (showSettings) {
		return (
			<div className="tarx-sidebar-container">
				<SettingsView
					onBack={handleCloseSettings}
					settings={settings}
					onSettingsChange={handleSettingsChange}
				/>
			</div>
		);
	}

	return (
		<div className="tarx-sidebar-container">
			<Header
				logoUri={logoUri}
				connectionStatus={connectionStatus}
				modelName={settings?.localModelName || undefined}
				onLogoClick={handleLogoClick}
				onSettingsClick={handleOpenSettings}
			/>

			{showLoading && <ModelLoadingIndicator />}

			{uploadProgress && (
				<UploadProgress text={uploadProgress.text} percent={uploadProgress.percent} />
			)}

			{!showLoading && (
				<>
					{/* Nav Rows */}
					<div className="tarx-nav-rows">
						<NavRow
							icon="comment-discussion"
							iconElement={<ChatIcon />}
							label="Chat"
							onClick={handleOpenChat}
							onActionClick={handleNewChat}
							actionIcon="add"
							actionTitle="New Chat"
						/>
					</div>

					{/* Sections */}
					<div className="tarx-sections">
						{/* Code Section */}
						<CollapsibleSection
							id="code"
							title="Code"
							icon="code"
							collapsed={sectionState.code}
							onToggle={() => toggleSection('code')}
						>
							<SectionItem
								icon="source-control"
								label="Source Control"
								onClick={() => handleOpenView('workbench.view.scm')}
							/>
							<SectionItem
								icon="debug"
								label="Run & Debug"
								onClick={() => handleOpenView('workbench.view.debug')}
							/>
							<SectionItem
								icon="terminal"
								label="Terminal"
								onClick={() => handleOpenView('workbench.action.terminal.toggleTerminal')}
							/>
						</CollapsibleSection>

						{/* Files Section */}
						<FilesSection
							collapsed={sectionState.files}
							onToggle={() => toggleSection('files')}
							files={uploadedFiles}
							onOpenView={handleOpenView}
							onUploadFile={handleUploadFile}
							onDeleteFile={handleDeleteFile}
						/>

						{/* Projects Section */}
						<ProjectsSection
							collapsed={sectionState.projects}
							onToggle={() => toggleSection('projects')}
							projects={projects}
							isLoading={isLoading.projects}
							onOpenProject={handleOpenProject}
							onCreateProject={handleCreateProject}
							selectedProjectId={selectedProjectId}
						/>

						{/* History Section */}
						<HistorySection
							collapsed={sectionState.history}
							onToggle={() => toggleSection('history')}
							items={selectedProjectId ? historyItems.filter(item => item.spaceId === selectedProjectId) : historyItems}
							eyesUri={eyesUri}
							onOpenSession={handleOpenSession}
							onOpenConversation={handleOpenConversation}
							onShowAll={handleShowAllHistory}
						/>
					</div>

					{/* Footer */}
					<Footer
						connectionStatus={connectionStatus}
						onOpenSettings={handleOpenSettings}
						onOpenExtensions={handleOpenExtensions}
					/>
				</>
			)}

			{/* Project Modal - inline in sidebar */}
			{showProjectModal && (
				<ProjectModal
					onSubmit={handleProjectSubmit}
					onCancel={handleProjectModalCancel}
				/>
			)}
		</div>
	);
};
