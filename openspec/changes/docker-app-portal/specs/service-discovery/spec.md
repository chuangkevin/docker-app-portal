## ADDED Requirements

### Requirement: Docker 容器掃描
系統 SHALL 透過 Docker Engine API（本機 socket `/var/run/docker.sock`）定期掃描所有運行中的容器，並將結果存入資料庫。

#### Scenario: 初次掃描
- **WHEN** 系統啟動
- **THEN** 立即執行一次容器掃描，將所有運行中容器存入 `services` 表

#### Scenario: 定期輪詢
- **WHEN** 距上次掃描已超過 30 秒
- **THEN** 重新掃描並更新 `services.last_seen_at`；新容器新增記錄，已消失容器保留記錄但標記為 offline

#### Scenario: 提取容器資訊
- **WHEN** 掃描到一個容器
- **THEN** 系統 SHALL 提取：container_id、name（去除前綴 `/`）、image、exposed ports（host_port:container_port）、docker labels

---

### Requirement: Caddyfile 即時同步
系統 SHALL 透過目錄級 bind mount 掛載 Caddy 設定目錄，確保 Caddyfile 變更即時反映在服務中。

#### Scenario: Caddyfile 被編輯器修改（inode 變化）
- **WHEN** 管理者使用 vim/nano 等編輯器修改 Caddyfile（產生新 inode）
- **THEN** 後端在下次 API 請求時讀取到最新的 Caddyfile 內容，無需重啟容器

#### Scenario: Caddyfile 包含嵌套大括號
- **WHEN** Caddyfile 的 reverse_proxy 指令包含子設定區塊（如 `{ flush_interval -1 }`）
- **THEN** 系統 SHALL 正確解析 port，使用 brace counting 而非 `[^}]*` regex

#### 技術決策：目錄 mount 取代檔案 mount
- **決策**：docker-compose volume 改為 `/home/kevin/DockerCompose/caddy:/app/caddyfile:ro`
- **理由**：Linux bind mount 單一檔案是綁定 inode，編輯器常用「寫暫存檔→rename」導致 inode 變更，容器內看到過時內容。掛載目錄不受此影響。

---

### Requirement: Gemini AI 服務描述生成
系統 SHALL 對每個新發現的容器呼叫 Google Gemini 2.5 Flash API，生成人類可讀的服務介紹，並快取至資料庫。

#### Scenario: 新容器首次生成描述
- **WHEN** 資料庫中新增一筆服務記錄，且 `ai_description` 為空
- **THEN** 系統非同步呼叫 Gemini，傳入 container name、image、ports、labels，取得描述後存入 `ai_description`

#### Scenario: 已有描述不重複呼叫
- **WHEN** `services.ai_description` 已有內容
- **THEN** 系統 SHALL NOT 重新呼叫 Gemini

#### Scenario: 管理者手動清除快取
- **WHEN** Admin 在設定頁點擊「重新生成描述」
- **THEN** 清空該服務的 `ai_description`，觸發重新生成

#### Scenario: Gemini 呼叫失敗
- **WHEN** Gemini API 回傳錯誤
- **THEN** 記錄錯誤 log，`ai_description` 保持空白，前端顯示 container name 作為備用

---

### Requirement: 服務描述覆寫
系統 SHALL 允許管理者為每個服務輸入自訂描述（`custom_description`），覆蓋 AI 生成的版本。

#### Scenario: 自訂描述優先顯示
- **WHEN** 服務的 `custom_description` 不為空
- **THEN** 前端顯示 `custom_description`，不顯示 `ai_description`

#### Scenario: 清除自訂描述
- **WHEN** Admin 清空 `custom_description`
- **THEN** 前端改為顯示 `ai_description`

---

### Requirement: 服務卡片展示
前端 Landing Page SHALL 以卡片形式展示每個可見服務。

#### Scenario: 卡片內容
- **WHEN** 使用者進入 Landing Page
- **THEN** 每張卡片顯示：服務名稱、描述（custom > ai > 空白）、Port、服務狀態（online/offline）、「開啟服務」按鈕

#### Scenario: 開啟服務
- **WHEN** 使用者點擊「開啟服務」
- **THEN** 在新 Tab 開啟 `http://<host>:<host_port>`

---

### Requirement: 首頁搜尋結果可見性
前端 Landing Page SHALL 在搜尋時直接顯示所有符合條件的服務與書籤結果，不得讓有效命中被目前 tab 隱藏。

#### Scenario: 搜尋命中未置頂服務
- **WHEN** 使用者在首頁搜尋框輸入關鍵字，且命中的服務不在目前顯示的 `置頂` tab
- **THEN** 畫面仍 SHALL 直接顯示該命中服務，而不是要求使用者手動切到 `所有服務`

#### Scenario: 搜尋比對自訂標題與描述
- **WHEN** 使用者輸入關鍵字
- **THEN** 系統 SHALL 至少比對 `name`、`display_name`、`description`、`custom_description`、`ai_description`、`domain` 與書籤名稱/描述/URL

#### Scenario: 搜尋同時命中服務與書籤
- **WHEN** 關鍵字同時命中服務與書籤
- **THEN** 首頁 SHALL 同時展示兩種結果，避免 tab 狀態誤導使用者以為資料不存在
