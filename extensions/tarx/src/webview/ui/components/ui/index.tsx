/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback, forwardRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// SHADCN-INSPIRED UI COMPONENTS
// Polished, modern components using VS Code CSS variables for theming
// ═══════════════════════════════════════════════════════════════════════════

// VS Code themed colors
const VS = {
	bg: 'var(--vscode-editor-background, #1e1e1e)',
	fg: 'var(--vscode-foreground, #cccccc)',
	fgMuted: 'var(--vscode-descriptionForeground, #858585)',
	border: 'var(--vscode-panel-border, #2d2d2d)',
	cardBg: 'var(--vscode-sideBar-background, #252526)',
	inputBg: 'var(--vscode-input-background, #3c3c3c)',
	inputBorder: 'var(--vscode-input-border, #3c3c3c)',
	inputFocus: 'var(--vscode-focusBorder, #007fd4)',
	buttonBg: 'var(--vscode-button-background, #0e639c)',
	buttonFg: 'var(--vscode-button-foreground, #ffffff)',
	buttonHover: 'var(--vscode-button-hoverBackground, #1177bb)',
	buttonSecBg: 'var(--vscode-button-secondaryBackground, #3a3d41)',
	buttonSecFg: 'var(--vscode-button-secondaryForeground, #cccccc)',
	successFg: 'var(--vscode-testing-iconPassed, #73c991)',
	errorFg: 'var(--vscode-testing-iconFailed, #f14c4c)',
	warningFg: 'var(--vscode-editorWarning-foreground, #cca700)',
	linkFg: 'var(--vscode-textLink-foreground, #3794ff)',
	listHover: 'var(--vscode-list-hoverBackground, #2a2d2e)',
	listActive: 'var(--vscode-list-activeSelectionBackground, #094771)',
	purple: '#B026FF',
	cyan: '#00F0FF',
};

// ─── Button ───────────────────────────────────────────────────────────────
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
	size?: 'sm' | 'md' | 'lg';
	loading?: boolean;
	icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
	variant = 'primary',
	size = 'md',
	loading = false,
	icon,
	children,
	disabled,
	style,
	...props
}, ref) => {
	const [hover, setHover] = useState(false);

	const baseStyles: React.CSSProperties = {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		fontFamily: 'var(--vscode-font-family, -apple-system, sans-serif)',
		fontWeight: 500,
		border: 'none',
		borderRadius: 4,
		cursor: disabled || loading ? 'not-allowed' : 'pointer',
		transition: 'all 0.15s ease',
		opacity: disabled || loading ? 0.6 : 1,
		outline: 'none',
	};

	const sizeStyles: Record<string, React.CSSProperties> = {
		sm: { padding: '4px 10px', fontSize: 11 },
		md: { padding: '6px 14px', fontSize: 12 },
		lg: { padding: '10px 20px', fontSize: 13 },
	};

	const variantStyles: Record<string, React.CSSProperties> = {
		primary: {
			background: hover ? VS.buttonHover : VS.buttonBg,
			color: VS.buttonFg,
		},
		secondary: {
			background: hover ? VS.listHover : VS.buttonSecBg,
			color: VS.buttonSecFg,
		},
		ghost: {
			background: hover ? VS.listHover : 'transparent',
			color: VS.fg,
		},
		destructive: {
			background: hover ? '#c73939' : '#d93939',
			color: '#fff',
		},
	};

	return (
		<button
			ref={ref}
			disabled={disabled || loading}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{ ...baseStyles, ...sizeStyles[size], ...variantStyles[variant], ...style }}
			{...props}
		>
			{loading ? (
				<span style={{ animation: 'spin 1s linear infinite' }}>⟳</span>
			) : icon}
			{children}
		</button>
	);
});
Button.displayName = 'Button';

// ─── Input ────────────────────────────────────────────────────────────────
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	icon?: React.ReactNode;
	error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
	icon,
	error,
	style,
	...props
}, ref) => {
	const [focused, setFocused] = useState(false);

	return (
		<div style={{
			display: 'flex',
			alignItems: 'center',
			gap: 8,
			padding: '6px 10px',
			background: VS.inputBg,
			border: `1px solid ${error ? VS.errorFg : focused ? VS.inputFocus : VS.inputBorder}`,
			borderRadius: 4,
			transition: 'border-color 0.15s ease',
		}}>
			{icon && (
				<span style={{ color: VS.fgMuted, display: 'flex', alignItems: 'center' }}>
					{icon}
				</span>
			)}
			<input
				ref={ref}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				style={{
					flex: 1,
					background: 'transparent',
					border: 'none',
					outline: 'none',
					color: VS.fg,
					fontSize: 12,
					fontFamily: 'var(--vscode-font-family, -apple-system, sans-serif)',
					...style,
				}}
				{...props}
			/>
		</div>
	);
});
Input.displayName = 'Input';

// ─── Card ─────────────────────────────────────────────────────────────────
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: 'default' | 'elevated' | 'outline';
	hover?: boolean;
	active?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({
	variant = 'default',
	hover: hoverEnabled = false,
	active = false,
	children,
	style,
	...props
}, ref) => {
	const [hover, setHover] = useState(false);

	const variantStyles: Record<string, React.CSSProperties> = {
		default: {
			background: VS.cardBg,
			border: `1px solid ${VS.border}`,
		},
		elevated: {
			background: VS.cardBg,
			border: `1px solid ${VS.border}`,
			boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
		},
		outline: {
			background: 'transparent',
			border: `1px solid ${VS.border}`,
		},
	};

	return (
		<div
			ref={ref}
			onMouseEnter={() => hoverEnabled && setHover(true)}
			onMouseLeave={() => hoverEnabled && setHover(false)}
			style={{
				borderRadius: 6,
				transition: 'all 0.15s ease',
				...variantStyles[variant],
				...(hoverEnabled && hover ? { background: VS.listHover, borderColor: VS.inputFocus + '44' } : {}),
				...(active ? { background: VS.listActive, borderColor: VS.inputFocus } : {}),
				...style,
			}}
			{...props}
		>
			{children}
		</div>
	);
});
Card.displayName = 'Card';

// ─── Collapsible ──────────────────────────────────────────────────────────
export interface CollapsibleProps {
	trigger: React.ReactNode;
	children: React.ReactNode;
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export const Collapsible: React.FC<CollapsibleProps> = ({
	trigger,
	children,
	defaultOpen = false,
	open: controlledOpen,
	onOpenChange,
}) => {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

	const handleToggle = useCallback(() => {
		const newOpen = !isOpen;
		if (controlledOpen === undefined) {
			setInternalOpen(newOpen);
		}
		onOpenChange?.(newOpen);
	}, [isOpen, controlledOpen, onOpenChange]);

	return (
		<div>
			<div onClick={handleToggle} style={{ cursor: 'pointer' }}>
				{trigger}
			</div>
			<div style={{
				overflow: 'hidden',
				maxHeight: isOpen ? '1000px' : '0',
				opacity: isOpen ? 1 : 0,
				transition: 'all 0.2s ease-out',
			}}>
				{children}
			</div>
		</div>
	);
};

// ─── Badge ────────────────────────────────────────────────────────────────
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
	variant?: 'default' | 'success' | 'warning' | 'error' | 'purple';
}

export const Badge: React.FC<BadgeProps> = ({
	variant = 'default',
	children,
	style,
	...props
}) => {
	const variantStyles: Record<string, React.CSSProperties> = {
		default: { background: VS.buttonSecBg, color: VS.fg },
		success: { background: VS.successFg + '22', color: VS.successFg },
		warning: { background: VS.warningFg + '22', color: VS.warningFg },
		error: { background: VS.errorFg + '22', color: VS.errorFg },
		purple: { background: VS.purple + '22', color: VS.purple },
	};

	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				padding: '2px 8px',
				fontSize: 10,
				fontWeight: 600,
				borderRadius: 10,
				...variantStyles[variant],
				...style,
			}}
			{...props}
		>
			{children}
		</span>
	);
};

// ─── Spinner ──────────────────────────────────────────────────────────────
export const Spinner: React.FC<{ size?: number; color?: string }> = ({
	size = 16,
	color = VS.fg,
}) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		style={{ animation: 'spin 1s linear infinite' }}
	>
		<circle
			cx="12"
			cy="12"
			r="10"
			stroke={color}
			strokeWidth="3"
			strokeOpacity="0.25"
		/>
		<path
			d="M12 2a10 10 0 0 1 10 10"
			stroke={color}
			strokeWidth="3"
			strokeLinecap="round"
		/>
		<style>{`
			@keyframes spin {
				to { transform: rotate(360deg); }
			}
		`}</style>
	</svg>
);

// ─── Status Dot ───────────────────────────────────────────────────────────
export const StatusDot: React.FC<{
	status: 'online' | 'offline' | 'loading';
	size?: number;
	pulse?: boolean;
}> = ({ status, size = 8, pulse = true }) => {
	const colors = {
		online: VS.successFg,
		offline: VS.errorFg,
		loading: VS.warningFg,
	};

	return (
		<span
			style={{
				width: size,
				height: size,
				borderRadius: '50%',
				background: colors[status],
				boxShadow: status === 'online' && pulse ? `0 0 8px ${colors[status]}` : 'none',
				animation: status === 'loading' ? 'pulse 1.5s ease-in-out infinite' :
				           (status === 'online' && pulse ? 'pulse 2s ease-in-out infinite' : 'none'),
				display: 'inline-block',
				flexShrink: 0,
			}}
		/>
	);
};

// ─── Separator ────────────────────────────────────────────────────────────
export const Separator: React.FC<{ vertical?: boolean }> = ({ vertical = false }) => (
	<div
		style={{
			background: VS.border,
			...(vertical
				? { width: 1, alignSelf: 'stretch' }
				: { height: 1, width: '100%' }),
		}}
	/>
);

// ─── SearchInput ──────────────────────────────────────────────────────────
export interface SearchInputProps extends Omit<InputProps, 'icon'> {
	onSearch?: (query: string) => void;
	loading?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({
	onSearch,
	loading,
	onKeyDown,
	...props
}, ref) => {
	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter' && onSearch) {
			onSearch((e.target as HTMLInputElement).value);
		}
		onKeyDown?.(e);
	}, [onSearch, onKeyDown]);

	return (
		<Input
			ref={ref}
			icon={loading ? <Spinner size={14} /> : <i className="codicon codicon-search" style={{ fontSize: 14 }} />}
			onKeyDown={handleKeyDown}
			{...props}
		/>
	);
});
SearchInput.displayName = 'SearchInput';

// ─── Dialog ───────────────────────────────────────────────────────────────
export interface DialogProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	description?: string;
	children: React.ReactNode;
	showCloseButton?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
	open,
	onClose,
	title,
	description,
	children,
	showCloseButton = true,
}) => {
	if (!open) return null;

	return (
		<div
			className="tarx-dialog-overlay"
			style={{
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: 'rgba(0, 0, 0, 0.6)',
				backdropFilter: 'blur(4px)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 99999,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="tarx-dialog"
				style={{
					background: VS.cardBg,
					border: `1px solid ${VS.border}`,
					borderRadius: 8,
					minWidth: 320,
					maxWidth: 480,
					boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
					animation: 'dialogIn 0.15s ease-out',
				}}
			>
				{(title || showCloseButton) && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							padding: '12px 16px',
							borderBottom: `1px solid ${VS.border}`,
						}}
					>
						<div>
							{title && (
								<h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: VS.fg }}>
									{title}
								</h3>
							)}
							{description && (
								<p style={{ margin: '4px 0 0', fontSize: 12, color: VS.fgMuted }}>
									{description}
								</p>
							)}
						</div>
						{showCloseButton && (
							<button
								onClick={onClose}
								style={{
									background: 'transparent',
									border: 'none',
									color: VS.fgMuted,
									cursor: 'pointer',
									padding: 4,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<i className="codicon codicon-close" style={{ fontSize: 16 }} />
							</button>
						)}
					</div>
				)}
				<div style={{ padding: 16 }}>{children}</div>
			</div>
			<style>{`
				@keyframes dialogIn {
					from { opacity: 0; transform: scale(0.95); }
					to { opacity: 1; transform: scale(1); }
				}
			`}</style>
		</div>
	);
};

// ─── Accordion ────────────────────────────────────────────────────────────
export interface AccordionItemData {
	id: string;
	trigger: React.ReactNode;
	content: React.ReactNode;
}

export interface AccordionProps {
	items: AccordionItemData[];
	type?: 'single' | 'multiple';
	defaultValue?: string | string[];
	className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({
	items,
	type = 'single',
	defaultValue,
	className,
}) => {
	const [openItems, setOpenItems] = useState<Set<string>>(() => {
		if (defaultValue) {
			return new Set(Array.isArray(defaultValue) ? defaultValue : [defaultValue]);
		}
		return new Set();
	});

	const toggleItem = useCallback((id: string) => {
		setOpenItems(prev => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				if (type === 'single') {
					next.clear();
				}
				next.add(id);
			}
			return next;
		});
	}, [type]);

	return (
		<div className={`tarx-accordion ${className || ''}`}>
			{items.map(item => (
				<div
					key={item.id}
					className="tarx-accordion-item"
					style={{
						borderBottom: `1px solid ${VS.border}`,
					}}
				>
					<div
						className="tarx-accordion-trigger"
						onClick={() => toggleItem(item.id)}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							padding: '10px 12px',
							cursor: 'pointer',
							userSelect: 'none',
							transition: 'background 0.1s ease',
						}}
						onMouseEnter={(e) => {
							(e.currentTarget as HTMLDivElement).style.background = VS.listHover;
						}}
						onMouseLeave={(e) => {
							(e.currentTarget as HTMLDivElement).style.background = 'transparent';
						}}
					>
						<span style={{ flex: 1 }}>{item.trigger}</span>
						<i
							className={`codicon codicon-chevron-${openItems.has(item.id) ? 'down' : 'right'}`}
							style={{
								fontSize: 14,
								color: VS.fgMuted,
								transition: 'transform 0.15s ease',
							}}
						/>
					</div>
					<div
						className="tarx-accordion-content"
						style={{
							overflow: 'hidden',
							maxHeight: openItems.has(item.id) ? '1000px' : '0',
							opacity: openItems.has(item.id) ? 1 : 0,
							transition: 'all 0.2s ease-out',
							padding: openItems.has(item.id) ? '0 12px 12px' : '0 12px',
						}}
					>
						{item.content}
					</div>
				</div>
			))}
		</div>
	);
};

// ─── IconButton ───────────────────────────────────────────────────────────
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon: string;
	size?: 'sm' | 'md' | 'lg';
	variant?: 'ghost' | 'default';
	tooltip?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
	icon,
	size = 'md',
	variant = 'ghost',
	tooltip,
	disabled,
	style,
	...props
}, ref) => {
	const [hover, setHover] = useState(false);

	const sizeMap = { sm: 20, md: 28, lg: 36 };
	const iconSizeMap = { sm: 12, md: 14, lg: 16 };
	const dim = sizeMap[size];
	const iconSize = iconSizeMap[size];

	return (
		<button
			ref={ref}
			title={tooltip}
			disabled={disabled}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				width: dim,
				height: dim,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				background: variant === 'ghost'
					? (hover ? VS.listHover : 'transparent')
					: (hover ? VS.buttonHover : VS.buttonSecBg),
				border: 'none',
				borderRadius: 4,
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.5 : 1,
				color: VS.fg,
				transition: 'all 0.1s ease',
				...style,
			}}
			{...props}
		>
			<i className={`codicon codicon-${icon}`} style={{ fontSize: iconSize }} />
		</button>
	);
});
IconButton.displayName = 'IconButton';

// Export VS colors for use in other components
export { VS };
