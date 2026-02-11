/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../base/browser/dom.js';

export interface ProjectConfig {
	name: string;
	instructions: string;
}

/**
 * Simple modal component for creating new projects.
 * Provides a clean, focused UI similar to Claude/Grok project creation.
 */
export class ProjectCreateModal {
	private overlay: HTMLElement | null = null;

	/**
	 * Show the project creation modal and return user input
	 */
	show(): Promise<ProjectConfig | null> {
		return new Promise((resolve) => {
			// Create overlay
			this.overlay = document.createElement('div');
			this.overlay.className = 'tarx-modal-overlay';

			// Create modal container
			const modal = append(this.overlay, $('.tarx-modal'));

			// Header
			const header = append(modal, $('.tarx-modal-header'));
			const title = append(header, $('h2'));
			title.textContent = 'Create Project';

			// Close button
			const closeBtn = append(header, $('.tarx-modal-close'));
			closeBtn.textContent = '×';
			closeBtn.onclick = () => {
				this.hide();
				resolve(null);
			};

			// Form content
			const content = append(modal, $('.tarx-modal-content'));

			// Project name input
			const nameLabel = append(content, $('label'));
			nameLabel.textContent = 'Project Name';
			const nameInput = append(content, $('input')) as HTMLInputElement;
			nameInput.type = 'text';
			nameInput.id = 'project-name';
			nameInput.placeholder = 'My Project';
			nameInput.autofocus = true;

			// Instructions textarea
			const instructionsLabel = append(content, $('label'));
			instructionsLabel.textContent = 'Instructions (optional)';
			const instructionsInput = append(content, $('textarea')) as HTMLTextAreaElement;
			instructionsInput.id = 'project-instructions';
			instructionsInput.placeholder = 'Add custom instructions for this project...';
			instructionsInput.rows = 4;

			// Actions
			const actions = append(modal, $('.tarx-modal-actions'));

			const cancelBtn = append(actions, $('button.tarx-modal-btn'));
			cancelBtn.textContent = 'Cancel';
			cancelBtn.onclick = () => {
				this.hide();
				resolve(null);
			};

			const createBtn = append(actions, $('button.tarx-modal-btn.primary'));
			createBtn.textContent = 'Create Project';
			createBtn.onclick = () => {
				const name = nameInput.value.trim();
				if (!name) {
					nameInput.classList.add('error');
					nameInput.focus();
					return;
				}
				const instructions = instructionsInput.value.trim();
				this.hide();
				resolve({ name, instructions });
			};

			// Handle Enter key in name input
			nameInput.onkeydown = (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					createBtn.click();
				}
			};

			// Handle Escape key
			this.overlay.onkeydown = (e) => {
				if (e.key === 'Escape') {
					this.hide();
					resolve(null);
				}
			};

			// Click outside to close
			this.overlay.onclick = (e) => {
				if (e.target === this.overlay) {
					this.hide();
					resolve(null);
				}
			};

			// Add to DOM
			document.body.appendChild(this.overlay);

			// Focus name input
			setTimeout(() => nameInput.focus(), 50);
		});
	}

	/**
	 * Hide and remove the modal
	 */
	hide(): void {
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = null;
		}
	}
}
