/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Authentication Module
 *
 * Privacy-focused authentication with:
 * - Local PIN authentication (no server communication)
 * - Optional SMS 2FA via Twilio
 * - Auto-lock after inactivity
 * - Rate limiting and brute force protection
 */

export { PinAuth, PinAuthState } from './pinAuth';
export { SmsAuth, SmsAuthState } from './smsAuth';
export { AuthManager, AuthState, registerAuthCommands } from './authManager';
export { AuthStateManager } from './authState';
export type { AuthState as AuthFlowState } from './authState';
// AuthChatView REMOVED - conversational-first (Feb 2026), auth uses showInputBox
