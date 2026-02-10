/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useRef, useEffect } from 'react';

interface ProjectModalProps {
	onSubmit: (name: string) => void;
	onCancel: () => void;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ onSubmit, onCancel }) => {
	const [name, setName] = useState('');
	const [error, setError] = useState(false);
	const nameInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		nameInputRef.current?.focus();
	}, []);

	const handleSubmit = () => {
		if (!name.trim()) {
			setError(true);
			return;
		}
		onSubmit(name.trim());
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		} else if (e.key === 'Escape') {
			onCancel();
		}
	};

	const handleOverlayClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) {
			onCancel();
		}
	};

	return (
		<div className="tarx-modal-overlay" onClick={handleOverlayClick}>
			<div className="tarx-modal" onKeyDown={handleKeyDown}>
				<div className="tarx-modal-header">
					<h2>Create Project</h2>
					<span className="tarx-modal-close" onClick={onCancel}>&times;</span>
				</div>
				<div className="tarx-modal-content">
					<label htmlFor="project-name">PROJECT NAME</label>
					<input
						id="project-name"
						ref={nameInputRef}
						type="text"
						value={name}
						onChange={e => {
							setName(e.target.value);
							setError(false);
						}}
						className={error ? 'error' : ''}
						placeholder="my-awesome-project"
					/>
					<p style={{
						fontSize: '11px',
						opacity: 0.6,
						marginTop: '8px',
						marginBottom: 0
					}}>
						Creates folder at ~/TARX Projects/{name || 'project-name'}/
					</p>
				</div>
				<div className="tarx-modal-actions">
					<button className="tarx-modal-btn" onClick={onCancel}>
						Cancel
					</button>
					<button className="tarx-modal-btn primary gradient" onClick={handleSubmit}>
						Create
					</button>
				</div>
			</div>
		</div>
	);
};
