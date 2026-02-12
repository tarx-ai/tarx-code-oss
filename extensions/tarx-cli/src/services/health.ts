/**
 * Health Service - Check TARX services
 */

const PORTS = {
  inference: 11435,
  embeddings: 11437,
  mesh: 11436
};

interface HealthStatus {
  inference: { port: number; healthy: boolean };
  embeddings: { port: number; healthy: boolean };
  mesh: { port: number; healthy: boolean };
}

interface FullStatus extends HealthStatus {
  health: HealthStatus;
  memory?: {
    totalMemories: number;
    totalSessions: number;
    totalMessages: number;
  };
}

async function checkPort(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function checkHealth(): Promise<HealthStatus> {
  const [inference, embeddings, mesh] = await Promise.all([
    checkPort(PORTS.inference),
    checkPort(PORTS.embeddings),
    checkPort(PORTS.mesh)
  ]);

  return {
    inference: { port: PORTS.inference, healthy: inference },
    embeddings: { port: PORTS.embeddings, healthy: embeddings },
    mesh: { port: PORTS.mesh, healthy: mesh }
  };
}

export async function getFullStatus(): Promise<FullStatus> {
  const health = await checkHealth();
  
  // Try to get memory stats from tarx-core MCP
  let memory;
  try {
    // In future: call memory_stats MCP tool
    memory = { totalMemories: 0, totalSessions: 0, totalMessages: 0 };
  } catch {
    memory = undefined;
  }

  return { ...health, health, memory };
}
