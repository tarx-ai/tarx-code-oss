/**
 * tarx ask <question> — Ask a question against your local knowledge base.
 * RAG search → inject context → stream answer from local inference.
 * Fully local, fully private, zero API calls.
 */

import { ragSearch, buildRagContext } from './rag';
import { chat } from '../services/inference';
import { ensureInferenceRunning } from '../services/engine';
import { dbExists } from './db';
import { thinkingSpinner } from '../feedback';
import { header, section, streamPrefix, streamChunk, streamEnd, brand, icon, footer, cta } from '../format';

export async function ask(args: string[]): Promise<void> {
	const question = args.join(' ');
	if (!question) {
		console.error('Usage: tarx ask <question>');
		console.error('  Ask a question against your local knowledge base');
		process.exit(1);
	}

	header('Ask', question);

	if (!dbExists()) {
		cta('No knowledge base found. Teach TARX first.', 'tarx learn <file|dir>');
		return;
	}

	// Ensure inference is running
	const spin = thinkingSpinner('Searching knowledge');
	const engine = await ensureInferenceRunning();
	if (engine.error) {
		spin.stop(`${icon.error} ${engine.error}`);
		return;
	}

	// RAG search
	let results;
	try {
		results = await ragSearch(question, 5);
		spin.stop(`Found ${results.length} relevant chunks`);
	} catch (e: any) {
		spin.stop(`${icon.error} Search failed: ${e.message}`);
		console.log(`  ${brand.dim('Is the embedding server running on :11437?')}`);
		return;
	}

	// Build prompt with RAG context
	let prompt: string;
	let fromGeneral = false;
	if (results.length === 0) {
		fromGeneral = true;
		prompt = `Answer this question based on your general knowledge. Be concise and helpful.\n\nQuestion: ${question}`;
	} else {
		const context = buildRagContext(results);
		prompt = `Answer the following question using ONLY the provided context. Be concise, accurate, and cite sources when possible. If the context doesn't contain enough information, say so.\n\n${context}\n\nQuestion: ${question}`;
	}

	// Stream answer
	section('Answer');
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

	if (fromGeneral) {
		console.log();
		console.log(`  ${icon.warning} ${brand.yellow('Answered from general knowledge — no relevant documents found.')}`);
		cta('Teach TARX about your project for better answers.', 'tarx learn <file|dir>');
	} else {
		// Show sources
		section('Sources');
		const seen = new Set<string>();
		for (const r of results) {
			if (seen.has(r.source)) continue;
			seen.add(r.source);
			console.log(`  ${icon.arrow} ${r.source} ${brand.dim(`(${r.score.toFixed(3)})`)}`);
		}
	}

	footer('local', { tokens, time: Date.now() - startTime });
}
