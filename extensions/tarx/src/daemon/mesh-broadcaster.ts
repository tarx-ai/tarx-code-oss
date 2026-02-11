/**
 * TARX Autonomic Daemon - Mesh Broadcaster
 *
 * Propagates verified fixes to the mesh network:
 * - Signs and packages fixes
 * - Broadcasts as PROPOSAL (never auto-apply)
 * - Tracks mesh node reach
 * - Receives fixes from other nodes
 */

import { PatchSigner } from './patch-signer';
import { ReputationSystem } from './reputation';

export interface BroadcastResult {
  success: boolean;
  nodesReached: number;
  failures: string[];
}

export interface FixPackage {
  id: string;
  timestamp: number;
  originNode: string;
  fix: {
    file: string;
    find: string;
    replace: string;
    summary: string;
  };
  verification: any;
  signature: string;
  publicKey: string;
  applyMode: 'proposal' | 'auto';
}

export class MeshBroadcaster {
  private readonly MESH_URL = 'http://localhost:11436';

  async broadcast(fix: {
    file: string;
    find: string;
    replace: string;
    summary: string;
    errorId: string;
    signature: string;
    publicKey: string;
    nodeId: string;
    verification: any;
  }): Promise<BroadcastResult> {
    try {
      // Package the fix
      const pkg: FixPackage = {
        id: `fix-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        originNode: fix.nodeId,
        fix: {
          file: fix.file,
          find: fix.find,
          replace: fix.replace,
          summary: fix.summary
        },
        verification: fix.verification,
        signature: fix.signature,
        publicKey: fix.publicKey,
        applyMode: 'proposal' // Always start as proposal, never auto-apply to other nodes
      };

      // Try to broadcast to mesh
      const response = await fetch(`${this.MESH_URL}/mesh/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fix_package',
          payload: pkg
        })
      });

      if (!response.ok) {
        // Mesh might not support broadcast yet
        console.log('[MeshBroadcaster] Mesh broadcast endpoint not available');
        return { success: true, nodesReached: 1, failures: [] };
      }

      const result = await response.json() as { nodesReached?: number; failures?: string[] };
      return {
        success: true,
        nodesReached: result.nodesReached || 1,
        failures: result.failures || []
      };

    } catch (error) {
      console.log('[MeshBroadcaster] Broadcast failed (mesh may be offline):', error);
      return { success: true, nodesReached: 1, failures: [] };
    }
  }

  async receiveFix(pkg: FixPackage, signer: PatchSigner, reputation: ReputationSystem): Promise<{
    accepted: boolean;
    reason?: string;
  }> {
    // 1. Verify signature
    const dataToVerify = JSON.stringify(pkg.fix);
    const isValid = signer.verify(dataToVerify, pkg.signature, pkg.publicKey);

    if (!isValid) {
      return { accepted: false, reason: 'Invalid signature' };
    }

    // 2. Check broadcaster reputation
    const hasReputation = await reputation.checkBroadcasterReputation(pkg.originNode);
    if (!hasReputation) {
      return { accepted: false, reason: 'Broadcaster reputation too low' };
    }

    // 3. Check fix freshness (reject if older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (pkg.timestamp < oneHourAgo) {
      return { accepted: false, reason: 'Fix is too old' };
    }

    // 4. Accept as proposal (don't auto-apply)
    console.log(`[MeshBroadcaster] Accepted fix proposal from ${pkg.originNode}: ${pkg.fix.summary}`);
    return { accepted: true };
  }

  async getPendingProposals(): Promise<FixPackage[]> {
    try {
      const response = await fetch(`${this.MESH_URL}/mesh/proposals`);
      if (!response.ok) return [];
      return await response.json() as FixPackage[];
    } catch {
      return [];
    }
  }

  async voteOnProposal(proposalId: string, vote: 'approve' | 'reject', nodeId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.MESH_URL}/mesh/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, vote, nodeId })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getMeshStats(): Promise<{
    connectedNodes: number;
    pendingProposals: number;
    appliedFixes: number;
  }> {
    try {
      const response = await fetch(`${this.MESH_URL}/mesh/stats`);
      if (!response.ok) {
        return { connectedNodes: 1, pendingProposals: 0, appliedFixes: 0 };
      }
      return await response.json() as { connectedNodes: number; pendingProposals: number; appliedFixes: number };
    } catch {
      return { connectedNodes: 1, pendingProposals: 0, appliedFixes: 0 };
    }
  }
}
