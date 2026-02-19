/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Lock Screen + Shader Clock Screensaver
 *
 *  Full-window DOM overlay with animated gradient mesh background and clock.
 *  Blocks all interaction until PIN is verified (or removed silently if auth not needed).
 *
 *  Architecture:
 *  - Workbench contribution creates a HIDDEN overlay at LifecyclePhase.Restored
 *  - Waits for extension to confirm auth is needed before making overlay visible
 *  - If auth NOT needed, overlay is removed without ever becoming visible (no flash)
 *  - Canvas-based shader renders animated gradient orbs (purple/pink TARX palette)
 *  - Large clock display with gradient text (Space Grotesk)
 *  - PIN verification delegated to extension via ICommandService
 *  - On success, overlay fades out and animation is cleaned up
 *--------------------------------------------------------------------------------------------*/

import './media/tarxLockScreen.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

interface ShaderOrb {
	x: number;
	y: number;
	radius: number;
	color: [number, number, number];
	vx: number;
	vy: number;
	phase: number;
	phaseSpeed: number;
}

class TarxLockScreenContribution extends Disposable {

	static readonly ID = 'workbench.contrib.tarxLockScreen';

	private overlay: HTMLDivElement | null = null;
	private otpInputs: HTMLInputElement[] = [];
	private errorEl: HTMLDivElement | null = null;
	private otpContainer: HTMLDivElement | null = null;
	private pinSection: HTMLDivElement | null = null;
	private loadingEl: HTMLDivElement | null = null;
	private attemptsEl: HTMLDivElement | null = null;

	private clockTimeEl: HTMLDivElement | null = null;
	private clockDateEl: HTMLDivElement | null = null;
	private clockInterval: ReturnType<typeof setInterval> | null = null;
	private meshHintEl: HTMLDivElement | null = null;
	private meshPollInterval: ReturnType<typeof setInterval> | null = null;

	private canvas: HTMLCanvasElement | null = null;
	private ctx: CanvasRenderingContext2D | null = null;
	private orbs: ShaderOrb[] = [];
	private animationFrame: number | null = null;

	private isLocked = false;
	private isVerifying = false;
	private globalKeyHandler: ((e: KeyboardEvent) => void) | null = null;

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super();

		// Build the DOM but keep it HIDDEN (opacity: 0, pointer-events: none via CSS)
		// Only made visible if auth is confirmed needed
		this.createOverlay();
		this.waitForExtensionAndCheck();
	}

	// ═══════════════════════════════════════════════════════════════════
	// SHADER CLOCK
	// ═══════════════════════════════════════════════════════════════════

	private createShaderCanvas(): void {
		if (!this.overlay) {
			return;
		}

		this.canvas = document.createElement('canvas');
		this.canvas.className = 'shader-canvas';
		this.overlay.insertBefore(this.canvas, this.overlay.firstChild);

		this.ctx = this.canvas.getContext('2d');
		this.resizeCanvas();
		window.addEventListener('resize', this.handleResize);
		this.initOrbs();
		this.animate();
	}

	private handleResize = (): void => {
		this.resizeCanvas();
	};

	private resizeCanvas(): void {
		if (!this.canvas) {
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		this.canvas.width = window.innerWidth * dpr;
		this.canvas.height = window.innerHeight * dpr;
		this.canvas.style.width = window.innerWidth + 'px';
		this.canvas.style.height = window.innerHeight + 'px';
		if (this.ctx) {
			this.ctx.scale(dpr, dpr);
		}
	}

	private initOrbs(): void {
		const w = window.innerWidth;
		const h = window.innerHeight;

		const palette: [number, number, number][] = [
			[168, 85, 247],  // purple
			[255, 50, 109],  // pink
			[99, 102, 241],  // indigo
			[139, 92, 246],  // violet
			[236, 72, 153],  // rose
			[79, 70, 229],   // deep indigo
		];

		this.orbs = [];
		for (let i = 0; i < 6; i++) {
			this.orbs.push({
				x: Math.random() * w,
				y: Math.random() * h,
				radius: 200 + Math.random() * 300,
				color: palette[i % palette.length],
				vx: (Math.random() - 0.5) * 0.4,
				vy: (Math.random() - 0.5) * 0.4,
				phase: Math.random() * Math.PI * 2,
				phaseSpeed: 0.002 + Math.random() * 0.003,
			});
		}
	}

	private animate = (): void => {
		if (!this.ctx || !this.canvas) {
			return;
		}

		const w = window.innerWidth;
		const h = window.innerHeight;

		this.ctx.fillStyle = '#0a0a0f';
		this.ctx.fillRect(0, 0, w, h);

		for (const orb of this.orbs) {
			orb.phase += orb.phaseSpeed;
			orb.x += orb.vx + Math.sin(orb.phase) * 0.3;
			orb.y += orb.vy + Math.cos(orb.phase * 0.7) * 0.3;

			const pad = orb.radius * 0.5;
			if (orb.x < -pad) { orb.x = -pad; orb.vx = Math.abs(orb.vx); }
			if (orb.x > w + pad) { orb.x = w + pad; orb.vx = -Math.abs(orb.vx); }
			if (orb.y < -pad) { orb.y = -pad; orb.vy = Math.abs(orb.vy); }
			if (orb.y > h + pad) { orb.y = h + pad; orb.vy = -Math.abs(orb.vy); }

			const pulseRadius = orb.radius + Math.sin(orb.phase * 1.5) * 40;
			const gradient = this.ctx.createRadialGradient(
				orb.x, orb.y, 0,
				orb.x, orb.y, pulseRadius
			);

			const [r, g, b] = orb.color;
			gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.3)`);
			gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.12)`);
			gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.04)`);
			gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

			this.ctx.fillStyle = gradient;
			this.ctx.fillRect(0, 0, w, h);
		}

		// Subtle grain
		this.ctx.globalAlpha = 0.015;
		this.ctx.fillStyle = '#ffffff';
		for (let i = 0; i < 80; i++) {
			const nx = Math.random() * w;
			const ny = Math.random() * h;
			this.ctx.fillRect(nx, ny, 1, 1);
		}
		this.ctx.globalAlpha = 1;

		this.animationFrame = requestAnimationFrame(this.animate);
	};

	// ═══════════════════════════════════════════════════════════════════
	// CLOCK
	// ═══════════════════════════════════════════════════════════════════

	private createClockDisplay(container: HTMLDivElement): void {
		const clockDisplay = document.createElement('div');
		clockDisplay.className = 'clock-display';

		this.clockTimeEl = document.createElement('div');
		this.clockTimeEl.className = 'clock-time';
		clockDisplay.appendChild(this.clockTimeEl);

		this.clockDateEl = document.createElement('div');
		this.clockDateEl.className = 'clock-date';
		clockDisplay.appendChild(this.clockDateEl);

		container.insertBefore(clockDisplay, container.firstChild);

		this.updateClock();
		this.clockInterval = setInterval(() => this.updateClock(), 1000);
	}

	private updateClock(): void {
		if (!this.clockTimeEl || !this.clockDateEl) {
			return;
		}

		const now = new Date();
		const hours = now.getHours();
		const minutes = now.getMinutes();
		const seconds = now.getSeconds();

		const h12 = hours % 12 || 12;
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const hStr = String(h12);
		const mStr = String(minutes).padStart(2, '0');
		const sStr = String(seconds).padStart(2, '0');

		this.clockTimeEl.innerHTML =
			`${hStr}<span class="clock-separator">:</span>${mStr}<span class="clock-seconds">${sStr} ${ampm}</span>`;

		const options: Intl.DateTimeFormatOptions = {
			weekday: 'long',
			month: 'long',
			day: 'numeric'
		};
		this.clockDateEl.textContent = now.toLocaleDateString('en-US', options);
	}

	// ═══════════════════════════════════════════════════════════════════
	// MESH STATUS HINT
	// ═══════════════════════════════════════════════════════════════════

	private createMeshHint(): void {
		if (!this.overlay) {
			return;
		}
		this.meshHintEl = document.createElement('div');
		this.meshHintEl.className = 'screensaver-hint';
		this.meshHintEl.textContent = 'MESH · CONNECTING';
		this.overlay.appendChild(this.meshHintEl);

		this.pollMeshStatus();
		this.meshPollInterval = setInterval(() => this.pollMeshStatus(), 15000);
	}

	private async pollMeshStatus(): Promise<void> {
		if (!this.meshHintEl) {
			return;
		}
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 2000);
			const res = await fetch('http://localhost:11436/mesh/status', { signal: controller.signal });
			clearTimeout(timeout);
			if (res.ok) {
				const data = await res.json() as { connected_peers?: number; peer_count?: number; local_peer_id?: string };
				const peers = data.connected_peers ?? data.peer_count ?? 0;
				const shortId = data.local_peer_id ? data.local_peer_id.slice(-8).toUpperCase() : '';
				this.meshHintEl.textContent = peers > 0
					? `MESH · ${peers} PEER${peers > 1 ? 'S' : ''} · ${shortId}`
					: `MESH · SOLO · ${shortId}`;
			} else {
				this.meshHintEl.textContent = 'MESH · OFFLINE';
			}
		} catch {
			this.meshHintEl.textContent = 'MESH · OFFLINE';
		}
	}

	// ═══════════════════════════════════════════════════════════════════
	// OVERLAY DOM
	// ═══════════════════════════════════════════════════════════════════

	private createOverlay(): void {
		this.overlay = document.createElement('div');
		this.overlay.className = 'tarx-lock-screen';
		// Note: CSS starts with opacity:0, pointer-events:none
		// Only .active class makes it visible

		const container = document.createElement('div');
		container.className = 'lock-container';

		const logo = document.createElement('div');
		logo.className = 'lock-logo';
		logo.textContent = 'TARX';
		container.appendChild(logo);

		const subtitle = document.createElement('div');
		subtitle.className = 'lock-subtitle';
		subtitle.textContent = 'Private Local Memory';
		container.appendChild(subtitle);

		this.loadingEl = document.createElement('div');
		this.loadingEl.className = 'lock-loading';
		this.loadingEl.innerHTML = '<div class="spinner"></div><span>Initializing...</span>';
		container.appendChild(this.loadingEl);

		this.pinSection = document.createElement('div');
		this.pinSection.className = 'lock-pin-section';

		const pinLabel = document.createElement('div');
		pinLabel.className = 'lock-pin-label';
		pinLabel.textContent = 'Enter your PIN to unlock';
		this.pinSection.appendChild(pinLabel);

		this.otpContainer = document.createElement('div');
		this.otpContainer.className = 'lock-otp-container';

		this.otpInputs = [];
		for (let i = 0; i < 6; i++) {
			const input = document.createElement('input');
			input.type = 'password';
			input.className = 'lock-otp-input';
			input.maxLength = 1;
			input.inputMode = 'numeric';
			input.pattern = '[0-9]*';
			input.autocomplete = 'off';
			input.dataset.index = String(i);
			this.otpInputs.push(input);
			this.otpContainer.appendChild(input);
		}
		this.pinSection.appendChild(this.otpContainer);

		this.errorEl = document.createElement('div');
		this.errorEl.className = 'lock-error';
		this.pinSection.appendChild(this.errorEl);

		this.attemptsEl = document.createElement('div');
		this.attemptsEl.className = 'lock-attempts';
		this.pinSection.appendChild(this.attemptsEl);

		container.appendChild(this.pinSection);
		this.overlay.appendChild(container);

		this.createClockDisplay(container);
		this.createMeshHint();
		this.createShaderCanvas();
		this.setupOtpHandlers();

		document.body.appendChild(this.overlay);
		console.log('[TARX Lock] Overlay created (hidden, awaiting auth check)');
	}

	// ═══════════════════════════════════════════════════════════════════
	// OTP INPUT
	// ═══════════════════════════════════════════════════════════════════

	private setupOtpHandlers(): void {
		this.otpInputs.forEach((input, index) => {
			input.addEventListener('input', () => {
				const value = input.value;

				if (value && !/^\d$/.test(value)) {
					input.value = '';
					return;
				}

				if (value) {
					input.classList.add('filled');
					if (index < this.otpInputs.length - 1) {
						this.otpInputs[index + 1].focus();
					}
				} else {
					input.classList.remove('filled');
				}

				const pin = this.otpInputs.map(inp => inp.value).join('');
				if (pin.length === 6) {
					this.verifyPin(pin);
				}
			});

			input.addEventListener('paste', (e) => {
				e.preventDefault();
				const pastedData = (e.clipboardData)?.getData('text') || '';
				const digits = pastedData.replace(/\D/g, '').slice(0, 6);

				digits.split('').forEach((digit, i) => {
					if (this.otpInputs[i]) {
						this.otpInputs[i].value = digit;
						this.otpInputs[i].classList.add('filled');
					}
				});

				const focusIndex = Math.min(digits.length, this.otpInputs.length - 1);
				this.otpInputs[focusIndex].focus();

				if (digits.length === 6) {
					this.verifyPin(digits);
				}
			});

			input.addEventListener('keydown', (e) => {
				if (e.key === 'Backspace') {
					if (!input.value && index > 0) {
						this.otpInputs[index - 1].value = '';
						this.otpInputs[index - 1].classList.remove('filled');
						this.otpInputs[index - 1].focus();
						e.preventDefault();
					} else {
						input.classList.remove('filled');
					}
				} else if (e.key === 'ArrowLeft' && index > 0) {
					this.otpInputs[index - 1].focus();
					e.preventDefault();
				} else if (e.key === 'ArrowRight' && index < this.otpInputs.length - 1) {
					this.otpInputs[index + 1].focus();
					e.preventDefault();
				}
			});

			input.addEventListener('focus', () => {
				input.select();
			});
		});
	}

	// ═══════════════════════════════════════════════════════════════════
	// AUTH FLOW
	// ═══════════════════════════════════════════════════════════════════

	private async waitForExtensionAndCheck(): Promise<void> {
		try {
			await this.extensionService.whenInstalledExtensionsRegistered();
			await new Promise(resolve => setTimeout(resolve, 500));

			const result = await this.commandService.executeCommand<{ shouldLock: boolean }>(
				'tarx.lockScreen.shouldLock'
			);

			if (result?.shouldLock) {
				console.log('[TARX Lock] Auth required');
				this.activateAndShowPin();
			} else {
				console.log('[TARX Lock] Auth not required');
				this.removeQuietly();
			}
		} catch (err) {
			console.log('[TARX Lock] Extension not ready, retrying...', err);

			for (let attempt = 0; attempt < 5; attempt++) {
				await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
				try {
					const result = await this.commandService.executeCommand<{ shouldLock: boolean }>(
						'tarx.lockScreen.shouldLock'
					);
					if (result?.shouldLock) {
						this.activateAndShowPin();
						return;
					} else {
						this.removeQuietly();
						return;
					}
				} catch {
					// Continue retrying
				}
			}

			console.warn('[TARX Lock] Extension never loaded, removing overlay');
			this.removeQuietly();
		}
	}

	/**
	 * Make overlay visible and show the PIN input.
	 * Only called when auth IS confirmed needed.
	 */
	private activateAndShowPin(): void {
		this.isLocked = true;

		// Make overlay visible
		if (this.overlay) {
			this.overlay.classList.add('active');
		}

		// Install keyboard blocker
		this.globalKeyHandler = (e: KeyboardEvent) => {
			if (!this.isLocked) {
				return;
			}

			const target = e.target as HTMLElement;
			const isOtpInput = target?.classList?.contains('lock-otp-input');

			if (isOtpInput) {
				const isDigit = /^\d$/.test(e.key);
				const isNav = ['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Delete'].includes(e.key);
				if (isDigit || isNav) {
					return;
				}
			}

			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
		};

		window.addEventListener('keydown', this.globalKeyHandler, true);
		window.addEventListener('keyup', this.globalKeyHandler, true);

		// Block mouse clicks outside OTP inputs
		this.overlay?.addEventListener('mousedown', (e) => {
			if (!this.isLocked) {
				return;
			}
			const target = e.target as HTMLElement;
			if (!target.classList.contains('lock-otp-input')) {
				const firstEmpty = this.otpInputs.find(inp => !inp.value);
				(firstEmpty || this.otpInputs[0])?.focus();
			}
		});

		// Hide loading, show PIN
		if (this.loadingEl) {
			this.loadingEl.style.display = 'none';
		}
		if (this.pinSection) {
			this.pinSection.classList.add('visible');
		}

		setTimeout(() => {
			this.otpInputs[0]?.focus();
		}, 100);
	}

	private async verifyPin(pin: string): Promise<void> {
		if (this.isVerifying) {
			return;
		}

		this.isVerifying = true;
		this.clearError();

		try {
			const result = await this.commandService.executeCommand<{ success: boolean; error?: string; locked?: boolean }>(
				'tarx.lockScreen.verifyPin', pin
			);

			if (result?.success) {
				this.dismiss();
			} else {
				this.showError(result?.error || 'Incorrect PIN');

				if (result?.locked) {
					this.showLockout(result.error || 'Too many attempts');
				} else {
					this.clearInputs();
					this.otpInputs[0]?.focus();
				}
			}
		} catch (err) {
			this.showError('Verification failed');
			this.clearInputs();
			this.otpInputs[0]?.focus();
		} finally {
			this.isVerifying = false;
		}
	}

	// ═══════════════════════════════════════════════════════════════════
	// UI HELPERS
	// ═══════════════════════════════════════════════════════════════════

	private showError(message: string): void {
		if (this.errorEl) {
			this.errorEl.textContent = message;
			this.errorEl.classList.add('visible');
		}

		if (this.otpContainer) {
			this.otpContainer.classList.add('shake');
			setTimeout(() => {
				this.otpContainer?.classList.remove('shake');
			}, 500);
		}
	}

	private clearError(): void {
		if (this.errorEl) {
			this.errorEl.textContent = '';
			this.errorEl.classList.remove('visible');
		}
	}

	private clearInputs(): void {
		this.otpInputs.forEach(input => {
			input.value = '';
			input.classList.remove('filled');
		});
	}

	private showLockout(message: string): void {
		this.otpInputs.forEach(input => {
			input.disabled = true;
		});

		if (this.errorEl) {
			this.errorEl.textContent = message;
			this.errorEl.classList.add('visible');
		}

		setTimeout(() => {
			this.otpInputs.forEach(input => {
				input.disabled = false;
			});
			this.clearError();
			this.clearInputs();
			this.otpInputs[0]?.focus();
		}, 5 * 60 * 1000);
	}

	// ═══════════════════════════════════════════════════════════════════
	// CLEANUP
	// ═══════════════════════════════════════════════════════════════════

	private removeGlobalListeners(): void {
		if (this.globalKeyHandler) {
			window.removeEventListener('keydown', this.globalKeyHandler, true);
			window.removeEventListener('keyup', this.globalKeyHandler, true);
			this.globalKeyHandler = null;
		}
	}

	private stopAnimation(): void {
		if (this.animationFrame !== null) {
			cancelAnimationFrame(this.animationFrame);
			this.animationFrame = null;
		}
		if (this.clockInterval !== null) {
			clearInterval(this.clockInterval);
			this.clockInterval = null;
		}
		if (this.meshPollInterval !== null) {
			clearInterval(this.meshPollInterval);
			this.meshPollInterval = null;
		}
		window.removeEventListener('resize', this.handleResize);
	}

	/**
	 * Remove overlay without ever showing it.
	 * Used when auth is NOT needed — user never sees the lock screen.
	 */
	private removeQuietly(): void {
		this.stopAnimation();
		if (this.overlay && this.overlay.parentNode) {
			this.overlay.parentNode.removeChild(this.overlay);
			this.overlay = null;
			this.canvas = null;
			this.ctx = null;
		}
		console.log('[TARX Lock] Overlay removed (never shown)');
	}

	/**
	 * Fade out and remove after successful PIN entry.
	 */
	private dismiss(): void {
		this.isLocked = false;
		this.removeGlobalListeners();

		if (!this.overlay) {
			return;
		}

		this.overlay.classList.add('fade-out');

		setTimeout(() => {
			this.stopAnimation();
			if (this.overlay && this.overlay.parentNode) {
				this.overlay.parentNode.removeChild(this.overlay);
				this.overlay = null;
				this.canvas = null;
				this.ctx = null;
				console.log('[TARX Lock] Shader clock overlay dismissed');
			}
		}, 400);
	}

	override dispose(): void {
		this.stopAnimation();
		this.removeGlobalListeners();
		if (this.overlay && this.overlay.parentNode) {
			this.overlay.parentNode.removeChild(this.overlay);
			this.overlay = null;
		}
		super.dispose();
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(TarxLockScreenContribution, LifecyclePhase.Restored);
