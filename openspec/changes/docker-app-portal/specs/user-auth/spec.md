## ADDED Requirements

### Requirement: Netflix-style 使用者選擇畫面
系統進入點 SHALL 顯示「選擇使用者」畫面，列出所有已建立的使用者頭像，以及「新增使用者」按鈕。

#### Scenario: 首次進入（無任何使用者）
- **WHEN** `users` 表為空，使用者訪問應用
- **THEN** 顯示「建立第一個帳號（管理員）」的表單，引導輸入 username + password

#### Scenario: 有使用者時的選擇畫面
- **WHEN** 系統中已有至少一個使用者
- **THEN** 顯示所有使用者的頭像卡片 + 名稱，以及「新增使用者」按鈕，不需要任何認證即可看到此畫面

#### Scenario: 點擊一般使用者
- **WHEN** 使用者點擊一個 `role=user` 的頭像卡片
- **THEN** 直接以該使用者身份登入（無需密碼），進入 Landing Page

#### Scenario: 點擊管理員頭像
- **WHEN** 使用者點擊 `role=admin` 的頭像卡片
- **THEN** 彈出密碼輸入 modal（Admin 驗證），輸入正確密碼後才進入 Landing Page（以 admin 身份）

#### Scenario: Admin 密碼錯誤
- **WHEN** 使用者在 admin 密碼 modal 輸入錯誤密碼
- **THEN** 顯示錯誤提示，不進入 Landing Page，允許重試

---

### Requirement: 自助新增使用者（Netflix 風格）
系統 SHALL 允許任何人從選擇畫面新增一般使用者，不需要 admin 授權。

#### Scenario: 新增使用者
- **WHEN** 使用者點擊「新增使用者」按鈕，輸入 username 後送出
- **THEN** 系統建立 `role=user` 的新帳號（無密碼），使用者頭像出現在選擇畫面，點擊後直接登入

#### Scenario: Admin 是唯一需要密碼的角色
- **WHEN** 建立新的一般使用者
- **THEN** 不需要設定密碼，`password_hash` 為空，點擊頭像即可直接進入

#### Scenario: Username 重複
- **WHEN** 使用者嘗試新增一個與現有使用者相同的 username
- **THEN** 系統回傳錯誤，提示 username 已存在

---

### Requirement: Admin 密碼驗證（進入 Admin 模式）
Admin 頭像 SHALL 受密碼保護，確保只有知道密碼的人才能以 admin 身份操作。

#### Scenario: Admin 密碼驗證成功
- **WHEN** 使用者在 admin modal 輸入正確密碼，點擊確認
- **THEN** 系統發放 JWT（accessToken + refreshToken），前端以 admin session 進入

#### Scenario: 在 Landing Page 內切換至 Admin 模式
- **WHEN** 已登入的一般使用者點擊「管理員設定」入口
- **THEN** 再次彈出 admin 密碼 modal，驗證通過後暫時升級為 admin session（或導向 admin 頁面）

#### Scenario: Admin 修改密碼
- **WHEN** 已登入的 admin 在設定頁修改密碼
- **THEN** 系統更新 `password_hash`，舊 refreshToken 全部失效

---

### Requirement: Session 管理
系統 SHALL 使用 JWT 管理 session，一般使用者與 admin 皆適用。

#### Scenario: 登入成功（含 admin 密碼驗證後）
- **WHEN** 使用者成功選擇 profile（或 admin 通過密碼驗證）
- **THEN** 後端發放 `accessToken`（15min，JSON body）+ `refreshToken`（7d，httpOnly Secure SameSite=Strict cookie）

#### Scenario: AccessToken 過期自動刷新
- **WHEN** 前端請求回傳 HTTP 401（accessToken 過期）
- **THEN** 前端自動用 refreshToken cookie 呼叫 `/api/auth/refresh`，取得新 accessToken 後重試

#### Scenario: 重新整理頁面後恢復登入狀態
- **WHEN** 已登入的使用者重新整理瀏覽器頁面，且 refreshToken cookie 仍有效
- **THEN** 前端在路由保護判斷前先呼叫 `/api/auth/refresh` 還原 accessToken 與目前使用者，不應被導回 `/select`

#### Scenario: 切換使用者
- **WHEN** 使用者點擊「切換使用者」
- **THEN** 前端清除 accessToken、呼叫 `/api/auth/logout` 讓 refreshToken 失效，返回使用者選擇畫面

---

### Requirement: 受保護路由
所有 API 端點（除了 `/api/auth/select`、`/api/auth/admin-login`、`/api/auth/refresh`、`/api/users/create`）SHALL 要求有效的 accessToken。

#### Scenario: 未認證請求
- **WHEN** 請求未帶有效 `Authorization: Bearer <token>` header
- **THEN** 系統回傳 HTTP 401

#### Scenario: 前端路由保護
- **WHEN** 未登入的使用者訪問 Landing Page 路由（非 `/select`）
- **THEN** 前端導向使用者選擇畫面 `/select`
