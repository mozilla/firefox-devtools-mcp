import fs from 'node:fs';
import path from 'node:path';

let logStream: fs.WriteStream | null = null;

function formatArgs(args: unknown[]): string {
  if (args.length === 0) {
    return '';
  }
  return (
    ' ' +
    args
      .map((a) => {
        if (typeof a === 'string') {
          return a;
        }
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ')
  );
}

// Intended for test cleanup only.
export function closeLogFile(): void {
  logStream = null;
}

export function flushLogs(timeoutMs = 2000): Promise<void> {
  if (!logStream) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(reject, timeoutMs);
    logStream!.end(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function write(message: string, args: unknown[], body?: string): void {
  if (logStream) {
    logStream.write(`${new Date().toISOString()} ${message}${formatArgs(args)}\n`);
    if (body) {
      logStream.write(`${body}\n`);
    }
  } else {
    console.error(message, ...args);
    if (body) {
      console.error(body);
    }
  }
}

export function log(message: string, ...args: unknown[]): void {
  write(`[firefox-mcp] ${message}`, args);
}

export function logDebug(message: string, ...args: unknown[]): void {
  if (
    process.env.DEBUG === '*' ||
    process.env.DEBUG?.includes('firefox-mcp') ||
    process.env.DEBUG?.includes('firefox-devtools')
  ) {
    write(`[firefox-mcp] DEBUG: ${message}`, args);
  }
}

export function logError(message: string, error?: unknown): void {
  if (error instanceof Error) {
    write(`[firefox-mcp] ERROR: ${message}`, [error.message], error.stack);
  } else {
    write(`[firefox-mcp] ERROR: ${message}`, [error]);
  }
}

export function setupLogFile(filePath: string): void {
  // Create the parent directory first; otherwise a missing one only surfaces as
  // a stream error and logging is silently disabled.
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  logStream = fs.createWriteStream(filePath, { flags: 'a' });
  logStream.on('error', (error) => {
    console.error(`[firefox-mcp] Error writing to log file: ${error.message}`);
    logStream = null;
  });
}
