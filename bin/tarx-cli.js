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

// Helper: Cosine similarity for embeddings
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const commands = {
  async health(format = 'text') {
    const services = [
      { name: 'Inference', port: INFERENCE_PORT, endpoint: '/v1/models' },
      { name: 'Embeddings', port: EMBED_PORT, endpoint: '/v1/models' },
      { name: 'Mesh', port: MESH_PORT, endpoint: '/health' }
    ];

    const results = {};

    for (const svc of services) {
      const ok = await checkPort(svc.port);
      let modelInfo = null;

      if (ok && (svc.name === 'Inference' || svc.name === 'Embeddings')) {
        try {
          const res = await fetch(`http://localhost:${svc.port}${svc.endpoint}`, {
            signal: AbortSignal.timeout(2000)
          });
          if (res.ok) {
            const data = await res.json();
            modelInfo = data.data?.[0] || data;
          }
        } catch {}
      }

      results[svc.name.toLowerCase()] = {
        status: ok ? 'healthy' : 'offline',
        port: svc.port,
        model: modelInfo?.id || modelInfo?.model || null
      };
    }

    if (format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log('Checking TARX services...\n');
      for (const [name, info] of Object.entries(results)) {
        const icon = info.status === 'healthy' ? '\u2705' : '\u274C';
        const status = info.status === 'healthy' ? 'HEALTHY' : 'NOT RESPONDING';
        const modelStr = info.model ? ` (${info.model})` : '';
        console.log(`${icon} ${name.charAt(0).toUpperCase() + name.slice(1)} (${info.port}): ${status}${modelStr}`);
      }
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

  async query(searchText, limit = '5') {
    if (!searchText) { console.error('Usage: tarx-cli query "search text" [limit]'); process.exit(1); }

    const maxResults = parseInt(limit);
    console.log(`Searching knowledge base: "${searchText}"\n`);

    try {
      // First generate embedding for the search query
      const embedRes = await fetch(`http://localhost:${EMBED_PORT}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: `search_query: ${searchText}`, model: 'nomic-embed' })
      });

      if (!embedRes.ok) {
        throw new Error(`Embedding service returned ${embedRes.status}`);
      }

      const embedData = await embedRes.json();
      const embedding = embedData.data?.[0]?.embedding;

      if (!embedding) {
        throw new Error('No embedding generated');
      }

      console.log(`\u2705 Generated embedding (${embedding.length} dimensions)\n`);

      // Try to load better-sqlite3 for direct database access
      let Database = null;
      try {
        const db = await import('better-sqlite3');
        Database = db.default;
      } catch {
        try {
          // Try from tarx-core extension - use path module
          const path = await import('path');
          const { fileURLToPath } = await import('url');
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const dbPath = path.join(__dirname, '..', 'extensions/tarx-core/node_modules/better-sqlite3/lib/index.js');
          const db = await import(dbPath);
          Database = db.default;
        } catch {
          console.log('\u26A0\uFE0F  better-sqlite3 not available. Install with:');
          console.log('    cd extensions/tarx-core && npm install');
          console.log('\nOr use the tarx-core MCP server for RAG search.');
          return;
        }
      }

      // Connect to TARX knowledge database
      const dbPath = `${process.env.HOME}/Library/Application Support/tarx/memory.db`;
      const { existsSync } = await import('fs');
      if (!existsSync(dbPath)) {
        console.error(`\u274C Database not found: ${dbPath}`);
        console.error('Ensure TARX has been run at least once to initialize the database.');
        process.exit(1);
      }

      const db = new Database(dbPath);

      // Get knowledge embeddings
      const chunks = db.prepare(`
        SELECT id, content, embedding, source, title, space_id
        FROM knowledge_embeddings
        WHERE embedding IS NOT NULL
        ORDER BY created_at DESC
      `).all();

      if (chunks.length === 0) {
        console.log('No indexed content found. Use the TARX sidebar to index files/directories.');
        db.close();
        return;
      }

      // Calculate cosine similarity for each chunk
      const queryArray = new Float32Array(embedding);
      const results = [];

      // Check dimensions of first embedding
      const firstChunk = chunks[0];
      if (firstChunk && firstChunk.embedding) {
        const firstDims = firstChunk.embedding.length / 4;
        if (firstDims !== queryArray.length) {
          console.log(`\u26A0\uFE0F  Dimension mismatch:`);
          console.log(`   Query embedding: ${queryArray.length} dimensions`);
          console.log(`   Stored embeddings: ${firstDims} dimensions`);
          console.log(`\nThe embedding service may have changed models.`);
          console.log(`Stored embeddings were created with a different model version.`);
          db.close();
          return;
        }
      }

      for (const chunk of chunks) {
        if (!chunk.embedding) continue;

        // Convert BLOB to Float32Array - the BLOB is already raw bytes
        const chunkArray = new Float32Array(
          chunk.embedding.buffer,
          chunk.embedding.byteOffset,
          chunk.embedding.length / 4
        );
        const similarity = cosineSimilarity(queryArray, chunkArray);

        results.push({
          id: chunk.id,
          similarity,
          content: chunk.content,
          source: chunk.source,
          title: chunk.title,
          space_id: chunk.space_id
        });
      }

      // Sort by similarity and take top results
      results.sort((a, b) => b.similarity - a.similarity);
      const topResults = results.slice(0, maxResults);

      console.log(`Found ${topResults.length} results:\n`);

      topResults.forEach((result, i) => {
        const score = (result.similarity * 100).toFixed(1);
        const preview = result.content.substring(0, 200).replace(/\n/g, ' ');
        console.log(`${i + 1}. [${score}%] ${result.title || result.source || 'Unknown'}`);
        console.log(`   Source: ${result.source || 'N/A'}`);
        console.log(`   Preview: ${preview}${result.content.length > 200 ? '...' : ''}\n`);
      });

      db.close();
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  },

  async sessions(action = 'list', sessionId) {
    const dbPath = `${process.env.HOME}/.tarx/orchestration.db`;

    try {
      // Try to use better-sqlite3, fall back to sqlite3 CLI
      let Database = null;
      try {
        const db = await import('better-sqlite3');
        Database = db.default;
      } catch {
        try {
          const path = await import('path');
          const { fileURLToPath } = await import('url');
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const dbPath = path.join(__dirname, '..', 'extensions/tarx-core/node_modules/better-sqlite3/lib/index.js');
          const db = await import(dbPath);
          Database = db.default;
        } catch {
          // Will fall back to CLI below
        }
      }

      if (!Database) {
        // Fall back to sqlite3 CLI tool
        const { execSync } = await import('child_process');
        const { existsSync } = await import('fs');

        if (!existsSync(dbPath)) {
          console.error(`\u274C Database not found: ${dbPath}`);
          console.error('No orchestration sessions exist yet.');
          return;
        }

        if (action === 'list') {
          const query = `SELECT id, name, status, last_activity, created_at FROM sessions ORDER BY last_activity DESC LIMIT 20;`;
          const result = execSync(`sqlite3 "${dbPath}" "${query}"`, { encoding: 'utf8' });

          if (!result.trim()) {
            console.log('No sessions found.');
            return;
          }

          const lines = result.trim().split('\n');
          console.log(`Recent sessions (${lines.length}):\n`);
          lines.forEach((line, i) => {
            const [id, name, status, lastActivity, created] = line.split('|');
            const date = new Date(parseInt(lastActivity)).toLocaleDateString();
            const time = new Date(parseInt(lastActivity)).toLocaleTimeString();
            console.log(`${i + 1}. [${id.substring(0, 8)}] ${name || 'Untitled'} (${status})`);
            console.log(`   Last activity: ${date} ${time}\n`);
          });
        } else if (action === 'show' && sessionId) {
          const sessionQuery = `SELECT id, name, status, workspace_path, current_task, last_activity FROM sessions WHERE id = '${sessionId}';`;
          const sessionResult = execSync(`sqlite3 "${dbPath}" "${sessionQuery}"`, { encoding: 'utf8' });

          if (!sessionResult.trim()) {
            console.log(`Session ${sessionId} not found`);
            return;
          }

          const [id, name, status, workspace, task, lastActivity] = sessionResult.trim().split('|');
          console.log(`Session: ${name} [${id}]`);
          console.log(`Status: ${status}`);
          console.log(`Workspace: ${workspace}`);
          if (task) console.log(`Current task: ${task}`);
          const date = new Date(parseInt(lastActivity)).toLocaleString();
          console.log(`Last activity: ${date}\n`);

          const activityQuery = `SELECT timestamp, activity_type, details FROM session_activity WHERE session_id = '${sessionId}' ORDER BY timestamp DESC LIMIT 10;`;
          const activityResult = execSync(`sqlite3 "${dbPath}" "${activityQuery}"`, { encoding: 'utf8' });

          if (activityResult.trim()) {
            console.log('Recent activity:');
            const lines = activityResult.trim().split('\n');
            lines.forEach(line => {
              const [timestamp, type, details] = line.split('|');
              const time = new Date(parseInt(timestamp)).toLocaleTimeString();
              console.log(`  [${time}] ${type}: ${details || '(no details)'}`);
            });
          }
        } else {
          console.log('Usage:');
          console.log('  tarx-cli sessions list');
          console.log('  tarx-cli sessions show <session-id>');
          console.log('  tarx-cli sessions resume <session-id>');
        }
        return;
      }

      // Use better-sqlite3 for direct database access
      const { existsSync } = await import('fs');
      if (!existsSync(dbPath)) {
        console.error(`\u274C Database not found: ${dbPath}`);
        console.error('No orchestration sessions exist yet.');
        return;
      }

      const db = new Database(dbPath);

      if (action === 'list') {
        const sessions = db.prepare(`
          SELECT id, name, status, last_activity, created_at
          FROM sessions
          ORDER BY last_activity DESC
          LIMIT 20
        `).all();

        if (sessions.length === 0) {
          console.log('No sessions found.');
          db.close();
          return;
        }

        console.log(`Recent sessions (${sessions.length}):\n`);
        sessions.forEach((session, i) => {
          const date = new Date(session.last_activity).toLocaleDateString();
          const time = new Date(session.last_activity).toLocaleTimeString();
          console.log(`${i + 1}. [${session.id.substring(0, 8)}] ${session.name || 'Untitled'} (${session.status})`);
          console.log(`   Last activity: ${date} ${time}\n`);
        });
      } else if (action === 'show' && sessionId) {
        const session = db.prepare(`
          SELECT id, name, status, workspace_path, current_task, last_activity
          FROM sessions WHERE id = ?
        `).get(sessionId);

        if (!session) {
          console.log(`Session ${sessionId} not found`);
          db.close();
          return;
        }

        console.log(`Session: ${session.name} [${session.id}]`);
        console.log(`Status: ${session.status}`);
        console.log(`Workspace: ${session.workspace_path || 'N/A'}`);
        if (session.current_task) console.log(`Current task: ${session.current_task}`);
        const date = new Date(session.last_activity).toLocaleString();
        console.log(`Last activity: ${date}\n`);

        // Get recent activity
        const activities = db.prepare(`
          SELECT timestamp, activity_type, details
          FROM session_activity
          WHERE session_id = ?
          ORDER BY timestamp DESC
          LIMIT 10
        `).all(sessionId);

        if (activities.length > 0) {
          console.log('Recent activity:');
          activities.forEach(activity => {
            const time = new Date(activity.timestamp).toLocaleTimeString();
            console.log(`  [${time}] ${activity.activity_type}: ${activity.details || '(no details)'}`);
          });
        }
      } else if (action === 'resume' && sessionId) {
        // Get session for resuming
        const session = db.prepare(`
          SELECT id, name, status, workspace_path, current_task
          FROM sessions WHERE id = ?
        `).get(sessionId);

        if (!session) {
          console.log(`Session ${sessionId} not found`);
          db.close();
          return;
        }

        console.log(`Resuming session: ${session.name} [${session.id.substring(0, 8)}]`);
        console.log(`Status: ${session.status}`);
        console.log(`Workspace: ${session.workspace_path || 'N/A'}`);
        if (session.current_task) console.log(`Current task: ${session.current_task}`);
        console.log('');

        // Get recent activity as a proxy for session history
        const activities = db.prepare(`
          SELECT timestamp, activity_type, details
          FROM session_activity
          WHERE session_id = ?
          ORDER BY timestamp DESC
          LIMIT 20
        `).all(sessionId);

        if (activities.length === 0) {
          console.log('No activity history available.');
        } else {
          console.log(`Recent activity (${activities.length} events):\n`);
          activities.reverse().forEach((activity, i) => {
            const time = new Date(activity.timestamp).toLocaleTimeString();
            const details = activity.details ? activity.details.substring(0, 80) : '(no details)';
            console.log(`${i + 1}. [${time}] ${activity.activity_type}: ${details}`);
          });
        }

        console.log(`\nTo continue this session, open TARX and select session: ${session.id}`);
      } else {
        console.log('Usage:');
        console.log('  tarx-cli sessions list');
        console.log('  tarx-cli sessions show <session-id>');
        console.log('  tarx-cli sessions resume <session-id>');
      }

      db.close();
    } catch (e) {
      console.error('Error:', e.message);
      console.error('\nNote: Ensure TARX database exists at ~/.tarx/orchestration.db');
      process.exit(1);
    }
  }
};

const [,, cmd, ...args] = process.argv;
if (!cmd || !commands[cmd]) {
  console.log('TARX CLI - Test local AI infrastructure\n');
  console.log('Commands:');
  console.log('  health [format]     Check all services (format: text|json, default: text)');
  console.log('  chat "prompt"       Send chat request');
  console.log('  stress [count]      Run stress test (default: 10)');
  console.log('  embed "text"        Generate embedding');
  console.log('  query "text" [n]    Search knowledge base (RAG, default: 5 results)');
  console.log('  sessions [action]   List sessions or show session details');
  console.log('                      - list: Show recent sessions');
  console.log('                      - show <id>: Show session details');
  console.log('                      - resume <id>: Resume session (show message history)');
  process.exit(0);
}

commands[cmd](...args);