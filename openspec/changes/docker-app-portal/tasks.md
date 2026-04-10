<!-- 工作流程：每小階段完成 → 單元/整合測試 → E2E 測試 → 大階段完成 → ⏸️ 使用者手動測試確認 → commit + push -->

## 1. 專案初始化與基礎架構

- [x] 1.1 建立 monorepo 結構：`packages/backend`（Fastify）與 `packages/frontend`（React + Vite）
- [x] 1.2 設定根目錄 `package.json`（workspaces）、`.gitignore`、`.env.example`
- [x] 1.3 後端：安裝依賴（fastify、@fastify/jwt、@fastify/cookie、drizzle-orm、better-sqlite3、dockerode、@google/generative-ai）
- [x] 1.4 前端：安裝依賴（react、react-router-dom、@tanstack/react-query、axios）
- [x] 1.5 建立 `docker-compose.yml`（backend + frontend + SQLite volume + Docker socket mount）
- [x] 1.6 後端：設定 Fastify server 入口、CORS、靜態檔服務（serve frontend build）

## 2. 資料庫設計與 Migration

- [x] 2.1 使用 Drizzle ORM 定義 schema：`users`、`services`、`pages`、`service_page_assignments`、`user_service_prefs`、`admin_service_overrides`、`refresh_tokens`、`settings`
- [x] 2.2 實作 `drizzle-kit push` migration 腳本，server 啟動時自動執行
- [x] 2.3 撰寫 seed 測試資料腳本（開發用）
- [x] 2.4 **[測試]** 驗證 migration 腳本可從空 DB 正確建立所有表、欄位型別與 constraints

## 3. 使用者認證系統（Netflix-style）

- [x] 3.1 後端：實作 `GET /api/users`（公開）：回傳所有使用者列表（id、username、role、avatar_color）
- [x] 3.2 後端：實作 `POST /api/users`（公開）：建立一般使用者（無需密碼），若無任何使用者則建立 Admin（需密碼）
- [x] 3.3 後端：實作 `POST /api/auth/select/:userId`（公開）：一般使用者點擊後直接發 JWT
- [x] 3.4 後端：實作 `POST /api/auth/admin-login`（公開）：Admin 密碼驗證，成功後發 JWT
- [x] 3.5 後端：實作 `POST /api/auth/refresh`：以 refreshToken cookie 換新 accessToken
- [x] 3.6 後端：實作 `POST /api/auth/logout`：刪除 DB 中的 refreshToken、清除 cookie
- [x] 3.7 後端：實作 JWT 驗證 Fastify plugin（preHandler hook），保護所有非 public 路由
- [x] 3.8 後端：實作 Admin-only 路由授權 plugin（role 檢查，回傳 HTTP 403）
- [x] 3.9 後端：實作 `PATCH /api/auth/admin-password`（Admin only）：修改 admin 密碼，舊 token 全部失效
- [x] 3.10 **[單元測試]** 測試 bcrypt 驗證邏輯、JWT 生成與驗證、refreshToken 流程（44 tests passed）
- [x] 3.11 **[整合測試]** API 測試：第一位建立 Admin、後續建立一般使用者、admin-login 密碼錯誤/正確、select/:userId、refresh、logout
- [x] 3.12 前端：實作「選擇使用者」畫面（`/select`）— 顯示所有使用者頭像卡片 + 新增按鈕
- [x] 3.13 前端：實作「新增使用者」表單（inline 或 modal）— 僅需輸入 username
- [x] 3.14 前端：實作 Admin 密碼 modal — 點擊 Admin 頭像後彈出，錯誤顯示提示
- [x] 3.15 前端：實作 auth store（accessToken in memory）+ axios interceptor（401 自動 refresh）
- [x] 3.16 前端：實作 ProtectedRoute — 未登入導向 `/select`，已登入才能進 Landing Page
- [ ] 3.17 **[E2E 測試 - Playwright]** 首次進入建立 Admin → 選擇畫面出現 Admin 頭像 → 點擊 Admin 輸入密碼進入 → 新增一般使用者 → 點擊直接進入 → 切換使用者 → 登出回到選擇畫面

### ⏸️ CHECKPOINT A — 大階段：認證系統 ✅ 已部署驗證

---

## 4. Docker 服務發現

- [x] 4.1 後端：實作 DockerService class，使用 dockerode 連接 `/var/run/docker.sock`
- [x] 4.2 實作 scanContainers()：列出運行中容器，提取 name/image/ports/labels
- [x] 4.3 實作服務掃描排程（setInterval 30s），啟動時立即執行一次
- [x] 4.4 新容器 → upsert `services` 表；消失容器 → 更新 status 為 offline
- [ ] 4.5 **[單元測試]** mock dockerode，測試 scanContainers() 資料解析邏輯、upsert 邏輯、offline 標記

## 5. Gemini AI 描述生成

- [x] 5.1 後端：`settings` 表初始化邏輯，確保 server 啟動時表存在
- [x] 5.2 後端 API：`GET /api/admin/settings/gemini-key`（Admin only）：回傳 `{ isSet: boolean }`
- [x] 5.3 後端 API：`PUT /api/admin/settings/gemini-key`（Admin only）：儲存/更新 key 至 DB
- [x] 5.4 後端：實作 GeminiService class，從 DB `settings` 表讀取 API Key（非 env）；未設定時 skip 並回傳提示
- [x] 5.5 實作 generateDescription(service)：組裝 prompt（name/image/ports/labels），呼叫 Gemini 2.5 Flash，存入 `ai_description`
- [x] 5.6 掃描後對 `ai_description` 為空的服務觸發非同步描述生成（逐一處理，避免 rate limit）
- [x] 5.7 後端 API：`POST /api/services/:id/regenerate-description`（Admin only）：清空並重新生成
- [x] 5.8 後端 API：`PATCH /api/services/:id`（Admin only）：更新 `custom_description`
- [ ] 5.9 **[單元測試]** mock Gemini client，測試 generateDescription prompt 組裝、未設定 key 的 skip 邏輯、custom_description 優先級

## 6. 服務 API

- [x] 6.1 實作 `GET /api/services`：依使用者角色套用可見性過濾後回傳服務列表（含頁面分組資訊）
- [x] 6.2 實作 `GET /api/services/all`（Admin only）：回傳所有服務含可見性狀態
- [x] 6.3 實作 `PATCH /api/services/:id/prefs`：更新個人 `user_service_prefs`（隱藏/顯示）
- [x] 6.4 **[整合測試]** API 測試：可見性過濾邏輯（admin 強制隱藏 > 個人隱藏 > 預設可見）、admin 看到全部、一般使用者過濾正確（45 tests passed）

### ⏸️ CHECKPOINT B — 大階段：服務發現 + AI 描述 + API ✅ 程式碼完成，待部署驗證

---

## 7. 頁面分組（元件級關聯）

- [x] 7.1 後端 API：`GET /api/pages`、`POST /api/pages`、`PATCH /api/pages/:id`、`DELETE /api/pages/:id`（Admin only CRUD）
- [x] 7.2 後端 API：`PUT /api/pages/:id/services`：批次更新某頁面的服務指派（含 order）
- [x] 7.3 後端 API：`PATCH /api/services/:id/assignments`：更新單一服務的頁面關聯
- [x] 7.4 **[整合測試]** API 測試：建立頁面、指派服務、調整 order、刪除頁面後服務移至未分類
- [x] 7.5 前端：設定頁「頁面管理」Tab — 新增/刪除/重命名頁面（checkbox 指派方式）
- [x] 7.6 前端：實作服務與頁面的指派 UI（使用 checkbox 多選方式）
- [ ] 7.7 **[E2E 測試 - Playwright]** 建立頁面 → 指派服務 → 調整順序 → 刪除頁面確認服務回到未分類

## 8. Admin 設定頁：系統設定 + 使用者管理

- [x] 8.1 前端：Admin 設定頁 — Gemini API Key 設定區塊（masked input、已設定/未設定狀態）
- [x] 8.2 後端 API：`GET /api/admin/users`（Admin only）：所有使用者列表
- [x] 8.3 後端 API：`GET /api/admin/users/:id/overrides`、`PUT /api/admin/users/:id/overrides`（Admin only）
- [x] 8.4 後端 API：`PUT /api/admin/services/:id/global-override`（Admin only）：全域強制隱藏
- [x] 8.5 前端：Admin 設定頁 — 使用者管理（列表、針對使用者設定服務強制隱藏）
- [x] 8.6 前端：Admin 設定頁 — 服務管理（編輯描述、全域隱藏開關、重新生成 AI 描述）
- [ ] 8.7 **[E2E 測試 - Playwright]** Admin 設定 Gemini Key → 設定後 isSet=true → 服務觸發描述生成 → Admin 強制全域隱藏某服務 → 切換一般使用者確認看不到 → Admin 針對特定使用者隱藏服務

### ⏸️ CHECKPOINT C — 大階段：頁面分組 + Admin 設定頁 ✅ 程式碼完成，待部署驗證

---

## 9. Landing Page 前端

- [x] 9.1 實作服務卡片元件（ServiceCard）：名稱、描述、port、狀態 badge、開啟按鈕
- [x] 9.2 實作分組 Tabs（PageTabs）：依 `pages` API 資料動態渲染
- [x] 9.3 實作未分類群組區塊
- [x] 9.4 實作服務搜尋/過濾功能（前端 filter）
- [x] 9.5 實作 loading skeleton 與 error state
- [ ] 9.6 **[E2E 測試 - Playwright]** Landing Page 顯示分組 Tabs → 搜尋服務 → 點擊開啟服務（新 Tab）→ 確認 offline 服務顯示正確 badge

## 10. 個人設定頁前端

- [x] 10.1 實作個人服務可見性設定頁（顯示未被強制隱藏的服務列表，附 toggle）
- [x] 10.2 確認被強制隱藏的服務不出現在個人設定頁
- [ ] 10.3 **[E2E 測試 - Playwright]** 一般使用者隱藏服務 → Landing Page 消失 → 再次顯示 → Landing Page 重現

## 10.5 Bug修復與功能增強 (2026-03-24)

- [x] 10.5.1 修復：個人設定頁隱藏服務後從列表消失無法恢復 — 新增 `GET /api/services/settings` API，回傳所有非 admin 強制隱藏的服務（含 `is_hidden` 旗標），前端 SettingsPage 改用此 API
- [x] 10.5.2 功能：首頁過濾掉沒有綁定 port 的服務 — `GET /api/services` 增加 ports 為空陣列時排除
- [x] 10.5.3 功能：開放一般使用者建立/管理自訂頁面 — 後端 pages POST/PATCH/DELETE/PUT 改為 owner-or-admin 權限檢查，前端個人設定頁新增「我的頁面」區塊（建立/重命名/刪除/指派服務）
- [x] 10.5.4 功能：多 port 服務讓使用者選擇偏好 port — `user_service_prefs` 新增 `preferred_port` 欄位（含 migration），`PATCH /api/services/:id/prefs` 支援 `preferred_port` 參數，ServiceCard 優先使用 `preferred_port`，設定頁多 port 服務顯示下拉選擇器

### ⏸️ CHECKPOINT D — 大階段：Landing Page + 個人設定 + Bug修復與功能增強 ✅ 已部署驗證

---

## 10.6 功能增強 v2 (2026-03-24)

### Gemini API Key Pool
- [x] 10.6.1 後端：新增 `api_key_usage` 表 migration — 追蹤每個 key 的 token 用量（suffix、model、call_type、tokens、created_at）
- [x] 10.6.2 後端：新增 `geminiKeys.ts` service — loadKeys()（60s 快取）、getNextKey()（round-robin）、getKeyExcluding()（429 failover）、trackUsage()、getUsageStats()、getKeyStats()、addKeysFromText()、removeKeyBySuffix()
- [x] 10.6.3 後端：改寫 `gemini.ts` — 使用 geminiKeys + withRetry 機制（429 → 3s delay → 切換 key → 最多重試 2 次）
- [x] 10.6.4 後端：新增 API — `GET /api/admin/settings/api-keys`、`POST /api/admin/settings/api-keys`（批次 parse AIza 開頭）、`DELETE /api/admin/settings/api-keys/:suffix`、`GET /api/admin/settings/token-usage`
- [x] 10.6.5 前端：Admin 設定頁重寫 SystemTab — textarea 批次貼上 key + key 列表（suffix + today 用量 + 刪除）+ token 用量統計儀表板（today/week/month）
- [x] 10.6.6 後端：向下相容舊 `gemini_api_key` setting，loadKeys() 合併 `gemini_api_keys` + `gemini_api_key` 去重

### 自訂服務名稱（display_name）
- [x] 10.6.7 後端：`services` 表新增 `display_name` 欄位（ALTER TABLE migration）
- [x] 10.6.8 後端：`GET /api/services` 回傳 `display_name`、`ai_description`、`custom_description`
- [x] 10.6.9 後端：`PATCH /api/services/:id` 支援更新 `display_name`
- [x] 10.6.10 前端：ServiceCard 主標題改為 `display_name || name`，有 display_name 時 container name 為副標題
- [x] 10.6.11 前端：Admin 服務管理頁每個服務加 display_name 編輯欄位

### Landing Page 拖拉排版（編輯模式）
- [x] 10.6.12 前端：安裝 @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities
- [x] 10.6.13 後端：新增 `PATCH /api/pages/:pageId/order` — 按 serviceIds 陣列順序更新 order
- [x] 10.6.14 前端：HomePage 新增 isEditing state + 編輯模式按鈕（鉛筆 ↔ 勾勾）
- [x] 10.6.15 前端：編輯模式下 @dnd-kit SortableServiceCard + 拖拉手把 + 虛線邊框
- [x] 10.6.16 前端：拖拉放開後 debounce 300ms 呼叫 API 儲存順序

### Bug 修復
- [x] 10.6.17 後端：offline 服務不顯示在首頁 — `GET /api/services` 過濾 `status === 'offline'`
- [x] 10.6.18 後端：無對外 port 的服務不顯示 — 改為 `ports.some(p => p.public > 0)` 過濾
- [x] 10.6.19 後端：offline 超過 24h 的服務自動從 DB 清除（含關聯 assignments、prefs、overrides）
- [x] 10.6.20 前端：ServiceCard 描述 fallback chain 修正 — `custom_description || ai_description || description`
- [x] 10.6.21 前端：nginx no-cache header for index.html — 防止瀏覽器快取舊版

### ⏸️ CHECKPOINT D2 — 功能增強 v2 ✅ 已完成，已部署

---

## 10.7 功能增強 v3 (2026-04-03)

### 管理設定搜尋 + 服務隱藏
- [x] 10.7.1 前端：管理設定四個 Tab（Domain/服務/使用者/系統）各加搜尋框
- [x] 10.7.2 後端：`admin_service_overrides` 加入 drizzle schema + `POST /api/services/:id/visibility`（admin 全域隱藏切換）
- [x] 10.7.3 後端：`GET /api/services` 過濾 admin 全域隱藏的服務
- [x] 10.7.4 後端：`GET /api/services/all` 回傳 `is_hidden` 旗標
- [x] 10.7.5 前端：ServicesTab 每個服務加隱藏/顯示按鈕，隱藏服務排序到最下方 + 「已隱藏」標籤 + 降低透明度

### 首頁 Tab 切換 + Offline 服務顯示
- [x] 10.7.6 前端：首頁三個 section（置頂/服務/書籤）改為 Tab 切換，每個 Tab 顯示計數 badge
- [x] 10.7.7 後端：`GET /api/services` 不再過濾 offline 服務（改由前端灰色顯示）
- [x] 10.7.8 前端：ServiceCard offline 服務降低透明度 + 紅色 status dot + 「offline」文字

### 批次隱藏操作
- [x] 10.7.9 前端：ServicesTab 加 checkbox 勾選 + 全選/取消全選按鈕
- [x] 10.7.10 前端：選取後顯示批次操作 toolbar（批次隱藏/批次顯示/取消選取）

### 個人設定隱藏服務
- [x] 10.7.11 後端：`user_service_prefs` 加入 drizzle schema + `POST /api/services/:id/prefs`（使用者個人隱藏）
- [x] 10.7.12 後端：`GET /api/services` 同時過濾 admin 隱藏 + 使用者個人隱藏
- [x] 10.7.13 前端：個人設定頁新增「隱藏服務」區塊，可搜尋並隱藏不常用的服務

### Domain 管理對應服務
- [x] 10.7.14 後端：`GET /api/domains` 回傳 `service_name`（查詢 services 表 port 對應的容器名）
- [x] 10.7.15 前端：Domain 列表每個綁定顯示對應的服務名稱 badge

### 技術債清理
- [x] 10.7.16 後端：visibility endpoint 用 drizzle `isNull()` 取代 raw SQL template
- [x] 10.7.17 前端：AdminPage 拆分為 4 個獨立 component（DomainsTab/ServicesTab/UsersTab/SystemTab）
- [x] 10.7.18 後端：修正 docker.ts `zombieIds` → `zombies` 變數名 typo

### ⏸️ CHECKPOINT D3 — 功能增強 v3 ✅ 已完成，已部署

---

## 10.8 Session Restore Bug Fix (2026-04-10)

- [x] 10.8.1 前端：App 啟動時先檢查 refresh session，避免頁面重整時因 accessToken 僅存在 memory 而被導回 `/select`
- [x] 10.8.2 前端：auth store 支援由 refresh 回傳的 JWT 還原 `currentUser`
- [x] 10.8.3 **[驗證]** `npm --workspace packages/frontend run build`

---

## 11. CI/CD — GitHub Actions（參考 ebook-reader 模式）

- [x] 11.1 建立 `packages/frontend/Dockerfile`（multi-stage：build → nginx）
- [x] 11.2 建立 `packages/backend/Dockerfile`（multi-stage：install → production）
- [x] 11.3 建立 `docker-compose.prod.yml`：生產環境（images 來自 Docker Hub，SQLite volume，Docker socket mount）
- [x] 11.4 建立 `.github/workflows/docker-publish.yml`：push to main → build arm64 images → push Docker Hub
- [x] 11.5 建立 `.github/workflows/deploy.yml`：docker-publish 完成 → Tailscale SSH → docker compose pull + up + health check
- [x] 11.6 在後端加入 `GET /api/health` endpoint（供 deploy workflow health check 用）
- [ ] 11.7 說明需設定的 GitHub Secrets 於 `README.md`

## 12. 整合測試與最終確認

- [ ] 12.1 **[E2E 測試]** 完整 happy path：建立 Admin → 設定 Gemini Key → 掃描 Docker → AI 描述生成 → 建立頁面分組 → 新增一般使用者 → 個人可見性設定
- [ ] 12.2 **[E2E 測試]** Admin 強制隱藏流程：全域隱藏 + 針對特定使用者隱藏 + 確認個人設定頁不顯示
- [ ] 12.3 驗證 `settings` 表中的 Gemini API Key 不出現在任何 git 提交或 env 檔
- [ ] 12.4 完善 `docker-compose.yml`（開發用）：加入 healthcheck、restart policy
- [ ] 12.5 撰寫 `README.md`：部署步驟、GitHub Secrets 設定說明、初次設定 Gemini Key 教學

### ⏸️ CHECKPOINT E — 大階段：CI/CD + 最終上線
