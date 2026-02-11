/**
 * TARX Autonomic Daemon - Admin API
 *
 * HTTP API for daemon control:
 * - GET /status - Daemon state
 * - POST /message - Send message to daemon
 * - POST /stop - Emergency stop
 * - POST /clear-stop - Clear emergency stop
 * - GET /fixes - List recent fixes
 * - POST /rollback/:id - Rollback a fix
 */

import * as http from 'http';

export class AdminAPI {
  private server: http.Server | null = null;
  private daemon: any; // TarxAutonomicDaemon

  constructor(daemon: any) {
    this.daemon = daemon;
  }

  async start(port: number): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${port}`);
      const pathname = url.pathname;

      try {
        // Route handling
        if (req.method === 'GET' && pathname === '/status') {
          const state = this.daemon.getState();
          this.sendJSON(res, 200, state);
        }
        else if (req.method === 'GET' && pathname === '/health') {
          this.sendJSON(res, 200, { status: 'ok', timestamp: Date.now() });
        }
        else if (req.method === 'POST' && pathname === '/message') {
          const body = await this.readBody(req);
          const { message } = JSON.parse(body);
          const result = await this.daemon.interruptWithMessage(message);
          this.sendJSON(res, 200, { result });
        }
        else if (req.method === 'POST' && pathname === '/stop') {
          this.daemon.emergencyStop();
          this.sendJSON(res, 200, { success: true, message: 'Emergency stop activated' });
        }
        else if (req.method === 'POST' && pathname === '/clear-stop') {
          this.daemon.killSwitch?.clearEmergencyStop();
          this.sendJSON(res, 200, { success: true, message: 'Emergency stop cleared' });
        }
        else if (req.method === 'GET' && pathname === '/fixes') {
          const fixes = this.daemon.auditTrail?.getRecentFixes() || [];
          this.sendJSON(res, 200, { fixes });
        }
        else if (req.method === 'POST' && pathname.startsWith('/rollback/')) {
          const fixId = pathname.replace('/rollback/', '');
          const success = this.daemon.auditTrail?.rollback(fixId) || false;
          this.sendJSON(res, success ? 200 : 400, {
            success,
            message: success ? 'Rollback complete' : 'Rollback failed'
          });
        }
        else if (req.method === 'GET' && pathname === '/reputation') {
          const stats = this.daemon.reputation?.getStats() || {};
          this.sendJSON(res, 200, stats);
        }
        else if (req.method === 'GET' && pathname === '/mesh') {
          const stats = await this.daemon.broadcaster?.getMeshStats() || {};
          this.sendJSON(res, 200, stats);
        }
        else {
          this.sendJSON(res, 404, { error: 'Not found' });
        }
      } catch (error) {
        console.error('[AdminAPI] Request error:', error);
        this.sendJSON(res, 500, { error: String(error) });
      }
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[AdminAPI] Port ${port} in use, skipping startup`);
        return;
      }
      console.error('[AdminAPI] Server error:', err.message);
    });

    this.server.listen(port, () => {
      console.log(`[AdminAPI] Running on http://localhost:${port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[AdminAPI] Stopped');
    }
  }

  private sendJSON(res: http.ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
