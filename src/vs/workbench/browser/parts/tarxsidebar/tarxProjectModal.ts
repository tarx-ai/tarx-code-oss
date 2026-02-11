/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Simple modal - no imports needed, uses vanilla DOM

export interface ProjectCreateResult {
	name: string;
	instructions: string;
}

/**
 * Simple HTML overlay modal for project creation.
 * Dark theme using VS Code CSS variables.
 */
export class TarxProjectModal {
	private overlay: HTMLElement | null = null;
	private modal: HTMLElement | null = null;
	private nameInput: HTMLInputElement | null = null;
	private instructionsTextarea: HTMLTextAreaElement | null = null;
	private resolvePromise: ((result: ProjectCreateResult | null) => void) | null = null;

	/**
	 * Show the project creation modal and wait for user input.
	 * Returns { name, instructions } on create or null on cancel.
	 */
	public show(): Promise<ProjectCreateResult | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.createModal();
		});
	}

	private createModal(): void {
		// Create overlay
		this.overlay = document.createElement('div');
		this.overlay.className = 'tarx-modal-overlay';
		this.overlay.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(0, 0, 0, 0.5);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 9999;
		`;

		// Create modal container
		this.modal = document.createElement('div');
		this.modal.className = 'tarx-project-modal';
		this.modal.style.cssText = `
			width: 400px;
			max-width: 90vw;
			background: var(--vscode-editor-background, #1e1e1e);
			border: 1px solid var(--vscode-widget-border, #454545);
			border-radius: 8px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			overflow: hidden;
		`;

		// Header
		const header = document.createElement('div');
		header.style.cssText = `
			padding: 16px 20px;
			border-bottom: 1px solid var(--vscode-widget-border, #454545);
		`;
		const title = document.createElement('h2');
		title.textContent = 'Create Project';
		title.style.cssText = `
			margin: 0;
			font-size: 16px;
			font-weight: 600;
			color: var(--vscode-foreground, #cccccc);
		`;
		header.appendChild(title);

		// Body
		const body = document.createElement('div');
		body.style.cssText = `
			padding: 20px;
		`;

		// Name field
		const nameLabel = document.createElement('label');
		nameLabel.textContent = 'Project Name';
		nameLabel.style.cssText = `
			display: block;
			margin-bottom: 6px;
			font-size: 13px;
			font-weight: 500;
			color: var(--vscode-foreground, #cccccc);
		`;

		this.nameInput = document.createElement('input');
		this.nameInput.type = 'text';
		this.nameInput.placeholder = 'My Project';
		this.nameInput.style.cssText = `
			width: 100%;
			padding: 8px 12px;
			font-size: 14px;
			background: var(--vscode-input-background, #3c3c3c);
			color: var(--vscode-input-foreground, #cccccc);
			border: 1px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 4px;
			outline: none;
			box-sizing: border-box;
		`;
		this.nameInput.addEventListener('focus', () => {
			this.nameInput!.style.borderColor = 'var(--vscode-focusBorder, #007acc)';
		});
		this.nameInput.addEventListener('blur', () => {
			this.nameInput!.style.borderColor = 'var(--vscode-input-border, #3c3c3c)';
		});

		// Instructions field
		const instructionsLabel = document.createElement('label');
		instructionsLabel.textContent = 'Instructions (optional)';
		instructionsLabel.style.cssText = `
			display: block;
			margin-top: 16px;
			margin-bottom: 6px;
			font-size: 13px;
			font-weight: 500;
			color: var(--vscode-foreground, #cccccc);
		`;

		const instructionsHint = document.createElement('p');
		instructionsHint.textContent = 'Tell TARX about your project goals, coding style, or preferences.';
		instructionsHint.style.cssText = `
			margin: 0 0 8px 0;
			font-size: 12px;
			color: var(--vscode-descriptionForeground, #888888);
		`;

		this.instructionsTextarea = document.createElement('textarea');
		this.instructionsTextarea.placeholder = 'Example: This is a React TypeScript project. Use functional components with hooks...';
		this.instructionsTextarea.rows = 4;
		this.instructionsTextarea.style.cssText = `
			width: 100%;
			padding: 8px 12px;
			font-size: 14px;
			font-family: inherit;
			background: var(--vscode-input-background, #3c3c3c);
			color: var(--vscode-input-foreground, #cccccc);
			border: 1px solid var(--vscode-input-border, #3c3c3c);
			border-radius: 4px;
			outline: none;
			resize: vertical;
			box-sizing: border-box;
		`;
		this.instructionsTextarea.addEventListener('focus', () => {
			this.instructionsTextarea!.style.borderColor = 'var(--vscode-focusBorder, #007acc)';
		});
		this.instructionsTextarea.addEventListener('blur', () => {
			this.instructionsTextarea!.style.borderColor = 'var(--vscode-input-border, #3c3c3c)';
		});

		body.appendChild(nameLabel);
		body.appendChild(this.nameInput);
		body.appendChild(instructionsLabel);
		body.appendChild(instructionsHint);
		body.appendChild(this.instructionsTextarea);

		// Footer with buttons
		const footer = document.createElement('div');
		footer.style.cssText = `
			padding: 16px 20px;
			border-top: 1px solid var(--vscode-widget-border, #454545);
			display: flex;
			justify-content: flex-end;
			gap: 8px;
		`;

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Cancel';
		cancelBtn.style.cssText = `
			padding: 8px 16px;
			font-size: 13px;
			background: var(--vscode-button-secondaryBackground, #3c3c3c);
			color: var(--vscode-button-secondaryForeground, #cccccc);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		`;
		cancelBtn.addEventListener('mouseenter', () => {
			cancelBtn.style.background = 'var(--vscode-button-secondaryHoverBackground, #454545)';
		});
		cancelBtn.addEventListener('mouseleave', () => {
			cancelBtn.style.background = 'var(--vscode-button-secondaryBackground, #3c3c3c)';
		});
		cancelBtn.addEventListener('click', () => this.close(null));

		const createBtn = document.createElement('button');
		createBtn.textContent = 'Create';
		createBtn.style.cssText = `
			padding: 8px 16px;
			font-size: 13px;
			background: var(--vscode-button-background, #0e639c);
			color: var(--vscode-button-foreground, #ffffff);
			border: none;
			border-radius: 4px;
			cursor: pointer;
		`;
		createBtn.addEventListener('mouseenter', () => {
			createBtn.style.background = 'var(--vscode-button-hoverBackground, #1177bb)';
		});
		createBtn.addEventListener('mouseleave', () => {
			createBtn.style.background = 'var(--vscode-button-background, #0e639c)';
		});
		createBtn.addEventListener('click', () => this.handleCreate());

		footer.appendChild(cancelBtn);
		footer.appendChild(createBtn);

		// Assemble modal
		this.modal.appendChild(header);
		this.modal.appendChild(body);
		this.modal.appendChild(footer);
		this.overlay.appendChild(this.modal);

		// Add to document
		document.body.appendChild(this.overlay);

		// Focus name input
		setTimeout(() => this.nameInput?.focus(), 50);

		// Close on escape key
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.close(null);
				document.removeEventListener('keydown', handleKeydown);
			} else if (e.key === 'Enter' && e.ctrlKey) {
				this.handleCreate();
				document.removeEventListener('keydown', handleKeydown);
			}
		};
		document.addEventListener('keydown', handleKeydown);

		// Close on overlay click (not modal)
		this.overlay.addEventListener('click', (e) => {
			if (e.target === this.overlay) {
				this.close(null);
			}
		});
	}

	private handleCreate(): void {
		const name = this.nameInput?.value.trim();
		if (!name) {
			this.nameInput?.focus();
			return;
		}

		const instructions = this.instructionsTextarea?.value.trim() || '';
		this.close({ name, instructions });
	}

	private close(result: ProjectCreateResult | null): void {
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = null;
		}
		if (this.resolvePromise) {
			this.resolvePromise(result);
			this.resolvePromise = null;
		}
	}
}
