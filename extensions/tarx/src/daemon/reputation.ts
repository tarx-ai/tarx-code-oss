/**
 * TARX Autonomic Daemon - Reputation System
 *
 * Node reputation tracking:
 * - Starts at 1.0
 * - +0.1 per successful fix
 * - -0.3 per failed fix
 * - Minimum 0.4 required to broadcast fixes
 * - Persisted locally and synced with mesh DHT
 */

import * as fs from 'fs';
import * as path from 'path';

export interface NodeReputation {
  nodeId: string;
  score: number;
  successCount: number;
  failureCount: number;
  lastUpdated: number;
}

export class ReputationSystem {
  private readonly MESH_URL = 'http://localhost:11436';
  private readonly MIN_REPUTATION = 0.4;
  private readonly SUCCESS_BONUS = 0.1;
  private readonly FAILURE_PENALTY = 0.3;
  private readonly REPUTATION_FILE: string;

  private localReputation: NodeReputation = {
    nodeId: '',
    score: 1.0,
    successCount: 0,
    failureCount: 0,
    lastUpdated: Date.now()
  };

  constructor() {
    this.REPUTATION_FILE = path.join(
      process.env.HOME || '~',
      '.tarx',
      'autonomic',
      'reputation.json'
    );
  }

  async initialize(nodeId: string): Promise<void> {
    this.localReputation.nodeId = nodeId;

    // Try to load from local file first
    if (fs.existsSync(this.REPUTATION_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.REPUTATION_FILE, 'utf-8'));
        if (data.nodeId === nodeId) {
          this.localReputation = data;
          console.log(`[Reputation] Loaded: ${this.localReputation.score.toFixed(2)}`);
          return;
        }
      } catch {}
    }

    // Try to load from mesh DHT
    try {
      const response = await fetch(`${this.MESH_URL}/mesh/reputation/${nodeId}`);
      if (response.ok) {
        this.localReputation = await response.json() as NodeReputation;
        console.log(`[Reputation] Loaded from mesh: ${this.localReputation.score.toFixed(2)}`);
      }
    } catch {
      console.log('[Reputation] Starting fresh at 1.0');
    }
  }

  getScore(): number {
    return this.localReputation.score;
  }

  canBroadcast(): boolean {
    return this.localReputation.score >= this.MIN_REPUTATION;
  }

  async recordSuccess(): Promise<void> {
    this.localReputation.score = Math.min(1.0, this.localReputation.score + this.SUCCESS_BONUS);
    this.localReputation.successCount++;
    this.localReputation.lastUpdated = Date.now();
    await this.persist();
    console.log(`[Reputation] Success! New score: ${this.localReputation.score.toFixed(2)}`);
  }

  async recordFailure(): Promise<void> {
    this.localReputation.score = Math.max(0, this.localReputation.score - this.FAILURE_PENALTY);
    this.localReputation.failureCount++;
    this.localReputation.lastUpdated = Date.now();
    await this.persist();
    console.log(`[Reputation] Failure. New score: ${this.localReputation.score.toFixed(2)}`);
  }

  async checkBroadcasterReputation(nodeId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.MESH_URL}/mesh/reputation/${nodeId}`);
      if (response.ok) {
        const rep = await response.json() as NodeReputation;
        return rep.score >= this.MIN_REPUTATION;
      }
    } catch {}
    return false;
  }

  private async persist(): Promise<void> {
    // Save locally
    const dir = path.dirname(this.REPUTATION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.REPUTATION_FILE, JSON.stringify(this.localReputation, null, 2));

    // Try to sync with mesh
    try {
      await fetch(`${this.MESH_URL}/mesh/reputation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.localReputation)
      });
    } catch {
      // Mesh might not be available
    }
  }

  getStats(): NodeReputation {
    return { ...this.localReputation };
  }
}
