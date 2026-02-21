/**
 * TARX Self-Heal Engine — Orchestrator.
 * Wires taxonomy, strategy, circuit breaker, dispatch, and notifications.
 */

import { classify } from './taxonomy.js';
import { compose } from './strategyCompositor.js';
import * as circuitBreaker from './circuitBreaker.js';
import { notify } from './notify.js';

export interface DispatchFn {
  (prompt: string): Promise<{ success: boolean; output: string; duration_ms: number }>;
}

export interface HealResult {
  classified: { id: string; severity: string; strategy: string; confidence: number };
  breaker_status: { allowed: boolean; reason?: string };
  dispatched: boolean;
  success: boolean;
  output?: string;
  duration_ms?: number;
}

export class SelfHealEngine {
  private dispatchFn: DispatchFn;

  constructor(dispatchFn: DispatchFn) {
    this.dispatchFn = dispatchFn;
  }

  async handleError(errorMessage: string, context?: string): Promise<HealResult> {
    // Step 1: Classify
    const classification = classify(errorMessage, context);
    const { node, extracted, confidence } = classification;

    await notify('info', `Classified: ${node.id} (${node.severity}, confidence: ${confidence.toFixed(2)}) → ${node.strategy}`);

    // Step 2: Check circuit breaker
    const breakerCheck = circuitBreaker.check(node.id, errorMessage);
    if (!breakerCheck.allowed) {
      await notify('blocked', `Circuit breaker: ${breakerCheck.reason}`);
      return {
        classified: { id: node.id, severity: node.severity, strategy: node.strategy, confidence },
        breaker_status: breakerCheck,
        dispatched: false,
        success: false,
      };
    }

    // Step 3: Compose strategy prompt
    const variables: Record<string, string> = {
      ...extracted,
      error_message: errorMessage,
      taxonomy_id: node.id,
      severity: node.severity,
      short_description: `${node.id} fix`,
    };

    // RAG context could be injected here in the future
    const ragContext = context || undefined;

    let composed;
    try {
      composed = compose(node.strategy, variables, ragContext);
    } catch (e: any) {
      await notify('error', `Strategy composition failed: ${e.message}`);
      return {
        classified: { id: node.id, severity: node.severity, strategy: node.strategy, confidence },
        breaker_status: breakerCheck,
        dispatched: false,
        success: false,
      };
    }

    // Step 4: Check approval requirement
    if (composed.definition.requires_approval) {
      await notify('warning', `Strategy ${node.strategy} requires human approval. Halting.`);
      return {
        classified: { id: node.id, severity: node.severity, strategy: node.strategy, confidence },
        breaker_status: breakerCheck,
        dispatched: false,
        success: false,
        output: 'Requires approval',
      };
    }

    // Step 5: Dispatch
    await notify('info', `Dispatching ${node.strategy} (attempt ${circuitBreaker.getStatus().dispatchesLastHour + 1})...`);
    circuitBreaker.record(node.id, errorMessage);

    const result = await this.dispatchFn(composed.prompt);

    // Step 6: Report
    if (result.success) {
      await notify('success', `Fixed ${node.id} in ${result.duration_ms}ms`);
    } else {
      await notify('warning', `Fix attempt failed for ${node.id}. Output: ${result.output.substring(0, 100)}`);
    }

    return {
      classified: { id: node.id, severity: node.severity, strategy: node.strategy, confidence },
      breaker_status: breakerCheck,
      dispatched: true,
      success: result.success,
      output: result.output,
      duration_ms: result.duration_ms,
    };
  }

  async healthCheck(): Promise<void> {
    const ports = [
      { port: 11435, name: 'Inference (llama-server)' },
      { port: 11436, name: 'Mesh HTTP API' },
      { port: 11437, name: 'Embedding server' },
    ];

    await notify('info', 'Running health check...');

    for (const { port, name } of ports) {
      try {
        const response = await fetch(`http://localhost:${port}/health`);
        if (response.ok) {
          await notify('info', `  ${name} :${port} — UP`);
        } else {
          await notify('warning', `  ${name} :${port} — DOWN (HTTP ${response.status})`);
          // Auto-heal: dispatch a health_fix
          await this.handleError(`ECONNREFUSED localhost:${port} ${name} health check failed`, `Service ${name} on port ${port} returned HTTP ${response.status}`);
        }
      } catch {
        await notify('info', `  ${name} :${port} — DOWN (unreachable)`);
        // Don't auto-heal unreachable services — they may be intentionally off
      }
    }
  }
}
