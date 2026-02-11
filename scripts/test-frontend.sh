#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════════"
echo "TARX FRONTEND TEST SUITE"
echo "═══════════════════════════════════════════════════════════"

cd /Users/master/Desktop/tarx-code-oss

# Test 1: Check extension compiled
echo ""
echo "TEST 1: Extension compilation"
if [ -f "extensions/tarx/out/extension.js" ]; then
  echo "✅ extension.js exists"
  LINES=$(wc -l < extensions/tarx/out/extension.js)
  echo "   Lines: $LINES"
else
  echo "❌ extension.js NOT FOUND"
  exit 1
fi

# Test 2: Check command registrations in source
echo ""
echo "TEST 2: Command registrations in source"
echo "   Searching for tarx.projects.create..."
FOUND=$(grep -r "tarx.projects.create" extensions/tarx/src/ --include="*.ts" 2>/dev/null | wc -l)
if [ "$FOUND" -gt 0 ]; then
  echo "✅ tarx.projects.create found ($FOUND occurrences)"
  grep -rn "tarx.projects.create" extensions/tarx/src/ --include="*.ts" 2>/dev/null | head -5
else
  echo "❌ tarx.projects.create NOT found in source"
fi

# Test 3: Check package.json command definitions
echo ""
echo "TEST 3: Package.json commands"
CMDS=$(grep -c '"command"' extensions/tarx/package.json)
echo "   Total commands in package.json: $CMDS"
echo "   Project-related commands:"
grep '"tarx.project' extensions/tarx/package.json 2>/dev/null | head -10 || echo "   (none found)"

# Test 4: Check what + button calls
echo ""
echo "TEST 4: View title buttons (+ button)"
echo "   Checking menus.view/title..."
grep -A 5 '"view/title"' extensions/tarx/package.json 2>/dev/null | grep -i "tarx\|command" | head -10 || echo "   (no matches)"

# Test 5: Check sidebar calls
echo ""
echo "TEST 5: Sidebar command calls"
echo "   Checking tarxSidebarPart.ts..."
grep -n "tarx.projects" src/vs/workbench/browser/parts/tarxsidebar/tarxSidebarPart.ts 2>/dev/null | head -10 || echo "   File not found or no matches"

# Test 6: Check for command in compiled output
echo ""
echo "TEST 6: Compiled extension check"
if grep -q "tarx.projects.create" extensions/tarx/out/extension.js 2>/dev/null; then
  echo "✅ tarx.projects.create found in compiled output"
else
  echo "❌ tarx.projects.create NOT in compiled output"
fi

# Also check projectTreeProvider compiled output
echo "   Checking projectTreeProvider.js..."
if [ -f "extensions/tarx/out/projectTreeProvider.js" ]; then
  if grep -q "tarx.projects.create" extensions/tarx/out/projectTreeProvider.js 2>/dev/null; then
    echo "✅ tarx.projects.create found in projectTreeProvider.js"
  else
    echo "❌ tarx.projects.create NOT in projectTreeProvider.js"
  fi
else
  echo "⚠️ projectTreeProvider.js not found"
fi

# Test 7: Database check
echo ""
echo "TEST 7: Database state"
DB_PATH="$HOME/Library/Application Support/tarx/memory.db"
if [ -f "$DB_PATH" ]; then
  echo "✅ memory.db exists"
  echo "   Tables:"
  sqlite3 "$DB_PATH" ".tables" 2>/dev/null || echo "   (couldn't read)"
  echo "   Spaces count:"
  sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM spaces;" 2>/dev/null || echo "   (couldn't count)"
else
  echo "⚠️ memory.db not found at expected location"
fi

# Test 8: Services health
echo ""
echo "TEST 8: Backend services"
curl -s http://localhost:11435/health > /dev/null 2>&1 && echo "✅ Inference (11435): UP" || echo "❌ Inference (11435): DOWN"
curl -s http://localhost:11437/health > /dev/null 2>&1 && echo "✅ Embeddings (11437): UP" || echo "❌ Embeddings (11437): DOWN"

# Test 9: Check if command is registered in the right file
echo ""
echo "TEST 9: Registration location check"
echo "   Searching for safeRegister with tarx.projects.create..."
grep -rn "safeRegister.*tarx.projects.create\|registerCommand.*tarx.projects.create" extensions/tarx/src/ --include="*.ts" 2>/dev/null | head -5

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "FRONTEND TEST COMPLETE"
echo "═══════════════════════════════════════════════════════════"
