/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Thinking Dashboard — Contribution Registration
 *  Registers the dashboard editor and opens it on startup.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerWorkbenchContribution2, WorkbenchPhase, IWorkbenchContribution } from '../../../common/contributions.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ICommandService, CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TarxDashboardInput, tarxDashboardInputTypeId } from './tarxDashboardEditorInput.js';
import { TarxDashboardEditor, TarxDashboardInputSerializer } from './tarxDashboardEditor.js';

// ============================================================================
// Register Serializer
// ============================================================================

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(tarxDashboardInputTypeId, TarxDashboardInputSerializer);

// ============================================================================
// Register EditorPane
// ============================================================================

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TarxDashboardEditor,
		TarxDashboardEditor.ID,
		'TARX Dashboard'
	),
	[
		new SyncDescriptor(TarxDashboardInput)
	]
);

// ============================================================================
// Editor Resolver — handles tarx://dashboard URI
// ============================================================================

class TarxDashboardEditorResolverContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.tarxDashboardEditorResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${TarxDashboardInput.RESOURCE.scheme}:${TarxDashboardInput.RESOURCE.authority}/**`,
			{
				id: TarxDashboardEditor.ID,
				label: 'TARX Dashboard',
				priority: RegisteredEditorPriority.builtin,
			},
			{
				singlePerResource: true,
				canSupportResource: resource =>
					resource.scheme === TarxDashboardInput.RESOURCE.scheme &&
					resource.authority === TarxDashboardInput.RESOURCE.authority
			},
			{
				createEditorInput: () => {
					return {
						editor: instantiationService.createInstance(TarxDashboardInput),
					};
				}
			}
		));
	}
}

// ============================================================================
// Command: tarx.openDashboard
// ============================================================================

CommandsRegistry.registerCommand('tarx.openDashboard', (accessor) => {
	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);
	const input = instantiationService.createInstance(TarxDashboardInput);
	return editorService.openEditor(input, { pinned: true });
});

// ============================================================================
// Startup Runner — Opens dashboard in center, chat on right, kills sprawl
// ============================================================================

class TarxDashboardStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.tarxDashboardStartup';

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.run();
	}

	private async run(): Promise<void> {
		// Wait for editors to restore from previous session
		await this.editorGroupsService.whenReady;

		// Ensure sessions panel is disabled (kills "SESSIONS" on right side)
		const sessionsEnabled = this.configurationService.getValue<boolean>('chat.viewSessions.enabled');
		if (sessionsEnabled) {
			await this.configurationService.updateValue('chat.viewSessions.enabled', false);
		}

		// Ensure native activity bar is hidden — TARX sidebar is the only nav
		const activityBarLocation = this.configurationService.getValue<string>('workbench.activityBar.location');
		if (activityBarLocation !== 'hidden') {
			await this.configurationService.updateValue('workbench.activityBar.location', 'hidden');
		}

		// Open native chat panel in the center editor area
		// This is the primary UX — TARX chat is the landing experience
		try {
			await this.commandService.executeCommand('workbench.action.chat.open');
		} catch {
			// Chat panel may not be available yet, ignore
		}
	}
}

// ============================================================================
// Register Contributions
// ============================================================================

registerWorkbenchContribution2(
	TarxDashboardEditorResolverContribution.ID,
	TarxDashboardEditorResolverContribution,
	WorkbenchPhase.BlockStartup
);

registerWorkbenchContribution2(
	TarxDashboardStartupContribution.ID,
	TarxDashboardStartupContribution,
	WorkbenchPhase.AfterRestored
);
