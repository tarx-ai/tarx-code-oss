/*---------------------------------------------------------------------------------------------
 *  TARX Cognitive Ticker — compact status strip showing live cognitive state
 *  Polls localhost:11438/v1/cognitive/state every 60s
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useEffect, useCallback } from 'react';

interface CognitiveState {
	score: number;
	focus_depth: number;
	decision_fatigue: number;
	context_switch_rate: number;
	decision_velocity: number;
	recommended_style: string;
	session_count_today: number;
	message_count_today: number;
	uptime_hours: number;
	active_project: string | null;
}

const POLL_MS = 60_000;
const TIMEOUT_MS = 3_000;
const ENDPOINT = 'http://localhost:11438/v1/cognitive/state';

// ── Mappers ─────────────────────────────────────────

function focusLabel(depth: number): { icon: string; label: string; color: string; glow: boolean } {
	if (depth >= 0.7) return { icon: '\u26A1', label: 'Deep Focus', color: '#40B6FB', glow: true };
	if (depth >= 0.35) return { icon: '\u0F34', label: 'Surface', color: '#888', glow: false };
	return { icon: '\uD83D\uDCAB', label: 'Scattered', color: '#FF326D', glow: true };
}

function fatigueLabel(fatigue: number): { icon: string; label: string; color: string } {
	if (fatigue <= 0.3) return { icon: '\uD83D\uDFE2', label: 'Fresh', color: '#4ade80' };
	if (fatigue <= 0.6) return { icon: '\uD83D\uDFE1', label: 'Moderate', color: '#facc15' };
	return { icon: '\uD83D\uDD34', label: 'Fatigued', color: '#f87171' };
}

function styleLabel(style: string): { icon: string; label: string } {
	switch (style) {
		case 'concise': return { icon: '\u2261', label: 'Concise' };
		case 'detailed': return { icon: '\u2630', label: 'Detailed' };
		case 'step-by-step': return { icon: '\u229E', label: 'Step-by-step' };
		default: return { icon: '\u2726', label: 'Exploratory' };
	}
}

// ── Styles ──────────────────────────────────────────

const containerStyle: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	height: 28,
	padding: '0 10px',
	gap: 6,
	background: '#1a1a2e',
	borderTop: '1px solid rgba(255,255,255,0.06)',
	flexShrink: 0,
	fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
	fontSize: 11,
	transition: 'all 200ms ease',
	position: 'relative' as const,
	overflow: 'hidden',
	cursor: 'default',
};

const chipStyle: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 3,
	padding: '2px 6px',
	borderRadius: 4,
	background: 'rgba(255,255,255,0.04)',
	transition: 'all 200ms ease',
	whiteSpace: 'nowrap' as const,
};

const expandedStyle: React.CSSProperties = {
	position: 'absolute' as const,
	bottom: 28,
	left: 0,
	right: 0,
	background: '#1a1a2e',
	borderTop: '1px solid rgba(255,255,255,0.08)',
	padding: '6px 10px',
	fontSize: 10,
	color: '#888',
	display: 'flex',
	gap: 12,
	transition: 'opacity 200ms ease',
	zIndex: 10,
};

// ── Component ───────────────────────────────────────

export const TarxTicker: React.FC = () => {
	const [state, setState] = useState<CognitiveState | null>(null);
	const [hovered, setHovered] = useState(false);

	const fetchState = useCallback(async () => {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
			const res = await fetch(ENDPOINT, { signal: controller.signal });
			clearTimeout(timeout);
			if (res.ok) {
				const data = await res.json();
				setState(data);
			}
		} catch {
			// Engine down — keep last state or null
		}
	}, []);

	useEffect(() => {
		fetchState();
		const id = setInterval(fetchState, POLL_MS);
		return () => clearInterval(id);
	}, [fetchState]);

	// Offline / no data
	const offline = !state;
	const focus = offline ? null : focusLabel(state.focus_depth);
	const fatigue = offline ? null : fatigueLabel(state.decision_fatigue);
	const style = offline ? null : styleLabel(state.recommended_style);

	const pulseKeyframes = `
		@keyframes tickerPulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.6; }
		}
	`;

	return (
		<div
			style={containerStyle}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<style>{pulseKeyframes}</style>

			{/* Focus chip */}
			<span style={{
				...chipStyle,
				color: focus?.color ?? '#555',
				boxShadow: focus?.glow ? `0 0 6px ${focus.color}40` : 'none',
				animation: focus?.glow ? 'tickerPulse 3s ease-in-out infinite' : 'none',
			}}>
				{focus ? `${focus.icon} ${focus.label}` : '\u2014 \u2014'}
			</span>

			{/* Fatigue chip */}
			<span style={{
				...chipStyle,
				color: fatigue?.color ?? '#555',
			}}>
				{fatigue ? `${fatigue.icon} ${fatigue.label}` : '\u2014 \u2014'}
			</span>

			{/* Style chip */}
			<span style={{
				...chipStyle,
				color: '#aaa',
			}}>
				{style ? `${style.icon} ${style.label}` : '\u2014 \u2014'}
			</span>

			{/* Hover expansion */}
			{hovered && state && (
				<div style={expandedStyle}>
					<span>{state.session_count_today} sessions today</span>
					<span>{state.message_count_today} messages</span>
					<span>ctx switches: {state.context_switch_rate}/hr</span>
					<span>{state.uptime_hours}h active</span>
				</div>
			)}
		</div>
	);
};

export default TarxTicker;
