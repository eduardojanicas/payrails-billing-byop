export interface LogContext {
  route?: string;
  correlationId?: string;
  [key: string]: unknown;
}

function stamp(): string {
  return new Date().toISOString();
}

export function createLogger(base: LogContext = {}) {
  const correlationId = (base.correlationId as string | undefined) || crypto.randomUUID();
  const withMeta = { ...base, correlationId };

  const log = (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => {
    const prefix = `[${stamp()}] [${level.toUpperCase()}] ${withMeta.route || 'api'} cid=${correlationId} :: ${message}`;
    if (data === undefined) {
      console[level](prefix);
      return;
    }
    console[level](prefix, data);
  };

  return {
    correlationId,
    info: (message: string, data?: unknown) => log('info', message, data),
    warn: (message: string, data?: unknown) => log('warn', message, data),
    error: (message: string, data?: unknown) => log('error', message, data),
    debug: (message: string, data?: unknown) => log('debug', message, data),
  };
}
