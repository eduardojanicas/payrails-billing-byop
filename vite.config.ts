import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // Lovable Cloud injects these at build time; provide fallbacks for dev preview
  const fallbackEnv: Record<string, string> = {
    VITE_SUPABASE_URL: 'https://jvnxvrpjakhkpprtpxcr.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bnh2cnBqYWtoa3BwcnRweGNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MTUwODIsImV4cCI6MjA4ODI5MTA4Mn0.nNt_veDZ16fQI1FTpuwNTN2qGz3B5I_1AjR2tawz1lQ',
    VITE_SUPABASE_PROJECT_ID: 'jvnxvrpjakhkpprtpxcr',
  };

  // Build define map: only set vars that aren't already provided by .env
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(fallbackEnv)) {
    if (!process.env[key]) {
      define[`import.meta.env.${key}`] = JSON.stringify(value);
    }
  }

  return {
    plugins: [react()],
    define,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
