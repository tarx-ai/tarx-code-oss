"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeCode = analyzeCode;
exports.formatIssuesForResponse = formatIssuesForResponse;
exports.extractCodeBlocks = extractCodeBlocks;
exports.analyzeUserCode = analyzeUserCode;
/**
 * Security patterns to detect
 */
const SECURITY_PATTERNS = [
    {
        pattern: /eval\s*\(/gi,
        message: 'Use of eval() can lead to code injection',
        severity: 'high',
        suggestion: 'Consider using JSON.parse() or a safer alternative'
    },
    {
        pattern: /innerHTML\s*=/gi,
        message: 'Direct innerHTML assignment can lead to XSS',
        severity: 'high',
        suggestion: 'Use textContent or sanitize the HTML first'
    },
    {
        pattern: /document\.write\s*\(/gi,
        message: 'document.write() can overwrite the entire document',
        severity: 'medium',
        suggestion: 'Use DOM manipulation methods instead'
    },
    {
        pattern: /\$\{.*\}\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP)/gi,
        message: 'Possible SQL injection via string interpolation',
        severity: 'high',
        suggestion: 'Use parameterized queries instead'
    },
    {
        pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi,
        message: 'Hardcoded password detected',
        severity: 'high',
        suggestion: 'Use environment variables or a secrets manager'
    },
    {
        pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi,
        message: 'Hardcoded API key detected',
        severity: 'high',
        suggestion: 'Use environment variables'
    },
    {
        pattern: /https?:\/\/[^\s'"]+\?[^\s'"]*(?:password|token|key|secret)=/gi,
        message: 'Sensitive data in URL query string',
        severity: 'high',
        suggestion: 'Pass sensitive data in request body or headers'
    },
    {
        pattern: /dangerouslySetInnerHTML/gi,
        message: 'dangerouslySetInnerHTML can lead to XSS if not sanitized',
        severity: 'medium',
        suggestion: 'Ensure content is sanitized before rendering'
    }
];
/**
 * Performance patterns to detect
 */
const PERFORMANCE_PATTERNS = [
    {
        pattern: /document\.querySelector(?:All)?\s*\([^)]+\)/gi,
        message: 'DOM query inside what might be a loop',
        severity: 'medium',
        suggestion: 'Cache DOM references outside loops'
    },
    {
        pattern: /new\s+RegExp\s*\([^)]+\)/gi,
        message: 'Creating RegExp inside what might be a loop',
        severity: 'low',
        suggestion: 'Define regex once outside the loop'
    },
    {
        pattern: /JSON\.parse\s*\(\s*JSON\.stringify/gi,
        message: 'JSON.parse(JSON.stringify()) for deep cloning is slow',
        severity: 'low',
        suggestion: 'Use structuredClone() or a proper cloning library'
    },
    {
        pattern: /\.forEach\s*\([^)]*async/gi,
        message: 'async callback in forEach does not wait for completion',
        severity: 'medium',
        suggestion: 'Use for...of with await, or Promise.all() with map()'
    }
];
/**
 * Bug/error patterns to detect
 */
const BUG_PATTERNS = [
    {
        pattern: /==\s*null\b|null\s*==/gi,
        message: 'Loose equality with null also matches undefined',
        severity: 'low',
        suggestion: 'Use === null or == null intentionally for both'
    },
    {
        pattern: /typeof\s+\w+\s*===?\s*['"]undefined['"]/gi,
        message: 'typeof check for undefined - consider optional chaining',
        severity: 'low',
        suggestion: 'Modern JS: use ?. and ?? operators'
    },
    {
        pattern: /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/gi,
        message: 'Empty catch block silently swallows errors',
        severity: 'medium',
        suggestion: 'At minimum, log the error for debugging'
    },
    {
        pattern: /\.then\s*\([^)]+\)\s*(?!\.catch)/gi,
        message: 'Promise chain without .catch() handler',
        severity: 'medium',
        suggestion: 'Add .catch() or use try/catch with async/await'
    },
    {
        pattern: /new\s+Date\s*\(\s*['"][^'"]+['"]\s*\)/gi,
        message: 'Date parsing from string is browser-dependent',
        severity: 'low',
        suggestion: 'Use a date library or ISO 8601 format'
    }
];
/**
 * Deprecated patterns to detect
 */
const DEPRECATED_PATTERNS = [
    {
        pattern: /componentWillMount|componentWillReceiveProps|componentWillUpdate/gi,
        message: 'Deprecated React lifecycle method',
        severity: 'medium',
        suggestion: 'Use componentDidMount, getDerivedStateFromProps, or hooks',
        language: 'javascript'
    },
    {
        pattern: /\bvar\s+/gi,
        message: 'var is function-scoped, not block-scoped',
        severity: 'low',
        suggestion: 'Use const or let instead'
    },
    {
        pattern: /arguments\[/gi,
        message: 'arguments object is deprecated in strict mode',
        severity: 'low',
        suggestion: 'Use rest parameters (...args)'
    }
];
/**
 * Analyze code for potential issues
 */
function analyzeCode(code, language) {
    const issues = [];
    // Security checks
    for (const { pattern, message, severity, suggestion } of SECURITY_PATTERNS) {
        if (pattern.test(code)) {
            issues.push({
                type: 'security',
                severity,
                message,
                suggestion
            });
        }
        // Reset regex lastIndex
        pattern.lastIndex = 0;
    }
    // Performance checks
    for (const { pattern, message, severity, suggestion } of PERFORMANCE_PATTERNS) {
        if (pattern.test(code)) {
            issues.push({
                type: 'performance',
                severity,
                message,
                suggestion
            });
        }
        pattern.lastIndex = 0;
    }
    // Bug checks
    for (const { pattern, message, severity, suggestion } of BUG_PATTERNS) {
        if (pattern.test(code)) {
            issues.push({
                type: 'bug',
                severity,
                message,
                suggestion
            });
        }
        pattern.lastIndex = 0;
    }
    // Deprecated pattern checks
    for (const check of DEPRECATED_PATTERNS) {
        // Skip if language-specific and doesn't match
        if (check.language && language && !isLanguageMatch(language, check.language)) {
            continue;
        }
        if (check.pattern.test(code)) {
            issues.push({
                type: 'deprecated',
                severity: check.severity,
                message: check.message,
                suggestion: check.suggestion
            });
        }
        check.pattern.lastIndex = 0;
    }
    // Deduplicate issues
    return deduplicateIssues(issues);
}
/**
 * Check if a language matches (handles aliases)
 */
function isLanguageMatch(actual, expected) {
    const aliases = {
        'javascript': ['js', 'jsx', 'mjs', 'cjs'],
        'typescript': ['ts', 'tsx', 'mts', 'cts'],
        'python': ['py'],
        'ruby': ['rb'],
    };
    const actualLower = actual.toLowerCase();
    const expectedLower = expected.toLowerCase();
    if (actualLower === expectedLower)
        return true;
    const expectedAliases = aliases[expectedLower] || [];
    return expectedAliases.includes(actualLower);
}
/**
 * Remove duplicate issues
 */
function deduplicateIssues(issues) {
    const seen = new Set();
    return issues.filter(issue => {
        const key = `${issue.type}:${issue.message}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
/**
 * Format issues as a brief note to append to responses
 */
function formatIssuesForResponse(issues) {
    if (issues.length === 0)
        return null;
    // Only show high-severity issues proactively
    const highSeverity = issues.filter(i => i.severity === 'high');
    if (highSeverity.length === 0)
        return null;
    const lines = highSeverity.slice(0, 3).map(issue => {
        return `- ${issue.message}${issue.suggestion ? ` (${issue.suggestion})` : ''}`;
    });
    return `\n\n**Also noticed:**\n${lines.join('\n')}\n\nWant me to address these?`;
}
/**
 * Extract code blocks from markdown text
 */
function extractCodeBlocks(text) {
    const blocks = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
        blocks.push({
            language: match[1],
            code: match[2]
        });
    }
    return blocks;
}
/**
 * Analyze code blocks in a user message and return issues
 */
function analyzeUserCode(message) {
    const blocks = extractCodeBlocks(message);
    const allIssues = [];
    for (const block of blocks) {
        const issues = analyzeCode(block.code, block.language);
        allIssues.push(...issues);
    }
    return deduplicateIssues(allIssues);
}
//# sourceMappingURL=codeAnalysis.js.map