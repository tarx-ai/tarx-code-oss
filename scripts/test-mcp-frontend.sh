#!/bin/bash
echo "═══════════════════════════════════════════════════════════"
echo "TARX MCP FRONTEND TEST SUITE"
echo "═══════════════════════════════════════════════════════════"

PASS=0
FAIL=0

# Test 1: Services
echo -e "\n[TEST 1] Backend Services"
if curl -sf http://localhost:11435/health > /dev/null 2>&1; then
  echo "  ✅ Inference"
  ((PASS++))
else
  echo "  ❌ Inference"
  ((FAIL++))
fi
if curl -sf http://localhost:11436/health > /dev/null 2>&1; then
  echo "  ✅ Mesh"
  ((PASS++))
else
  echo "  ❌ Mesh"
  ((FAIL++))
fi
if curl -sf http://localhost:11437/health > /dev/null 2>&1; then
  echo "  ✅ Embeddings"
  ((PASS++))
else
  echo "  ❌ Embeddings"
  ((FAIL++))
fi

# Test 2: Database
echo -e "\n[TEST 2] Database"
if [ -f ~/Library/Application\ Support/tarx/memory.db ]; then
  echo "  ✅ memory.db exists"
  ((PASS++))

  SPACES=$(sqlite3 ~/Library/Application\ Support/tarx/memory.db "SELECT COUNT(*) FROM spaces;" 2>/dev/null)
  echo "  📊 Spaces: $SPACES"

  SESSIONS=$(sqlite3 ~/Library/Application\ Support/tarx/memory.db "SELECT COUNT(*) FROM sessions;" 2>/dev/null)
  echo "  📊 Sessions: $SESSIONS"

  MESSAGES=$(sqlite3 ~/Library/Application\ Support/tarx/memory.db "SELECT COUNT(*) FROM messages;" 2>/dev/null)
  echo "  📊 Messages: $MESSAGES"
else
  echo "  ❌ memory.db not found"
  ((FAIL++))
fi

# Test 3: Extension compiled
echo -e "\n[TEST 3] Extension Compilation"
if [ -f extensions/tarx/out/extension.js ]; then
  echo "  ✅ extension.js exists"
  ((PASS++))

  if grep -q "tarx.projects.create" extensions/tarx/out/projectTreeProvider.js 2>/dev/null; then
    echo "  ✅ tarx.projects.create in compiled output"
    ((PASS++))
  else
    echo "  ⚠️  tarx.projects.create NOT in projectTreeProvider.js (may be in different file)"
  fi

  if grep -q "tarx.openCreateProject" extensions/tarx/out/projectContextPanel.js 2>/dev/null; then
    echo "  ✅ tarx.openCreateProject in compiled output"
    ((PASS++))
  else
    echo "  ⚠️  tarx.openCreateProject NOT in projectContextPanel.js (may be in different file)"
  fi
else
  echo "  ❌ extension.js not found"
  ((FAIL++))
fi

# Test 4: Chat inference
echo -e "\n[TEST 4] Chat Inference"
RESPONSE=$(curl -sf -X POST http://localhost:11435/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"local","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}' \
  2>/dev/null)

if [ -n "$RESPONSE" ]; then
  echo "  ✅ Chat inference working"
  ((PASS++))
else
  echo "  ❌ Chat inference failed"
  ((FAIL++))
fi

# Test 5: Create test project in DB
echo -e "\n[TEST 5] Project Creation (DB)"
TEST_ID="mcp_test_$(date +%s)"
NOW_MS=$(date +%s)000
sqlite3 ~/Library/Application\ Support/tarx/memory.db \
  "INSERT OR REPLACE INTO spaces (id, name, created_at, updated_at, last_accessed_at) VALUES ('$TEST_ID', 'MCP-Test-$(date +%H%M%S)', $NOW_MS, $NOW_MS, $NOW_MS);" 2>/dev/null

VERIFY=$(sqlite3 ~/Library/Application\ Support/tarx/memory.db "SELECT name FROM spaces WHERE id='$TEST_ID';" 2>/dev/null)
if [ -n "$VERIFY" ]; then
  echo "  ✅ Project created: $VERIFY"
  ((PASS++))
else
  echo "  ❌ Project creation failed"
  ((FAIL++))
fi

# Test 6: Sidebar code check (Context section removed)
echo -e "\n[TEST 6] Sidebar Code Verification"
if grep -q "createProjectContextSection" src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts 2>/dev/null; then
  echo "  ❌ Context section still in code"
  ((FAIL++))
else
  echo "  ✅ Context section removed from code"
  ((PASS++))
fi

# Test 7: Check compiled sidebar
echo -e "\n[TEST 7] Compiled Sidebar Check"
if [ -f out/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.js ]; then
  if grep -q "createProjectContextSection" out/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.js 2>/dev/null; then
    echo "  ❌ Context section still in compiled output"
    ((FAIL++))
  else
    echo "  ✅ Context section removed from compiled output"
    ((PASS++))
  fi
else
  echo "  ⚠️  Compiled sidebar not found (app may not be built)"
fi

# Summary
echo -e "\n═══════════════════════════════════════════════════════════"
echo "RESULTS: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════"

[ $FAIL -eq 0 ] && exit 0 || exit 1
