/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Input, Card, VS } from './ui';

// ═══════════════════════════════════════════════════════════════════════════
// PIN MODAL - Unbreakable PIN input for app lockout
// Glassmorphism overlay with centered modal - no close button
// ═══════════════════════════════════════════════════════════════════════════

interface PINModalProps {
	mode: 'create' | 'verify';
	onSubmit: (pin: string) => void;
	onError?: (error: string) => void;
	logoUri?: string;
	externalError?: string | null;
}

export const PINModal: React.FC<PINModalProps> = ({
	mode,
	onSubmit,
	onError,
	logoUri,
	externalError,
}) => {
	const [pin, setPin] = useState('');
	const [confirmPin, setConfirmPin] = useState('');
	const [localError, setLocalError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Combine local and external errors
	const error = externalError || localError;

	// Reset submitting state when external error arrives
	useEffect(() => {
		if (externalError) {
			setIsSubmitting(false);
		}
	}, [externalError]);

	// Focus input on mount
	useEffect(() => {
		setTimeout(() => inputRef.current?.focus(), 100);
	}, []);

	const validatePin = useCallback((value: string): boolean => {
		return /^\d{6}$/.test(value);
	}, []);

	const handlePinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.replace(/\D/g, '').slice(0, 6);
		setPin(value);
		setLocalError('');
	}, []);

	const handleConfirmPinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value.replace(/\D/g, '').slice(0, 6);
		setConfirmPin(value);
		setLocalError('');
	}, []);

	const handleSubmit = useCallback(() => {
		try {
			console.log('[PINModal] Submit clicked, mode:', mode);

			if (!validatePin(pin)) {
				setLocalError('PIN must be exactly 6 digits');
				return;
			}

			if (mode === 'create') {
				if (pin !== confirmPin) {
					setLocalError('PINs do not match');
					return;
				}
			}

			setIsSubmitting(true);
			console.log('[PINModal] Submitting PIN');
			onSubmit(pin);
		} catch (e) {
			console.error('[PINModal] Submit error:', e);
			setLocalError('An error occurred. Please try again.');
			setIsSubmitting(false);
			onError?.(e instanceof Error ? e.message : String(e));
		}
	}, [pin, confirmPin, mode, validatePin, onSubmit, onError]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && validatePin(pin)) {
			if (mode === 'create' && pin !== confirmPin) {
				setLocalError('PINs do not match');
				return;
			}
			handleSubmit();
		}
	}, [pin, confirmPin, mode, validatePin, handleSubmit]);

	const isValid = mode === 'create'
		? validatePin(pin) && pin === confirmPin
		: validatePin(pin);

	return (
		<div
			className="tarx-glass-overlay"
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				width: '100vw',
				height: '100vh',
				backdropFilter: 'blur(20px)',
				WebkitBackdropFilter: 'blur(20px)',
				background: 'rgba(0, 0, 0, 0.85)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 99999,
			}}
		>
			<Card
				variant="elevated"
				style={{
					width: '100%',
					maxWidth: 360,
					padding: 32,
					background: VS.cardBg,
					border: `1px solid ${VS.border}`,
					borderRadius: 12,
					boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
				}}
			>
				{/* Logo */}
				<div style={{ textAlign: 'center', marginBottom: 24 }}>
					{logoUri ? (
						<img
							src={logoUri}
							alt="TARX"
							style={{
								width: 56,
								height: 56,
								marginBottom: 16,
								filter: 'drop-shadow(0 4px 12px rgba(176, 38, 255, 0.3))',
							}}
						/>
					) : (
						<div
							style={{
								width: 56,
								height: 56,
								borderRadius: 12,
								background: `linear-gradient(135deg, ${VS.purple}, ${VS.cyan})`,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 24,
								fontWeight: 700,
								color: '#fff',
								margin: '0 auto 16px',
								boxShadow: '0 4px 12px rgba(176, 38, 255, 0.3)',
							}}
						>
							T
						</div>
					)}

					<h2
						style={{
							fontSize: 18,
							fontWeight: 600,
							color: VS.fg,
							margin: '0 0 8px',
						}}
					>
						{mode === 'create' ? 'Create Your PIN' : 'Enter Your PIN'}
					</h2>

					<p
						style={{
							fontSize: 12,
							color: VS.fgMuted,
							margin: 0,
							lineHeight: 1.5,
						}}
					>
						{mode === 'create'
							? 'Create a 6-digit PIN to protect your TARX data. Stored locally only.'
							: 'Enter your 6-digit PIN to unlock TARX.'}
					</p>
				</div>

				{/* PIN Input */}
				<div style={{ marginBottom: mode === 'create' ? 16 : 24 }}>
					<label
						style={{
							display: 'block',
							fontSize: 11,
							fontWeight: 600,
							color: VS.fgMuted,
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							marginBottom: 8,
						}}
					>
						{mode === 'create' ? 'New PIN' : 'PIN'}
					</label>
					<input
						ref={inputRef}
						type="password"
						inputMode="numeric"
						pattern="[0-9]*"
						maxLength={6}
						value={pin}
						onChange={handlePinChange}
						onKeyDown={handleKeyDown}
						placeholder="••••••"
						autoComplete="off"
						style={{
							width: '100%',
							padding: '12px 16px',
							fontSize: 20,
							fontFamily: 'monospace',
							letterSpacing: 8,
							textAlign: 'center',
							background: VS.inputBg,
							border: `1px solid ${error ? VS.errorFg : VS.border}`,
							borderRadius: 8,
							color: VS.fg,
							outline: 'none',
							transition: 'border-color 0.15s ease',
						}}
					/>
				</div>

				{/* Confirm PIN (create mode only) */}
				{mode === 'create' && (
					<div style={{ marginBottom: 24 }}>
						<label
							style={{
								display: 'block',
								fontSize: 11,
								fontWeight: 600,
								color: VS.fgMuted,
								textTransform: 'uppercase',
								letterSpacing: '0.05em',
								marginBottom: 8,
							}}
						>
							Confirm PIN
						</label>
						<input
							type="password"
							inputMode="numeric"
							pattern="[0-9]*"
							maxLength={6}
							value={confirmPin}
							onChange={handleConfirmPinChange}
							onKeyDown={handleKeyDown}
							placeholder="••••••"
							autoComplete="off"
							style={{
								width: '100%',
								padding: '12px 16px',
								fontSize: 20,
								fontFamily: 'monospace',
								letterSpacing: 8,
								textAlign: 'center',
								background: VS.inputBg,
								border: `1px solid ${error ? VS.errorFg : VS.border}`,
								borderRadius: 8,
								color: VS.fg,
								outline: 'none',
								transition: 'border-color 0.15s ease',
							}}
						/>
					</div>
				)}

				{/* Error Message */}
				{error && (
					<div
						style={{
							padding: '10px 14px',
							marginBottom: 16,
							background: `${VS.errorFg}15`,
							border: `1px solid ${VS.errorFg}33`,
							borderRadius: 6,
							fontSize: 12,
							color: VS.errorFg,
							textAlign: 'center',
						}}
					>
						{error}
					</div>
				)}

				{/* Submit Button */}
				<Button
					variant="primary"
					size="lg"
					onClick={handleSubmit}
					disabled={!isValid || isSubmitting}
					loading={isSubmitting}
					style={{
						width: '100%',
						background: isValid
							? `linear-gradient(135deg, ${VS.buttonBg}, ${VS.purple}cc)`
							: VS.buttonSecBg,
					}}
				>
					{mode === 'create' ? 'Create PIN & Continue' : 'Unlock TARX'}
				</Button>

				{/* Security Note */}
				<p
					style={{
						fontSize: 10,
						color: VS.fgMuted,
						textAlign: 'center',
						marginTop: 16,
						marginBottom: 0,
						opacity: 0.7,
					}}
				>
					🔒 Your PIN is hashed and stored locally. Never transmitted.
				</p>
			</Card>
		</div>
	);
};

export default PINModal;
