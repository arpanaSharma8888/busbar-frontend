
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const target = env.AZURE_READ_API_URL;

  if (!target) {
    throw new Error('AZURE_READ_API_URL is missing');
  }

  return {
    plugins: [react()],

    server: {
      proxy: {
        '/auth-backend': {
          target: env.VITE_AUTH_API_BASE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/auth-backend/, ''),
        },
        '/backend': {
          target,
          changeOrigin: true,
          rewrite: (path) =>
            path.replace(/^\/backend/, ''),

          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.AZURE_READ_FUNCTION_KEY;

              if (key) {
                proxyReq.setHeader('x-functions-key', key);
              }
            });
          },
        },
      },
    },
  };
});
