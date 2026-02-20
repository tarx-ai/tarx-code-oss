/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Generates webviewContent.ts by inlining CSS and JS from the TARX extension
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_CSS = path.join(ROOT, 'extensions', 'tarx', 'out', 'webview', 'sidebar.css');
const SOURCE_JS = path.join(ROOT, 'extensions', 'tarx', 'out', 'webview', 'sidebar.js');
const SOURCE_CODICON_CSS = path.join(ROOT, 'extensions', 'tarx', 'media', 'codicon.css');
const OUTPUT = path.join(ROOT, 'src', 'vs', 'workbench', 'browser', 'parts', 'tarxsidebar', 'webviewContent.ts');

function escapeTemplateLiteral(content) {
	// Escape backticks and ${} template expressions
	return content
		.replace(/\\/g, '\\\\')
		.replace(/`/g, '\\`')
		.replace(/\$\{/g, '\\${');
}

function main() {
	console.log('[tarx-webview-inline] Reading source files...');

	if (!fs.existsSync(SOURCE_CSS)) {
		console.error(`Error: CSS file not found: ${SOURCE_CSS}`);
		console.error('Run "npm run compile:webview" in extensions/tarx first');
		process.exit(1);
	}

	if (!fs.existsSync(SOURCE_JS)) {
		console.error(`Error: JS file not found: ${SOURCE_JS}`);
		console.error('Run "npm run compile:webview" in extensions/tarx first');
		process.exit(1);
	}

	const css = fs.readFileSync(SOURCE_CSS, 'utf8');
	const js = fs.readFileSync(SOURCE_JS, 'utf8');

	let codiconCss = '';
	let codiconFontUrl = '';
	if (fs.existsSync(SOURCE_CODICON_CSS)) {
		codiconCss = fs.readFileSync(SOURCE_CODICON_CSS, 'utf8');
		console.log(`[tarx-webview-inline] Codicon CSS: ${(codiconCss.length / 1024).toFixed(1)}KB`);

		// Extract base64 font data URL for FontFace API loading
		const fontMatch = codiconCss.match(/url\((data:font\/ttf;base64,[^)]+)\)/);
		if (fontMatch) {
			codiconFontUrl = fontMatch[1];
			console.log(`[tarx-webview-inline] Codicon font URL: ${(codiconFontUrl.length / 1024).toFixed(1)}KB`);
		} else {
			console.warn('[tarx-webview-inline] Warning: Could not extract base64 font URL from codicon.css');
		}
	} else {
		console.warn(`[tarx-webview-inline] Warning: codicon.css not found at ${SOURCE_CODICON_CSS}`);
	}

	console.log(`[tarx-webview-inline] CSS: ${(css.length / 1024).toFixed(1)}KB`);
	console.log(`[tarx-webview-inline] JS: ${(js.length / 1024).toFixed(1)}KB`);

	const output = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const TARX_CODICON_CSS = \`${escapeTemplateLiteral(codiconCss)}\`;

export const TARX_CODICON_FONT_URL = '${codiconFontUrl}';

export const TARX_SIDEBAR_CSS = \`${escapeTemplateLiteral(css)}\`;

export const TARX_SIDEBAR_JS = \`${escapeTemplateLiteral(js)}\`;
`;

	fs.writeFileSync(OUTPUT, output, 'utf8');
	console.log(`[tarx-webview-inline] Generated: ${OUTPUT}`);
	console.log(`[tarx-webview-inline] Total size: ${(output.length / 1024).toFixed(1)}KB`);
}

main();
