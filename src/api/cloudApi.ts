import { isSupabaseConfigured, missingSupabaseEnv, supabase, supabaseUrl } from '@/lib/supabase';

function toUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${supabaseUrl}/functions/v1/api${normalized}`;
}

function missingEnvResponse(): Response {
  const message = `Missing required frontend env vars: ${missingSupabaseEnv.join(', ')}`;
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function cloudApi(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isSupabaseConfigured || !supabase) {
    return missingEnvResponse();
  }

  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch {
    token = undefined;
  }

  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(toUrl(path), {
    ...init,
    headers,
  });
}
