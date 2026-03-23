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
