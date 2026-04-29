# docker-app-portal

自架的 Docker 容器入口管理平台 — 自動發現本機跑的 container，把它們以 App 卡片呈現，使用者點擊後在 iframe tab 內開啟，並透過 Caddy 反向代理管理子網域。

## 一句話描述

把家裡 server 上一堆 Docker container（HomeAssistant、Frigate、Jellyfin、各式 Web UI 等）統整成一個「桌面式」入口頁，搭配自動子網域路由與多帳號權限。

## 技術棧

- **後端**：Fastify + TypeScript（CommonJS）
- **前端**：React 18 + Vite + TailwindCSS + Zustand（ESM）
- **DB**：SQLite + better-sqlite3 + Drizzle ORM（query builder only，無 migration runner）
- **反向代理**：Caddy（Caddyfile 由後端程式化讀寫）
- **AI**：Google Gemini（自動產生 service 描述）
- **Monorepo**：npm workspaces（`packages/backend` + `packages/frontend`）
- **部署**：Docker Compose（開發 build from source / 正式 pull from Docker Hub）

## 主要功能

| 功能 | 說明 |
|---|---|
| Container 自動發現 | 每 30 秒掃 Docker socket，新 container 自動成為 App tile |
| 外部服務（is_external） | 標記外部服務（NAS、router、VM）— 不會被 Docker 掃描掉線 |
| iframe Tab 系統 | `TabLayout.tsx` 維護「Portal + 多 App tab」，每個 App 一個 iframe，URL hash 記住 active tab |
| 子網域管理 | Admin UI 直接編輯 Caddyfile（`@name host sub.sisihome.org` block），改完自動 restart Caddy 容器 |
| AI 描述產生 | Gemini 看 container metadata 自動寫入 `custom_description` |
| 多帳號 + JWT | Access token 15 min / Refresh token 7 days；Admin 用密碼登入，一般 user 無密碼選擇登入 |
| 服務偏好 | Pin / Hide / Edit display name 等 per-user 設定 |
| 全 zh-TW UI | 所有 user-facing 字串都是繁體中文 |

## 架構

```
docker-app-portal/
├── packages/backend/     Fastify API（CommonJS）
│   └── src/
│       ├── db/           Drizzle schema + better-sqlite3 singleton
│       ├── routes/       auth / users / services / domains / links / admin
│       ├── services/
│       │   ├── docker.ts       # 30s 掃描 loop
│       │   ├── caddyfile.ts    # Caddyfile 解析 / 寫入 / restartCaddy()
│       │   └── gemini.ts       # AI 描述產生
│       └── plugins/      Fastify plugins (auth)
├── packages/frontend/    React SPA（ESM）
│   └── src/
│       ├── App.tsx       Router: / /select /admin /settings
│       ├── components/
│       │   ├── TabLayout.tsx   # iframe tab manager（key component）
│       │   └── ServiceCard.tsx
│       └── stores/tabStore.ts  # Zustand
├── docker-compose.yml          # Dev: build from source
└── docker-compose.prod.yml     # Prod: pull from Docker Hub
```

### iframe sandbox

```
sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
allow="fullscreen; geolocation *; camera *; microphone *"
```

`allow-same-origin` 是刻意保留 — 所有服務共用根網域 `*.sisihome.org`，去掉會讓 iframe 內 cookies / localStorage 失效。**不要加 `allow-top-navigation`**，會讓 iframe 劫持 URL bar。

## 開發

```bash
npm install
npm run dev:backend    # tsx watch（port 3000）
npm run dev:frontend   # Vite HMR（port 5173）
```

## 部署

### Production（Docker Compose）

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

前端對外 port **1123**。Image 由 GitHub Actions 推到 Docker Hub（`.github/workflows/docker-publish.yml`，push to `main` 自動觸發）。

### 必要環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | 3000 | Fastify listen port |
| `JWT_SECRET` | — | **必填**，token 簽章密鑰 |
| `CADDYFILE_PATH` | — | 主機上 Caddyfile 絕對路徑（bind mount 進 container） |
| `CADDY_CONTAINER_NAME` | — | Caddy container name（用於程式化 restart） |
| `DATABASE_PATH` | `/data/app.db` | SQLite 檔案路徑 |
| `TZ` | — | `Asia/Taipei` |

### 安全注意

後端 container mount `/var/run/docker.sock`，等同於主機 root 權限。**絕對不可不帶 auth 直接公開後端 port**。

## URL

- Repo：<https://github.com/chuangkevin/docker-app-portal>
- Domain（私人部署）：`*.sisihome.org`（家用內網 + Tailscale）
