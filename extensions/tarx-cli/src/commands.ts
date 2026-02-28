/**
 * TARX CLI — Command registry.
 * Single source of truth for all commands, their metadata, and help text.
 * printHelp() and printCommandHelp() in feedback.ts render from this data.
 */

export interface CommandDef {
	/** Primary command name (used for routing and lookup). */
	name: string;
	/** Argument signature shown in help, e.g. '<msg>', '[scope]'. */
	args?: string;
	/** One-line description. */
	desc: string;
	/** Full usage line override (auto-generated from name+args if omitted). */
	usage?: string;
	/** Flag descriptions shown in per-command help. */
	flags?: string[];
	/** Example invocations. */
	examples?: string[];
	/** Which section this command belongs to. */
	section: Section;
}

export interface GlobalOption {
	/** Flag text, e.g. '--help, -h'. */
	flag: string;
	/** Description. */
	desc: string;
}

export type Section = 'core' | 'build' | 'social' | 'system';

export const SECTION_TITLES: Record<Section, string> = {
	core: 'Core',
	build: 'Build (dispatches to Claude Code)',
	social: 'X / Social',
	system: 'System',
};

export const SECTION_ORDER: Section[] = ['core', 'build', 'social', 'system'];

export const COMMANDS: CommandDef[] = [
	// ── Core ──
	{ name: 'status',     desc: 'Health check all services',                     section: 'core' },
	{ name: 'chat',       desc: 'Interactive AI chat session (REPL)',             section: 'core' },
	{ name: 'search',     args: '<query>',          desc: 'Search local knowledge (RAG embeddings)', section: 'core',
		examples: ['tarx search "embedding architecture"'] },
	{ name: 'brief',      args: '[--weekly] [--sms]', desc: 'Daily brief or weekly digest',          section: 'core',
		flags: ['--weekly, -w  Weekly digest instead of daily', '--sms  Also send via SMS'],
		examples: ['tarx brief', 'tarx brief --weekly --sms'] },
	{ name: 'weekly',     desc: 'Weekly digest + SMS (alias)',                    section: 'core' },
	{ name: 'priorities', desc: 'List active priority queue',                     section: 'core',
		usage: 'tarx priorities [add|done] [args]',
		flags: ['add "<title>" --urgency <now|today|this_week> --owner <name>', 'done <id>  Mark a priority done'],
		examples: ['tarx priorities', 'tarx priorities add "Ship v1" --urgency now', 'tarx priorities done p-001'] },
	{ name: 'mesh',       desc: 'Mesh network status + peer info',               section: 'core' },
	{ name: 'update',     desc: 'Check for CLI updates',                         section: 'core' },
	{ name: 'ask',        args: '<question>',  desc: 'Ask a question (local RAG + AI)',            section: 'core',
		examples: ['tarx ask "what is TARX?"', 'tarx ask "how does the embedding pipeline work?"'] },
	{ name: 'recall',     args: '<topic>',     desc: 'Search memories + knowledge',                section: 'core',
		examples: ['tarx recall "embedding"', 'tarx recall "auth flow"'] },
	{ name: 'context',    desc: 'Dashboard: everything TARX knows',                                section: 'core' },
	{ name: 'learn',      args: '<file|dir>',  desc: 'Teach TARX about files (embed to RAG)',      section: 'core',
		flags: ['--depth <n>  Max directory depth (default 3)'],
		examples: ['tarx learn README.md', 'tarx learn src/ --depth 2'] },
	{ name: 'watch',      args: '<add|rm|ls|scan>', desc: 'Manage watched directories',            section: 'core',
		usage: 'tarx watch <add|rm|ls|scan> [args]',
		flags: ['add <dir> [--depth N] [--label NAME]', 'rm <dir|id>', 'ls  List all watches', 'scan [id]  Force rescan'],
		examples: ['tarx watch add ~/projects/myapp', 'tarx watch ls', 'tarx watch scan'] },
	{ name: 'index',      desc: 'RAG health dashboard',                                            section: 'core' },
	{ name: 'remember',   args: '<fact>',      desc: 'Store a fact in TARX memory',                section: 'core',
		examples: ['tarx remember "always use bun for this project"'] },
	{ name: 'forget',     args: '<id|query>',  desc: 'Remove a memory',                            section: 'core',
		examples: ['tarx forget "bun"', 'tarx forget a1b2c3d4'] },

	// ── Build ──
	{ name: 'build',      args: '[task]',    desc: 'Compile project, fix errors',        section: 'build' },
	{ name: 'refactor',   args: '[target]',  desc: 'Refactor code',                      section: 'build' },
	{ name: 'fix',        args: '<bug>',     desc: 'Find and fix bugs',                  section: 'build' },
	{ name: 'test',       args: '[scope]',   desc: 'Run or write tests',                 section: 'build' },
	{ name: 'document',   args: '[scope]',   desc: 'Generate documentation',             section: 'build' },
	{ name: 'plan',       args: '[task]',    desc: 'Create implementation plan',          section: 'build' },
	{ name: 'review',    desc: 'AI code review (git diff + RAG)',                                   section: 'build' },
	{ name: 'explain',   args: '<error|file>', desc: 'Explain error or file with AI + RAG',        section: 'build',
		examples: ['tarx explain ECONNREFUSED', 'tarx explain src/server.ts'] },

	// ── Social ──
	{ name: 'tweet',      args: '<msg>',       desc: 'Post a tweet',                     section: 'social' },
	{ name: 'timeline',   args: '<@user> [n]', desc: 'View user timeline',               section: 'social',
		examples: ['tarx timeline @elonmusk', 'tarx timeline @tarx_ai 5'] },
	{ name: 'xsearch',    args: '<query>',     desc: 'Search recent tweets',             section: 'social' },
	{ name: 'xstatus',    desc: 'Verify X + xAI API keys',                               section: 'social' },
	{ name: 'xai',        args: '<prompt>',    desc: 'Query xAI Grok (--model <name>)',  section: 'social',
		flags: ['--model <name>  Model to use (default: grok-3)'],
		examples: ['tarx xai "explain quantum computing"', 'tarx xai --model grok-3 "hello"'] },

	// ── System ──
	{ name: 'install',    args: '<workbench|daemon>', desc: 'Install TARX components',      section: 'system',
		examples: ['tarx install workbench', 'tarx install daemon'] },
	{ name: 'model',      args: '<status|download|list>', desc: 'Manage local AI models',   section: 'system',
		examples: ['tarx model status', 'tarx model download', 'tarx model list'] },
	{ name: 'daemon',     args: '<start|stop|status|restart|install|uninstall>',
	                      desc: 'Manage the always-on AI engine',                           section: 'system' },
	{ name: 'start',      desc: 'Start AI engine (alias: daemon start)',                    section: 'system' },
	{ name: 'stop',       desc: 'Stop AI engine (alias: daemon stop)',                      section: 'system' },
	{ name: 'dispatch',   args: '<prompt>',  desc: 'Send prompt to Claude Code',          section: 'system' },
	{ name: 'heal',       args: '[error]',   desc: 'Self-healing / health check cycle',   section: 'system' },
	{ name: 'doctor',     desc: 'Diagnose service issues',                                section: 'system' },
	{ name: 'log',        args: '[n]',       desc: 'Tail dispatch log (live, Ctrl+C)',    section: 'system' },
	{ name: 'think',      args: '[-f] [n]',  desc: 'Tail thinking log (-f to follow)',    section: 'system',
		flags: ['--follow, -f  Follow mode (live tail)', '<n>  Number of lines (default 20)'],
		examples: ['tarx think', 'tarx think --follow', 'tarx think 50'] },
	{ name: 'stream',     desc: 'Priority stream (live polling)',                          section: 'system' },
	{ name: 'wake',       desc: 'Trigger one heartbeat tick',                              section: 'system' },
	{ name: 'notify',     args: '<msg>',     desc: 'Send SMS (--level=info|success|warning|blocked)', section: 'system',
		flags: ['--level=<info|success|warning|blocked>  Notification level', '--check  Run SMS diagnostic'],
		examples: ['tarx notify "Deploy complete"', 'tarx notify --level=warning "Disk full"', 'tarx notify --check'] },
	{ name: 'taxonomy',   desc: 'Print task taxonomy tree',                                section: 'system' },
	{ name: 'strategy',   args: '[name]',   desc: 'List or show dispatch strategies',     section: 'system' },
];

export const GLOBAL_OPTIONS: GlobalOption[] = [
	{ flag: '--help, -h',       desc: 'Show this help' },
	{ flag: '--health',         desc: 'Quick health check (exit code)' },
	{ flag: '--status',         desc: 'Full system status' },
	{ flag: '--json',           desc: 'JSON output (with --health/--status)' },
	{ flag: '--no-stream',      desc: 'Disable streaming for one-shot' },
	{ flag: '--max-tokens <n>', desc: 'Max response tokens (default 2000)' },
	{ flag: '--debug',          desc: 'Show stack traces on error' },
	{ flag: '-p, --print',      desc: 'Print response and exit (pipe-friendly)' },
];

/** Look up a command by name. */
export function getCommand(name: string): CommandDef | undefined {
	return COMMANDS.find(c => c.name === name);
}

/** Get all commands in a section, in registry order. */
export function getSection(section: Section): CommandDef[] {
	return COMMANDS.filter(c => c.section === section);
}

/** All command names (for routing). */
export function allCommandNames(): string[] {
	return COMMANDS.map(c => c.name);
}

/** Format "name args" for display. */
export function formatSignature(cmd: CommandDef): string {
	return cmd.args ? `${cmd.name} ${cmd.args}` : cmd.name;
}
