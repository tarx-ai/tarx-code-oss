/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { globalShortcut, BrowserWindow, app } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const ITarxGlobalShortcutService = createDecorator<ITarxGlobalShortcutService>('tarxGlobalShortcutService');

export interface ITarxGlobalShortcutService {
	readonly _serviceBrand: undefined;

	readonly onDidTriggerQuickChat: Event<void>;
	readonly onDidTriggerShowWindow: Event<void>;

	/**
	 * Register the global shortcut for TARX quick chat
	 * Default: Cmd+Shift+T (macOS) / Ctrl+Shift+T (Windows/Linux)
	 */
	register(mainWindow: BrowserWindow): boolean;

	/**
	 * Unregister all TARX global shortcuts
	 */
	unregister(): void;

	/**
	 * Check if the shortcut is registered
	 */
	isRegistered(): boolean;

	/**
	 * Change the shortcut accelerator
	 */
	setAccelerator(accelerator: string, mainWindow: BrowserWindow): boolean;

	/**
	 * Get the current accelerator
	 */
	getAccelerator(): string;
}

/**
 * TARX Global Shortcut Service
 *
 * Provides system-wide keyboard shortcuts for:
 * - Quick chat toggle (Cmd+Shift+T)
 * - Window show/hide
 *
 * Behavior:
 * - If window visible + focused → hide
 * - If window hidden/unfocused → show + focus chat input
 */
export class TarxGlobalShortcutService extends Disposable implements ITarxGlobalShortcutService {
	declare readonly _serviceBrand: undefined;

	private mainWindow: BrowserWindow | null = null;
	private currentAccelerator: string = 'CommandOrControl+Shift+T';
	private registered: boolean = false;

	private readonly _onDidTriggerQuickChat = this._register(new Emitter<void>());
	readonly onDidTriggerQuickChat: Event<void> = this._onDidTriggerQuickChat.event;

	private readonly _onDidTriggerShowWindow = this._register(new Emitter<void>());
	readonly onDidTriggerShowWindow: Event<void> = this._onDidTriggerShowWindow.event;

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.logService.info('[TARX Shortcut] Service initialized');
	}

	register(mainWindow: BrowserWindow): boolean {
		if (this.registered) {
			this.logService.warn('[TARX Shortcut] Already registered, unregistering first');
			this.unregister();
		}

		this.mainWindow = mainWindow;

		try {
			const success = globalShortcut.register(this.currentAccelerator, () => {
				this.handleShortcutTrigger();
			});

			if (success) {
				this.registered = true;
				this.logService.info(`[TARX Shortcut] Registered: ${this.currentAccelerator}`);
				return true;
			} else {
				this.logService.error(`[TARX Shortcut] Failed to register: ${this.currentAccelerator} (possibly in use)`);
				return false;
			}
		} catch (error) {
			this.logService.error(`[TARX Shortcut] Error registering: ${error}`);
			return false;
		}
	}

	unregister(): void {
		if (this.registered) {
			try {
				globalShortcut.unregister(this.currentAccelerator);
				this.registered = false;
				this.logService.info(`[TARX Shortcut] Unregistered: ${this.currentAccelerator}`);
			} catch (error) {
				this.logService.error(`[TARX Shortcut] Error unregistering: ${error}`);
			}
		}
	}

	isRegistered(): boolean {
		return this.registered && globalShortcut.isRegistered(this.currentAccelerator);
	}

	setAccelerator(accelerator: string, mainWindow: BrowserWindow): boolean {
		// Validate accelerator format
		if (!this.validateAccelerator(accelerator)) {
			this.logService.error(`[TARX Shortcut] Invalid accelerator format: ${accelerator}`);
			return false;
		}

		// Unregister current shortcut
		this.unregister();

		// Update accelerator
		const oldAccelerator = this.currentAccelerator;
		this.currentAccelerator = accelerator;

		// Try to register new shortcut
		const success = this.register(mainWindow);

		if (!success) {
			// Rollback to old accelerator
			this.currentAccelerator = oldAccelerator;
			this.register(mainWindow);
			return false;
		}

		this.logService.info(`[TARX Shortcut] Changed from ${oldAccelerator} to ${accelerator}`);
		return true;
	}

	getAccelerator(): string {
		return this.currentAccelerator;
	}

	private handleShortcutTrigger(): void {
		if (!this.mainWindow) {
			this.logService.warn('[TARX Shortcut] No main window set');
			return;
		}

		this.logService.trace('[TARX Shortcut] Triggered');

		// Determine action based on window state
		const isVisible = this.mainWindow.isVisible();
		const isFocused = this.mainWindow.isFocused();

		if (isVisible && isFocused) {
			// Window is visible and focused → hide it
			this.mainWindow.hide();
			this.logService.trace('[TARX Shortcut] Hiding window');
		} else {
			// Window is hidden or not focused → show and focus
			if (!isVisible) {
				this.mainWindow.show();
			}

			// Bring to front and focus
			this.mainWindow.focus();

			// On macOS, also bring app to front
			if (process.platform === 'darwin') {
				app.focus({ steal: true });
			}

			// Send message to renderer to focus chat input
			this.mainWindow.webContents.send('tarx:focus-chat');

			this._onDidTriggerShowWindow.fire();
			this._onDidTriggerQuickChat.fire();

			this.logService.trace('[TARX Shortcut] Showing window and focusing chat');
		}
	}

	private validateAccelerator(accelerator: string): boolean {
		// Basic validation of accelerator format
		// Electron accelerators use format like "CommandOrControl+Shift+T"
		const validModifiers = [
			'Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl',
			'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta'
		];

		const validKeys = [
			// Letters
			...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
			// Numbers
			...'0123456789'.split(''),
			// Function keys
			...'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F13 F14 F15 F16 F17 F18 F19 F20 F21 F22 F23 F24'.split(' '),
			// Special keys
			'Plus', 'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock',
			'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right',
			'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'VolumeUp', 'VolumeDown', 'VolumeMute',
			'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause',
			'PrintScreen', 'Tilde', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight',
			'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash'
		];

		const parts = accelerator.split('+');
		if (parts.length < 2) {
			return false; // Must have at least one modifier and one key
		}

		// Last part should be a key
		const key = parts[parts.length - 1].trim();
		const keyValid = validKeys.some(k => k.toLowerCase() === key.toLowerCase());
		if (!keyValid) {
			return false;
		}

		// All other parts should be modifiers
		for (let i = 0; i < parts.length - 1; i++) {
			const modifier = parts[i].trim();
			const modifierValid = validModifiers.some(m => m.toLowerCase() === modifier.toLowerCase());
			if (!modifierValid) {
				return false;
			}
		}

		return true;
	}

	override dispose(): void {
		this.unregister();
		globalShortcut.unregisterAll(); // Clean up all TARX shortcuts
		super.dispose();
	}
}
