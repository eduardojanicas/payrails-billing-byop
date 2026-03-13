import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { Context } from 'npm:hono@4.10.2';
import { runtimeEnv } from './env.ts';

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export async function requireUser(c: Context): Promise<AuthenticatedUser | null> {
  const auth = c.req.header('authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const client = createClient(runtimeEnv.SUPABASE_URL, runtimeEnv.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email || undefined,
  };
}
