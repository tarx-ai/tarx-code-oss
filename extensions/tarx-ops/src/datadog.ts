/**
 * TARX Datadog Metrics Shipper
 *
 * Lightweight module that buffers metrics in-memory and flushes
 * to Datadog's HTTP API (/api/v1/series) on a 60s timer.
 *
 * Env vars:
 *   DD_API_KEY  — Required. Datadog API key.
 *   DD_SITE     — Optional. Defaults to "datadoghq.com".
 *
 * If DD_API_KEY is not set, all operations are no-ops (safe to import always).
 */

import * as https from "https";
import * as http from "http";
import * as os from "os";

// =============================================================================
// CONFIGURATION
// =============================================================================

const DD_API_KEY = process.env.DD_API_KEY || "";
const DD_SITE = process.env.DD_SITE || "datadoghq.com";
const FLUSH_INTERVAL_MS = 60_000;
const METRIC_PREFIX = "tarx";

const COMMON_TAGS = [
  `host:${os.hostname()}`,
  `env:${process.env.TARX_ENV || "development"}`,
  "service:tarx-ops",
];

// =============================================================================
// TYPES
// =============================================================================

interface MetricPoint {
  metric: string;
  type: "gauge" | "count" | "rate";
  points: Array<[number, number]>; // [timestamp_seconds, value]
  tags: string[];
}

interface HealthProbe {
  port: number;
  name: string;
}

// =============================================================================
// METRIC BUFFER
// =============================================================================

const buffer: MetricPoint[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function isEnabled(): boolean {
  return DD_API_KEY.length > 0;
}

/**
 * Record a count metric (incremented by `value`).
 */
export function incr(name: string, value: number = 1, tags: string[] = []): void {
  if (!isEnabled()) return;
  buffer.push({
    metric: `${METRIC_PREFIX}.${name}`,
    type: "count",
    points: [[Math.floor(Date.now() / 1000), value]],
    tags: [...COMMON_TAGS, ...tags],
  });
}

/**
 * Record a gauge metric (point-in-time value).
 */
export function gauge(name: string, value: number, tags: string[] = []): void {
  if (!isEnabled()) return;
  buffer.push({
    metric: `${METRIC_PREFIX}.${name}`,
    type: "gauge",
    points: [[Math.floor(Date.now() / 1000), value]],
    tags: [...COMMON_TAGS, ...tags],
  });
}

/**
 * Record a distribution-style metric as a gauge (DD distributions require Agent;
 * we use gauge + percentile aggregation in DD UI instead).
 */
export function timing(name: string, durationMs: number, tags: string[] = []): void {
  if (!isEnabled()) return;
  buffer.push({
    metric: `${METRIC_PREFIX}.${name}`,
    type: "gauge",
    points: [[Math.floor(Date.now() / 1000), durationMs]],
    tags: [...COMMON_TAGS, ...tags],
  });
}

// =============================================================================
// CONVENIENCE METHODS — PRE-BUILT FOR TARX
// =============================================================================

/**
 * Record an inference call's latency and token usage.
 */
export function recordInference(opts: {
  latencyMs: number;
  route: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}): void {
  const tags = [`route:${opts.route}`, `model:${opts.model}`];
  timing("inference.latency_ms", opts.latencyMs, tags);
  incr("inference.calls", 1, tags);
  if (opts.promptTokens != null) {
    incr("inference.tokens.prompt", opts.promptTokens, tags);
  }
  if (opts.completionTokens != null) {
    incr("inference.tokens.completion", opts.completionTokens, tags);
  }
}

/**
 * Record a tool call from the audit log.
 */
export function recordToolCall(opts: {
  server: string;
  tool: string;
  success: boolean;
}): void {
  incr("tool.calls", 1, [
    `mcp_server:${opts.server}`,
    `tool:${opts.tool}`,
    `success:${opts.success}`,
  ]);
}

/**
 * Probe localhost ports and emit health gauges (1=up, 0=down).
 */
const HEALTH_PROBES: HealthProbe[] = [
  { port: 11435, name: "llama_server" },
  { port: 11436, name: "mesh_api" },
  { port: 11437, name: "embedding_server" },
];

export async function probeHealth(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.all(
    HEALTH_PROBES.map(
      (probe) =>
        new Promise<void>((resolve) => {
          const req = http.request(
            { hostname: "127.0.0.1", port: probe.port, path: "/health", method: "GET", timeout: 3000 },
            (res) => {
              results[probe.name] = res.statusCode !== undefined && res.statusCode < 500;
              res.resume();
              resolve();
            }
          );
          req.on("error", () => {
            results[probe.name] = false;
            resolve();
          });
          req.on("timeout", () => {
            results[probe.name] = false;
            req.destroy();
            resolve();
          });
          req.end();
        })
    )
  );

  for (const [name, up] of Object.entries(results)) {
    gauge("health.port_up", up ? 1 : 0, [`service_name:${name}`]);
  }

  return results;
}

// =============================================================================
// FLUSH
// =============================================================================

async function flush(): Promise<{ sent: number; error?: string }> {
  if (!isEnabled() || buffer.length === 0) {
    return { sent: 0 };
  }

  // Drain buffer
  const batch = buffer.splice(0, buffer.length);

  const payload = JSON.stringify({ series: batch });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: `api.${DD_SITE}`,
        port: 443,
        path: "/api/v1/series",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "DD-API-KEY": DD_API_KEY,
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 10_000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ sent: batch.length });
          } else {
            console.error(`[datadog] Flush failed: HTTP ${res.statusCode} — ${body.slice(0, 200)}`);
            resolve({ sent: 0, error: `HTTP ${res.statusCode}` });
          }
        });
      }
    );

    req.on("error", (err) => {
      console.error(`[datadog] Flush error: ${err.message}`);
      resolve({ sent: 0, error: err.message });
    });

    req.on("timeout", () => {
      console.error("[datadog] Flush timeout");
      req.destroy();
      resolve({ sent: 0, error: "timeout" });
    });

    req.write(payload);
    req.end();
  });
}

// =============================================================================
// LIFECYCLE
// =============================================================================

/**
 * Start the periodic flush timer. Safe to call multiple times.
 */
export function start(): void {
  if (!isEnabled()) {
    console.error("[datadog] DD_API_KEY not set — metrics disabled");
    return;
  }
  if (flushTimer) return;

  console.error(`[datadog] Started — flushing every ${FLUSH_INTERVAL_MS / 1000}s to ${DD_SITE}`);

  // Run health probes and flush on each interval
  flushTimer = setInterval(async () => {
    await probeHealth();
    await flush();
  }, FLUSH_INTERVAL_MS);

  // Don't keep the process alive just for metrics
  if (flushTimer.unref) flushTimer.unref();
}

/**
 * Final flush and stop the timer.
 */
export async function stop(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flush();
}

/**
 * Get current status for the MCP status tool.
 */
export function getStatus(): {
  enabled: boolean;
  site: string;
  buffered: number;
  flushIntervalMs: number;
  tags: string[];
} {
  return {
    enabled: isEnabled(),
    site: DD_SITE,
    buffered: buffer.length,
    flushIntervalMs: FLUSH_INTERVAL_MS,
    tags: COMMON_TAGS,
  };
}

/**
 * Force an immediate flush (for the MCP tool).
 */
export { flush as forceFlush };
