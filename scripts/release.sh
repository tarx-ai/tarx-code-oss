#!/bin/bash
set -e

VERSION=$1
if [ -z "$VERSION" ]; then
  echo "Usage: ./scripts/release.sh 1.0.1"
  exit 1
fi

echo "=== TARX Workbench Release v$VERSION ==="

IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*"\(.*\)"/\1/')
if [ -z "$IDENTITY" ]; then
  echo "FATAL: No Developer ID Application certificate found"
  exit 1
fi
echo "Identity: $IDENTITY"

ENT="$(cd "$(dirname "$0")/.." && pwd)/entitlements.plist"
if [ ! -f "$ENT" ]; then
  echo "FATAL: entitlements.plist not found at $ENT"
  exit 1
fi

# Step 1: Build macOS arm64
echo ""
echo "=== Step 1: Building macOS arm64 ==="
cd ~/Desktop/tarx-code-oss
yarn compile 2>&1 | tail -3
yarn gulp vscode-darwin-arm64 2>&1 | tail -5

# Step 2: Find the app
APP_PATH=$(find ~/Desktop -maxdepth 2 -name "TARX Workbench.app" -not -path '*/node_modules/*' -not -path '*/tarx-signing/*' 2>/dev/null | head -1)
if [ -z "$APP_PATH" ]; then
  echo "FATAL: TARX Workbench.app not found after build"
  exit 1
fi

# Copy to signing directory
rm -rf ~/Desktop/tarx-signing
mkdir -p ~/Desktop/tarx-signing
cp -R "$APP_PATH" ~/Desktop/tarx-signing/
APP_PATH="$HOME/Desktop/tarx-signing/TARX Workbench.app"
echo "Signing: $APP_PATH"

# Step 3: Remove quarantine and sign
echo ""
echo "=== Step 3: Signing ==="
xattr -rc "$APP_PATH"

# Sign dylibs
find "$APP_PATH" -name '*.dylib' -print0 | while IFS= read -r -d '' file; do
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$file" 2>/dev/null
done
echo "  dylibs signed"

# Sign .node modules
find "$APP_PATH" -name '*.node' -print0 | while IFS= read -r -d '' file; do
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$file" 2>/dev/null
done
echo "  .node modules signed"

# Sign known standalone executables
for exe in \
  "$APP_PATH/Contents/Resources/app/extensions/tarx-local/binaries/llama-server-darwin-arm64" \
  "$APP_PATH/Contents/Resources/app/extensions/tarx-local/binaries/tarx-mesh" \
  "$APP_PATH/Contents/Resources/app/node_modules/@vscode/ripgrep/bin/rg" \
  "$APP_PATH/Contents/Resources/app/node_modules/node-pty/build/Release/spawn-helper" \
  "$APP_PATH/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler" \
  "$APP_PATH/Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt"
do
  [ -f "$exe" ] && codesign --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENT" "$exe" 2>/dev/null
done
echo "  executables signed"

# Sign frameworks
for fw in \
  "$APP_PATH/Contents/Frameworks/Mantle.framework" \
  "$APP_PATH/Contents/Frameworks/ReactiveObjC.framework" \
  "$APP_PATH/Contents/Frameworks/Squirrel.framework" \
  "$APP_PATH/Contents/Frameworks/Electron Framework.framework"
do
  [ -d "$fw" ] && codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" "$fw" 2>/dev/null
done
echo "  frameworks signed"

# Sign helper apps
find "$APP_PATH" -name '*.app' -type d -not -samefile "$APP_PATH" -print0 | while IFS= read -r -d '' helper; do
  codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENT" "$helper" 2>/dev/null
done
echo "  helper apps signed"

# Sign main Electron binary and .app bundle
codesign --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENT" "$APP_PATH/Contents/MacOS/Electron" 2>/dev/null
codesign --force --deep --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENT" "$APP_PATH" 2>&1
echo "  main app signed"

# Verify
codesign --verify --deep --strict "$APP_PATH" 2>&1
echo "  signature verified"

# Step 4: Create DMG
echo ""
echo "=== Step 4: Creating DMG ==="
DMG_NAME="TARX-Workbench-${VERSION}-arm64.dmg"
mkdir -p ~/Desktop/tarx-releases/
hdiutil create -volname "TARX Workbench" -srcfolder ~/Desktop/tarx-signing/ -ov -format UDZO ~/Desktop/tarx-releases/$DMG_NAME 2>&1
codesign --force --timestamp --sign "$IDENTITY" ~/Desktop/tarx-releases/$DMG_NAME 2>&1
echo "  DMG created: ~/Desktop/tarx-releases/$DMG_NAME"

# Step 5: Notarize
echo ""
echo "=== Step 5: Notarizing (5-15 min) ==="
xcrun notarytool submit ~/Desktop/tarx-releases/$DMG_NAME --keychain-profile "AC_PASSWORD" --wait 2>&1
xcrun stapler staple ~/Desktop/tarx-releases/$DMG_NAME 2>&1
echo "  notarized and stapled"

# Step 6: Create GitHub release
echo ""
echo "=== Step 6: Publishing ==="
SHA=$(shasum -a 256 ~/Desktop/tarx-releases/$DMG_NAME | awk '{print $1}')

gh release create "v$VERSION" \
  ~/Desktop/tarx-releases/$DMG_NAME \
  --title "TARX Workbench v$VERSION" \
  --notes "SHA256: \`$SHA\`" \
  --repo tarx-ai/tarx-code-oss

echo ""
echo "=== DONE ==="
echo "DMG:     ~/Desktop/tarx-releases/$DMG_NAME"
echo "SHA256:  $SHA"
echo "Size:    $(ls -lh ~/Desktop/tarx-releases/$DMG_NAME | awk '{print $5}')"
echo "Release: https://github.com/tarx-ai/tarx-code-oss/releases/tag/v$VERSION"
