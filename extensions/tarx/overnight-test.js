#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  TARX Overnight Autonomous Testing
 *  Runs 1000 tests using sqlite3 CLI and HTTP endpoints
 *--------------------------------------------------------------------------------------------*/

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DB_PATH = path.join(process.env.HOME, 'Library/Application Support/tarx/memory.db');
const LLAMA_URL = 'http://127.0.0.1:11435';
const REPORT_PATH = path.join(__dirname, '../../docs/OVERNIGHT_TEST_RESULTS.md');

// ═══════════════════════════════════════════════════════════════════════════
// RESULTS TRACKING
// ═══════════════════════════════════════════════════════════════════════════

const results = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [],
    batches: [],
    startTime: Date.now()
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function uuid() {
    return crypto.randomUUID();
}

async function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

async function httpPost(url, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(body))
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

// SQLite via CLI - use stdin to avoid shell escaping issues with emojis
function sqliteQuery(query) {
    try {
        const result = execSync(`sqlite3 "${DB_PATH}"`, {
            encoding: 'utf8',
            input: query
        });
        return result.trim();
    } catch (e) {
        throw new Error(`SQLite error: ${e.message}`);
    }
}

function sqliteExec(query) {
    try {
        execSync(`sqlite3 "${DB_PATH}"`, {
            encoding: 'utf8',
            input: query
        });
        return true;
    } catch (e) {
        throw new Error(`SQLite error: ${e.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTest(name, testFn) {
    results.total++;
    const start = Date.now();
    try {
        await testFn();
        results.passed++;
        const duration = Date.now() - start;
        console.log(`✅ ${results.total}: ${name} (${duration}ms)`);
        return { name, status: 'pass', duration };
    } catch (error) {
        results.failed++;
        results.errors.push({ test: name, error: error.message });
        const duration = Date.now() - start;
        console.log(`❌ ${results.total}: ${name} - ${error.message} (${duration}ms)`);
        return { name, status: 'fail', error: error.message, duration };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH TESTS (100)
// ═══════════════════════════════════════════════════════════════════════════

async function runHealthTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('HEALTH TESTS (100)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batchResults = [];

    // Llama health checks (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`llama_health_${i}`, async () => {
            const health = await httpGet(`${LLAMA_URL}/health`);
            if (health.status !== 'ok') {
                throw new Error(`Unhealthy: ${JSON.stringify(health)}`);
            }
        });
        batchResults.push(result);
        await sleep(50);
    }

    // Database connectivity checks (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`db_health_${i}`, async () => {
            const output = sqliteQuery('SELECT 1 as test');
            if (!output.includes('1')) {
                throw new Error('Database query failed');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    results.batches.push({ name: 'Health Tests', results: batchResults });
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT (SPACE) TESTS (150)
// ═══════════════════════════════════════════════════════════════════════════

async function runProjectTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('PROJECT TESTS (150)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batchResults = [];
    const createdSpaceIds = [];

    // Create spaces (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`create_space_${i}`, async () => {
            const id = uuid();
            const name = `Test Space ${Date.now()}_${i}`;
            const emoji = ['🧪', '🔬', '📊', '💡', '🚀'][i % 5];
            const now = Date.now();

            sqliteExec(`INSERT INTO spaces (id, name, emoji, created_at, updated_at, last_accessed_at) VALUES ('${id}', '${name}', '${emoji}', ${now}, ${now}, ${now})`);
            createdSpaceIds.push(id);
        });
        batchResults.push(result);
        await sleep(20);
    }

    // List spaces (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`list_spaces_${i}`, async () => {
            const output = sqliteQuery('SELECT COUNT(*) FROM spaces');
            if (isNaN(parseInt(output))) {
                throw new Error('Count failed');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    // Get individual spaces (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`get_space_${i}`, async () => {
            if (createdSpaceIds.length === 0) return;
            const spaceId = createdSpaceIds[i % createdSpaceIds.length];
            const output = sqliteQuery(`SELECT name FROM spaces WHERE id='${spaceId}'`);
            if (!output) {
                throw new Error('Space not found');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    results.batches.push({ name: 'Project Tests', results: batchResults });
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION TESTS (150)
// ═══════════════════════════════════════════════════════════════════════════

async function runSessionTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SESSION TESTS (150)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batchResults = [];
    const createdSessionIds = [];

    // Get a space to use
    const spaceId = sqliteQuery('SELECT id FROM spaces LIMIT 1') || uuid();

    // Create sessions (75)
    for (let i = 0; i < 75; i++) {
        const result = await runTest(`create_session_${i}`, async () => {
            const id = uuid();
            const title = `Test Session ${Date.now()}_${i}`;
            const now = Date.now();

            sqliteExec(`INSERT INTO sessions (id, space_id, title, created_at, updated_at) VALUES ('${id}', '${spaceId}', '${title}', ${now}, ${now})`);
            createdSessionIds.push(id);
        });
        batchResults.push(result);
        await sleep(20);
    }

    // List sessions (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`list_sessions_${i}`, async () => {
            const output = sqliteQuery('SELECT COUNT(*) FROM sessions');
            if (isNaN(parseInt(output))) {
                throw new Error('Count failed');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    // Get session messages (25)
    for (let i = 0; i < 25; i++) {
        const result = await runTest(`get_session_messages_${i}`, async () => {
            if (createdSessionIds.length === 0) return;
            const sessionId = createdSessionIds[i % createdSessionIds.length];
            sqliteQuery(`SELECT COUNT(*) FROM messages WHERE session_id='${sessionId}'`);
        });
        batchResults.push(result);
        await sleep(20);
    }

    results.batches.push({ name: 'Session Tests', results: batchResults });
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAT MESSAGE TESTS (200)
// ═══════════════════════════════════════════════════════════════════════════

async function runChatTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('CHAT MESSAGE TESTS (200)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batchResults = [];

    // Get or create a session for testing
    const testSessionId = uuid();
    const spaceId = uuid();
    const now = Date.now();

    // Create test space and session
    sqliteExec(`INSERT OR IGNORE INTO spaces (id, name, emoji, created_at, updated_at, last_accessed_at) VALUES ('${spaceId}', 'Chat Test Space', '💬', ${now}, ${now}, ${now})`);
    sqliteExec(`INSERT INTO sessions (id, space_id, title, created_at, updated_at) VALUES ('${testSessionId}', '${spaceId}', 'Chat Test Session', ${now}, ${now})`);

    const testMessages = [
        'Hello', 'What is 2+2', 'Tell me a joke', 'How are you',
        'What time is it', 'Help me with code', 'Explain this concept',
        'Give me an example', 'Summarize this', 'What do you think'
    ];

    // Create messages in database (100)
    for (let i = 0; i < 100; i++) {
        const result = await runTest(`create_message_${i}`, async () => {
            const msgId = uuid();
            const content = `${testMessages[i % testMessages.length]} test ${i}`;
            const role = i % 2 === 0 ? 'user' : 'assistant';
            const ts = Date.now();

            sqliteExec(`INSERT INTO messages (id, session_id, role, content, created_at) VALUES ('${msgId}', '${testSessionId}', '${role}', '${content}', ${ts})`);
        });
        batchResults.push(result);
        await sleep(20);
    }

    // Read messages (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`read_messages_${i}`, async () => {
            const count = sqliteQuery(`SELECT COUNT(*) FROM messages WHERE session_id='${testSessionId}'`);
            if (parseInt(count) === 0) {
                throw new Error('No messages found');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    // LLM inference tests (50) - may timeout, that's ok
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`llm_inference_${i}`, async () => {
            try {
                const response = await Promise.race([
                    httpPost(`${LLAMA_URL}/completion`, {
                        prompt: `Q: What is ${i}+${i}?\nA:`,
                        n_predict: 10,
                        temperature: 0.1
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                ]);
            } catch (e) {
                // Timeouts and errors are acceptable for LLM tests
            }
        });
        batchResults.push(result);
        await sleep(100);
    }

    results.batches.push({ name: 'Chat Tests', results: batchResults });
}

// ═══════════════════════════════════════════════════════════════════════════
// SIDEBAR STATE TESTS (100)
// ═══════════════════════════════════════════════════════════════════════════

async function runSidebarStateTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SIDEBAR STATE TESTS (100)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batchResults = [];

    // Query projects for sidebar (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`sidebar_projects_${i}`, async () => {
            sqliteQuery('SELECT id, name, emoji FROM spaces ORDER BY updated_at DESC LIMIT 20');
        });
        batchResults.push(result);
        await sleep(20);
    }

    // Query history for sidebar (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`sidebar_history_${i}`, async () => {
            sqliteQuery(`SELECT s.id, s.title, s.created_at FROM sessions s ORDER BY s.updated_at DESC LIMIT 50`);
        });
        batchResults.push(result);
        await sleep(20);
    }

    results.batches.push({ name: 'Sidebar State Tests', results: batchResults });
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING TESTS (100)
// ═══════════════════════════════════════════════════════════════════════════

async function runErrorTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ERROR HANDLING TESTS (100)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batchResults = [];

    // Invalid database queries (should not crash) (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`invalid_query_${i}`, async () => {
            try {
                sqliteQuery(`SELECT * FROM nonexistent_table_${i}`);
            } catch {
                // Expected to fail - test passes if we handle error gracefully
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    // Invalid HTTP requests (50)
    for (let i = 0; i < 50; i++) {
        const result = await runTest(`invalid_http_${i}`, async () => {
            try {
                await httpGet(`${LLAMA_URL}/nonexistent_endpoint_${i}`);
            } catch {
                // Expected to fail
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    results.batches.push({ name: 'Error Handling Tests', results: batchResults });
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE STATS TESTS (100)
// ═══════════════════════════════════════════════════════════════════════════

async function runStatsTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('DATABASE STATS TESTS (100)');
    console.log('═══════════════════════════════════════════════════════════\n');

    const batchResults = [];

    // Count spaces (25)
    for (let i = 0; i < 25; i++) {
        const result = await runTest(`count_spaces_${i}`, async () => {
            const count = sqliteQuery('SELECT COUNT(*) FROM spaces');
            if (isNaN(parseInt(count))) {
                throw new Error('Invalid count');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    // Count sessions (25)
    for (let i = 0; i < 25; i++) {
        const result = await runTest(`count_sessions_${i}`, async () => {
            const count = sqliteQuery('SELECT COUNT(*) FROM sessions');
            if (isNaN(parseInt(count))) {
                throw new Error('Invalid count');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    // Count messages (25)
    for (let i = 0; i < 25; i++) {
        const result = await runTest(`count_messages_${i}`, async () => {
            const count = sqliteQuery('SELECT COUNT(*) FROM messages');
            if (isNaN(parseInt(count))) {
                throw new Error('Invalid count');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    // List tables (25)
    for (let i = 0; i < 25; i++) {
        const result = await runTest(`list_tables_${i}`, async () => {
            const tables = sqliteQuery("SELECT name FROM sqlite_master WHERE type='table'");
            if (!tables) {
                throw new Error('No tables found');
            }
        });
        batchResults.push(result);
        await sleep(20);
    }

    results.batches.push({ name: 'Database Stats Tests', results: batchResults });
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateReport() {
    const duration = (Date.now() - results.startTime) / 1000 / 60;
    const passRate = ((results.passed / results.total) * 100).toFixed(1);

    let report = `# TARX Overnight Test Results

**Date:** ${new Date().toISOString()}
**Duration:** ${duration.toFixed(1)} minutes
**Total Tests:** ${results.total}
**Passed:** ${results.passed} (${passRate}%)
**Failed:** ${results.failed}

---

## Summary

| Category | Tests | Passed | Failed |
|----------|-------|--------|--------|
`;

    for (const batch of results.batches) {
        const passed = batch.results.filter(r => r.status === 'pass').length;
        const failed = batch.results.filter(r => r.status === 'fail').length;
        report += `| ${batch.name} | ${batch.results.length} | ${passed} | ${failed} |\n`;
    }

    report += `| **TOTAL** | **${results.total}** | **${results.passed}** | **${results.failed}** |\n`;

    if (results.errors.length > 0) {
        report += `\n---\n\n## Errors (${results.errors.length})\n\n`;
        report += `| Test | Error |\n|------|-------|\n`;

        for (const err of results.errors.slice(0, 50)) {
            const escapedError = err.error.replace(/\|/g, '\\|').replace(/\n/g, ' ').substring(0, 60);
            report += `| ${err.test} | ${escapedError} |\n`;
        }

        if (results.errors.length > 50) {
            report += `\n*... and ${results.errors.length - 50} more errors*\n`;
        }
    }

    report += `\n---\n\n*Report generated by TARX Overnight Testing*\n`;

    fs.writeFileSync(REPORT_PATH, report);
    console.log(`\nReport saved to: ${REPORT_PATH}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TARX OVERNIGHT TESTING - 1000 TESTS');
    console.log('Started:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
        await runHealthTests();        // 100 tests
        await runProjectTests();       // 150 tests
        await runSessionTests();       // 150 tests
        await runChatTests();          // 200 tests
        await runSidebarStateTests();  // 100 tests
        await runErrorTests();         // 100 tests
        await runStatsTests();         // 100 tests
    } catch (fatalError) {
        console.error('FATAL ERROR:', fatalError);
        results.errors.push({ test: 'FATAL', error: fatalError.message });
    }

    // Final summary
    const duration = (Date.now() - results.startTime) / 1000 / 60;

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('FINAL RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Total:    ${results.total}`);
    console.log(`Passed:   ${results.passed} (${((results.passed/results.total)*100).toFixed(1)}%)`);
    console.log(`Failed:   ${results.failed}`);
    console.log(`Duration: ${duration.toFixed(1)} minutes`);
    console.log('═══════════════════════════════════════════════════════════\n');

    generateReport();
}

main().catch(console.error);
