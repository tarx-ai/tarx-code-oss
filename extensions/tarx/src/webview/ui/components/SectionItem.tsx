/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

interface SectionItemProps {
	icon: string;
	label: string;
	title?: string;
	isActive?: boolean;
	onClick?: () => void;
}

export const SectionItem: React.FC<SectionItemProps> = ({
	icon,
	label,
	title,
	isActive = false,
	onClick
}) => {
	return (
		<div
			className={`tarx-section-item ${isActive ? 'active' : ''}`}
			title={title || label}
			onClick={onClick}
		>
			<span className={`tarx-section-item-icon codicon codicon-${icon}`} />
			<span className="tarx-section-item-label">{label}</span>
		</div>
	);
};
