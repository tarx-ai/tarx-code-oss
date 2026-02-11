#!/bin/bash

# Workbench Build Audit Script
# Verifies branding, checks for old artifacts, ensures clean build

set -e

PROJECT_ROOT="/Users/master/Desktop/tarx-code-oss"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "Workbench Build Audit"
echo "=================================================="
echo ""

# Function: Check file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 MISSING"
        return 1
    fi
}

# Function: Check dir exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${YELLOW}⊘${NC} $1 not found (ok if cleaning)"
        return 1
    fi
}

# Function: Grep for value
check_value() {
    local file="$1"
    local pattern="$2"

    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $file contains '$pattern'"
        return 0
    else
        echo -e "${RED}✗${NC} $file MISSING '$pattern'"
        return 1
    fi
}

# ============================================================================
# SECTION 1: PROJECT STRUCTURE
# ============================================================================
echo ""
echo -e "${YELLOW}[1] PROJECT STRUCTURE${NC}"
echo "=================================================="

cd "$PROJECT_ROOT"

check_dir "src"
check_dir "extensions"
check_dir "extensions/tarx-local"
check_dir "extensions/tarx-supercomputer"
check_dir "extensions/tarx"
check_dir "build"
check_dir "scripts"
check_file "product.json"
check_file "package.json"
check_file "scripts/code.sh"

# ============================================================================
# SECTION 2: BRANDING VERIFICATION
# ============================================================================
echo ""
echo -e "${YELLOW}[2] BRANDING VERIFICATION${NC}"
echo "=================================================="

echo ""
echo "Checking product.json for TARX branding:"
check_value "product.json" '"nameShort": "TARX"' || echo "ERROR: Should have TARX branding"
check_value "product.json" '"applicationName": "tarx"' || echo "ERROR: Should have tarx app name"
check_value "product.json" '"darwinBundleIdentifier": "com.tarx.code"' || echo "ERROR: Should have TARX bundle ID"

# ============================================================================
# SECTION 3: ICONS
# ============================================================================
echo ""
echo -e "${YELLOW}[3] ICON FILES${NC}"
echo "=================================================="

echo ""
echo "Checking icon files:"
if [ -f "resources/darwin/code.icns" ]; then
    SIZE=$(ls -lh "resources/darwin/code.icns" | awk '{print $5}')
    echo -e "${GREEN}✓${NC} resources/darwin/code.icns (size: $SIZE)"
else
    echo -e "${YELLOW}⊘${NC} resources/darwin/code.icns not found"
fi

if [ -f "resources/win32/code.ico" ]; then
    SIZE=$(ls -lh "resources/win32/code.ico" | awk '{print $5}')
    echo -e "${GREEN}✓${NC} resources/win32/code.ico (size: $SIZE)"
else
    echo -e "${YELLOW}⊘${NC} resources/win32/code.ico not found"
fi

# ============================================================================
# SECTION 4: EXTENSIONS
# ============================================================================
echo ""
echo -e "${YELLOW}[4] EXTENSIONS${NC}"
echo "=================================================="

echo ""
echo "Checking extension files:"
check_file "extensions/tarx/package.json"
check_file "extensions/tarx/src/extension.ts"
check_file "extensions/tarx-local/package.json"
check_file "extensions/tarx-local/src/extension.ts"
check_file "extensions/tarx-local/src/design-tokens.ts"
check_file "extensions/tarx-local/src/icons.ts"
check_file "extensions/tarx-supercomputer/package.json"
check_file "extensions/tarx-supercomputer/src/extension.ts"

# ============================================================================
# SECTION 5: BUILD ARTIFACTS (TO CLEAN)
# ============================================================================
echo ""
echo -e "${YELLOW}[5] BUILD ARTIFACTS${NC}"
echo "=================================================="

echo ""
echo "Checking for old build artifacts:"

if [ -d "out" ]; then
    echo -e "${YELLOW}⚠${NC}  out/ directory exists"
    COUNT=$(find out -type f | wc -l | tr -d ' ')
    echo "      $COUNT files found"
    echo "      Delete with: rm -rf out/"
else
    echo -e "${GREEN}✓${NC} out/ directory clean"
fi

if [ -d ".build" ]; then
    echo -e "${YELLOW}⚠${NC}  .build/ directory exists"
    COUNT=$(find .build -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "      $COUNT files found"
    echo "      Delete with: rm -rf .build/"
else
    echo -e "${GREEN}✓${NC} .build/ directory clean"
fi

if [ -d "dist" ]; then
    echo -e "${YELLOW}⚠${NC}  dist/ directory exists"
    COUNT=$(find dist -type f 2>/dev/null | wc -l | tr -d ' ')
    echo "      $COUNT files found"
else
    echo -e "${GREEN}✓${NC} dist/ directory clean"
fi

# ============================================================================
# SECTION 6: CACHE CLEANUP STATUS
# ============================================================================
echo ""
echo -e "${YELLOW}[6] SYSTEM CACHES${NC}"
echo "=================================================="

echo ""
echo "Checking macOS caches:"

if [ -d "$HOME/Library/Caches/Electron/" ]; then
    SIZE=$(du -sh "$HOME/Library/Caches/Electron/" 2>/dev/null | awk '{print $1}' || echo "?")
    echo -e "${YELLOW}⚠${NC}  Electron cache exists ($SIZE)"
    echo "      Delete with: rm -rf ~/Library/Caches/Electron/"
else
    echo -e "${GREEN}✓${NC} Electron cache clean"
fi

if [ -d "$HOME/Library/Application Support/Code-OSS/" ]; then
    SIZE=$(du -sh "$HOME/Library/Application Support/Code-OSS/" 2>/dev/null | awk '{print $1}' || echo "?")
    echo -e "${YELLOW}⚠${NC}  Code-OSS app data exists ($SIZE)"
    echo "      Delete with: rm -rf ~/Library/Application\\ Support/Code-OSS/"
else
    echo -e "${GREEN}✓${NC} Code-OSS cache clean"
fi

if [ -d "$HOME/Library/Application Support/code-oss-dev/" ]; then
    SIZE=$(du -sh "$HOME/Library/Application Support/code-oss-dev/" 2>/dev/null | awk '{print $1}' || echo "?")
    echo -e "${GREEN}✓${NC} TARX dev data found ($SIZE)"
fi

# ============================================================================
# SECTION 7: COMPILED EXTENSIONS
# ============================================================================
echo ""
echo -e "${YELLOW}[7] COMPILED EXTENSIONS${NC}"
echo "=================================================="

echo ""
echo "Checking compiled extension output:"
check_file "extensions/tarx/out/extension.js" || echo "      Will be created after npm run compile"
check_file "extensions/tarx-local/out/extension.js" || echo "      Will be created after npm run compile"
check_file "extensions/tarx-supercomputer/out/extension.js" || echo "      Will be created after npm run compile"

# ============================================================================
# SECTION 8: DESIGN SYSTEM
# ============================================================================
echo ""
echo -e "${YELLOW}[8] DESIGN SYSTEM${NC}"
echo "=================================================="

echo ""
echo "Checking design system files:"
check_file "extensions/tarx-local/src/design-tokens.ts"
check_file "extensions/tarx-local/src/icons.ts"
check_file "extensions/tarx-local/DESIGN_SYSTEM.md"

# ============================================================================
# SECTION 9: SUMMARY
# ============================================================================
echo ""
echo -e "${YELLOW}[SUMMARY]${NC}"
echo "=================================================="

echo ""
echo -e "${GREEN}BRANDING:${NC}"
grep -o '"nameShort": "[^"]*"' product.json 2>/dev/null || echo "  Could not read nameShort"
grep -o '"applicationName": "[^"]*"' product.json 2>/dev/null || echo "  Could not read applicationName"
echo ""

echo -e "${GREEN}BUILD COMMANDS:${NC}"
echo "  npm install          # Install dependencies"
echo "  npm run compile      # Compile TypeScript"
echo "  ./scripts/code.sh    # Test launch"
echo ""

echo -e "${YELLOW}CLEANUP (if needed):${NC}"
echo "  rm -rf out/ .build/ dist/"
echo "  rm -rf ~/Library/Caches/Electron/"
echo ""

echo "=================================================="
echo "Audit complete!"
echo "=================================================="
