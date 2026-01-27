#!/usr/bin/env node
"use strict";
/*---------------------------------------------------------------------------------------------
 *  TARX-DEV CLI - Developer testing tool for TARX features
 *  Usage:
 *    tarx-dev chat "message"      - Test system prompt + history + features
 *    tarx-dev test                - Run all validation tests
 *    tarx-dev benchmark           - Performance baseline
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// Import from extension source (adapted for CLI)
const systemPrompt_1 = require("../extensions/tarx/src/systemPrompt");
const codeAnalysis_1 = require("../extensions/tarx/src/codeAnalysis");
const testRunner_1 = require("./utils/testRunner");
const mockLLM_1 = require("./utils/mockLLM");
class CLIDatabase {
    dbPath;
    data;
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.data = this.load();
    }
    load() {
        try {
            if (fs.existsSync(this.dbPath)) {
                return JSON.parse(fs.readFileSync(this.dbPath, 'utf-8'));
            }
        }
        catch (e) {
            // Ignore load errors
        }
        return { conversations: [] };
    }
    save() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
    }
    addTurn(turn) {
        this.data.conversations.push({
            ...turn,
            timestamp: Date.now()
        });
        this.save();
    }
    getRecentTurns(limit = 10) {
        return this.data.conversations.slice(-limit);
    }
    clear() {
        this.data.conversations = [];
        this.save();
    }
}
class RealLLMClient {
    serverUrl;
    constructor(serverUrl = 'http://localhost:11435') {
        this.serverUrl = serverUrl;
    }
    async isOnline() {
        try {
            const response = await fetch(`${this.serverUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    async chat(messages, options) {
        const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages,
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens ?? 2048,
                stream: false
            }),
            signal: AbortSignal.timeout(30000) // 30 second timeout
        });
        if (!response.ok) {
            throw new Error(`LLM request failed: ${response.status}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }
}
// ============================================
// CHAT Command
// ============================================
async function cmdChat(message, options) {
    const historyLimit = options.history ?? 10;
    const verbose = options.verbose ?? false;
    console.log('\n' + '='.repeat(60));
    console.log('TARX-DEV CHAT');
    console.log('='.repeat(60));
    // Initialize database
    const dbPath = path.join(process.cwd(), '.tarx-dev', 'history.json');
    const db = new CLIDatabase(dbPath);
    // Initialize LLM client
    const realClient = new RealLLMClient();
    const isOnline = await realClient.isOnline();
    const llm = isOnline ? realClient : new mockLLM_1.MockLLM();
    console.log(`\nLLM: ${isOnline ? 'llama-server (online)' : 'Mock LLM (offline)'}`);
    // Start timing
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    // Normalize transcription (voice input handling)
    const normalizedMessage = (0, systemPrompt_1.normalizeTranscription)(message);
    if (normalizedMessage !== message && verbose) {
        console.log(`\nVoice normalization: "${message}" → "${normalizedMessage}"`);
    }
    // Check for vague request
    if ((0, systemPrompt_1.isVagueRequest)(normalizedMessage)) {
        const clarification = (0, systemPrompt_1.getClarificationForVagueRequest)(normalizedMessage);
        console.log('\n[VAGUE REQUEST DETECTED]');
        console.log('TARX asks for specifics:\n');
        console.log(clarification);
        console.log('\n' + '-'.repeat(40));
        console.log('✅ Vague detection: WORKING');
        return;
    }
    // Problem spotting on code in message
    const codeIssues = (0, codeAnalysis_1.analyzeUserCode)(normalizedMessage);
    if (codeIssues.length > 0 && verbose) {
        console.log(`\n[PROBLEM SPOTTING] Found ${codeIssues.length} issues:`);
        for (const issue of codeIssues) {
            console.log(`  - [${issue.severity}] ${issue.message}`);
        }
    }
    // Load conversation history
    const recentTurns = db.getRecentTurns(historyLimit);
    if (recentTurns.length > 0 && verbose) {
        console.log(`\n[HISTORY] Loaded ${recentTurns.length} turns`);
    }
    // Build messages array
    const messages = [];
    // Add system prompt
    messages.push({
        role: 'system',
        content: systemPrompt_1.TARX_SYSTEM_PROMPT
    });
    // Add history
    for (const turn of recentTurns) {
        if (turn.role !== 'system') {
            messages.push({
                role: turn.role,
                content: turn.content
            });
        }
    }
    // Add current message
    messages.push({
        role: 'user',
        content: normalizedMessage
    });
    // Call LLM
    console.log('\n[SENDING TO LLM...]');
    let response;
    try {
        response = await llm.chat(messages);
    }
    catch (error) {
        console.error('\nError:', error instanceof Error ? error.message : 'Unknown error');
        return;
    }
    // Append problem spotting notes if any high-severity issues
    const issuesNote = (0, codeAnalysis_1.formatIssuesForResponse)(codeIssues);
    if (issuesNote) {
        response += issuesNote;
    }
    // End timing
    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;
    // Save to history
    db.addTurn({ role: 'user', content: normalizedMessage });
    db.addTurn({ role: 'assistant', content: response });
    // Output
    console.log('\n' + '-'.repeat(60));
    console.log('RESPONSE:');
    console.log('-'.repeat(60));
    console.log(response);
    console.log('-'.repeat(60));
    // Tone analysis
    const toneAnalysis = analyzeTone(response);
    console.log('\n[TONE ANALYSIS]');
    console.log(`  Direct voice: ${toneAnalysis.isDirect ? '✅ Yes' : '❌ No (corporate speak detected)'}`);
    if (!toneAnalysis.isDirect && toneAnalysis.violations.length > 0) {
        console.log(`  Violations: ${toneAnalysis.violations.join(', ')}`);
    }
    // Stats
    console.log('\n[STATS]');
    console.log(`  Response time: ${(endTime - startTime).toFixed(0)}ms`);
    console.log(`  Memory delta: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  History turns: ${recentTurns.length}`);
    console.log(`  Message tokens: ~${Math.ceil(normalizedMessage.split(/\s+/).length * 1.3)}`);
    console.log(`  Response tokens: ~${Math.ceil(response.split(/\s+/).length * 1.3)}`);
}
// ============================================
// TEST Command
// ============================================
async function cmdTest() {
    console.log('\n' + '='.repeat(60));
    console.log('TARX-DEV TESTS');
    console.log('='.repeat(60) + '\n');
    const results = await (0, testRunner_1.runAllTests)();
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const slow = results.filter(r => r.durationMs > 1000).length;
    console.log(`\n  ${passed}/${total} PASS`);
    if (slow > 0) {
        console.log(`  ${slow} SLOW (>1s)`);
    }
    // Exit code
    process.exitCode = passed === total ? 0 : 1;
}
// ============================================
// BENCHMARK Command
// ============================================
async function cmdBenchmark() {
    console.log('\n' + '='.repeat(60));
    console.log('TARX-DEV BENCHMARK');
    console.log('='.repeat(60));
    const realClient = new RealLLMClient();
    const isOnline = await realClient.isOnline();
    const llm = isOnline ? realClient : new mockLLM_1.MockLLM();
    console.log(`\nLLM: ${isOnline ? 'llama-server (online)' : 'Mock LLM (offline)'}`);
    // Baseline memory
    const baselineMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    console.log(`\nBaseline memory: ${baselineMemory.toFixed(2)}MB`);
    // Test 1: Simple question (no context)
    console.log('\n[1] Simple question (no context)...');
    const start1 = performance.now();
    await llm.chat([
        { role: 'system', content: systemPrompt_1.TARX_SYSTEM_PROMPT },
        { role: 'user', content: 'What is a variable in JavaScript?' }
    ]);
    const time1 = performance.now() - start1;
    console.log(`    Time: ${time1.toFixed(0)}ms`);
    // Test 2: With history (10 turns)
    console.log('\n[2] With history (10 turns)...');
    const historyMessages = [
        { role: 'system', content: systemPrompt_1.TARX_SYSTEM_PROMPT }
    ];
    for (let i = 0; i < 10; i++) {
        historyMessages.push({ role: 'user', content: `Previous question ${i + 1}` });
        historyMessages.push({ role: 'assistant', content: `Previous answer ${i + 1}` });
    }
    historyMessages.push({ role: 'user', content: 'New question with history' });
    const start2 = performance.now();
    await llm.chat(historyMessages);
    const time2 = performance.now() - start2;
    console.log(`    Time: ${time2.toFixed(0)}ms`);
    // Test 3: Problem spotting accuracy
    console.log('\n[3] Problem spotting accuracy...');
    const testCases = [
        { code: 'eval(userInput)', expected: 'security', desc: 'eval() detection' },
        { code: 'innerHTML = data', expected: 'security', desc: 'innerHTML detection' },
        { code: 'password = "secret123"', expected: 'security', desc: 'hardcoded password' },
        { code: 'api_key = "sk-abc123"', expected: 'security', desc: 'hardcoded API key' },
        { code: 'catch(e) {}', expected: 'bug', desc: 'empty catch block' },
        { code: '.forEach(async', expected: 'performance', desc: 'async in forEach' },
        { code: 'JSON.parse(JSON.stringify(obj))', expected: 'performance', desc: 'deep clone perf' },
        { code: 'var x = 1', expected: 'deprecated', desc: 'var usage' },
        { code: 'componentWillMount', expected: 'deprecated', desc: 'React lifecycle' },
        { code: 'const x = 1', expected: null, desc: 'clean code (no issues)' },
    ];
    let correct = 0;
    for (const tc of testCases) {
        const issues = (0, codeAnalysis_1.analyzeCode)(tc.code);
        const foundExpected = tc.expected === null
            ? issues.length === 0
            : issues.some(i => i.type === tc.expected);
        if (foundExpected) {
            correct++;
            console.log(`    ✅ ${tc.desc}`);
        }
        else {
            console.log(`    ❌ ${tc.desc} (expected: ${tc.expected || 'none'}, got: ${issues.map(i => i.type).join(', ') || 'none'})`);
        }
    }
    const accuracy = (correct / testCases.length * 100).toFixed(1);
    console.log(`    Accuracy: ${accuracy}%`);
    // Final memory
    const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('BENCHMARK RESULTS');
    console.log('='.repeat(60));
    console.log(`\n  Simple question: ${time1.toFixed(0)}ms`);
    console.log(`  With history:    ${time2.toFixed(0)}ms`);
    console.log(`  Memory baseline: ${baselineMemory.toFixed(2)}MB`);
    console.log(`  Memory peak:     ${finalMemory.toFixed(2)}MB`);
    console.log(`  Problem spotting: ${accuracy}% accuracy`);
}
function analyzeTone(response) {
    const violations = [];
    // Corporate speak patterns to detect
    const corporatePatterns = [
        { pattern: /^(Certainly|Absolutely|Of course)!?/i, name: 'Starts with filler' },
        { pattern: /I'd be happy to help/i, name: '"Happy to help"' },
        { pattern: /I regret to inform/i, name: 'Corporate regret' },
        { pattern: /leverage/i, name: 'Uses "leverage"' },
        { pattern: /synergy/i, name: 'Uses "synergy"' },
        { pattern: /actionable/i, name: 'Uses "actionable"' },
        { pattern: /Great question!/i, name: '"Great question"' },
        { pattern: /That's a great/i, name: 'Excessive praise' },
        { pattern: /I apologize for any inconvenience/i, name: 'Over-apologetic' },
    ];
    for (const { pattern, name } of corporatePatterns) {
        if (pattern.test(response)) {
            violations.push(name);
        }
    }
    return {
        isDirect: violations.length === 0,
        violations
    };
}
// ============================================
// CLI Entry Point
// ============================================
function printUsage() {
    console.log(`
TARX-DEV CLI - Developer testing tool

Usage:
  tarx-dev chat "message"     Test system prompt + history + features
  tarx-dev test               Run all validation tests
  tarx-dev benchmark          Performance baseline

Options:
  --history N                 Load N turns of history (default: 10)
  --verbose                   Show detailed output
  --help                      Show this help

Examples:
  tarx-dev chat "Make this code better"
  tarx-dev chat "Add error handling" --history 5
  tarx-dev test
  tarx-dev benchmark
`);
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        return;
    }
    const command = args[0];
    switch (command) {
        case 'chat': {
            const message = args[1];
            if (!message) {
                console.error('Error: chat command requires a message');
                console.error('Usage: tarx-dev chat "your message here"');
                process.exitCode = 1;
                return;
            }
            // Parse options
            const historyIdx = args.indexOf('--history');
            const history = historyIdx !== -1 ? parseInt(args[historyIdx + 1], 10) : 10;
            const verbose = args.includes('--verbose') || args.includes('-v');
            await cmdChat(message, { history, verbose });
            break;
        }
        case 'test':
            await cmdTest();
            break;
        case 'benchmark':
            await cmdBenchmark();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            printUsage();
            process.exitCode = 1;
    }
}
main().catch(error => {
    console.error('Fatal error:', error);
    process.exitCode = 1;
});
//# sourceMappingURL=tarx-dev.js.map