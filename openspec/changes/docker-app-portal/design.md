## Context

全新專案，從零建置。目標是一個自架的 Docker 服務入口，部署在同一台 Docker 主機或內網環境。

主要挑戰：
1. Docker API 存取需要適當的 socket 權限
2. Gemini API 呼叫需快取以避免重複費用
3. 元件級頁面關聯的資料模型需支援靈活的服務分組
4. Admin 強制隱藏必須在 API 層防範，不能只靠前端

## Goals / Non-Goals

**Goals:**
- 單一後端 API + 前端 SPA，可 docker-compose 一鍵部署
- 支援 Docker socket 掃描（本機 `/var/run/docker.sock`）
- Gemini 生成的描述持久化至 SQLite，支援手動覆寫
- 元件級頁面關聯：服務可被分配到多個「頁面/分組」，設定頁可拖拉調整
- Admin 強制隱藏在 API 層實作，後端查詢時直接過濾
- JWT 認證，accessToken 存 memory，refreshToken 存 httpOnly cookie

**Non-Goals:**
- 多 Docker host 管理（僅支援單一 host）
- 服務的啟停控制（只展示，不操作容器）
- OAuth / SSO（僅本地帳密）
- 即時 WebSocket 推送（polling 即可）

## Decisions

### 1. 技術棧：Node.js (Fastify) + React (Vite) + SQLite

**選擇**：Fastify 後端 + React SPA + SQLite

**理由**：
- Fastify 比 Express 快，內建 schema 驗證，適合 API server
- React + Vite 開發體驗佳，輸出靜態檔可由 Fastify 直接 serve
- SQLite 零配置，單機部署不需要 Postgres 服務，適合此規模

**替代方案考量**：
- Next.js：SSR 對此場景不必要，增加複雜度
- PostgreSQL：overkill，SQLite 已足夠
- Python FastAPI：也是好選擇，但 JS 全棧減少語言切換成本

### 2. 資料模型：服務、頁面分組、可見性

核心資料表：

```sql
-- 使用者
users (id, username, password_hash, role: 'admin'|'user', created_at)

-- Docker 服務快照
services (id, container_id, name, image, ports, labels, ai_description, custom_description, last_seen_at)

-- 頁面/分組（用來做元件級關聯）
pages (id, name, slug, order, created_by)

-- 服務與頁面的關聯（元件級）
service_page_assignments (id, service_id, page_id, order)

-- 個人可見性偏好（user 自己設定）
user_service_prefs (id, user_id, service_id, is_hidden)

-- Admin 強制隱藏（覆蓋個人設定，user 無法解除）
admin_service_overrides (id, service_id, target_user_id NULLABLE, is_force_hidden)
-- target_user_id = NULL 表示對所有 user 強制隱藏
```

**元件級頁面關聯說明**：
- `pages` 是管理者自定義的分組/頁面（例如「開發工具」、「監控」、「多媒體」）
- `service_page_assignments` 記錄哪個服務出現在哪個頁面，支援排序
- 前端 Landing Page 可依頁面分組顯示服務卡片
- 設定頁提供 UI 讓管理者拖拉服務到各頁面

### 3. 服務可見性優先級

```
Admin 強制隱藏 > 個人隱藏偏好 > 預設可見
```

API 查詢邏輯：
1. 先查 `admin_service_overrides`：若有強制隱藏 → 過濾掉
2. 再查 `user_service_prefs`：若個人設定隱藏 → 過濾掉
3. 剩下的服務回傳給前端

### 4. Gemini 整合策略

- 首次掃描到新容器時，呼叫 Gemini 2.5 Flash 生成描述
- 結果存入 `services.ai_description`，後續不重複呼叫
- 管理者可在服務設定頁輸入 `custom_description` 覆蓋 AI 描述
- 前端顯示優先級：`custom_description` > `ai_description`
- Gemini prompt 包含：container name, image, exposed ports, docker labels

### 5. 使用者體驗：Netflix-style Profile 選擇

**模型**：
- 應用入口是「選擇使用者」畫面（類似 Netflix 的「誰在看？」）
- 一般使用者：點擊頭像 → 直接登入，無需密碼
- Admin 使用者：點擊頭像 → 彈出密碼 modal → 驗證通過才進入
- 任何人都可以從選擇畫面點「新增使用者」，直接輸入 username 建立（無密碼）
- 第一次訪問（無任何使用者）→ 強制建立 Admin 帳號（需設密碼）

**資料表調整**：
```sql
-- users 表：password_hash 允許 NULL（一般使用者無密碼）
users (id, username, password_hash NULLABLE, role: 'admin'|'user', avatar_color, created_at)
```

**API 端點**：
- `GET /api/users` → 回傳所有使用者列表（供選擇畫面顯示）
- `POST /api/users` → 新增一般使用者（僅需 username，無需認證）
- `POST /api/auth/select/:userId` → 一般使用者選擇後直接發 JWT
- `POST /api/auth/admin-login` → Admin 密碼驗證後發 JWT
- `POST /api/auth/refresh` → refreshToken → 新 accessToken
- `POST /api/auth/logout` → 使 refreshToken 失效

**JWT 策略**：
- accessToken（15min，存 memory）+ refreshToken（7d，httpOnly Secure SameSite=Strict cookie）
- API 請求帶 `Authorization: Bearer <accessToken>`
- Access token 過期 → 自動用 refresh token 換新

### 6. Gemini API Key 儲存在 DB，不存 env/git

**決策**：Gemini API Key 存入 SQLite `settings` 表，由 Admin 在設定頁輸入。

**理由**：
- API Key 不應出現在 `.env` 檔（易被 commit）或 docker-compose（易洩漏到 git）
- 存 DB 後，key 隨 SQLite volume 持久化，不會因重新部署 image 而遺失
- Admin 可隨時在 UI 更新 key，無需修改 server config 或重啟服務

**實作**：
- `settings (key TEXT PRIMARY KEY, value TEXT)` 表
- `GET /api/admin/settings/gemini-key` → 只回傳 `{ isSet: boolean }`，不回傳明文
- `PUT /api/admin/settings/gemini-key` → 寫入 DB（Admin only）
- GeminiService 每次呼叫前從 DB 讀取 key；若未設定 → 跳過生成，前端顯示「請先設定 Gemini API Key」提示

**安全**：DB 檔在 Docker volume 內，不在 git repo 範圍

---

### 7. CI/CD：GitHub Actions 兩段式（參考 ebook-reader）

**模式**：
1. `docker-publish.yml`：push to main（觸發路徑：`packages/**`、`docker-compose*.yml`、`.github/workflows/*.yml`）→ build frontend + backend Docker images（linux/arm64）→ push to Docker Hub
2. `deploy.yml`：docker-publish 完成後 → 透過 Tailscale VPN + SSH 連到家用伺服器 → `docker compose pull` + `docker compose up -d --force-recreate` → health check

**Secrets**：`DOCKERHUB_TOKEN`、`TS_OAUTH_CLIENT_ID`、`TS_OAUTH_SECRET`、`DEPLOY_SERVER_IP`、`DEPLOY_USER`、`DEPLOY_PATH`、`DEPLOY_PORT`

**注意**：`docker-compose.prod.yml`（生產）與 `docker-compose.yml`（開發）分離，prod 版只引用 Docker Hub images，不含 build context

---

### 8. Docker API 存取

- 後端透過 `dockerode` 套件連接 `/var/run/docker.sock`
- docker-compose 部署時 mount socket：`/var/run/docker.sock:/var/run/docker.sock:ro`
- 每 30 秒輪詢一次（可設定），更新 `services` 表

## Risks / Trade-offs

- **Docker socket 安全性** → 後端容器使用 `:ro`（唯讀）mount，並限制只呼叫 list/inspect API
- **Gemini API 費用** → 每個服務只生成一次描述並快取，手動清除快取才重新生成
- **SQLite 並發限制** → 單機使用，並發量低，可接受；若未來需多節點則遷移至 PostgreSQL
- **JWT refresh token 安全** → httpOnly + Secure + SameSite=Strict cookie，防 XSS/CSRF

## Migration Plan

1. 初次部署：`docker-compose up` → DB auto-migrate（drizzle-kit push）
2. 無既有資料，無需遷移
3. 版本升級：DB migration 腳本隨 image 發布，啟動時自動執行

## Open Questions

- 前端路由策略：單一 `/` + 頁面分組 tabs？還是 `/page/:slug` 多路由？（建議 tabs，較簡單）
- Docker API 掃描頻率是否需讓 admin 在 UI 設定？（建議預設 30s，暫不開放設定）
- Gemini prompt 語言：中文還是英文輸出描述？（建議依 `LANG` env 設定，預設中文）
