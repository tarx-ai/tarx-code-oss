# SQL Injection Vulnerability Audit - TARX

## Status: IN PROGRESS

## Summary
This audit identified and addresses SQL injection vulnerabilities across the TARX codebase where string interpolation is used instead of parameterized queries.

## Critical Principle
**ALL SQL queries MUST use `?` placeholders with parameterized queries**

### Good (Secure):
```typescript
execute('INSERT INTO files (id, name) VALUES (?, ?)', fileId, fileName);
queryOne('SELECT * FROM projects WHERE id = ?', projectId);
```

### Bad (Vulnerable):
```typescript
execute(`INSERT INTO files (id, name) VALUES ('${fileId}', '${fileName}')`);
queryOne(`SELECT * FROM projects WHERE id = '${projectId}'`);
```

## Files Fixed

### ✅ sidebar-ux.ts
- **Lines fixed**: 551, 575, 1441, 1905, 1915, 1943, 2194, 2267, 2623
- **Status**: COMPLETE
- **Changes**: All queries converted to use queryOne/queryAll/execute with ? placeholders

### ✅ extension.ts
- **Lines fixed**: 970
- **Status**: PARTIAL
- **Remaining**: Lines 2419, 2441, 2575, 2594, 2606, 2647, 2896, 3577
- **Note**: File uses both secureDatabase (better-sqlite3) and execSync(sqlite3 CLI) - need to standardize

## Files Pending Review

### ⚠️ sidebar-interactions.ts
**Vulnerable lines**: 119, 136, 168, 264, 265, 607, 608
**Pattern**: Direct string interpolation in SELECT/UPDATE/DELETE
**Example**:
```typescript
SELECT id FROM sessions WHERE id = '${sanitizeSQL(sessionId)}'
```
**Fix**: Use queryOne with parameters

### ⚠️ sidebar-sections.ts
**Vulnerable lines**: 905, 926
**Pattern**: UPDATE with escaped strings
**Fix**: Convert to execute() with parameters

### ⚠️ sidebar-full-ux.ts
**Vulnerable lines**: 459, 599, 600, 601, 860, 918, 950, 1059
**Pattern**: Multiple UPDATE/SELECT with string interpolation
**Fix**: Bulk convert to secure database functions

### ⚠️ claude-bridge.ts
**Vulnerable lines**: 411, 818, 1235
**Pattern**: UPDATE/SELECT/DELETE with interpolated values
**Fix**: Use parameterized queries

### ⚠️ projectTreeProvider.ts
**Vulnerable lines**: 881
**Pattern**: SELECT with interpolated projectPath
**Fix**: Use queryOne with parameter

### ⚠️ projectContextPanel.ts
**Vulnerable lines**: 718
**Pattern**: DELETE with interpolated fileId
**Fix**: Use execute with parameter

### ⚠️ daemon-session.ts
**Vulnerable lines**: 73
**Pattern**: UPDATE with interpolated sessionId
**Fix**: Use execute with parameter

### ⚠️ sqliteDatabase.ts
**Status**: MAJOR REFACTORING NEEDED
**Vulnerable lines**: 262, 269, 284, 291, 307, 333, 342, 349, 363, 381, 399, 424, 479, 483, 508, 514, 543, 544, 560, 571, 610, 613
**Pattern**: Uses execSync with sqlite3 CLI instead of better-sqlite3
**Recommendation**:
1. Migrate to better-sqlite3 everywhere
2. Remove CLI-based queries entirely
3. Use prepared statements throughout

### ⚠️ MCP Servers (extensions/tarx-ops, tarx-orchestration-mcp, etc.)
**Status**: IDENTIFIED BUT NOT PRIORITIZED
**Pattern**: Dynamic SQL with template string building
**Examples**:
- `db.prepare(\`UPDATE orch_sessions SET ${updates.join(", ")} WHERE id = ?\`)`
- Builds SET clauses dynamically from user input

**Recommendation**:
- These are in MCP servers with limited external exposure
- Still need fixing but lower priority than main extension

### ⚠️ Test Files
**Files**: overnight-test.ts, overnight-test.js
**Status**: TEST CODE - MEDIUM PRIORITY
**Note**: These are test harnesses, not production code

## Recommended Fix Strategy

### Phase 1: High Priority (Main Extension) ✅ IN PROGRESS
1. ✅ sidebar-ux.ts
2. 🔄 extension.ts (partial)
3. ⏳ sidebar-interactions.ts
4. ⏳ sidebar-sections.ts
5. ⏳ sidebar-full-ux.ts

### Phase 2: Supporting Files
6. claude-bridge.ts
7. projectTreeProvider.ts
8. projectContextPanel.ts
9. daemon-session.ts

### Phase 3: Legacy Code (NEEDS ARCHITECTURAL DECISION)
10. sqliteDatabase.ts - **REQUIRES MIGRATION PLAN**
    - Options:
      a. Full migration to better-sqlite3
      b. Deprecate and remove entirely
      c. Wrap CLI calls with sanitization layer (NOT RECOMMENDED)

### Phase 4: MCP Servers
11. tarx-ops/src/server.ts
12. tarx-orchestration-mcp/src/server.ts
13. ~~tarx-observer-mcp-server/src/storage.ts~~ (REMOVED - server deleted)

### Phase 5: Test Code
14. overnight-test.ts
15. overnight-test.js

## Technical Notes

### Available Secure Functions
From `extensions/tarx/src/secureDatabase.ts`:
```typescript
// Query functions
queryAll<T>(sql: string, ...params: any[]): T[]
queryOne<T>(sql: string, ...params: any[]): T | undefined

// Write functions
execute(sql: string, ...params: any[]): number
executeTransaction(operations: Array<[string, ...any[]]>): boolean

// Database instance
getDB(): Database.Database
```

### Common Patterns to Fix

#### Pattern 1: SELECT with WHERE
```typescript
// Before
const row = queryDB(`SELECT * FROM projects WHERE id = '${id.replace(/'/g, "''")}'`);

// After
const row = queryOne<Project>('SELECT * FROM projects WHERE id = ?', id);
```

#### Pattern 2: UPDATE
```typescript
// Before
execSync(sqlite3, { input: `UPDATE projects SET name = '${escaped}' WHERE id = '${id}'` });

// After
execute('UPDATE projects SET name = ? WHERE id = ?', name, id);
```

#### Pattern 3: INSERT
```typescript
// Before
db.run(`INSERT INTO files (id, name) VALUES ('${id}', '${name}')`);

// After
execute('INSERT INTO files (id, name) VALUES (?, ?)', id, name);
```

#### Pattern 4: Dynamic SET clauses (MCP servers)
```typescript
// Before (VULNERABLE)
const updates = Object.keys(changes).map(k => `${k} = '${changes[k]}'`);
db.run(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`, id);

// After (SECURE)
const keys = Object.keys(changes);
const placeholders = keys.map(() => '?').join(', ');
const setClause = keys.map(k => `${k} = ?`).join(', ');
execute(`UPDATE sessions SET ${setClause} WHERE id = ?`, ...Object.values(changes), id);
```

## Acceptance Criteria
- [ ] No SQL queries use string interpolation in staged files
- [ ] All queries use parameterized `?` placeholders
- [ ] `yarn compile` passes with 0 errors
- [ ] No grep matches for: `\$\{.*\}.*\.(run|get|all|exec)\(`

## Security Impact
**HIGH** - These vulnerabilities could allow:
- Data exfiltration
- Database corruption
- Privilege escalation (if multi-user support added)
- Bypass of access controls

## Timeline
- Phase 1 Started: 2026-02-11
- Phase 1 Target: 2026-02-11 (same day)
- Full completion: TBD (depends on sqliteDatabase.ts migration decision)
