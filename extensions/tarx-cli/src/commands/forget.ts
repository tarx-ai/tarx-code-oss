/**
 * tarx forget <id|query> — Soft-delete memories.
 * By ID: direct soft-delete. By query: search, show matches, confirm.
 */

import { openDb, dbExists, withRetry } from './db';
import { header, kv, brand, icon, footer, section } from '../format';
import * as readline from 'readline';

export async function forget(args: string[]): Promise<void> {
	const target = args.join(' ');
	if (!target) {
		console.error('Usage: tarx forget <id|query>');
		console.error('  Delete a memory by ID or search for memories to remove');
		process.exit(1);
	}

	header('Forget');

	if (!dbExists()) {
		console.log(`  ${brand.dim('No memories to forget.')}`);
		return;
	}

	const db = openDb(false);

	// Try direct ID match first (prefix match)
	let row = db.prepare(`
		SELECT id, content, observation_type FROM memories
		WHERE id LIKE ? AND deleted_at IS NULL
	`).get(`${target}%`) as { id: string; content: string; observation_type: string } | undefined;

	if (row) {
		// Direct ID match — delete immediately
		withRetry(() => {
			db.prepare('UPDATE memories SET deleted_at = datetime(\'now\') WHERE id = ?').run(row!.id);
		});
		db.close();
		console.log(`  ${icon.success} Forgot: ${row.content.slice(0, 60)}${row.content.length > 60 ? '...' : ''}`);
		kv('ID', row.id.slice(0, 8));
		footer('local');
		return;
	}

	// Text search
	const matches = db.prepare(`
		SELECT id, content, observation_type, created_at FROM memories
		WHERE content LIKE ? AND deleted_at IS NULL
		ORDER BY created_at DESC LIMIT 10
	`).all(`%${target}%`) as Array<{ id: string; content: string; observation_type: string; created_at: string }>;

	if (matches.length === 0) {
		console.log(`  ${brand.dim(`No memories matching "${target}"`)}`);
		db.close();
		return;
	}

	section('Matches');
	for (let i = 0; i < matches.length; i++) {
		const m = matches[i];
		const preview = m.content.length > 60 ? m.content.slice(0, 57) + '...' : m.content;
		console.log(`  ${brand.bold(`${i + 1}.`)} ${preview}`);
		console.log(`     ${brand.dim(`${m.observation_type || 'memory'} · ${m.id.slice(0, 8)} · ${m.created_at}`)}`);
	}

	// Prompt for selection
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	const answer = await new Promise<string>((resolve) => {
		rl.question(`\n  Delete which? (1-${matches.length}, 'all', or 'none'): `, resolve);
	});
	rl.close();

	const choice = answer.trim().toLowerCase();

	if (choice === 'none' || choice === 'n' || choice === '') {
		console.log(`  ${brand.dim('Nothing deleted.')}`);
		db.close();
		return;
	}

	if (choice === 'all' || choice === 'a') {
		for (const m of matches) {
			withRetry(() => {
				db.prepare('UPDATE memories SET deleted_at = datetime(\'now\') WHERE id = ?').run(m.id);
			});
		}
		console.log(`  ${icon.success} Forgot ${matches.length} memories.`);
		db.close();
		footer('local');
		return;
	}

	const idx = parseInt(choice, 10) - 1;
	if (idx >= 0 && idx < matches.length) {
		const m = matches[idx];
		withRetry(() => {
			db.prepare('UPDATE memories SET deleted_at = datetime(\'now\') WHERE id = ?').run(m.id);
		});
		console.log(`  ${icon.success} Forgot: ${m.content.slice(0, 60)}${m.content.length > 60 ? '...' : ''}`);
	} else {
		console.log(`  ${brand.dim('Invalid selection.')}`);
	}

	db.close();
	footer('local');
}
