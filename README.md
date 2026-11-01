# docker-app-portal（Sisihome 服務入口）v2

`https://portal.sisihome.org`：自動列出 homelab 每台機器上的網頁服務。點了直接跳轉（不內嵌 iframe）。

## 服務怎麼自動出現

```
Beszel（monitor.sisihome.org）  ──→ 有註冊的機器（名字、IP、在不在線）＋各機器容器公開的 port
gn100 Caddy 管理 API（唯讀）     ──→ 網域 → 上游 ip:port
portal 自己探測                  ──→ 每 2 分鐘：已知服務、容器 port、Caddy 上游都打一次 HTTP
                                    每 3 小時：每台有註冊的機器 1–65535 全掃，回 HTTP 的就收進來
```

- 上游 `ip:port` 有對到 Caddy 網域 → 卡片連到 `https://網域`；沒有 → 連到 `http(s)://ip:port`。
- 新機器：在 Beszel 加上（裝 agent），portal 下一輪就會掃到。
- 新服務：容器一起來（Beszel 回報 port）或 Caddy 加了網域，2 分鐘內出現；其他服務最晚 3 小時（下一輪完整掃描）。
- 3 天都沒再看到的服務會自動拿掉。
- 沒註冊但 Caddy 有網域指過去的機器（例如 Mac、ESP32）也會列出，名字用 Tailscale MagicDNS 反查。

## 使用

- 搜尋：按 `/` 或 `⌘K`；空白分隔多個關鍵字（全部都要符合）；`Enter` 開第一個結果；`Esc` 清除。
- 釘選（星號）：存在這個瀏覽器的 localStorage，每台裝置、每個瀏覽器各自一份。
- 隱藏（眼睛）：存在伺服器，所有人都看不到；按「顯示已隱藏」可以找回來。

## 部署（nas-918）

```bash
# Mac：把程式送過去並重建
tar --exclude node_modules --exclude dist --exclude .git -czf - . | ssh nas918j 'cd /volume1/docker/portal && tar -xzf -'
ssh nas918j 'cd /volume1/docker/portal && sudo docker compose up -d --build'
```

- 容器 `portal`，`100.96.225.31:1123` → 3000，資料 `/volume1/docker/portal/data/portal.db`（探測結果、隱藏清單）。
- 唯讀掛載 Beszel 資料庫 `/volume1/docker/monitor/beszel_data`。
- Caddy 設定在 homelab-docs `infra/caddy/routes.caddyfile` 的 `@portal`：`/__caddy/servers` 只開 GET，轉給 gn100 Caddy 管理 API 的 `/config/apps/http/servers`。

環境變數見 `docker-compose.yml` 與 `src/server.ts`（`FULL_SCAN_HOURS=0` 關閉完整掃描，本機開發用）。

## 字型

SF Pro、SF Mono、蘋方 TC 都內嵌（`public/fonts/`，由 `scripts/build-fonts.py` 從 macOS 系統字體產生），任何作業系統都看到同一套字。
蘋方依 unicode-range 切成每個字重 98 片，瀏覽器只下載畫面上用到的切片；字型檔永久快取。
macOS 27 的蘋方外框是 Apple 專用格式（`hvgl`），腳本改用 CoreText 取出每個字的外框重組。

```bash
python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools brotli pyobjc-framework-CoreText
/tmp/ft/bin/python scripts/build-fonts.py
```

## 開發

```bash
npm install
npm run build
PORT=3999 DATABASE_PATH=/tmp/portal.db BESZEL_DB=<beszel data.db 副本> FULL_SCAN_HOURS=0 node dist/server.js
```

v1（React＋iframe 分頁＋帳號登入，單機 Docker）在 git 歷史 `c0f6b7a` 之前。
