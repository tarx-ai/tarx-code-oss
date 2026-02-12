/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Increase max listeners for event emitters
import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 100;

import gulp from 'gulp';
import * as path from 'path';
import * as nodeUtil from 'util';
import es from 'event-stream';
import filter from 'gulp-filter';
import * as util from './lib/util.ts';
import { getVersion } from './lib/getVersion.ts';
import * as task from './lib/task.ts';
import watcher from './lib/watch/index.ts';
import { createReporter } from './lib/reporter.ts';
import glob from 'glob';
import plumber from 'gulp-plumber';
import * as ext from './lib/extensions.ts';
import * as tsb from './lib/tsb/index.ts';
import sourcemaps from 'gulp-sourcemaps';
import { spawn } from 'child_process';

const root = path.dirname(import.meta.dirname);
const commit = getVersion(root);

// To save 250ms for each gulp startup, we are caching the result here
// const compilations = glob.sync('**/tsconfig.json', {
// 	cwd: extensionsPath,
// 	ignore: ['**/out/**', '**/node_modules/**']
// });
const compilations = [
	'extensions/configuration-editing/tsconfig.json',
	'extensions/css-language-features/client/tsconfig.json',
	'extensions/css-language-features/server/tsconfig.json',
	'extensions/debug-auto-launch/tsconfig.json',
	'extensions/debug-server-ready/tsconfig.json',
	'extensions/emmet/tsconfig.json',
	'extensions/extension-editing/tsconfig.json',
	'extensions/git/tsconfig.json',
	'extensions/git-base/tsconfig.json',
	'extensions/github/tsconfig.json',
	'extensions/github-authentication/tsconfig.json',
	'extensions/grunt/tsconfig.json',
	'extensions/gulp/tsconfig.json',
	'extensions/html-language-features/client/tsconfig.json',
	'extensions/html-language-features/server/tsconfig.json',
	'extensions/ipynb/tsconfig.json',
	'extensions/jake/tsconfig.json',
	'extensions/json-language-features/client/tsconfig.json',
	'extensions/json-language-features/server/tsconfig.json',
	'extensions/markdown-language-features/tsconfig.json',
	'extensions/markdown-math/tsconfig.json',
	'extensions/media-preview/tsconfig.json',
	'extensions/merge-conflict/tsconfig.json',
	'extensions/mermaid-chat-features/tsconfig.json',
	'extensions/terminal-suggest/tsconfig.json',
	'extensions/microsoft-authentication/tsconfig.json',
	'extensions/notebook-renderers/tsconfig.json',
	'extensions/npm/tsconfig.json',
	'extensions/php-language-features/tsconfig.json',
	'extensions/references-view/tsconfig.json',
	'extensions/search-result/tsconfig.json',
	'extensions/simple-browser/tsconfig.json',
	'extensions/tunnel-forwarding/tsconfig.json',
	'extensions/typescript-language-features/web/tsconfig.json',
	'extensions/typescript-language-features/tsconfig.json',
	'extensions/vscode-api-tests/tsconfig.json',
	'extensions/vscode-colorize-tests/tsconfig.json',
	'extensions/vscode-colorize-perf-tests/tsconfig.json',
	'extensions/vscode-test-resolver/tsconfig.json',

	// TARX extensions — V1.0
	'extensions/tarx/tsconfig.json',
	'extensions/tarx-local/tsconfig.json',
	'extensions/tarx-core/tsconfig.json',
	'extensions/tarx-ops/tsconfig.json',
	'extensions/tarx-shared/tsconfig.json',
	'extensions/tarx-skills-provider/tsconfig.json',

	// V1.1 — mesh networking, deferred
	// 'extensions/tarx-supercomputer/tsconfig.json',

	// RETIRED — dev-only E2E testing
	// 'extensions/tarx-ui-mcp-server/tsconfig.json',

	// RETIRED — superseded by tarx-core memory
	// 'extensions/tarx-claude-memory/tsconfig.json',

	// RETIRED — superseded by tarx-ops
	// 'extensions/tarx-admin-mcp-server/tsconfig.json',

	// RETIRED — superseded by tarx-core
	// 'extensions/tarx-mcp-server/tsconfig.json',

	// RETIRED — merged into tarx-ops
	// 'extensions/tarx-orchestration-mcp/tsconfig.json',

	'.vscode/extensions/vscode-selfhost-test-provider/tsconfig.json',
	'.vscode/extensions/vscode-selfhost-import-aid/tsconfig.json',
];

const getBaseUrl = (out: string) => `https://main.vscode-cdn.net/sourcemaps/${commit}/${out}`;

const tasks = compilations.map(function (tsconfigFile) {
	const absolutePath = path.join(root, tsconfigFile);
	const relativeDirname = path.dirname(tsconfigFile.replace(/^(.*\/)?extensions\//i, ''));

	const overrideOptions: { sourceMap?: boolean; inlineSources?: boolean; base?: string } = {};
	overrideOptions.sourceMap = true;

	const name = relativeDirname.replace(/\//g, '-');

	const srcRoot = path.dirname(tsconfigFile);
	const srcBase = path.join(srcRoot, 'src');
	const src = path.join(srcBase, '**');
	const srcOpts = { cwd: root, base: srcBase, dot: true };

	const out = path.join(srcRoot, 'out');
	const baseUrl = getBaseUrl(out);

	function createPipeline(build: boolean, emitError?: boolean, transpileOnly?: boolean) {
		const reporter = createReporter('extensions');

		overrideOptions.inlineSources = Boolean(build);
		overrideOptions.base = path.dirname(absolutePath);

		const compilation = tsb.create(absolutePath, overrideOptions, { verbose: false, transpileOnly, transpileOnlyIncludesDts: transpileOnly, transpileWithEsbuild: true }, err => reporter(err.toString()));

		const pipeline = function () {
			const input = es.through();
			const tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true, dot: true });
			const output = input
				.pipe(plumber({
					errorHandler: function (err) {
						if (err && !err.__reporter__) {
							reporter(err);
						}
					}
				}))
				.pipe(tsFilter)
				.pipe(util.loadSourcemaps())
				.pipe(compilation())
				.pipe(build ? util.stripSourceMappingURL() : es.through())
				.pipe(sourcemaps.write('.', {
					sourceMappingURL: !build ? undefined : f => `${baseUrl}/${f.relative}.map`,
					addComment: !!build,
					includeContent: !!build,
					// note: trailing slash is important, else the source URLs in V8's file coverage are incorrect
					sourceRoot: '../src/',
				}))
				.pipe(tsFilter.restore)
				.pipe(reporter.end(!!emitError));

			return es.duplex(input, output);
		};

		// add src-stream for project files
		pipeline.tsProjectSrc = () => {
			return compilation.src(srcOpts);
		};
		return pipeline;
	}

	const cleanTask = task.define(`clean-extension-${name}`, util.rimraf(out));

	const transpileTask = task.define(`transpile-extension:${name}`, task.series(cleanTask, () => {
		const pipeline = createPipeline(false, true, true);
		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, pipeline.tsProjectSrc());

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	}));

	const compileTask = task.define(`compile-extension:${name}`, task.series(cleanTask, () => {
		const pipeline = createPipeline(false, true);
		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, pipeline.tsProjectSrc());

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	}));

	const watchTask = task.define(`watch-extension:${name}`, task.series(cleanTask, () => {
		const pipeline = createPipeline(false);
		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, pipeline.tsProjectSrc());
		const watchInput = watcher(src, { ...srcOpts, ...{ readDelay: 200 } });

		return watchInput
			.pipe(util.incremental(pipeline, input))
			.pipe(gulp.dest(out));
	}));

	// Tasks
	gulp.task(transpileTask);
	gulp.task(compileTask);
	gulp.task(watchTask);

	return { transpileTask, compileTask, watchTask };
});

//#region TARX webview build integration

/**
 * Build TARX webview bundle using esbuild (after clean, before TypeScript compile)
 */
function compileTarxWebview() {
	return new Promise((resolve, reject) => {
		const webviewScript = path.join(root, 'extensions', 'tarx', 'esbuild.webview.js');
		const child = spawn('node', [webviewScript, '--production'], {
			cwd: path.join(root, 'extensions', 'tarx'),
			stdio: 'inherit'
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve(undefined);
			} else {
				reject(new Error(`Webview build failed with code ${code}`));
			}
		});

		child.on('error', reject);
	});
}

/**
 * Inline TARX webview CSS/JS into TypeScript constants (after webview build)
 */
function inlineTarxWebview() {
	return new Promise((resolve, reject) => {
		const inlineScript = path.join(root, 'build', 'lib', 'tarx-webview-inline.js');
		const child = spawn('node', [inlineScript], {
			cwd: root,
			stdio: 'inherit'
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve(undefined);
			} else {
				reject(new Error(`Webview inline failed with code ${code}`));
			}
		});

		child.on('error', reject);
	});
}

/**
 * Override the tarx extension's compile task to include webview build after clean
 */
const tarxTaskIndex = compilations.findIndex(c => c === 'extensions/tarx/tsconfig.json');
if (tarxTaskIndex >= 0) {
	const tarxTask = tasks[tarxTaskIndex];
	const originalTask = tarxTask.compileTask;

	// Get the task components - we need to inject webview build after clean
	const out = path.join(root, 'extensions', 'tarx', 'out');
	const cleanTask = task.define('clean-extension-tarx', util.rimraf(out));
	const webviewBuildTask = task.define('compile-tarx-webview', compileTarxWebview);
	const webviewInlineTask = task.define('inline-tarx-webview', inlineTarxWebview);

	// Create new compile task: clean → webview build → inline → TypeScript compile
	const srcRoot = path.dirname('extensions/tarx/tsconfig.json');
	const srcBase = path.join(srcRoot, 'src');
	const src = path.join(srcBase, '**');
	const srcOpts = { cwd: root, base: srcBase, dot: true };
	const absolutePath = path.join(root, 'extensions/tarx/tsconfig.json');

	const overrideOptions: { sourceMap?: boolean; inlineSources?: boolean; base?: string } = {};
	overrideOptions.sourceMap = true;
	overrideOptions.inlineSources = false;
	overrideOptions.base = path.dirname(absolutePath);

	const reporter = createReporter('extensions');
	const compilation = tsb.create(absolutePath, overrideOptions, { verbose: false, transpileOnly: false, transpileOnlyIncludesDts: false, transpileWithEsbuild: true }, err => reporter(err.toString()));

	tarxTask.compileTask = task.define('compile-extension:tarx', task.series(cleanTask, webviewBuildTask, webviewInlineTask, () => {
		const pipeline = function () {
			const input = es.through();
			const tsFilter = filter(['**/*.ts', '!**/lib/lib*.d.ts', '!**/node_modules/**'], { restore: true, dot: true });
			const baseUrl = getBaseUrl(out);
			const output = input
				.pipe(plumber({
					errorHandler: function (err) {
						if (err && !err.__reporter__) {
							reporter(err);
						}
					}
				}))
				.pipe(tsFilter)
				.pipe(util.loadSourcemaps())
				.pipe(compilation())
				.pipe(util.stripSourceMappingURL())
				.pipe(sourcemaps.write('.', {
					sourceMappingURL: f => `${baseUrl}/${f.relative}.map`,
					addComment: true,
					includeContent: true,
					sourceRoot: '../src/',
				}))
				.pipe(tsFilter.restore)
				.pipe(reporter.end(true));

			return es.duplex(input, output);
		};

		const nonts = gulp.src(src, srcOpts).pipe(filter(['**', '!**/*.ts']));
		const input = es.merge(nonts, compilation.src(srcOpts));

		return input
			.pipe(pipeline())
			.pipe(gulp.dest(out));
	}));
}

//#endregion

const transpileExtensionsTask = task.define('transpile-extensions', task.parallel(...tasks.map(t => t.transpileTask)));
gulp.task(transpileExtensionsTask);

export const compileExtensionsTask = task.define('compile-extensions', task.parallel(...tasks.map(t => t.compileTask)));
gulp.task(compileExtensionsTask);

export const watchExtensionsTask = task.define('watch-extensions', task.parallel(...tasks.map(t => t.watchTask)));
gulp.task(watchExtensionsTask);

//#region Extension media

export const compileExtensionMediaTask = task.define('compile-extension-media', () => ext.buildExtensionMedia(false));
gulp.task(compileExtensionMediaTask);

export const watchExtensionMedia = task.define('watch-extension-media', () => ext.buildExtensionMedia(true));
gulp.task(watchExtensionMedia);

export const compileExtensionMediaBuildTask = task.define('compile-extension-media-build', () => ext.buildExtensionMedia(false, '.build/extensions'));
gulp.task(compileExtensionMediaBuildTask);

//#endregion

//#region Azure Pipelines

/**
 * Cleans the build directory for extensions
 */
export const cleanExtensionsBuildTask = task.define('clean-extensions-build', util.rimraf('.build/extensions'));

/**
 * brings in the marketplace extensions for the build
 */
const bundleMarketplaceExtensionsBuildTask = task.define('bundle-marketplace-extensions-build', () => ext.packageMarketplaceExtensionsStream(false).pipe(gulp.dest('.build')));

/**
 * Compiles the non-native extensions for the build
 * @note this does not clean the directory ahead of it. See {@link cleanExtensionsBuildTask} for that.
 */
export const compileNonNativeExtensionsBuildTask = task.define('compile-non-native-extensions-build', task.series(
	bundleMarketplaceExtensionsBuildTask,
	task.define('bundle-non-native-extensions-build', () => ext.packageNonNativeLocalExtensionsStream(false, false).pipe(gulp.dest('.build')))
));
gulp.task(compileNonNativeExtensionsBuildTask);

/**
 * Compiles the native extensions for the build
 * @note this does not clean the directory ahead of it. See {@link cleanExtensionsBuildTask} for that.
 */
export const compileNativeExtensionsBuildTask = task.define('compile-native-extensions-build', () => ext.packageNativeLocalExtensionsStream(false, false).pipe(gulp.dest('.build')));
gulp.task(compileNativeExtensionsBuildTask);

/**
 * Compiles the extensions for the build.
 * This is essentially a helper task that combines {@link cleanExtensionsBuildTask}, {@link compileNonNativeExtensionsBuildTask} and {@link compileNativeExtensionsBuildTask}
 */
export const compileAllExtensionsBuildTask = task.define('compile-extensions-build', task.series(
	cleanExtensionsBuildTask,
	bundleMarketplaceExtensionsBuildTask,
	task.define('bundle-extensions-build', () => ext.packageAllLocalExtensionsStream(false, false).pipe(gulp.dest('.build'))),
));
gulp.task(compileAllExtensionsBuildTask);

// This task is run in the compilation stage of the CI pipeline. We only compile the non-native extensions since those can be fully built regardless of platform.
// This defers the native extensions to the platform specific stage of the CI pipeline.
gulp.task(task.define('extensions-ci', task.series(compileNonNativeExtensionsBuildTask, compileExtensionMediaBuildTask)));

const compileExtensionsBuildPullRequestTask = task.define('compile-extensions-build-pr', task.series(
	cleanExtensionsBuildTask,
	bundleMarketplaceExtensionsBuildTask,
	task.define('bundle-extensions-build-pr', () => ext.packageAllLocalExtensionsStream(false, true).pipe(gulp.dest('.build'))),
));
gulp.task(compileExtensionsBuildPullRequestTask);

// This task is run in the compilation stage of the PR pipeline. We compile all extensions in it to verify compilation.
gulp.task(task.define('extensions-ci-pr', task.series(compileExtensionsBuildPullRequestTask, compileExtensionMediaBuildTask)));

//#endregion

export const compileWebExtensionsTask = task.define('compile-web', () => buildWebExtensions(false));
gulp.task(compileWebExtensionsTask);

export const watchWebExtensionsTask = task.define('watch-web', () => buildWebExtensions(true));
gulp.task(watchWebExtensionsTask);

async function buildWebExtensions(isWatch: boolean) {
	const extensionsPath = path.join(root, 'extensions');
	const webpackConfigLocations = await nodeUtil.promisify(glob)(
		path.join(extensionsPath, '**', 'extension-browser.webpack.config.js'),
		{ ignore: ['**/node_modules'] }
	);
	return ext.webpackExtensions('packaging web extension', isWatch, webpackConfigLocations.map(configPath => ({ configPath })));
}
