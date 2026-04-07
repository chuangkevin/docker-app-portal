# Project Memory — docker-app-portal

> Canonical context for AI assistants. Read alongside CLAUDE.md for the full picture.

## Identity

- **Name:** docker-app-portal
- **Version:** 0.3.0
- **Purpose:** Self-hosted portal that discovers Docker containers and launches them in iframe tabs
- **Domain:** `*.sisihome.org` (Caddy reverse proxy, TLS via Let's Encrypt)
- **UI Language:** Traditional Chinese (zh-TW)

---

## Stack Snapshot

| Layer | Technology |
|-------|-----------|
| Backend | Fastify 4, TypeScript, CommonJS, better-sqlite3, Drizzle ORM |
| Frontend | React 18, Vite 5, TypeScript, TailwindCSS, Zustand, TanStack Query |
| Database | SQLite at `/data/app.db` (Docker volume `sqlite_data`) |
| Auth | JWT (15 min) + refresh token cookie (7 days) |
| Proxy | Caddy — programmatic Caddyfile management |
| AI | Google Gemini (pooled API keys) for service descriptions |
| Container | Docker API via `/var/run/docker.sock` (Dockerode) |

---

## Critical Files

| File | Why it matters |
|------|---------------|
| `packages/frontend/src/components/TabLayout.tsx` | iframe tab system — do not break sandbox attrs |
| `packages/backend/src/services/caddyfile.ts` | Regex Caddyfile parser — understands only its own format |
| `packages/backend/src/services/docker.ts` | 30 s scan loop; `is_external` exemption logic lives here |
| `packages/backend/src/db/schema.ts` | Single source of truth for all DB tables |
| `packages/backend/src/plugins/` | JWT auth middleware injected into Fastify |

---

## Domain Concepts

### iframe Tab System
- Permanent "Portal" tab + app tabs (each is an `<iframe>`)
- Active tab persisted in URL hash: `#app={url}&title={title}` — restored on reload
- `tabStore.ts` (Zustand) owns the tab list
- `allow-same-origin` in sandbox is **intentional** — services share root domain

### is_external Flag
- `services.is_external = 1` → service is never marked offline by Docker scan
- Toggled via `PATCH /api/admin/services/:id/external`
- Use for NAS, router UIs, VMs — anything not running in Docker

### Caddyfile Parser
- Only understands blocks it wrote itself (regex, not full AST)
- Domain suffix `.sisihome.org` is hardcoded
- Always call `parseBindings()` before any mutation to validate state
- Env: `CADDYFILE_PATH`, `CADDY_CONTAINER_NAME`

### Service Deduplication
- `GET /api/services` deduplicates by domain, preferring: online > has display_name > has
  custom_description
- Multiple containers on the same subdomain merge into one tile

---

## Hard Constraints

1. **No package upgrades** — add new packages only; never bump existing versions
2. **Backend = CommonJS** — no top-level await, no `.mjs` imports
3. **No frontend test suite** — TypeScript strict mode is the correctness gate
4. **Docker socket = root access** — backend must never be publicly exposed without auth
5. **Caddyfile writes are destructive** — wrong writes kill all routes; validate before/after

---

## Deployment Quick Reference

```bash
# Dev
npm run dev:backend    # port 3000
npm run dev:frontend   # port 5173

# Prod
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
# Frontend on host port 1123
```

CI: push to `main` → GitHub Actions → Docker Hub images rebuilt.

---

## Tooling (added v0.3.0)

- **ESLint:** `.eslintrc.cjs` (root, monorepo overrides for frontend React rules)
- **Prettier:** `.prettierrc` (`singleQuote`, `printWidth: 100`, `trailingComma: es5`, LF)
- **Scripts:** `npm run lint` / `npm run format` at workspace root
- **CLAUDE.md:** Full architecture reference at repo root
