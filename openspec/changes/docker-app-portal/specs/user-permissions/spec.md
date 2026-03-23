## ADDED Requirements

### Requirement: Admin 使用者管理頁
Admin SHALL 能夠查看所有使用者，並為每位使用者設定服務可見性覆蓋。

#### Scenario: 查看使用者列表
- **WHEN** Admin 進入使用者管理頁
- **THEN** 顯示所有使用者（username、role、建立時間）

#### Scenario: 查看使用者的服務權限
- **WHEN** Admin 點擊某位使用者
- **THEN** 顯示所有服務的列表，並標示哪些服務被 admin 強制隱藏（全域或針對該使用者）

#### Scenario: 設定特定使用者的強制隱藏
- **WHEN** Admin 對某使用者切換特定服務為「強制隱藏」
- **THEN** 在 `admin_service_overrides` 建立 `target_user_id=<user_id>` 的記錄，該使用者的 API 查詢將過濾掉該服務

---

### Requirement: Admin 服務全域可見性設定
Admin SHALL 能夠設定服務的全域強制隱藏，影響所有一般使用者。

#### Scenario: 全域強制隱藏服務
- **WHEN** Admin 在服務設定頁啟用「全域隱藏」
- **THEN** 所有 `role=user` 的使用者均無法看到該服務（API 查詢過濾）

#### Scenario: Admin 本人不受強制隱藏影響
- **WHEN** Admin 設定某服務全域強制隱藏
- **THEN** Admin 自己的 Landing Page 仍能看到該服務（Admin 可見所有服務）

---

### Requirement: 權限層級的 API 強制執行
服務可見性 SHALL 在 API 層強制執行，不依賴前端過濾。

#### Scenario: GET /api/services 回傳符合權限的服務
- **WHEN** `role=user` 的使用者呼叫 `GET /api/services`
- **THEN** 後端依序套用過濾：(1) admin 全域強制隱藏 (2) admin 針對該使用者的強制隱藏 (3) 使用者個人隱藏偏好，只回傳可見服務

#### Scenario: Admin 呼叫 GET /api/services
- **WHEN** `role=admin` 的使用者呼叫 `GET /api/services`
- **THEN** 回傳所有服務（不套用任何過濾），並附帶每個服務的可見性狀態資訊

#### Scenario: 修改他人偏好的授權檢查
- **WHEN** 非 Admin 使用者嘗試呼叫其他使用者的偏好設定 API
- **THEN** 系統回傳 HTTP 403

---

### Requirement: 使用者個人設定頁
一般使用者 SHALL 能夠在個人設定頁管理自己的服務可見性偏好。

#### Scenario: 個人設定頁顯示服務列表
- **WHEN** 使用者進入個人設定頁
- **THEN** 顯示所有對該使用者可見（未被強制隱藏）的服務，每個服務有「顯示/隱藏」切換

#### Scenario: 強制隱藏的服務不顯示切換
- **WHEN** 某服務已被 admin 強制隱藏（全域或針對該使用者）
- **THEN** 個人設定頁 SHALL NOT 顯示該服務，使用者不知道該服務存在
