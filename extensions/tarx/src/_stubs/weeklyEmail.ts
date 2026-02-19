/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Weekly Email Template
 *  - Generates inline-CSS HTML email from WeeklyMetrics
 *  - Sections: Hero stat, Activity breakdown, CTA
 *--------------------------------------------------------------------------------------------*/

export interface EmailMetrics {
	messages_sent: number;
	sessions_active: number;
	tokens_used: number;
	estimated_minutes_saved: number;
	knowledge_items: number;
	skills_installed: number;
	period_start: string;
	period_end: string;
	user_name?: string;
}

export function generateWeeklyEmailHtml(metrics: EmailMetrics): string {
	const name = metrics.user_name || 'there';
	const hours = Math.floor(metrics.estimated_minutes_saved / 60);
	const mins = metrics.estimated_minutes_saved % 60;
	const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Your Week with TARX</title>
</head>
<body style="margin: 0; padding: 0; background: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
	<table width="100%" cellpadding="0" cellspacing="0" style="background: #0a0a0f;">
		<tr>
			<td align="center" style="padding: 40px 20px;">
				<table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
					<!-- Header -->
					<tr>
						<td style="text-align: center; padding-bottom: 24px;">
							<h1 style="font-size: 24px; font-weight: 600; background: linear-gradient(135deg, #a855f7, #FF326D); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0;">
								Your Week with TARX
							</h1>
							<p style="color: #71717a; font-size: 14px; margin: 4px 0 0;">
								${metrics.period_start} — ${metrics.period_end}
							</p>
						</td>
					</tr>

					<!-- Greeting -->
					<tr>
						<td style="color: #e4e4e7; font-size: 15px; padding-bottom: 24px;">
							Hey ${name}, here's what you accomplished this week.
						</td>
					</tr>

					<!-- Hero Stat -->
					<tr>
						<td style="background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; text-align: center; padding: 24px;">
							<div style="font-size: 36px; font-weight: 700; background: linear-gradient(135deg, #a855f7, #FF326D); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
								${timeStr}
							</div>
							<div style="color: #71717a; font-size: 13px; margin-top: 4px;">Estimated time saved</div>
						</td>
					</tr>

					<!-- Stats Grid -->
					<tr>
						<td style="padding-top: 16px;">
							<table width="100%" cellpadding="0" cellspacing="8">
								<tr>
									<td width="33%" style="background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; text-align: center; padding: 16px;">
										<div style="font-size: 22px; font-weight: 600; color: #a855f7;">${metrics.messages_sent}</div>
										<div style="color: #71717a; font-size: 11px;">Messages</div>
									</td>
									<td width="33%" style="background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; text-align: center; padding: 16px;">
										<div style="font-size: 22px; font-weight: 600; color: #a855f7;">${metrics.sessions_active}</div>
										<div style="color: #71717a; font-size: 11px;">Sessions</div>
									</td>
									<td width="33%" style="background: #12121a; border: 1px solid #1e1e2e; border-radius: 8px; text-align: center; padding: 16px;">
										<div style="font-size: 22px; font-weight: 600; color: #a855f7;">${metrics.knowledge_items}</div>
										<div style="color: #71717a; font-size: 11px;">Knowledge Items</div>
									</td>
								</tr>
							</table>
						</td>
					</tr>

					<!-- CTA -->
					<tr>
						<td style="text-align: center; padding: 32px 0;">
							<a href="tarx://open" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #a855f7, #FF326D); color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
								Open TARX
							</a>
						</td>
					</tr>

					<!-- Footer -->
					<tr>
						<td style="text-align: center; padding-top: 24px; border-top: 1px solid #1e1e2e;">
							<p style="color: #71717a; font-size: 11px; margin: 0;">
								TARX — Local. Private. Proactive.
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;
}
