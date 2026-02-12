/**
 * TARX CLI - Embeddings Service
 * HTTP client for nomic embedding server on port 11437
 */

import * as http from 'http';

const EMBEDDING_URL = process.env.TARX_EMBEDDING_URL || 'http://localhost:11437';

interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Check if embedding server is healthy
 */
export async function checkHealth(): Promise<{ healthy: boolean; model?: string; error?: string }> {
  return new Promise((resolve) => {
    const url = new URL('/v1/models', EMBEDDING_URL);

    const req = http.request(url, { method: 'GET', timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            const model = json.data?.[0]?.id || 'nomic-embed-text-v1.5';
            resolve({ healthy: true, model });
          } catch {
            resolve({ healthy: true, model: 'nomic-embed-text-v1.5' });
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
 * Generate embeddings for text
 */
export async function embed(text: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const url = new URL('/v1/embeddings', EMBEDDING_URL);

    const body = JSON.stringify({
      input: `search_document: ${text}`,
      model: 'nomic-embed-text-v1.5'
    });

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data) as EmbeddingResponse;
            const embedding = json.data?.[0]?.embedding;
            if (embedding && embedding.length > 0) {
              resolve(embedding);
            } else {
              reject(new Error('No embedding returned'));
            }
          } catch (e) {
            reject(new Error(`Parse error: ${e}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Generate query embeddings (different prefix for search)
 */
export async function embedQuery(text: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const url = new URL('/v1/embeddings', EMBEDDING_URL);

    const body = JSON.stringify({
      input: `search_query: ${text}`,
      model: 'nomic-embed-text-v1.5'
    });

    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data) as EmbeddingResponse;
            const embedding = json.data?.[0]?.embedding;
            if (embedding && embedding.length > 0) {
              resolve(embedding);
            } else {
              reject(new Error('No embedding returned'));
            }
          } catch (e) {
            reject(new Error(`Parse error: ${e}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}
