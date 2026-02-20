/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * RAG (Retrieval-Augmented Generation) client for TARX
 * Communicates with the embedding server on port 11437
 */

export interface EmbeddingResponse {
	embeddings: number[][];
	model: string;
	usage?: {
		prompt_tokens: number;
		total_tokens: number;
	};
}

export interface EmbeddingRequest {
	input: string | string[];
	model?: string;
}

/**
 * HTTP client for communicating with TARX embedding server (nomic-embed)
 * Default port: 11437
 */
export class RagClient {
	private serverUrl: string;
	private embeddingDimension: number = 768; // nomic-embed-text-v1.5 dimension

	constructor(serverUrl: string = 'http://localhost:11437') {
		this.serverUrl = serverUrl;
	}

	setServerUrl(url: string): void {
		this.serverUrl = url;
	}

	/**
	 * Check if embedding server is healthy
	 */
	async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; model?: string }> {
		const start = Date.now();
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);

			const response = await fetch(`${this.serverUrl}/health`, {
				signal: controller.signal
			});

			clearTimeout(timeoutId);
			const latencyMs = Date.now() - start;

			if (response.ok) {
				try {
					const data = await response.json() as { status: string; model?: string };
					return { healthy: true, latencyMs, model: data.model || 'nomic-embed' };
				} catch {
					return { healthy: true, latencyMs, model: 'nomic-embed' };
				}
			}
			return { healthy: false, latencyMs };
		} catch {
			return { healthy: false, latencyMs: Date.now() - start };
		}
	}

	/**
	 * Get embedding for a single text.
	 * task: 'search_query' for retrieval queries, 'search_document' for storage.
	 * nomic-embed-text-v1.5 uses these prefixes for better quality.
	 */
	async embed(text: string, task: 'search_query' | 'search_document' = 'search_query'): Promise<Float32Array> {
		const prefixed = `${task}: ${text}`;
		const response = await fetch(`${this.serverUrl}/v1/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				input: prefixed,
				model: 'nomic-embed-text-v1.5'
			})
		});

		if (!response.ok) {
			throw new Error(`Embedding failed: ${response.status} ${response.statusText}`);
		}

		const data = await response.json() as { data: Array<{ embedding: number[] }> };
		if (!data.data?.[0]?.embedding) {
			throw new Error('Invalid embedding response');
		}

		return new Float32Array(data.data[0].embedding);
	}

	/**
	 * Get embeddings for multiple texts (batch).
	 * task: 'search_document' for storage (default), 'search_query' for retrieval.
	 */
	async embedBatch(texts: string[], task: 'search_query' | 'search_document' = 'search_document'): Promise<Float32Array[]> {
		if (texts.length === 0) return [];

		// Batch in groups of 32 for efficiency
		const batchSize = 32;
		const results: Float32Array[] = [];

		for (let i = 0; i < texts.length; i += batchSize) {
			const batch = texts.slice(i, i + batchSize).map(t => `${task}: ${t}`);

			const response = await fetch(`${this.serverUrl}/v1/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					input: batch,
					model: 'nomic-embed-text-v1.5'
				})
			});

			if (!response.ok) {
				throw new Error(`Batch embedding failed: ${response.status} ${response.statusText}`);
			}

			const data = await response.json() as { data: Array<{ embedding: number[]; index: number }> };
			if (!data.data) {
				throw new Error('Invalid batch embedding response');
			}

			// Sort by index to maintain order
			const sorted = data.data.sort((a, b) => a.index - b.index);
			for (const item of sorted) {
				results.push(new Float32Array(item.embedding));
			}
		}

		return results;
	}

	/**
	 * Generate a zero vector (for fallback)
	 */
	zeroVector(): Float32Array {
		return new Float32Array(this.embeddingDimension);
	}
}

/**
 * Chunk text into smaller pieces for embedding
 */
export interface TextChunk {
	content: string;
	index: number;
	startOffset: number;
	endOffset: number;
}

/**
 * Chunk text with overlap for better context preservation
 */
export function chunkText(
	text: string,
	chunkSize: number = 512,
	overlap: number = 128
): TextChunk[] {
	const chunks: TextChunk[] = [];

	// Split by lines first to preserve code structure
	const lines = text.split('\n');
	let currentChunk = '';
	let chunkStart = 0;
	let currentOffset = 0;
	let chunkIndex = 0;

	for (const line of lines) {
		const lineWithNewline = line + '\n';

		// If adding this line would exceed chunk size, save current chunk
		if (currentChunk.length + lineWithNewline.length > chunkSize && currentChunk.length > 0) {
			chunks.push({
				content: currentChunk.trim(),
				index: chunkIndex++,
				startOffset: chunkStart,
				endOffset: currentOffset
			});

			// Start new chunk with overlap
			const overlapStart = Math.max(0, currentChunk.length - overlap);
			currentChunk = currentChunk.slice(overlapStart) + lineWithNewline;
			chunkStart = currentOffset - (currentChunk.length - lineWithNewline.length);
		} else {
			currentChunk += lineWithNewline;
		}

		currentOffset += lineWithNewline.length;
	}

	// Add remaining content
	if (currentChunk.trim().length > 0) {
		chunks.push({
			content: currentChunk.trim(),
			index: chunkIndex,
			startOffset: chunkStart,
			endOffset: currentOffset
		});
	}

	return chunks;
}

/**
 * Chunk code with awareness of structure (functions, classes)
 */
export function chunkCode(
	code: string,
	language: string,
	chunkSize: number = 512,
	overlap: number = 128
): TextChunk[] {
	// For code, try to split on function/class boundaries
	const boundaries = findCodeBoundaries(code, language);

	if (boundaries.length === 0) {
		// Fall back to regular chunking
		return chunkText(code, chunkSize, overlap);
	}

	const chunks: TextChunk[] = [];
	let chunkIndex = 0;

	for (let i = 0; i < boundaries.length; i++) {
		const start = boundaries[i];
		const end = boundaries[i + 1] || code.length;
		const segment = code.slice(start, end);

		// If segment is too large, sub-chunk it
		if (segment.length > chunkSize) {
			const subChunks = chunkText(segment, chunkSize, overlap);
			for (const sub of subChunks) {
				chunks.push({
					content: sub.content,
					index: chunkIndex++,
					startOffset: start + sub.startOffset,
					endOffset: start + sub.endOffset
				});
			}
		} else if (segment.trim().length > 0) {
			chunks.push({
				content: segment.trim(),
				index: chunkIndex++,
				startOffset: start,
				endOffset: end
			});
		}
	}

	return chunks;
}

/**
 * Find code boundaries (function definitions, class definitions, etc.)
 */
function findCodeBoundaries(code: string, language: string): number[] {
	const boundaries: number[] = [0];

	// Language-specific patterns for function/class definitions
	const patterns: Record<string, RegExp[]> = {
		javascript: [
			/^(?:export\s+)?(?:async\s+)?function\s+\w+/gm,
			/^(?:export\s+)?class\s+\w+/gm,
			/^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(/gm,
			/^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?function/gm,
		],
		typescript: [
			/^(?:export\s+)?(?:async\s+)?function\s+\w+/gm,
			/^(?:export\s+)?class\s+\w+/gm,
			/^(?:export\s+)?interface\s+\w+/gm,
			/^(?:export\s+)?type\s+\w+/gm,
			/^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(/gm,
		],
		python: [
			/^(?:async\s+)?def\s+\w+/gm,
			/^class\s+\w+/gm,
		],
		rust: [
			/^(?:pub\s+)?(?:async\s+)?fn\s+\w+/gm,
			/^(?:pub\s+)?struct\s+\w+/gm,
			/^(?:pub\s+)?enum\s+\w+/gm,
			/^(?:pub\s+)?trait\s+\w+/gm,
			/^impl\s+/gm,
		],
		go: [
			/^func\s+(?:\([^)]+\)\s+)?\w+/gm,
			/^type\s+\w+\s+struct/gm,
			/^type\s+\w+\s+interface/gm,
		],
	};

	// Normalize language
	const lang = language.replace('text/x-', '').replace('text/', '');
	const langPatterns = patterns[lang] || patterns.javascript;

	for (const pattern of langPatterns) {
		let match;
		while ((match = pattern.exec(code)) !== null) {
			boundaries.push(match.index);
		}
	}

	// Sort and deduplicate
	return Array.from(new Set(boundaries)).sort((a, b) => a - b);
}

/**
 * Build context string from chunks for prompt injection
 */
export function buildContextString(
	chunks: Array<{ content: string; filePath: string; similarity: number }>,
	maxLength: number = 4000
): string {
	let context = '';
	const usedFiles = new Set<string>();

	for (const chunk of chunks) {
		const fileHeader = usedFiles.has(chunk.filePath)
			? ''
			: `\n--- File: ${chunk.filePath} ---\n`;

		const addition = fileHeader + chunk.content + '\n';

		if (context.length + addition.length > maxLength) {
			break;
		}

		context += addition;
		usedFiles.add(chunk.filePath);
	}

	return context.trim();
}
