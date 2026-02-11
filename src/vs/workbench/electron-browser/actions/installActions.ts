/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../nls.js';
import { Action2 } from '../../../platform/actions/common/actions.js';
import { ILocalizedString } from '../../../platform/action/common/action.js';
import product from '../../../platform/product/common/product.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { IProductService } from '../../../platform/product/common/productService.js';
import { isCancellationError } from '../../../base/common/errors.js';

const shellCommandCategory: ILocalizedString = localize2('shellCommand', 'Shell Command');
const tarxCategory: ILocalizedString = localize2('tarx', 'TARX');

export class InstallShellScriptAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.installCommandLine',
			title: localize2('install', "Install '{0}' command in PATH", product.applicationName),
			category: shellCommandCategory,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);

		try {
			await nativeHostService.installShellCommand();

			dialogService.info(localize('successIn', "Shell command '{0}' successfully installed in PATH.", productService.applicationName));
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}

			dialogService.error(toErrorMessage(error));
		}
	}
}

/**
 * TARX-branded alias for InstallShellScriptAction with better discoverability.
 * This command appears when searching for "install cli", "terminal", "code command", etc.
 */
export class TarxInstallCliAction extends Action2 {

	constructor() {
		super({
			id: 'tarx.action.installCli',
			title: localize2('tarxInstallCli', "Install CLI"),
			category: tarxCategory,
			f1: true,
			metadata: {
				description: localize('tarxInstallCliDesc', "Install 'tarx-code' command in terminal PATH for shell access. Enables running tarx-code from command line.")
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);

		try {
			await nativeHostService.installShellCommand();

			dialogService.info(localize('tarxCliSuccess', "TARX CLI successfully installed. You can now run '{0}' from your terminal.", productService.applicationName));
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}

			dialogService.error(toErrorMessage(error));
		}
	}
}

/**
 * Additional alias with "code" in the title for users searching like VS Code.
 */
export class InstallCodeCommandAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.installCodeCommand',
			title: localize2('installCode', "Install 'code' command in PATH"),
			category: shellCommandCategory,
			f1: true,
			metadata: {
				description: localize('installCodeDesc', "Install tarx-code shell command for terminal access")
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);

		try {
			await nativeHostService.installShellCommand();

			dialogService.info(localize('successIn', "Shell command '{0}' successfully installed in PATH.", productService.applicationName));
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}

			dialogService.error(toErrorMessage(error));
		}
	}
}

export class UninstallShellScriptAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.uninstallCommandLine',
			title: localize2('uninstall', "Uninstall '{0}' command from PATH", product.applicationName),
			category: shellCommandCategory,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);

		try {
			await nativeHostService.uninstallShellCommand();

			dialogService.info(localize('successFrom', "Shell command '{0}' successfully uninstalled from PATH.", productService.applicationName));
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}

			dialogService.error(toErrorMessage(error));
		}
	}
}

/**
 * TARX-branded alias for UninstallShellScriptAction
 */
export class TarxUninstallCliAction extends Action2 {

	constructor() {
		super({
			id: 'tarx.action.uninstallCli',
			title: localize2('tarxUninstallCli', "Uninstall CLI"),
			category: tarxCategory,
			f1: true,
			metadata: {
				description: localize('tarxUninstallCliDesc', "Remove 'tarx-code' command from terminal PATH")
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const nativeHostService = accessor.get(INativeHostService);
		const dialogService = accessor.get(IDialogService);
		const productService = accessor.get(IProductService);

		try {
			await nativeHostService.uninstallShellCommand();

			dialogService.info(localize('tarxCliRemoved', "TARX CLI removed from PATH. The '{0}' command is no longer available.", productService.applicationName));
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}

			dialogService.error(toErrorMessage(error));
		}
	}
}
