/**
 * tarx recall <topic> — Two-source search: memories + knowledge base.
 * Shows both text-matched memories and vector-searched knowledge.
 */

import { ragSearch, RagResult } from './rag';
import { openDb, dbExists } from './db';
import { box } from '../feedback';
import { header, brand, icon, footer, section } from '../format';

export async function recall(args: string[]): Promise<void> {
	const topic = args.join(' ');
	if (!topic) {
		console.error('Usage: tarx recall <topic>');
		console.error('  Search memories and knowledge about a topic');
		process.exit(1);
	}

	header('Recall', topic);

	if (!dbExists()) {
		console.log(`  ${brand.dim('No knowledge base found.')}`);
		console.log(`  ${brand.dim('Use')} ${brand.cmd('tarx learn')} ${brand.dim('or')} ${brand.cmd('tarx remember')} ${brand.dim('first.')}`);
		return;
	}

	const db = openDb(true);
	let memoryResults: Array<{ id: string; content: string; observation_type: string; created_at: string }> = [];

	// 1. Text search on memories table
	try {
		memoryResults = db.prepare(`
			SELECT id, content, observation_type, created_at
			FROM memories
			WHERE content LIKE ? AND deleted_at IS NULL
			ORDER BY created_at DESC
			LIMIT 10
		`).all(`%${topic}%`) as typeof memoryResults;
	} catch {
		// memories table might not exist
	}

	// Memory count for display
	let totalMemories = 0;
	try {
		const row = db.prepare('SELECT COUNT(*) as cnt FROM memories WHERE deleted_at IS NULL').get() as { cnt: number };
		totalMemories = row.cnt;
	} catch { /* table missing */ }

	db.close();

	// 2. Vector search on knowledge_embeddings
	let knowledgeResults: RagResult[] = [];
	try {
		knowledgeResults = await ragSearch(topic, 5);
	} catch {
		knowledgeResults = [];
	}

	// Display memories
	if (memoryResults.length > 0) {
		const memLines: string[] = [];
		for (const m of memoryResults) {
			const age = timeAgo(m.created_at);
			const typeLabel = m.observation_type ? `${brand.dim(m.observation_type)} ` : '';
			const preview = m.content.length > 80 ? m.content.slice(0, 77) + '...' : m.content;
			memLines.push(`${typeLabel}${preview}`);
			memLines.push(`${brand.dim(`  ${age} · id:${m.id.slice(0, 8)}`)}`);
		}
		box('Memories', memLines);
	} else {
		section('Memories');
		console.log(`  ${brand.dim(`No memories matching "${topic}" (${totalMemories} total)`)}`);
	}

	// Display knowledge
	if (knowledgeResults.length > 0) {
		const knLines: string[] = [];
		for (const r of knowledgeResults) {
			const preview = r.content.replace(/\n/g, ' ').trim();
			const truncated = preview.length > 80 ? preview.slice(0, 77) + '...' : preview;
			knLines.push(`${truncated}`);
			knLines.push(`${brand.dim(`  ${r.source} · score: ${r.score.toFixed(3)}`)}`);
		}
		box('Knowledge', knLines);
	} else {
		section('Knowledge');
		console.log(`  ${brand.dim(`No knowledge matching "${topic}"`)}`);
	}

	footer('local');
}

function timeAgo(dateStr: string): string {
	try {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		return `${Math.floor(days / 30)}mo ago`;
	} catch {
		return '';
	}
}
