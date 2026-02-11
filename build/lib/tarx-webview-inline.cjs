/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Generates inline webview content for TARX sidebar
 *  Combines the compiled CSS and JS into a single TypeScript module
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const WEBVIEW_OUT = path.join(ROOT, 'extensions', 'tarx', 'out', 'webview');
const TARGET = path.join(ROOT, 'src', 'vs', 'workbench', 'browser', 'parts', 'tarxsidebar', 'webviewContent.ts');

function main() {
	console.log('[tarx-webview-inline] Generating inline webview content...');

	// Read CSS
	const cssPath = path.join(WEBVIEW_OUT, 'sidebar.css');
	if (!fs.existsSync(cssPath)) {
		console.error(`[tarx-webview-inline] CSS not found: ${cssPath}`);
		console.error('[tarx-webview-inline] Run: cd extensions/tarx && npm run compile:webview');
		process.exit(1);
	}
	const css = fs.readFileSync(cssPath, 'utf8');

	// Read JS
	const jsPath = path.join(WEBVIEW_OUT, 'sidebar.js');
	if (!fs.existsSync(jsPath)) {
		console.error(`[tarx-webview-inline] JS not found: ${jsPath}`);
		console.error('[tarx-webview-inline] Run: cd extensions/tarx && npm run compile:webview');
		process.exit(1);
	}
	const js = fs.readFileSync(jsPath, 'utf8');

	// Escape backticks and backslashes for template literals
	const escapedCss = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
	const escapedJs = js.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

	// Generate TypeScript content
	const content = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  AUTO-GENERATED FILE - Do not edit manually!
 *  Run: node build/lib/tarx-webview-inline.js
 *  Source: extensions/tarx/out/webview/sidebar.{css,js}
 *--------------------------------------------------------------------------------------------*/

export const TARX_SIDEBAR_CSS = \`${escapedCss}\`;

export const TARX_SIDEBAR_JS = \`${escapedJs}\`;
`;

	// Write output
	fs.writeFileSync(TARGET, content, 'utf8');

	const cssSize = Math.round(css.length / 1024);
	const jsSize = Math.round(js.length / 1024);
	console.log(`[tarx-webview-inline] Generated ${TARGET}`);
	console.log(`[tarx-webview-inline] CSS: ${cssSize}KB, JS: ${jsSize}KB`);
}

main();
