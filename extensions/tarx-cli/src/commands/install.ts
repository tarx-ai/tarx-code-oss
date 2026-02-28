/**
 * tarx install <workbench|daemon> -- Install TARX components.
 *
 * tarx install workbench:
 *   Downloads the latest DMG from GitHub Releases,
 *   mounts it, copies TARX Workbench.app to /Applications,
 *   unmounts, and cleans up.
 *
 * tarx install daemon:
 *   Installs the launchd plist for boot persistence.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { resolve } from 'path';
import { homedir, tmpdir } from 'os';
import { header, footer, brand, icon, cta, section } from '../format';
import { thinkingSpinner } from '../feedback';

const GITHUB_RELEASE_API = 'https://api.github.com/repos/tarx-ai/tarx-code-oss/releases/latest';
const APP_NAME = 'TARX Workbench.app';
const INSTALL_DIR = '/Applications';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface ReleaseInfo {
  tag_name: string;
  assets: ReleaseAsset[];
}

async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const res = await fetch(GITHUB_RELEASE_API, {
    headers: { 'User-Agent': 'tarx-cli' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<ReleaseInfo>;
}

function findDmgAsset(release: ReleaseInfo): ReleaseAsset | null {
  return release.assets.find(a => a.name.endsWith('.dmg')) || null;
}

function formatSize(bytes: number): string {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

async function downloadFile(url: string, dest: string, label?: string): Promise<void> {
  // Use curl for progress bar (fetch lacks streaming progress in Node)
  return new Promise((resolve, reject) => {
    const args = ['-fSL', '--progress-bar', '-o', dest, url];
    const child = spawn('curl', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`curl exit ${code}`)));
    child.on('error', reject);
  });
}

async function installWorkbench(): Promise<void> {
  header('Install', 'TARX Workbench');

  // Check if already installed
  const appPath = resolve(INSTALL_DIR, APP_NAME);
  if (existsSync(appPath)) {
    console.log(`  ${icon.info} ${APP_NAME} already in ${INSTALL_DIR}`);
    console.log(`  ${brand.dim('Will update to latest version.')}\n`);
  }

  // Fetch release info
  const spin = thinkingSpinner('Fetching latest release');
  let release: ReleaseInfo;
  try {
    release = await fetchLatestRelease();
    spin.stop(`Latest: ${release.tag_name}`);
  } catch (e: any) {
    spin.stop(`${icon.error} ${e.message}`);
    return;
  }

  const asset = findDmgAsset(release);
  if (!asset) {
    console.log(`  ${icon.error} No DMG found in release ${release.tag_name}`);
    return;
  }

  console.log(`  ${icon.arrow} ${asset.name} (${formatSize(asset.size)})\n`);

  // Download
  const tmpPath = resolve(tmpdir(), asset.name);
  section('Download');
  try {
    await downloadFile(asset.browser_download_url, tmpPath);
  } catch (e: any) {
    console.log(`\n  ${icon.error} Download failed: ${e.message}`);
    return;
  }

  // Verify download exists and has reasonable size
  try {
    const stat = statSync(tmpPath);
    if (stat.size < 10_000_000) {
      console.log(`\n  ${icon.error} Downloaded file too small (${formatSize(stat.size)}). Aborting.`);
      try { unlinkSync(tmpPath); } catch {}
      return;
    }
  } catch {
    console.log(`\n  ${icon.error} Download file not found`);
    return;
  }

  // Mount DMG
  section('Install');
  const mountSpin = thinkingSpinner('Mounting DMG');
  let mountPoint: string;
  try {
    const output = execSync(`hdiutil attach "${tmpPath}" -nobrowse -noverify -noautoopen 2>&1`, { encoding: 'utf8' });
    // Parse mount point from hdiutil output (last column of last line)
    const lines = output.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const match = lastLine.match(/\s+(\/Volumes\/.+)$/);
    if (!match) throw new Error('Could not parse mount point');
    mountPoint = match[1].trim();
    mountSpin.stop(`Mounted at ${mountPoint}`);
  } catch (e: any) {
    mountSpin.stop(`${icon.error} Mount failed: ${e.message}`);
    try { unlinkSync(tmpPath); } catch {}
    return;
  }

  // Copy app to /Applications
  const copySpin = thinkingSpinner(`Copying to ${INSTALL_DIR}`);
  try {
    // Remove existing first if present
    if (existsSync(appPath)) {
      execSync(`rm -rf "${appPath}"`);
    }
    execSync(`cp -R "${mountPoint}/${APP_NAME}" "${INSTALL_DIR}/"`);
    copySpin.stop(`${icon.success} Installed to ${appPath}`);
  } catch (e: any) {
    copySpin.stop(`${icon.error} Copy failed: ${e.message}`);
    console.log(`  ${brand.dim('You may need to run with sudo or close TARX first.')}`);
    // Still unmount + cleanup
    try { execSync(`hdiutil detach "${mountPoint}" -quiet`); } catch {}
    try { unlinkSync(tmpPath); } catch {}
    return;
  }

  // Unmount and cleanup
  try { execSync(`hdiutil detach "${mountPoint}" -quiet`); } catch {}
  try { unlinkSync(tmpPath); } catch {}

  // Verify
  if (existsSync(appPath)) {
    console.log(`\n  ${icon.success} ${brand.bold('TARX Workbench')} installed successfully\n`);
    cta('Launch TARX Workbench', `open "${appPath}"`);
  } else {
    console.log(`\n  ${icon.error} Installation could not be verified`);
  }

  footer('local', { version: release.tag_name });
}

export async function install(args: string[]): Promise<void> {
  const target = args[0]?.toLowerCase();

  if (!target || target === '--help' || target === '-h') {
    console.log('Usage: tarx install <component>\n');
    console.log('Components:');
    console.log('  workbench    Download & install TARX Workbench.app');
    console.log('  daemon       Install daemon for boot persistence');
    return;
  }

  switch (target) {
    case 'workbench':
    case 'app':
      await installWorkbench();
      break;

    case 'daemon':
      // Delegate to daemon install handler
      const { execSync: es } = require('child_process');
      const plistSrc = resolve(__dirname, '..', '..', 'com.tarx.daemon.plist');
      const plistDst = resolve(homedir(), 'Library/LaunchAgents/com.tarx.daemon.plist');
      if (!existsSync(plistSrc)) {
        console.log(`  ${icon.error} Plist not found: ${plistSrc}`);
        return;
      }
      mkdirSync(resolve(homedir(), 'Library/LaunchAgents'), { recursive: true });
      require('fs').copyFileSync(plistSrc, plistDst);
      try {
        es(`launchctl load "${plistDst}"`);
        console.log(`  ${icon.success} Daemon installed and loaded`);
      } catch {
        console.log(`  Plist copied. Run: launchctl load "${plistDst}"`);
      }
      break;

    default:
      console.log(`Unknown component: ${target}`);
      console.log('Available: workbench, daemon');
  }
}
