#!/usr/bin/env node
const INFERENCE_PORT = 11435;
const EMBED_PORT = 11437;
const MESH_PORT = 11436;

// Condensed TARX system prompt for CLI testing
const TARX_SYSTEM = `You are TARX, a local AI assistant. Be direct and concise.

CRITICAL RULES:
1. Simple questions = 1-3 sentence answers. No essays.
2. Never start with "I'd be happy to help" or similar filler.
3. If you need more info, ask ONE specific question.
4. Code questions: show code first, explain briefly after.
5. Don't hedge with "perhaps/maybe/possibly" unless truly uncertain.

Examples:
- "What's a mutex?" → "A lock ensuring one thread accesses a resource at a time. Prevents race conditions."
- "Fix my code" → "Share the code and tell me what's broken."
- Vague request → Ask for specifics, don't guess.`;

async function checkPort(port) {
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}

const commands = {
  async health() {
    console.log('Checking TARX services...\n');
    const services = [
      { name: 'Inference', port: INFERENCE_PORT },
      { name: 'Embeddings', port: EMBED_PORT },
      { name: 'Mesh', port: MESH_PORT }
    ];

    for (const svc of services) {
      const ok = await checkPort(svc.port);
      console.log(`${ok ? '\u2705' : '\u274C'} ${svc.name} (${svc.port}): ${ok ? 'HEALTHY' : 'NOT RESPONDING'}`);
    }
  },

  async chat(prompt) {
    if (!prompt) { console.error('Usage: tarx-cli chat "your prompt"'); process.exit(1); }

    const start = Date.now();
    console.log(`Sending: "${prompt}"\n`);

    try {
      const res = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'ollama-7b',
          messages: [
            { role: 'system', content: TARX_SYSTEM },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500
        })
      });

      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      // QwQ model: prefer content (final answer), fall back to last paragraph of reasoning
      let content = msg?.content;
      if (!content && msg?.reasoning_content) {
        // Extract last meaningful paragraph from reasoning as the "answer"
        const reasoning = msg.reasoning_content;
        const paragraphs = reasoning.split('\n\n').filter(p => p.trim());
        content = paragraphs[paragraphs.length - 1] || reasoning.slice(-500);
      }
      content = content || 'No response';
      console.log('Response:', content);
      console.log(`\n--- Latency: ${Date.now() - start}ms ---`);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  },

  async stress(count = '10') {
    const n = parseInt(count);
    console.log(`Running ${n} requests...\n`);

    const results = [];
    for (let i = 0; i < n; i++) {
      const start = Date.now();
      try {
        const res = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'ollama-7b',
            messages: [{ role: 'user', content: `Test ${i + 1}: respond with OK` }],
            max_tokens: 20
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        results.push({ success: true, ms: Date.now() - start });
        process.stdout.write('\u2713');
      } catch (e) {
        results.push({ success: false, ms: Date.now() - start });
        process.stdout.write('\u2717');
      }
    }

    const ok = results.filter(r => r.success);
    const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b.ms, 0) / ok.length) : 0;

    console.log(`\n\n=== RESULTS ===`);
    console.log(`Success: ${ok.length}/${n} (${Math.round(ok.length/n*100)}%)`);
    console.log(`Avg latency: ${avg}ms`);
    if (ok.length) {
      console.log(`Min: ${Math.min(...ok.map(r => r.ms))}ms`);
      console.log(`Max: ${Math.max(...ok.map(r => r.ms))}ms`);
    }
  },

  async embed(text) {
    if (!text) { console.error('Usage: tarx-cli embed "your text"'); process.exit(1); }

    const start = Date.now();
    try {
      const res = await fetch(`http://localhost:${EMBED_PORT}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: `search_query: ${text}`, model: 'nomic-embed' })
      });

      const data = await res.json();
      const dims = data.data?.[0]?.embedding?.length || 0;
      console.log(`\u2705 Embedding generated: ${dims} dimensions (${Date.now() - start}ms)`);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  }
};

const [,, cmd, ...args] = process.argv;
if (!cmd || !commands[cmd]) {
  console.log('TARX CLI - Test local AI infrastructure\n');
  console.log('Commands:');
  console.log('  health              Check all services');
  console.log('  chat "prompt"       Send chat request');
  console.log('  stress [count]      Run stress test (default: 10)');
  console.log('  embed "text"        Generate embedding');
  process.exit(0);
}

commands[cmd](...args);