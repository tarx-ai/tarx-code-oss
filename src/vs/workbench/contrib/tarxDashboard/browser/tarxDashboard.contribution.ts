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
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
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
// Startup Runner — opens dashboard when no editor is active
// ============================================================================

class TarxDashboardStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.tarxDashboardStartup';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.run();
	}

	private async run(): Promise<void> {
		// Wait for editors to restore from previous session
		await this.editorGroupsService.whenReady;

		// If there's already an editor open (restored from session), don't override
		if (this.editorService.activeEditor) {
			return;
		}

		// Open the TARX dashboard
		const input = this.instantiationService.createInstance(TarxDashboardInput);
		await this.editorService.openEditor(input, { pinned: true });
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
