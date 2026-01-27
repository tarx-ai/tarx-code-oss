# TARX CODE V1 Build

**Date:** January 22, 2026
**Version:** 1.0.0
**Platform:** macOS (Apple Silicon arm64)

## Build Output

- **Application:** `/Users/master/Desktop/VSCode-darwin-arm64/TARX CODE.app`
- **Installer:** `/Users/master/Desktop/TARX-CODE-1.0.0-arm64.dmg`
- **App Size:** 448 MB
- **DMG Size:** 193 MB

## What's Included

- VS Code OSS base (Electron + Monaco Editor)
- @tarx chat participant extension
- Local llama-server integration (localhost:11435)
- TARX branding (custom icon, name, colors)
- No Copilot, no Microsoft authentication

## Known Limitations

- macOS Apple Silicon only (Intel/Windows/Linux builds planned for post-V1)
- Sentry error tracking disabled (caused EPIPE crash on shutdown, will re-enable with safe config post-launch)
- Default VS Code welcome screen (custom TARX welcome planned for post-V1)

## Build Commands Used

```bash
# Clean and compile
cd /Users/master/Desktop/tarx-code-oss
rm -rf out/ .build/
npm run compile

# Build macOS app (Apple Silicon)
npm run gulp vscode-darwin-arm64

# Create DMG installer
cd /Users/master/Desktop
hdiutil create -volname "TARX CODE" \
  -srcfolder "VSCode-darwin-arm64/TARX CODE.app" \
  -ov -format UDZO \
  "TARX-CODE-1.0.0-arm64.dmg"
```

## Installation Instructions

1. Open `TARX-CODE-1.0.0-arm64.dmg`
2. Drag "TARX CODE.app" to Applications folder
3. Launch from Applications
4. If prompted about unidentified developer:
   - Go to System Preferences > Privacy & Security
   - Click "Open Anyway" for TARX CODE
5. Open Chat panel: View > Chat (or Cmd+Shift+I)
6. Type: `@tarx hello` to test AI integration

## Verification Checklist

- [x] package.json: name="tarx-code", version="1.0.0"
- [x] product.json: nameShort="TARX", nameLong="TARX CODE"
- [x] Icons: tarx-code.icns, tarx-code.ico, tarx-code.png
- [x] Build completes with 0 errors
- [x] App bundle created with TARX icon
- [x] DMG installer created

## Files Modified for V1

### Sentry Disabled (Crash Fix)
- `src/vs/code/electron-main/main.ts` - Commented out Sentry.init()
- `src/vs/workbench/electron-browser/desktop.main.ts` - Commented out Sentry.init()
- `src/vs/workbench/api/node/extensionHostProcess.ts` - Commented out Sentry.init()

### Icon Configuration
- `build/lib/electron.ts` - Updated darwinIcon and winIcon paths

## Next Steps (Post-V1)

1. **Re-enable Sentry** with safe config (no console instrumentation):
   ```typescript
   Sentry.init({
     dsn: TARX_SENTRY_DSN,
     integrations: [], // No console instrumentation
     beforeSend(event) {
       if (process.exitCode !== undefined) return null;
       return event;
     },
   });
   ```

2. **Custom Welcome Screen** - Replace default VS Code welcome with TARX branding

3. **Additional Platforms:**
   - macOS Intel: `npm run gulp vscode-darwin-x64`
   - Windows: `npm run gulp vscode-win32-x64`
   - Linux: `npm run gulp vscode-linux-x64`

4. **Code Signing** - Sign the app for distribution outside App Store

5. **Auto-Update** - Implement update mechanism for future versions

---

Built with Claude Code assistance.
