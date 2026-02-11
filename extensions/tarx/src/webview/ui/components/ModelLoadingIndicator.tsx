/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';

export const ModelLoadingIndicator: React.FC = () => {
	return (
		<div className="tarx-model-loading">
			<div className="tarx-model-loading-spinner" />
			<div className="tarx-model-loading-text">Starting TARX engine...</div>
			<div className="tarx-model-loading-subtext">This may take a moment on first launch</div>
		</div>
	);
};
