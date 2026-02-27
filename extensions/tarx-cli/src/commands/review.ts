/**
 * tarx review — AI code review using RAG context.
 * Gets git diff, searches knowledge base for context about changed files,
 * then streams a local inference review.
 */

import { execSync } from 'child_process';
import { ragSearch, buildRagContext } from './rag';
import { chat } from '../services/inference';
import { ensureInferenceRunning } from '../services/engine';
import { thinkingSpinner } from '../feedback';
import { header, section, streamPrefix, streamChunk, streamEnd, brand, icon, footer } from '../format';

export async function review(): Promise<void> {
	header('Review', 'AI code review');

	// Get diff (staged first, fallback to unstaged)
	let diff = '';
	try {
		diff = execSync('git diff --cached', { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }).toString().trim();
	} catch { /* ignore */ }

	if (!diff) {
		try {
			diff = execSync('git diff', { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }).toString().trim();
		} catch { /* ignore */ }
	}

	if (!diff) {
		console.log(`  ${brand.dim('No changes to review.')}`);
		console.log(`  ${brand.dim('Stage changes with')} ${brand.cmd('git add')} ${brand.dim('or make local edits.')}`);
		return;
	}

	// Extract changed file names for RAG query
	const files = new Set<string>();
	for (const line of diff.split('\n')) {
		const match = line.match(/^diff --git a\/(.+?) b\//);
		if (match) files.add(match[1]);
	}

	const spin = thinkingSpinner('Preparing review');

	// Ensure inference
	const engine = await ensureInferenceRunning();
	if (engine.error) {
		spin.stop(`${icon.error} ${engine.error}`);
		return;
	}

	// RAG search for context about changed files
	let ragContext = '';
	const ragResults = [];
	if (files.size > 0) {
		const query = `code changes in ${Array.from(files).join(', ')}`;
		try {
			const results = await ragSearch(query, 3);
			ragResults.push(...results);
			ragContext = buildRagContext(results);
		} catch { /* skip RAG, review without context */ }
	}

	spin.stop(`Reviewing ${files.size} file(s)`);

	// Truncate diff if too long
	const maxDiff = 4000;
	const truncatedDiff = diff.length > maxDiff ? diff.slice(0, maxDiff) + '\n\n[... diff truncated ...]' : diff;

	const prompt = `You are a senior code reviewer. Review the following git diff and provide concise, actionable feedback.

Focus on:
- Bugs or logic errors
- Security issues
- Performance concerns
- Code style issues
- Missing edge cases

${ragContext ? `\nContext about these files from the project knowledge base:\n${ragContext}\n` : ''}
Git diff:
\`\`\`
${truncatedDiff}
\`\`\`

Provide a brief, structured review. Be direct.`;

	section('Review');
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

	// Show sources if RAG was used
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
