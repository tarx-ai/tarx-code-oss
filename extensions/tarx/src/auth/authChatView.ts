/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Auth Chat View - Blocking authentication UI
 *
 * Takes over the editor area with a WebviewPanel that blocks until
 * authentication is complete. Used for FTUX setup and unlock flows.
 */

import * as vscode from 'vscode';
import { AuthManager } from './authManager';
import { AuthStateManager, AuthState } from './authState';

export class AuthChatView {
	private panel: vscode.WebviewPanel | null = null;
	private authManager: AuthManager;
	private authState: AuthStateManager;
	private resolveAuth: ((success: boolean) => void) | null = null;
	private currentScreen: 'setup' | 'unlock' | 'sms-setup' | 'sms-verify' = 'setup';
	private pendingPin: string | null = null;
	private smsSessionId: string | null = null;

	constructor(private context: vscode.ExtensionContext, authManager: AuthManager) {
		this.authManager = authManager;
		this.authState = AuthStateManager.getInstance();
	}

	/**
	 * Show auth view and wait for completion
	 * Returns true if authenticated successfully, false if cancelled
	 */
	async showAndWait(): Promise<boolean> {
		// Determine what screen to show
		const isConfigured = await this.authManager.isAuthEnabled();

		if (!isConfigured) {
			this.authState.setState('setup_required');
			this.currentScreen = 'setup';
		} else {
			this.authState.setState('locked');
			this.currentScreen = 'unlock';
		}

		return new Promise((resolve) => {
			this.resolveAuth = resolve;
			this.createPanel();
		});
	}

	private createPanel(): void {
		this.panel = vscode.window.createWebviewPanel(
			'tarxAuth',
			'TARX Authentication',
			{
				viewColumn: vscode.ViewColumn.One,
				preserveFocus: false // Take focus
			},
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				enableFindWidget: false,
				localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
			}
		);

		// Keep panel visible and focused
		this.panel.reveal(vscode.ViewColumn.One, false);

		// Get logo URI for webview
		const logoUri = this.panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'tarx-logo.png')
		);

		this.panel.webview.html = this.getHtml(logoUri.toString());

		// Handle messages from webview
		this.panel.webview.onDidReceiveMessage(
			async (message) => {
				await this.handleMessage(message);
			},
			undefined,
			this.context.subscriptions
		);

		// Handle panel close
		this.panel.onDidDispose(() => {
			this.panel = null;
			if (this.resolveAuth) {
				this.resolveAuth(false);
				this.resolveAuth = null;
			}
		});
	}

	private async handleMessage(message: any): Promise<void> {
		switch (message.command) {
			case 'setupPin':
				await this.handleSetupPin(message.pin);
				break;
			case 'confirmPin':
				await this.handleConfirmPin(message.pin);
				break;
			case 'verifyPin':
				await this.handleVerifyPin(message.pin);
				break;
			case 'setup2fa':
				await this.handleSetup2FA();
				break;
			case 'skip2fa':
				await this.handleSkip2FA();
				break;
			case 'sendSmsCode':
				await this.handleSendSmsCode(message.phone);
				break;
			case 'verifySmsCode':
				await this.handleVerifySmsCode(message.code);
				break;
			case 'resendSmsCode':
				await this.handleResendSmsCode();
				break;
			case 'enable2faFromPrompt':
				await this.handleEnable2FAFromPrompt();
				break;
			case 'remindLater':
				await this.handleRemindLater();
				break;
			case 'dontAskAgain':
				await this.handleDontAskAgain();
				break;
			case 'cancel':
				this.close(false);
				break;
		}
	}

	private async handleSetupPin(pin: string): Promise<void> {
		// Validate PIN format
		if (!/^\d{6}$/.test(pin)) {
			this.sendError('PIN must be exactly 6 digits');
			return;
		}

		this.pendingPin = pin;
		this.currentScreen = 'setup';
		this.updateView('confirm-pin');
	}

	private async handleConfirmPin(pin: string): Promise<void> {
		if (pin !== this.pendingPin) {
			this.sendError('PINs do not match');
			this.updateView('setup-pin');
			this.pendingPin = null;
			return;
		}

		// Set the PIN
		const pinAuth = (this.authManager as any).pinAuth;
		const result = await pinAuth.setPIN(pin);

		if (!result.success) {
			this.sendError(result.error || 'Failed to set PIN');
			this.updateView('setup-pin');
			this.pendingPin = null;
			return;
		}

		this.pendingPin = null;

		// Check if 2FA is available
		const smsAuth = (this.authManager as any).smsAuth;
		console.log('[TARX Auth] Checking if SMS 2FA is available...');
		const smsAvailable = await smsAuth.isAvailable();
		console.log('[TARX Auth] SMS 2FA available:', smsAvailable);

		if (smsAvailable) {
			console.log('[TARX Auth] Showing 2FA option screen');
			this.updateView('2fa-option');
		} else {
			// No 2FA available, complete setup
			console.log('[TARX Auth] SMS not available, completing auth');
			await this.completeAuth();
		}
	}

	private async handleSetup2FA(): Promise<void> {
		this.currentScreen = 'sms-setup';
		this.updateView('sms-setup');
	}

	private async handleSkip2FA(): Promise<void> {
		await this.completeAuth();
	}

	private async handleSendSmsCode(phone: string): Promise<void> {
		const smsAuth = (this.authManager as any).smsAuth;
		const result = await smsAuth.sendVerificationCode(phone);

		if (!result.success) {
			this.sendError(result.error || 'Failed to send code');
			return;
		}

		this.smsSessionId = result.sessionId;
		this.currentScreen = 'sms-verify';
		this.updateView('sms-verify');
	}

	private async handleVerifySmsCode(code: string): Promise<void> {
		if (!this.smsSessionId) {
			this.sendError('No verification session active');
			return;
		}

		const smsAuth = (this.authManager as any).smsAuth;
		const result = await smsAuth.verifyCode(code, this.smsSessionId);

		if (!result.success) {
			this.sendError(result.error || 'Invalid code');
			return;
		}

		this.smsSessionId = null;
		// Show success screen before completing
		this.updateView('verification-success');
		// Auto-complete after animation
		setTimeout(() => {
			this.completeAuth();
		}, 1500);
	}

	private async handleResendSmsCode(): Promise<void> {
		const smsAuth = (this.authManager as any).smsAuth;

		// Send a new challenge code
		const result = await smsAuth.sendChallenge();

		if (!result.success) {
			this.sendError(result.error || 'Failed to send new code');
			return;
		}

		this.smsSessionId = result.sessionId || null;
		this.panel?.webview.postMessage({ command: 'info', message: 'New code sent to your phone' });
	}

	private async handleVerifyPin(pin: string): Promise<void> {
		const pinAuth = (this.authManager as any).pinAuth;
		const result = await pinAuth.verifyPIN(pin);

		if (!result.success) {
			this.sendError(result.error || 'Incorrect PIN');
			return;
		}

		// Check if 2FA is enabled
		const smsAuth = (this.authManager as any).smsAuth;
		const smsEnabled = await smsAuth.isEnabled();

		if (smsEnabled) {
			// Send 2FA challenge
			const challengeResult = await smsAuth.sendChallenge();
			if (!challengeResult.success) {
				this.sendError(challengeResult.error || 'Failed to send 2FA code');
				return;
			}
			this.smsSessionId = challengeResult.sessionId;
			this.currentScreen = 'sms-verify';
			this.updateView('sms-verify-unlock');
		} else {
			// 2FA not enabled - check if we should prompt
			const smsAvailable = await smsAuth.isAvailable();
			const dontAskAgain = this.context.globalState.get<boolean>('tarx.auth.2fa.dontAsk', false);

			if (smsAvailable && !dontAskAgain) {
				// Show 2FA prompt
				this.updateView('2fa-prompt');
			} else {
				await this.completeAuth();
			}
		}
	}

	private async handleEnable2FAFromPrompt(): Promise<void> {
		this.currentScreen = 'sms-setup';
		this.updateView('sms-setup');
	}

	private async handleRemindLater(): Promise<void> {
		// Just complete auth, will prompt again next time
		await this.completeAuth();
	}

	private async handleDontAskAgain(): Promise<void> {
		// Store preference and complete auth
		await this.context.globalState.update('tarx.auth.2fa.dontAsk', true);
		await this.completeAuth();
	}

	private async completeAuth(): Promise<void> {
		this.authState.setState('unlocked');
		(this.authManager as any).isUnlocked = true;
		(this.authManager as any).updateActivity();
		this.close(true);
	}

	private sendError(message: string): void {
		this.panel?.webview.postMessage({ command: 'error', message });
	}

	private updateView(view: string): void {
		this.panel?.webview.postMessage({ command: 'navigate', view });
	}

	private close(success: boolean): void {
		if (this.panel) {
			this.panel.dispose();
			this.panel = null;
		}
		if (this.resolveAuth) {
			this.resolveAuth(success);
			this.resolveAuth = null;
		}
	}

	private getHtml(logoUri: string): string {
		const isSetup = this.currentScreen === 'setup';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>TARX Authentication</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}
		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
			background: var(--vscode-editor-background, #1e1e1e);
			color: var(--vscode-editor-foreground, #d4d4d4);
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: 100vh;
			padding: 20px;
		}
		.container {
			max-width: 400px;
			width: 100%;
			text-align: center;
		}
		.logo {
			font-size: 48px;
			margin-bottom: 8px;
		}
		.logo-img {
			margin-bottom: 32px;
		}
		.logo-img img {
			width: 256px;
			max-width: 100%;
			height: auto;
			opacity: 0.2;
			filter: invert(1);
		}
		h1 {
			font-size: 24px;
			font-weight: 600;
			margin-bottom: 8px;
			color: var(--vscode-foreground, #fff);
		}
		h1.locked {
			font-size: 16px;
			font-weight: 600;
			letter-spacing: 3px;
			text-transform: uppercase;
			color: var(--vscode-descriptionForeground, #858585);
			opacity: 0.7;
		}
		.subtitle {
			color: var(--vscode-descriptionForeground, #858585);
			margin-bottom: 32px;
			font-size: 14px;
		}
		.subtitle.locked {
			color: var(--vscode-descriptionForeground, #858585);
			font-size: 12px;
			letter-spacing: 1px;
			opacity: 0.6;
		}
		.screen {
			display: none;
		}
		.screen.active {
			display: block;
		}
		.input-group {
			margin-bottom: 16px;
		}
		.input-group label {
			display: block;
			text-align: left;
			margin-bottom: 8px;
			font-size: 13px;
			color: var(--vscode-foreground, #d4d4d4);
		}
		input {
			width: 100%;
			padding: 12px 16px;
			font-size: 18px;
			letter-spacing: 8px;
			text-align: center;
			background: var(--vscode-input-background, #3c3c3c);
			border: 1px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 6px;
			color: var(--vscode-input-foreground, #d4d4d4);
			outline: none;
		}
		input:focus {
			border-color: var(--vscode-focusBorder, #007fd4);
		}
		input::placeholder {
			letter-spacing: 4px;
			color: var(--vscode-input-placeholderForeground, #858585);
		}
		input.phone {
			letter-spacing: 1px;
			text-align: left;
			padding-left: 90px;
		}
		.phone-input-wrapper {
			position: relative;
			width: 100%;
		}
		.country-select {
			position: absolute;
			left: 1px;
			top: 1px;
			bottom: 1px;
			width: 80px;
			background: var(--vscode-dropdown-background, #3c3c3c);
			border: none;
			border-right: 1px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 5px 0 0 5px;
			color: var(--vscode-dropdown-foreground, #d4d4d4);
			font-size: 14px;
			padding: 0 8px;
			cursor: pointer;
			outline: none;
		}
		.country-select:focus {
			border-color: var(--vscode-focusBorder, #007fd4);
		}
		.phone-preview {
			font-size: 12px;
			color: var(--vscode-descriptionForeground, #858585);
			margin-top: 8px;
			text-align: left;
		}
		.phone-preview.valid {
			color: var(--vscode-charts-green, #89d185);
		}
		.btn {
			width: 100%;
			padding: 12px 24px;
			font-size: 14px;
			font-weight: 500;
			border: none;
			border-radius: 6px;
			cursor: pointer;
			margin-top: 8px;
			transition: opacity 0.2s;
		}
		.btn:hover {
			opacity: 0.9;
		}
		.btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		.btn-primary {
			background: var(--vscode-button-background, #0e639c);
			color: var(--vscode-button-foreground, #fff);
		}
		.btn-secondary {
			background: var(--vscode-button-secondaryBackground, #3a3d41);
			color: var(--vscode-button-secondaryForeground, #d4d4d4);
		}
		.error {
			background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
			border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
			color: var(--vscode-errorForeground, #f48771);
			padding: 10px 12px;
			border-radius: 6px;
			margin-bottom: 16px;
			font-size: 13px;
			display: none;
		}
		.error.show {
			display: block;
		}
		.info {
			background: var(--vscode-inputValidation-infoBackground, #063b49);
			border: 1px solid var(--vscode-inputValidation-infoBorder, #007acc);
			padding: 10px 12px;
			border-radius: 6px;
			margin-bottom: 16px;
			font-size: 13px;
			text-align: left;
		}
		.divider {
			display: flex;
			align-items: center;
			margin: 24px 0;
		}
		.divider::before, .divider::after {
			content: '';
			flex: 1;
			height: 1px;
			background: var(--vscode-widget-border, #454545);
		}
		.divider span {
			padding: 0 16px;
			color: var(--vscode-descriptionForeground, #858585);
			font-size: 12px;
		}
		.feature-list {
			text-align: left;
			margin: 24px 0;
		}
		.feature-item {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 8px 0;
			font-size: 13px;
		}
		.feature-icon {
			width: 20px;
			height: 20px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: var(--vscode-charts-green, #89d185);
		}
		.success-icon {
			font-size: 48px;
			color: var(--vscode-charts-green, #89d185);
			margin-bottom: 16px;
		}
		.security-prompt {
			background: var(--vscode-inputValidation-infoBackground, #063b49);
			border: 1px solid var(--vscode-inputValidation-infoBorder, #007acc);
			border-radius: 8px;
			padding: 20px;
			margin-bottom: 24px;
			text-align: center;
		}
		.security-prompt .security-icon {
			font-size: 32px;
			margin-bottom: 12px;
		}
		.security-prompt h3 {
			font-size: 16px;
			font-weight: 600;
			margin-bottom: 8px;
			color: var(--vscode-foreground, #fff);
		}
		.security-prompt p {
			font-size: 13px;
			color: var(--vscode-descriptionForeground, #858585);
			margin: 0;
			line-height: 1.5;
		}
		.btn-link {
			background: transparent;
			color: var(--vscode-descriptionForeground, #858585);
			font-size: 12px;
			text-decoration: underline;
			padding: 8px;
			margin-top: 8px;
		}
		.btn-link:hover {
			color: var(--vscode-foreground, #d4d4d4);
		}
		/* OTP Input - Separate digit boxes */
		.otp-container {
			display: flex;
			gap: 8px;
			justify-content: center;
			margin-bottom: 16px;
		}
		.otp-input {
			width: 52px;
			height: 56px;
			font-size: 24px;
			font-weight: 600;
			text-align: center;
			letter-spacing: 0;
			padding: 0;
			background: var(--vscode-input-background, #3c3c3c);
			border: 2px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 8px;
			color: var(--vscode-input-foreground, #d4d4d4);
			outline: none;
			caret-color: transparent;
		}
		.otp-input:focus {
			border-color: var(--vscode-focusBorder, #007fd4);
			background: var(--vscode-input-background, #3c3c3c);
		}
		.otp-input.filled {
			border-color: var(--vscode-charts-green, #89d185);
		}
		.otp-input::placeholder {
			color: var(--vscode-input-placeholderForeground, #858585);
			font-size: 20px;
		}
		.otp-input::-webkit-outer-spin-button,
		.otp-input::-webkit-inner-spin-button {
			-webkit-appearance: none;
			margin: 0;
		}
		.otp-input[type=number] {
			-moz-appearance: textfield;
		}
		/* Success Screen */
		.success-screen {
			text-align: center;
			padding: 40px 20px;
		}
		.success-checkmark {
			width: 80px;
			height: 80px;
			margin: 0 auto 24px;
			border-radius: 50%;
			background: var(--vscode-charts-green, #89d185);
			display: flex;
			align-items: center;
			justify-content: center;
			animation: scaleIn 0.3s ease-out;
		}
		.success-checkmark svg {
			width: 40px;
			height: 40px;
			stroke: #fff;
			stroke-width: 3;
			fill: none;
			animation: drawCheck 0.4s ease-out 0.2s forwards;
			stroke-dasharray: 50;
			stroke-dashoffset: 50;
		}
		@keyframes scaleIn {
			0% { transform: scale(0); opacity: 0; }
			50% { transform: scale(1.1); }
			100% { transform: scale(1); opacity: 1; }
		}
		@keyframes drawCheck {
			to { stroke-dashoffset: 0; }
		}
		.success-title {
			font-size: 24px;
			font-weight: 600;
			color: var(--vscode-foreground, #fff);
			margin-bottom: 8px;
		}
		.success-subtitle {
			font-size: 14px;
			color: var(--vscode-descriptionForeground, #858585);
		}
	</style>
</head>
<body>
	<div class="container">
		<!-- Always use image logo, no emoji -->
		<div id="logo-img" class="logo-img">
			<img src="${logoUri}" alt="TARX" width="120" />
		</div>
		<h1 id="title" class="${!isSetup ? 'locked' : ''}">${isSetup ? 'TARX' : "I'M LOCKED"}</h1>
		<p class="subtitle ${!isSetup ? 'locked' : ''}" id="subtitle">${isSetup ? 'Secure your AI assistant' : 'Private Local Memory'}</p>

		<div id="error" class="error"></div>

		<!-- Setup PIN Screen -->
		<div id="setup-pin" class="screen ${isSetup ? 'active' : ''}">
			<div class="info">
				Create a 6-digit PIN to protect your TARX data. This PIN is stored locally and never sent anywhere.
			</div>
			<div class="input-group">
				<label>Enter a 6-digit PIN</label>
				<input type="password" id="pin-setup" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="••••••" autocomplete="off">
			</div>
			<button class="btn btn-primary" id="btn-setup-pin">Continue</button>
		</div>

		<!-- Confirm PIN Screen -->
		<div id="confirm-pin" class="screen">
			<div class="info">
				Please confirm your PIN to make sure you remember it.
			</div>
			<div class="input-group">
				<label>Confirm your PIN</label>
				<input type="password" id="pin-confirm" maxlength="6" pattern="[0-9]*" inputmode="numeric" placeholder="••••••" autocomplete="off">
			</div>
			<button class="btn btn-primary" id="btn-confirm-pin">Set PIN</button>
			<button class="btn btn-secondary" id="btn-back-setup">Back</button>
		</div>

		<!-- 2FA Option Screen -->
		<div id="2fa-option" class="screen">
			<div class="info">
				Add an extra layer of security with SMS verification. A code will be sent to your phone each time you unlock.
			</div>
			<div class="feature-list">
				<div class="feature-item">
					<span class="feature-icon">✓</span>
					<span>PIN protection enabled</span>
				</div>
				<div class="feature-item">
					<span class="feature-icon">+</span>
					<span>Optional SMS verification</span>
				</div>
			</div>
			<button class="btn btn-primary" id="btn-setup-2fa">Enable SMS 2FA</button>
			<button class="btn btn-secondary" id="btn-skip-2fa">Skip for now</button>
		</div>

		<!-- SMS Setup Screen -->
		<div id="sms-setup" class="screen">
			<div class="info">
				Enter your phone number. We'll send a verification code to confirm.
			</div>
			<div class="input-group">
				<label>Phone number</label>
				<div class="phone-input-wrapper">
					<select id="country-select" class="country-select">
						<option value="+1" data-format="(###) ###-####" data-flag="🇺🇸">🇺🇸 +1</option>
						<option value="+44" data-format="#### ######" data-flag="🇬🇧">🇬🇧 +44</option>
						<option value="+49" data-format="### ########" data-flag="🇩🇪">🇩🇪 +49</option>
						<option value="+33" data-format="# ## ## ## ##" data-flag="🇫🇷">🇫🇷 +33</option>
						<option value="+81" data-format="##-####-####" data-flag="🇯🇵">🇯🇵 +81</option>
						<option value="+86" data-format="### #### ####" data-flag="🇨🇳">🇨🇳 +86</option>
						<option value="+91" data-format="##### #####" data-flag="🇮🇳">🇮🇳 +91</option>
						<option value="+61" data-format="### ### ###" data-flag="🇦🇺">🇦🇺 +61</option>
						<option value="+55" data-format="## #####-####" data-flag="🇧🇷">🇧🇷 +55</option>
						<option value="+52" data-format="## #### ####" data-flag="🇲🇽">🇲🇽 +52</option>
						<option value="+82" data-format="##-####-####" data-flag="🇰🇷">🇰🇷 +82</option>
						<option value="+39" data-format="### ### ####" data-flag="🇮🇹">🇮🇹 +39</option>
						<option value="+34" data-format="### ### ###" data-flag="🇪🇸">🇪🇸 +34</option>
						<option value="+7" data-format="### ###-##-##" data-flag="🇷🇺">🇷🇺 +7</option>
						<option value="+31" data-format="# ########" data-flag="🇳🇱">🇳🇱 +31</option>
						<option value="+46" data-format="##-### ## ##" data-flag="🇸🇪">🇸🇪 +46</option>
						<option value="+41" data-format="## ### ## ##" data-flag="🇨🇭">🇨🇭 +41</option>
						<option value="+65" data-format="#### ####" data-flag="🇸🇬">🇸🇬 +65</option>
						<option value="+972" data-format="##-###-####" data-flag="🇮🇱">🇮🇱 +972</option>
						<option value="+971" data-format="## ### ####" data-flag="🇦🇪">🇦🇪 +971</option>
					</select>
					<input type="tel" id="phone-input" class="phone" placeholder="(555) 123-4567" autocomplete="off">
				</div>
				<div id="phone-preview" class="phone-preview"></div>
			</div>
			<button class="btn btn-primary" id="btn-send-code">Send Code</button>
			<button class="btn btn-secondary" id="btn-back-2fa">Back</button>
		</div>

		<!-- SMS Verify Screen (Setup) -->
		<div id="sms-verify" class="screen">
			<div class="info">
				Enter the 6-digit code sent to your phone.
			</div>
			<div class="input-group">
				<label>Verification code</label>
				<!-- Hidden input for SMS AutoFill (macOS/iOS) -->
				<input type="text" id="otp-setup-autofill" autocomplete="one-time-code" inputmode="numeric" maxlength="6" style="position: absolute; opacity: 0; pointer-events: none;" aria-hidden="true">
				<div class="otp-container" id="otp-setup">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="0">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="1">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="2">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="3">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="4">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="5">
				</div>
			</div>
			<button class="btn btn-primary" id="btn-verify-code">Verify</button>
		</div>

		<!-- Unlock Screen -->
		<div id="unlock" class="screen ${!isSetup ? 'active' : ''}">
			<div class="info">
				Enter your PIN to unlock.
			</div>
			<div class="input-group">
				<label>PIN</label>
				<div class="otp-container" id="otp-pin">
					<input type="password" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="0">
					<input type="password" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="1">
					<input type="password" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="2">
					<input type="password" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="3">
					<input type="password" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="4">
					<input type="password" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="5">
				</div>
			</div>
			<button class="btn btn-primary" id="btn-unlock">Unlock</button>
		</div>

		<!-- SMS Verify Screen (Unlock) -->
		<div id="sms-verify-unlock" class="screen">
			<div class="info">
				Enter the 6-digit code sent to your phone.
			</div>
			<div class="input-group">
				<label>Verification code</label>
				<!-- Hidden input for SMS AutoFill (macOS/iOS) -->
				<input type="text" id="otp-unlock-autofill" autocomplete="one-time-code" inputmode="numeric" maxlength="6" style="position: absolute; opacity: 0; pointer-events: none;" aria-hidden="true">
				<div class="otp-container" id="otp-unlock">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="0">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="1">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="2">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="3">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="4">
					<input type="text" class="otp-input" maxlength="1" pattern="[0-9]*" inputmode="numeric" autocomplete="off" data-index="5">
				</div>
			</div>
			<button class="btn btn-primary" id="btn-verify-unlock">Verify</button>
			<button class="btn btn-secondary" id="btn-resend-unlock" style="margin-top: 8px;">Request New Code</button>
		</div>

		<!-- 2FA Prompt Screen (shown after unlock if 2FA not set up) -->
		<div id="2fa-prompt" class="screen">
			<div class="success-icon">✓</div>
			<div class="info" style="background: transparent; border: none; text-align: center; margin-bottom: 24px;">
				<strong>Unlocked.</strong> You're in.
			</div>
			<div class="security-prompt">
				<div class="security-icon"><span class="codicon codicon-shield"></span></div>
				<h3>Add a second lock?</h3>
				<p>Get a text code when you unlock. Extra layer, same local privacy.</p>
			</div>
			<button class="btn btn-primary" id="btn-enable-2fa-prompt">Yes, text me codes</button>
			<button class="btn btn-secondary" id="btn-remind-later">Maybe later</button>
			<button class="btn btn-link" id="btn-dont-ask">No thanks</button>
		</div>

		<!-- Success Screen (shown after OTP verification) -->
		<div id="verification-success" class="screen">
			<div class="success-screen">
				<div class="success-checkmark">
					<svg viewBox="0 0 24 24">
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
				</div>
				<div class="success-title">Verified!</div>
				<div class="success-subtitle">Your identity has been confirmed</div>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		// Screen management
		function showScreen(screenId) {
			document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
			document.getElementById(screenId)?.classList.add('active');
			hideError();

			// Clear OTP inputs when navigating
			document.querySelectorAll('.otp-input').forEach(input => {
				input.value = '';
				input.classList.remove('filled');
			});

			// Determine if this is a lock/unlock screen
			const isLockScreen = screenId === 'unlock' || screenId === 'sms-verify-unlock';
			const isPromptScreen = screenId === '2fa-prompt';
			const isSuccessScreen = screenId === 'verification-success';
			const isSetupScreen = screenId === 'setup-pin' || screenId === 'confirm-pin' ||
			                      screenId === '2fa-option' || screenId === 'sms-setup' || screenId === 'sms-verify';

			// Update logo visibility (always use image logo, no emoji)
			const logoImg = document.getElementById('logo-img');
			if (logoImg) {
				// Hide logo on prompt/success screens (they have their own icons)
				const hideLogo = isPromptScreen || isSuccessScreen;
				logoImg.style.display = hideLogo ? 'none' : 'block';
			}

			// Update title
			const title = document.getElementById('title');
			const subtitle = document.getElementById('subtitle');
			const hideHeader = isPromptScreen || isSuccessScreen;
			if (title) {
				// Hide title on prompt/success screens
				title.style.display = hideHeader ? 'none' : 'block';
				title.textContent = isLockScreen ? "I'M LOCKED" : 'TARX';
				title.className = isLockScreen ? 'locked' : '';
			}
			if (subtitle) {
				// Hide subtitle on prompt/success screens
				subtitle.style.display = hideHeader ? 'none' : 'block';
				subtitle.className = 'subtitle' + (isLockScreen ? ' locked' : '');
			}

			// Update subtitle text
			const subtitles = {
				'setup-pin': 'Create your PIN',
				'confirm-pin': 'Confirm your PIN',
				'2fa-option': 'Extra security',
				'sms-setup': 'Phone verification',
				'sms-verify': 'Enter code',
				'unlock': 'Private Local Memory',
				'sms-verify-unlock': 'Verify your identity',
				'2fa-prompt': 'Secure your account',
				'verification-success': 'Verified'
			};
			if (subtitle) {
				subtitle.textContent = subtitles[screenId] || 'Secure your AI assistant';
			}

			// Focus first input (handles both regular inputs and OTP inputs)
			setTimeout(() => {
				const otpContainer = document.querySelector('#' + screenId + ' .otp-container');
				if (otpContainer) {
					const firstOtp = otpContainer.querySelector('.otp-input');
					if (firstOtp) firstOtp.focus();
				} else {
					const input = document.querySelector('#' + screenId + ' input');
					if (input) input.focus();
				}
			}, 100);
		}

		// Error handling
		function showError(message) {
			const el = document.getElementById('error');
			el.textContent = message;
			el.classList.add('show');
		}

		function hideError() {
			document.getElementById('error').classList.remove('show');
		}

		// Message handling from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.command) {
				case 'navigate':
					showScreen(message.view);
					break;
				case 'error':
					showError(message.message);
					break;
			}
		});

		// Button handlers
		document.getElementById('btn-setup-pin').addEventListener('click', () => {
			const pin = document.getElementById('pin-setup').value;
			vscode.postMessage({ command: 'setupPin', pin });
		});

		document.getElementById('btn-confirm-pin').addEventListener('click', () => {
			const pin = document.getElementById('pin-confirm').value;
			vscode.postMessage({ command: 'confirmPin', pin });
		});

		document.getElementById('btn-back-setup').addEventListener('click', () => {
			showScreen('setup-pin');
		});

		document.getElementById('btn-setup-2fa').addEventListener('click', () => {
			vscode.postMessage({ command: 'setup2fa' });
		});

		document.getElementById('btn-skip-2fa').addEventListener('click', () => {
			vscode.postMessage({ command: 'skip2fa' });
		});

		document.getElementById('btn-send-code').addEventListener('click', () => {
			const countryCode = document.getElementById('country-select').value;
			const phoneDigits = document.getElementById('phone-input').value.replace(/\\D/g, '');
			const fullPhone = countryCode + phoneDigits;
			vscode.postMessage({ command: 'sendSmsCode', phone: fullPhone });
		});

		document.getElementById('btn-back-2fa').addEventListener('click', () => {
			showScreen('2fa-option');
		});

		// Phone number formatting
		const phoneInput = document.getElementById('phone-input');
		const countrySelect = document.getElementById('country-select');
		const phonePreview = document.getElementById('phone-preview');

		function formatPhoneNumber(value, format) {
			const digits = value.replace(/\\D/g, '');
			let formatted = '';
			let digitIndex = 0;

			for (let i = 0; i < format.length && digitIndex < digits.length; i++) {
				if (format[i] === '#') {
					formatted += digits[digitIndex++];
				} else {
					formatted += format[i];
				}
			}

			// Add remaining digits if format is exhausted
			if (digitIndex < digits.length) {
				formatted += digits.slice(digitIndex);
			}

			return formatted;
		}

		function updatePhonePreview() {
			const countryCode = countrySelect.value;
			const digits = phoneInput.value.replace(/\\D/g, '');

			if (digits.length > 0) {
				const fullNumber = countryCode + digits;
				const isValid = digits.length >= 7 && digits.length <= 15;
				phonePreview.textContent = 'Full number: ' + fullNumber;
				phonePreview.className = 'phone-preview' + (isValid ? ' valid' : '');
			} else {
				phonePreview.textContent = '';
			}
		}

		function updatePlaceholder() {
			const option = countrySelect.options[countrySelect.selectedIndex];
			const format = option.dataset.format || '##########';
			phoneInput.placeholder = format.replace(/#/g, '5');
		}

		phoneInput.addEventListener('input', (e) => {
			const option = countrySelect.options[countrySelect.selectedIndex];
			const format = option.dataset.format || '##########';
			const formatted = formatPhoneNumber(e.target.value, format);
			e.target.value = formatted;
			updatePhonePreview();
		});

		countrySelect.addEventListener('change', () => {
			updatePlaceholder();
			// Re-format existing number with new format
			const option = countrySelect.options[countrySelect.selectedIndex];
			const format = option.dataset.format || '##########';
			phoneInput.value = formatPhoneNumber(phoneInput.value, format);
			updatePhonePreview();
		});

		// Initialize placeholder
		updatePlaceholder();

		document.getElementById('btn-verify-code').addEventListener('click', () => {
			const code = getOtpValue('otp-setup');
			vscode.postMessage({ command: 'verifySmsCode', code });
		});

		document.getElementById('btn-unlock').addEventListener('click', () => {
			const pin = getOtpValue('otp-pin');
			vscode.postMessage({ command: 'verifyPin', pin });
		});

		document.getElementById('btn-verify-unlock').addEventListener('click', () => {
			const code = getOtpValue('otp-unlock');
			vscode.postMessage({ command: 'verifySmsCode', code });
		});

		document.getElementById('btn-resend-unlock').addEventListener('click', () => {
			// Clear the OTP inputs
			const container = document.getElementById('otp-unlock');
			if (container) {
				const inputs = container.querySelectorAll('.otp-input');
				inputs.forEach(input => input.value = '');
				inputs[0]?.focus();
			}
			// Request a new code
			vscode.postMessage({ command: 'resendSmsCode' });
		});

		// OTP Input Handling
		function getOtpValue(containerId) {
			const container = document.getElementById(containerId);
			if (!container) return '';
			const inputs = container.querySelectorAll('.otp-input');
			return Array.from(inputs).map(input => input.value).join('');
		}

		function setupOtpContainer(containerId) {
			const container = document.getElementById(containerId);
			if (!container) return;
			const inputs = container.querySelectorAll('.otp-input');

			inputs.forEach((input, index) => {
				// Handle input
				input.addEventListener('input', (e) => {
					const value = e.target.value;

					// Only allow digits
					if (value && !/^\\d$/.test(value)) {
						e.target.value = '';
						return;
					}

					// Update filled state
					if (value) {
						e.target.classList.add('filled');
						// Auto-focus next input
						if (index < inputs.length - 1) {
							inputs[index + 1].focus();
						}
					} else {
						e.target.classList.remove('filled');
					}
				});

				// Handle paste
				input.addEventListener('paste', (e) => {
					e.preventDefault();
					const pastedData = (e.clipboardData || window.clipboardData).getData('text');
					const maxDigits = inputs.length;
					const digits = pastedData.replace(/\\D/g, '').slice(0, maxDigits);

					digits.split('').forEach((digit, i) => {
						if (inputs[i]) {
							inputs[i].value = digit;
							inputs[i].classList.add('filled');
						}
					});

					// Focus last filled or next empty input
					const focusIndex = Math.min(digits.length, inputs.length - 1);
					inputs[focusIndex].focus();
				});

				// Handle backspace
				input.addEventListener('keydown', (e) => {
					if (e.key === 'Backspace') {
						if (!e.target.value && index > 0) {
							// If current input is empty, go back and clear previous
							inputs[index - 1].value = '';
							inputs[index - 1].classList.remove('filled');
							inputs[index - 1].focus();
							e.preventDefault();
						} else {
							e.target.classList.remove('filled');
						}
					} else if (e.key === 'ArrowLeft' && index > 0) {
						inputs[index - 1].focus();
						e.preventDefault();
					} else if (e.key === 'ArrowRight' && index < inputs.length - 1) {
						inputs[index + 1].focus();
						e.preventDefault();
					} else if (e.key === 'Enter') {
						// Submit on Enter if all fields filled
						const code = getOtpValue(containerId);
						if (code.length === inputs.length) {
							const btn = container.closest('.screen').querySelector('.btn-primary');
							if (btn) btn.click();
						}
					}
				});

				// Select all on focus
				input.addEventListener('focus', () => {
					input.select();
				});
			});
		}

		// Initialize OTP containers
		setupOtpContainer('otp-setup');
		setupOtpContainer('otp-unlock');
		setupOtpContainer('otp-pin');

		// SMS AutoFill handler (macOS/iOS)
		function setupSmsAutofill(autofillId, containerId) {
			const autofillInput = document.getElementById(autofillId);
			const container = document.getElementById(containerId);
			if (!autofillInput || !container) return;

			const inputs = container.querySelectorAll('.otp-input');

			autofillInput.addEventListener('input', (e) => {
				const code = e.target.value.replace(/\\D/g, '');
				if (code.length > 0) {
					// Distribute digits to individual inputs
					code.split('').forEach((digit, i) => {
						if (inputs[i]) {
							inputs[i].value = digit;
							inputs[i].classList.add('filled');
						}
					});
					// Focus the last filled or next empty input
					const nextIndex = Math.min(code.length, inputs.length - 1);
					inputs[nextIndex]?.focus();
					// Clear the autofill input
					autofillInput.value = '';
				}
			});
		}

		// Set up SMS autofill for verification screens
		setupSmsAutofill('otp-setup-autofill', 'otp-setup');
		setupSmsAutofill('otp-unlock-autofill', 'otp-unlock');

		// 2FA Prompt handlers
		document.getElementById('btn-enable-2fa-prompt')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'enable2faFromPrompt' });
		});

		document.getElementById('btn-remind-later')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'remindLater' });
		});

		document.getElementById('btn-dont-ask')?.addEventListener('click', () => {
			vscode.postMessage({ command: 'dontAskAgain' });
		});

		// Enter key support
		document.querySelectorAll('input').forEach(input => {
			input.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					const btn = input.closest('.screen').querySelector('.btn-primary');
					if (btn) btn.click();
				}
			});
		});

		// Auto-focus first input
		const activeScreen = document.querySelector('.screen.active');
		if (activeScreen) {
			const input = activeScreen.querySelector('input');
			if (input) input.focus();
		}
	</script>
</body>
</html>`;
	}
}
