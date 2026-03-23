## ADDED Requirements

### Requirement: 個人服務可見性偏好
使用者 SHALL 能夠設定特定服務對自己隱藏，隱藏後該服務不出現在自己的 Landing Page。

#### Scenario: 使用者隱藏服務
- **WHEN** 使用者在設定頁將某服務切換為「隱藏」
- **THEN** 系統在 `user_service_prefs` 建立/更新記錄 `is_hidden=true`，該服務從使用者的 Landing Page 移除

#### Scenario: 使用者恢復顯示
- **WHEN** 使用者將個人隱藏的服務切換為「顯示」，且 admin 未強制隱藏該服務
- **THEN** 服務重新出現在使用者的 Landing Page

#### Scenario: 新服務預設可見
- **WHEN** 系統發現一個新容器
- **THEN** 對所有使用者預設可見，除非 admin 設定強制隱藏

---

### Requirement: Admin 強制隱藏服務
Admin SHALL 能夠強制隱藏特定服務，使一般使用者無法看到該服務，且無法自行解除。

#### Scenario: Admin 強制隱藏（針對全部使用者）
- **WHEN** Admin 在服務設定頁設定「全域強制隱藏」
- **THEN** 在 `admin_service_overrides` 新增記錄（`target_user_id=NULL, is_force_hidden=true`），所有一般使用者均無法看到該服務

#### Scenario: Admin 強制隱藏（針對特定使用者）
- **WHEN** Admin 在使用者管理頁，對某使用者設定特定服務不可見
- **THEN** 在 `admin_service_overrides` 新增記錄（`target_user_id=<user_id>, is_force_hidden=true`），僅該使用者無法看到

#### Scenario: 一般使用者無法解除強制隱藏
- **WHEN** 某服務被 admin 強制隱藏（全域或針對該使用者）
- **THEN** 使用者的個人設定頁 SHALL NOT 顯示該服務的可見性切換按鈕，API 亦 SHALL 忽略該使用者的個人顯示請求

#### Scenario: Admin 解除強制隱藏
- **WHEN** Admin 移除強制隱藏設定
- **THEN** 服務恢復為使用者個人設定（若個人已隱藏則仍隱藏；未設定則可見）

---

### Requirement: 頁面分組（元件級頁面關聯）
系統 SHALL 支援「頁面/分組」概念，管理者可建立多個頁面（如「開發工具」、「監控」），並將服務指派到特定頁面，Landing Page 依分組顯示服務卡片。

#### Scenario: 建立頁面分組
- **WHEN** Admin 在設定頁新增一個分組，輸入名稱
- **THEN** 系統在 `pages` 表建立記錄，並指派一個唯一 slug

#### Scenario: 服務指派至頁面
- **WHEN** Admin 將某服務拖拉或選擇指派到某頁面
- **THEN** 系統在 `service_page_assignments` 建立關聯，同一服務可出現在多個頁面

#### Scenario: Landing Page 依分組顯示
- **WHEN** 使用者進入 Landing Page
- **THEN** 服務卡片依所屬頁面分組顯示（Tabs 或分組標題），未分配到任何頁面的服務顯示在「未分類」群組

#### Scenario: 服務排序
- **WHEN** Admin 在設定頁調整同一頁面內的服務順序
- **THEN** 系統更新 `service_page_assignments.order`，前端依 order 顯示

#### Scenario: 刪除頁面分組
- **WHEN** Admin 刪除一個頁面
- **THEN** 相關的 `service_page_assignments` 記錄刪除，服務本身不受影響，移至「未分類」
