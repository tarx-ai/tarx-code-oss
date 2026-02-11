/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Register chat input actions
 *
 * This file registers VS Code actions that appear in the chat input area:
 * - Upload file button (attach icon)
 * - Drag-and-drop handler
 */
export function registerChatInputActions(context: vscode.ExtensionContext): void {
	// Note: The actual action registration happens via package.json contributions
	// This file contains the command handlers

	console.log('[TARX] Chat input actions registered');

	// Commands are registered in extension.ts via chatInputIntegration
	// - tarx.chat.uploadFile (upload button)
	// - tarx.chat.handleFileDrop (drag-and-drop)
}

/**
 * Get upload button configuration for package.json
 *
 * This should be added to package.json under "commands" and "menus":
 *
 * ```json
 * {
 *   "commands": [
 *     {
 *       "command": "tarx.chat.uploadFile",
 *       "title": "Attach Files with RAG",
 *       "category": "TARX",
 *       "icon": "$(attach)"
 *     }
 *   ],
 *   "menus": {
 *     "commandPalette": [
 *       {
 *         "command": "tarx.chat.uploadFile",
 *         "when": "chatIsEnabled"
 *       }
 *     ]
 *   }
 * }
 * ```
 */
export const UPLOAD_BUTTON_CONFIG = {
	command: 'tarx.chat.uploadFile',
	title: 'Attach Files with RAG',
	category: 'TARX',
	icon: '$(attach)',
	when: 'chatIsEnabled'
};

/**
 * Instructions for adding upload button to chat input toolbar
 *
 * To add the upload button to the chat input toolbar in VS Code core:
 *
 * 1. Open: src/vs/workbench/contrib/chat/browser/actions/chatContextActions.ts
 *
 * 2. Add to registerChatContextActions():
 *
 *    registerAction2(class TarxAttachFileAction extends Action2 {
 *      constructor() {
 *        super({
 *          id: 'tarx.chat.uploadFile',
 *          title: localize('tarx.chat.uploadFile', 'Attach Files with RAG'),
 *          icon: Codicon.attach,
 *          menu: {
 *            id: MenuId.ChatInput,
 *            group: 'navigation',
 *            order: 1
 *          }
 *        });
 *      }
 *
 *      async run(accessor: ServicesAccessor) {
 *        await vscode.commands.executeCommand('tarx.chat.uploadFile');
 *      }
 *    });
 *
 * 3. The command 'tarx.chat.uploadFile' is registered by the TARX extension
 *    in chatInputIntegration.ts and will handle the file upload + RAG processing.
 */
