/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Contribution Registration
 *  - Startup configuration (Activity Bar hidden by default)
 *  - Voice commands (delegated to TARX extension)
 *--------------------------------------------------------------------------------------------*/

// DISABLED: Lock screen overlay was causing black screen on launch
// Re-enable after filming: import './tarxLockScreen.js';
// import './tarxLockScreen.js';
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
import { ActivityBarPosition, LayoutSettings, IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';

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
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super();

		console.log('[TARX] Startup contribution initializing...');

		// Always hide the Auxiliary Bar on startup - TARX sidebar is on the left
		// Users can open it by clicking Explorer/Search/etc in the nav
		setTimeout(() => {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			console.log('[TARX] Auxiliary Bar hidden');
		}, 100);

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

// Focus Chat Panel (Cmd+Shift+I) - Opens native chat with @tarx
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.focusChatPanel',
			title: localize2('tarx.focusChatPanel', "TARX: Focus Chat Panel"),
			f1: true,
			icon: Codicon.commentDiscussion,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const commandService = accessor.get(ICommandService);
		console.log('[TARX] Opening native chat with @tarx');
		await commandService.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
	}
});

// Show System Status (Cmd+Shift+T) - Display TARX system health status
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.showSystemStatus',
			title: localize2('tarx.showSystemStatus', "TARX: Show System Status"),
			f1: true,
			icon: Codicon.pulse,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notificationService = accessor.get(INotificationService);
		// const commandService = accessor.get(ICommandService);

		console.log('[TARX] Showing system status...');

		try {
			// Check inference server
			const inferenceResp = await fetch('http://127.0.0.1:11435/health').catch(() => null);
			const inferenceStatus = inferenceResp?.ok ? '✓ Online' : '✗ Offline';

			// Check embeddings server
			const embeddingsResp = await fetch('http://127.0.0.1:11437/health').catch(() => null);
			const embeddingsStatus = embeddingsResp?.ok ? '✓ Online' : '✗ Offline';

			// Check voice bridge
			const voiceStatus = await new Promise<string>((resolve) => {
				try {
					const ws = new WebSocket('ws://127.0.0.1:11438');
					ws.onopen = () => { ws.close(); resolve('✓ Online'); };
					ws.onerror = () => resolve('✗ Offline');
					setTimeout(() => { ws.close(); resolve('✗ Timeout'); }, 2000);
				} catch {
					resolve('✗ Error');
				}
			});

			const message = `TARX System Status:\n\nInference: ${inferenceStatus}\nEmbeddings: ${embeddingsStatus}\nVoice: ${voiceStatus}`;

			notificationService.notify({
				severity: Severity.Info,
				message: message
			});

		} catch (err) {
			console.error('[TARX] Status check error:', err);
			notificationService.notify({
				severity: Severity.Error,
				message: `Status check failed: ${err}`
			});
		}
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

// ============================================================================
// STUB COMMANDS (replaced by extension when it loads)
// These ensure the sidebar doesn't throw errors before extension activates
// ============================================================================

// Stub: tarx.projects.list - returns empty array until extension loads
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.projects.list',
			title: localize2('tarx.projects.list', "TARX: List Projects"),
			f1: false
		});
	}

	async run(): Promise<unknown[]> {
		console.log('[TARX] Stub tarx.projects.list called (extension not yet loaded)');
		return [];
	}
});

// Stub: tarx.getConversationHistory - returns empty until extension loads
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.getConversationHistory',
			title: localize2('tarx.getConversationHistory', "TARX: Get Conversation History"),
			f1: false
		});
	}

	async run(): Promise<{ conversations: unknown[]; turns: unknown[] }> {
		console.log('[TARX] Stub tarx.getConversationHistory called (extension not yet loaded)');
		return { conversations: [], turns: [] };
	}
});

// Stub: tarx.getSessionHistory - returns empty until extension loads
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.getSessionHistory',
			title: localize2('tarx.getSessionHistory', "TARX: Get Session History"),
			f1: false
		});
	}

	async run(): Promise<{ sessions: unknown[] }> {
		console.log('[TARX] Stub tarx.getSessionHistory called (extension not yet loaded)');
		return { sessions: [] };
	}
});

// Note: tarx.projects.open is NOT stubbed here because it's registered by the extension
// and VS Code's command service handles the timing automatically

// Stub: tarx.projects.create - no-op until extension loads
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.projects.create',
			title: localize2('tarx.projects.create', "TARX: Create Project"),
			f1: false
		});
	}

	async run(_accessor: ServicesAccessor, _name?: string, _instructions?: string): Promise<void> {
		console.log('[TARX] Stub tarx.projects.create called (extension not yet loaded)');
	}
});

// Stub: tarx.projects.refresh - no-op until extension loads
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.projects.refresh',
			title: localize2('tarx.projects.refresh', "TARX: Refresh Projects"),
			f1: false
		});
	}

	async run(): Promise<void> {
		console.log('[TARX] Stub tarx.projects.refresh called (extension not yet loaded)');
	}
});

// Stub: tarx.history.refresh - no-op until extension loads
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.history.refresh',
			title: localize2('tarx.history.refresh', "TARX: Refresh History"),
			f1: false
		});
	}

	async run(): Promise<void> {
		console.log('[TARX] Stub tarx.history.refresh called (extension not yet loaded)');
	}
});

// Stub: tarx.history.showAll - no-op until extension loads
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'tarx.history.showAll',
			title: localize2('tarx.history.showAll', "TARX: Show All History"),
			f1: false
		});
	}

	async run(): Promise<void> {
		console.log('[TARX] Stub tarx.history.showAll called (extension not yet loaded)');
	}
});

console.log('[TARX] Contributions registered (including stub commands)');
