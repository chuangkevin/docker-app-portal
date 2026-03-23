## Why

管理多個 Docker 服務時，需要一個統一的入口 Landing Page，讓使用者可以快速發現、了解並開啟各服務，同時提供細粒度的可見性控制（服務層級、頁面分組層級、元件層級），以及基於角色的存取管理。

## What Changes

- 新建 Docker App Portal 全端應用，從零開始
- 整合 Docker Engine API 自動掃描容器服務
- 整合 Google Gemini 2.5 Flash，自動生成各服務的人類可讀介紹
- 實作 Netflix-style 使用者選擇畫面：第一位建立者自動成為 admin（需密碼），後續任何人可自助新增一般使用者（無密碼）；點擊 admin 頭像需輸入密碼
- 實作服務可見性管理：支援個人隱藏、admin 強制隱藏
- **元件級頁面關聯設定**：每個服務可被分配到特定頁面/分組，管理者可在元件層級設定服務與頁面的關聯
- Admin 使用者管理：可新增一般使用者、控制各使用者的服務可見性

## Capabilities

### New Capabilities

- `service-discovery`: 透過 Docker API 掃描運行中的容器，提取 name/image/port/labels 等資訊，並呼叫 Gemini 2.5 Flash 生成服務介紹，快取結果至資料庫
- `service-visibility`: 服務可見性管理 — 個人隱藏偏好、admin 強制隱藏（覆蓋個人設定）、以及**元件級頁面關聯**（服務可被指派到特定頁面分組，管理者可在設定頁的元件層級設定關聯）
- `user-auth`: 使用者認證與授權 — JWT-based 登入/登出、第一位使用者自動升 admin、admin 可新增一般使用者帳號
- `user-permissions`: Admin 對各使用者的服務可見性權限管理 — admin 可強制關閉特定服務對特定使用者的可見性（使用者無法自行解除）

### Modified Capabilities

<!-- 無既有 spec，此為全新專案 -->

## Impact

- **新專案**：`D:\Projects\docker-app-portal`，從零建置
- **外部依賴**：
  - Docker Engine API（本機或遠端 socket）
  - Google Gemini 2.5 Flash API（需 API Key）
- **技術棧**：
  - 後端：Node.js + Fastify（輕量、效能佳）
  - 前端：React + Vite（或 Next.js，視 SSR 需求）
  - 資料庫：SQLite（單機部署友善）
  - 認證：JWT + bcrypt
- **安全考量**：Docker socket 存取需限制在後端服務內，Gemini API Key 不得暴露至前端
