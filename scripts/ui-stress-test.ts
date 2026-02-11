#!/usr/bin/env npx tsx
/**
 * TARX UI Stress Test - 100 Messages
 * Tests all UI rendering paths through the TARX system
 */

import * as crypto from 'crypto';

const INFERENCE_PORT = 11435;
const DB_PATH = '/Users/master/Library/Application Support/tarx/tarx.db';

// Messages array - all 100 prompts
const MESSAGES = [
  // 1-10: Basic text rendering
  "Hello",
  "What is TARX?",
  "Explain local-first AI in one sentence",
  "Why does privacy matter for AI?",
  "What programming languages do you know?",
  "Tell me a joke",
  "What day is it?",
  "Summarize what mesh networking means",
  "What is RAG?",
  "Say something short",

  // 11-20: Code blocks
  "Write a hello world in Python",
  "Write a hello world in Rust",
  "Write a hello world in TypeScript",
  "Show me a bash script that checks if a port is open",
  "Write a SQL query to find duplicate emails",
  "Write a React component that renders a button",
  "Write a CSS animation for a spinner",
  "Show me a JSON config file for a web server",
  "Write a Go function that reverses a string",
  "Write a Swift struct for a User model",

  // 21-30: Markdown formatting
  "Give me a bullet list of 5 fruits",
  "Give me a numbered list of steps to make coffee",
  "Write a paragraph with **bold** and *italic* words",
  "Create a markdown table comparing Python vs Rust vs Go",
  "Write a heading, subheading, and paragraph about AI",
  "Give me a nested bullet list: animals > mammals > dogs, cats",
  "Write text with inline code like `variable` and `function()`",
  "Create a blockquote about technology",
  "Write a checklist with checkboxes for a morning routine",
  "Give me a horizontal rule then text then another horizontal rule",

  // 31-40: Long responses
  "Write a 500 word essay about the future of local AI",
  "Explain how a CPU works in detail",
  "Write a detailed guide to setting up a home server",
  "List and explain 20 design patterns in software engineering",
  "Write a long comparison of 10 programming languages",
  "Explain the history of the internet in detail",
  "Write a detailed tutorial on building a REST API",
  "Explain machine learning from basics to advanced",
  "Write a comprehensive guide to Git commands",
  "Explain distributed systems architecture in depth",

  // 41-50: Short responses
  "Yes or no: is the sky blue?",
  "One word answer: favorite color?",
  "Reply with just a number",
  "Say ok",
  "True or false: water is wet",
  "Reply with an emoji",
  "Just say hi",
  "Answer in exactly 3 words",
  "Give me one letter",
  "Empty your mind and respond minimally",

  // 51-60: Multi-code-block responses
  "Show me the same function in Python, JavaScript, and Rust",
  "Write a Dockerfile and a docker-compose.yml for a Node app",
  "Show me a TypeScript interface and a class that implements it",
  "Write HTML, CSS, and JavaScript for a simple counter",
  "Show me a SQL schema and a query that uses it",
  "Write a test file and the function it tests in Python",
  "Show a React component and its Storybook story",
  "Write a Makefile and the C code it compiles",
  "Show me a .env file and the code that reads it",
  "Write a GraphQL schema and a resolver for it",

  // 61-70: Reasoning questions
  "What are the tradeoffs between local and cloud AI?",
  "If I have 8GB RAM, what model should I run?",
  "Compare llama.cpp vs ollama vs vllm for local inference",
  "Should I use SQLite or PostgreSQL for a local app?",
  "What is the best embedding model for semantic search?",
  "How would you architect a P2P mesh network?",
  "What are the security risks of running a local LLM?",
  "How do you handle context windows longer than 4096 tokens?",
  "What is the future of on-device AI?",
  "Explain the economics of local vs cloud compute",

  // 71-80: Edge cases
  "What about <html> tags in messages?",
  "Can you handle unicode? 你好世界 مرحبا",
  "What about a really long word like supercalifragilisticexpialidocious repeated 10 times?",
  "Render this math: E = mc²",
  "What about backticks ` inside a sentence?",
  "Handle this: { 'key': 'value', 'nested': { 'a': 1 } }",
  "What about pipes | and ampersands & and angle brackets < >?",
  "Respond with a mix of code and text and lists and headers all in one message",
  "What about URLs like https://example.com/path?query=value&other=123",
  "Handle escaped characters: \\n \\t \\r \\\\ \\\"",

  // 81-90: Conversational context
  "My name is John and I'm building TARX",
  "What did I just tell you my name was?",
  "What am I building?",
  "I like Rust and TypeScript",
  "What languages did I say I like?",
  "I'm working on a mesh network feature",
  "Summarize everything I've told you about myself",
  "What have we talked about in this conversation?",
  "How many messages have I sent you roughly?",
  "What was the first thing I said to you?",

  // 91-100: Rapid fire
  "Quick: 1+1",
  "Quick: capital of France",
  "Quick: largest planet",
  "Quick: who wrote Hamlet",
  "Quick: boiling point of water",
  "Quick: how many continents",
  "Quick: what color is grass",
  "Quick: opposite of hot",
  "Quick: fastest land animal",
  "Final message. Summarize this entire conversation in 3 bullet points."
];

interface TestResult {
  index: number;
  prompt: string;
  success: boolean;
  response: string;
  latency_ms: number;
  tokens?: { prompt_tokens?: number; completion_tokens?: number };
  error?: string;
  empty?: boolean;
  timeout?: boolean;
  truncated?: boolean;
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${INFERENCE_PORT}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function sendMessage(
  prompt: string,
  conversationHistory: Array<{role: string; content: string}>,
  maxTokens: number = 300
): Promise<{
  response: string;
  latency_ms: number;
  tokens?: { prompt_tokens?: number; completion_tokens?: number };
  error?: string;
}> {
  const start = Date.now();

  try {
    const messages = [...conversationHistory, { role: "user", content: prompt }];

    const response = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tarx-local",
        messages,
        max_tokens: maxTokens,
        stream: false
      }),
      signal: AbortSignal.timeout(120000) // 2 minute timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || "";

    return {
      response: content,
      latency_ms: Date.now() - start,
      tokens: data.usage
    };
  } catch (error: any) {
    return {
      response: "",
      latency_ms: Date.now() - start,
      error: error.name === 'TimeoutError' ? 'TIMEOUT' : error.message
    };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("TARX UI STRESS TEST - 100 MESSAGES");
  console.log("=".repeat(60));
  console.log("");

  // Step 1: Check health
  console.log("STEP 1: Checking system health...");
  const healthy = await checkHealth();
  if (!healthy) {
    console.error("ERROR: llama-server not responding on port", INFERENCE_PORT);
    process.exit(1);
  }
  console.log("✓ Inference server healthy");
  console.log("");

  // Step 2: Run all 100 messages
  console.log("STEP 2: Sending 100 messages...");
  console.log("");

  const results: TestResult[] = [];
  const conversationHistory: Array<{role: string; content: string}> = [];
  let totalLatency = 0;
  let successCount = 0;
  let failCount = 0;
  let emptyCount = 0;
  let timeoutCount = 0;
  let truncatedCount = 0;

  for (let i = 0; i < MESSAGES.length; i++) {
    const prompt = MESSAGES[i];
    const msgNum = i + 1;

    // Determine max tokens based on message type
    let maxTokens = 300;
    if (msgNum >= 31 && msgNum <= 40) {
      maxTokens = 1000; // Long responses
    } else if (msgNum >= 41 && msgNum <= 50) {
      maxTokens = 50; // Short responses
    } else if (msgNum >= 51 && msgNum <= 60) {
      maxTokens = 600; // Multi-code blocks
    } else if (msgNum >= 91 && msgNum <= 100) {
      maxTokens = 100; // Rapid fire
    }

    process.stdout.write(`[${msgNum}/100] ${prompt.substring(0, 40)}... `);

    const result = await sendMessage(prompt, conversationHistory, maxTokens);

    const testResult: TestResult = {
      index: msgNum,
      prompt,
      success: !result.error && result.response.length > 0,
      response: result.response,
      latency_ms: result.latency_ms,
      tokens: result.tokens,
      error: result.error,
      empty: result.response.length === 0 && !result.error,
      timeout: result.error === 'TIMEOUT',
      truncated: result.tokens?.completion_tokens === maxTokens
    };

    results.push(testResult);

    // Track conversation history for context tests (messages 81-90)
    if (msgNum >= 81 && msgNum <= 90) {
      conversationHistory.push({ role: "user", content: prompt });
      if (result.response) {
        conversationHistory.push({ role: "assistant", content: result.response });
      }
    }

    if (testResult.success) {
      successCount++;
      totalLatency += result.latency_ms;
      console.log(`✓ ${result.latency_ms}ms`);
    } else {
      failCount++;
      console.log(`✗ ${result.error || 'empty response'}`);
    }

    if (testResult.empty) emptyCount++;
    if (testResult.timeout) timeoutCount++;
    if (testResult.truncated) truncatedCount++;

    // Progress update every 10 messages
    if (msgNum % 10 === 0) {
      const avgLatency = successCount > 0 ? Math.round(totalLatency / successCount) : 0;
      console.log(`--- Progress: ${msgNum}/100 | Pass: ${successCount} | Fail: ${failCount} | Avg: ${avgLatency}ms ---`);
    }
  }

  // Step 3: Report results
  console.log("");
  console.log("=".repeat(60));
  console.log("FINAL RESULTS");
  console.log("=".repeat(60));
  console.log("");

  const avgLatency = successCount > 0 ? Math.round(totalLatency / successCount) : 0;

  console.log(`1. Total messages sent: 100`);
  console.log(`   - Successful: ${successCount}`);
  console.log(`   - Failed: ${failCount}`);
  console.log(`   - Success rate: ${successCount}%`);
  console.log("");

  console.log(`2. Errors encountered:`);
  const errors = results.filter(r => r.error);
  if (errors.length === 0) {
    console.log("   None");
  } else {
    for (const e of errors) {
      console.log(`   - Message ${e.index}: ${e.error}`);
    }
  }
  console.log("");

  console.log(`3. Average response time: ${avgLatency}ms`);
  console.log("");

  console.log(`4. Empty/garbage responses: ${emptyCount}`);
  if (emptyCount > 0) {
    const emptyMsgs = results.filter(r => r.empty);
    for (const e of emptyMsgs) {
      console.log(`   - Message ${e.index}: "${e.prompt.substring(0, 40)}..."`);
    }
  }
  console.log("");

  console.log(`5. Timeouts: ${timeoutCount}`);
  if (timeoutCount > 0) {
    const timeouts = results.filter(r => r.timeout);
    for (const t of timeouts) {
      console.log(`   - Message ${t.index}: "${t.prompt.substring(0, 40)}..."`);
    }
  }
  console.log("");

  console.log(`6. Truncated responses (hit token limit): ${truncatedCount}`);
  if (truncatedCount > 0) {
    const truncated = results.filter(r => r.truncated);
    for (const t of truncated.slice(0, 10)) {
      console.log(`   - Message ${t.index}: ${t.tokens?.completion_tokens} tokens`);
    }
    if (truncated.length > 10) {
      console.log(`   ... and ${truncated.length - 10} more`);
    }
  }
  console.log("");

  // Summary stats by category
  console.log("=".repeat(60));
  console.log("CATEGORY BREAKDOWN");
  console.log("=".repeat(60));

  const categories = [
    { name: "Basic text (1-10)", start: 1, end: 10 },
    { name: "Code blocks (11-20)", start: 11, end: 20 },
    { name: "Markdown (21-30)", start: 21, end: 30 },
    { name: "Long responses (31-40)", start: 31, end: 40 },
    { name: "Short responses (41-50)", start: 41, end: 50 },
    { name: "Multi-code (51-60)", start: 51, end: 60 },
    { name: "Reasoning (61-70)", start: 61, end: 70 },
    { name: "Edge cases (71-80)", start: 71, end: 80 },
    { name: "Context (81-90)", start: 81, end: 90 },
    { name: "Rapid fire (91-100)", start: 91, end: 100 }
  ];

  for (const cat of categories) {
    const catResults = results.filter(r => r.index >= cat.start && r.index <= cat.end);
    const catSuccess = catResults.filter(r => r.success).length;
    const catLatency = catResults.filter(r => r.success).reduce((a, b) => a + b.latency_ms, 0);
    const catAvg = catSuccess > 0 ? Math.round(catLatency / catSuccess) : 0;
    console.log(`${cat.name}: ${catSuccess}/10 passed, avg ${catAvg}ms`);
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60));

  // Write results to file
  const resultsFile = '/Users/master/Desktop/tarx-code-oss/ui-stress-test-results.json';
  const fs = await import('fs');
  fs.writeFileSync(resultsFile, JSON.stringify({
    summary: {
      total: 100,
      successful: successCount,
      failed: failCount,
      success_rate: `${successCount}%`,
      avg_latency_ms: avgLatency,
      empty_responses: emptyCount,
      timeouts: timeoutCount,
      truncated: truncatedCount
    },
    results,
    timestamp: new Date().toISOString()
  }, null, 2));

  console.log(`Results saved to: ${resultsFile}`);
}

main().catch(console.error);
