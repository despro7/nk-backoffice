import type {
  SupportReportClientLogEntry,
  SupportReportClientLogLevel,
  SupportReportClientLogLevels,
} from '@shared/types/supportReport';
import { DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS } from '@shared/types/supportReport';
import type { LoggingSettingsTypes } from '../types/logging';

const SENSITIVE_PATTERN = /(authorization|cookie|password|token|secret)/i;

type ConsoleMethod = (...args: unknown[]) => void;

const LOGGING_CATEGORY_LEVEL: Partial<
  Record<keyof LoggingSettingsTypes, SupportReportClientLogLevel>
> = {
  authContextLogs: 'auth',
};

export class ClientLogBuffer {
  private static maxLines = 100;
  private static enabledLevels: SupportReportClientLogLevels = {
    ...DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS,
  };
  private static buffer: SupportReportClientLogEntry[] = [];
  private static initialized = false;
  private static originalConsoleError: ConsoleMethod | null = null;
  private static originalConsoleLog: ConsoleMethod | null = null;
  private static originalConsoleWarn: ConsoleMethod | null = null;

  /** Повідомлення LoggingService — вже потрапляють через pushFromLoggingCategory */
  private static isLoggingServiceMessage(args: unknown[]): boolean {
    const first = args[0];
    return typeof first === 'string' && first.includes('════ [');
  }

  static configure(options: {
    maxLines: number;
    levels?: Partial<SupportReportClientLogLevels>;
  }): void {
    ClientLogBuffer.maxLines = Math.max(10, Math.min(500, options.maxLines));
    ClientLogBuffer.enabledLevels = {
      ...DEFAULT_SUPPORT_REPORT_CLIENT_LOG_LEVELS,
      ...options.levels,
    };
    if (ClientLogBuffer.buffer.length > ClientLogBuffer.maxLines) {
      ClientLogBuffer.buffer = ClientLogBuffer.buffer.slice(-ClientLogBuffer.maxLines);
    }
  }

  static initialize(maxLines = 100): void {
    if (ClientLogBuffer.initialized || typeof window === 'undefined') return;
    ClientLogBuffer.configure({ maxLines });
    ClientLogBuffer.initialized = true;

    ClientLogBuffer.originalConsoleError = console.error.bind(console);
    ClientLogBuffer.originalConsoleLog = console.log.bind(console);
    ClientLogBuffer.originalConsoleWarn = console.warn.bind(console);

    console.error = (...args: unknown[]) => {
      ClientLogBuffer.push('error', args);
      ClientLogBuffer.originalConsoleError?.(...args);
    };

    console.log = (...args: unknown[]) => {
      if (!ClientLogBuffer.isLoggingServiceMessage(args)) {
        ClientLogBuffer.push('info', args);
      }
      ClientLogBuffer.originalConsoleLog?.(...args);
    };

    console.warn = (...args: unknown[]) => {
      ClientLogBuffer.push('warn', args);
      ClientLogBuffer.originalConsoleWarn?.(...args);
    };

    window.addEventListener('error', (event) => {
      ClientLogBuffer.push('error', [
        event.message,
        event.filename,
        event.lineno,
        event.colno,
      ]);
    });

    window.addEventListener('unhandledrejection', (event) => {
      ClientLogBuffer.push('error', ['Unhandled rejection', event.reason]);
    });
  }

  /** Викликається з LoggingService для категорійних логів (auth, api, …). */
  static pushFromLoggingCategory(
    category: keyof LoggingSettingsTypes,
    message: string,
    data?: unknown,
  ): void {
    const level = LOGGING_CATEGORY_LEVEL[category] ?? 'info';
    const args = data !== undefined ? [message, data] : [message];
    ClientLogBuffer.push(level, args);
  }

  private static isLevelEnabled(level: SupportReportClientLogLevel): boolean {
    return ClientLogBuffer.enabledLevels[level] === true;
  }

  private static formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
  }

  private static sanitize(message: string): string {
    if (SENSITIVE_PATTERN.test(message)) {
      return '[redacted sensitive data]';
    }
    return message.slice(0, 2000);
  }

  private static push(level: SupportReportClientLogLevel, args: unknown[]): void {
    if (!ClientLogBuffer.isLevelEnabled(level)) return;

    const message = ClientLogBuffer.sanitize(ClientLogBuffer.formatArgs(args));
    if (!message) return;

    ClientLogBuffer.buffer.push({
      ts: new Date().toISOString(),
      level,
      message,
    });

    if (ClientLogBuffer.buffer.length > ClientLogBuffer.maxLines) {
      ClientLogBuffer.buffer = ClientLogBuffer.buffer.slice(-ClientLogBuffer.maxLines);
    }
  }

  static getLogs(): SupportReportClientLogEntry[] {
    return [...ClientLogBuffer.buffer];
  }

  static isInitialized(): boolean {
    return ClientLogBuffer.initialized;
  }
}
