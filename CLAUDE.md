# CLAUDE.md — docker-app-portal v2

先讀 `README.md`（資料來源、部署、字型）。這裡只放改 code 時要注意的事。

## 結構

```
src/sources.ts     Beszel 讀取、Caddy JSON 解析（不 regex 解析 Caddyfile）、port 掃描、HTTP 探測
src/discovery.ts   合併成「機器 → 服務」，背景迴圈（每 2 分鐘快速探測、每 3 小時完整掃描）
src/store.ts       SQLite：services（探測結果）、hidden（隱藏清單）、meta
src/server.ts      Fastify：/api/overview、/api/hidden、/api/health、靜態檔
public/            index.html＋app.js（Alpine.js）＋style.css＋fonts.css（產生的）＋fonts/（產生的）
scripts/build-fonts.py  從 macOS 產生字型切片
```

## 規則

- 服務的 key 是 `ip:port`；網域、容器名、標題都是附加在 key 上的資訊。
- 不內嵌 iframe，卡片就是連結。
- 沒有登入：服務只在 tailnet 內（Caddy `*.sisihome.org` 只對 tailnet）。
- 釘選只存瀏覽器（`localStorage` key `portal.pinned.v2`，讀寫都包 try/catch）；隱藏存伺服器。
- Caddy 管理 API 只經由 `portal.sisihome.org/__caddy/servers` 讀（GET），不准寫。
- 掃描會打到每台機器所有 port：不要調高 `SCAN_CONCURRENCY`（rpi2w 是 Pi Zero）。
- UI 文字繁體中文；字型只用內嵌的 SF Pro／SF Mono／蘋方 TC；手機、平板、桌機都要截圖確認。
- 版本在 `package.json`，頁面右上角與頁尾會顯示；改行為就升版。
