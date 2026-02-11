/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { IUntypedEditorInput } from '../../../common/editor.js';

export const tarxDashboardInputTypeId = 'workbench.editors.tarxDashboardInput';

export class TarxDashboardInput extends EditorInput {

	static readonly ID = tarxDashboardInputTypeId;
	static readonly RESOURCE = URI.from({ scheme: 'tarx', authority: 'dashboard' });

	override get typeId(): string {
		return TarxDashboardInput.ID;
	}

	override get editorId(): string | undefined {
		return this.typeId;
	}

	override toUntyped(): IUntypedEditorInput {
		return {
			resource: TarxDashboardInput.RESOURCE,
			options: {
				override: TarxDashboardInput.ID,
				pinned: true
			}
		};
	}

	get resource(): URI | undefined {
		return TarxDashboardInput.RESOURCE;
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		return other instanceof TarxDashboardInput;
	}

	constructor() {
		super();
	}

	override getName(): string {
		return 'TARX';
	}
}
