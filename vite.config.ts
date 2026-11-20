
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const isDev = command === 'serve';

  return {
    plugins: [react()],

    server: {
      // Formatters may briefly truncate files while saving. Reload only once
      // the write settles, so Vite does not cache an empty module.
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 50,
        },
      },
      proxy: isDev
        ? {
            '/backend': {
              target: env.VITE_AUTH_API_BASE_URL,
              changeOrigin: true,
              rewrite: (path) =>
                path.replace(/^\/backend/, ''),
            },

            '/apim-read': {
              target: env.APIM_GATEWAY_URL || 'https://busbar-apim-dev.azure-api.net',
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/apim-read/, '/v1'),
            },

            '/auth-backend': {
              target:
                env.AZURE_AUTH_API_URL ||
                env.VITE_AUTH_API_BASE_URL ||
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
