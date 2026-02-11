/**
 * TARX Skill Resolver
 *
 * Parses .md skill files from configured directories,
 * extracts YAML frontmatter, and validates MCP tool availability.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ResolvedSkill, ResolvedAgent, SkillFrontmatter, AgentFrontmatter } from './types.js';

/**
 * Parse YAML frontmatter from a markdown string.
 * Handles the --- delimited block at the top of .md files.
 */
export function parseFrontmatter<T>(content: string): { frontmatter: T; body: string } {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
	if (!match) {
		throw new Error('No YAML frontmatter found');
	}

	const yamlBlock = match[1];
	const body = match[2];

	// Simple YAML parser for flat + array structures (no dependency needed for V1)
	const frontmatter: Record<string, unknown> = {};
	let currentKey = '';
	let inArray = false;
	const arrayValues: string[] = [];

	for (const line of yamlBlock.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		// Array item
		if (trimmed.startsWith('- ') && inArray) {
			arrayValues.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''));
			continue;
		}

		// Flush previous array
		if (inArray && currentKey) {
			frontmatter[currentKey] = [...arrayValues];
			arrayValues.length = 0;
			inArray = false;
		}

		// Key: value pair
		const kvMatch = trimmed.match(/^(\w+)\s*:\s*(.*)$/);
		if (kvMatch) {
			const [, key, value] = kvMatch;
			currentKey = key;

			if (value.trim() === '') {
				// Next lines are array items
				inArray = true;
			} else if (value.startsWith('[') && value.endsWith(']')) {
				// Inline array: [a, b, c]
				frontmatter[key] = value
					.slice(1, -1)
					.split(',')
					.map(v => v.trim().replace(/^["']|["']$/g, ''));
			} else {
				// Scalar value
				frontmatter[key] = value.replace(/^["']|["']$/g, '').trim();
			}
		}
	}

	// Flush final array
	if (inArray && currentKey) {
		frontmatter[currentKey] = [...arrayValues];
	}

	return { frontmatter: frontmatter as T, body };
}

/**
 * Load and resolve a single skill .md file.
 */
export async function resolveSkillFile(filePath: string): Promise<ResolvedSkill> {
	const content = await readFile(filePath, 'utf-8');
	const { frontmatter, body } = parseFrontmatter<SkillFrontmatter>(content);

	if (!frontmatter.name) {
		throw new Error(`Skill file missing 'name' in frontmatter: ${filePath}`);
	}

	return {
		id: `tarx.skills.${frontmatter.name}`,
		frontmatter: {
			name: frontmatter.name,
			description: frontmatter.description || '',
			route: frontmatter.route || 'local',
			tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
			tier: frontmatter.tier || 'free',
		},
		instructions: body.trim(),
		filePath,
		toolsAvailable: true, // validated later by executor
	};
}

/**
 * Load and resolve a single agent .md file.
 */
export async function resolveAgentFile(
	filePath: string,
	skillRegistry: Map<string, ResolvedSkill>,
): Promise<ResolvedAgent> {
	const content = await readFile(filePath, 'utf-8');
	const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);

	if (!frontmatter.name) {
		throw new Error(`Agent file missing 'name' in frontmatter: ${filePath}`);
	}

	const skillNames = Array.isArray(frontmatter.skills) ? frontmatter.skills : [];
	const resolvedSkills = skillNames
		.map(name => skillRegistry.get(name))
		.filter((s): s is ResolvedSkill => s !== undefined);

	return {
		id: `tarx.agents.${frontmatter.name}`,
		frontmatter: {
			name: frontmatter.name,
			description: frontmatter.description || '',
			skills: skillNames,
			mode: frontmatter.mode || 'local',
			triggers: Array.isArray(frontmatter.triggers) ? frontmatter.triggers : [],
		},
		instructions: body.trim(),
		filePath,
		resolvedSkills,
	};
}

/**
 * Scan a directory for .md files and resolve all skills.
 */
export async function loadSkillsFromDir(dir: string): Promise<ResolvedSkill[]> {
	const absDir = resolve(dir);
	const skills: ResolvedSkill[] = [];

	let entries: string[];
	try {
		entries = await readdir(absDir);
	} catch {
		return skills; // Directory doesn't exist — not an error
	}

	for (const entry of entries) {
		if (!entry.endsWith('.md') || entry === 'INDEX.md') continue;
		try {
			const skill = await resolveSkillFile(join(absDir, entry));
			skills.push(skill);
		} catch (err) {
			console.error(`[tarx-skills] Failed to parse ${entry}:`, err);
		}
	}

	return skills;
}

/**
 * Scan a directory for .agent.md files and resolve all agents.
 */
export async function loadAgentsFromDir(
	dir: string,
	skillRegistry: Map<string, ResolvedSkill>,
): Promise<ResolvedAgent[]> {
	const absDir = resolve(dir);
	const agents: ResolvedAgent[] = [];

	let entries: string[];
	try {
		entries = await readdir(absDir);
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.endsWith('.agent.md')) continue;
		try {
			const agent = await resolveAgentFile(join(absDir, entry), skillRegistry);
			agents.push(agent);
		} catch (err) {
			console.error(`[tarx-skills] Failed to parse agent ${entry}:`, err);
		}
	}

	return agents;
}

/**
 * Build a complete skill registry from multiple directories.
 */
export async function buildSkillRegistry(
	skillDirs: string[],
	agentDirs: string[],
): Promise<{
	skills: Map<string, ResolvedSkill>;
	agents: Map<string, ResolvedAgent>;
}> {
	const skills = new Map<string, ResolvedSkill>();
	const agents = new Map<string, ResolvedAgent>();

	// Load skills first (agents reference them)
	for (const dir of skillDirs) {
		const dirSkills = await loadSkillsFromDir(dir);
		for (const skill of dirSkills) {
			skills.set(skill.frontmatter.name, skill);
		}
	}

	// Load agents
	for (const dir of agentDirs) {
		const dirAgents = await loadAgentsFromDir(dir, skills);
		for (const agent of dirAgents) {
			agents.set(agent.frontmatter.name, agent);
		}
	}

	return { skills, agents };
}
