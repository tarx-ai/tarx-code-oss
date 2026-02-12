/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

interface CollapsibleSectionProps {
	id: string;
	title: string;
	icon: string;
	collapsed: boolean;
	onToggle: () => void;
	onAdd?: () => void;
	addTitle?: string;
	onSeeAll?: () => void;
	children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
	id,
	title,
	icon,
	collapsed,
	onToggle,
	onAdd,
	addTitle,
	onSeeAll,
	children
}) => {
	const handleHeaderClick = () => {
		onToggle();
	};

	const handleAddClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onAdd?.();
	};

	const handleSeeAllClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onSeeAll?.();
	};

	return (
		<div className={`tarx-section ${collapsed ? 'collapsed' : ''}`} data-section-id={id}>
			<div className="tarx-section-header" onClick={handleHeaderClick}>
				<i className={`tarx-section-icon codicon codicon-${icon}`} />
				<span className="tarx-section-title">{title}</span>
				{onAdd && (
					<i
						className="tarx-action-btn tarx-section-add codicon codicon-add"
						title={addTitle || 'Add'}
						onClick={handleAddClick}
					/>
				)}
				{onSeeAll && (
					<i
						className="tarx-action-btn tarx-section-see-all codicon codicon-arrow-right"
						title="See all"
						onClick={handleSeeAllClick}
					/>
				)}
				<i className="tarx-section-chevron codicon codicon-chevron-down" />
			</div>
			<div className="tarx-section-content">
				{children}
			</div>
		</div>
	);
};
