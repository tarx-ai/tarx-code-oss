/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

// TARX: Unused imports removed - this contribution is disabled
// import { IProductService } from '../../../../../platform/product/common/productService.js';
// import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
// import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
// import { IExtensionManagementService, InstallOperation } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
// import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
// import { IDefaultChatAgent } from '../../../../../base/common/product.js';
// import { IChatWidgetService } from '../chat.js';
// import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

// TARX: ChatGettingStartedContribution disabled - we handle chat opening explicitly
// This was auto-revealing chat widget on extension installation which caused unwanted tabs
export class ChatGettingStartedContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatGettingStarted';

	constructor() {
		super();
		// TARX: All auto-reveal behavior disabled
	}
}
