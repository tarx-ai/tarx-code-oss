/**
 * TARX Project Creation Flow
 * Grok/Claude-style native VS Code API integration
 *
 * @file extensions/tarx/src/project-creation.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// ========================================
// TYPES
// ========================================

export interface ProjectMetadata {
	id: string;
	name: string;
	instructions: string;
	workspacePath: string;
	files: string[];
	status: 'active' | 'archived' | 'paused';
	createdAt: number;
	updatedAt: number;
}

export interface CreateProjectOptions {
	skipInstructions?: boolean;
	skipFileSelection?: boolean;
	defaultName?: string;
}

// ========================================
// MAIN: CREATE PROJECT FLOW
// ========================================

/**
 * Grok/Claude-style project creation with native VS Code dialogs
 */
export async function createProjectFlow(options: CreateProjectOptions = {}): Promise<ProjectMetadata | null> {
	const logPrefix = '[Project Creation]';

	try {
		// ────────────────────────────────────────
		// STEP 1: Project Name (showInputBox)
		// ────────────────────────────────────────
		const projectName = await vscode.window.showInputBox({
			title: 'Create TARX Project',
			prompt: 'What should we call this project?',
			placeHolder: 'my-awesome-project',
			value: options.defaultName || '',
			validateInput: validateProjectName
		});

		if (!projectName) {
			log(`${logPrefix} Cancelled at name input`);
			return null;
		}

		// ────────────────────────────────────────
		// STEP 2: Instructions (showInputBox - multiline simulation)
		// ────────────────────────────────────────
		let instructions = '';
		if (!options.skipInstructions) {
			instructions = await vscode.window.showInputBox({
				title: `Instructions for "${projectName}"`,
				prompt: 'Describe what this project does. TARX will use this context in every conversation.',
				placeHolder: 'A REST API for user management built with TypeScript, Express, and PostgreSQL. Uses JWT for auth...',
				ignoreFocusOut: true
			}) || '';
		}

		// ────────────────────────────────────────
		// STEP 3: Folder Selection (showOpenDialog)
		// ────────────────────────────────────────
		let workspacePath: string;
		let selectedFiles: string[] = [];

		if (!options.skipFileSelection) {
			const selection = await vscode.window.showQuickPick([
				{
					label: '$(folder-opened) Select existing folder',
					description: 'Use an existing project folder',
					action: 'select'
				},
				{
					label: '$(new-folder) Create new folder',
					description: `Creates ~/TARX Projects/${projectName}`,
					action: 'create'
				},
				{
					label: '$(file-add) Add files to new folder',
					description: 'Create folder and copy files into it',
					action: 'create-with-files'
				}
			], {
				title: 'Where should this project live?',
				placeHolder: 'Choose how to set up your project folder'
			});

			if (!selection) {
				log(`${logPrefix} Cancelled at folder selection`);
				return null;
			}

			if (selection.action === 'select') {
				// Show folder picker
				const folderUri = await vscode.window.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					title: 'Select Project Folder',
					openLabel: 'Select as Project Root'
				});

				if (!folderUri || folderUri.length === 0) {
					log(`${logPrefix} No folder selected`);
					return null;
				}

				workspacePath = folderUri[0].fsPath;

			} else if (selection.action === 'create-with-files') {
				// First select files to include
				const fileUris = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectFolders: true,
					canSelectMany: true,
					title: 'Select files/folders to include',
					openLabel: 'Add to Project'
				});

				if (fileUris) {
					selectedFiles = fileUris.map(uri => uri.fsPath);
				}

				// Create new folder
				workspacePath = await createProjectFolder(projectName);

			} else {
				// Create new folder (default)
				workspacePath = await createProjectFolder(projectName);
			}
		} else {
			// Auto-create folder
			workspacePath = await createProjectFolder(projectName);
		}

		// ────────────────────────────────────────
		// STEP 4: Create .tarx config directory
		// ────────────────────────────────────────
		const tarxConfigPath = path.join(workspacePath, '.tarx');
		await vscode.workspace.fs.createDirectory(vscode.Uri.file(tarxConfigPath));

		// Write instructions.md
		const instructionsPath = path.join(tarxConfigPath, 'instructions.md');
		const instructionsContent = generateInstructionsFile(projectName, instructions);
		await vscode.workspace.fs.writeFile(
			vscode.Uri.file(instructionsPath),
			new TextEncoder().encode(instructionsContent)
		);

		// Write config.json
		const configPath = path.join(tarxConfigPath, 'config.json');
		const configContent = {
			name: projectName,
			created: new Date().toISOString(),
			instructions: instructions,
			settings: {
				autoIndex: true,
				ragEnabled: true,
				contextWindow: 4096
			}
		};
		await vscode.workspace.fs.writeFile(
			vscode.Uri.file(configPath),
			new TextEncoder().encode(JSON.stringify(configContent, null, 2))
		);

		// ────────────────────────────────────────
		// STEP 5: Copy selected files (if any)
		// ────────────────────────────────────────
		if (selectedFiles.length > 0) {
			for (const filePath of selectedFiles) {
				const fileName = path.basename(filePath);
				const destPath = path.join(workspacePath, fileName);
				try {
					await vscode.workspace.fs.copy(
						vscode.Uri.file(filePath),
						vscode.Uri.file(destPath),
						{ overwrite: false }
					);
					log(`${logPrefix} Copied: ${fileName}`);
				} catch (e) {
					console.warn(`Could not copy ${fileName}:`, e);
				}
			}
		}

		// ────────────────────────────────────────
		// STEP 6: Create project metadata
		// ────────────────────────────────────────
		const now = Date.now();
		const projectId = generateProjectId(projectName);

		const metadata: ProjectMetadata = {
			id: projectId,
			name: projectName,
			instructions: instructions,
			workspacePath: workspacePath,
			files: selectedFiles,
			status: 'active',
			createdAt: now,
			updatedAt: now
		};

		// ────────────────────────────────────────
		// STEP 7: Sync to sessions DB
		// ────────────────────────────────────────
		await syncToSessionsDB(metadata);
		log(`${logPrefix} Synced to DB: ${projectId}`);

		// ────────────────────────────────────────
		// STEP 8: Sync to workspaceState
		// ────────────────────────────────────────
		try {
			await vscode.commands.executeCommand('tarx.projects.addProject', {
				id: projectId,
				name: projectName,
				path: workspacePath,
				type: detectProjectType(workspacePath),
				instructions: instructions
			});
			log(`${logPrefix} Synced to workspaceState`);
		} catch (e) {
			console.warn('Could not sync to workspaceState:', e);
		}

		// ────────────────────────────────────────
		// STEP 9: Refresh sidebar
		// ────────────────────────────────────────
		try {
			await vscode.commands.executeCommand('tarx.projects.refresh');
			log(`${logPrefix} Sidebar refreshed`);
		} catch (e) {
			console.warn('Could not refresh sidebar:', e);
		}

		// ────────────────────────────────────────
		// STEP 10: Success notification + open folder option
		// ────────────────────────────────────────
		const openFolder = await vscode.window.showInformationMessage(
			`🎮 Project "${projectName}" created — +0.5 credits`,
			'Open Folder',
			'Start Chat'
		);

		if (openFolder === 'Open Folder') {
			await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspacePath));
		} else if (openFolder === 'Start Chat') {
			await vscode.commands.executeCommand('workbench.action.chat.open');
		}

		// Log to god-mode
		logToGodMode(`PROJECT CREATED: ${projectName} at ${workspacePath}`);

		return metadata;

	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		vscode.window.showErrorMessage(`Failed to create project: ${message}`);
		log(`${logPrefix} ERROR: ${message}`);
		return null;
	}
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function validateProjectName(value: string): string | null {
	if (!value || value.trim().length === 0) {
		return 'Project name is required';
	}
	if (value.length > 50) {
		return 'Name too long (max 50 chars)';
	}
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
		return 'Use letters, numbers, dashes, underscores. Start with letter/number.';
	}
	return null;
}

async function createProjectFolder(projectName: string): Promise<string> {
	const tarxRoot = path.join(os.homedir(), 'TARX Projects');
	const projectPath = path.join(tarxRoot, projectName);

	// Ensure TARX Projects root exists
	await vscode.workspace.fs.createDirectory(vscode.Uri.file(tarxRoot));
	// Create project folder
	await vscode.workspace.fs.createDirectory(vscode.Uri.file(projectPath));

	return projectPath;
}

function generateProjectId(name: string): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substr(2, 6);
	const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '').substr(0, 10);
	return `proj-${safeName}-${timestamp}-${random}`;
}

function generateInstructionsFile(name: string, instructions: string): string {
	return `# ${name}

${instructions || 'No instructions provided yet.'}

---

## Project Context

This file is automatically loaded by TARX and included in every conversation.
Edit this to add:
- Architecture decisions
- Coding standards
- Important files to reference
- Common tasks and commands

## Quick Commands

- \`@tarx explain\` - Explain code in context
- \`@tarx refactor\` - Improve code quality
- \`@tarx tests\` - Generate tests
- \`@tarx fix\` - Debug issues
`;
}

function detectProjectType(projectPath: string): string {
	const fs = require('fs');
	const checks: [string, string][] = [
		['package.json', 'javascript'],
		['tsconfig.json', 'typescript'],
		['Cargo.toml', 'rust'],
		['go.mod', 'go'],
		['requirements.txt', 'python'],
		['pyproject.toml', 'python'],
		['pom.xml', 'java'],
		['build.gradle', 'java'],
	];

	for (const [file, type] of checks) {
		if (fs.existsSync(path.join(projectPath, file))) {
			return type;
		}
	}
	return 'general';
}

async function syncToSessionsDB(metadata: ProjectMetadata): Promise<void> {
	const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

	// Insert into projects table
	const projectSQL = `
		INSERT OR REPLACE INTO projects (id, name, root, type, created_at, is_active)
		VALUES (
			'${metadata.id}',
			'${escapeSql(metadata.name)}',
			'${escapeSql(metadata.workspacePath)}',
			'general',
			${metadata.createdAt},
			1
		);
	`;

	// Insert into sessions table
	const sessionSQL = `
		INSERT OR REPLACE INTO sessions (id, title, space_id, model, message_count, created_at, updated_at)
		VALUES (
			'session-${metadata.id}',
			'${escapeSql(metadata.name)} - New Project',
			'space-tarx-dev',
			'tarx',
			0,
			${metadata.createdAt},
			${metadata.updatedAt}
		);
	`;

	// Set all other projects to inactive
	const deactivateSQL = `UPDATE projects SET is_active = 0 WHERE id != '${metadata.id}';`;

	try {
		execSync(`sqlite3 "${dbPath}"`, {
			input: projectSQL + sessionSQL + deactivateSQL,
			encoding: 'utf8'
		});
	} catch (e) {
		console.error('DB sync failed:', e);
		throw e;
	}
}

function escapeSql(str: string): string {
	return str.replace(/'/g, "''");
}

function log(message: string): void {
	console.log(message);
	try {
		const logPath = path.join(os.homedir(), 'TARX', 'sidebar-hive.log');
		const fs = require('fs');
		const timestamp = new Date().toISOString();
		fs.appendFileSync(logPath, `[${timestamp}] [Slave 2] ${message}\n`);
	} catch (e) { /* silent */ }
}

function logToGodMode(message: string): void {
	try {
		const logPath = path.join(os.homedir(), 'TARX', 'tarx-god.log');
		const fs = require('fs');
		const timestamp = new Date().toISOString();
		fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
	} catch (e) { /* silent */ }
}

// ========================================
// COMMAND REGISTRATION
// ========================================

export function registerProjectCreationCommands(context: vscode.ExtensionContext): void {
	// Full creation flow
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.project.create', () => createProjectFlow())
	);

	// Quick create (minimal dialogs)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.project.quickCreate', () =>
			createProjectFlow({ skipInstructions: true, skipFileSelection: true })
		)
	);

	// Create with default name
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.project.createNamed', (name: string) =>
			createProjectFlow({ defaultName: name })
		)
	);

	log('[Slave 2] Project creation commands registered');
}

// Types and functions are exported at declaration
