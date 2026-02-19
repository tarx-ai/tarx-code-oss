/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Starter Prompts
 *  - Interest-based prompt suggestions for onboarding
 *  - Maps user interests to relevant first-message prompts
 *--------------------------------------------------------------------------------------------*/

export type Interest = 'webdev' | 'datascience' | 'devops' | 'other';

export interface StarterPrompt {
	label: string;
	prompt: string;
	icon: string;
}

const STARTER_PROMPTS: Record<Interest, StarterPrompt[]> = {
	webdev: [
		{
			label: 'Scaffold a component',
			prompt: 'Help me scaffold a React component with TypeScript, props interface, and basic styling.',
			icon: 'codicon-symbol-class'
		},
		{
			label: 'Review an API endpoint',
			prompt: 'Review this API endpoint for security issues, error handling, and best practices.',
			icon: 'codicon-shield'
		},
		{
			label: 'Debug CSS layout',
			prompt: 'Help me debug this CSS layout — elements are not aligning correctly.',
			icon: 'codicon-paintcan'
		}
	],
	datascience: [
		{
			label: 'Analyze CSV data',
			prompt: 'Help me analyze this CSV dataset — show me summary statistics and potential insights.',
			icon: 'codicon-graph'
		},
		{
			label: 'Write a pandas pipeline',
			prompt: 'Write a pandas data cleaning pipeline that handles missing values and type conversions.',
			icon: 'codicon-table'
		},
		{
			label: 'Explain model architecture',
			prompt: 'Explain the architecture of a transformer model and when to use one.',
			icon: 'codicon-lightbulb'
		}
	],
	devops: [
		{
			label: 'Write a Dockerfile',
			prompt: 'Write a production Dockerfile for a Node.js application with multi-stage build.',
			icon: 'codicon-server'
		},
		{
			label: 'GitHub Actions CI',
			prompt: 'Set up a GitHub Actions CI pipeline with lint, test, and deploy stages.',
			icon: 'codicon-github-action'
		},
		{
			label: 'Debug Terraform config',
			prompt: 'Help me debug this Terraform configuration — resource creation is failing.',
			icon: 'codicon-tools'
		}
	],
	other: [
		{
			label: 'Explain this code',
			prompt: 'Explain what this code does and suggest improvements.',
			icon: 'codicon-comment-discussion'
		},
		{
			label: 'Write a function',
			prompt: 'Write a utility function that I can describe to you.',
			icon: 'codicon-symbol-method'
		},
		{
			label: 'Find a bug',
			prompt: 'Help me find and fix a bug in my code.',
			icon: 'codicon-bug'
		}
	]
};

export function getStarterPrompts(interest: Interest): StarterPrompt[] {
	return STARTER_PROMPTS[interest] || STARTER_PROMPTS.other;
}

export function getAllInterests(): Array<{ id: Interest; label: string; description: string; icon: string }> {
	return [
		{ id: 'webdev', label: 'Web Development', description: 'React, APIs, CSS, TypeScript', icon: 'codicon-globe' },
		{ id: 'datascience', label: 'Data Science', description: 'Pandas, ML, visualization', icon: 'codicon-graph' },
		{ id: 'devops', label: 'DevOps', description: 'Docker, CI/CD, Terraform', icon: 'codicon-server-process' },
		{ id: 'other', label: 'Other', description: 'General coding assistance', icon: 'codicon-code' }
	];
}
