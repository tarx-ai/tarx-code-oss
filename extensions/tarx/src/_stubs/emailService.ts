/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Email Service
 *  - Sends weekly report emails via Resend API
 *  - Falls back to in-app notification if no API key
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

const RESEND_API_URL = 'https://api.resend.com/emails';
const WEEKLY_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Check once per day
const LAST_SENT_KEY = 'tarx.weeklyEmailLastSent';

export class EmailService {
	private timer: ReturnType<typeof setInterval> | null = null;
	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Send an email via Resend API.
	 */
	async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
		const apiKey = process.env.RESEND_API_KEY;
		if (!apiKey) {
			console.log('[TARX Email] No RESEND_API_KEY — skipping email send');
			return false;
		}

		try {
			const response = await fetch(RESEND_API_URL, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					from: 'TARX <weekly@tarx.dev>',
					to: [to],
					subject,
					html
				})
			});

			if (response.ok) {
				console.log(`[TARX Email] Sent weekly email to ${to}`);
				return true;
			}

			console.error(`[TARX Email] Send failed: ${response.status}`);
			return false;
		} catch (error) {
			console.error('[TARX Email] Error:', error);
			return false;
		}
	}

	/**
	 * Start the weekly email scheduler.
	 * Checks daily if a weekly email is due.
	 */
	startScheduler(): void {
		if (this.timer) { return; }

		// Check on startup
		this.checkAndSend();

		// Then check daily
		this.timer = setInterval(() => this.checkAndSend(), WEEKLY_CHECK_INTERVAL);
	}

	stopScheduler(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async checkAndSend(): Promise<void> {
		const lastSent = this.context.globalState.get<number>(LAST_SENT_KEY, 0);
		const now = Date.now();
		const weekMs = 7 * 24 * 60 * 60 * 1000;

		if (now - lastSent < weekMs) {
			return; // Not due yet
		}

		// Check if user has email in profile
		try {
			const ext = vscode.extensions.getExtension('tarx.tarx');
			if (!ext?.isActive || !ext.exports?.mcpCall) { return; }

			const profile = await ext.exports.mcpCall('tarx_get_profile', { userId: 'default' });
			if (!profile?.email) {
				// No email configured — show in-app notification instead
				this.showInAppNotification();
				await this.context.globalState.update(LAST_SENT_KEY, now);
				return;
			}

			// Generate and send
			const report = await ext.exports.mcpCall('tarx_weekly_report', { week_offset: -1 });
			if (report && report.messages_sent > 0) {
				const { generateWeeklyEmailHtml } = await import('./weeklyEmail.js');
				const html = generateWeeklyEmailHtml({
					...report,
					period_start: report.period?.start || '',
					period_end: report.period?.end || '',
					user_name: profile.display_name || undefined
				});

				const sent = await this.sendEmail(
					profile.email,
					`Your Week with TARX — ${report.messages_sent} messages, ${report.estimated_minutes_saved}m saved`,
					html
				);

				if (sent) {
					await this.context.globalState.update(LAST_SENT_KEY, now);
				}
			}
		} catch {
			// Don't crash on scheduler errors
		}
	}

	private showInAppNotification(): void {
		vscode.window.showInformationMessage(
			'Your TARX weekly report is ready!',
			'View Report'
		).then(choice => {
			if (choice === 'View Report') {
				vscode.commands.executeCommand('tarx.openWeeklyReport');
			}
		});
	}
}
