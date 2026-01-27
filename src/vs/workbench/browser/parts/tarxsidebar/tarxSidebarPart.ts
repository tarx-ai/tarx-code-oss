/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/tarxSidebarPart.css';
import { $, append, addDisposableListener, EventType, clearNode } from '../../../../base/browser/dom.js';
import { IWorkbenchLayoutService, Parts, Position as SideBarPosition } from '../../../services/layout/browser/layoutService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, SIDE_BAR_BORDER } from '../../../common/theme.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { LayoutPriority } from '../../../../base/browser/ui/grid/grid.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { AbstractPaneCompositePart, CompositeBarPosition } from '../paneCompositePart.js';
import { ActivityBarCompositeBar, ActivitybarPart } from '../activitybar/activitybarPart.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { IPaneCompositeBarOptions } from '../paneCompositeBar.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { SidebarFocusContext, ActiveViewletContext } from '../../../common/contextkeys.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

/**
 * TARX Sidebar Navigation Item
 */
interface TarxNavItem {
	id: string;
	label: string;
	icon: ThemeIcon;
	command?: string;
}

/**
 * History item from conversation database
 */
interface TarxHistoryItem {
	id: string;
	title: string;
	timestamp: number;
}

/**
 * Project item from database
 */
interface TarxProject {
	id: string;
	name: string;
	path: string;
	type: string | null;
	isActive: boolean;
	createdAt: number;
}

/**
 * TARX Custom Sidebar Part
 *
 * Structure:
 * - Header: Logo + SuperComputer toggle
 * - Chat row with hover [+] action
 * - Voice row with hover play/pause action
 * - Collapsible sections: CREATE, CODE, FILES, PROJECTS
 * - History section (grouped by time)
 * - Footer: Extensions, Settings
 */
export class TarxSidebarPart extends AbstractPaneCompositePart {

	static readonly activeViewletSettingsKey = 'workbench.sidebar.activeviewletid';
	private static readonly SUPERCOMPUTER_KEY = 'tarx.supercomputer.enabled';
	private static readonly COLLAPSED_KEY = 'tarx.sidebar.collapsed';

	//#region IView

	// Allow collapsing to 48px icon-only mode
	readonly minimumWidth: number = 48;
	readonly maximumWidth: number = 400;
	readonly minimumHeight: number = 0;
	readonly maximumHeight: number = Number.POSITIVE_INFINITY;
	override get snap(): boolean { return true; }

	readonly priority: LayoutPriority = LayoutPriority.Low;

	//#endregion

	private readonly activityBarPart = this._register(this.instantiationService.createInstance(ActivitybarPart, this));

	// DOM elements
	private tarxContainer: HTMLElement | undefined;
	private headerElement: HTMLElement | undefined;
	private navRowsElement: HTMLElement | undefined;
	private sectionsContainer: HTMLElement | undefined;
	private historyElement: HTMLElement | undefined;
	private footerElement: HTMLElement | undefined;
	private logoIcon: HTMLImageElement | undefined;
	private headerCollapseBtn: HTMLElement | undefined;
	private headerCollapseIcon: HTMLElement | undefined;

	// State
	private sectionState: Map<string, boolean> = new Map();
	private isVoiceActive: boolean = false;
	private superEnabled: boolean = false;
	private peerCount: number = 0;
	private superDot: HTMLElement | undefined;
	private superLabel: HTMLElement | undefined;
	private localDot: HTMLElement | undefined;
	private localLabel: HTMLElement | undefined;
	private connectionStatus: 'online' | 'offline' | 'connecting' | 'reconnecting' = 'connecting';
	private connectionCheckInterval: ReturnType<typeof setInterval> | undefined;
	private readonly navDisposables = this._register(new DisposableStore());
	private isCollapsed: boolean = false;

	// History data
	private historyItems: TarxHistoryItem[] = [];

	// Projects data
	private projects: TarxProject[] = [];
	private projectsContentEl: HTMLElement | undefined;

	// Model loading indicator
	private modelLoadingElement: HTMLElement | undefined;

	// File upload/indexing progress
	private uploadProgressElement: HTMLElement | undefined;
	private uploadProgressText: HTMLElement | undefined;
	private uploadProgressBarFill: HTMLElement | undefined;
	private uploadProgressPercent: HTMLElement | undefined;

	constructor(
		@INotificationService notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(
			Parts.SIDEBAR_PART,
			{ hasTitle: true, trailingSeparator: false, borderWidth: () => (this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder)) ? 1 : 0 },
			TarxSidebarPart.activeViewletSettingsKey,
			ActiveViewletContext.bindTo(contextKeyService),
			SidebarFocusContext.bindTo(contextKeyService),
			'sideBar',
			'viewlet',
			undefined,
			undefined,
			notificationService,
			storageService,
			contextMenuService,
			layoutService,
			keybindingService,
			hoverService,
			instantiationService,
			themeService,
			viewDescriptorService,
			contextKeyService,
			extensionService,
			menuService,
		);

		// Section states (collapsed by default except PROJECTS and HISTORY)
		this.sectionState.set('create', true);
		this.sectionState.set('code', true);
		this.sectionState.set('files', true);
		this.sectionState.set('projects', false);
		this.sectionState.set('history', false);

		// Load saved super computer state
		this.superEnabled = this.storageService.getBoolean(TarxSidebarPart.SUPERCOMPUTER_KEY, StorageScope.APPLICATION, false);

		// Load saved collapsed state
		this.isCollapsed = this.storageService.getBoolean(TarxSidebarPart.COLLAPSED_KEY, StorageScope.PROFILE, false);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);

		// Get the actual container from the part
		const container = this.getContainer();
		if (container) {
			this.createTarxNavigation(container);
		}
	}

	private createTarxNavigation(parent: HTMLElement): void {
		// Clear any existing content using VS Code's safe DOM utility
		clearNode(parent);

		this.tarxContainer = append(parent, $('.tarx-sidebar-container'));

		this.createHeader();
		this.createModelLoadingIndicator();
		this.createNavRows();
		this.createSections();
		// History is now part of sections (called from createSections)
		this.createFooter();

		// Restore super status if was connected
		if (this.superEnabled) {
			this.updateSuperStatus('connected');
		}

		// Start polling connection status from TARX extension
		this.startConnectionStatusPolling();

		// Listen for upload progress commands
		this.registerUploadProgressCommands();

		// Load history and projects from database (async, runs after UI is ready)
		setTimeout(() => {
			this.loadHistory();
			this.loadProjects();
		}, 500);

		// Apply collapsed state if it was saved
		console.log('[TARX Sidebar] Sidebar container isCollapsed:', this.isCollapsed);
		if (this.isCollapsed) {
			if (this.tarxContainer) {
				this.tarxContainer.classList.add('collapsed');
			}
			// Also apply the collapsed width - use setTimeout to ensure layout is ready
			setTimeout(() => {
				this.layoutService.setSize(Parts.SIDEBAR_PART, { width: 48, height: -1 });
			}, 0);
		}
	}

	/**
	 * Get time-based greeting
	 */
	private getGreeting(): string {
		const hour = new Date().getHours();
		let greeting: string;
		if (hour < 12) {
			greeting = 'Morning';
		} else if (hour < 17) {
			greeting = 'Afternoon';
		} else {
			greeting = 'Evening';
		}
		return `${greeting}, Holly`;
	}

	// Compute dropdown elements
	private computePill: HTMLElement | undefined;
	private computeDropdown: HTMLElement | undefined;
	private superToggle: HTMLInputElement | undefined;

	/**
	 * Create the chip/CPU SVG icon programmatically (to avoid TrustedTypes innerHTML)
	 */
	private createChipSvg(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 16 16');
		svg.setAttribute('fill', 'currentColor');

		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', 'M14.5 8.5C14.633 8.5 14.76 8.447 14.854 8.354C14.948 8.26 15 8.133 15 8C15 7.867 14.947 7.74 14.854 7.646C14.76 7.552 14.633 7.5 14.5 7.5H13V6H14.5C14.633 6 14.76 5.947 14.854 5.854C14.948 5.76 15 5.633 15 5.5C15 5.367 14.947 5.24 14.854 5.146C14.76 5.052 14.633 5 14.5 5H13C13 4.47 12.789 3.961 12.414 3.586C12.039 3.211 11.53 3 11 3V1.5C11 1.367 10.947 1.24 10.854 1.146C10.76 1.052 10.633 1 10.5 1C10.367 1 10.24 1.053 10.146 1.146C10.052 1.24 10 1.367 10 1.5V3H8.5V1.5C8.5 1.367 8.447 1.24 8.354 1.146C8.26 1.052 8.133 1 8 1C7.867 1 7.74 1.053 7.646 1.146C7.552 1.24 7.5 1.367 7.5 1.5V3H6V1.5C6 1.367 5.947 1.24 5.854 1.146C5.76 1.052 5.633 1 5.5 1C5.367 1 5.24 1.053 5.146 1.146C5.052 1.24 5 1.367 5 1.5V3C4.47 3 3.961 3.211 3.586 3.586C3.211 3.961 3 4.47 3 5H1.5C1.367 5 1.24 5.053 1.146 5.146C1.052 5.24 1 5.367 1 5.5C1 5.633 1.053 5.76 1.146 5.854C1.24 5.948 1.367 6 1.5 6H3V7.5H1.5C1.367 7.5 1.24 7.553 1.146 7.646C1.052 7.74 1 7.867 1 8C1 8.133 1.053 8.26 1.146 8.354C1.24 8.448 1.367 8.5 1.5 8.5H3V10H1.5C1.367 10 1.24 10.053 1.146 10.146C1.052 10.24 1 10.367 1 10.5C1 10.633 1.053 10.76 1.146 10.854C1.24 10.948 1.367 11 1.5 11H3C3 11.53 3.211 12.039 3.586 12.414C3.961 12.789 4.47 13 5 13V14.5C5 14.633 5.053 14.76 5.146 14.854C5.24 14.948 5.367 15 5.5 15C5.633 15 5.76 14.947 5.854 14.854C5.948 14.76 6 14.633 6 14.5V13H7.5V14.5C7.5 14.633 7.553 14.76 7.646 14.854C7.74 14.948 7.867 15 8 15C8.133 15 8.26 14.947 8.354 14.854C8.448 14.76 8.5 14.633 8.5 14.5V13H10V14.5C10 14.633 10.053 14.76 10.146 14.854C10.24 14.948 10.367 15 10.5 15C10.633 15 10.76 14.947 10.854 14.854C10.948 14.76 11 14.633 11 14.5V13C11.53 13 12.039 12.789 12.414 12.414C12.789 12.039 13 11.53 13 11H14.5C14.633 11 14.76 10.947 14.854 10.854C14.948 10.76 15 10.633 15 10.5C15 10.367 14.947 10.24 14.854 10.146C14.76 10.052 14.633 10 14.5 10H13V8.5H14.5ZM12 11C12 11.265 11.895 11.52 11.707 11.707C11.519 11.894 11.265 12 11 12H5C4.735 12 4.48 11.895 4.293 11.707C4.105 11.519 4 11.265 4 11V5C4 4.735 4.105 4.48 4.293 4.293C4.481 4.105 4.735 4 5 4H11C11.265 4 11.52 4.105 11.707 4.293C11.895 4.481 12 4.735 12 5V11ZM8 10.5C6.621 10.5 5.5 9.379 5.5 8C5.5 6.621 6.621 5.5 8 5.5C9.379 5.5 10.5 6.621 10.5 8C10.5 9.379 9.379 10.5 8 10.5ZM8 6.5C7.173 6.5 6.5 7.173 6.5 8C6.5 8.827 7.173 9.5 8 9.5C8.827 9.5 9.5 8.827 9.5 8C9.5 7.173 8.827 6.5 8 6.5Z');
		svg.appendChild(path);

		return svg;
	}

	/**
	 * Header: Logo + Greeting + Compute dropdown pill
	 */
	private createHeader(): void {
		if (!this.tarxContainer) { return; }

		this.headerElement = append(this.tarxContainer, $('.tarx-header'));

		// Logo row with Compute pill
		const logoRow = append(this.headerElement, $('.tarx-logo-row'));

		// Panel collapse/expand toggle button (left side) - wrap in clickable container
		this.headerCollapseBtn = append(logoRow, $('div.tarx-header-collapse-btn'));
		this.headerCollapseIcon = append(this.headerCollapseBtn, $('span.tarx-header-collapse-icon'));
		const headerCollapseIconType = this.isCollapsed ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft;
		this.headerCollapseIcon.classList.add(...ThemeIcon.asClassNameArray(headerCollapseIconType));
		this.headerCollapseBtn.title = this.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
		console.log('[TARX] Header collapse btn created');

		// Click on the button container for reliable event handling
		this.navDisposables.add(addDisposableListener(this.headerCollapseBtn, EventType.CLICK, (e: MouseEvent) => {
			console.log('[TARX] Header collapse btn clicked!');
			e.preventDefault();
			e.stopPropagation();
			this.toggleCollapse();
		}));

		this.logoIcon = append(logoRow, $('img.tarx-logo-icon')) as HTMLImageElement;
		this.logoIcon.src = FileAccess.asBrowserUri('vs/workbench/browser/parts/tarxsidebar/media/tarx-logo.png').toString(true);
		this.logoIcon.alt = 'TARX';
		const logoText = append(logoRow, $('span.tarx-logo-text'));
		logoText.textContent = this.getGreeting();

		// Compute dropdown pill with chip icon
		this.computePill = append(logoRow, $('.tarx-compute-pill'));
		const chipIcon = append(this.computePill, $('span.tarx-compute-chip-icon'));
		chipIcon.appendChild(this.createChipSvg());
		const pillLabel = append(this.computePill, $('span.tarx-compute-label'));
		pillLabel.textContent = 'Compute';
		const pillChevron = append(this.computePill, $('span.tarx-compute-chevron'));
		pillChevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Click to show dropdown
		this.navDisposables.add(addDisposableListener(this.computePill, EventType.CLICK, (e) => {
			e.stopPropagation();
			this.toggleComputeDropdown();
		}));

		// Create dropdown (hidden by default)
		this.createComputeDropdown();

		// Close dropdown when clicking outside
		this.navDisposables.add(addDisposableListener(document, EventType.CLICK, () => {
			this.hideComputeDropdown();
		}));
	}

	/**
	 * Create the Compute dropdown menu
	 */
	private createComputeDropdown(): void {
		if (!this.headerElement) { return; }

		this.computeDropdown = append(this.headerElement, $('.tarx-compute-dropdown'));
		this.computeDropdown.style.display = 'none';

		// Local option (checked when connected)
		const localOption = append(this.computeDropdown, $('.tarx-compute-option.local'));
		const localCheck = append(localOption, $('span.tarx-compute-check'));
		localCheck.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
		this.localDot = append(localOption, $('span.tarx-compute-dot'));
		this.localLabel = append(localOption, $('span.tarx-compute-option-label'));
		this.localLabel.textContent = 'Local';
		// Set initial status
		this.updateLocalStatus(this.connectionStatus);

		// Super option with toggle switch
		const superOption = append(this.computeDropdown, $('.tarx-compute-option.super'));
		this.superDot = append(superOption, $('span.tarx-compute-dot'));
		this.superLabel = append(superOption, $('span.tarx-compute-option-label'));
		this.superLabel.textContent = 'SuperComputer';

		// Toggle switch
		const toggleLabel = append(superOption, $('label.tarx-toggle'));
		this.superToggle = append(toggleLabel, $('input.tarx-toggle-input')) as HTMLInputElement;
		this.superToggle.type = 'checkbox';
		this.superToggle.checked = this.superEnabled;
		append(toggleLabel, $('span.tarx-toggle-slider'));

		// Handle toggle change
		this.navDisposables.add(addDisposableListener(this.superToggle, EventType.CHANGE, () => {
			this.toggleSuperComputer();
		}));

		// Join Private Compute link
		const joinLink = append(this.computeDropdown, $('.tarx-compute-link'));
		joinLink.textContent = 'Join Private Compute';
		this.navDisposables.add(addDisposableListener(joinLink, EventType.CLICK, () => {
			this.commandService.executeCommand('tarx.privateCompute.join');
			this.hideComputeDropdown();
		}));

		// Prevent dropdown close when clicking inside
		this.navDisposables.add(addDisposableListener(this.computeDropdown, EventType.CLICK, (e) => {
			e.stopPropagation();
		}));
	}

	/**
	 * Toggle Compute dropdown visibility
	 */
	private toggleComputeDropdown(): void {
		if (!this.computeDropdown || !this.computePill) { return; }

		const isVisible = this.computeDropdown.style.display !== 'none';
		if (isVisible) {
			this.hideComputeDropdown();
		} else {
			this.computeDropdown.style.display = 'block';
			this.computePill.classList.add('open');
		}
	}

	/**
	 * Hide Compute dropdown
	 */
	private hideComputeDropdown(): void {
		if (this.computeDropdown) {
			this.computeDropdown.style.display = 'none';
		}
		if (this.computePill) {
			this.computePill.classList.remove('open');
		}
	}

	/**
	 * Toggle SuperComputer connection
	 */
	private toggleSuperComputer(): void {
		// Use the toggle's current checked state to determine action
		const shouldConnect = this.superToggle?.checked ?? false;

		if (shouldConnect) {
			// Connect
			this.updateSuperStatus('connecting');
			this.commandService.executeCommand('tarx.mesh.connect').then(() => {
				this.superEnabled = true;
				this.updateSuperStatus('connected');
				this.storageService.store(TarxSidebarPart.SUPERCOMPUTER_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
				console.log('[TARX] SuperComputer connected');
			}).catch(() => {
				this.superEnabled = false;
				if (this.superToggle) { this.superToggle.checked = false; }
				this.updateSuperStatus('disconnected');
				console.log('[TARX] SuperComputer connection failed');
			});
		} else {
			// Disconnect
			this.superEnabled = false;
			this.commandService.executeCommand('tarx.mesh.disconnect');
			this.updateSuperStatus('disconnected');
			this.storageService.store(TarxSidebarPart.SUPERCOMPUTER_KEY, false, StorageScope.APPLICATION, StorageTarget.USER);
			console.log('[TARX] SuperComputer disconnected');
		}
	}

	/**
	 * Update Super status display
	 */
	private updateSuperStatus(state: 'disconnected' | 'connecting' | 'connected'): void {
		if (!this.superDot || !this.superLabel) { return; }

		this.superDot.classList.remove('active', 'connecting');

		switch (state) {
			case 'disconnected':
				this.superLabel.textContent = 'SuperComputer';
				break;
			case 'connecting':
				this.superDot.classList.add('connecting');
				this.superLabel.textContent = 'SuperComputer (connecting...)';
				break;
			case 'connected':
				this.superDot.classList.add('active');
				this.superLabel.textContent = this.peerCount > 0
					? `SuperComputer (${this.peerCount} peer${this.peerCount !== 1 ? 's' : ''})`
					: 'SuperComputer (connected)';
				break;
		}
	}

	/**
	 * Update peer count from mesh network
	 */
	public updatePeerCount(count: number): void {
		this.peerCount = count;
		if (this.superEnabled && this.superLabel) {
			this.superLabel.textContent = `SuperComputer (${count} peer${count !== 1 ? 's' : ''})`;
		}
	}

	/**
	 * Update local server connection status
	 */
	private updateLocalStatus(status: 'online' | 'offline' | 'connecting' | 'reconnecting'): void {
		if (!this.localDot || !this.localLabel) { return; }

		this.connectionStatus = status;
		this.localDot.classList.remove('active', 'connecting');

		switch (status) {
			case 'online':
				this.localDot.classList.add('active');
				this.localLabel.textContent = 'Local';
				this.setModelLoadingVisible(false);
				break;
			case 'offline':
				this.localLabel.textContent = 'Local (offline)';
				this.setModelLoadingVisible(false);
				break;
			case 'connecting':
				this.localDot.classList.add('connecting');
				this.localLabel.textContent = 'Local (connecting...)';
				this.setModelLoadingVisible(true);
				break;
			case 'reconnecting':
				this.localDot.classList.add('connecting');
				this.localLabel.textContent = 'Local (reconnecting...)';
				this.setModelLoadingVisible(false); // Only show on initial connect
				break;
		}
	}

	/**
	 * Create the model loading indicator (shown when model is starting)
	 */
	private createModelLoadingIndicator(): void {
		if (!this.tarxContainer) { return; }

		this.modelLoadingElement = append(this.tarxContainer, $('.tarx-model-loading'));
		this.modelLoadingElement.style.display = 'none'; // Hidden by default

		// Spinner element (styled via CSS animation)
		append(this.modelLoadingElement, $('.tarx-model-loading-spinner'));

		const text = append(this.modelLoadingElement, $('.tarx-model-loading-text'));
		text.textContent = 'Starting TARX engine...';

		const subtext = append(this.modelLoadingElement, $('.tarx-model-loading-subtext'));
		subtext.textContent = 'This may take a moment on first launch';
	}

	/**
	 * Show or hide the model loading indicator
	 */
	private setModelLoadingVisible(visible: boolean): void {
		if (this.modelLoadingElement) {
			this.modelLoadingElement.style.display = visible ? 'flex' : 'none';
		}
		// Also hide nav/sections when loading
		if (this.navRowsElement) {
			this.navRowsElement.style.display = visible ? 'none' : 'block';
		}
		if (this.sectionsContainer) {
			this.sectionsContainer.style.display = visible ? 'none' : 'block';
		}
	}

	/**
	 * Create the file upload/indexing progress element
	 */
	private createUploadProgressElement(): void {
		if (!this.tarxContainer) { return; }

		this.uploadProgressElement = append(this.tarxContainer, $('.tarx-upload-progress'));
		this.uploadProgressElement.style.display = 'none';

		// Header row with icon, text, and percentage
		const header = append(this.uploadProgressElement, $('.tarx-upload-progress-header'));

		const info = append(header, $('.tarx-upload-progress-info'));
		const icon = append(info, $('.tarx-upload-progress-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading));
		icon.classList.add('spinning');

		this.uploadProgressText = append(info, $('.tarx-upload-progress-text'));
		this.uploadProgressText.textContent = 'Uploading...';

		this.uploadProgressPercent = append(header, $('.tarx-upload-progress-percent'));
		this.uploadProgressPercent.textContent = '0%';

		// Progress bar
		const progressBar = append(this.uploadProgressElement, $('.tarx-upload-progress-bar'));
		this.uploadProgressBarFill = append(progressBar, $('.tarx-upload-progress-bar-fill'));
		this.uploadProgressBarFill.style.width = '0%';
	}

	/**
	 * Show upload/indexing progress
	 * @param text Progress text (e.g., "Uploading file.pdf...", "Indexing document...")
	 * @param percent Progress percentage (0-100)
	 */
	public showUploadProgress(text: string, percent: number): void {
		// Lazily create if needed
		if (!this.uploadProgressElement) {
			this.createUploadProgressElement();
		}

		if (this.uploadProgressElement) {
			this.uploadProgressElement.style.display = 'flex';
		}
		if (this.uploadProgressText) {
			this.uploadProgressText.textContent = text;
		}
		if (this.uploadProgressPercent) {
			this.uploadProgressPercent.textContent = `${Math.round(percent)}%`;
		}
		if (this.uploadProgressBarFill) {
			this.uploadProgressBarFill.style.width = `${percent}%`;
		}
	}

	/**
	 * Hide upload/indexing progress
	 */
	public hideUploadProgress(): void {
		if (this.uploadProgressElement) {
			this.uploadProgressElement.style.display = 'none';
		}
	}

	/**
	 * Register command handlers for upload progress
	 */
	private registerUploadProgressCommands(): void {
		// Override command handlers for sidebar integration
		this.navDisposables.add(
			this.commandService.onWillExecuteCommand(e => {
				if (e.commandId === 'tarx.showUploadProgress') {
					const args = e.args || [];
					if (args.length >= 2) {
						const text = args[0] as string;
						const percent = args[1] as number;
						this.showUploadProgress(text, percent);
					}
				} else if (e.commandId === 'tarx.hideUploadProgress') {
					this.hideUploadProgress();
				} else if (e.commandId === 'tarx.projects.refresh') {
					// Refresh projects list when command is executed
					console.log('[TARX Sidebar] Projects refresh triggered');
					this.loadProjects();
				}
			})
		);
	}

	/**
	 * Start polling connection status from TARX extension
	 */
	private startConnectionStatusPolling(): void {
		// Initial check
		this.checkConnectionStatus();

		// Poll every 5 seconds
		this.connectionCheckInterval = setInterval(() => {
			this.checkConnectionStatus();
		}, 5000);
	}

	/**
	 * Check connection status from TARX extension
	 */
	private async checkConnectionStatus(): Promise<void> {
		try {
			const status = await this.commandService.executeCommand<{
				status: 'online' | 'offline' | 'connecting' | 'reconnecting';
				isOnline: boolean;
			}>('tarx.getConnectionStatus');

			if (status && status.status !== this.connectionStatus) {
				this.updateLocalStatus(status.status);
			}
		} catch {
			// Extension not loaded yet or command not available
		}
	}

	/**
	 * Nav rows: Chat and Voice with hover action buttons
	 */
	private createNavRows(): void {
		if (!this.tarxContainer) { return; }

		this.navRowsElement = append(this.tarxContainer, $('.tarx-nav-rows'));

		// Chat row
		const chatRow = append(this.navRowsElement, $('.tarx-nav-row'));
		chatRow.dataset.id = 'chat';

		const chatIcon = append(chatRow, $('.tarx-nav-row-icon'));
		chatIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussion));

		const chatLabel = append(chatRow, $('.tarx-nav-row-label'));
		chatLabel.textContent = 'Chat';

		const chatAction = append(chatRow, $('.tarx-action-btn'));
		chatAction.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
		chatAction.title = 'New Chat';

		// Row click opens existing chat, [+] button creates NEW chat
		const openChat = () => {
			console.log('[TARX Sidebar] Chat row clicked - opening existing chat');
			this.commandService.executeCommand('workbench.action.chat.open');
		};
		const newChat = () => {
			console.log('[TARX Sidebar] New Chat button clicked - creating new conversation');
			this.commandService.executeCommand('tarx.chat.new');
		};
		this.navDisposables.add(addDisposableListener(chatRow, EventType.CLICK, openChat));
		this.navDisposables.add(addDisposableListener(chatAction, EventType.CLICK, (e) => {
			e.stopPropagation();
			newChat();
		}));

		// Voice row
		const voiceRow = append(this.navRowsElement, $('.tarx-nav-row'));
		voiceRow.dataset.id = 'voice';

		const voiceIcon = append(voiceRow, $('.tarx-nav-row-icon'));
		voiceIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.mic));

		const voiceLabel = append(voiceRow, $('.tarx-nav-row-label'));
		voiceLabel.textContent = 'Voice';

		const voiceAction = append(voiceRow, $('.tarx-action-btn.tarx-voice-btn'));
		voiceAction.classList.add(...ThemeIcon.asClassNameArray(Codicon.play));
		voiceAction.title = 'Start Voice';

		// Entire Voice row is clickable to toggle voice
		this.navDisposables.add(addDisposableListener(voiceRow, EventType.CLICK, () => {
			this.toggleVoice(voiceAction);
		}));
		this.navDisposables.add(addDisposableListener(voiceAction, EventType.CLICK, (e) => {
			e.stopPropagation();
			this.toggleVoice(voiceAction);
		}));
	}

	private toggleVoice(btn: HTMLElement): void {
		this.isVoiceActive = !this.isVoiceActive;
		btn.className = 'tarx-action-btn tarx-voice-btn';

		if (this.isVoiceActive) {
			console.log('[TARX Sidebar] Voice starting...');
			btn.classList.add(...ThemeIcon.asClassNameArray(Codicon.debugPause));
			btn.classList.add('recording'); // Visual feedback
			btn.title = 'Stop Voice';
			this.commandService.executeCommand('tarx.voice.start');
		} else {
			console.log('[TARX Sidebar] Voice stopping...');
			btn.classList.add(...ThemeIcon.asClassNameArray(Codicon.play));
			btn.classList.remove('recording');
			btn.title = 'Start Voice';
			this.commandService.executeCommand('tarx.voice.stop');
		}
	}

	/**
	 * Collapsible sections: CREATE, CODE, FILES, PROJECTS, HISTORY
	 */
	private createSections(): void {
		if (!this.tarxContainer) { return; }

		this.sectionsContainer = append(this.tarxContainer, $('.tarx-sections'));

		// CREATE
		this.createSection('create', 'Create', Codicon.wand, [
			{ id: 'design', label: 'Design', icon: Codicon.paintcan, command: 'tarx.create.design' },
			{ id: 'imagine', label: 'Imagine', icon: Codicon.sparkle, command: 'tarx.create.imagine' }
		]);

		// CODE
		this.createSection('code', 'Code', Codicon.code, [
			{ id: 'scm', label: 'Source Control', icon: Codicon.sourceControl, command: 'workbench.view.scm' },
			{ id: 'debug', label: 'Run & Debug', icon: Codicon.debug, command: 'workbench.view.debug' },
			{ id: 'terminal', label: 'Terminal', icon: Codicon.terminal, command: 'workbench.action.terminal.toggleTerminal' }
		]);

		// FILES
		this.createSection('files', 'Files', Codicon.files, [
			{ id: 'explorer', label: 'Explorer', icon: Codicon.files, command: 'workbench.view.explorer' },
			{ id: 'search', label: 'Search', icon: Codicon.search, command: 'workbench.view.search' },
			{ id: 'newFile', label: 'New File', icon: Codicon.newFile, command: 'workbench.action.files.newUntitledFile' }
		]);

		// PROJECTS (with + button)
		this.createProjectsSection();

		// HISTORY (collapsible section)
		this.createHistorySection();
	}

	private createSection(id: string, title: string, icon: ThemeIcon, items: TarxNavItem[]): void {
		if (!this.sectionsContainer) { return; }

		console.log('[TARX Sidebar] Creating section:', id, 'with', items.length, 'items');

		const section = append(this.sectionsContainer, $('.tarx-section'));
		section.dataset.sectionId = id;

		// Default to expanded (false = not collapsed)
		const isCollapsed = this.sectionState.get(id) ?? false;
		console.log('[TARX Sidebar] Section', id, 'collapsed state:', isCollapsed);
		if (isCollapsed) {
			section.classList.add('collapsed');
		}

		// Header: icon + title + chevron
		const header = append(section, $('.tarx-section-header'));
		const iconEl = append(header, $('.tarx-section-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(icon));
		const titleEl = append(header, $('.tarx-section-title'));
		titleEl.textContent = title;
		const chevron = append(header, $('.tarx-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Content
		const content = append(section, $('.tarx-section-content'));

		for (const item of items) {
			const itemEl = append(content, $('.tarx-section-item'));
			itemEl.dataset.itemId = item.id;
			itemEl.title = item.label;

			const iconEl = append(itemEl, $('.tarx-section-item-icon'));
			// Always use codicons - customSvg not supported due to Trusted Types
			iconEl.classList.add(...ThemeIcon.asClassNameArray(item.icon));

			const label = append(itemEl, $('.tarx-section-item-label'));
			label.textContent = item.label;

			if (item.command) {
				console.log('[TARX Sidebar] Attaching click handler for:', item.label, '->', item.command);
				this.navDisposables.add(addDisposableListener(itemEl, EventType.CLICK, (e) => {
					e.stopPropagation(); // Prevent header collapse toggle
					console.log('[TARX Sidebar] Item clicked:', item.label, '-> executing:', item.command);
					this.commandService.executeCommand(item.command!).then(
						() => console.log('[TARX Sidebar] Command executed successfully:', item.command),
						(err) => console.error('[TARX Sidebar] Command failed:', item.command, err)
					);
				}));
			}
		}

		this.navDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const collapsed = section.classList.toggle('collapsed');
			this.sectionState.set(id, collapsed);
		}));
	}

	private createProjectsSection(): void {
		if (!this.sectionsContainer) { return; }

		const section = append(this.sectionsContainer, $('.tarx-section'));
		section.dataset.sectionId = 'projects';

		if (this.sectionState.get('projects') ?? false) {
			section.classList.add('collapsed');
		}

		// Header: icon + title + add button + chevron
		const header = append(section, $('.tarx-section-header'));
		const iconEl = append(header, $('.tarx-section-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.project));
		const titleEl = append(header, $('.tarx-section-title'));
		titleEl.textContent = 'Projects';

		const addBtn = append(header, $('.tarx-action-btn.tarx-section-add'));
		addBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
		addBtn.title = 'New Project';

		const chevron = append(header, $('.tarx-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Content container (we'll populate this dynamically)
		this.projectsContentEl = append(section, $('.tarx-section-content'));

		// Add button click handler
		this.navDisposables.add(addDisposableListener(addBtn, EventType.CLICK, (e) => {
			e.stopPropagation();
			this.commandService.executeCommand('tarx.projects.new');
		}));

		// Header collapse toggle
		this.navDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const collapsed = section.classList.toggle('collapsed');
			this.sectionState.set('projects', collapsed);
		}));

		// Load projects from database
		this.loadProjects();
	}

	/**
	 * Load projects from the TARX extension database
	 */
	private async loadProjects(): Promise<void> {
		console.log('[TARX Sidebar] loadProjects called');
		try {
			const projects = await this.commandService.executeCommand<TarxProject[]>('tarx.projects.list');
			console.log('[TARX Sidebar] Got projects:', projects?.length || 0, projects);
			this.projects = projects || [];
			this.renderProjects();
		} catch (e) {
			console.log('[TARX Sidebar] Failed to load projects:', e);
			this.projects = [];
			this.renderProjects();
		}
	}

	/**
	 * Render project items in the Projects section
	 */
	private renderProjects(): void {
		if (!this.projectsContentEl) { return; }

		// Clear existing content
		this.projectsContentEl.textContent = '';

		if (this.projects.length === 0) {
			// Show empty state with CTA
			const emptyState = append(this.projectsContentEl, $('.tarx-section-empty-state'));

			const emptyText = append(emptyState, $('.tarx-empty-state-text'));
			emptyText.textContent = 'No projects yet';

			// Create Project CTA button
			const createBtn = append(emptyState, $('button.tarx-cta-btn'));
			const createBtnIcon = append(createBtn, $('span'));
			createBtnIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.add));
			const createBtnLabel = append(createBtn, $('span'));
			createBtnLabel.textContent = 'Create Project';

			this.navDisposables.add(addDisposableListener(createBtn, EventType.CLICK, () => {
				this.commandService.executeCommand('workbench.action.files.openFolder');
			}));
		} else {
			// Render project items
			for (const project of this.projects) {
				const item = append(this.projectsContentEl, $('.tarx-section-item'));
				item.dataset.projectId = project.id;

				if (project.isActive) {
					item.classList.add('active');
				}

				const icon = append(item, $('.tarx-section-item-icon'));
				// Use different icon based on project type
				const iconType = project.type === 'typescript' || project.type === 'javascript'
					? Codicon.json
					: project.type === 'python'
						? Codicon.symbolMethod
						: Codicon.folder;
				icon.classList.add(...ThemeIcon.asClassNameArray(iconType));

				const label = append(item, $('.tarx-section-item-label'));
				label.textContent = project.name;
				label.title = project.path;

				// Click to open project
				this.navDisposables.add(addDisposableListener(item, EventType.CLICK, () => {
					this.commandService.executeCommand('tarx.projects.open', project.id);
				}));
			}

			// Add "Open Folder" at the end
			const openFolder = append(this.projectsContentEl, $('.tarx-section-item'));
			openFolder.dataset.itemId = 'openFolder';
			const openFolderIcon = append(openFolder, $('.tarx-section-item-icon'));
			openFolderIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.folderOpened));
			const openFolderLabel = append(openFolder, $('.tarx-section-item-label'));
			openFolderLabel.textContent = 'Open Folder...';

			this.navDisposables.add(addDisposableListener(openFolder, EventType.CLICK, () => {
				this.commandService.executeCommand('workbench.action.files.openFolder');
			}));
		}
	}

	/**
	 * Refresh projects list (can be called externally)
	 */
	public refreshProjects(): void {
		this.loadProjects();
	}

	/**
	 * History section: collapsible, grouped by Today, Yesterday, This Week
	 */
	private createHistorySection(): void {
		if (!this.sectionsContainer) { return; }

		const section = append(this.sectionsContainer, $('.tarx-section'));
		section.dataset.sectionId = 'history';
		this.historyElement = section;

		if (this.sectionState.get('history') ?? false) {
			section.classList.add('collapsed');
		}

		// Header: icon + title + "See all" button + chevron
		const header = append(section, $('.tarx-section-header'));
		const iconEl = append(header, $('.tarx-section-icon'));
		iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.history));
		const titleEl = append(header, $('.tarx-section-title'));
		titleEl.textContent = 'History';

		const seeAllBtn = append(header, $('.tarx-action-btn.tarx-section-see-all'));
		seeAllBtn.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowRight));
		seeAllBtn.title = 'See all history';

		const chevron = append(header, $('.tarx-section-chevron'));
		chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));

		// Content
		const content = append(section, $('.tarx-section-content.tarx-history-content'));
		this.renderHistoryItems(content);

		// See all button click
		this.navDisposables.add(addDisposableListener(seeAllBtn, EventType.CLICK, (e) => {
			e.stopPropagation();
			this.commandService.executeCommand('tarx.history.showAll');
		}));

		// Collapse toggle
		this.navDisposables.add(addDisposableListener(header, EventType.CLICK, () => {
			const collapsed = section.classList.toggle('collapsed');
			this.sectionState.set('history', collapsed);
		}));
	}

	private renderHistoryItems(container: HTMLElement): void {
		container.textContent = '';

		if (this.historyItems.length === 0) {
			// Show empty state with CTA
			const emptyState = append(container, $('.tarx-section-empty-state'));

			const emptyText = append(emptyState, $('.tarx-empty-state-text'));
			emptyText.textContent = 'No conversations yet';

			// Start a chat CTA button
			const startChatBtn = append(emptyState, $('button.tarx-cta-btn'));
			const startChatIcon = append(startChatBtn, $('span'));
			startChatIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.comment));
			const startChatLabel = append(startChatBtn, $('span'));
			startChatLabel.textContent = 'Start a chat';

			this.navDisposables.add(addDisposableListener(startChatBtn, EventType.CLICK, () => {
				this.commandService.executeCommand('tarx.chat.new');
			}));
			return;
		}

		const dayMs = 24 * 60 * 60 * 1000;
		const todayStart = new Date().setHours(0, 0, 0, 0);
		const yesterdayStart = todayStart - dayMs;
		const weekStart = todayStart - 6 * dayMs;

		const today: TarxHistoryItem[] = [];
		const yesterday: TarxHistoryItem[] = [];
		const thisWeek: TarxHistoryItem[] = [];

		for (const item of this.historyItems) {
			if (item.timestamp >= todayStart) {
				today.push(item);
			} else if (item.timestamp >= yesterdayStart) {
				yesterday.push(item);
			} else if (item.timestamp >= weekStart) {
				thisWeek.push(item);
			}
		}

		if (today.length > 0) { this.renderHistoryGroup(container, 'Today', today); }
		if (yesterday.length > 0) { this.renderHistoryGroup(container, 'Yesterday', yesterday); }
		if (thisWeek.length > 0) { this.renderHistoryGroup(container, 'This Week', thisWeek); }
	}

	private renderHistoryGroup(container: HTMLElement, label: string, items: TarxHistoryItem[]): void {
		const groupLabel = append(container, $('.tarx-history-group-label'));
		groupLabel.textContent = label;

		for (const item of items) {
			const el = append(container, $('.tarx-history-item'));
			el.dataset.id = item.id;

			const icon = append(el, $('.tarx-history-item-icon'));
			icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussion));

			const title = append(el, $('.tarx-history-item-title'));
			title.textContent = item.title;

			this.navDisposables.add(addDisposableListener(el, EventType.CLICK, () => {
				this.commandService.executeCommand('tarx.openConversation', item.id);
			}));
		}
	}

	public updateHistory(items: TarxHistoryItem[]): void {
		this.historyItems = items;
		if (this.historyElement) {
			const content = this.historyElement.querySelector('.tarx-history-content');
			if (content) { this.renderHistoryItems(content as HTMLElement); }
		}
	}

	/**
	 * Load history from the TARX extension database
	 */
	private async loadHistory(): Promise<void> {
		try {
			const result = await this.commandService.executeCommand<{
				conversations: Array<{
					id: string;
					title: string;
					timestamp: number;
				}>;
				turns: unknown[];
			}>('tarx.getConversationHistory', 20);

			if (result && result.conversations && result.conversations.length > 0) {
				const items: TarxHistoryItem[] = result.conversations.map(c => ({
					id: c.id,
					title: c.title || 'Untitled',
					timestamp: c.timestamp
				}));
				console.log('[TARX Sidebar] Loaded history:', items.length, 'conversations');
				this.updateHistory(items);
			} else {
				console.log('[TARX Sidebar] No history found');
			}
		} catch (e) {
			console.log('[TARX Sidebar] Failed to load history:', e);
		}
	}

	/**
	 * Footer: Extensions, Settings, and Collapse toggle (stacked vertically)
	 */
	private createFooter(): void {
		if (!this.tarxContainer) { return; }

		this.footerElement = append(this.tarxContainer, $('.tarx-footer'));

		// Extensions row
		const extRow = append(this.footerElement, $('.tarx-footer-row'));
		extRow.title = 'Extensions';
		const extIcon = append(extRow, $('span'));
		extIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.extensions));
		const extLabel = append(extRow, $('span.tarx-footer-label'));
		extLabel.textContent = 'Extensions';
		this.navDisposables.add(addDisposableListener(extRow, EventType.CLICK, () => {
			console.log('[TARX Sidebar] Extensions clicked');
			this.commandService.executeCommand('workbench.view.extensions');
		}));

		// Settings row
		const settingsRow = append(this.footerElement, $('.tarx-footer-row'));
		settingsRow.title = 'Settings';
		const settingsIcon = append(settingsRow, $('span'));
		settingsIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gear));
		const settingsLabel = append(settingsRow, $('span.tarx-footer-label'));
		settingsLabel.textContent = 'Settings';
		this.navDisposables.add(addDisposableListener(settingsRow, EventType.CLICK, () => {
			this.commandService.executeCommand('workbench.action.openSettings');
		}));

		// Collapse row
		const collapseRow = append(this.footerElement, $('.tarx-footer-row.tarx-collapse-row'));
		collapseRow.title = this.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
		this.collapseIcon = append(collapseRow, $('span'));
		// Use correct icon based on current collapsed state
		const collapseIconType = this.isCollapsed ? Codicon.layoutSidebarLeftOff : Codicon.layoutSidebarLeft;
		this.collapseIcon.classList.add(...ThemeIcon.asClassNameArray(collapseIconType));
		const collapseLabel = append(collapseRow, $('span.tarx-footer-label'));
		collapseLabel.textContent = 'Collapse';
		this.navDisposables.add(addDisposableListener(collapseRow, EventType.CLICK, () => {
			this.toggleCollapse();
		}));
	}

	private collapseIcon: HTMLElement | undefined;
	private static readonly EXPANDED_WIDTH_KEY = 'tarx.sidebar.expandedWidth';
	private static readonly COLLAPSED_WIDTH = 48;
	private static readonly DEFAULT_EXPANDED_WIDTH = 240;

	private toggleCollapse(): void {
		console.log('[TARX] toggleCollapse called, current isCollapsed:', this.isCollapsed);
		this.isCollapsed = !this.isCollapsed;
		console.log('[TARX] new isCollapsed:', this.isCollapsed);

		// Toggle CSS class on our container
		if (this.tarxContainer) {
			this.tarxContainer.classList.toggle('collapsed', this.isCollapsed);
		}

		// Actually resize the Part via layout service
		const container = this.getContainer();
		if (this.isCollapsed) {
			// Store current width before collapsing
			if (container) {
				const currentWidth = container.offsetWidth;
				if (currentWidth > TarxSidebarPart.COLLAPSED_WIDTH) {
					this.storageService.store(TarxSidebarPart.EXPANDED_WIDTH_KEY, currentWidth, StorageScope.PROFILE, StorageTarget.USER);
				}
			}
			// Resize to collapsed width
			this.layoutService.setSize(Parts.SIDEBAR_PART, { width: TarxSidebarPart.COLLAPSED_WIDTH, height: -1 });
		} else {
			// Restore previous width
			const expandedWidth = this.storageService.getNumber(TarxSidebarPart.EXPANDED_WIDTH_KEY, StorageScope.PROFILE, TarxSidebarPart.DEFAULT_EXPANDED_WIDTH);
			this.layoutService.setSize(Parts.SIDEBAR_PART, { width: expandedWidth, height: -1 });
		}

		// Update the collapse icons (footer and header)
		if (this.collapseIcon) {
			this.collapseIcon.className = '';
			if (this.isCollapsed) {
				this.collapseIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeftOff));
			} else {
				this.collapseIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeft));
			}
		}

		if (this.headerCollapseIcon) {
			this.headerCollapseIcon.className = 'tarx-header-collapse-icon';
			if (this.isCollapsed) {
				this.headerCollapseIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeftOff));
			} else {
				this.headerCollapseIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.layoutSidebarLeft));
			}
		}

		if (this.headerCollapseBtn) {
			this.headerCollapseBtn.title = this.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
		}

		// Persist collapsed state
		this.storageService.store(TarxSidebarPart.COLLAPSED_KEY, this.isCollapsed, StorageScope.PROFILE, StorageTarget.USER);
	}

	//#region AbstractPaneCompositePart overrides

	override updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();
		if (container) {
			container.style.backgroundColor = this.getColor(SIDE_BAR_BACKGROUND) || '';
			container.style.color = this.getColor(SIDE_BAR_FOREGROUND) || '';

			const borderColor = this.getColor(SIDE_BAR_BORDER) || this.getColor(contrastBorder);
			const isPositionLeft = this.layoutService.getSideBarPosition() === SideBarPosition.LEFT;
			container.style.borderRightWidth = borderColor && isPositionLeft ? '1px' : '';
			container.style.borderRightStyle = borderColor && isPositionLeft ? 'solid' : '';
			container.style.borderRightColor = isPositionLeft ? borderColor || '' : '';
			container.style.borderLeftWidth = borderColor && !isPositionLeft ? '1px' : '';
			container.style.borderLeftStyle = borderColor && !isPositionLeft ? 'solid' : '';
			container.style.borderLeftColor = !isPositionLeft ? borderColor || '' : '';
		}
	}

	override layout(width: number, height: number, top: number, left: number): void {
		if (!this.layoutService.isVisible(Parts.SIDEBAR_PART)) {
			return;
		}

		super.layout(width, height, top, left);

		if (this.tarxContainer) {
			this.tarxContainer.style.width = `${width}px`;
			this.tarxContainer.style.height = `${height}px`;
		}
	}

	protected override createCompositeBar(): ActivityBarCompositeBar {
		return this.instantiationService.createInstance(ActivityBarCompositeBar, this.getCompositeBarOptions(), this.partId, this, false);
	}

	protected getCompositeBarOptions(): IPaneCompositeBarOptions {
		return {
			partContainerClass: 'sidebar',
			pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
			placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
			viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
			icon: true,
			orientation: ActionsOrientation.HORIZONTAL,
			recomputeSizes: true,
			activityHoverOptions: { position: () => HoverPosition.BELOW },
			fillExtraContextMenuActions: () => { },
			compositeSize: 0,
			iconSize: 16,
			overflowActionSize: 30,
			colors: theme => ({
				activeBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				inactiveBackgroundColor: theme.getColor(SIDE_BAR_BACKGROUND),
				activeBorderBottomColor: undefined,
				activeForegroundColor: theme.getColor(SIDE_BAR_FOREGROUND),
				inactiveForegroundColor: theme.getColor(SIDE_BAR_FOREGROUND),
				badgeBackground: undefined,
				badgeForeground: undefined,
				dragAndDropBorder: undefined
			}),
			compact: true
		};
	}

	protected shouldShowCompositeBar(): boolean {
		return false;
	}

	protected getCompositeBarPosition(): CompositeBarPosition {
		return CompositeBarPosition.TITLE;
	}

	override getPinnedPaneCompositeIds(): string[] {
		return this.activityBarPart.getPinnedPaneCompositeIds();
	}

	override getVisiblePaneCompositeIds(): string[] {
		return this.activityBarPart.getVisiblePaneCompositeIds();
	}

	override getPaneCompositeIds(): string[] {
		return this.activityBarPart.getPaneCompositeIds();
	}

	//#endregion

	override dispose(): void {
		// Clean up connection status polling
		if (this.connectionCheckInterval) {
			clearInterval(this.connectionCheckInterval);
			this.connectionCheckInterval = undefined;
		}
		super.dispose();
	}

	toJSON(): object {
		return { type: Parts.SIDEBAR_PART };
	}
}
