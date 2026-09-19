const SENSITIVE_PATTERN = /(authorization|cookie|password|token|secret)/i;

type ServerLogEntry = {
  ts: string;
  message: string;
};

/** Кільцевий буфер останніх server console/logServer рядків для звітів користувачів. */
export class ServerLogBuffer {
  private static maxLines = 200;
  private static buffer: ServerLogEntry[] = [];

  static configure(maxLines: number): void {
    ServerLogBuffer.maxLines = Math.max(0, Math.min(2000, maxLines));
    if (ServerLogBuffer.buffer.length > ServerLogBuffer.maxLines) {
      ServerLogBuffer.buffer = ServerLogBuffer.buffer.slice(-ServerLogBuffer.maxLines);
    }
  }

  static push(message: string, data?: unknown): void {
    if (ServerLogBuffer.maxLines <= 0) return;

    const parts = [message.trim()];
    if (data !== undefined && data !== '') {
      try {
        parts.push(typeof data === 'string' ? data : JSON.stringify(data));
      } catch {
        parts.push(String(data));
      }
    }

    let line = parts.filter(Boolean).join(' ');
    if (SENSITIVE_PATTERN.test(line)) {
      line = '[redacted sensitive data]';
    }
    line = line.slice(0, 4000);
    if (!line) return;

    ServerLogBuffer.buffer.push({
      ts: new Date().toISOString(),
      message: line,
    });

    if (ServerLogBuffer.buffer.length > ServerLogBuffer.maxLines) {
      ServerLogBuffer.buffer = ServerLogBuffer.buffer.slice(-ServerLogBuffer.maxLines);
    }
  }

  static getRecentLines(limit: number): string | undefined {
    const take = Math.max(0, Math.min(limit, ServerLogBuffer.buffer.length));
    if (take <= 0) return undefined;

    return ServerLogBuffer.buffer
      .slice(-take)
      .map((entry) => `[${entry.ts}] ${entry.message}`)
      .join('\n');
  }
}
