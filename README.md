# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## Production voltage API configuration

The Azure deployment workflow sets `VITE_API_BASE_URL` to the auth Function App
origin (`https://busbar-auth-api-dev-escfdmdebmdyahg5.centralindia-01.azurewebsites.net`).
The client uses `/api/read/getAllDevices` and the other authenticated proxy paths; do not append
`/api` to this base URL. `/backend` is only a local Vite development proxy and
does not exist in the deployed static site. Using it in production previously
returned the frontend HTML through the navigation fallback instead of JSON.

After changing the workflow, push to `main` and wait for the Azure Static Web Apps
build and deployment to complete. Vite embeds `VITE_*` values during the build;
changing Azure runtime settings alone does not update the frontend bundle.

In the auth Function App's CORS settings, allow the exact deployed frontend
origin (scheme and hostname, without a path), including any custom domain used.
The proxy validates the frontend's bearer token and admin role before forwarding
to the read functions with server-held function keys. Viewers currently receive
403. Keep the read functions at `authLevel: 'function'`. Never put a function key
in a `VITE_*` variable or frontend source. Locally, `/backend` forwards to
`VITE_AUTH_API_BASE_URL`; the Vite proxy no longer injects a function key.

Verify in browser Network tools that `getAllDevices` calls the auth Function App's
`/api/read/getAllDevices` endpoint and returns JSON. A CORS error indicates the allowed
origin needs attention; a 401/403 requires checking backend authentication.

## Authentication

Set `VITE_AUTH_API_BASE_URL=https://busbar-auth-api-dev-escfdmdebmdyahg5.centralindia-01.azurewebsites.net` in `.env.local` for authentication.
The frontend calls `POST /api/login`, `POST /api/logout`, and `GET /api/me`.
`VITE_API_BASE_URL` remains the separate voltage API base URL.
The auth backend must allow the frontend origin and credentials through CORS.
Restart Vite after changing environment variables.

Request:
```json
{ "username": "operator", "password": "password" }
```

Expected successful response:
```json
{
  "accessToken": "server-issued-token",
  "expiresIn": 3600,
  "user": { "id": "123", "username": "operator", "name": "Operator", "email": "operator@example.com", "role": "operator" }
}
```

`id` and `username` are required; other user fields are optional. `expiresIn` is
in seconds and is required for opaque tokens. JWTs may instead provide `exp`.
When both are present, the earlier expiry wins. JWT decoding only schedules
logout; the backend must validate tokens and permissions on every protected API.
Return 401/403 for invalid login credentials and 401 for expired/invalid API tokens.

The Redux `user` slice owns the session, loading state, and login errors.
Protected pages redirect to login and return to the requested page after sign-in.
Voltage API calls send `Authorization: Bearer <accessToken>`.
Session expiry or an API 401 clears the session. Logout clears local session data
and calls the logout function with the bearer token. Server logout failures are shown
on the login screen. Protected routes validate sessions using `/api/me`, which must
return a user object or `{ "user": ... }` with the same user fields described above.
Token refresh is not implemented.

By default sessions use sessionStorage; Remember me uses localStorage until token
expiry. Passwords are never persisted. Browser token storage is accessible to
JavaScript; protect the app against XSS and use HTTPS in production. A future
refresh flow should use a server-managed HttpOnly cookie rather than persist a
refresh token in browser storage. If storage is blocked, login works in memory only.

The backend login endpoint is not implemented in this frontend repository.

### Local authentication proxy

During `npm run dev`, auth requests use `/auth-backend/api/...`. Vite forwards
them to `VITE_AUTH_API_BASE_URL`, avoiding cross-origin browser requests locally.
Restart Vite after changing its proxy configuration. Production builds use the
Azure URL directly; configure the deployed frontend origin in the auth Function
App's CORS allowed origins. The Vite development proxy is not a production proxy.
