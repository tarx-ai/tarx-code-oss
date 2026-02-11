/**
 * TARX Skills Provider — Shared Types
 */

/** Route hint for skill execution */
export type SkillRoute = 'local' | 'mesh' | 'cloud' | 'auto';

/** Access tier gating */
export type SkillTier = 'free' | 'pro' | 'enterprise';

/** Agent execution mode */
export type AgentMode = 'local' | 'background' | 'cloud';

/** Skill intent categories */
export type SkillIntent =
	| 'code-gen'
	| 'memory'
	| 'debug'
	| 'knowledge'
	| 'projects'
	| 'unknown';

/** Parsed YAML frontmatter from a skill .md file */
export interface SkillFrontmatter {
	name: string;
	description: string;
	route: SkillRoute;
	tools: string[];
	tier: SkillTier;
}

/** A fully resolved skill definition */
export interface ResolvedSkill {
	id: string;
	frontmatter: SkillFrontmatter;
	instructions: string;
	filePath: string;
	toolsAvailable: boolean;
}

/** Parsed YAML frontmatter from an agent .md file */
export interface AgentFrontmatter {
	name: string;
	description: string;
	skills: string[];
	mode: AgentMode;
	triggers: Record<string, string | boolean>[];
}

/** A fully resolved agent definition */
export interface ResolvedAgent {
	id: string;
	frontmatter: AgentFrontmatter;
	instructions: string;
	filePath: string;
	resolvedSkills: ResolvedSkill[];
}

/** Intent classification result */
export interface IntentMatch {
	intent: SkillIntent;
	confidence: number;
	skillName: string;
	matchedKeywords: string[];
}
