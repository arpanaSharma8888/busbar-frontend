# Busbar frontend

React and TypeScript application for signing in, viewing controller voltage readings,
exporting records, editing a profile, and provisioning controllers over USB.

## Start here: how the code works

Read these files in order:

1. **src/main.tsx** starts React, provides the Redux store, and sets up Mantine styling.
2. **src/App.tsx** maps URLs to pages. RequireAuth protects signed-in routes;
   RequireRole limits Device Management to admins. AppLayout supplies the header/sidebar.
3. **src/pages/Dashboard.tsx** loads the available devices and their latest readings.
   It passes the selected device to the graph components.
4. **src/components/charts/DashboardGraph.tsx** owns graph filters, loading state,
   requests, and realtime polling. VoltageChart.tsx draws those readings with uPlot.
5. **src/services/voltageApi.ts** requests readings. apiClient.ts adds authentication;
   authApi.ts builds the API URLs. Follow this chain when investigating a request.

## Where to make changes

| Folder/file | Responsibility |
| --- | --- |
| src/pages | Screen state, user actions, and page markup |
| src/components/layout | Header and sidebar |
| src/components/charts | Graph controls, data preparation, and drawing |
| src/store/userSlice.ts | Login/verification actions and shared session state |
| src/store/index.ts | Store setup and session persistence/logout side effects |
| src/services/session.ts | Validate, read, save, and clear browser session storage |
| src/services/authApi.ts | Login, profile, password, signup, and API URL handling |
| src/services/deviceManagementApi.ts | Device registry and provisioning requests |
| src/services/usbProvisioning.ts | USB connection, sending, buffering, and timeouts |
| src/services/busbarPacketProtocol.ts | Encode/decode binary packets and check CRC |
| tests | Automated service and data transformation checks |
| mock/mock-controller.cjs | Separate JSON handshake mock; not the binary provisioning protocol |

## Following a user action

**Login:** Login.tsx dispatches the login action in userSlice.ts. The action calls
loginRequest in authApi.ts. Success stores the session in Redux; the store listener
persists it according to Remember me. RequireAuth verifies the session and handles
expiry. API requests use its bearer token.

**Graphs:** DashboardGraph requests historical readings for the selected window.
Realtime mode repeats the request 10 seconds after each request finishes. Changing
filters or leaving the component aborts the old request and clears its timer.
chartData.ts prepares the points; VoltageChart manages the external chart instance.
TabularData.tsx separately loads records, paginates them, and exports CSV.

**USB registration:** MacIdManagement.tsx connects and sends HELLO to obtain the
controller identity. provisioningAttempt.ts chooses a new registration or an eligible
retry. Azure supplies a transaction; USB sends configuration (A3) and receives a proof
(A4). Azure verifies the proof and activates the device, then the frontend sends the
controller confirmation (A5). Unfinished registrations are cancelled on failure;
an A5 failure after activation does not undo activation. The USB connection closes
in the final cleanup block.

createUsbProvisioningSession() returns ordinary functions such as connect(), hello(),
provision(), and close(). Each call creates its own local port, reader, and buffer.
Those functions remember these variables (a JavaScript closure), so no class or
this keyword is needed.

## Reading React and TypeScript syntax

- **useState** holds a value used on screen; its setter schedules a render.
- **useRef** remembers a mutable value without rendering, such as a USB session or timer.
- **useEffect** synchronizes with APIs/events; its returned function performs cleanup.
- **useMemo/useCallback** retain a calculated value/function until dependencies change.
- **async/await** waits for asynchronous work. **try/catch/finally** separates success,
  errors, and cleanup that runs even after an error or early return.
- **?.** accesses something only when it exists. **??** supplies a fallback only for
  null/undefined. **...** copies or expands object properties/array elements.
- **type/interface** describe data for TypeScript checks; they do not run in the browser.
- **void someAsyncFunction()** intentionally ignores its returned promise; it does not
  catch errors. Look inside that function for its error handling.
- Redux Toolkit reducer assignments are handled by Immer, which produces immutable
  updates. Ordinary function declarations are also modern JavaScript and remain useful.

## Local commands and readability conventions

Run npm install, then npm run dev. Use npm run build, npm test, and npm run lint
for verification. In PowerShell with script execution disabled, use npm.cmd instead.
Environment/proxy configuration is described below and in vite.config.ts. The current
voltage URL implementation uses /apim-read locally and VITE_APIM_READ_BASE_URL in
production; older deployment notes below describe earlier backend routing.

Keep one statement per line, use descriptive local names, and put braces around
conditional/loop bodies. ESLint enforces braces, const where possible, and no var in
application code. .prettierrc.json records the formatting settings; to reformat with
the same formatter, run:

    npx prettier@3.6.2 --write "src/**/*.{ts,tsx,css}" "mock/*.cjs"

Two tests in tests/auth.test.ts still disagree with the current APIM routing.
The build and lint checks pass. USB tests use simulated streams and do not replace
verification with a physical controller.

## Telemetry status and HART branding

The title is **Busbar Voltage Monitoring System**. The dashboard distinguishes
enabled registration from fresh telemetry: a reading is fresh for 60 seconds after
its receivedAt timestamp. The clock advances independently of API polling, so an
unchanged reading becomes stale even during a slow request. This describes data
freshness, not a confirmed physical connection or electrical alarm condition.

Stale or unavailable current values display a dash. Last received values and their
timestamps remain visible separately. Graphs retain captured history and explicitly
label stale data; the last successful fetch time is separate from the sample time.
Voltage formatting retains up to three decimal places without trailing zeroes.

CompanyBrand.tsx displays the official logo bundled from src/assets/hartLogo.png.
The header, login, and signup share this component. No environment configuration
is required. VITE_HART_LOGO_URL optionally overrides the image location at build
time; if the asset fails to load, the HART text brand remains visible.

## Production voltage API configuration

The Azure deployment workflow sets `VITE_API_BASE_URL` to the auth Function App
origin (`https://busbar-auth-api-dev-escfdmdebmdyahg5.centralindia-01.azurewebsites.net`).
Voltage readings use `/api/read/getLatestVoltage` and `/api/read/getHistoricalVoltage`;
the device list uses `/api/listDashboardDevices` on `VITE_AUTH_API_BASE_URL`. Do not append
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

Verify in browser Network tools that the device list calls the auth Function App's
`/api/listDashboardDevices` endpoint and returns JSON. A CORS error indicates the allowed
origin needs attention; a 401/403 requires checking backend authentication.

The Static Web Apps configuration disables caching of the HTML entry point,
including client-side routes served by the navigation fallback, so new visits
load the current deployment. Vite's hashed `/assets/*` files remain cacheable.
Deploy the configuration together with the frontend build. If a first-login 404
persists, compare the failed request URL and response with the request after a
refresh to distinguish an old frontend from an API-side failure.

## Retrying incomplete USB provisioning

HELLO identifies the controller. Registration then creates a **pending** database
record before sending A3; only a valid A4 proof activates it. A failed USB exchange
can therefore leave a pending or cancelled record without a working device.

Device Management shows these incomplete records. Reconnect the same controller,
then choose **Register / Retry Provisioning**. The frontend calls
`POST /api/retryDeviceProvisioning` for an existing pending or cancelled identity.
The backend permits only the original admin and matching identity, archives the
previous attempt, replaces the credential and challenge, and uses the record's
ETag to prevent overwriting concurrent changes. Previously activated devices
cannot use this retry path. No firmware-erasure claim is sent.

Deploy `busbar-auth-backend` with the new `retryDeviceProvisioning` function and
its `src/index.js` import **before** deploying this frontend. The endpoint requires
the existing device credential encryption key and provisioning history table
access. It repairs eligible existing incomplete records on retry; no manual
database deletion is needed.

The real controller must accept A3 again, store the replacement configuration,
and return A4 with the new proof. If its firmware requires a reset first, follow
the controller's reset procedure; retry does not bypass that requirement.

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

During development, voltage requests always use `/backend/api/read/...`, which
Vite forwards to `VITE_AUTH_API_BASE_URL`. This avoids direct browser requests to
the read Function App even if a local `VITE_API_BASE_URL` contains its URL.
Production voltage requests still use `VITE_API_BASE_URL` as configured above.

During `npm run dev`, auth requests use `/auth-backend/api/...`. Vite forwards
them to `VITE_AUTH_API_BASE_URL`, avoiding cross-origin browser requests locally.
Set `AZURE_AUTH_API_URL` only to override that proxy target (for example, to run
the auth backend at `http://localhost:7071`).
Restart Vite after changing its proxy configuration. Production builds use the
Azure URL directly; configure the deployed frontend origin in the auth Function
App's CORS allowed origins. The Vite development proxy is not a production proxy.
