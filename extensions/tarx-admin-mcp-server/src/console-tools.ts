/**
 * TARX Console Log Tools
 * MCP tools for reading TARX extension console logs
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const TARX_LOG_FILE = path.join(os.homedir(), "Library/Application Support/tarx/console.log");

export interface ConsoleLogResult {
  success: boolean;
  lineCount?: number;
  totalLines?: number;
  filter?: string | null;
  cleared?: boolean;
  seconds?: number;
  logs?: string[];
  error?: string;
  path?: string;
  message?: string;
}

/**
 * Read TARX console logs
 */
export function readConsoleLogs(
  lines: number = 100,
  filter?: string,
  clear: boolean = false
): ConsoleLogResult {
  try {
    if (!fs.existsSync(TARX_LOG_FILE)) {
      return {
        success: false,
        error: "Log file not found. Extension may not be running or logger not initialized.",
        path: TARX_LOG_FILE,
      };
    }

    const content = fs.readFileSync(TARX_LOG_FILE, "utf8");
    let logLines = content.split("\n").filter(Boolean);

    // Apply filter if provided
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      logLines = logLines.filter(l => l.toLowerCase().includes(lowerFilter));
    }

    // Limit to requested lines (from end)
    const maxLines = Math.min(lines, 1000);
    const result = logLines.slice(-maxLines);

    // Clear if requested
    if (clear) {
      fs.writeFileSync(TARX_LOG_FILE, "");
    }

    return {
      success: true,
      lineCount: result.length,
      totalLines: logLines.length,
      filter: filter || null,
      cleared: clear,
      logs: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to read logs",
    };
  }
}

/**
 * Tail TARX console logs (last N seconds)
 */
export function tailConsoleLogs(
  seconds: number = 60,
  filter?: string
): ConsoleLogResult {
  try {
    if (!fs.existsSync(TARX_LOG_FILE)) {
      return {
        success: false,
        error: "Log file not found. Extension may not be running or logger not initialized.",
        path: TARX_LOG_FILE,
      };
    }

    const content = fs.readFileSync(TARX_LOG_FILE, "utf8");
    let logLines = content.split("\n").filter(Boolean);

    // Filter by timestamp
    const cutoff = Date.now() - (seconds * 1000);
    logLines = logLines.filter(line => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)/);
      if (match) {
        const lineTime = new Date(match[1]).getTime();
        return lineTime >= cutoff;
      }
      return false;
    });

    // Apply text filter if provided
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      logLines = logLines.filter(l => l.toLowerCase().includes(lowerFilter));
    }

    return {
      success: true,
      lineCount: logLines.length,
      seconds,
      filter: filter || null,
      logs: logLines,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to tail logs",
    };
  }
}

/**
 * Clear TARX console logs
 */
export function clearConsoleLogs(): ConsoleLogResult {
  try {
    if (fs.existsSync(TARX_LOG_FILE)) {
      fs.writeFileSync(TARX_LOG_FILE, "");
    }

    return {
      success: true,
      message: "Console logs cleared",
      path: TARX_LOG_FILE,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to clear logs",
    };
  }
}
