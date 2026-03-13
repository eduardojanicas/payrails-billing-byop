const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, x-correlation-id, x-request-id',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

export function corsPreflight(): Response {
  return new Response('ok', { headers: BASE_HEADERS });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: BASE_HEADERS });
}

export function badRequest(message: string, details?: unknown): Response {
  return json({ error: message, ...(details ? { details } : {}) }, 400);
}

export function unauthorized(message = 'Unauthorized'): Response {
  return json({ error: message }, 401);
}

export function notFound(message = 'Not found', details?: unknown): Response {
  return json({ error: message, ...(details ? { details } : {}) }, 404);
}

export function serverError(message: string, details?: unknown): Response {
  return json({ error: message, ...(details ? { details } : {}) }, 500);
}

export function upstreamError(message: string, details?: unknown, status = 502): Response {
  return json({ error: message, ...(details ? { details } : {}) }, status);
}
