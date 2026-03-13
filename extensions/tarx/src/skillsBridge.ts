/**
 * TARX Skills Bridge
 *
 * Connects the main chat participant to the tarx-skills-provider extension.
 * Routes messages through the skills registry before falling back to direct MCP execution.
 *
 * Flow:
 * 1. User sends message
 * 2. Check skills registry for intent match
 * 3. If match found, execute skill
 * 4. If no match, fall back to existing direct execution / Claude flow
 */

import * as vscode from 'vscode';

export interface SkillsMatch {
	matched: boolean;
	skillName: string | null;
	confidence: number;
	result?: string;
}

export interface SkillCreationIntent {
	isCreationIntent: boolean;
	type?: 'skill' | 'agent' | 'automation';
	purpose?: string;
	confidence: number;
}

/**
 * Query the skills provider extension for intent matches.
 * Uses VS Code extension API to call into tarx-skills-provider.
 *
 * NOTE: This is a cross-extension call. The skills provider must be installed and activated.
 */
export async function querySkillsRegistry(message: string): Promise<SkillsMatch> {
	try {
		// Get the tarx-skills-provider extension
		const skillsExtension = vscode.extensions.getExtension('tarx.tarx-skills-provider');

		if (!skillsExtension) {
			console.log('[Skills Bridge] tarx-skills-provider extension not found');
			return { matched: false, skillName: null, confidence: 0 };
		}

		// Ensure the extension is activated
		if (!skillsExtension.isActive) {
			console.log('[Skills Bridge] Activating tarx-skills-provider...');
			await skillsExtension.activate();
		}

		// Get the exported API from the extension
		const skillsProvider = skillsExtension.exports;

		if (!skillsProvider || typeof skillsProvider.handleMessage !== 'function') {
			console.warn('[Skills Bridge] tarx-skills-provider does not export handleMessage API');
			return { matched: false, skillName: null, confidence: 0 };
		}

		// Call the skills provider to handle the message
		console.log(`[Skills Bridge] Querying skills registry for: "${message.slice(0, 60)}..."`);
		const result = await skillsProvider.handleMessage(message);

		console.log(`[Skills Bridge] Skills registry result: matched=${result.matched}, skill=${result.skillName}`);

		return {
			matched: result.matched,
			skillName: result.skillName,
			confidence: result.matched ? 0.8 : 0,
			result: result.result
		};
	} catch (error) {
		console.error('[Skills Bridge] Error querying skills registry:', error);
		return { matched: false, skillName: null, confidence: 0 };
	}
}

/**
 * Detect if the user wants to CREATE a skill, agent, or automation.
 * This is a meta-intent: they want to build a new capability.
 *
 * Examples:
 * - "Create a skill that monitors Shopify orders"
 * - "Build me an agent for checking Datadog errors"
 * - "Make an automation that runs tests on every commit"
 * - "I need a tool that..."
 */
export function detectSkillCreationIntent(message: string): SkillCreationIntent {
	const lower = message.toLowerCase().trim();

	// Pattern 1: "Create/build/make a skill that..."
	const skillPattern = /(?:create|build|make|write)\s+(?:me\s+)?(?:a\s+)?skill\s+(?:that|to|for)\s+(.+)/i;
	const skillMatch = message.match(skillPattern);
	if (skillMatch) {
		const purpose = skillMatch[1].trim();
		console.log(`[Skills Bridge] Detected create_skill intent: "${purpose}"`);
		return {
			isCreationIntent: true,
			type: 'skill',
			purpose,
			confidence: 0.9
		};
	}

	// Pattern 2: "Create/build/make an agent that..."
	const agentPattern = /(?:create|build|make|set\s+up)\s+(?:me\s+)?(?:an?\s+)?agent\s+(?:that|to|for)\s+(.+)/i;
	const agentMatch = message.match(agentPattern);
	if (agentMatch) {
		const purpose = agentMatch[1].trim();
		console.log(`[Skills Bridge] Detected create_agent intent: "${purpose}"`);
		return {
			isCreationIntent: true,
			type: 'agent',
			purpose,
			confidence: 0.9
		};
	}

	// Pattern 3: "Automate X" or "Set up an automation for X"
	const automationPattern = /(?:automate|set\s+up\s+(?:an?\s+)?automation\s+(?:for|to))\s+(.+)/i;
	const automationMatch = message.match(automationPattern);
	if (automationMatch) {
		const purpose = automationMatch[1].trim();
		console.log(`[Skills Bridge] Detected automation intent: "${purpose}"`);
		return {
			isCreationIntent: true,
			type: 'automation',
			purpose,
			confidence: 0.85
		};
	}

	// Pattern 4: "I need a skill/agent/tool that..."
	const needPattern = /i\s+need\s+(?:a\s+)?(?:skill|agent|tool|automation)\s+(?:that|to)\s+(.+)/i;
	const needMatch = message.match(needPattern);
	if (needMatch) {
		const purpose = needMatch[1].trim();
		console.log(`[Skills Bridge] Detected need-based creation intent: "${purpose}"`);
		return {
			isCreationIntent: true,
			type: 'skill', // Default to skill
			purpose,
			confidence: 0.8
		};
	}

	// Pattern 5: "Can you create/build..." (catch-all for polite requests)
	const politePattern = /(?:can|could)\s+you\s+(?:create|build|make)\s+(?:me\s+)?(?:a\s+)?(?:skill|agent|tool|automation)\s+(?:that|to|for)\s+(.+)/i;
	const politeMatch = message.match(politePattern);
	if (politeMatch) {
		const purpose = politeMatch[1].trim();
		console.log(`[Skills Bridge] Detected polite creation request: "${purpose}"`);
		return {
			isCreationIntent: true,
			type: 'skill',
			purpose,
			confidence: 0.85
		};
	}

	return {
		isCreationIntent: false,
		confidence: 0
	};
}

/**
 * Handle skill/agent creation intent.
 * This starts a conversational flow to gather requirements.
 *
 * TODO: Implement full conversational creation flow (Phase 3)
 * For now, this is a placeholder that acknowledges the intent.
 */
export async function handleSkillCreationIntent(intent: SkillCreationIntent): Promise<string> {
	const { type, purpose } = intent;

	// V1: Simple acknowledgment with guidance
	let response = `I can help you create a ${type}! `;

	if (purpose) {
		response += `You want to: "${purpose}"\n\n`;
	}

	response += `**Next steps to create your ${type}:**\n\n`;
	response += `1. **Define the trigger**: When should this ${type} activate?\n`;
	response += `   - Keywords or phrases\n`;
	response += `   - Time-based schedule\n`;
	response += `   - Event-based (file changes, etc.)\n\n`;

	response += `2. **Specify actions**: What should it do?\n`;
	response += `   - Call APIs (GitHub, Datadog, Shopify, etc.)\n`;
	response += `   - Run commands\n`;
	response += `   - Send notifications\n\n`;

	response += `3. **Choose tools**: What MCP tools does it need?\n`;
	response += `   - Check available MCP servers in your config\n`;
	response += `   - Or I can suggest tools based on your requirements\n\n`;

	response += `For now, you can create a ${type} manually using:\n`;
	response += `**Command Palette** → \`TARX: New Skill File\`\n\n`;

	response += `Or tell me more about what you want this ${type} to do, and I'll help you build it step by step.`;

	return response;
}

/**
 * Main bridge function: check skills registry before falling back to direct execution.
 *
 * Returns:
 * - { handled: true, result: string } if the skills system handled it
 * - { handled: false } if the message should fall through to direct execution / Claude
 */
export async function checkSkillsFirst(message: string): Promise<{ handled: boolean; result?: string }> {
	// Step 1: Check for skill/agent CREATION intent (meta-intent)
	const creationIntent = detectSkillCreationIntent(message);
	if (creationIntent.isCreationIntent && creationIntent.confidence > 0.7) {
		console.log(`[Skills Bridge] Handling creation intent: ${creationIntent.type}`);
		const result = await handleSkillCreationIntent(creationIntent);
		return { handled: true, result };
	}

	// Step 2: Query skills registry for EXISTING skill match
	const skillMatch = await querySkillsRegistry(message);
	if (skillMatch.matched && skillMatch.result) {
		console.log(`[Skills Bridge] Skill "${skillMatch.skillName}" handled the message`);
		return { handled: true, result: skillMatch.result };
	}

	// Step 3: No match - fall through to normal flow
	console.log('[Skills Bridge] No skill match, falling through to direct execution');
	return { handled: false };
}
