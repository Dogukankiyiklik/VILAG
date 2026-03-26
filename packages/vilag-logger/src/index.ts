/**
 * VILAG - Logger
 * Console logging + file-based session logging for debug.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { StepLogData } from '@vilag/shared/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  log(...args: any[]): void;
}

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';

export function createLogger(prefix: string = 'VILAG'): Logger {
  const log = (level: LogLevel, ...args: any[]) => {
    const timestamp = new Date().toISOString().slice(11, 23);
    const color = COLORS[level];
    console[level === 'debug' ? 'log' : level](
      `${color}[${timestamp}] [${prefix}] [${level.toUpperCase()}]${RESET}`,
      ...args,
    );
  };

  return {
    debug: (...args) => log('debug', ...args),
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
    log: (...args) => log('info', ...args),
  };
}

export const logger = createLogger();

// ===== Session Logger (File-based Debug Logging) =====

export interface SessionInfo {
  sessionId: string;
  startedAt: string;
  instruction: string;
  operator: string;
  model: {
    baseURL: string;
    modelName: string;
  };
  screenDimensions?: { width: number; height: number };
  systemPrompt?: string;
}

export class SessionLogger {
  private sessionDir: string;
  private screenshotsDir: string;
  private stepsDir: string;
  private consoleLogger: Logger;

  constructor(baseLogsDir: string, sessionId: string) {
    // Create session directory: logs/session_2026-03-26T22-10-00
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.sessionDir = path.join(baseLogsDir, `session_${timestamp}`);
    this.screenshotsDir = path.join(this.sessionDir, 'screenshots');
    this.stepsDir = path.join(this.sessionDir, 'steps');

    // Create directories
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
    fs.mkdirSync(this.stepsDir, { recursive: true });

    this.consoleLogger = createLogger('SessionLog');
    this.consoleLogger.info(`Session directory: ${this.sessionDir}`);
  }

  /**
   * Log session start info.
   */
  logSessionInfo(info: SessionInfo): void {
    const filePath = path.join(this.sessionDir, 'session_info.json');
    fs.writeFileSync(filePath, JSON.stringify(info, null, 2), 'utf-8');
    this.consoleLogger.info(`Session info saved: ${filePath}`);
  }

  /**
   * Save a screenshot as PNG.
   */
  saveScreenshot(loopNumber: number, base64: string): string {
    const fileName = `loop_${String(loopNumber).padStart(3, '0')}_screenshot.png`;
    const filePath = path.join(this.screenshotsDir, fileName);

    // Strip data:image/... prefix if present
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    fs.writeFileSync(filePath, buffer);

    this.consoleLogger.debug(`Screenshot saved: ${fileName} (${Math.round(buffer.length / 1024)}KB)`);
    return filePath;
  }

  /**
   * Log a step (one agent loop iteration) as JSON.
   */
  logStep(stepData: StepLogData): void {
    const fileName = `loop_${String(stepData.loopNumber).padStart(3, '0')}.json`;
    const filePath = path.join(this.stepsDir, fileName);

    // Remove base64 screenshot from the JSON (it's saved separately as PNG)
    const { screenshotBase64, ...logData } = stepData;

    // Add screenshot file reference
    const screenshotFileName = `loop_${String(stepData.loopNumber).padStart(3, '0')}_screenshot.png`;
    const dataToWrite = {
      ...logData,
      screenshotFile: `../screenshots/${screenshotFileName}`,
    };

    fs.writeFileSync(filePath, JSON.stringify(dataToWrite, null, 2), 'utf-8');

    // Console summary
    const actions = stepData.parsedActions
      .map((a) => `${a.action_type}(${JSON.stringify(a.action_inputs)})`)
      .join(', ');
    this.consoleLogger.info(
      `[Step ${stepData.loopNumber}] ` +
      `model: ${stepData.timing.modelMs}ms | ` +
      `actions: ${actions} | ` +
      `total: ${stepData.timing.totalMs}ms`
    );
  }

  /**
   * Get the session directory path.
   */
  getSessionDir(): string {
    return this.sessionDir;
  }
}

/**
 * Create a new session logger.
 */
export function createSessionLogger(
  baseLogsDir: string,
  sessionId: string,
): SessionLogger {
  return new SessionLogger(baseLogsDir, sessionId);
}
