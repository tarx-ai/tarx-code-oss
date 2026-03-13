/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Professional Logger
 *
 * Centralized logging for the proactive system with:
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Consistent formatting
 * - Optional error reporting
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class TarxLogger {
  private level: LogLevel = LogLevel.INFO;
  private prefix = '[TARX]';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, data?: any): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`${this.prefix} [DEBUG] ${message}`, data !== undefined ? data : '');
    }
  }

  info(message: string, data?: any): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`${this.prefix} ${message}`, data !== undefined ? data : '');
    }
  }

  warn(message: string, data?: any): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`${this.prefix} ⚠️ ${message}`, data !== undefined ? data : '');
    }
  }

  error(message: string, error?: Error | any): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`${this.prefix} ❌ ${message}`, error || '');

      // Report to error tracking if available
      this.reportToErrorTracker(message, error);
    }
  }

  /**
   * Log with specific component prefix
   */
  component(component: string) {
    const componentPrefix = `${this.prefix} [${component}]`;
    return {
      debug: (message: string, data?: any) => {
        if (this.level <= LogLevel.DEBUG) {
          console.log(`${componentPrefix} [DEBUG] ${message}`, data !== undefined ? data : '');
        }
      },
      info: (message: string, data?: any) => {
        if (this.level <= LogLevel.INFO) {
          console.log(`${componentPrefix} ${message}`, data !== undefined ? data : '');
        }
      },
      warn: (message: string, data?: any) => {
        if (this.level <= LogLevel.WARN) {
          console.warn(`${componentPrefix} ⚠️ ${message}`, data !== undefined ? data : '');
        }
      },
      error: (message: string, error?: Error | any) => {
        if (this.level <= LogLevel.ERROR) {
          console.error(`${componentPrefix} ❌ ${message}`, error || '');
          this.reportToErrorTracker(message, error, component);
        }
      }
    };
  }

  private reportToErrorTracker(_message: string, _error?: Error | any, _component?: string): void {
    // TODO: Wire to Datadog for error reporting
  }
}

// Export singleton instance
export const logger = new TarxLogger();

// Export component loggers for each proactive service
export const contextLogger = logger.component('ContextObserver');
export const patternLogger = logger.component('PatternDetector');
export const proposerLogger = logger.component('ActionProposer');
export const executorLogger = logger.component('ActionExecutor');
export const voiceLogger = logger.component('ProactiveVoice');
