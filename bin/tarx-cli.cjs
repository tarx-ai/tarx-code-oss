#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INFERENCE_PORT = 11435;
const EMBED_PORT = 11437;
const MESH_PORT = 11436;
const VOICE_PORT = 11438;
const MOSHI_PORT = 9001;
const TMP_DIR = '/tmp/tarx-voice-test';

// Ensure temp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

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

// Helper: Generate unique temp file path
function tempFile(prefix, ext) {
  const id = crypto.randomBytes(4).toString('hex');
  return path.join(TMP_DIR, `${prefix}-${id}.${ext}`);
}

// Helper: Calculate hallucination score
function calculateHallucinationScore(text) {
  const fillerPatterns = [
    /\byeah\b/gi,
    /\buh-huh\b/gi,
    /\buh huh\b/gi,
    /\bwhat's going on\b/gi,
    /\bI see\b/gi,
    /\bhmm+\b/gi,
    /\bokay okay\b/gi,
    /\bright right\b/gi,
    /\bso so\b/gi,
  ];

  let fillerCount = 0;
  for (const pattern of fillerPatterns) {
    const matches = text.match(pattern);
    if (matches) fillerCount += matches.length;
  }

  const words = text.split(/\s+/).length;
  if (words === 0) return 0;

  return Math.min(1, fillerCount / Math.max(words * 0.1, 1));
}

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
  },

  // ============================================================================
  // VOICE COMMANDS
  // ============================================================================

  async voice_health() {
    console.log('Checking voice pipeline...\n');

    const checks = [
      { name: 'Inference', port: INFERENCE_PORT },
      { name: 'tarx-voice', port: VOICE_PORT },
      { name: 'Moshi', port: MOSHI_PORT }
    ];

    let allOk = true;
    for (const svc of checks) {
      try {
        const res = await fetch(`http://localhost:${svc.port}/health`, {
          signal: AbortSignal.timeout(2000)
        });
        const ok = res.ok;
        console.log(`${ok ? '\u2705' : '\u274C'} ${svc.name} (${svc.port}): ${ok ? 'HEALTHY' : 'UNHEALTHY'}`);
        if (!ok) allOk = false;
      } catch {
        console.log(`\u274C ${svc.name} (${svc.port}): NOT RESPONDING`);
        allOk = false;
      }
    }

    console.log(`\n${allOk ? '\u2705 Voice pipeline ready' : '\u26A0\uFE0F  Voice pipeline incomplete'}`);
  },

  async voice_synth(text) {
    if (!text) {
      console.error('Usage: tarx-cli voice_synth "text to speak"');
      process.exit(1);
    }

    const outputFile = tempFile('synth', 'wav');
    const start = Date.now();

    console.log(`Synthesizing: "${text}"\n`);

    try {
      const aiffFile = tempFile('synth', 'aiff');
      const safeText = text.replace(/"/g, '\\"').replace(/`/g, '\\`').substring(0, 500);
      execSync(`say -o "${aiffFile}" "${safeText}"`);
      execSync(`afconvert -f WAVE -d LEI16 "${aiffFile}" "${outputFile}"`);
      fs.unlinkSync(aiffFile);

      const stats = fs.statSync(outputFile);
      const durationSec = Math.round(stats.size / 176000 * 100) / 100;

      console.log(`\u2705 Audio saved: ${outputFile}`);
      console.log(`   Size: ${stats.size} bytes`);
      console.log(`   Duration: ~${durationSec}s`);
      console.log(`   Latency: ${Date.now() - start}ms`);
      console.log(`\n   Play with: afplay "${outputFile}"`);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  },

  async voice_stress(count = '5') {
    const n = parseInt(count);
    console.log(`Running ${n} voice cycles...\n`);

    const prompts = [
      'Hello TARX',
      "What time is it?",
      'Tell me a joke',
      'How are you?',
      'Goodbye',
      'What can you help me with?',
      'Count to three',
      "What's your name?",
      'Say something brief',
      'Thank you'
    ];

    const results = [];
    for (let i = 0; i < n; i++) {
      const prompt = prompts[i % prompts.length];
      const start = Date.now();

      try {
        // Generate test audio
        const audioFile = tempFile(`stress-${i}`, 'wav');
        const aiffFile = tempFile(`stress-${i}`, 'aiff');
        const safeText = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`');
        execSync(`say -o "${aiffFile}" "${safeText}"`);
        execSync(`afconvert -f WAVE -d LEI16 "${aiffFile}" "${audioFile}"`);
        fs.unlinkSync(aiffFile);

        // Send to LLM
        const res = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'ollama-7b',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 100
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';

        // Calculate hallucination score
        const hallucinationScore = calculateHallucinationScore(text);

        results.push({
          success: true,
          ms: Date.now() - start,
          hallucinations: hallucinationScore
        });

        // Cleanup
        if (fs.existsSync(audioFile)) fs.unlinkSync(audioFile);

        process.stdout.write('\u2713');
      } catch (e) {
        results.push({ success: false, ms: Date.now() - start, hallucinations: 0 });
        process.stdout.write('\u2717');
      }
    }

    const ok = results.filter(r => r.success);
    const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b.ms, 0) / ok.length) : 0;
    const avgHallucination = ok.length
      ? Math.round(ok.reduce((a, b) => a + b.hallucinations, 0) / ok.length * 100) / 100
      : 0;
    const highHallucinations = results.filter(r => r.hallucinations > 0.3).length;

    console.log('\n\n=== VOICE STRESS RESULTS ===');
    console.log(`Success: ${ok.length}/${n} (${Math.round(ok.length/n*100)}%)`);
    console.log(`Avg latency: ${avg}ms`);
    if (ok.length) {
      console.log(`Min: ${Math.min(...ok.map(r => r.ms))}ms`);
      console.log(`Max: ${Math.max(...ok.map(r => r.ms))}ms`);
    }
    console.log(`Avg hallucination score: ${avgHallucination}`);
    console.log(`High hallucination cycles: ${highHallucinations}`);
  },

  async voice_config(action = 'get', ...configArgs) {
    const configFile = '/tmp/tarx-voice-config.json';

    let config = {
      vad_timeout_ms: 1000,
      rms_threshold: 0.015,
      silence_threshold_ms: 3000,
      max_response_tokens: 150
    };

    if (fs.existsSync(configFile)) {
      try {
        config = { ...config, ...JSON.parse(fs.readFileSync(configFile, 'utf8')) };
      } catch {}
    }

    if (action === 'get') {
      console.log('Voice Configuration:\n');
      console.log(JSON.stringify(config, null, 2));
      console.log(`\nConfig file: ${configFile}`);
      return;
    }

    if (action === 'set') {
      // Parse key=value pairs
      for (const arg of configArgs) {
        const [key, value] = arg.split('=');
        if (key && value !== undefined) {
          if (key in config) {
            config[key] = parseFloat(value);
          }
        }
      }

      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
      console.log('\u2705 Config updated:\n');
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log('Usage:');
    console.log('  tarx-cli voice_config get');
    console.log('  tarx-cli voice_config set vad_timeout_ms=1500 rms_threshold=0.02');
  },

  async voice_reset() {
    console.log('Resetting voice pipeline...\n');

    try {
      // Try to reset via API
      try {
        await fetch(`http://localhost:${VOICE_PORT}/reset`, { method: 'POST' });
        console.log('\u2705 Reset signal sent to tarx-voice');
      } catch {
        console.log('\u26A0\uFE0F  tarx-voice not responding (may not be running)');
      }

      // Check health after reset
      const voiceOk = await checkPort(VOICE_PORT);
      const moshiOk = await checkPort(MOSHI_PORT);

      console.log(`\nPost-reset status:`);
      console.log(`  tarx-voice: ${voiceOk ? '\u2705' : '\u274C'}`);
      console.log(`  Moshi: ${moshiOk ? '\u2705' : '\u274C'}`);
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
};

const [,, cmd, ...args] = process.argv;
if (!cmd || !commands[cmd]) {
  console.log('TARX CLI - Test local AI infrastructure\n');
  console.log('Core Commands:');
  console.log('  health              Check all services');
  console.log('  chat "prompt"       Send chat request');
  console.log('  stress [count]      Run stress test (default: 10)');
  console.log('  embed "text"        Generate embedding');
  console.log('');
  console.log('Voice Commands:');
  console.log('  voice_health        Check voice pipeline status');
  console.log('  voice_synth "text"  Generate test audio (TTS)');
  console.log('  voice_stress [n]    Run n voice cycles (default: 5)');
  console.log('  voice_config [get|set key=val]  Get/set voice config');
  console.log('  voice_reset         Reset voice pipeline');
  process.exit(0);
}

commands[cmd](...args);
