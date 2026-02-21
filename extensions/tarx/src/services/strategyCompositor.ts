/**
 * TARX Strategy Compositor — Composes Claude Code prompts from strategy primitives.
 */

export interface StrategyStep {
  type: string;
  params: Record<string, string>;
}

export interface StrategyDef {
  steps: StrategyStep[];
  max_attempts: number;
  requires_approval: boolean;
  on_failure: string[];
}

export interface ComposedStrategy {
  definition: StrategyDef;
  prompt: string;
}

const PRIMITIVES: Record<string, (p: Record<string, string>) => string> = {
  READ: (p) => `Read and understand ${p.file_path || 'the relevant files'}.`,
  DIAGNOSE: (p) => `Analyze this error and identify root cause: ${p.error_message || 'see above'}`,
  PATCH: (p) => `In ${p.file_path || 'the relevant file'}, fix: ${p.instruction || p.diagnosis || 'the identified issue'}. Do not change unrelated code.`,
  VERIFY: (p) => `Run: ${p.command || 'the appropriate verification command'}. Confirm exit code 0 and no errors.`,
  COMMIT: (p) => `git add -A && git commit -m "fix: ${p.message || p.short_description || 'auto-fix'}"`,
  ROLLBACK: () => `git checkout -- . && git clean -fd`,
  NOTIFY: (p) => `Report: ${p.message || 'operation complete'}`,
  RESTART: (p) => `Kill process on port ${p.port || 'unknown'}: lsof -ti:${p.port || '0'} | xargs kill -9. Wait 3 seconds.`,
  HEALTH_CHECK: (p) => `curl -sf http://localhost:${p.port || '11435'}/health`,
};

const STRATEGIES: Record<string, StrategyDef> = {
  compile_fix: {
    steps: [
      { type: 'VERIFY', params: { command: 'cd ~/Desktop/tarx-code-oss && yarn compile 2>&1 | tail -30' } },
      { type: 'READ', params: {} },
      { type: 'DIAGNOSE', params: {} },
      { type: 'PATCH', params: {} },
      { type: 'VERIFY', params: { command: 'cd ~/Desktop/tarx-code-oss && yarn compile' } },
      { type: 'COMMIT', params: {} },
    ],
    max_attempts: 3,
    requires_approval: false,
    on_failure: ['ROLLBACK', 'NOTIFY'],
  },
  health_fix: {
    steps: [
      { type: 'HEALTH_CHECK', params: {} },
      { type: 'DIAGNOSE', params: {} },
      { type: 'RESTART', params: {} },
      { type: 'HEALTH_CHECK', params: {} },
    ],
    max_attempts: 2,
    requires_approval: false,
    on_failure: ['NOTIFY'],
  },
  runtime_fix: {
    steps: [
      { type: 'READ', params: {} },
      { type: 'DIAGNOSE', params: {} },
      { type: 'PATCH', params: {} },
      { type: 'VERIFY', params: { command: 'cd ~/Desktop/tarx-code-oss && yarn compile' } },
      { type: 'COMMIT', params: {} },
    ],
    max_attempts: 3,
    requires_approval: false,
    on_failure: ['ROLLBACK', 'NOTIFY'],
  },
  native_fix: {
    steps: [
      { type: 'DIAGNOSE', params: {} },
      { type: 'VERIFY', params: { command: 'npm rebuild' } },
      { type: 'VERIFY', params: { command: 'cd ~/Desktop/tarx-code-oss && yarn compile' } },
      { type: 'COMMIT', params: {} },
    ],
    max_attempts: 1,
    requires_approval: false,
    on_failure: ['NOTIFY'],
  },
  security_fix: {
    steps: [
      { type: 'READ', params: {} },
      { type: 'DIAGNOSE', params: {} },
      { type: 'NOTIFY', params: { message: 'Security issue found. Awaiting approval.' } },
    ],
    max_attempts: 1,
    requires_approval: true,
    on_failure: ['NOTIFY'],
  },
  emergency: {
    steps: [
      { type: 'ROLLBACK', params: {} },
      { type: 'NOTIFY', params: { message: 'Emergency rollback executed.' } },
    ],
    max_attempts: 1,
    requires_approval: false,
    on_failure: [],
  },
  integration_fix: {
    steps: [
      { type: 'READ', params: {} },
      { type: 'DIAGNOSE', params: {} },
      { type: 'PATCH', params: {} },
      { type: 'VERIFY', params: { command: 'cd ~/Desktop/tarx-code-oss && yarn compile' } },
      { type: 'COMMIT', params: {} },
    ],
    max_attempts: 2,
    requires_approval: false,
    on_failure: ['NOTIFY'],
  },
  lint_fix: {
    steps: [
      { type: 'VERIFY', params: { command: 'npx eslint --ext .ts,.tsx .' } },
      { type: 'PATCH', params: {} },
      { type: 'VERIFY', params: { command: 'cd ~/Desktop/tarx-code-oss && yarn compile' } },
      { type: 'COMMIT', params: {} },
    ],
    max_attempts: 1,
    requires_approval: false,
    on_failure: ['NOTIFY'],
  },
  general_fix: {
    steps: [
      { type: 'READ', params: {} },
      { type: 'DIAGNOSE', params: {} },
      { type: 'PATCH', params: {} },
      { type: 'VERIFY', params: { command: 'cd ~/Desktop/tarx-code-oss && yarn compile' } },
      { type: 'COMMIT', params: {} },
    ],
    max_attempts: 2,
    requires_approval: false,
    on_failure: ['NOTIFY'],
  },
};

export function compose(
  strategyName: string,
  variables: Record<string, string>,
  ragContext?: string,
): ComposedStrategy {
  const definition = STRATEGIES[strategyName];
  if (!definition) {
    throw new Error(`Unknown strategy: ${strategyName}`);
  }

  const lines: string[] = [
    'You are fixing an issue in TARX Workbench (~/Desktop/tarx-code-oss).',
    '',
  ];

  if (ragContext) {
    lines.push('Relevant context from knowledge base:');
    lines.push(ragContext);
    lines.push('');
  }

  if (variables.taxonomy_id) {
    lines.push(`Classification: ${variables.taxonomy_id} (severity: ${variables.severity || 'unknown'})`);
    lines.push('');
  }

  lines.push('Execute these steps in order:');
  definition.steps.forEach((step, i) => {
    const mergedParams = { ...step.params, ...variables };
    const primitiveFn = PRIMITIVES[step.type];
    if (primitiveFn) {
      lines.push(`${i + 1}. ${primitiveFn(mergedParams)}`);
    } else {
      lines.push(`${i + 1}. [UNKNOWN PRIMITIVE: ${step.type}]`);
    }
  });

  lines.push('');
  lines.push('Constraints:');
  lines.push('- yarn compile must pass with 0 errors');
  lines.push('- Do not modify unrelated code');
  lines.push('- Commit with prefix "fix:"');
  lines.push('- If you cannot fix it, explain why and do not commit');

  return {
    definition,
    prompt: lines.join('\n'),
  };
}

export function getStrategy(name: string): StrategyDef | undefined {
  return STRATEGIES[name];
}

export function listStrategies(): string[] {
  return Object.keys(STRATEGIES);
}

export function printStrategy(name: string): string {
  const strategy = STRATEGIES[name];
  if (!strategy) return `Unknown strategy: ${name}`;

  const lines: string[] = [
    `Strategy: ${name}`,
    `  Max attempts: ${strategy.max_attempts}`,
    `  Requires approval: ${strategy.requires_approval}`,
    `  On failure: ${strategy.on_failure.join(' → ') || 'none'}`,
    `  Steps:`,
  ];
  strategy.steps.forEach((step, i) => {
    const paramStr = Object.keys(step.params).length > 0
      ? ` (${Object.entries(step.params).map(([k, v]) => `${k}=${v}`).join(', ')})`
      : '';
    lines.push(`    ${i + 1}. ${step.type}${paramStr}`);
  });
  return lines.join('\n');
}
