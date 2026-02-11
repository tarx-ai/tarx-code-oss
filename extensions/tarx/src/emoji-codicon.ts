/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared Emoji → Codicon mapping for space/project icons from the database.
 * Used by all sidebar tree providers to convert emoji stored in memory.db
 * into VS Code ThemeIcon codicons.
 */

import * as vscode from 'vscode';

export const EMOJI_TO_CODICON: Record<string, string> = {
	'🔌': 'plug', '💬': 'comment-discussion', '🧠': 'brain',
	'🐛': 'bug', '🚀': 'rocket', '🧪': 'beaker',
	'🧬': 'pulse', '🤖': 'hubot', '📁': 'file-directory',
	'🔧': 'tools', '⚡': 'zap', '📝': 'note',
	'📚': 'book', '🌐': 'globe', '🎨': 'paintcan',
	'🔗': 'plug', '📊': 'graph', '🛡️': 'shield',
	'💻': 'terminal', '🎯': 'target', '🔍': 'search',
	'📦': 'package', '🌟': 'star-full',
	'⚙️': 'settings-gear', '🔥': 'flame',
};

/**
 * Convert a database emoji to a VS Code ThemeIcon.
 * Falls back to 'comment-discussion' if emoji is unknown.
 */
export function emojiToCodeicon(emoji: string | undefined, color?: vscode.ThemeColor): vscode.ThemeIcon {
	if (emoji && EMOJI_TO_CODICON[emoji]) {
		return new vscode.ThemeIcon(EMOJI_TO_CODICON[emoji], color || new vscode.ThemeColor('charts.blue'));
	}
	return new vscode.ThemeIcon('comment-discussion', color || new vscode.ThemeColor('charts.blue'));
}
