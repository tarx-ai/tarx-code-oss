/**
 * TARX CLI - Mesh Service
 * HTTP client for mesh network on port 11436
 */

import * as http from 'http';

const MESH_URL = process.env.TARX_MESH_URL || 'http://localhost:11436';

interface MeshStatus {
  status: string;
  peerId?: string;
  connectedPeers?: number;
  listening?: string[];
}

/**
 * Check if mesh service is healthy
 */
export async function checkHealth(): Promise<{ healthy: boolean; peerId?: string; peers?: number; error?: string }> {
  return new Promise((resolve) => {
    const url = new URL('/health', MESH_URL);

    const req = http.request(url, { method: 'GET', timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data) as MeshStatus;
            resolve({
              healthy: true,
              peerId: json.peerId,
              peers: json.connectedPeers || 0
            });
          } catch {
            resolve({ healthy: true, peers: 0 });
          }
        } else {
          resolve({ healthy: false, error: `Status ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ healthy: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Timeout' });
    });

    req.end();
  });
}

/**
 * Get mesh network status
 */
export async function getStatus(): Promise<MeshStatus | null> {
  return new Promise((resolve) => {
    const url = new URL('/health', MESH_URL);

    const req = http.request(url, { method: 'GET', timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data) as MeshStatus);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}
