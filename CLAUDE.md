# CLAUDE.md — docker-app-portal

> Engineering reference for AI assistants and contributors. Portal v0.3.0.

## Project Overview

A self-hosted Docker container management portal. It discovers running containers via the Docker
API, displays them as launchable app tiles in a React SPA, and opens them as tabbed iframes.
Domain routing is handled through a Caddy reverse proxy whose Caddyfile is managed
programmatically.

**Stack:** Fastify · React 18 + Vite · SQLite (better-sqlite3 + Drizzle ORM) · TailwindCSS ·
TypeScript throughout · npm workspaces monorepo

---

## Monorepo Layout

```
docker-app-portal/
├── packages/
│   ├── backend/                   # Fastify API server (Node, CommonJS)
│   │   ├── src/
│   │   │   ├── index.ts           # App entry: plugin registration, server start
│   │   │   ├── db/
│   │   │   │   ├── schema.ts      # Drizzle table definitions
│   │   │   │   └── index.ts       # DB singleton (better-sqlite3)
│   │   │   ├── routes/            # Route handlers (auth, users, services, domains, links, admin)
│   │   │   ├── services/
│   │   │   │   ├── docker.ts      # Container scan loop (30 s interval)
│   │   │   │   ├── caddyfile.ts   # Caddyfile parser / writer
│   │   │   │   └── gemini.ts      # AI description generator (Google Gemini)
│   │   │   └── plugins/           # Fastify plugins (auth middleware)
│   │   └── tsconfig.json          # CommonJS, ES2022 target
│   └── frontend/                  # React SPA (ESM, Vite)
│       ├── src/
│       │   ├── main.tsx           # React entry
│       │   ├── App.tsx            # Router: /, /select, /admin, /settings
│       │   ├── components/
│       │   │   ├── TabLayout.tsx  # iframe tab manager — KEY COMPONENT
│       │   │   └── ServiceCard.tsx
│       │   └── stores/
│       │       └── tabStore.ts    # Zustand store for open tabs
│       └── tsconfig.json          # ESM, ES2020 target
├── docker-compose.yml             # Dev: build from source
├── docker-compose.prod.yml        # Prod: pull from Docker Hub
├── .eslintrc.cjs                  # Root ESLint config (monorepo overrides)
├── .prettierrc                    # Prettier config
└── CLAUDE.md                      # This file
```

---

## Key Architecture: iframe Tab System

`TabLayout.tsx` is the centrepiece of the UI. It maintains a list of open tabs — one permanent
"Portal" tab and zero or more app tabs, each rendered as an `<iframe>`.

### Tab lifecycle

1. User clicks a `ServiceCard` → `openApp(title, url)` is called from `tabStore`
2. A new tab entry `{ id, title, url }` is appended to the Zustand store
3. `TabLayout` renders an `<iframe src={url}>` for every app tab; only the active tab is visible
4. URL hash tracks the active app: `#app={url}&title={title}`
5. On page reload the hash is parsed and the active tab is restored

### iframe sandbox attributes

```
sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
allow="fullscreen; geolocation *; camera *; microphone *"
```

- `allow-same-origin` is intentional — services share the root domain (`*.sisihome.org`);
  removing it breaks cookies and localStorage inside the iframe.
- GPS, camera, and microphone permissions are explicitly delegated so that apps that need them
  (e.g. HomeAssistant, Frigate) work without browser prompts being blocked.

### Adding new iframe capabilities

Edit `packages/frontend/src/components/TabLayout.tsx`. Add to the `allow` attribute (not the
`sandbox` attribute). **Do not add `allow-top-navigation`** — it lets the iframe hijack the
browser URL bar.

---

## Key Architecture: is_external Flag

`services.is_external` (integer, default `0`) in the DB schema marks a service as externally
managed:

| Value | Meaning |
|-------|---------|
| `0` | Normal Docker container — auto-discovered; goes offline when the container stops |
| `1` | External / static service — never marked offline by the Docker scan loop |

The Docker scan loop in `docker.ts` excludes external services from the "mark offline" UPDATE:

```ts
await db.update(services)
  .set({ status: 'offline' })
  .where(and(lt(services.last_seen_at, scanTime), eq(services.is_external, 0)));
```

**Admin toggle:** `PATCH /api/admin/services/:id/external` — body `{ is_external: 0 | 1 }`

Use `is_external = 1` for services running outside Docker (e.g. a NAS, router UI, VM).

---

## Key Architecture: Caddyfile Parser

`packages/backend/src/services/caddyfile.ts` reads and writes the live Caddyfile that Caddy uses
for TLS termination and reverse proxying.

### Expected block format

```caddy
@name host name.sisihome.org
handle @name {
    reverse_proxy localhost:PORT
}
```

The parser is regex-based (line-by-line scanning). It is **not** a full Caddy AST parser — it
only understands the block format it writes itself.

### Methods

| Method | Effect |
|--------|--------|
| `parseBindings()` | Returns `{ subdomain, port }[]` from all `@name host ...` matchers |
| `addBinding(sub, port)` | Appends HTTPS + HTTP-redirect blocks |
| `removeBinding(sub)` | Removes both blocks |
| `updateBinding(sub, port)` | Patches `reverse_proxy` port in-place |
| `getDomainForPort(port)` | Returns `sub.sisihome.org` for a given port |
| `restartCaddy()` | Calls Docker API to restart the Caddy container |

### Constraints

- Caddyfile path: env `CADDYFILE_PATH` (bind-mounted from host in both dev and prod)
- Caddy container name: env `CADDY_CONTAINER_NAME`
- Domain suffix is hardcoded as `.sisihome.org` — grep for `sisihome.org` if it needs changing
- Always call `parseBindings()` before any write to validate current file state

---

## API Summary

All routes are prefixed `/api/`.

### Authentication

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/auth/select/:userId` | none | Login as non-admin user (no password) |
| POST | `/auth/admin-login` | none | Admin login — body `{ password }` |
| POST | `/auth/refresh` | cookie | Rotate access token using refresh cookie |
| POST | `/auth/logout` | JWT | Clear refresh token from DB and cookie |
| PATCH | `/auth/admin-password` | JWT + admin | Change admin password |

### Services

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/services` | JWT | Visible services for current user (deduped by domain) |
| GET | `/services/all` | JWT + admin | All services with hidden/visibility info |
| POST | `/services/:id/pin` | JWT | Pin service |
| DELETE | `/services/:id/pin` | JWT | Unpin service |
| POST | `/services/:id/prefs` | JWT | Body `{ is_hidden: boolean }` |
| PATCH | `/services/:id` | JWT + admin | Edit `display_name` / `custom_description` |
| POST | `/services/:id/visibility` | JWT + admin | Toggle global visibility |
| POST | `/services/:id/regenerate-description` | JWT + admin | Re-run Gemini description |
| PATCH | `/admin/services/:id/external` | JWT + admin | Toggle `is_external` flag |

### Domains (Caddyfile-backed)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/domains` | JWT + admin | List all subdomain → port bindings |
| POST | `/domains` | JWT + admin | Body `{ subdomain, port }` |
| PUT | `/domains/:subdomain` | JWT + admin | Body `{ port }` |
| DELETE | `/domains/:subdomain` | JWT + admin | Remove binding + restart Caddy |

### Links, Users, Admin

See `packages/backend/src/routes/` for full handler implementations.

---

## Deployment

### Development

```bash
npm run dev:backend    # tsx watch (port 3000)
npm run dev:frontend   # Vite HMR (port 5173)
```

### Production (Docker Compose)

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Images are published to Docker Hub via `.github/workflows/docker-publish.yml` on push to `main`.
Frontend is served on host port **1123** in production.

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Fastify listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_PATH` | `/data/app.db` | SQLite file path |
| `JWT_SECRET` | — | **Required.** Token signing secret |
| `CADDYFILE_PATH` | — | Absolute path to Caddyfile on host |
| `CADDY_CONTAINER_NAME` | — | Docker container name for Caddy |
| `TZ` | — | Set to `Asia/Taipei` in compose files |

---

## Linting & Formatting

```bash
npm run lint      # ESLint across all workspaces
npm run format    # Prettier write across packages/
```

Config files: `.eslintrc.cjs` (root), `.prettierrc` (root).

---

## Constraints & Conventions

1. **No package upgrades** — pin versions; upgrade intentionally and verify Docker builds pass.
2. **CommonJS backend** — `packages/backend` is `"type": "commonjs"`. Do not use top-level
   `await` or `.mjs` imports there.
3. **No frontend tests** — Vitest is backend-only (`packages/backend`). Frontend relies on
   TypeScript strict-mode as the primary correctness gate.
4. **Chinese UI** — all user-facing strings are Traditional Chinese (zh-TW). Keep new strings
   consistent with existing copy.
5. **Docker socket** — the backend container mounts `/var/run/docker.sock`. This grants
   root-equivalent host access. Never expose the backend port publicly without authentication.
6. **Caddyfile write safety** — incorrect writes can take down all reverse-proxy routes. Always
   validate with `parseBindings()` before and after any mutation.
7. **Token lifetimes** — access tokens: 15 min; refresh tokens: 7 days.
8. **Drizzle is query-builder only** — no migration runner in production. Schema changes must be
   additive or handled with manual SQL.
