/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { RagClient, chunkText } from './ragClient';
import { DatabaseOperations } from './database';

/**
 * Chat File Attachment Adapter
 *
 * Bridges the gap between TARX's file upload system (sidebar) and the VS Code chat
 * attachment system. When files are uploaded via the sidebar or drag-dropped into chat,
 * this adapter:
 *
 * 1. Chunks the file content for RAG
 * 2. Generates embeddings via the embedding server (port 11437)
 * 3. Stores in the database for semantic search
 * 4. Attaches the file to the current chat context
 */
export class ChatFileAttachmentAdapter {
	private ragClient: RagClient;
	private database: DatabaseOperations;
	private outputChannel: vscode.OutputChannel;

	constructor(database: DatabaseOperations, outputChannel: vscode.OutputChannel) {
		this.database = database;
		this.ragClient = new RagClient();
		this.outputChannel = outputChannel;
	}

	/**
	 * Attach a file to the chat and process it through RAG pipeline
	 *
	 * @param filePath Absolute path to the file
	 * @param spaceId Optional space ID for context isolation
	 * @returns Success status
	 */
	async attachFileToChat(filePath: string, spaceId?: string): Promise<boolean> {
		try {
			this.outputChannel.appendLine(`[File Attachment] Processing: ${filePath}`);

			// Read file content
			const uri = vscode.Uri.file(filePath);
			const content = await vscode.workspace.fs.readFile(uri);
			const text = Buffer.from(content).toString('utf8');

			if (!text || text.trim().length === 0) {
				this.outputChannel.appendLine(`[File Attachment] Skipping empty file: ${filePath}`);
				return false;
			}

			const filename = path.basename(filePath);
			const fileExtension = path.extname(filePath).toLowerCase();

			// Get current space context
			const activeSpaceId = spaceId || await this.getCurrentSpaceId();

			// Process through RAG pipeline
			await this.processFileForRAG(
				filename,
				text,
				filePath,
				activeSpaceId,
				fileExtension
			);

			// Attach to active chat via VS Code chat API
			await this.attachToVSCodeChat(uri, filename);

			this.outputChannel.appendLine(`[File Attachment] ✓ Attached: ${filename}`);
			return true;

		} catch (error) {
			this.outputChannel.appendLine(`[File Attachment] ✗ Error: ${error}`);
			console.error('[TARX File Attachment]', error);
			return false;
		}
	}

	/**
	 * Process file through RAG pipeline: chunk → embed → store
	 */
	private async processFileForRAG(
		filename: string,
		content: string,
		filePath: string,
		spaceId: string,
		fileExtension: string
	): Promise<void> {
		// 1. Chunk the content
		const chunks = chunkText(content, 512, 128);
		this.outputChannel.appendLine(`[RAG] Chunked into ${chunks.length} pieces`);

		if (chunks.length === 0) {
			return;
		}

		// 2. Generate embeddings
		const chunkTexts = chunks.map(c => c.content);
		const embeddings = await this.ragClient.embedBatch(chunkTexts);
		this.outputChannel.appendLine(`[RAG] Generated ${embeddings.length} embeddings`);

		// 3. Store in database
		const db = this.database.getDb() as any;
		if (!db) {
			throw new Error('Database not available');
		}

		// Insert file record
		const fileId = await new Promise<number>((resolve, reject) => {
			db.run(
				`INSERT INTO files (space_id, filename, file_path, mime_type, size, created_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
				[
					spaceId,
					filename,
					filePath,
					this.getMimeType(fileExtension),
					content.length,
					Date.now()
				],
				function (this: any, err: Error | null) {
					if (err) reject(err);
					else resolve(this.lastID);
				}
			);
		});

		// Insert chunks with embeddings
		const stmt = db.prepare(`
			INSERT INTO embeddings (file_id, chunk_index, content, embedding, created_at)
			VALUES (?, ?, ?, ?, ?)
		`);

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			const embedding = embeddings[i];

			// Convert Float32Array to Buffer for SQLite blob storage
			const embeddingBuffer = Buffer.from(embedding.buffer);

			stmt.run(
				fileId,
				chunk.index,
				chunk.content,
				embeddingBuffer,
				Date.now()
			);
		}

		stmt.finalize();
		this.outputChannel.appendLine(`[RAG] Stored ${chunks.length} chunks in database`);
	}

	/**
	 * Attach file to VS Code chat context
	 * This makes the file available in the chat's attachment context
	 */
	private async attachToVSCodeChat(uri: vscode.Uri, filename: string): Promise<void> {
		// Use VS Code's chat attach file command
		// This integrates with the existing ChatAttachmentModel
		await vscode.commands.executeCommand('workbench.action.chat.attachFile', uri);
	}

	/**
	 * Get current active space ID from database
	 */
	private async getCurrentSpaceId(): Promise<string> {
		const db = this.database.getDb() as any;
		if (!db) {
			// Default space ID
			return 'default-space';
		}

		return new Promise((resolve, reject) => {
			db.get(
				`SELECT id FROM spaces WHERE is_active = 1 LIMIT 1`,
				(err: Error | null, row: any) => {
					if (err) {
						reject(err);
					} else if (row) {
						resolve(row.id);
					} else {
						// No active space, use default
						resolve('default-space');
					}
				}
			);
		});
	}

	/**
	 * Get MIME type from file extension
	 */
	private getMimeType(extension: string): string {
		const mimeTypes: Record<string, string> = {
			'.txt': 'text/plain',
			'.md': 'text/markdown',
			'.js': 'text/javascript',
			'.ts': 'text/typescript',
			'.jsx': 'text/jsx',
			'.tsx': 'text/tsx',
			'.py': 'text/x-python',
			'.json': 'application/json',
			'.xml': 'application/xml',
			'.html': 'text/html',
			'.css': 'text/css',
			'.yml': 'text/yaml',
			'.yaml': 'text/yaml',
		};

		return mimeTypes[extension] || 'text/plain';
	}

	/**
	 * Batch attach multiple files
	 */
	async attachMultipleFiles(filePaths: string[], spaceId?: string): Promise<number> {
		let successCount = 0;

		for (const filePath of filePaths) {
			const success = await this.attachFileToChat(filePath, spaceId);
			if (success) {
				successCount++;
			}
		}

		return successCount;
	}

	/**
	 * Handle file drop event from chat widget
	 * This is called when user drags files into the chat composer
	 */
	async handleFileDrop(files: vscode.Uri[]): Promise<void> {
		const filePaths = files.map(uri => uri.fsPath);
		const count = await this.attachMultipleFiles(filePaths);

		vscode.window.showInformationMessage(
			`Attached ${count} of ${files.length} file(s) to chat`
		);
	}
}
