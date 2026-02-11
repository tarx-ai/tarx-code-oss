#!/bin/bash
# test-tarx-v1.sh

echo "=== TARX V1 Test Suite ==="

cd /Users/master/Desktop/tarx-code-oss

# 1. Check build compiles
echo -e "\n[TEST 1] Build compilation..."
BUILD_OUTPUT=$(npm run compile 2>&1)
if echo "$BUILD_OUTPUT" | grep -E "(error TS|Error:|'compile' errored)" > /dev/null; then
    echo "❌ FAIL: Build errors"
    echo "$BUILD_OUTPUT" | grep -E "(error TS|Error:|errored)" | head -5
else
    echo "✅ PASS: Build clean"
fi

# 2. Check llama-server health
echo -e "\n[TEST 2] llama-server health..."
curl -s http://localhost:11435/health | grep -q "ok" && echo "✅ PASS: llama-server running" || echo "❌ FAIL: llama-server not responding"

# 3. Check mesh API health
echo -e "\n[TEST 3] Mesh API health..."
curl -s http://localhost:11436/health | grep -q "ok" && echo "✅ PASS: Mesh API running" || echo "⚠️ SKIP: Mesh API not running"

# 4. Check embedding server
echo -e "\n[TEST 4] Embedding server health..."
curl -s http://localhost:11437/health | grep -q "ok" && echo "✅ PASS: Embedding server running" || echo "⚠️ SKIP: Embedding server not running"

# 5. Check extension compiles
echo -e "\n[TEST 5] TARX extension..."
ls extensions/tarx/out/extension.js && echo "✅ PASS: Extension compiled" || echo "❌ FAIL: Extension not compiled"

# 6. Check sidebar part exists
echo -e "\n[TEST 6] TARX Sidebar..."
ls out/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.js && echo "✅ PASS: Sidebar compiled" || echo "❌ FAIL: Sidebar not compiled"

# 7. Check database location
echo -e "\n[TEST 7] Database..."
DB_PATH="$HOME/Library/Application Support/code-oss-dev/User/globalStorage/tarx-ai.tarx/tarx.db"
[ -f "$DB_PATH" ] && echo "✅ PASS: Database exists" || echo "⚠️ INFO: Database will be created on first run"

# 8. List recent git commits
echo -e "\n[TEST 8] Recent commits..."
git log --oneline -5

echo -e "\n=== Test Summary ==="
echo "Run ./scripts/code.sh to launch TARX and test UI manually"
