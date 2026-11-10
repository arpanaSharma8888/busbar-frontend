
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const isDev = command === 'serve';

  return {
    plugins: [react()],

    server: {
      proxy: isDev
        ? {
            '/backend': {
              target: env.AZURE_READ_API_URL,
              changeOrigin: true,
              rewrite: (path) =>
                path.replace(/^\/backend/, ''),
              headers: {
                'x-functions-key':
                  env.AZURE_READ_FUNCTION_KEY,
              },
            },

            '/auth-backend': {
              target:
                env.AZURE_AUTH_API_URL ||
                'http://localhost:7071',
              changeOrigin: true,
              rewrite: (path) =>
                path.replace(/^\/auth-backend/, ''),
            },
          }
        : undefined,
    },
  };
});
