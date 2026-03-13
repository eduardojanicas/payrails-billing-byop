export interface RuntimeEnv {
  PAYRAILS_CLIENT_ID: string;
  PAYRAILS_CLIENT_SECRET: string;
  CLIENT_CERT_PEM: string;
  CLIENT_KEY_PEM: string;
  PAYRAILS_BASE_URL: string;
  PAYRAILS_WORKSPACE_ID?: string;
  PAYRAILS_WORKFLOW_CODE: string;
  PAYRAILS_ENV: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID?: string;
  CHARGEBEE_BASE_URL?: string;
  CHARGEBEE_API_KEY?: string;
  CHARGEBEE_SITE?: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value && value.trim() ? value : undefined;
}

export const runtimeEnv: RuntimeEnv = {
  PAYRAILS_CLIENT_ID: required('PAYRAILS_CLIENT_ID'),
  PAYRAILS_CLIENT_SECRET: required('PAYRAILS_CLIENT_SECRET'),
  CLIENT_CERT_PEM: required('CLIENT_CERT_PEM'),
  CLIENT_KEY_PEM: required('CLIENT_KEY_PEM'),
  PAYRAILS_BASE_URL: optional('PAYRAILS_BASE_URL') || 'https://api.payrails.com',
  PAYRAILS_WORKSPACE_ID: optional('PAYRAILS_WORKSPACE_ID'),
  PAYRAILS_WORKFLOW_CODE: optional('PAYRAILS_WORKFLOW_CODE') || 'payment-acceptance',
  PAYRAILS_ENV: optional('PAYRAILS_ENV') || 'TEST',
  STRIPE_SECRET_KEY: optional('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: optional('STRIPE_WEBHOOK_SECRET'),
  STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID: optional('STRIPE_CUSTOM_PAYMENT_METHOD_TYPE_ID'),
  CHARGEBEE_BASE_URL: optional('CHARGEBEE_BASE_URL'),
  CHARGEBEE_API_KEY: optional('CHARGEBEE_API_KEY'),
  CHARGEBEE_SITE: optional('CHARGEBEE_SITE'),
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
};

export function hasStripeConfigured(): boolean {
  return !!runtimeEnv.STRIPE_SECRET_KEY;
}

export function hasChargebeeConfigured(): boolean {
  return !!(runtimeEnv.CHARGEBEE_API_KEY && (runtimeEnv.CHARGEBEE_SITE || runtimeEnv.CHARGEBEE_BASE_URL));
}
