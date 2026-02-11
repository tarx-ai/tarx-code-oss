/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  esbuild configuration for webview bundling
 *--------------------------------------------------------------------------------------------*/

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--production');

// Ensure output directory exists
const outDir = path.join(__dirname, 'out', 'webview');
if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir, { recursive: true });
}

// Copy CSS file
const cssSource = path.join(__dirname, 'src', 'webview', 'ui', 'styles', 'sidebar.css');
const cssDest = path.join(outDir, 'sidebar.css');
fs.copyFileSync(cssSource, cssDest);
console.log('Copied sidebar.css');

// Build configuration
const buildOptions = {
	entryPoints: [path.join(__dirname, 'src', 'webview', 'ui', 'index.tsx')],
	bundle: true,
	outfile: path.join(outDir, 'sidebar.js'),
	external: [],
	format: 'iife',
	platform: 'browser',
	target: 'es2020',
	loader: {
		'.tsx': 'tsx',
		'.ts': 'ts',
		'.css': 'css'
	},
	define: {
		'process.env.NODE_ENV': isProd ? '"production"' : '"development"'
	},
	sourcemap: !isProd,
	minify: isProd,
	logLevel: 'info'
};

async function build() {
	try {
		if (isWatch) {
			const ctx = await esbuild.context(buildOptions);
			await ctx.watch();
			console.log('Watching for changes...');
		} else {
			await esbuild.build(buildOptions);
			console.log('Build completed successfully');
		}
	} catch (err) {
		console.error('Build failed:', err);
		process.exit(1);
	}
}

build();
