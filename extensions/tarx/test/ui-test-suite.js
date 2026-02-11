#!/usr/bin/env node
/**
 * Workbench V1 - Comprehensive UI Test Suite
 * Tests actual UI via test harness endpoints
 *
 * Prerequisites:
 * 1. VS Code with TARX extension loaded and reloaded after changes
 * 2. Test harness running on localhost:11439
 * 3. At least one project in the database
 *
 * Usage:
 *   node test/ui-test-suite.js
 */

const BASE_URL = 'http://localhost:11439';

// Test utilities
async function testAPI(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const data = await response.json();
    return { success: response.ok, status: response.status, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test suite
const tests = [];
const results = { passed: 0, failed: 0, skipped: 0, errors: [] };

function test(name, fn) {
  tests.push({ name, fn });
}

// ============================================================================
// TEST 1: TEST HARNESS CONNECTIVITY
// ============================================================================

test('Test harness is running', async () => {
  const { success, data } = await testAPI('/status');
  assert(success, 'Test harness not responding');
  assert(data.connection, 'No connection info in status');
  console.log(`  Server status: ${data.connection.status}`);
  console.log(`  Health latency: ${data.connection.latencyMs}ms`);
});

// ============================================================================
// TEST 2: UI COMPONENTS ENDPOINT
// ============================================================================

test('UI components endpoint returns data', async () => {
  const { success, data } = await testAPI('/ui/components');
  assert(success, 'UI components endpoint failed');
  assert(data.components, 'No components in response');

  console.log(`  Projects view: ${data.components.projectsView.id}`);
  console.log(`  Conversations view: ${data.components.conversationsView.id}`);
  console.log(`  Panel open: ${data.panelOpen}`);
});

// ============================================================================
// TEST 3: PROJECT LISTING
// ============================================================================

test('Projects can be listed', async () => {
  const { success, data } = await testAPI('/project/list');
  assert(success, 'Project list failed');
  assert(Array.isArray(data.projects), 'Projects is not an array');

  console.log(`  Found ${data.projects.length} projects`);
  if (data.projects.length > 0) {
    console.log(`  First project: ${data.projects[0].name}`);
  }
});

// ============================================================================
// TEST 4: PROJECT PANEL OPEN
// ============================================================================

test('Project panel can be opened', async () => {
  // First get a project ID
  const { data: listData } = await testAPI('/project/list');
  if (!listData.projects || listData.projects.length === 0) {
    console.log('  ⚠️ No projects available - skipping');
    results.skipped++;
    return;
  }

  const projectId = listData.projects[0].id;

  // Open panel via command
  const { success } = await testAPI('/ui/command', {
    method: 'POST',
    body: JSON.stringify({
      command: 'tarx.openProjectContext',
      args: [projectId]
    })
  });

  assert(success, 'Failed to execute panel open command');

  // Wait for panel to open
  await sleep(500);

  // Check panel state
  const { data: state } = await testAPI('/ui/panel/state');
  console.log(`  Panel open: ${state.panelOpen}`);
  if (state.state) {
    console.log(`  Project: ${state.state.projectName || 'Unknown'}`);
    console.log(`  Active tab: ${state.state.activeTab}`);
  }
});

// ============================================================================
// TEST 5: TAB SWITCHING
// ============================================================================

test('Panel tabs can be switched', async () => {
  const { data: initialState } = await testAPI('/ui/panel/state');
  if (!initialState.panelOpen) {
    console.log('  ⚠️ Panel not open - skipping');
    results.skipped++;
    return;
  }

  const tabs = ['conversations', 'sources', 'memory'];

  for (const tab of tabs) {
    const { success, data } = await testAPI('/ui/panel/tab', {
      method: 'POST',
      body: JSON.stringify({ tab })
    });

    assert(success, `Failed to switch to ${tab} tab`);
    assert(data.activeTab === tab, `Tab not switched to ${tab}`);
    console.log(`  ✓ Switched to ${tab}`);
  }
});

// ============================================================================
// TEST 6: COMMAND EXECUTION
// ============================================================================

test('VS Code commands can be executed', async () => {
  const commands = [
    { cmd: 'tarx.projects.refresh', name: 'Refresh projects' },
    { cmd: 'workbench.action.chat.open', name: 'Open chat' }
  ];

  for (const { cmd, name } of commands) {
    const start = Date.now();
    const { success, data } = await testAPI('/ui/command', {
      method: 'POST',
      body: JSON.stringify({ command: cmd })
    });

    const latency = Date.now() - start;
    assert(success, `Command ${cmd} failed: ${data?.error || 'unknown'}`);
    console.log(`  ✓ ${name} (${latency}ms)`);
  }
});

// ============================================================================
// TEST 7: CHAT FLOW
// ============================================================================

test('Chat message can be sent', async () => {
  const testMessage = 'Hello, this is a UI test message';

  const start = Date.now();
  const { success, data } = await testAPI('/chat/send', {
    method: 'POST',
    body: JSON.stringify({
      message: testMessage,
      stream: false
    })
  });
  const latency = Date.now() - start;

  assert(success, `Chat send failed: ${data?.error || 'unknown'}`);
  assert(data.response, 'No response from chat');

  console.log(`  Message sent: "${testMessage.substring(0, 30)}..."`);
  console.log(`  Response: "${(data.response.content || '').substring(0, 50)}..."`);
  console.log(`  Latency: ${latency}ms`);
});

// ============================================================================
// TEST 8: DATABASE STATS
// ============================================================================

test('Database stats are accessible', async () => {
  const { success, data } = await testAPI('/database/stats');
  assert(success, 'Database stats failed');
  assert(data.stats, 'No stats in response');

  console.log(`  Spaces: ${data.stats.spaces}`);
  console.log(`  Sessions: ${data.stats.sessions}`);
  console.log(`  Messages: ${data.stats.messages}`);
  console.log(`  Files: ${data.stats.files}`);
});

// ============================================================================
// TEST 9: PERFORMANCE BENCHMARKS
// ============================================================================

test('Performance benchmarks', async () => {
  const benchmarks = [];

  // Status check
  let start = Date.now();
  await testAPI('/status');
  benchmarks.push({ op: 'status', time: Date.now() - start, target: 100 });

  // Project list
  start = Date.now();
  await testAPI('/project/list');
  benchmarks.push({ op: 'project_list', time: Date.now() - start, target: 200 });

  // Database stats
  start = Date.now();
  await testAPI('/database/stats');
  benchmarks.push({ op: 'db_stats', time: Date.now() - start, target: 100 });

  // UI components
  start = Date.now();
  await testAPI('/ui/components');
  benchmarks.push({ op: 'ui_components', time: Date.now() - start, target: 100 });

  let allPassed = true;
  for (const bench of benchmarks) {
    const status = bench.time <= bench.target ? '✓' : '⚠️';
    if (bench.time > bench.target) allPassed = false;
    console.log(`  ${status} ${bench.op}: ${bench.time}ms (target: <${bench.target}ms)`);
  }

  if (!allPassed) {
    console.log('  Note: Some operations exceeded targets but are not blocking');
  }
});

// ============================================================================
// RUN ALL TESTS
// ============================================================================

async function runTests() {
  console.log('\n🧪 Workbench V1 - UI Test Suite\n');
  console.log('='.repeat(60));
  console.log(`Testing against: ${BASE_URL}`);
  console.log('='.repeat(60));

  for (const { name, fn } of tests) {
    try {
      console.log(`\n📋 ${name}`);
      await fn();
      results.passed++;
    } catch (error) {
      console.error(`❌ FAILED: ${error.message}`);
      results.failed++;
      results.errors.push({ test: name, error: error.message });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Results:');
  console.log(`   Passed:  ${results.passed}`);
  console.log(`   Failed:  ${results.failed}`);
  console.log(`   Skipped: ${results.skipped}`);
  console.log(`   Total:   ${tests.length}`);

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.errors.forEach(({ test, error }) => {
      console.log(`   • ${test}`);
      console.log(`     ${error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    if (results.skipped > 0) {
      console.log(`   (${results.skipped} tests skipped due to missing prerequisites)`);
    }
  }
}

// Run if executed directly
runTests().catch(error => {
  console.error('\n💥 Test suite crashed:', error.message);
  process.exit(1);
});
