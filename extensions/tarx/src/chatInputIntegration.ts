/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChatFileAttachmentAdapter } from './chatFileAttachment';
import { DatabaseOperations } from './database';

/**
 * Chat Input Integration
 *
 * Bridges VS Code's chat UI with TARX's RAG pipeline for file attachments.
 * This enables:
 * - Upload button in chat composer
 * - Drag-and-drop file handling
 * - Automatic RAG processing of attached files
 */
export class ChatInputIntegration {
	private attachmentAdapter: ChatFileAttachmentAdapter;
	private outputChannel: vscode.OutputChannel;

	constructor(
		private database: DatabaseOperations,
		outputChannel: vscode.OutputChannel
	) {
		this.outputChannel = outputChannel;
		this.attachmentAdapter = new ChatFileAttachmentAdapter(database, outputChannel);
	}

	/**
	 * Register chat input commands and event handlers
	 */
	register(context: vscode.ExtensionContext): void {
		// Command: Attach file via upload button
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.chat.uploadFile', async () => {
				await this.handleUploadButton();
			})
		);

		// Command: Handle drag-and-drop files
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.chat.handleFileDrop', async (uris: vscode.Uri[]) => {
				await this.handleFileDrop(uris);
			})
		);

		this.outputChannel.appendLine('[Chat Input] Integration registered');
	}

	/**
	 * Handle upload button click - opens file picker and processes files
	 */
	private async handleUploadButton(): Promise<void> {
		try {
			const fileUris = await vscode.window.showOpenDialog({
				canSelectMany: true,
				canSelectFiles: true,
				canSelectFolders: false,
				openLabel: 'Attach to Chat',
				title: 'Select Files to Attach',
				filters: {
					'All Files': ['*'],
					'Text Files': ['txt', 'md', 'markdown'],
					'Code Files': ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs'],
					'Config Files': ['json', 'yaml', 'yml', 'xml', 'toml', 'ini'],
					'Documents': ['pdf', 'doc', 'docx']
				}
			});

			if (!fileUris || fileUris.length === 0) {
				return;
			}

			this.outputChannel.appendLine(`[Chat Input] Uploading ${fileUris.length} files`);

			// Process files through RAG pipeline
			await this.processFiles(fileUris);

			vscode.window.showInformationMessage(
				`Attached ${fileUris.length} file(s) to chat with RAG indexing`
			);

		} catch (error) {
			this.outputChannel.appendLine(`[Chat Input] Upload error: ${error}`);
			vscode.window.showErrorMessage('Failed to attach files to chat');
		}
	}

	/**
	 * Handle files dropped into chat composer
	 */
	async handleFileDrop(uris: vscode.Uri[]): Promise<void> {
		if (!uris || uris.length === 0) {
			return;
		}

		this.outputChannel.appendLine(`[Chat Input] Processing ${uris.length} dropped files`);

		try {
			await this.processFiles(uris);

			vscode.window.showInformationMessage(
				`Processed ${uris.length} file(s) through RAG pipeline`
			);
		} catch (error) {
			this.outputChannel.appendLine(`[Chat Input] Drop error: ${error}`);
			vscode.window.showErrorMessage('Failed to process dropped files');
		}
	}

	/**
	 * Process files through TARX RAG pipeline and attach to chat
	 */
	private async processFiles(uris: vscode.Uri[]): Promise<void> {
		const results = await Promise.allSettled(
			uris.map(uri => this.processFile(uri))
		);

		// Log results
		const successful = results.filter(r => r.status === 'fulfilled').length;
		const failed = results.filter(r => r.status === 'rejected').length;

		this.outputChannel.appendLine(
			`[Chat Input] Processed: ${successful} successful, ${failed} failed`
		);

		// Log failures
		results.forEach((result, index) => {
			if (result.status === 'rejected') {
				this.outputChannel.appendLine(
					`[Chat Input] Failed: ${uris[index].fsPath} - ${result.reason}`
				);
			}
		});
	}

	/**
	 * Process a single file through RAG pipeline
	 */
	private async processFile(uri: vscode.Uri): Promise<void> {
		const filePath = uri.fsPath;

		// Use ChatFileAttachmentAdapter to handle RAG pipeline + VS Code attachment
		const success = await this.attachmentAdapter.attachFileToChat(filePath);

		if (!success) {
			throw new Error(`Failed to attach ${filePath}`);
		}

		this.outputChannel.appendLine(`[Chat Input] ✓ Processed: ${filePath}`);
	}

	/**
	 * Get current attachment count (useful for UI badges)
	 */
	async getAttachmentCount(): Promise<number> {
		const db = this.database.getDb() as any;
		if (!db) {
			return 0;
		}

		return new Promise((resolve, reject) => {
			db.get('SELECT COUNT(*) as count FROM files', (err: Error | null, row: any) => {
				if (err) {
					reject(err);
				} else {
					resolve(row.count || 0);
				}
			});
		});
	}

	/**
	 * Clear all attachments for current session
	 */
	async clearAttachments(): Promise<void> {
		// This would integrate with ChatAttachmentModel in VS Code
		// For now, just clear TARX-specific data
		this.outputChannel.appendLine('[Chat Input] Clearing attachments');

		// Note: VS Code's ChatAttachmentModel is managed by the core chat widget
		// We can't directly clear it from here, but we can clear our RAG data
	}
}

/**
 * Create and register chat input integration
 */
export function registerChatInputIntegration(
	context: vscode.ExtensionContext,
	database: DatabaseOperations,
	outputChannel: vscode.OutputChannel
): ChatInputIntegration {
	const integration = new ChatInputIntegration(database, outputChannel);
	integration.register(context);

	// Store globally for external access (e.g., from core drag-and-drop handler)
	globalChatInputIntegration = integration;

	return integration;
}

// Global instance for external access
let globalChatInputIntegration: ChatInputIntegration | undefined;

/**
 * Process files dropped into chat (called from VS Code core)
 *
 * This function is called by the ChatDragAndDrop handler in VS Code core
 * to process files through the TARX RAG pipeline.
 */
export async function processTarxFileDrop(uris: vscode.Uri[]): Promise<void> {
	if (!globalChatInputIntegration) {
		throw new Error('Chat input integration not initialized');
	}

	await globalChatInputIntegration['handleFileDrop'](uris);
}
