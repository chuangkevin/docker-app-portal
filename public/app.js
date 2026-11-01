// 服務入口前端：Alpine.js。釘選存在各瀏覽器的 localStorage；隱藏存在伺服器（大家共用）。
const PIN_KEY = 'portal.pinned.v2';

const readPins = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(PIN_KEY) || '[]'));
  } catch {
    return new Set();
  }
};
const writePins = (set) => {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify([...set]));
  } catch {
    /* 私密視窗等情況寫不進去，釘選只在這次有效 */
  }
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase();

// 名字 → 穩定的色相，讓沒有圖示的服務也有辨識度
const hue = (s) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
};

document.addEventListener('alpine:init', () => {
  Alpine.data('portal', () => ({
    data: { machines: [] },
    loaded: false,
    ready: false,
    q: '',
    filter: 'all',
    showHidden: false,
    searchFocused: false,
    pins: readPins(),
    toast: '',
    now: Date.now(),

    async init() {
      await this.load();
      requestAnimationFrame(() => (this.ready = true));
      setInterval(() => this.load(), 30_000);
      setInterval(() => (this.now = Date.now()), 15_000);
      document.addEventListener('click', (e) => this.onClick(e));
      document.addEventListener('pointermove', (e) => {
        const t = e.target.closest?.('.tile');
        if (!t) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty('--mx', `${e.clientX - r.left}px`);
        t.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    },

    async load() {
      try {
        const res = await fetch('/api/overview', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.data = await res.json();
        this.loaded = true;
      } catch (e) {
        this.say(`讀取失敗：${e.message}，30 秒後再試`);
      }
    },

    // ---------- 篩選 ----------
    get all() {
      return this.data.machines.flatMap((m) => m.services.map((s) => ({ ...s, machine: m.name })));
    },
    terms() {
      return norm(this.q).split(/\s+/).filter(Boolean);
    },
    matches(s) {
      const t = this.terms();
      if (!t.length) return true;
      const hay = norm([s.name, s.title, s.machine, s.ip, `:${s.port}`, String(s.port), s.container, ...s.domains].join(' '));
      return t.every((w) => hay.includes(w));
    },
    passes(s) {
      if (s.hidden && !this.showHidden) return false;
      if (this.filter === 'online' && !s.online) return false;
      if (this.filter === 'offline' && s.online) return false;
      if (this.filter === 'domain' && !s.domains.length) return false;
      return this.matches(s);
    },
    get groups() {
      const searching = this.terms().length > 0 || this.filter !== 'all';
      return this.data.machines
        .map((m) => ({
          ...m,
          list: m.services.map((s) => ({ ...s, machine: m.name })).filter((s) => this.passes(s)),
        }))
        .filter((g) => (searching ? g.list.length : g.registered || g.list.length));
    },
    get pinnedList() {
      return this.all.filter((s) => this.pins.has(s.key) && this.passes(s));
    },
    get stats() {
      const all = this.all;
      const visible = all.filter((s) => !s.hidden);
      return {
        machines: this.data.machines.filter((m) => m.registered).length,
        services: visible.length,
        online: visible.filter((s) => s.online).length,
        offline: visible.filter((s) => !s.online).length,
        hidden: all.length - visible.length,
      };
    },
    machineState(g) {
      return { up: '在線', down: '離線', paused: '暫停', pending: '等待中' }[g.status] ?? '未註冊';
    },

    // ---------- 動作 ----------
    openFirst() {
      const first = this.pinnedList[0] ?? this.groups.find((g) => g.list.length)?.list[0];
      if (first) location.href = first.url;
    },
    onKey(e) {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
      if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        this.$refs.search.focus();
        this.$refs.search.select();
      }
    },
    async onClick(e) {
      const btn = e.target.closest?.('[data-act]');
      if (!btn) return;
      e.preventDefault();
      const key = btn.dataset.key;
      const s = this.all.find((x) => x.key === key);
      if (!s) return;
      if (btn.dataset.act === 'pin') {
        const next = new Set(this.pins);
        next.has(key) ? next.delete(key) : next.add(key);
        this.pins = next;
        writePins(next);
        this.say(next.has(key) ? `已釘選「${s.name}」` : `已取消釘選「${s.name}」`);
      } else if (btn.dataset.act === 'hide') {
        const hidden = !s.hidden;
        const res = await fetch('/api/hidden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, hidden }),
        });
        if (!res.ok) return this.say('隱藏失敗，請再試一次');
        await this.load();
        this.say(hidden ? `已隱藏「${s.name}」，所有人都看不到` : `「${s.name}」恢復顯示`);
      }
    },
    jump(id) {
      const el = document.getElementById(`m-${id}`);
      if (!el) return;
      const top = el.getBoundingClientRect().top + scrollY - 96;
      scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
    say(msg) {
      this.toast = msg;
      clearTimeout(this._t);
      this._t = setTimeout(() => (this.toast = ''), 2600);
    },

    // ---------- 呈現 ----------
    ago(ts) {
      if (!ts) return '';
      const s = Math.max(0, Math.round((this.now - ts) / 1000));
      if (s < 45) return '剛剛';
      if (s < 3600) return `${Math.round(s / 60)} 分鐘前`;
      if (s < 86400) return `${Math.round(s / 3600)} 小時前`;
      return `${Math.round(s / 86400)} 天前`;
    },
    mark(text) {
      let out = esc(text);
      for (const t of this.terms()) {
        const i = norm(text).indexOf(t);
        if (i >= 0 && norm(text).length === String(text).length) {
          const raw = String(text);
          out = `${esc(raw.slice(0, i))}<mark>${esc(raw.slice(i, i + t.length))}</mark>${esc(raw.slice(i + t.length))}`;
          break;
        }
      }
      return out;
    },
    tile(s, i) {
      const pinned = this.pins.has(s.key);
      const shown = s.domains[0] ?? `${s.ip}:${s.port}`;
      const sub = s.title && s.title !== s.name ? s.title : s.container && s.container !== s.name ? s.container : '';
      const icon = s.domains[0]
        ? `<img src="https://${esc(s.domains[0])}/favicon.ico" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
        : '';
      return `
        <div class="tile ${s.online ? 'on' : 'off'} ${s.hidden ? 'is-hidden' : ''}" style="--i:${Math.min(i, 24)};--h:${hue(s.name)}">
          <a class="hit" href="${esc(s.url)}" rel="noreferrer" aria-label="開啟 ${esc(s.name)}"></a>
          <div class="ico" aria-hidden="true"><span>${esc(([...s.name.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '?').toUpperCase())}</span>${icon}</div>
          <div class="body">
            <p class="name">${this.mark(s.name)}</p>
            ${sub ? `<p class="desc">${this.mark(sub)}</p>` : ''}
            <p class="addr mono"><span class="dot" title="${s.online ? '在線' : '連不到'}"></span>${this.mark(shown)}</p>
          </div>
          <div class="acts">
            <button type="button" data-act="pin" data-key="${esc(s.key)}" aria-pressed="${pinned}" title="${pinned ? '取消釘選' : '釘選到最上面（只存在這個瀏覽器）'}" aria-label="${pinned ? '取消釘選' : '釘選'} ${esc(s.name)}">
              <svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>
            </button>
            <button type="button" data-act="hide" data-key="${esc(s.key)}" aria-pressed="${s.hidden}" title="${s.hidden ? '恢復顯示' : '隱藏（所有人）'}" aria-label="${s.hidden ? '恢復顯示' : '隱藏'} ${esc(s.name)}">
              <svg viewBox="0 0 24 24">${s.hidden
                ? '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'
                : '<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.3 6.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'}</svg>
            </button>
          </div>
        </div>`;
    },
  }));
});
