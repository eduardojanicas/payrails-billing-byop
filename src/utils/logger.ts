/**
 * Lightweight structured logger for API routes & hooks.
 * Adds correlationId for request-scoped tracing and consistent tag formatting.
 */

export interface LogContext {
  correlationId?: string;
  route?: string;
  extra?: Record<string, unknown>;
}

type Level = 'info' | 'warn' | 'error' | 'debug';

function stamp() {
  return new Date().toISOString();
}

function format(ctx: LogContext): string {
  const parts: string[] = [];
  if (ctx.route) parts.push(`route=${ctx.route}`);
  if (ctx.correlationId) parts.push(`cid=${ctx.correlationId}`);
  if (ctx.extra) parts.push(`extra=${JSON.stringify(ctx.extra)}`);
  return parts.join(' ');
}

export function createLogger(base: LogContext = {}) {
  const correlationId = base.correlationId || crypto.randomUUID();
  const common: LogContext = { ...base, correlationId };
  function log(level: Level, msg: string, data?: unknown) {
    const prefix = `[${stamp()}] [${level.toUpperCase()}] ${format(common)} :: ${msg}`;
    if (data === undefined) {
      (console as any)[level](prefix);
    } else {
      (console as any)[level](prefix, data);
    }
  }
  return {
    correlationId,
    info: (m: string, d?: unknown) => log('info', m, d),
    warn: (m: string, d?: unknown) => log('warn', m, d),
    error: (m: string, d?: unknown) => log('error', m, d),
    debug: (m: string, d?: unknown) => log('debug', m, d),
  };
}

export const logger = createLogger({ route: 'global' });
