/**
 * tarx explain <error|file> — Explain an error or file using RAG context.
 * If a file path: read + search for related knowledge + stream explanation.
 * If an error string: search for similar errors + stream explanation.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, basename } from 'path';
import { ragSearch, buildRagContext } from './rag';
import { chat } from '../services/inference';
import { ensureInferenceRunning } from '../services/engine';
import { thinkingSpinner } from '../feedback';
import { header, section, streamPrefix, streamChunk, streamEnd, brand, icon, footer } from '../format';

export async function explain(args: string[]): Promise<void> {
	const input = args.join(' ');
	if (!input) {
		console.error('Usage: tarx explain <error|file>');
		console.error('  Explain an error message or file using local AI + knowledge base');
		process.exit(1);
	}

	// Determine if input is a file path or error string
	const resolved = resolve(input);
	const isFile = existsSync(resolved);

	header('Explain', isFile ? basename(resolved) : input.slice(0, 50));

	const spin = thinkingSpinner('Preparing');

	// Ensure inference
	const engine = await ensureInferenceRunning();
	if (engine.error) {
		spin.stop(`${icon.error} ${engine.error}`);
		return;
	}

	let prompt: string;
	let ragResults: import('./rag').RagResult[] = [];

	if (isFile) {
		// File mode: read file + RAG context
		let content: string;
		try {
			content = readFileSync(resolved, 'utf-8');
		} catch (e: any) {
			spin.stop(`${icon.error} Cannot read file: ${e.message}`);
			return;
		}

		// Truncate if too long
		const maxContent = 3000;
		const truncated = content.length > maxContent
			? content.slice(0, maxContent) + '\n\n[... truncated ...]'
			: content;

		// RAG search for related knowledge
		try {
			ragResults = await ragSearch(basename(resolved) + ' ' + content.slice(0, 200), 3);
		} catch {
			ragResults = [];
		}

		const ragContext = buildRagContext(ragResults);

		spin.stop(`Reading ${basename(resolved)}`);

		prompt = `Explain the following file concisely. Describe its purpose, key components, and how it fits into the project.

${ragContext ? `\nProject context:\n${ragContext}\n` : ''}
File: ${basename(resolved)}
\`\`\`
${truncated}
\`\`\`

Be concise and focus on what a developer needs to know.`;
	} else {
		// Error mode: search for similar errors + explain
		try {
			ragResults = await ragSearch(input, 3);
		} catch {
			ragResults = [];
		}

		const ragContext = buildRagContext(ragResults);

		spin.stop('Analyzing error');

		prompt = `Explain the following error and suggest how to fix it. Be concise and actionable.

${ragContext ? `\nProject context:\n${ragContext}\n` : ''}
Error: ${input}

Provide:
1. What this error means
2. Common causes
3. How to fix it`;
	}

	section(isFile ? 'Explanation' : 'Analysis');
	streamPrefix();
	const startTime = Date.now();
	let tokens = 0;

	await chat(prompt, {
		stream: true,
		maxTokens: 1500,
		onToken: (token) => {
			streamChunk(token);
			tokens++;
		},
	});

	streamEnd();

	// Show sources
	if (ragResults.length > 0) {
		section('Sources');
		const seen = new Set<string>();
		for (const r of ragResults) {
			if (seen.has(r.source)) continue;
			seen.add(r.source);
			console.log(`  ${icon.arrow} ${r.source} ${brand.dim(`(${r.score.toFixed(3)})`)}`);
		}
	}

	footer('local', { tokens, time: Date.now() - startTime });
}
