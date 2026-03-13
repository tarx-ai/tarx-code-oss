import type { AgentManifest, AgentCategory } from '../types';

/**
 * Agent Registry — file-based agent discovery and registration.
 *
 * Adapted from MCP App Studio's component registry pattern:
 * - Static metadata array (like componentConfigs)
 * - CRUD operations on the registry file
 * - Collision detection before registration
 *
 * Registry lives at ~/.tarx/agents/registry.json
 * Agent bundles live at ~/.tarx/agents/{id}/
 *
 * This runs in Node.js (extension host), NOT in the webview.
 */

const REGISTRY_DIR = `${getHomedir()}/.tarx/agents`;
const REGISTRY_PATH = `${REGISTRY_DIR}/registry.json`;

function getHomedir(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
}

export async function listAgents(): Promise<AgentManifest[]> {
  try {
    const fs = await import('fs/promises');
    const raw = await fs.readFile(REGISTRY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getAgent(id: string): Promise<AgentManifest | null> {
  const agents = await listAgents();
  return agents.find(a => a.id === id) ?? null;
}

export async function registerAgent(manifest: AgentManifest): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Ensure directory exists
    await fs.mkdir(REGISTRY_DIR, { recursive: true });

    // Load existing
    const existing = await listAgents();

    // Collision check: same id must be same author (update) or not exist
    const collision = existing.find(
      a => a.id === manifest.id && a.author !== manifest.author,
    );
    if (collision) {
      return {
        success: false,
        error: `Agent "${manifest.id}" already registered by "${collision.author}"`,
      };
    }

    // Validate manifest
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') };
    }

    // Upsert
    const updated = [
      ...existing.filter(a => a.id !== manifest.id),
      {
        ...manifest,
        updatedAt: new Date().toISOString(),
        createdAt: manifest.createdAt || new Date().toISOString(),
      },
    ];

    // Sort by name for stable output
    updated.sort((a, b) => a.name.localeCompare(b.name));

    await fs.writeFile(REGISTRY_PATH, JSON.stringify(updated, null, 2));

    // Create agent directory
    const agentDir = path.join(REGISTRY_DIR, manifest.id);
    await fs.mkdir(agentDir, { recursive: true });

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Registration failed',
    };
  }
}

export async function unregisterAgent(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const fs = await import('fs/promises');
    const existing = await listAgents();
    const agent = existing.find(a => a.id === id);

    if (!agent) {
      return { success: false, error: `Agent "${id}" not found` };
    }

    const updated = existing.filter(a => a.id !== id);
    await fs.writeFile(REGISTRY_PATH, JSON.stringify(updated, null, 2));

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unregistration failed',
    };
  }
}

export async function listAgentsByCategory(
  category: AgentCategory,
): Promise<AgentManifest[]> {
  const agents = await listAgents();
  return agents.filter(a => a.category === category);
}

export async function searchAgents(query: string): Promise<AgentManifest[]> {
  const agents = await listAgents();
  const q = query.toLowerCase();
  return agents.filter(
    a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q),
  );
}

// ── Validation ──────────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManifest(manifest: AgentManifest): ValidationResult {
  const errors: string[] = [];

  if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('id must be kebab-case (lowercase letters, numbers, hyphens)');
  }
  if (!manifest.name || manifest.name.length > 100) {
    errors.push('name is required and must be under 100 characters');
  }
  if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('version must be semver (e.g. "1.0.0")');
  }
  if (!manifest.entrypoint) {
    errors.push('entrypoint is required');
  }
  if (!manifest.tools || !Array.isArray(manifest.tools)) {
    errors.push('tools must be an array of MCP tool names');
  }
  if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
    errors.push('permissions must be an array');
  }

  return { valid: errors.length === 0, errors };
}
