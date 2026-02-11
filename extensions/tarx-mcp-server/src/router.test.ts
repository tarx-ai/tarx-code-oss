/**
 * TARX Router Tests
 *
 * Tests the intent classification to ensure proper routing.
 * Run: npx ts-node src/router.test.ts
 */

import { classifyIntent, type RouteDecision } from './router.js';

interface TestCase {
  message: string;
  expected: 'local' | 'network';
  description: string;
}

const testCases: TestCase[] = [
  // LOCAL - Questions and conversation
  { message: "What is a closure?", expected: "local", description: "Simple question" },
  { message: "Explain this error", expected: "local", description: "Explanation request" },
  { message: "How does git rebase work?", expected: "local", description: "Question about git" },
  { message: "What does this function do?", expected: "local", description: "Code question" },
  { message: "Tell me about React hooks", expected: "local", description: "Learning question" },
  { message: "Why is my code slow?", expected: "local", description: "Debugging question" },

  // NETWORK - Actions
  { message: "Create a React component for auth", expected: "network", description: "Create component" },
  { message: "Fix this error", expected: "network", description: "Fix action" },
  { message: "Rebase main onto feature", expected: "network", description: "Git action" },
  { message: "Write a function to parse JSON", expected: "network", description: "Write code" },
  { message: "Run npm test", expected: "network", description: "Run command" },
  { message: "Build the project", expected: "network", description: "Build action" },
  { message: "Commit these changes", expected: "network", description: "Git commit" },
  { message: "Deploy to production", expected: "network", description: "Deploy action" },
  { message: "Refactor the auth module", expected: "network", description: "Refactor action" },
  { message: "Set up a new project", expected: "network", description: "Setup action" },
  { message: "Check sentry for errors", expected: "network", description: "MCP tool" },

  // Explicit overrides
  { message: "use claude to explain closures", expected: "network", description: "Explicit network" },
  { message: "use local to answer this question", expected: "local", description: "Explicit local" },
];

function runTests(): void {
  console.log("TARX Router Classification Tests\n");
  console.log("=".repeat(60) + "\n");

  let passed = 0;
  let failed = 0;
  const failedTests: { message: string; expected: string; got: string; description: string }[] = [];

  const startTime = performance.now();

  for (const tc of testCases) {
    const result = classifyIntent(tc.message);
    const success = result.route === tc.expected;

    if (success) {
      passed++;
      console.log(`\u2713 ${tc.description}`);
      console.log(`  "${tc.message.slice(0, 40)}${tc.message.length > 40 ? '...' : ''}"`);
      console.log(`  Route: ${result.route} (${result.reason})\n`);
    } else {
      failed++;
      failedTests.push({
        message: tc.message,
        expected: tc.expected,
        got: result.route,
        description: tc.description
      });
      console.log(`\u2717 ${tc.description}`);
      console.log(`  "${tc.message.slice(0, 40)}${tc.message.length > 40 ? '...' : ''}"`);
      console.log(`  Expected: ${tc.expected}, Got: ${result.route}`);
      console.log(`  Reason: ${result.reason}\n`);
    }
  }

  const elapsed = performance.now() - startTime;

  console.log("=".repeat(60));
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  console.log(`Time: ${elapsed.toFixed(2)}ms (${(elapsed / testCases.length).toFixed(3)}ms per test)\n`);

  if (failedTests.length > 0) {
    console.log("Failed tests:");
    for (const ft of failedTests) {
      console.log(`  - ${ft.description}: expected ${ft.expected}, got ${ft.got}`);
    }
  }

  // Exit with error code if tests failed
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
