/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

interface UploadProgressProps {
	text: string;
	percent: number;
}

export const UploadProgress: React.FC<UploadProgressProps> = ({ text, percent }) => {
	return (
		<div className="tarx-upload-progress">
			<div className="tarx-upload-progress-header">
				<div className="tarx-upload-progress-info">
					<span className="tarx-upload-progress-icon spinning codicon codicon-loading" />
					<span className="tarx-upload-progress-text">{text}</span>
				</div>
				<span className="tarx-upload-progress-percent">{Math.round(percent)}%</span>
			</div>
			<div className="tarx-upload-progress-bar">
				<div
					className="tarx-upload-progress-bar-fill"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
};
