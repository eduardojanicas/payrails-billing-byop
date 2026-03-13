import { runtimeEnv } from './env.ts';

interface CachedTokenEntry {
  token: string;
  expiresAt: number;
}

const tokenCache: Map<string, CachedTokenEntry> = new Map();
let cachedHttpClient: Deno.HttpClient | null = null;

function decodePem(raw: string, kind: 'CERTIFICATE' | 'PRIVATE KEY'): string {
  let trimmed = raw.trim();

  if (trimmed.includes('truncated for brevity')) {
    throw new Error(`${kind} env var contains placeholder text; replace with full PEM`);
  }

  // Handle escaped newlines (single or double escaped)
  trimmed = trimmed.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');

  // Try base64 decoding if no PEM header visible
  if (!/-----BEGIN/.test(trimmed)) {
    try {
      const standardBase64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(standardBase64);
      if (/-----BEGIN/.test(decoded)) {
        trimmed = decoded;
      }
    } catch {
      // Not valid base64
    }
  }

  // Extract the base64 body from PEM (strip headers, footers, whitespace)
  // Then reconstruct with proper formatting — this handles cases where
  // newlines were lost during secret storage
  const header = kind === 'PRIVATE KEY' ? 'PRIVATE KEY' : 'CERTIFICATE';
  const body = trimmed
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s/g, '');

  if (!body) {
    throw new Error(`Unable to decode ${kind}: no base64 content found`);
  }

  // Reconstruct a clean PEM with proper 64-char line wrapping
  const wrapped = body.replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${header}-----\n${wrapped}\n-----END ${header}-----\n`;
}

export function getMTLSHttpClient(): Deno.HttpClient {
  if (cachedHttpClient) return cachedHttpClient;
  const cert = decodePem(runtimeEnv.CLIENT_CERT_PEM, 'CERTIFICATE');
  const key = decodePem(runtimeEnv.CLIENT_KEY_PEM, 'PRIVATE KEY');
  try {
    cachedHttpClient = Deno.createHttpClient({ cert, key });
  } catch (e) {
    console.error('[mTLS] createHttpClient failed. cert length:', cert.length, 'key length:', key.length);
    throw e;
  }
  return cachedHttpClient;
}

export async function fetchAccessToken(baseUrl: string): Promise<string> {
  const existing = tokenCache.get(baseUrl);
  const now = Date.now();
  if (existing && existing.expiresAt - now > 30_000) {
    return existing.token;
  }

  const response = await fetch(`${baseUrl}/auth/token/${runtimeEnv.PAYRAILS_CLIENT_ID}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'x-api-key': runtimeEnv.PAYRAILS_CLIENT_SECRET,
      'User-Agent': 'payrails-lovable-migration/1.0',
    },
    client: getMTLSHttpClient(),
  } as RequestInit & { client: Deno.HttpClient });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Token request failed (${response.status}): ${raw.slice(0, 500)}`);
  }

  let parsed: { access_token?: string; expires_in?: number } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Token JSON parse failed: ${raw.slice(0, 500)}`);
  }

  if (!parsed.access_token) {
    throw new Error('Missing access_token in token response');
  }

  const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : 300;
  tokenCache.set(baseUrl, {
    token: parsed.access_token,
    expiresAt: now + expiresIn * 1000,
  });

  return parsed.access_token;
}

export async function payrailsJson<T = any>(opts: {
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  token?: string;
  payload?: unknown;
  baseUrl?: string;
}): Promise<T> {
  const baseUrl = opts.baseUrl || runtimeEnv.PAYRAILS_BASE_URL;
  const url = new URL(opts.path, baseUrl);

  const response = await fetch(url.toString(), {
    method: opts.method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'payrails-lovable-migration/1.0',
      'x-idempotency-key': crypto.randomUUID(),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.payload === undefined ? undefined : JSON.stringify(opts.payload),
    client: getMTLSHttpClient(),
  } as RequestInit & { client: Deno.HttpClient });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Payrails ${opts.method} ${opts.path} failed (${response.status}): ${raw.slice(0, 500)}`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Payrails response JSON parse failed (${opts.method} ${opts.path}): ${raw.slice(0, 500)}`);
  }
}
