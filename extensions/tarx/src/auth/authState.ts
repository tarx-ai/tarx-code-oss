/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Auth State Manager - Singleton for tracking auth state
 */

export type AuthState = 'setup_required' | 'locked' | 'unlocked';

export class AuthStateManager {
	private static instance: AuthStateManager;
	private _state: AuthState = 'locked';
	private listeners: Array<(state: AuthState) => void> = [];

	private constructor() {}

	static getInstance(): AuthStateManager {
		if (!AuthStateManager.instance) {
			AuthStateManager.instance = new AuthStateManager();
		}
		return AuthStateManager.instance;
	}

	get state(): AuthState {
		return this._state;
	}

	setState(state: AuthState): void {
		this._state = state;
		this.listeners.forEach(fn => fn(state));
		console.log('[TARX Auth] State changed to:', state);
	}

	onStateChange(fn: (state: AuthState) => void): void {
		this.listeners.push(fn);
	}

	isUnlocked(): boolean {
		return this._state === 'unlocked';
	}
}
