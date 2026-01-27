/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Contribution Registration
 *  - Startup configuration (Activity Bar hidden by default)
 *  - Voice commands (delegated to TARX extension)
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ActivityBarPosition, LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

// ============================================================================
// TARX STARTUP CONTRIBUTION
// - Hides Activity Bar (TARX uses native sidebar)
// - Opens Explorer by default
// ============================================================================

class TarxStartupContribution extends Disposable {

	static readonly ID = 'workbench.contrib.tarxStartup';
	private static readonly TARX_INITIALIZED_KEY = 'tarx.initialized';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		console.log('[TARX] Startup contribution initializing...');

		// Check if TARX has been initialized
		const hasInitialized = this.storageService.getBoolean(TarxStartupContribution.TARX_INITIALIZED_KEY, StorageScope.PROFILE, false);

		if (!hasInitialized) {
			console.log('[TARX] First run - configuring TARX defaults');

			// Mark as initialized
			this.storageService.store(TarxStartupContribution.TARX_INITIALIZED_KEY, true, StorageScope.PROFILE, StorageTarget.USER);

			// Hide Activity Bar - TARX uses native sidebar
			this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.HIDDEN);

			// Show welcome notification
			setTimeout(() => {
				this.notificationService.notify({
					severity: Severity.Info,
					message: 'Welcome to TARX! Use @tarx in Chat to get AI assistance.'
				});
			}, 1500);

			console.log('[TARX] Defaults configured - Activity Bar hidden');
		} else {
			console.log('[TARX] Already initialized');
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(TarxStartupContribution, LifecyclePhase.Eventually);

// ============================================================================
// TARX COMMANDS
// ============================================================================

// Focus Chat Panel (Cmd+Shift+C) - Opens native chat with @tarx
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.focusChatPanel',
			title: localize2('tarx.focusChatPanel', "TARX: Focus Chat Panel"),
			f1: true,
			icon: Codicon.commentDiscussion
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		console.log('[TARX] Opening native chat with @tarx');
		await commandService.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
	}
});

// Check Voice Bridge Status
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.checkVoiceBridge',
			title: localize2('tarx.checkVoiceBridge', "TARX: Check Voice Bridge Status"),
			f1: true,
			icon: Codicon.debug
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);

		console.log('[TARX] Checking voice bridge status...');

		try {
			const ws = new WebSocket('ws://127.0.0.1:11438');

			ws.onopen = () => {
				console.log('[TARX] Voice bridge is running');
				notificationService.notify({
					severity: Severity.Info,
					message: 'TARX Voice Bridge is running on port 11438'
				});
				ws.close();
			};

			ws.onerror = () => {
				console.log('[TARX] Voice bridge not running');
				notificationService.notify({
					severity: Severity.Warning,
					message: 'TARX Voice Bridge not running. Start it with: python3 ~/tarx-voice-bridge.py'
				});
			};

			setTimeout(() => {
				if (ws.readyState === WebSocket.CONNECTING) {
					ws.close();
					notificationService.notify({
						severity: Severity.Warning,
						message: 'TARX Voice Bridge connection timeout. Is it running?'
					});
				}
			}, 3000);

		} catch (err) {
			console.error('[TARX] Bridge check error:', err);
			notificationService.notify({
				severity: Severity.Error,
				message: `Bridge check failed: ${err}`
			});
		}
	}
});

// Show Activity Bar (For users who want it back)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.showActivityBar',
			title: localize2('tarx.showActivityBar', "TARX: Show Activity Bar"),
			f1: true,
			icon: Codicon.layoutActivitybarLeft
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const notificationService = accessor.get(INotificationService);

		await configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.DEFAULT);

		notificationService.notify({
			severity: Severity.Info,
			message: 'Activity Bar restored.'
		});
	}
});

console.log('[TARX] Contributions registered');
