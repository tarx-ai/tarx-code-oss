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
import TARXDashboard from './components/Dashboard';
import { FirstRunWelcome } from './components/FirstRunWelcome';
import { PINModal } from './components/PINModal';
import type {
	TarxProject,
	TarxHistoryItem,
	TarxUploadedFile,
	ConnectionStatus,
	SectionState,
	ExtensionMessage,
	TarxSettings
} from './types';
import { HierarchyNav } from './components/HierarchyNav';

// Custom branded chat icon - same size as codicons (16px)
const ChatIcon: React.FC = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
		<path d="M8 10h.01" strokeWidth="2.5"/>
		<path d="M12 10h.01" strokeWidth="2.5"/>
		<path d="M16 10h.01" strokeWidth="2.5"/>
	</svg>
);

interface AppProps {
	mode: 'sidebar' | 'dashboard';
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

export const App: React.FC<AppProps> = ({ mode, logoUri, eyesUri }) => {
	// ═══════════════════════════════════════════════════════════════
	// MOUNT LOG - Confirm React component is rendering
	// ═══════════════════════════════════════════════════════════════
	console.log('[TARX React App] App component rendering - mode:', mode);

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

	// HierarchyNav additional state
	const [claudeSessions, setClaudeSessions] = useState<Array<{ id: string; title: string; spaceName?: string }>>([]);
	const [contextFiles, setContextFiles] = useState<Array<{ id: string; filename: string; path: string }>>([]);
	const [agents, setAgents] = useState<Array<{ id: string; name: string; description?: string; enabled?: boolean; toolCount?: number }>>([]);
	const [skills, setSkills] = useState<Array<{ id: string; name: string; description?: string; category?: string; installed?: boolean; utilityScore?: number }>>([]);

	// RAG search state
	const [ragResults, setRagResults] = useState<Array<{ id: string; filename: string; path: string; snippet: string; score: number }>>([]);
	const [ragLoading, setRagLoading] = useState(false);

	// Use custom hierarchy nav instead of native sections
	const [useHierarchyNav, setUseHierarchyNav] = useState(true);

	// Collapsed state (from sidebar part)
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	// Dashboard state — only shown by default in dashboard mode
	const [showDashboard, setShowDashboard] = useState(mode === 'dashboard');

	// First-run detection — disabled by default, nav shows immediately
	// Set to true and remove hasSeenWelcome check to re-enable welcome screen
	const [showFirstRun, setShowFirstRun] = useState<boolean>(false);

	// PIN overlay state - locks app until PIN is set/verified
	// Start with null (unknown) to show loading state until PIN check completes
	const [pinCheckComplete, setPinCheckComplete] = useState(false);
	const [showPINOverlay, setShowPINOverlay] = useState(false);
	const [pinMode, setPinMode] = useState<'create' | 'verify'>('create');
	const [pinError, setPinError] = useState<string | null>(null);

	// Handle PIN submission
	const handlePINSubmit = useCallback((pin: string) => {
		console.log('[TARX WEBVIEW] PIN submitted, mode:', pinMode);
		setPinError(null); // Clear previous errors
		try {
			postMessage({ command: 'setPIN', pin, mode: pinMode });
			console.log('[TARX WEBVIEW] Posted setPIN message');
		} catch (e) {
			console.error('[TARX WEBVIEW] Failed to submit PIN:', e);
			setPinError('Failed to submit PIN. Please try again.');
		}
	}, [pinMode]);

	// Handlers
	const toggleSection = useCallback((sectionId: keyof SectionState) => {
		setSectionState(prev => {
			const newState = { ...prev, [sectionId]: !prev[sectionId] };
			setState({ sections: newState });
			return newState;
		});
	}, []);

	const handleOpenChat = useCallback(() => {
		console.log('[TARX WEBVIEW] Chat clicked');
		setShowDashboard(false);
		postMessage({ command: 'openChat' });
		console.log('[TARX WEBVIEW] Posted openChat message');
	}, []);

	const handleNewChat = useCallback(() => {
		console.log('[TARX WEBVIEW] New chat clicked');
		postMessage({ command: 'newChat' });
	}, []);

	const handleOpenProject = useCallback((projectId: string) => {
		console.log('[TARX WEBVIEW] Project clicked:', projectId);
		setSelectedProjectId(projectId);
		setState({ ...getState(), selectedProjectId: projectId });
		// Open full-tab project context panel
		postMessage({ command: 'openProjectTab', projectId });
		console.log('[TARX WEBVIEW] Posted openProjectTab message for:', projectId);
	}, []);

	const handleCreateProject = useCallback(() => {
		// Open full-tab create project panel (not sidebar modal)
		postMessage({ command: 'openCreateProjectTab' });
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
		console.log('[TARX WEBVIEW] Conversation clicked:', conversationId);
		postMessage({ command: 'openConversation', conversationId });
		console.log('[TARX WEBVIEW] Posted openConversation message for:', conversationId);
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

	const handleScanDirectory = useCallback(() => {
		postMessage({ command: 'scanDirectory' });
	}, []);

	const handleLogoClick = useCallback(() => {
		if (mode === 'dashboard') {
			setShowDashboard(true);
		} else {
			// In sidebar mode, open dashboard as center tab
			postMessage({ command: 'openDashboard' });
		}
	}, [mode]);

	const handleSkipWelcome = useCallback(() => {
		setShowFirstRun(false);
		setState({ ...getState(), hasSeenWelcome: true });
	}, []);

	const handleStartFromWelcome = useCallback(() => {
		console.log('[TARX WEBVIEW] Starting from welcome - opening chat with greeting');
		setShowFirstRun(false);
		setShowDashboard(false);
		setState({ ...getState(), hasSeenWelcome: true });
		// Open chat with a welcome greeting instead of empty
		postMessage({ command: 'startConversation', prompt: 'Hello! I\'m ready to help you with your code. What would you like to work on today?' });
	}, []);

	// ═══════════════════════════════════════════════════════════════
	// HIERARCHY NAV HANDLERS
	// ═══════════════════════════════════════════════════════════════
	const handleRefreshClaudeSessions = useCallback(() => {
		console.log('[TARX WEBVIEW] Refreshing Claude sessions');
		postMessage({ command: 'refreshClaudeSessions' });
	}, []);

	const handleOpenContextFile = useCallback((fileId: string) => {
		postMessage({ command: 'openContextFile', fileId });
	}, []);

	const handleClearContext = useCallback(() => {
		postMessage({ command: 'clearFileContext' });
	}, []);

	const handleBrowseFiles = useCallback(() => {
		postMessage({ command: 'browseFiles' });
	}, []);

	const handleToggleAgent = useCallback((agentId: string) => {
		postMessage({ command: 'toggleAgent', agentId });
	}, []);

	const handleConfigureAgent = useCallback((agentId: string) => {
		postMessage({ command: 'configureAgent', agentId });
	}, []);

	const handleOpenAgentsMarketplace = useCallback(() => {
		postMessage({ command: 'openAgentsMarketplace' });
	}, []);

	const handleOpenSkillsMarketplace = useCallback(() => {
		postMessage({ command: 'openSkillsMarketplace' });
	}, []);

	// Skills handler
	const handleInstallSkill = useCallback((skillId: string) => {
		console.log('[TARX WEBVIEW] Install skill:', skillId);
		postMessage({ command: 'installSkill', skillId });
		// Optimistically update UI
		setSkills(prev => prev.map(s =>
			s.id === skillId ? { ...s, installed: !s.installed } : s
		));
	}, []);

	// RAG search handler
	const handleRAGSearch = useCallback((query: string) => {
		console.log('[TARX WEBVIEW] RAG search:', query);
		setRagLoading(true);
		postMessage({ command: 'ragSearch', query });
	}, []);

	// Track if we've received initial data
	const [hasReceivedProjects, setHasReceivedProjects] = useState(false);

	// Listen for messages from extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data;

			console.log('[TARX WEBVIEW] Received message:', message.command);
			switch (message.command) {
				case 'setCollapsed':
					console.log('[TARX WEBVIEW] setCollapsed:', message.collapsed);
					setSidebarCollapsed(message.collapsed);
					break;

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

				// ═══════════════════════════════════════════════════════════════
				// HIERARCHY NAV MESSAGES
				// ═══════════════════════════════════════════════════════════════

				case 'claudeSessionsLoaded':
					console.log('[TARX WEBVIEW] claudeSessionsLoaded:', message.sessions?.length ?? 0);
					setClaudeSessions(message.sessions || []);
					break;

				case 'contextFilesLoaded':
					console.log('[TARX WEBVIEW] contextFilesLoaded:', message.files?.length ?? 0);
					setContextFiles(message.files || []);
					break;

				case 'agentsLoaded':
					console.log('[TARX WEBVIEW] agentsLoaded:', message.agents?.length ?? 0);
					setAgents(message.agents || []);
					break;

				case 'skillsLoaded':
					console.log('[TARX WEBVIEW] skillsLoaded:', message.skills?.length ?? 0);
					setSkills(message.skills || []);
					break;

				case 'skillInstalled':
					console.log('[TARX WEBVIEW] skillInstalled:', message.skillId);
					setSkills(prev => prev.map(s =>
						s.id === message.skillId ? { ...s, installed: true } : s
					));
					break;

				case 'ragSearchResults':
					console.log('[TARX WEBVIEW] ragSearchResults:', message.results?.length ?? 0);
					setRagResults(message.results || []);
					setRagLoading(false);
					break;

				// PIN Overlay messages
				case 'showPINOverlay':
					console.log('[TARX WEBVIEW] showPINOverlay:', message.mode);
					setPinCheckComplete(true);
					setShowPINOverlay(true);
					setPinMode(message.mode || 'create');
					setPinError(null); // Clear any previous errors
					break;

				case 'hidePINOverlay':
					console.log('[TARX WEBVIEW] hidePINOverlay');
					setPinCheckComplete(true);
					setShowPINOverlay(false);
					setPinError(null);
					break;

				case 'pinCheckComplete':
					// PIN check is complete and no PIN needed
					console.log('[TARX WEBVIEW] pinCheckComplete - no PIN required');
					setPinCheckComplete(true);
					setShowPINOverlay(false);
					break;

				case 'pinError':
					console.log('[TARX WEBVIEW] pinError:', message.error);
					setPinError(message.error);
					break;

				// ═══════════════════════════════════════════════════════════════
				// EVENT CONFIRMATION MESSAGES - Confirm native VS Code events fired
				// ═══════════════════════════════════════════════════════════════

				case 'eventFired':
					console.log(`[TARX EVENT] ✓ Event fired: ${message.event}`, message.data);
					break;

				case 'eventError':
					console.error(`[TARX EVENT] ✗ Event error: ${message.event}`, message.error);
					break;

				case 'conversationOpened':
					console.log('[TARX EVENT] ✓ Conversation opened:', message.conversationId);
					break;

				case 'sessionOpened':
					console.log('[TARX EVENT] ✓ Session opened:', message.sessionId);
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

	// ═══════════════════════════════════════════════════════════════
	// PIN OVERLAY - Locks entire app until PIN is set/verified
	// Must be checked FIRST before any other render
	// ═══════════════════════════════════════════════════════════════

	// Show loading state while waiting for PIN check to complete
	if (!pinCheckComplete) {
		return (
			<div
				style={{
					position: 'fixed',
					top: 0,
					left: 0,
					right: 0,
					bottom: 0,
					width: '100vw',
					height: '100vh',
					background: 'var(--vscode-editor-background, #1e1e1e)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					zIndex: 99999,
				}}
			>
				<div style={{ textAlign: 'center' }}>
					{logoUri && (
						<img
							src={logoUri}
							alt="TARX"
							style={{
								width: 64,
								height: 64,
								marginBottom: 16,
								animation: 'pulse 1.5s ease-in-out infinite',
							}}
						/>
					)}
					<div style={{
						color: 'var(--vscode-descriptionForeground, #888)',
						fontSize: 12,
					}}>
						Loading TARX...
					</div>
				</div>
			</div>
		);
	}

	if (showPINOverlay) {
		return (
			<PINModal
				mode={pinMode}
				onSubmit={handlePINSubmit}
				logoUri={logoUri}
				externalError={pinError}
			/>
		);
	}

	// If showing first-run welcome, render FirstRunWelcome
	if (showFirstRun) {
		return (
			<div className={`tarx-sidebar-container${sidebarCollapsed ? ' collapsed' : ''}`}>
				<FirstRunWelcome
					logoUri={logoUri}
					onStartChat={handleStartFromWelcome}
					onCreateProject={handleCreateProject}
					onOpenSettings={handleOpenSettings}
					onSkipWelcome={handleSkipWelcome}
				/>
			</div>
		);
	}

	// If showing settings, render SettingsView
	if (showSettings) {
		return (
			<div className={`tarx-sidebar-container${sidebarCollapsed ? ' collapsed' : ''}`}>
				<SettingsView
					onBack={handleCloseSettings}
					settings={settings}
					onSettingsChange={handleSettingsChange}
				/>
			</div>
		);
	}

	// If showing dashboard, render Dashboard
	if (showDashboard) {
		return (
			<div className={`tarx-sidebar-container${sidebarCollapsed ? ' collapsed' : ''}`}>
				<TARXDashboard onOpenChat={handleOpenChat} />
			</div>
		);
	}

	return (
		<div className={`tarx-sidebar-container${sidebarCollapsed ? ' collapsed' : ''}`}>
			<Header
				logoUri={logoUri}
				connectionStatus={connectionStatus}
				modelName={settings?.localModelName || undefined}
				userName={settings?.userName}
				onLogoClick={handleLogoClick}
				onSettingsClick={handleOpenSettings}
			/>

			{showLoading && <ModelLoadingIndicator />}

			{uploadProgress && (
				<UploadProgress text={uploadProgress.text} percent={uploadProgress.percent} />
			)}

			{!showLoading && (
				<>
					{/* ═══════════════════════════════════════════════════════════════
					    HIERARCHY NAV - Custom React Collapsible Left Nav
					    Chat → Projects → Conversations → Files → Agents → Skills
					    ═══════════════════════════════════════════════════════════════ */}
					{useHierarchyNav ? (
						<div className="tarx-hierarchy-container">
							{/* Chat - top-level nav item */}
							<NavRow
								icon="comment-discussion"
								iconElement={<ChatIcon />}
								label="Chat"
								onClick={handleOpenChat}
								onActionClick={handleNewChat}
								actionIcon="add"
								actionTitle="New Chat"
							/>
							<HierarchyNav
								projects={projects.map(p => ({
									id: p.id,
									name: p.name,
									path: p.path || '',
									isActive: p.isActive
								}))}
								conversations={historyItems.map(h => ({
									id: h.id,
									title: h.title,
									timestamp: h.timestamp,
									source: h.source,
									spaceId: h.spaceId
								}))}
								claudeSessions={claudeSessions}
								contextFiles={contextFiles}
								agents={agents}
								selectedProjectId={selectedProjectId}
								onOpenProject={handleOpenProject}
								onCreateProject={handleCreateProject}
								onOpenConversation={handleOpenConversation}
								onNewConversation={handleNewChat}
								onOpenClaudeSession={(sessionId, spaceId) => handleOpenSession(sessionId, spaceId)}
								onRefreshClaudeSessions={handleRefreshClaudeSessions}
								onOpenContextFile={handleOpenContextFile}
								onClearContext={handleClearContext}
								onBrowseFiles={handleBrowseFiles}
								onToggleAgent={handleToggleAgent}
								onConfigureAgent={handleConfigureAgent}
								onOpenAgentsMarketplace={handleOpenAgentsMarketplace}
								onInstallSkill={handleInstallSkill}
								onOpenSkillsMarketplace={handleOpenSkillsMarketplace}
								skills={skills}
								onRAGSearch={handleRAGSearch}
								ragResults={ragResults}
								ragLoading={ragLoading}
							/>
						</div>
					) : (
						/* Legacy Sections - fallback if hierarchy nav disabled */
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
								onScanDirectory={handleScanDirectory}
							/>

							{/* Projects Section */}
							<ProjectsSection
								collapsed={sectionState.projects}
								onToggle={() => toggleSection('projects')}
								projects={projects}
								historyItems={historyItems}
								isLoading={isLoading.projects}
								onOpenProject={handleOpenProject}
								onCreateProject={handleCreateProject}
								onOpenSession={handleOpenSession}
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
					)}

					{/* Footer */}
					<Footer
						connectionStatus={connectionStatus}
						onOpenSettings={handleOpenSettings}
						onOpenExtensions={handleOpenExtensions}
					/>
				</>
			)}

		</div>
	);
};
