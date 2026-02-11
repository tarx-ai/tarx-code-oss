/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react';
import { postMessage } from '../hooks/useVSCodeAPI';
import type { TarxSettings, ConnectionTestResult, ProviderConnectionStatus } from '../types';
import { BillingSection } from './BillingSection';

interface SettingsViewProps {
	onBack: () => void;
	settings: TarxSettings | null;
	onSettingsChange: (settings: Partial<TarxSettings>) => void;
}

// Status indicator component
const StatusDot: React.FC<{ status: ProviderConnectionStatus | 'connected' | 'disconnected' }> = ({ status }) => {
	let className = 'tarx-settings-status-dot';
	if (status === 'connected') {
		className += ' connected';
	} else if (status === 'error') {
		className += ' error';
	} else if (status === 'not_configured' || status === 'disconnected') {
		className += ' not-configured';
	}
	return <span className={className} />;
};

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack, settings, onSettingsChange }) => {
	// Local state for form inputs
	const [apiKey, setApiKey] = useState('');
	const [showApiKey, setShowApiKey] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [showClearConfirm, setShowClearConfirm] = useState(false);

	// Request settings on mount
	useEffect(() => {
		postMessage({ command: 'getSettings' });
	}, []);

	// Handle save API key
	const handleSaveApiKey = useCallback(() => {
		if (!apiKey || apiKey.length < 10) {
			setSaveError('Please enter a valid API key');
			return;
		}
		if (!apiKey.startsWith('sk-ant-')) {
			setSaveError('API key should start with "sk-ant-"');
			return;
		}
		setIsSaving(true);
		setSaveError(null);
		postMessage({ command: 'saveClaudeApiKey', key: apiKey });
	}, [apiKey]);

	// Handle test connection
	const handleTestConnection = useCallback(() => {
		setIsTesting(true);
		setTestResult(null);
		postMessage({ command: 'testClaudeConnection' });
	}, []);

	// Handle delete API key
	const handleDeleteApiKey = useCallback(() => {
		postMessage({ command: 'deleteClaudeApiKey' });
		setApiKey('');
		setTestResult(null);
	}, []);

	// Handle memory toggle
	const handleMemoryToggle = useCallback((enabled: boolean) => {
		postMessage({ command: 'setMemoryEnabled', enabled });
		onSettingsChange({ memoryEnabled: enabled });
	}, [onSettingsChange]);

	// Handle thread conversations toggle
	const handleThreadToggle = useCallback((enabled: boolean) => {
		postMessage({ command: 'setThreadConversations', enabled });
		onSettingsChange({ threadConversations: enabled });
	}, [onSettingsChange]);

	// Handle clear memory
	const handleClearMemory = useCallback(() => {
		postMessage({ command: 'clearMemory' });
		setShowClearConfirm(false);
	}, []);

	// Listen for settings responses
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data;
			switch (message.command) {
				case 'apiKeySaved':
					setIsSaving(false);
					if (message.success) {
						setApiKey('');
						setSaveError(null);
					} else {
						setSaveError(message.error || 'Failed to save API key');
					}
					break;
				case 'connectionTestResult':
					setIsTesting(false);
					setTestResult(message.result);
					break;
				case 'apiKeyDeleted':
					// Handled by settings refresh
					break;
			}
		};
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	return (
		<div className="tarx-settings-view">
			{/* Header with back button */}
			<div className="tarx-settings-header">
				<button
					className="tarx-settings-back-btn"
					onClick={onBack}
					title="Back to sidebar"
				>
					<span className="codicon codicon-arrow-left" />
				</button>
				<h2 className="tarx-settings-title">Settings</h2>
			</div>

			<div className="tarx-settings-content">
				{/* AI Providers Section */}
				<section className="tarx-settings-section">
					<h3 className="tarx-settings-section-title">AI Providers</h3>

					{/* Claude API */}
					<div className="tarx-settings-group">
						<div className="tarx-settings-group-header">
							<span className="tarx-settings-group-label">Claude API</span>
							<StatusDot status={settings?.claudeConnectionStatus || 'not_configured'} />
						</div>

						{/* API Key Input */}
						<div className="tarx-settings-field">
							<label className="tarx-settings-label">API Key</label>
							<div className="tarx-settings-input-row">
								<input
									type={showApiKey ? 'text' : 'password'}
									className="tarx-settings-input"
									placeholder={settings?.claudeApiKeyConfigured ? '••••••••••••••••' : 'sk-ant-...'}
									value={apiKey}
									onChange={(e) => {
										setApiKey(e.target.value);
										setSaveError(null);
									}}
								/>
								<button
									className="tarx-settings-icon-btn"
									onClick={() => setShowApiKey(!showApiKey)}
									title={showApiKey ? 'Hide' : 'Show'}
								>
									<span className={`codicon codicon-${showApiKey ? 'eye-closed' : 'eye'}`} />
								</button>
							</div>
							{saveError && <span className="tarx-settings-error">{saveError}</span>}
						</div>

						{/* Model Selector */}
						<div className="tarx-settings-field">
							<label className="tarx-settings-label">Model</label>
							<select
								className="tarx-settings-select"
								value={settings?.claudeModel || 'claude-sonnet-4-20250514'}
								disabled
							>
								<option value="claude-sonnet-4-20250514">claude-sonnet-4-20250514</option>
								<option value="claude-opus-4-20250514">claude-opus-4-20250514</option>
							</select>
						</div>

						{/* Action Buttons */}
						<div className="tarx-settings-actions">
							<button
								className="tarx-settings-btn primary"
								onClick={handleSaveApiKey}
								disabled={isSaving || !apiKey}
							>
								{isSaving ? 'Saving...' : 'Save'}
							</button>
							<button
								className="tarx-settings-btn"
								onClick={handleTestConnection}
								disabled={isTesting || !settings?.claudeApiKeyConfigured}
							>
								{isTesting ? 'Testing...' : 'Test Connection'}
							</button>
							{settings?.claudeApiKeyConfigured && (
								<button
									className="tarx-settings-btn danger"
									onClick={handleDeleteApiKey}
								>
									Remove Key
								</button>
							)}
						</div>

						{/* Test Result */}
						{testResult && (
							<div className={`tarx-settings-test-result ${testResult.success ? 'success' : 'error'}`}>
								{testResult.success
									? `Connected to ${testResult.model}`
									: `Error: ${testResult.error}`
								}
							</div>
						)}
					</div>

					{/* Local Model (read-only) */}
					<div className="tarx-settings-group">
						<div className="tarx-settings-group-header">
							<span className="tarx-settings-group-label">Local Model</span>
							<StatusDot status={settings?.localModelStatus || 'disconnected'} />
						</div>

						<div className="tarx-settings-readonly">
							<div className="tarx-settings-readonly-row">
								<span className="tarx-settings-readonly-label">Model:</span>
								<span className="tarx-settings-readonly-value">{settings?.localModelName || 'Qwen 2.5 Coder 8B'}</span>
							</div>
							<div className="tarx-settings-readonly-row">
								<span className="tarx-settings-readonly-label">Port:</span>
								<span className="tarx-settings-readonly-value">{settings?.localModelPort || 11435}</span>
							</div>
							<div className="tarx-settings-readonly-row">
								<span className="tarx-settings-readonly-label">Status:</span>
								<span className={`tarx-settings-readonly-value ${settings?.localModelStatus === 'connected' ? 'connected' : 'disconnected'}`}>
									{settings?.localModelStatus === 'connected' ? 'Connected' : 'Disconnected'}
								</span>
							</div>
						</div>
					</div>
				</section>

				{/* Billing Section */}
				<BillingSection billing={settings?.billing ?? null} />

				{/* Memory Section */}
				<section className="tarx-settings-section">
					<h3 className="tarx-settings-section-title">Memory</h3>

					<div className="tarx-settings-toggle-row">
						<div className="tarx-settings-toggle-info">
							<span className="tarx-settings-toggle-label">Enable persistent memory</span>
							<span className="tarx-settings-toggle-desc">Remember context across sessions</span>
						</div>
						<label className="tarx-settings-toggle">
							<input
								type="checkbox"
								checked={settings?.memoryEnabled ?? true}
								onChange={(e) => handleMemoryToggle(e.target.checked)}
							/>
							<span className="tarx-settings-toggle-slider" />
						</label>
					</div>

					<div className="tarx-settings-toggle-row">
						<div className="tarx-settings-toggle-info">
							<span className="tarx-settings-toggle-label">Thread conversations to memory</span>
							<span className="tarx-settings-toggle-desc">Store conversation context for future reference</span>
						</div>
						<label className="tarx-settings-toggle">
							<input
								type="checkbox"
								checked={settings?.threadConversations ?? true}
								onChange={(e) => handleThreadToggle(e.target.checked)}
							/>
							<span className="tarx-settings-toggle-slider" />
						</label>
					</div>

					{/* Clear Memory */}
					<div className="tarx-settings-clear-memory">
						{showClearConfirm ? (
							<div className="tarx-settings-confirm">
								<span>Are you sure? This cannot be undone.</span>
								<div className="tarx-settings-confirm-actions">
									<button
										className="tarx-settings-btn danger"
										onClick={handleClearMemory}
									>
										Yes, Clear
									</button>
									<button
										className="tarx-settings-btn"
										onClick={() => setShowClearConfirm(false)}
									>
										Cancel
									</button>
								</div>
							</div>
						) : (
							<button
								className="tarx-settings-btn danger-outline"
								onClick={() => setShowClearConfirm(true)}
							>
								<span className="codicon codicon-trash" />
								Clear All Memory
							</button>
						)}
					</div>
				</section>

				{/* About Section */}
				<section className="tarx-settings-section">
					<h3 className="tarx-settings-section-title">About</h3>

					<div className="tarx-settings-about">
						<div className="tarx-settings-about-row">
							<span className="tarx-settings-about-label">Version:</span>
							<span className="tarx-settings-about-value">1.0.0</span>
						</div>
						<div className="tarx-settings-about-links">
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault();
									postMessage({ command: 'openView', viewId: 'tarx.documentation' });
								}}
							>
								Documentation
							</a>
							<span className="tarx-settings-link-sep">|</span>
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault();
									postMessage({ command: 'openView', viewId: 'tarx.feedback' });
								}}
							>
								Send Feedback
							</a>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
};
