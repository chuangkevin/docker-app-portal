<!-- 工作流程：每小階段完成 → 單元/整合測試 → E2E 測試 → 大階段完成 → ⏸️ 使用者手動測試確認 → commit + push -->

## 1. 專案初始化與基礎架構

- [ ] 1.1 建立 monorepo 結構：`packages/backend`（Fastify）與 `packages/frontend`（React + Vite）
- [ ] 1.2 設定根目錄 `package.json`（workspaces）、`.gitignore`、`.env.example`
- [ ] 1.3 後端：安裝依賴（fastify、@fastify/jwt、@fastify/cookie、drizzle-orm、better-sqlite3、dockerode、@google/generative-ai）
- [ ] 1.4 前端：安裝依賴（react、react-router-dom、@tanstack/react-query、axios）
- [ ] 1.5 建立 `docker-compose.yml`（backend + frontend + SQLite volume + Docker socket mount）
- [ ] 1.6 後端：設定 Fastify server 入口、CORS、靜態檔服務（serve frontend build）

## 2. 資料庫設計與 Migration

- [ ] 2.1 使用 Drizzle ORM 定義 schema：`users`、`services`、`pages`、`service_page_assignments`、`user_service_prefs`、`admin_service_overrides`、`refresh_tokens`、`settings`
- [ ] 2.2 實作 `drizzle-kit push` migration 腳本，server 啟動時自動執行
- [ ] 2.3 撰寫 seed 測試資料腳本（開發用）
- [ ] 2.4 **[測試]** 驗證 migration 腳本可從空 DB 正確建立所有表、欄位型別與 constraints

## 3. 使用者認證系統（Netflix-style）

- [ ] 3.1 後端：實作 `GET /api/users`（公開）：回傳所有使用者列表（id、username、role、avatar_color）
- [ ] 3.2 後端：實作 `POST /api/users`（公開）：建立一般使用者（無需密碼），若無任何使用者則建立 Admin（需密碼）
- [ ] 3.3 後端：實作 `POST /api/auth/select/:userId`（公開）：一般使用者點擊後直接發 JWT
- [ ] 3.4 後端：實作 `POST /api/auth/admin-login`（公開）：Admin 密碼驗證，成功後發 JWT
- [ ] 3.5 後端：實作 `POST /api/auth/refresh`：以 refreshToken cookie 換新 accessToken
- [ ] 3.6 後端：實作 `POST /api/auth/logout`：刪除 DB 中的 refreshToken、清除 cookie
- [ ] 3.7 後端：實作 JWT 驗證 Fastify plugin（preHandler hook），保護所有非 public 路由
- [ ] 3.8 後端：實作 Admin-only 路由授權 plugin（role 檢查，回傳 HTTP 403）
- [ ] 3.9 後端：實作 `PATCH /api/auth/admin-password`（Admin only）：修改 admin 密碼，舊 token 全部失效
- [ ] 3.10 **[單元測試]** 測試 bcrypt 驗證邏輯、JWT 生成與驗證、refreshToken 流程
- [ ] 3.11 **[整合測試]** API 測試：第一位建立 Admin、後續建立一般使用者、admin-login 密碼錯誤/正確、select/:userId、refresh、logout
- [ ] 3.12 前端：實作「選擇使用者」畫面（`/select`）— 顯示所有使用者頭像卡片 + 新增按鈕
- [ ] 3.13 前端：實作「新增使用者」表單（inline 或 modal）— 僅需輸入 username
- [ ] 3.14 前端：實作 Admin 密碼 modal — 點擊 Admin 頭像後彈出，錯誤顯示提示
- [ ] 3.15 前端：實作 auth store（accessToken in memory）+ axios interceptor（401 自動 refresh）
- [ ] 3.16 前端：實作 ProtectedRoute — 未登入導向 `/select`，已登入才能進 Landing Page
- [ ] 3.17 **[E2E 測試 - Playwright]** 首次進入建立 Admin → 選擇畫面出現 Admin 頭像 → 點擊 Admin 輸入密碼進入 → 新增一般使用者 → 點擊直接進入 → 切換使用者 → 登出回到選擇畫面

### ⏸️ CHECKPOINT A — 大階段：認證系統
> 請確認以下項目後回覆「OK」，才進行 commit + push：
> - Netflix-style 選擇畫面外觀與互動
> - 建立 Admin（帶密碼）與一般使用者（無密碼）
> - Admin 密碼 modal 的體驗
> - 未登入導向 `/select` 的路由保護

---

## 4. Docker 服務發現

- [ ] 4.1 後端：實作 DockerService class，使用 dockerode 連接 `/var/run/docker.sock`
- [ ] 4.2 實作 scanContainers()：列出運行中容器，提取 name/image/ports/labels
- [ ] 4.3 實作服務掃描排程（setInterval 30s），啟動時立即執行一次
- [ ] 4.4 新容器 → upsert `services` 表；消失容器 → 更新 status 為 offline
- [ ] 4.5 **[單元測試]** mock dockerode，測試 scanContainers() 資料解析邏輯、upsert 邏輯、offline 標記

## 5. Gemini AI 描述生成

- [ ] 5.1 後端：`settings` 表初始化邏輯，確保 server 啟動時表存在
- [ ] 5.2 後端 API：`GET /api/admin/settings/gemini-key`（Admin only）：回傳 `{ isSet: boolean }`
- [ ] 5.3 後端 API：`PUT /api/admin/settings/gemini-key`（Admin only）：儲存/更新 key 至 DB
- [ ] 5.4 後端：實作 GeminiService class，從 DB `settings` 表讀取 API Key（非 env）；未設定時 skip 並回傳提示
- [ ] 5.5 實作 generateDescription(service)：組裝 prompt（name/image/ports/labels），呼叫 Gemini 2.5 Flash，存入 `ai_description`
- [ ] 5.6 掃描後對 `ai_description` 為空的服務觸發非同步描述生成（逐一處理，避免 rate limit）
- [ ] 5.7 後端 API：`POST /api/services/:id/regenerate-description`（Admin only）：清空並重新生成
- [ ] 5.8 後端 API：`PATCH /api/services/:id`（Admin only）：更新 `custom_description`
- [ ] 5.9 **[單元測試]** mock Gemini client，測試 generateDescription prompt 組裝、未設定 key 的 skip 邏輯、custom_description 優先級

## 6. 服務 API

- [ ] 6.1 實作 `GET /api/services`：依使用者角色套用可見性過濾後回傳服務列表（含頁面分組資訊）
- [ ] 6.2 實作 `GET /api/services/all`（Admin only）：回傳所有服務含可見性狀態
- [ ] 6.3 實作 `PATCH /api/services/:id/prefs`：更新個人 `user_service_prefs`（隱藏/顯示）
- [ ] 6.4 **[整合測試]** API 測試：可見性過濾邏輯（admin 強制隱藏 > 個人隱藏 > 預設可見）、admin 看到全部、一般使用者過濾正確

### ⏸️ CHECKPOINT B — 大階段：服務發現 + AI 描述 + API
> 請確認以下項目後回覆「OK」，才進行 commit + push：
> - Docker 容器掃描是否正確列出服務
> - Gemini Key 可以在後端設定，`GET` 只回傳 isSet（不洩漏明文）
> - AI 描述有正確生成並儲存
> - `GET /api/services` 過濾邏輯正確

---

## 7. 頁面分組（元件級關聯）

- [ ] 7.1 後端 API：`GET /api/pages`、`POST /api/pages`、`PATCH /api/pages/:id`、`DELETE /api/pages/:id`（Admin only CRUD）
- [ ] 7.2 後端 API：`PUT /api/pages/:id/services`：批次更新某頁面的服務指派（含 order）
- [ ] 7.3 後端 API：`PATCH /api/services/:id/assignments`：更新單一服務的頁面關聯
- [ ] 7.4 **[整合測試]** API 測試：建立頁面、指派服務、調整 order、刪除頁面後服務移至未分類
- [ ] 7.5 前端：設定頁「頁面管理」Tab — 新增/刪除/重命名頁面
- [ ] 7.6 前端：實作服務與頁面的拖拉指派 UI（使用 @dnd-kit）
- [ ] 7.7 **[E2E 測試 - Playwright]** 建立頁面 → 拖拉服務到頁面 → 調整順序 → 刪除頁面確認服務回到未分類

## 8. Admin 設定頁：系統設定 + 使用者管理

- [ ] 8.1 前端：Admin 設定頁 — Gemini API Key 設定區塊（masked input、已設定/未設定狀態）
- [ ] 8.2 後端 API：`GET /api/admin/users`（Admin only）：所有使用者列表
- [ ] 8.3 後端 API：`GET /api/admin/users/:id/overrides`、`PUT /api/admin/users/:id/overrides`（Admin only）
- [ ] 8.4 後端 API：`PUT /api/admin/services/:id/global-override`（Admin only）：全域強制隱藏
- [ ] 8.5 前端：Admin 設定頁 — 使用者管理（列表、針對使用者設定服務強制隱藏）
- [ ] 8.6 前端：Admin 設定頁 — 服務管理（編輯描述、全域隱藏開關、重新生成 AI 描述）
- [ ] 8.7 **[E2E 測試 - Playwright]** Admin 設定 Gemini Key → 設定後 isSet=true → 服務觸發描述生成 → Admin 強制全域隱藏某服務 → 切換一般使用者確認看不到 → Admin 針對特定使用者隱藏服務

### ⏸️ CHECKPOINT C — 大階段：頁面分組 + Admin 設定頁
> 請確認以下項目後回覆「OK」，才進行 commit + push：
> - 頁面分組建立與服務拖拉指派
> - Gemini API Key 設定 UI（masked input、不洩漏 key）
> - Admin 強制隱藏服務後一般使用者看不到
> - 針對特定使用者的服務隱藏

---

## 9. Landing Page 前端

- [ ] 9.1 實作服務卡片元件（ServiceCard）：名稱、描述、port、狀態 badge、開啟按鈕
- [ ] 9.2 實作分組 Tabs（PageTabs）：依 `pages` API 資料動態渲染
- [ ] 9.3 實作未分類群組區塊
- [ ] 9.4 實作服務搜尋/過濾功能（前端 filter）
- [ ] 9.5 實作 loading skeleton 與 error state
- [ ] 9.6 **[E2E 測試 - Playwright]** Landing Page 顯示分組 Tabs → 搜尋服務 → 點擊開啟服務（新 Tab）→ 確認 offline 服務顯示正確 badge

## 10. 個人設定頁前端

- [ ] 10.1 實作個人服務可見性設定頁（顯示未被強制隱藏的服務列表，附 toggle）
- [ ] 10.2 確認被強制隱藏的服務不出現在個人設定頁
- [ ] 10.3 **[E2E 測試 - Playwright]** 一般使用者隱藏服務 → Landing Page 消失 → 再次顯示 → Landing Page 重現

### ⏸️ CHECKPOINT D — 大階段：Landing Page + 個人設定
> 請確認以下項目後回覆「OK」，才進行 commit + push：
> - Landing Page 分組 Tabs 外觀與服務卡片
> - 搜尋功能
> - 個人可見性 toggle 即時反映
> - 強制隱藏的服務不出現在個人設定頁

---

## 11. CI/CD — GitHub Actions（參考 ebook-reader 模式）

- [ ] 11.1 建立 `packages/frontend/Dockerfile`（multi-stage：build → nginx）
- [ ] 11.2 建立 `packages/backend/Dockerfile`（multi-stage：install → production）
- [ ] 11.3 建立 `docker-compose.prod.yml`：生產環境（images 來自 Docker Hub，SQLite volume，Docker socket mount）
- [ ] 11.4 建立 `.github/workflows/docker-publish.yml`：push to main → build arm64 images → push Docker Hub
- [ ] 11.5 建立 `.github/workflows/deploy.yml`：docker-publish 完成 → Tailscale SSH → docker compose pull + up + health check
- [ ] 11.6 在後端加入 `GET /api/health` endpoint（供 deploy workflow health check 用）
- [ ] 11.7 說明需設定的 GitHub Secrets（`DOCKERHUB_TOKEN`、`TS_OAUTH_CLIENT_ID`、`TS_OAUTH_SECRET`、`DEPLOY_SERVER_IP`、`DEPLOY_USER`、`DEPLOY_PATH`、`DEPLOY_PORT`）於 `README.md`

## 12. 整合測試與最終確認

- [ ] 12.1 **[E2E 測試]** 完整 happy path：建立 Admin → 設定 Gemini Key → 掃描 Docker → AI 描述生成 → 建立頁面分組 → 新增一般使用者 → 個人可見性設定
- [ ] 12.2 **[E2E 測試]** Admin 強制隱藏流程：全域隱藏 + 針對特定使用者隱藏 + 確認個人設定頁不顯示
- [ ] 12.3 驗證 `settings` 表中的 Gemini API Key 不出現在任何 git 提交或 env 檔
- [ ] 12.4 完善 `docker-compose.yml`（開發用）：加入 healthcheck、restart policy
- [ ] 12.5 撰寫 `README.md`：部署步驟、GitHub Secrets 設定說明、初次設定 Gemini Key 教學

### ⏸️ CHECKPOINT E — 大階段：CI/CD + 最終上線
> 請確認以下項目後回覆「OK」，才進行 commit + push（觸發 GitHub Actions 部署）：
> - docker-compose.prod.yml 在本機測試正常
> - README 部署說明清楚
> - 所有 E2E 測試通過
> - 確認無敏感資訊（API Key、JWT Secret）在 git 中
