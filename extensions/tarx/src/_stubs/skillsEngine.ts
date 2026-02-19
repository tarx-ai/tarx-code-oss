/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Skills Engine
 *  - Manages skill installation, search, and system prompt injection
 *  - Skills are structured context packages that enhance LLM responses
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface Skill {
	id: string;
	name: string;
	description: string;
	category: string;
	system_prompt: string;
	context_docs: string | null;
	tools: string | null;
	tier: string;
	install_count: number;
}

export interface SkillsEngineOptions {
	mcpEndpoint?: string;
}

export class SkillsEngine {
	private static instance: SkillsEngine | null = null;
	private cachedActiveSkills: Skill[] | null = null;
	private cacheTimestamp = 0;
	private readonly CACHE_TTL = 30000; // 30 seconds

	static getInstance(): SkillsEngine {
		if (!SkillsEngine.instance) {
			SkillsEngine.instance = new SkillsEngine();
		}
		return SkillsEngine.instance;
	}

	/**
	 * Get all active skills for the current user.
	 * Results are cached for 30 seconds.
	 */
	async getActiveSkills(): Promise<Skill[]> {
		const now = Date.now();
		if (this.cachedActiveSkills && (now - this.cacheTimestamp) < this.CACHE_TTL) {
			return this.cachedActiveSkills;
		}

		try {
			// Try to call tarx-core MCP via extension API
			const ext = vscode.extensions.getExtension('tarx.tarx');
			if (ext?.isActive && ext.exports?.mcpCall) {
				const result = await ext.exports.mcpCall('tarx_get_active_skills', { userId: 'default' });
				if (result?.skills) {
					this.cachedActiveSkills = result.skills;
					this.cacheTimestamp = now;
					return result.skills;
				}
			}
		} catch {
			// MCP not available, return empty
		}

		return this.cachedActiveSkills || [];
	}

	/**
	 * Build the skills context string for system prompt injection.
	 * Returns formatted text ready to append to the system prompt.
	 */
	async buildSkillsContext(): Promise<string> {
		const skills = await this.getActiveSkills();
		if (skills.length === 0) { return ''; }

		const sections = skills.map(s =>
			`### ${s.name} (${s.category})\n${s.system_prompt}`
		);

		return sections.join('\n\n');
	}

	/**
	 * Install a skill by ID.
	 */
	async installSkill(skillId: string): Promise<boolean> {
		try {
			const ext = vscode.extensions.getExtension('tarx.tarx');
			if (ext?.isActive && ext.exports?.mcpCall) {
				const result = await ext.exports.mcpCall('tarx_install_skill', { skillId });
				this.invalidateCache();
				return result?.success ?? false;
			}
		} catch {
			// Fail silently
		}
		return false;
	}

	/**
	 * Uninstall a skill by ID.
	 */
	async uninstallSkill(skillId: string): Promise<boolean> {
		try {
			const ext = vscode.extensions.getExtension('tarx.tarx');
			if (ext?.isActive && ext.exports?.mcpCall) {
				const result = await ext.exports.mcpCall('tarx_uninstall_skill', { skillId });
				this.invalidateCache();
				return result?.success ?? false;
			}
		} catch {
			// Fail silently
		}
		return false;
	}

	/**
	 * Search skills by query.
	 */
	async searchSkills(query: string): Promise<Skill[]> {
		try {
			const ext = vscode.extensions.getExtension('tarx.tarx');
			if (ext?.isActive && ext.exports?.mcpCall) {
				const result = await ext.exports.mcpCall('tarx_list_skills', { search: query });
				return result?.skills || [];
			}
		} catch {
			// Fail silently
		}
		return [];
	}

	/**
	 * Get skills by category.
	 */
	async getSkillsByCategory(category: string): Promise<Skill[]> {
		try {
			const ext = vscode.extensions.getExtension('tarx.tarx');
			if (ext?.isActive && ext.exports?.mcpCall) {
				const result = await ext.exports.mcpCall('tarx_list_skills', { category });
				return result?.skills || [];
			}
		} catch {
			// Fail silently
		}
		return [];
	}

	invalidateCache(): void {
		this.cachedActiveSkills = null;
		this.cacheTimestamp = 0;
	}
}
