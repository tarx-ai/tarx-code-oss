/*---------------------------------------------------------------------------------------------
 *  TARX Invite Profile System
 *
 *  Maps invite profile data (role, project, frustrations) to personalized
 *  starter prompts and skill activations. Powers the "no cold start" FTUX.
 *--------------------------------------------------------------------------------------------*/

// ============================================================================
// TYPES
// ============================================================================

export interface InviteProfile {
	code: string;
	name: string;
	email: string;
	role: string;
	project: string;
	toolsTried: string[];
	frustrations: string;
	interactionStyle: 'tactical' | 'strategic' | 'both';
}

/**
 * Parse an InviteProfile from the invite_codes.metadata JSON blob.
 * Returns null if metadata is missing or malformed.
 */
export function parseInviteProfile(code: string, metadata: string | null): InviteProfile | null {
	if (!metadata) {
		return null;
	}

	try {
		const data = JSON.parse(metadata);
		return {
			code,
			name: data.name || '',
			email: data.email || '',
			role: data.role || '',
			project: data.project || '',
			toolsTried: Array.isArray(data.tools_tried) ? data.tools_tried : [],
			frustrations: data.frustrations || '',
			interactionStyle: data.interaction_style || 'both'
		};
	} catch {
		return null;
	}
}

// ============================================================================
// PROMPT MAPPING
// ============================================================================

const ROLE_PROMPTS: Record<string, string[]> = {
	developer: [
		'Review my code and suggest improvements',
		'Help me debug this error',
		'Explain this architecture decision'
	],
	designer: [
		'Critique this design approach',
		'Help me write design specs',
		'Suggest UX improvements for this flow'
	],
	marketer: [
		'Help me write compelling copy for my product',
		'Analyze my target audience',
		'Create a content calendar for this month'
	],
	founder: [
		'Help me refine my pitch',
		'Review my go-to-market strategy',
		'Analyze this competitive landscape'
	],
	creator: [
		'Help me write product descriptions',
		'Generate social media captions',
		'Plan my content for this week'
	],
	writer: [
		'Help me outline this article',
		'Edit my draft for clarity and tone',
		'Research this topic and summarize key points'
	],
	analyst: [
		'Help me analyze this dataset',
		'Build a financial model for this scenario',
		'Summarize these findings for stakeholders'
	]
};

const DEFAULT_PROMPTS = [
	'What can you help me with?',
	'Show me what TARX can do',
	'Help me get started'
];

/**
 * Generate personalized starter prompts based on user profile.
 * Returns 3-5 contextual prompts that make TARX feel immediately relevant.
 */
export function profileToPrompts(profile: InviteProfile): string[] {
	const prompts: string[] = [];

	// Role-based prompts (fuzzy match)
	const role = profile.role.toLowerCase();
	for (const [key, rolePrompts] of Object.entries(ROLE_PROMPTS)) {
		if (role.includes(key)) {
			prompts.push(...rolePrompts);
			break;
		}
	}

	// Project-specific prompt
	if (profile.project) {
		prompts.push(`Help me with my project: ${profile.project}`);
	}

	// Frustration-based prompt
	if (profile.frustrations) {
		prompts.push(`I'm frustrated with ${profile.frustrations} — show me a better way`);
	}

	// Fallback
	if (prompts.length === 0) {
		prompts.push(...DEFAULT_PROMPTS);
	}

	return prompts.slice(0, 5);
}

// ============================================================================
// SKILL MAPPING
// ============================================================================

const ROLE_SKILLS: Record<string, string[]> = {
	develop: ['code-review', 'debug-helper', 'test-writer', 'api-docs'],
	design: ['design-critique', 'ux-writer', 'component-spec'],
	market: ['product-description-writer', 'social-caption-generator', 'brand-voice-checker', 'email-composer'],
	creator: ['product-description-writer', 'social-caption-generator', 'brand-voice-checker', 'email-composer'],
	founder: ['pitch-reviewer', 'strategy-analyzer', 'decision-matrix'],
	ceo: ['pitch-reviewer', 'strategy-analyzer', 'decision-matrix'],
	writer: ['blog-post-writer', 'email-composer', 'technical-documentation'],
	analyst: ['data-visualization', 'sql-analysis', 'statistical-analysis']
};

const PROJECT_SKILLS: Record<string, string[]> = {
	shopify: ['product-description-writer', 'social-caption-generator', 'email-composer'],
	react: ['react-expert', 'typescript-master', 'testing-expert'],
	python: ['python-pro', 'data-cleaning', 'testing-expert'],
	api: ['rest-api-designer', 'api-documentation', 'testing-expert'],
	mobile: ['swift-developer', 'testing-expert', 'performance-optimizer']
};

const BASE_SKILLS = ['research-summarizer', 'weekly-review-generator'];

/**
 * Map user profile to relevant skill IDs from the seed skills catalog.
 * Returns deduplicated list of skill identifiers.
 */
export function profileToSkills(profile: InviteProfile): string[] {
	const skills: string[] = [];
	const role = profile.role.toLowerCase();
	const project = profile.project.toLowerCase();

	// Role-based skills
	for (const [key, roleSkills] of Object.entries(ROLE_SKILLS)) {
		if (role.includes(key)) {
			skills.push(...roleSkills);
			break;
		}
	}

	// Project-based skills
	for (const [key, projSkills] of Object.entries(PROJECT_SKILLS)) {
		if (project.includes(key)) {
			skills.push(...projSkills);
		}
	}

	// Base skills everyone gets
	skills.push(...BASE_SKILLS);

	return [...new Set(skills)];
}

/**
 * Build the RAG-ready profile text for embedding.
 * This text gets chunked and embedded so TARX "knows" the user.
 */
export function profileToRAGDocument(profile: InviteProfile): string {
	const parts = [
		`User Profile:`,
		`Name: ${profile.name}`,
		`Role: ${profile.role}`,
		`Current Project: ${profile.project}`
	];

	if (profile.toolsTried.length > 0) {
		parts.push(`Previous AI Tools: ${profile.toolsTried.join(', ')}`);
	}
	if (profile.frustrations) {
		parts.push(`Frustrations with current tools: ${profile.frustrations}`);
	}
	parts.push(`Interaction Style: ${profile.interactionStyle}`);

	return parts.join('\n');
}
