/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

const $ = dom.$;

/**
 * Lightweight follow-up suggestion chips for TARX.
 * Bypasses the ChatFollowups agent gate — renders directly without IChatAgentService.
 */
export class TarxFollowupChips extends Disposable {

	constructor(
		container: HTMLElement,
		suggestions: string[],
		clickHandler: (text: string) => void
	) {
		super();

		dom.clearNode(container);

		const chipsContainer = dom.append(container, $('.tarx-suggestions'));

		for (const suggestion of suggestions) {
			const chip = dom.append(chipsContainer, $('button.tarx-suggestion-chip'));
			chip.textContent = suggestion;
			chip.title = suggestion;
			chip.setAttribute('role', 'button');
			chip.setAttribute('aria-label', `Follow up: ${suggestion}`);

			this._register(dom.addDisposableListener(chip, dom.EventType.CLICK, (e) => {
				e.preventDefault();
				e.stopPropagation();
				clickHandler(suggestion);
			}));
		}
	}
}
