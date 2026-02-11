/**
 * TARX Performance Stress Test
 * 200-query benchmark for local inference
 */

const INFERENCE_URL = 'http://localhost:11435/v1/chat/completions';
const TOTAL_QUERIES = 200;

const TEST_PROMPTS = [
  "What is 2+2?",
  "Explain recursion in one sentence.",
  "Write a haiku about coding.",
  "What's the capital of France?",
  "Define entropy briefly.",
  "Name 3 programming languages.",
  "What year did WW2 end?",
  "Explain REST API in 10 words.",
  "What is a closure in JS?",
  "Define machine learning briefly.",
  "What is TCP/IP?",
  "Name the planets in order.",
  "What is a binary tree?",
  "Explain HTTP status 404.",
  "What is polymorphism?",
  "Define an API.",
  "What is JSON?",
  "Explain async/await.",
  "What is a hash function?",
  "Define encryption briefly."
];

async function runQuery(queryNum) {
  const prompt = TEST_PROMPTS[queryNum % TEST_PROMPTS.length];
  const startTime = Date.now();
  let ttft = 0;
  let responseText = '';
  let totalTokens = 0;

  try {
    const response = await fetch(INFERENCE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (firstChunk) {
        ttft = Date.now() - startTime;
        firstChunk = false;
      }

      const chunk = decoder.decode(value, { stream: true });
      // Parse SSE data
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            responseText += parsed.choices[0].delta.content;
            totalTokens++;
          }
        } catch (e) {
          // Skip malformed chunks
        }
      }
    }

    const totalTime = Date.now() - startTime;

    return {
      query_num: queryNum,
      prompt: prompt.substring(0, 30) + '...',
      ttft_ms: ttft,
      total_ms: totalTime,
      tokens: totalTokens,
      tokens_per_sec: totalTokens / (totalTime / 1000),
      response_length: responseText.length,
      success: true
    };
  } catch (err) {
    return {
      query_num: queryNum,
      prompt: prompt.substring(0, 30) + '...',
      ttft_ms: 0,
      total_ms: Date.now() - startTime,
      tokens: 0,
      tokens_per_sec: 0,
      response_length: 0,
      success: false,
      error: err.message
    };
  }
}

function calculatePercentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runStressTest() {
  console.log('='.repeat(60));
  console.log('TARX PERFORMANCE STRESS TEST');
  console.log(`Starting ${TOTAL_QUERIES} query benchmark...`);
  console.log('='.repeat(60));
  console.log('');

  const results = [];
  const startAll = Date.now();

  for (let i = 0; i < TOTAL_QUERIES; i++) {
    const result = await runQuery(i);
    results.push(result);

    // Progress update every 20 queries
    if ((i + 1) % 20 === 0 || i === 0) {
      const elapsed = ((Date.now() - startAll) / 1000).toFixed(1);
      const status = result.success ? 'OK' : 'FAIL';
      console.log(
        `[${String(i + 1).padStart(3)}/${TOTAL_QUERIES}] ` +
        `TTFT: ${String(result.ttft_ms).padStart(4)}ms | ` +
        `Total: ${String(result.total_ms).padStart(5)}ms | ` +
        `${status} | ` +
        `Elapsed: ${elapsed}s`
      );
    }

    // Small delay to prevent overwhelming
    await new Promise(r => setTimeout(r, 50));
  }

  const totalTime = (Date.now() - startAll) / 1000;

  // Calculate statistics
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length === 0) {
    console.log('\nAll queries failed!');
    return;
  }

  const ttftValues = successful.map(r => r.ttft_ms);
  const totalValues = successful.map(r => r.total_ms);
  const tpsValues = successful.map(r => r.tokens_per_sec);

  const stats = {
    total_queries: TOTAL_QUERIES,
    successful: successful.length,
    failed: failed.length,
    success_rate: ((successful.length / TOTAL_QUERIES) * 100).toFixed(1) + '%',
    total_time_sec: totalTime.toFixed(1),
    queries_per_sec: (TOTAL_QUERIES / totalTime).toFixed(2),

    ttft: {
      avg: (ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length).toFixed(0),
      min: Math.min(...ttftValues),
      max: Math.max(...ttftValues),
      p50: calculatePercentile(ttftValues, 50),
      p95: calculatePercentile(ttftValues, 95),
      p99: calculatePercentile(ttftValues, 99)
    },

    total_latency: {
      avg: (totalValues.reduce((a, b) => a + b, 0) / totalValues.length).toFixed(0),
      min: Math.min(...totalValues),
      max: Math.max(...totalValues),
      p50: calculatePercentile(totalValues, 50),
      p95: calculatePercentile(totalValues, 95)
    },

    tokens_per_sec: {
      avg: (tpsValues.reduce((a, b) => a + b, 0) / tpsValues.length).toFixed(1),
      min: Math.min(...tpsValues).toFixed(1),
      max: Math.max(...tpsValues).toFixed(1)
    }
  };

  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('STRESS TEST RESULTS');
  console.log('='.repeat(60));
  console.log('');
  console.log('SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total Queries:     ${stats.total_queries}`);
  console.log(`Successful:        ${stats.successful}`);
  console.log(`Failed:            ${stats.failed}`);
  console.log(`Success Rate:      ${stats.success_rate}`);
  console.log(`Total Time:        ${stats.total_time_sec}s`);
  console.log(`Queries/sec:       ${stats.queries_per_sec}`);
  console.log('');
  console.log('TIME TO FIRST TOKEN (TTFT)');
  console.log('-'.repeat(40));
  console.log(`Average:           ${stats.ttft.avg}ms`);
  console.log(`Min:               ${stats.ttft.min}ms`);
  console.log(`Max:               ${stats.ttft.max}ms`);
  console.log(`P50:               ${stats.ttft.p50}ms`);
  console.log(`P95:               ${stats.ttft.p95}ms`);
  console.log(`P99:               ${stats.ttft.p99}ms`);
  console.log('');
  console.log('TOTAL LATENCY');
  console.log('-'.repeat(40));
  console.log(`Average:           ${stats.total_latency.avg}ms`);
  console.log(`Min:               ${stats.total_latency.min}ms`);
  console.log(`Max:               ${stats.total_latency.max}ms`);
  console.log(`P50:               ${stats.total_latency.p50}ms`);
  console.log(`P95:               ${stats.total_latency.p95}ms`);
  console.log('');
  console.log('THROUGHPUT');
  console.log('-'.repeat(40));
  console.log(`Avg Tokens/sec:    ${stats.tokens_per_sec.avg}`);
  console.log(`Min Tokens/sec:    ${stats.tokens_per_sec.min}`);
  console.log(`Max Tokens/sec:    ${stats.tokens_per_sec.max}`);
  console.log('');

  // V1 Target comparison
  console.log('V1 TARGET COMPARISON');
  console.log('-'.repeat(40));
  const ttftTarget = 500;
  const tpsTarget = 10;
  const ttftPass = parseFloat(stats.ttft.avg) < ttftTarget;
  const tpsPass = parseFloat(stats.tokens_per_sec.avg) > tpsTarget;
  console.log(`TTFT < ${ttftTarget}ms:       ${ttftPass ? 'PASS' : 'FAIL'} (${stats.ttft.avg}ms)`);
  console.log(`TPS > ${tpsTarget}:           ${tpsPass ? 'PASS' : 'FAIL'} (${stats.tokens_per_sec.avg})`);
  console.log(`Success > 95%:     ${parseFloat(stats.success_rate) > 95 ? 'PASS' : 'FAIL'} (${stats.success_rate})`);
  console.log('');

  // Save results
  const fs = require('fs');
  const outputPath = `/Users/master/Desktop/tarx-code-oss/scripts/stress-test-results-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify({ stats, results }, null, 2));
  console.log(`Results saved to: ${outputPath}`);

  // Print failed queries if any
  if (failed.length > 0) {
    console.log('\nFAILED QUERIES:');
    failed.forEach(f => console.log(`  Query ${f.query_num}: ${f.error}`));
  }
}

// Run the test
runStressTest().catch(console.error);
