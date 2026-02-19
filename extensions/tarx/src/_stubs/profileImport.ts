/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Profile Import
 *  - Decodes invite code payloads from web signup
 *  - Stores user profile in database via MCP
 *--------------------------------------------------------------------------------------------*/

export interface ProfilePayload {
	name?: string;
	email?: string;
	tier?: string;
	interests?: string[];
	company?: string;
}

/**
 * Extract profile data from invite code.
 * Format: TARX-WORD-DIGITS#base64payload
 * Payload is JSON: { name, email, tier, interests[], company? }
 */
export function decodeInvitePayload(fullCode: string): ProfilePayload | null {
	const parts = fullCode.split('#');
	if (parts.length < 2) {
		return null;
	}

	const base64 = parts.slice(1).join('#');

	try {
		const json = Buffer.from(base64, 'base64').toString('utf-8');
		const payload = JSON.parse(json) as ProfilePayload;
		return payload;
	} catch {
		// Not valid base64 or JSON — no payload
		return null;
	}
}

/**
 * Create a base64 encoded payload for testing.
 */
export function encodeInvitePayload(payload: ProfilePayload): string {
	return Buffer.from(JSON.stringify(payload)).toString('base64');
}
