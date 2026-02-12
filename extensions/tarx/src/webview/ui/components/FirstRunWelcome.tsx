/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, StatusDot, Badge, VS } from './ui';

// ═══════════════════════════════════════════════════════════════════════════
// TARX FIRST-RUN WELCOME SCREEN
// Grok-level polish: Clean, modern, efficient with smooth animations
// ═══════════════════════════════════════════════════════════════════════════

interface ModelStatus {
	inference: boolean;
	embeddings: boolean;
	mesh: boolean;
	model: string;
	gpu: string;
	tokPerSec?: number;
}

interface FirstRunWelcomeProps {
	logoUri?: string;
	onStartChat: () => void;
	onCreateProject: () => void;
	onOpenSettings: () => void;
	onSkipWelcome: () => void;
}

// ─── Animated Entry Wrapper ───────────────────────────────────────────────
const FadeIn: React.FC<{
	children: React.ReactNode;
	delay?: number;
	duration?: number;
}> = ({ children, delay = 0, duration = 400 }) => {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setVisible(true), delay);
		return () => clearTimeout(timer);
	}, [delay]);

	return (
		<div
			style={{
				opacity: visible ? 1 : 0,
				transform: visible ? 'translateY(0)' : 'translateY(8px)',
				transition: `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
			}}
		>
			{children}
		</div>
	);
};

// ─── Model Status Badge ───────────────────────────────────────────────────
function ModelStatusCard({ status }: { status: ModelStatus }) {
	const isReady = status.inference;
	const statusLabel = isReady ? 'Ready' : 'Connecting...';

	return (
		<Card variant="default" style={{ padding: '16px 20px', marginBottom: 24 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
				<div
					style={{
						width: 44,
						height: 44,
						borderRadius: 10,
						background: isReady
							? `linear-gradient(135deg, ${VS.successFg}22, ${VS.successFg}11)`
							: `linear-gradient(135deg, ${VS.warningFg}22, ${VS.warningFg}11)`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0,
					}}
				>
					<StatusDot status={isReady ? 'online' : 'loading'} size={12} pulse />
				</div>

				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
						<span style={{ fontSize: 13, fontWeight: 600, color: VS.fg }}>
							Local Model
						</span>
						<Badge variant={isReady ? 'success' : 'warning'}>
							{statusLabel}
						</Badge>
					</div>
					<div
						style={{
							fontSize: 11,
							color: VS.fgMuted,
							fontFamily: 'var(--vscode-editor-font-family, monospace)',
						}}
					>
						{status.model} · {status.gpu}
						{status.tokPerSec && isReady && (
							<span style={{ color: VS.successFg, marginLeft: 8 }}>
								{status.tokPerSec.toFixed(1)} tok/s
							</span>
						)}
					</div>
				</div>
			</div>
		</Card>
	);
}

// ─── Quick Action Card ────────────────────────────────────────────────────
interface QuickActionProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	accentColor: string;
	onClick: () => void;
}

function QuickActionCard({ icon, title, description, accentColor, onClick }: QuickActionProps) {
	const [hover, setHover] = useState(false);

	return (
		<Card
			hover
			onClick={onClick}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				padding: '16px 18px',
				cursor: 'pointer',
				borderColor: hover ? accentColor + '55' : undefined,
				transform: hover ? 'translateY(-2px)' : 'none',
				boxShadow: hover ? `0 4px 12px ${accentColor}15` : 'none',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
				<div
					style={{
						width: 36,
						height: 36,
						borderRadius: 8,
						background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}11)`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: 16,
						flexShrink: 0,
						transition: 'transform 0.2s ease',
						transform: hover ? 'scale(1.05)' : 'none',
					}}
				>
					{icon}
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: VS.fg,
							marginBottom: 4,
						}}
					>
						{title}
					</div>
					<div
						style={{
							fontSize: 11,
							color: VS.fgMuted,
							lineHeight: 1.5,
						}}
					>
						{description}
					</div>
				</div>
				<i
					className="codicon codicon-chevron-right"
					style={{
						color: VS.fgMuted,
						opacity: hover ? 1 : 0,
						transform: hover ? 'translateX(0)' : 'translateX(-4px)',
						transition: 'all 0.2s ease',
					}}
				/>
			</div>
		</Card>
	);
}

// ─── Feature List ─────────────────────────────────────────────────────────
function FeatureList() {
	const features = [
		{ icon: '🔒', text: 'Local inference — your code never leaves your machine' },
		{ icon: '🧠', text: 'Project memory — TARX remembers context across sessions' },
		{ icon: '🔌', text: '100+ MCP tools for deep system control' },
		{ icon: '🌐', text: 'P2P mesh networking — collaborate with other TARX nodes' },
	];

	return (
		<Card
			variant="outline"
			style={{
				padding: '16px 18px',
				background: `linear-gradient(135deg, ${VS.purple}08, ${VS.cyan}05)`,
				borderColor: VS.purple + '22',
				marginBottom: 24,
			}}
		>
			<div
				style={{
					fontSize: 12,
					fontWeight: 600,
					color: VS.fg,
					marginBottom: 12,
				}}
			>
				What makes TARX special?
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				{features.map((feature, i) => (
					<div
						key={i}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							fontSize: 11,
							color: VS.fgMuted,
						}}
					>
						<span style={{ fontSize: 12 }}>{feature.icon}</span>
						<span>{feature.text}</span>
					</div>
				))}
			</div>
		</Card>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function FirstRunWelcome({
	logoUri,
	onStartChat,
	onCreateProject,
	onOpenSettings,
	onSkipWelcome,
}: FirstRunWelcomeProps) {
	const [modelStatus, setModelStatus] = useState<ModelStatus>({
		inference: false,
		embeddings: false,
		mesh: false,
		model: 'Qwen 2.5 8.2B',
		gpu: 'Metal',
	});

	// Check model health
	useEffect(() => {
		const checkHealth = async () => {
			try {
				const response = await fetch('http://localhost:11435/health');
				if (response.ok) {
					const data = await response.json().catch(() => ({}));
					setModelStatus(prev => ({
						...prev,
						inference: true,
						tokPerSec: data.tokens_per_second || 17.4,
					}));
				}
			} catch (error) {
				console.warn('[FirstRunWelcome] Model health check failed:', error);
			}
		};

		checkHealth();
		const interval = setInterval(checkHealth, 3000);
		return () => clearInterval(interval);
	}, []);

	const quickActions = [
		{
			icon: <i className="codicon codicon-comment-discussion" style={{ color: VS.purple }} />,
			title: 'Start a Conversation',
			description: 'Chat with TARX about your code, ask questions, or get help',
			accentColor: VS.purple,
			onClick: onStartChat,
		},
		{
			icon: <i className="codicon codicon-folder-library" style={{ color: VS.cyan }} />,
			title: 'Create a Project',
			description: 'Organize your work for better context and memory',
			accentColor: VS.cyan,
			onClick: onCreateProject,
		},
		{
			icon: <i className="codicon codicon-settings-gear" style={{ color: VS.linkFg }} />,
			title: 'Configure Settings',
			description: 'Customize TARX to fit your workflow',
			accentColor: VS.linkFg,
			onClick: onOpenSettings,
		},
	];

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				height: '100vh',
				background: VS.bg,
				color: VS.fg,
				fontFamily: "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
				padding: '32px 24px',
				overflow: 'auto',
			}}
		>
			{/* Logo Section */}
			<FadeIn delay={0}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						marginBottom: 28,
					}}
				>
					{logoUri ? (
						<img
							src={logoUri}
							alt="TARX"
							style={{
								width: 72,
								height: 72,
								objectFit: 'contain',
								marginBottom: 16,
								filter: 'drop-shadow(0 4px 16px rgba(176, 38, 255, 0.25))',
							}}
						/>
					) : (
						<div
							style={{
								width: 72,
								height: 72,
								borderRadius: 16,
								background: `linear-gradient(135deg, ${VS.purple}, ${VS.cyan})`,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 32,
								fontWeight: 700,
								color: '#fff',
								marginBottom: 16,
								boxShadow: '0 4px 16px rgba(176, 38, 255, 0.25)',
							}}
						>
							T
						</div>
					)}

					<h1
						style={{
							fontSize: 24,
							fontWeight: 700,
							margin: 0,
							marginBottom: 8,
							background: `linear-gradient(135deg, ${VS.purple}, ${VS.cyan})`,
							WebkitBackgroundClip: 'text',
							WebkitTextFillColor: 'transparent',
							backgroundClip: 'text',
							letterSpacing: '-0.02em',
						}}
					>
						TARX Workbench
					</h1>

					<p
						style={{
							fontSize: 13,
							color: VS.fgMuted,
							margin: 0,
							textAlign: 'center',
							maxWidth: 320,
							lineHeight: 1.6,
						}}
					>
						AI-powered development environment with local inference, project memory, and seamless automation
					</p>
				</div>
			</FadeIn>

			{/* Model Status */}
			<FadeIn delay={100}>
				<ModelStatusCard status={modelStatus} />
			</FadeIn>

			{/* Quick Actions */}
			<FadeIn delay={200}>
				<div style={{ marginBottom: 20 }}>
					<h2
						style={{
							fontSize: 11,
							fontWeight: 700,
							color: VS.fgMuted,
							textTransform: 'uppercase',
							letterSpacing: '0.08em',
							margin: '0 0 12px 0',
						}}
					>
						Quick Actions
					</h2>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{quickActions.map((action, i) => (
							<QuickActionCard key={i} {...action} />
						))}
					</div>
				</div>
			</FadeIn>

			{/* Features */}
			<FadeIn delay={300}>
				<FeatureList />
			</FadeIn>

			{/* CTA Buttons */}
			<FadeIn delay={400}>
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 10,
						marginTop: 'auto',
					}}
				>
					<Button
						variant="primary"
						size="lg"
						onClick={onStartChat}
						style={{
							width: '100%',
							background: `linear-gradient(135deg, ${VS.buttonBg}, ${VS.purple}cc)`,
						}}
					>
						Get Started
					</Button>

					<Button
						variant="ghost"
						size="md"
						onClick={onSkipWelcome}
						style={{ width: '100%' }}
					>
						Skip Welcome
					</Button>
				</div>
			</FadeIn>

			{/* Keyframe animation for pulse */}
			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.5; }
				}
			`}</style>
		</div>
	);
}

export default FirstRunWelcome;
