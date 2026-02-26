/**
 * VILAG - Logger
 */

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
