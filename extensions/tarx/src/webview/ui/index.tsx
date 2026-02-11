/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { postMessage } from './hooks/useVSCodeAPI';

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// Catches React rendering errors and reports them to the extension
// ═══════════════════════════════════════════════════════════════════════════════

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
}

class TarxErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
	constructor(props: { children: React.ReactNode }) {
		super(props);
		this.state = { hasError: false, error: null, errorInfo: null };
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
		this.setState({ errorInfo });

		// Report error to extension for QA logging
		postMessage({
			command: 'webviewError',
			error: error.message,
			stack: error.stack,
			componentStack: errorInfo.componentStack
		});

		// Also log to console for debugging
		console.error('[TARX ERROR BOUNDARY]', error, errorInfo);
	}

	handleRetry = (): void => {
		this.setState({ hasError: false, error: null, errorInfo: null });
	};

	render(): React.ReactNode {
		if (this.state.hasError) {
			return (
				<div className="tarx-error-boundary">
					<div className="tarx-error-content">
						<span className="codicon codicon-error tarx-error-icon" />
						<h2>Something went wrong</h2>
						<p className="tarx-error-message">
							{this.state.error?.message || 'An unexpected error occurred'}
						</p>
						<button className="tarx-error-retry-btn" onClick={this.handleRetry}>
							<span className="codicon codicon-refresh" />
							Retry
						</button>
						{this.state.error?.stack && (
							<details className="tarx-error-details">
								<summary>Technical Details</summary>
								<pre>{this.state.error.stack}</pre>
							</details>
						)}
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOUNT APPLICATION
// ═══════════════════════════════════════════════════════════════════════════════

// Get the root element
const rootElement = document.getElementById('root');
if (!rootElement) {
	throw new Error('Root element not found');
}

// Get asset URIs from data attributes
const logoUri = rootElement.dataset.logoUri || '';
const eyesUri = rootElement.dataset.eyesUri || '';

// Create React root and render with error boundary
const root = createRoot(rootElement);
root.render(
	<React.StrictMode>
		<TarxErrorBoundary>
			<App logoUri={logoUri} eyesUri={eyesUri} />
		</TarxErrorBoundary>
	</React.StrictMode>
);
