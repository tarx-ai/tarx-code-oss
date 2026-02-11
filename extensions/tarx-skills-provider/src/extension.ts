/**
 * TARX Skills Provider — Extension Entry Point
 *
 * Activates the skills registry, loads skill/agent definitions,
 * and exposes the intent classifier + skill executor for the chat system.
 *
 * Also registers TARX language model providers (local + mesh) with VS Code.
 */

import * as vscode from 'vscode';
import { resolve, join } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildSkillRegistry } from './skillResolver.js';
import { classifyIntent, getBestSkill } from './intentClassifier.js';
import { executeSkill, checkServerHealth, ALL_KNOWN_TOOLS, validateToolAvailability } from './skillExecutor.js';
import { mapQwenToThinking, ThinkingAccumulator } from './thinkingMapper.js';
import { TarxModelProvider } from './modelProvider.js';
import { TarxStatusBarManager } from './statusBar.js';
import { withErrorHandling, showTarxError } from './errorHandler.js';
import type { ResolvedSkill, ResolvedAgent, IntentMatch } from './types.js';

/** Skills provider instance — singleton for the extension lifecycle */
export class TarxSkillsProvider {
	private skills = new Map<string, ResolvedSkill>();
	private agents = new Map<string, ResolvedAgent>();
	private initialized = false;

	constructor(
		private workspaceRoot: string,
		private skillDirs: string[] = ['.tarx/skills', '.github/skills'],
		private agentDirs: string[] = ['.tarx/agents'],
	) {}

	/**
	 * Initialize the skills registry by scanning configured directories.
	 */
	async initialize(): Promise<void> {
		const absDirs = this.skillDirs.map(d => resolve(this.workspaceRoot, d));
		const absAgentDirs = this.agentDirs.map(d => resolve(this.workspaceRoot, d));

		const { skills, agents } = await buildSkillRegistry(absDirs, absAgentDirs);
		this.skills = skills;
		this.agents = agents;
		this.initialized = true;

		console.log(`[tarx-skills] Loaded ${skills.size} skills, ${agents.size} agents`);
		for (const [name, skill] of skills) {
			const { available, missing } = validateToolAvailability(skill.frontmatter.tools, ALL_KNOWN_TOOLS);
			skill.toolsAvailable = missing.length === 0;
			if (missing.length > 0) {
				console.warn(`[tarx-skills] Skill "${name}" has missing tools: ${missing.join(', ')}`);
			}
		}
	}

	/**
	 * Reload skills from disk (e.g., after user edits a skill file).
	 */
	async reload(): Promise<void> {
		await this.initialize();
	}

	/**
	 * Classify a user message and return the best matching skill.
	 */
	classifyMessage(message: string): IntentMatch[] {
		return classifyIntent(message);
	}

	/**
	 * Get the best skill for a message, resolved from the registry.
	 */
	getSkillForMessage(message: string, threshold = 0.15): ResolvedSkill | null {
		const match = getBestSkill(message, threshold);
		if (!match) return null;

		// Map skill name (e.g., "tarx-code-gen") to frontmatter name (e.g., "tarx-code-gen")
		return this.skills.get(match.skillName) ?? null;
	}

	/**
	 * Execute the best matching skill for a user message.
	 */
	async handleMessage(message: string) {
		if (!this.initialized) {
			await this.initialize();
		}

		const skill = this.getSkillForMessage(message);
		if (!skill) {
			return {
				matched: false,
				skillName: null,
				result: null,
			};
		}

		// Wrap skill execution with error handling
		const result = await withErrorHandling(
			() => executeSkill(skill, message),
			{
				showProgress: false,
				retries: 1
			}
		);

		return {
			matched: true,
			skillName: skill.frontmatter.name,
			result,
		};
	}

	/** Get all loaded skills */
	getSkills(): ResolvedSkill[] {
		return Array.from(this.skills.values());
	}

	/** Get all loaded agents */
	getAgents(): ResolvedAgent[] {
		return Array.from(this.agents.values());
	}

	/** Get a specific skill by name */
	getSkill(name: string): ResolvedSkill | undefined {
		return this.skills.get(name);
	}

	/** Get a specific agent by name */
	getAgent(name: string): ResolvedAgent | undefined {
		return this.agents.get(name);
	}

	/** Get system health status */
	async getHealth() {
		return checkServerHealth();
	}
}

// Re-export for direct usage
export { classifyIntent, getBestSkill } from './intentClassifier.js';
export { parseFrontmatter, resolveSkillFile, buildSkillRegistry } from './skillResolver.js';
export { executeSkill, checkServerHealth, validateRoute, ALL_KNOWN_TOOLS } from './skillExecutor.js';
export { mapQwenToThinking, ThinkingAccumulator } from './thinkingMapper.js';
export type * from './types.js';

// ============================================================================
// VS Code Extension Activation
// ============================================================================

let modelProvider: TarxModelProvider | undefined;
let statusBarManager: TarxStatusBarManager | undefined;
let skillsProvider: TarxSkillsProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('[tarx-skills-provider] Activating...');

	// Initialize skills provider for workspace
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (workspaceFolder) {
		skillsProvider = new TarxSkillsProvider(workspaceFolder.uri.fsPath);
		// Initialize asynchronously (don't block activation)
		skillsProvider.initialize().catch(err => {
			console.error('[tarx-skills-provider] Failed to initialize skills registry:', err);
		});
	} else {
		console.warn('[tarx-skills-provider] No workspace folder - skills registry disabled');
	}

	// Get configuration
	const config = vscode.workspace.getConfiguration('tarx');
	const localServerUrl = config.get<string>('serverUrl', 'http://localhost:11435');
	const meshServerUrl = config.get<string>('meshServerUrl', 'http://localhost:11436');

	// Create and register model provider
	modelProvider = new TarxModelProvider(localServerUrl, meshServerUrl);

	try {
		// Register both local and mesh providers under "tarx-skills" vendor
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			'tarx-skills',
			modelProvider
		);
		context.subscriptions.push(providerDisposable);

		// Start health checks
		modelProvider.startHealthChecks();

		console.log('[tarx-skills-provider] Language model providers registered');

		// Create comprehensive status bar manager
		statusBarManager = new TarxStatusBarManager();
		context.subscriptions.push(statusBarManager);

		// Register status bar commands
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.status.showDetails', async () => {
				await statusBarManager!.showDetails();
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.status.switchModel', async () => {
				await statusBarManager!.switchModel();
			})
		);

		// Legacy command for backward compatibility
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx-skills.selectModel', async () => {
				await statusBarManager!.switchModel();
			})
		);

		// Command: TARX: Retry Last Request
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.chat.retry', async () => {
				// This is a placeholder - actual retry logic should be implemented
				// by the chat participant that calls the model
				vscode.window.showInformationMessage('Retry functionality should be implemented by the chat participant');
			})
		);

		// Command: TARX: New Skill File
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.skills.newSkill', async () => {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) {
					vscode.window.showErrorMessage('No workspace folder open. Please open a workspace first.');
					return;
				}

				// Prompt for skill name
				const skillName = await vscode.window.showInputBox({
					prompt: 'Enter skill name (e.g., my-skill)',
					placeHolder: 'my-skill',
					validateInput: (value) => {
						if (!value || value.trim() === '') {
							return 'Skill name cannot be empty';
						}
						if (!/^[a-z0-9-]+$/.test(value)) {
							return 'Skill name must be lowercase alphanumeric with hyphens';
						}
						return null;
					}
				});

				if (!skillName) return;

				// Prompt for description
				const description = await vscode.window.showInputBox({
					prompt: 'Enter skill description',
					placeHolder: 'What does this skill do?',
					validateInput: (value) => {
						if (!value || value.trim() === '') {
							return 'Description cannot be empty';
						}
						return null;
					}
				});

				if (!description) return;

				try {
					// Read template
					const templatePath = join(context.extensionPath, 'templates', 'skill-template.md');
					let templateContent = await readFile(templatePath, 'utf-8');

					// Replace placeholders
					templateContent = templateContent.replace(/\{\{skillName\}\}/g, skillName);
					templateContent = templateContent.replace(/\{\{description\}\}/g, description);

					// Create .tarx/skills directory if needed
					const skillsDir = join(workspaceFolder.uri.fsPath, '.tarx', 'skills');
					await mkdir(skillsDir, { recursive: true });

					// Write skill file
					const skillFilePath = join(skillsDir, `${skillName}.md`);
					await writeFile(skillFilePath, templateContent, 'utf-8');

					// Open the file in editor
					const doc = await vscode.workspace.openTextDocument(skillFilePath);
					await vscode.window.showTextDocument(doc);

					vscode.window.showInformationMessage(`Created skill: ${skillName}.md`);
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to create skill: ${error instanceof Error ? error.message : String(error)}`);
				}
			})
		);

		// Command: TARX: Configure Skills
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.skills.configureSkills', async () => {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) {
					vscode.window.showErrorMessage('No workspace folder open. Please open a workspace first.');
					return;
				}

				const skillsDir = join(workspaceFolder.uri.fsPath, '.tarx', 'skills');

				try {
					// Create directory if it doesn't exist
					await mkdir(skillsDir, { recursive: true });

					// Open the directory in file explorer
					const uri = vscode.Uri.file(skillsDir);
					await vscode.commands.executeCommand('revealFileInOS', uri);
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to open skills directory: ${error instanceof Error ? error.message : String(error)}`);
				}
			})
		);

		// Command: TARX: List Available Skills
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.skills.listSkills', async () => {
				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) {
					vscode.window.showErrorMessage('No workspace folder open. Please open a workspace first.');
					return;
				}

				try {
					// Get configured skill directories
					const skillDirs = config.get<string[]>('skills.locations', ['.tarx/skills', '.github/skills']);
					const absSkillDirs = skillDirs.map(d => resolve(workspaceFolder.uri.fsPath, d));

					// Build skill registry
					const { skills } = await buildSkillRegistry(absSkillDirs, []);

					if (skills.size === 0) {
						const createFirst = await vscode.window.showInformationMessage(
							'No skills found. Would you like to create your first skill?',
							'Create Skill',
							'Cancel'
						);

						if (createFirst === 'Create Skill') {
							await vscode.commands.executeCommand('tarx.skills.newSkill');
						}
						return;
					}

					// Show QuickPick with skill names and descriptions
					const skillItems = Array.from(skills.values()).map(skill => ({
						label: skill.frontmatter.name,
						description: skill.frontmatter.description,
						detail: `Route: ${skill.frontmatter.route} | Tier: ${skill.frontmatter.tier}`,
						filePath: skill.filePath
					}));

					const selected = await vscode.window.showQuickPick(skillItems, {
						placeHolder: 'Select a skill to view or edit',
						matchOnDescription: true,
						matchOnDetail: true
					});

					if (selected) {
						const doc = await vscode.workspace.openTextDocument(selected.filePath);
						await vscode.window.showTextDocument(doc);
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to list skills: ${error instanceof Error ? error.message : String(error)}`);
				}
			})
		);

	} catch (error) {
		console.error('[tarx-skills-provider] Failed to register language model provider:', error);
	}

	console.log('[tarx-skills-provider] Activated successfully');

	// Export API for other extensions to use (main tarx extension)
	return {
		// Skills registry API
		handleMessage: async (message: string) => {
			if (!skillsProvider) {
				return { matched: false, skillName: null, result: null };
			}
			return await skillsProvider.handleMessage(message);
		},
		getSkills: () => {
			if (!skillsProvider) return [];
			return skillsProvider.getSkills();
		},
		getAgents: () => {
			if (!skillsProvider) return [];
			return skillsProvider.getAgents();
		},
		reload: async () => {
			if (skillsProvider) {
				await skillsProvider.reload();
			}
		},
		// Model provider API
		getModelProvider: () => modelProvider,
		// Health API
		getHealth: async () => {
			if (skillsProvider) {
				return await skillsProvider.getHealth();
			}
			return { local: false, mesh: false };
		}
	};
}

export function deactivate() {
	console.log('[tarx-skills-provider] Deactivating...');

	if (modelProvider) {
		modelProvider.dispose();
		modelProvider = undefined;
	}

	if (statusBarManager) {
		statusBarManager.dispose();
		statusBarManager = undefined;
	}

	if (skillsProvider) {
		skillsProvider = undefined;
	}
}
