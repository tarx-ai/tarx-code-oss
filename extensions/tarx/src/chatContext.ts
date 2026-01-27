/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DatabaseOperations, ProjectFile } from './database';
import { RagClient, buildContextString } from './ragClient';

/**
 * Types of file references that can be detected
 */
export type FileReferenceType = 'explicit' | 'semantic' | 'active';

/**
 * A detected file reference from user message
 */
export interface FileReference {
	type: FileReferenceType;
	path: string; // Relative path within project
	confidence: number; // 0-1 confidence score
	matchText: string; // The text that matched
}

/**
 * Loaded context from files
 */
export interface LoadedContext {
	files: Array<{
		path: string;
		content: string;
		language: string;
	}>;
	chunks: Array<{
		content: string;
		filePath: string;
		similarity: number;
	}>;
	totalTokens: number; // Approximate token count
}

/**
 * Code artifact extracted from LLM response
 */
export interface CodeArtifact {
	type: 'code' | 'diff' | 'file';
	language: string;
	content: string;
	filePath?: string; // Target file for the code
	action?: 'create' | 'replace' | 'insert';
}

/**
 * Parse file references from user message
 *
 * Supports:
 * - Explicit paths: "src/utils.js", "lib/auth/login.ts"
 * - Backtick paths: `src/utils.js`
 * - Semantic references: "the auth module", "authentication code"
 * - Active file reference (from sidebar)
 */
export function parseFileReferences(
	text: string,
	projectRoot: string,
	activeFile?: string,
	projectFiles?: ProjectFile[]
): FileReference[] {
	const refs: FileReference[] = [];
	const seenPaths = new Set<string>();

	// 1. Add active file if mentioned or implied
	if (activeFile) {
		const relativePath = path.relative(projectRoot, activeFile);
		if (!seenPaths.has(relativePath)) {
			refs.push({
				type: 'active',
				path: relativePath,
				confidence: 0.9,
				matchText: 'active file'
			});
			seenPaths.add(relativePath);
		}
	}

	// 2. Find explicit file paths in backticks: `path/to/file.ts`
	const backtickPattern = /`([^`]+\.[a-zA-Z0-9]+)`/g;
	let match;
	while ((match = backtickPattern.exec(text)) !== null) {
		const filePath = match[1];
		if (!seenPaths.has(filePath) && looksLikeFilePath(filePath)) {
			// Verify file exists
			const fullPath = path.join(projectRoot, filePath);
			if (fs.existsSync(fullPath)) {
				refs.push({
					type: 'explicit',
					path: filePath,
					confidence: 1.0,
					matchText: match[0]
				});
				seenPaths.add(filePath);
			}
		}
	}

	// 3. Find explicit file paths without backticks
	// Pattern: word boundaries + common path formats
	const pathPattern = /(?:^|\s|["'(])([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z0-9]+)/g;
	while ((match = pathPattern.exec(text)) !== null) {
		const filePath = match[1];
		if (!seenPaths.has(filePath) && looksLikeFilePath(filePath)) {
			const fullPath = path.join(projectRoot, filePath);
			if (fs.existsSync(fullPath)) {
				refs.push({
					type: 'explicit',
					path: filePath,
					confidence: 0.95,
					matchText: filePath
				});
				seenPaths.add(filePath);
			}
		}
	}

	// 4. Find filename-only references if we have project files
	if (projectFiles && projectFiles.length > 0) {
		// Pattern: standalone filenames like "utils.js" or "login.ts"
		const filenamePattern = /\b([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)\b/g;
		while ((match = filenamePattern.exec(text)) !== null) {
			const filename = match[1];
			if (!looksLikeFilePath(filename)) continue;

			// Find matching files in project
			const matches = projectFiles.filter(f =>
				path.basename(f.filePath) === filename
			);

			for (const fileMatch of matches) {
				if (!seenPaths.has(fileMatch.filePath)) {
					refs.push({
						type: 'explicit',
						path: fileMatch.filePath,
						confidence: matches.length === 1 ? 0.9 : 0.7,
						matchText: filename
					});
					seenPaths.add(fileMatch.filePath);
				}
			}
		}
	}

	// 5. Detect semantic references (will need RAG to resolve)
	const semanticPatterns = [
		/\b(?:the|in|from|to|of)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(?:module|file|component|class|function|service|handler|controller|model|util|helper)/gi,
		/\b([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(?:module|file|component|class|function|service|handler|controller|model|util|helper)/gi,
	];

	for (const pattern of semanticPatterns) {
		while ((match = pattern.exec(text)) !== null) {
			const semanticRef = match[1].toLowerCase().trim();
			if (semanticRef.length > 2 && !seenPaths.has(`semantic:${semanticRef}`)) {
				refs.push({
					type: 'semantic',
					path: semanticRef, // Will be resolved by RAG
					confidence: 0.6,
					matchText: match[0]
				});
				seenPaths.add(`semantic:${semanticRef}`);
			}
		}
	}

	return refs;
}

/**
 * Check if a string looks like a file path
 */
function looksLikeFilePath(str: string): boolean {
	// Must have a reasonable extension
	const ext = path.extname(str).toLowerCase();
	const codeExtensions = new Set([
		'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
		'.py', '.pyw', '.pyx',
		'.rs', '.go', '.java', '.kt', '.scala',
		'.c', '.cpp', '.cc', '.h', '.hpp',
		'.cs', '.fs', '.vb',
		'.rb', '.php', '.pl', '.pm',
		'.swift', '.m', '.mm',
		'.sql', '.sh', '.bash', '.zsh',
		'.html', '.css', '.scss', '.sass', '.less',
		'.json', '.yaml', '.yml', '.toml', '.xml',
		'.md', '.mdx', '.txt', '.rst',
		'.vue', '.svelte', '.astro',
	]);

	if (!codeExtensions.has(ext)) {
		return false;
	}

	// Should not contain invalid characters
	if (/[<>:"|?*]/.test(str)) {
		return false;
	}

	return true;
}

/**
 * Load context for the given file references
 */
export async function loadContext(
	refs: FileReference[],
	projectRoot: string,
	projectId: string,
	db: DatabaseOperations,
	ragClient: RagClient,
	userMessage: string,
	maxTokens: number = 4000
): Promise<LoadedContext> {
	const context: LoadedContext = {
		files: [],
		chunks: [],
		totalTokens: 0
	};

	const usedPaths = new Set<string>();
	let remainingTokens = maxTokens;

	// 1. Load explicit and active files first (highest confidence)
	const explicitRefs = refs.filter(r => r.type === 'explicit' || r.type === 'active');
	for (const ref of explicitRefs) {
		if (usedPaths.has(ref.path)) continue;

		const fullPath = path.join(projectRoot, ref.path);
		try {
			const content = fs.readFileSync(fullPath, 'utf-8');
			const tokens = estimateTokens(content);

			if (tokens > remainingTokens) {
				// File too large, will use chunks instead
				continue;
			}

			context.files.push({
				path: ref.path,
				content,
				language: getLanguageFromPath(ref.path)
			});

			usedPaths.add(ref.path);
			remainingTokens -= tokens;
			context.totalTokens += tokens;
		} catch (e) {
			console.warn(`[TARX] Failed to load file: ${ref.path}`, e);
		}
	}

	// 2. Use RAG for semantic references and large files
	if (remainingTokens > 500) {
		try {
			// Embed the user message
			const queryEmbedding = await ragClient.embed(userMessage);

			// Search for relevant chunks
			const searchResults = await db.searchEmbeddings(
				projectId,
				queryEmbedding,
				10 // Get top 10 chunks
			);

			// Filter out chunks from files we already loaded fully
			const relevantChunks = searchResults.filter(
				chunk => !usedPaths.has(chunk.filePath)
			);

			// Add chunks within token budget
			for (const chunk of relevantChunks) {
				const tokens = estimateTokens(chunk.content);
				if (tokens > remainingTokens) continue;

				context.chunks.push(chunk);
				remainingTokens -= tokens;
				context.totalTokens += tokens;
			}
		} catch (e) {
			console.warn('[TARX] RAG search failed:', e);
		}
	}

	// 3. Try to resolve semantic references
	const semanticRefs = refs.filter(r => r.type === 'semantic');
	for (const ref of semanticRefs) {
		// Try to find files matching the semantic reference
		const projectFiles = await db.getProjectFiles(projectId);
		const candidates = projectFiles.filter(f => {
			const filename = path.basename(f.filePath).toLowerCase();
			const dirname = path.dirname(f.filePath).toLowerCase();
			const searchTerm = ref.path.toLowerCase();

			return filename.includes(searchTerm) ||
				dirname.includes(searchTerm) ||
				f.filePath.toLowerCase().includes(searchTerm);
		});

		for (const candidate of candidates.slice(0, 2)) {
			if (usedPaths.has(candidate.filePath)) continue;

			const fullPath = path.join(projectRoot, candidate.filePath);
			try {
				const content = fs.readFileSync(fullPath, 'utf-8');
				const tokens = estimateTokens(content);

				if (tokens <= remainingTokens) {
					context.files.push({
						path: candidate.filePath,
						content,
						language: getLanguageFromPath(candidate.filePath)
					});

					usedPaths.add(candidate.filePath);
					remainingTokens -= tokens;
					context.totalTokens += tokens;
				}
			} catch (e) {
				console.warn(`[TARX] Failed to load semantic file: ${candidate.filePath}`, e);
			}
		}
	}

	return context;
}

/**
 * Build the full prompt with context injection
 */
export function buildPrompt(
	userMessage: string,
	context: LoadedContext,
	systemPrompt?: string
): string {
	let prompt = '';

	// Add system instructions
	const system = systemPrompt || `You are TARX, a local-first AI coding assistant. You have access to the user's project files and can provide context-aware assistance.

When suggesting code changes:
- Use markdown code blocks with language identifiers
- If modifying an existing file, show the changes clearly
- Be concise but thorough

Available context from the user's project is provided below.`;

	prompt += system + '\n\n';

	// Add file context
	if (context.files.length > 0) {
		prompt += '## Project Files\n\n';
		for (const file of context.files) {
			prompt += `### ${file.path}\n`;
			prompt += '```' + file.language + '\n';
			prompt += file.content + '\n';
			prompt += '```\n\n';
		}
	}

	// Add chunk context from RAG
	if (context.chunks.length > 0) {
		prompt += '## Related Code Snippets\n\n';
		prompt += buildContextString(context.chunks, 2000);
		prompt += '\n\n';
	}

	// Add user message
	prompt += '## User Request\n\n';
	prompt += userMessage;

	return prompt;
}

/**
 * Parse code artifacts from LLM response
 */
export function parseArtifacts(response: string): CodeArtifact[] {
	const artifacts: CodeArtifact[] = [];

	// Pattern for code blocks with optional file path
	// Matches: ```language:path/to/file.ts or just ```language
	const codeBlockPattern = /```([a-zA-Z0-9_+-]+)(?::([^\n]+))?\n([\s\S]*?)```/g;

	let match;
	while ((match = codeBlockPattern.exec(response)) !== null) {
		const language = match[1].toLowerCase();
		const filePath = match[2]?.trim();
		const content = match[3];

		// Determine artifact type
		let type: CodeArtifact['type'] = 'code';
		if (language === 'diff' || content.startsWith('---') || content.startsWith('@@')) {
			type = 'diff';
		} else if (filePath) {
			type = 'file';
		}

		// Determine action from context
		let action: CodeArtifact['action'];
		const beforeBlock = response.slice(Math.max(0, match.index - 100), match.index).toLowerCase();
		if (beforeBlock.includes('create') || beforeBlock.includes('new file')) {
			action = 'create';
		} else if (beforeBlock.includes('replace') || beforeBlock.includes('update')) {
			action = 'replace';
		} else if (beforeBlock.includes('add') || beforeBlock.includes('insert')) {
			action = 'insert';
		}

		artifacts.push({
			type,
			language,
			content,
			filePath,
			action
		});
	}

	return artifacts;
}

/**
 * Apply a code artifact to a file
 */
export async function applyArtifact(
	artifact: CodeArtifact,
	projectRoot: string
): Promise<{ success: boolean; message: string }> {
	if (!artifact.filePath) {
		return { success: false, message: 'No file path specified' };
	}

	const fullPath = path.join(projectRoot, artifact.filePath);

	try {
		if (artifact.type === 'diff') {
			// Apply diff - simplified, would need proper diff parsing
			return { success: false, message: 'Diff application not yet implemented' };
		}

		if (artifact.action === 'create') {
			// Create new file
			const dir = path.dirname(fullPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(fullPath, artifact.content, 'utf-8');
			return { success: true, message: `Created ${artifact.filePath}` };
		}

		if (artifact.action === 'replace' || !artifact.action) {
			// Replace file content
			fs.writeFileSync(fullPath, artifact.content, 'utf-8');
			return { success: true, message: `Updated ${artifact.filePath}` };
		}

		if (artifact.action === 'insert') {
			// Append to file
			fs.appendFileSync(fullPath, '\n' + artifact.content, 'utf-8');
			return { success: true, message: `Appended to ${artifact.filePath}` };
		}

		return { success: false, message: 'Unknown action' };
	} catch (e) {
		const error = e instanceof Error ? e.message : 'Unknown error';
		return { success: false, message: `Failed to apply: ${error}` };
	}
}

/**
 * Estimate token count from text (rough approximation)
 * Rule of thumb: ~4 characters per token for code
 */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Get language identifier from file path
 */
function getLanguageFromPath(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	const languageMap: Record<string, string> = {
		'.ts': 'typescript',
		'.tsx': 'typescript',
		'.js': 'javascript',
		'.jsx': 'javascript',
		'.mjs': 'javascript',
		'.cjs': 'javascript',
		'.py': 'python',
		'.rs': 'rust',
		'.go': 'go',
		'.java': 'java',
		'.kt': 'kotlin',
		'.scala': 'scala',
		'.c': 'c',
		'.cpp': 'cpp',
		'.cc': 'cpp',
		'.h': 'c',
		'.hpp': 'cpp',
		'.cs': 'csharp',
		'.rb': 'ruby',
		'.php': 'php',
		'.swift': 'swift',
		'.sql': 'sql',
		'.sh': 'bash',
		'.bash': 'bash',
		'.zsh': 'zsh',
		'.html': 'html',
		'.css': 'css',
		'.scss': 'scss',
		'.sass': 'sass',
		'.less': 'less',
		'.json': 'json',
		'.yaml': 'yaml',
		'.yml': 'yaml',
		'.toml': 'toml',
		'.xml': 'xml',
		'.md': 'markdown',
		'.mdx': 'mdx',
		'.vue': 'vue',
		'.svelte': 'svelte',
	};

	return languageMap[ext] || 'plaintext';
}
