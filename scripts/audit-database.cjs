#!/usr/bin/env node
/**
 * TARX Database Audit Script
 * Inspects the local SQLite database and reports statistics
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

console.log('=== TARX Database Audit ===');
console.log(`Database: ${DB_PATH}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log('');

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.log('❌ Database not found at:', DB_PATH);
  console.log('');
  console.log('Possible locations:');
  const possiblePaths = [
    path.join(os.homedir(), 'Library/Application Support/tarx/memory.db'),
    path.join(os.homedir(), 'Library/Application Support/com.tarx.supercomputer/data.db'),
    path.join(os.homedir(), 'Library/Application Support/com.tarx.local/data.db'),
  ];
  possiblePaths.forEach(p => {
    const exists = fs.existsSync(p);
    console.log(`  ${exists ? '✅' : '❌'} ${p}`);
  });
  process.exit(1);
}

try {
  const db = new Database(DB_PATH, { readonly: true });

  // Get table list
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts_%'").pluck().all();

  console.log('--- Tables ---');
  tables.forEach(t => console.log(`  ${t}`));
  console.log('');

  // Get counts
  console.log('--- Row Counts ---');
  const counts = {};
  const countTables = ['spaces', 'sessions', 'messages', 'files', 'chunk_embeddings', 'message_embeddings', 'knowledge_embeddings'];

  countTables.forEach(table => {
    if (tables.includes(table)) {
      try {
        const count = db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get();
        counts[table] = count;
        console.log(`  ${table}: ${count}`);
      } catch (e) {
        console.log(`  ${table}: ERROR - ${e.message}`);
      }
    }
  });
  console.log('');

  // Get recent spaces
  console.log('--- Spaces ---');
  if (tables.includes('spaces')) {
    const spaces = db.prepare(`
      SELECT id, name, emoji, message_count,
             datetime(created_at/1000, 'unixepoch') as created,
             datetime(last_accessed_at/1000, 'unixepoch') as last_accessed
      FROM spaces
      WHERE deleted_at IS NULL
      ORDER BY last_accessed_at DESC
      LIMIT 10
    `).all();

    if (spaces.length === 0) {
      console.log('  No spaces found');
    } else {
      spaces.forEach(s => {
        console.log(`  ${s.emoji || '📁'} ${s.name} (${s.message_count || 0} msgs) - ${s.last_accessed || 'never'}`);
      });
    }
  }
  console.log('');

  // Get recent sessions
  console.log('--- Recent Sessions ---');
  if (tables.includes('sessions')) {
    const sessions = db.prepare(`
      SELECT s.id, s.title, s.message_count,
             sp.name as space_name,
             datetime(s.updated_at/1000, 'unixepoch') as updated
      FROM sessions s
      LEFT JOIN spaces sp ON s.space_id = sp.id
      WHERE s.deleted_at IS NULL
      ORDER BY s.updated_at DESC
      LIMIT 5
    `).all();

    if (sessions.length === 0) {
      console.log('  No sessions found');
    } else {
      sessions.forEach(s => {
        console.log(`  [${s.space_name || 'Unknown'}] ${s.title || 'Untitled'} (${s.message_count || 0} msgs) - ${s.updated}`);
      });
    }
  }
  console.log('');

  // Database size
  const stats = fs.statSync(DB_PATH);
  console.log('--- Storage ---');
  console.log(`  Database size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Embedding storage
  if (counts.chunk_embeddings > 0 || counts.message_embeddings > 0) {
    const embeddingSize = db.prepare(`
      SELECT SUM(length(embedding)) as total_bytes
      FROM (
        SELECT embedding FROM chunk_embeddings
        UNION ALL
        SELECT embedding FROM message_embeddings
        UNION ALL
        SELECT embedding FROM knowledge_embeddings
      )
    `).pluck().get();
    console.log(`  Embedding storage: ${((embeddingSize || 0) / 1024 / 1024).toFixed(2)} MB`);
  }
  console.log('');

  // Summary JSON
  console.log('--- JSON Summary ---');
  const summary = {
    database: DB_PATH,
    size_mb: (stats.size / 1024 / 1024).toFixed(2),
    counts,
    timestamp: new Date().toISOString()
  };
  console.log(JSON.stringify(summary, null, 2));

  db.close();
  console.log('\n✅ Audit complete');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
