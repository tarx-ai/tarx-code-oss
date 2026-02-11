/**
 * TARX UI Test Suite Registry - Imports all 2500 test cases across 13 categories
 */

import type { TestCase } from './types.js';
import { runSuite, runTest } from './runner.js';

// Lazy-load test categories to avoid bundling issues
let _allTests: TestCase[] | null = null;

async function loadCategories(): Promise<TestCase[]> {
	if (_allTests) return _allTests;

	const modules = await Promise.all([
		import('./categories/editor.js'),
		import('./categories/terminal.js'),
		import('./categories/panels.js'),
		import('./categories/notifications.js'),
		import('./categories/tarx-sidebar.js'),
		import('./categories/chat.js'),
		import('./categories/commands.js'),
		import('./categories/explorer.js'),
		import('./categories/scm.js'),
		import('./categories/debug.js'),
		import('./categories/settings.js'),
		import('./categories/screenshot.js'),
		import('./categories/integration.js'),
	]);

	_allTests = modules.flatMap(m => {
		// Each module exports a named array (editorTests, terminalTests, etc.)
		const values = Object.values(m);
		return values.find(v => Array.isArray(v)) as TestCase[] || [];
	});

	return _allTests;
}

export async function getAllTests(): Promise<TestCase[]> {
	return loadCategories();
}

export async function getTestsByCategory(category: string): Promise<TestCase[]> {
	const all = await loadCategories();
	return all.filter(t => t.category === category || t.id.startsWith(category));
}

export async function getTestsByTag(tag: string): Promise<TestCase[]> {
	const all = await loadCategories();
	return all.filter(t => t.tags.includes(tag));
}

export async function getTestsByPriority(priority: 'P0' | 'P1' | 'P2'): Promise<TestCase[]> {
	const all = await loadCategories();
	return all.filter(t => t.priority === priority);
}

export async function getTestById(id: string): Promise<TestCase | undefined> {
	const all = await loadCategories();
	return all.find(t => t.id === id);
}

export const CATEGORIES = [
	{ letter: 'A', name: 'Editor', file: 'editor', expectedCount: 350 },
	{ letter: 'B', name: 'Terminal', file: 'terminal', expectedCount: 200 },
	{ letter: 'C', name: 'Panels', file: 'panels', expectedCount: 200 },
	{ letter: 'D', name: 'Notifications', file: 'notifications', expectedCount: 150 },
	{ letter: 'E', name: 'TARX Sidebar', file: 'tarx-sidebar', expectedCount: 400 },
	{ letter: 'F', name: 'Chat', file: 'chat', expectedCount: 300 },
	{ letter: 'G', name: 'Commands', file: 'commands', expectedCount: 100 },
	{ letter: 'H', name: 'Explorer', file: 'explorer', expectedCount: 200 },
	{ letter: 'I', name: 'SCM', file: 'scm', expectedCount: 100 },
	{ letter: 'J', name: 'Debug', file: 'debug', expectedCount: 100 },
	{ letter: 'K', name: 'Settings', file: 'settings', expectedCount: 100 },
	{ letter: 'L', name: 'Screenshot', file: 'screenshot', expectedCount: 100 },
	{ letter: 'M', name: 'Integration', file: 'integration', expectedCount: 200 },
];

export const EXPECTED_TOTAL = CATEGORIES.reduce((sum, c) => sum + c.expectedCount, 0); // 2500

export { runSuite, runTest };
export type { TestCase, TestRunReport } from './types.js';
