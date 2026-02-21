/**
 * TARX Error Taxonomy — Classification engine.
 * Matches error messages against known patterns and extracts context.
 */

export interface TaxonomyNode {
  id: string;
  signatures: RegExp[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  strategy: string;
  extractors: Record<string, RegExp>;
}

export interface ClassificationResult {
  node: TaxonomyNode;
  extracted: Record<string, string>;
  confidence: number;
}

const TAXONOMY: TaxonomyNode[] = [
  {
    id: 'build.compile',
    signatures: [/error TS\d+/, /Cannot find module/, /Type .* is not assignable/],
    severity: 'high',
    strategy: 'compile_fix',
    extractors: {
      file_path: /([^\s]+\.tsx?)\((\d+),(\d+)\)/,
      error_code: /error (TS\d+)/,
    },
  },
  {
    id: 'runtime.crash',
    signatures: [/ECONNREFUSED/, /process exited/, /FATAL/],
    severity: 'critical',
    strategy: 'health_fix',
    extractors: {
      port: /localhost:(\d+)/,
      service: /(?:llama-server|mesh|embedding)/,
    },
  },
  {
    id: 'runtime.logic',
    signatures: [/duplicate/, /empty render/, /undefined is not/],
    severity: 'medium',
    strategy: 'runtime_fix',
    extractors: {
      file_path: /at\s+.*\(([^)]+\.tsx?):\d+:\d+\)/,
    },
  },
  {
    id: 'integration.mcp',
    signatures: [/MCP.*failed/, /tool.*not found/, /schema.*mismatch/],
    severity: 'medium',
    strategy: 'integration_fix',
    extractors: {
      tool_name: /tool[:\s]+"?(\w+)"?/,
    },
  },
  {
    id: 'integration.native_module',
    signatures: [/ERR_DLOPEN_FAILED/, /MODULE_VERSION/, /node-gyp/],
    severity: 'medium',
    strategy: 'native_fix',
    extractors: {
      module_name: /(?:require|dlopen).*?['"]([^'"]+)['"]/,
    },
  },
  {
    id: 'security.exposure',
    signatures: [/token.*exposed/, /secret.*commit/, /api.key/i],
    severity: 'critical',
    strategy: 'security_fix',
    extractors: {},
  },
  {
    id: 'build.lint',
    signatures: [/eslint/, /prettier/, /unused/],
    severity: 'low',
    strategy: 'lint_fix',
    extractors: {
      file_path: /([^\s]+\.tsx?)/,
    },
  },
];

const FALLBACK_NODE: TaxonomyNode = {
  id: 'general',
  signatures: [],
  severity: 'medium',
  strategy: 'general_fix',
  extractors: {},
};

export function classify(errorMessage: string, _context?: string): ClassificationResult {
  let bestMatch: TaxonomyNode | null = null;
  let bestScore = 0;

  for (const node of TAXONOMY) {
    let matchCount = 0;
    for (const sig of node.signatures) {
      if (sig.test(errorMessage)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      const score = matchCount / node.signatures.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = node;
      }
    }
  }

  if (!bestMatch) {
    return {
      node: FALLBACK_NODE,
      extracted: {},
      confidence: 0.3,
    };
  }

  // Extract variables
  const extracted: Record<string, string> = {};
  for (const [key, regex] of Object.entries(bestMatch.extractors)) {
    const match = errorMessage.match(regex);
    if (match && match[1]) {
      extracted[key] = match[1];
    }
  }

  // Confidence: full match on all signatures = 1.0, partial = proportional, min 0.5
  const confidence = Math.max(0.5, bestScore);

  return { node: bestMatch, extracted, confidence };
}

export function getTaxonomy(): TaxonomyNode[] {
  return TAXONOMY;
}

export function printTaxonomyTree(): string {
  const lines: string[] = ['TARX Error Taxonomy', ''];
  for (const node of TAXONOMY) {
    const icon = node.severity === 'critical' ? '!!' : node.severity === 'high' ? '!' : node.severity === 'medium' ? '*' : '-';
    lines.push(`  [${icon}] ${node.id} (${node.severity}) → ${node.strategy}`);
    for (const sig of node.signatures) {
      lines.push(`      /${sig.source}/`);
    }
  }
  lines.push(`  [-] general (fallback) → general_fix`);
  return lines.join('\n');
}
