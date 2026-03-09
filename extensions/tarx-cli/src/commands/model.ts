/**
 * tarx model <status|download|list> -- Manage local AI models.
 *
 * status:   Check if inference + embedding models are present and healthy.
 * download: Download the default TARX model from HuggingFace.
 * list:     Show all detected model files.
 */

import { existsSync, readdirSync, statSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { findModel, findBinary, findEmbeddingModel, isInferenceRunning, isEmbeddingsRunning } from '../services/engine';
import { header, footer, brand, icon, section, cta } from '../format';
import { thinkingSpinner } from '../feedback';

const MODELS_DIR = resolve(homedir(), 'Library/Application Support/tarx/models');
const OLLAMA_BLOBS = resolve(homedir(), '.ollama/models/blobs');

const DEFAULT_MODEL = {
  name: 'tarx-v3.Q4_K_M.gguf',
  url: 'https://huggingface.co/tarx-ai/tarx-v3/resolve/main/tarx-v3.Q4_K_M.gguf',
  size: '4.7 GB',
};

function formatSize(bytes: number): string {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

async function modelStatus(): Promise<void> {
  header('Model', 'Status');

  // Binary
  section('Binary');
  const binary = findBinary();
  if (binary) {
    console.log(`  ${icon.success} llama-server: ${brand.dim(binary)}`);
  } else {
    console.log(`  ${icon.error} llama-server: ${brand.red('not found')}`);
    cta('Install llama-server', 'curl -fsSL tarx.com/install | sh');
  }

  // Inference model
  section('Inference Model');
  const model = findModel();
  if (model) {
    try {
      const size = statSync(model).size;
      console.log(`  ${icon.success} ${brand.bold(resolve(model).split('/').pop() || model)}`);
      console.log(`  ${brand.dim(`${formatSize(size)} at ${model}`)}`);
    } catch {
      console.log(`  ${icon.success} ${model}`);
    }
  } else {
    console.log(`  ${icon.error} No inference model found`);
    cta('Download the default model', 'tarx model download');
  }

  // Inference health
  const infRunning = await isInferenceRunning();
  console.log(`  ${infRunning ? icon.success : icon.warning} Inference server: ${infRunning ? brand.green('running') : brand.yellow('stopped')} (:11435)`);

  // Embedding model
  section('Embedding Model');
  const embModel = findEmbeddingModel();
  if (embModel) {
    try {
      const size = statSync(embModel).size;
      console.log(`  ${icon.success} nomic-embed-text-v1.5`);
      console.log(`  ${brand.dim(`${formatSize(size)} at ${embModel}`)}`);
    } catch {
      console.log(`  ${icon.success} ${embModel}`);
    }
  } else {
    console.log(`  ${icon.error} No embedding model found`);
    console.log(`  ${brand.dim('Expected sha256-970aa74c* in ~/.ollama/models/blobs/')}`);
    cta('Install via Ollama', 'ollama pull nomic-embed-text');
  }

  // Embeddings health
  const embRunning = await isEmbeddingsRunning();
  console.log(`  ${embRunning ? icon.success : icon.warning} Embedding server: ${embRunning ? brand.green('running') : brand.yellow('stopped')} (:11437)`);

  footer('local', {});
}

async function downloadModel(): Promise<void> {
  header('Model', 'Download');

  // Check if already present
  const dest = resolve(MODELS_DIR, DEFAULT_MODEL.name);
  if (existsSync(dest)) {
    const size = statSync(dest).size;
    if (size > 500 * 1024 * 1024) {
      console.log(`  ${icon.success} Model already downloaded: ${DEFAULT_MODEL.name} (${formatSize(size)})`);
      return;
    }
    console.log(`  ${icon.warning} Existing file too small (${formatSize(size)}), re-downloading.`);
  }

  console.log(`  ${icon.info} ${brand.bold(DEFAULT_MODEL.name)}`);
  console.log(`  ${brand.dim(`Size: ~${DEFAULT_MODEL.size}`)}`);
  console.log(`  ${brand.dim(`From: huggingface.co/tarx-ai`)}\n`);

  mkdirSync(MODELS_DIR, { recursive: true });

  section('Downloading');
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('curl', [
        '-fSL', '--progress-bar',
        '-o', dest,
        DEFAULT_MODEL.url,
      ], { stdio: ['ignore', 'inherit', 'inherit'] });
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`curl exit ${code}`)));
      child.on('error', reject);
    });
  } catch (e: any) {
    console.log(`\n  ${icon.error} Download failed: ${e.message}`);
    return;
  }

  // Verify
  try {
    const size = statSync(dest).size;
    if (size > 500 * 1024 * 1024) {
      console.log(`\n  ${icon.success} Downloaded ${DEFAULT_MODEL.name} (${formatSize(size)})`);
      cta('Start the engine', 'tarx daemon start');
    } else {
      console.log(`\n  ${icon.error} File too small (${formatSize(size)}). Download may be corrupted.`);
    }
  } catch {
    console.log(`\n  ${icon.error} Could not verify download`);
  }

  footer('local', {});
}

function listModels(): void {
  header('Model', 'List');

  const dirs = [
    { label: 'TARX Models', path: MODELS_DIR },
    { label: 'Ollama Blobs', path: OLLAMA_BLOBS },
  ];

  let total = 0;

  for (const { label, path: dir } of dirs) {
    section(label);
    if (!existsSync(dir)) {
      console.log(`  ${brand.dim('(not found)')}`);
      continue;
    }

    try {
      const entries = readdirSync(dir);
      const models: { name: string; size: number }[] = [];

      for (const e of entries) {
        const full = resolve(dir, e);
        try {
          const stat = statSync(full);
          // Only show files > 100MB (likely model files)
          if (stat.isFile() && stat.size > 100 * 1024 * 1024) {
            models.push({ name: e, size: stat.size });
          }
        } catch {}
      }

      if (models.length === 0) {
        console.log(`  ${brand.dim('No model files found')}`);
      } else {
        models.sort((a, b) => b.size - a.size);
        for (const m of models) {
          const sizeStr = formatSize(m.size).padStart(8);
          console.log(`  ${icon.info} ${sizeStr}  ${m.name}`);
          total++;
        }
      }
    } catch {
      console.log(`  ${brand.dim('Could not read directory')}`);
    }
  }

  console.log(`\n  ${brand.dim(`${total} model file${total !== 1 ? 's' : ''} found`)}`);
  footer('local', {});
}

export async function model(args: string[]): Promise<void> {
  const sub = args[0]?.toLowerCase();

  if (!sub || sub === '--help' || sub === '-h') {
    console.log('Usage: tarx model <command>\n');
    console.log('Commands:');
    console.log('  status     Check model availability and server health');
    console.log('  download   Download the default TARX inference model');
    console.log('  list       List all detected model files');
    return;
  }

  switch (sub) {
    case 'status':
      await modelStatus();
      break;
    case 'download':
    case 'pull':
      await downloadModel();
      break;
    case 'list':
    case 'ls':
      listModels();
      break;
    default:
      console.log(`Unknown subcommand: ${sub}`);
      console.log('Available: status, download, list');
  }
}
