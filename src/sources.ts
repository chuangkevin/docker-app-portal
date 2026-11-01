// 三個資料來源：Beszel（有註冊的機器＋容器）、gn100 Caddy（網域對應）、直接探測（port 掃描＋HTTP）。
import Database from 'better-sqlite3';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import dns from 'node:dns/promises';

export interface Machine {
  id: string;
  name: string;
  ip: string;
  status: string; // up / down / paused / pending
}

export interface Container {
  machineId: string;
  name: string;
  ports: number[];
  status: string;
}

export interface DomainRoute {
  domains: string[];
  ip: string;
  port: number;
}

// ---------- Beszel ----------

export function readBeszel(dbPath: string): { machines: Machine[]; containers: Container[] } {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const machines = db
      .prepare('select id, name, host as ip, status from systems order by name')
      .all() as Machine[];
    const rows = db.prepare('select system, name, ports, status from containers').all() as {
      system: string;
      name: string;
      ports: string;
      status: string;
    }[];
    const containers = rows.map((r) => ({
      machineId: r.system,
      name: r.name,
      status: r.status,
      ports: r.ports
        .split(',')
        .map((p) => Number(p.trim()))
        .filter((p) => Number.isInteger(p) && p > 0),
    }));
    return { machines, containers };
  } finally {
    db.close();
  }
}

// ---------- Caddy ----------

type Json = unknown;

function collectDials(node: Json, out: string[]): string[] {
  if (Array.isArray(node)) {
    for (const v of node) collectDials(v, out);
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, Json>;
    // 只限特定路徑的子路由（例如 portal 的 /__caddy/*）不是這個網域的主服務
    const match = o.match as { path?: string[] }[] | undefined;
    if (Array.isArray(match) && match.some((m) => m.path?.length)) return out;
    if (o.handler === 'reverse_proxy' && Array.isArray(o.upstreams)) {
      for (const u of o.upstreams as { dial?: string }[]) if (u.dial) out.push(u.dial);
    }
    for (const v of Object.values(o)) collectDials(v, out);
  }
  return out;
}

function hostsOf(route: Record<string, Json>): string[] {
  const match = (route.match ?? []) as { host?: string[] }[];
  return match.flatMap((m) => m.host ?? []);
}

/** 解析 Caddy 管理 API 的 /config/apps/http/servers JSON，回傳「網域 → 上游 ip:port」。 */
export function parseCaddyServers(
  servers: Record<string, { routes?: Record<string, Json>[] }>,
  domainSuffix: string,
): { domain: string; dial: string }[] {
  const out: { domain: string; dial: string }[] = [];
  const walk = (routes: Record<string, Json>[]) => {
    for (const r of routes) {
      const hosts = hostsOf(r);
      const named = hosts.filter((h) => !h.startsWith('*') && h.endsWith(domainSuffix));
      if (named.length) {
        const dials = collectDials(r.handle, []);
        for (const d of named) out.push({ domain: d, dial: dials[0] ?? '' });
        continue;
      }
      // 萬用網域（*.sisihome.org）底下是 subroute，往下找
      for (const h of (r.handle ?? []) as Record<string, Json>[]) {
        if (h.handler === 'subroute' && Array.isArray(h.routes)) walk(h.routes as Record<string, Json>[]);
      }
    }
  };
  for (const srv of Object.values(servers)) walk(srv.routes ?? []);
  return out;
}

async function resolveIp(host: string, caddyHostIp: string, aliases: Map<string, string>) {
  if (host === '127.0.0.1' || host === 'localhost') return caddyHostIp;
  if (net.isIP(host)) return host;
  const alias = aliases.get(host);
  if (alias) return alias;
  try {
    return (await dns.lookup(host, { family: 4 })).address;
  } catch {
    return null;
  }
}

export interface DnsRecord {
  name: string;
  type: string;
  content: string;
}

/** Cloudflare 上這個 zone 的 A／AAAA／CNAME 記錄（不含萬用網域）。 */
export async function readCloudflare(token: string, zone: string): Promise<DnsRecord[]> {
  const api = async (path: string) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { success: boolean; result: unknown };
    if (!body.success) throw new Error(`Cloudflare API 失敗：HTTP ${res.status}`);
    return body.result;
  };
  const zones = (await api(`/zones?name=${encodeURIComponent(zone)}`)) as { id: string }[];
  if (!zones.length) throw new Error(`Cloudflare 找不到 zone ${zone}`);
  const records = (await api(`/zones/${zones[0].id}/dns_records?per_page=500`)) as DnsRecord[];
  return records.filter((r) => ['A', 'AAAA', 'CNAME'].includes(r.type) && !r.name.startsWith('*'));
}

/** 網域實際由誰提供：這台 Caddy、Tunnel（回到 Caddy 同一個上游），或外部平台。 */
function hostedBy(r: DnsRecord | undefined, caddyHostIp: string): 'caddy' | 'vercel' | 'cloudflare' | 'other' {
  if (!r || r.content === caddyHostIp) return 'caddy';
  if (r.content.endsWith('.cfargotunnel.com')) return 'caddy'; // Tunnel 的來源就是 Caddy 指的那台機器
  if (/vercel/i.test(r.content)) return 'vercel';
  if (r.type === 'AAAA' && r.content === '100::') return 'cloudflare'; // Workers 自訂網域
  return 'other';
}

export const EXTERNAL_HOSTS: Record<string, string> = {
  vercel: 'Vercel',
  cloudflare: 'Cloudflare',
  other: '外部',
};

export async function readDomains(
  caddyUrl: string,
  domainSuffix: string,
  caddyHostIp: string,
  aliases: Map<string, string>,
  records: DnsRecord[] | null,
): Promise<DomainRoute[]> {
  const res = await fetch(caddyUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Caddy 設定讀取失敗：HTTP ${res.status}`);
  const pairs = parseCaddyServers((await res.json()) as never, domainSuffix);
  const recordOf = new Map((records ?? []).map((r) => [r.name, r]));
  const byTarget = new Map<string, DomainRoute>();
  const add = (domain: string, ip: string, port: number) => {
    const key = `${ip}:${port}`;
    const cur = byTarget.get(key) ?? { domains: [], ip, port };
    if (!cur.domains.includes(domain)) cur.domains.push(domain);
    byTarget.set(key, cur);
  };
  const external = (domain: string) => {
    const where = hostedBy(recordOf.get(domain), caddyHostIp);
    if (where === 'caddy') return false;
    add(domain, where, 443);
    return true;
  };

  const seen = new Set<string>();
  for (const { domain, dial } of pairs) {
    if (seen.has(domain)) continue;
    // DNS 沒指到這台 Caddy（例如 mita 走 Workers）：Caddy 裡的路由沒人用，不能拿來對到內部機器
    if (external(domain)) {
      seen.add(domain);
      continue;
    }
    const idx = dial.lastIndexOf(':');
    if (idx < 0) continue;
    const ip = await resolveIp(dial.slice(0, idx), caddyHostIp, aliases);
    const port = Number(dial.slice(idx + 1));
    if (!ip || !Number.isInteger(port)) continue;
    seen.add(domain);
    add(domain, ip, port);
  }
  // Caddy 裡沒有、只在 DNS 上的網域（Vercel、Workers）
  for (const r of records ?? []) if (!seen.has(r.name) && r.name.endsWith(domainSuffix)) external(r.name);
  return [...byTarget.values()];
}

// ---------- 探測 ----------

export function tcpOpen(ip: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/** 掃一台機器的全部 TCP port，回傳有開的。 */
export async function scanPorts(
  ip: string,
  opts: { concurrency: number; timeoutMs: number; skip: Set<number> },
): Promise<number[]> {
  const open: number[] = [];
  let next = 1;
  const worker = async () => {
    while (next <= 65535) {
      const p = next++;
      if (opts.skip.has(p)) continue;
      if (await tcpOpen(ip, p, opts.timeoutMs)) open.push(p);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
  return open.sort((a, b) => a - b);
}

export interface ProbeResult {
  ok: boolean; // 有回 HTTP
  scheme: 'http' | 'https';
  status: number;
  title: string;
  server: string; // 回應的 Server 標頭，沒有標題時拿來當名字
}

function request(url: string, timeoutMs: number): Promise<{ status: number; body: string; server: string } | null> {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(
      url,
      { timeout: timeoutMs, rejectUnauthorized: false, headers: { 'User-Agent': 'portal-probe' } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          body += c;
          if (body.length > 65536) res.destroy();
        });
        res.on('close', () => resolve({ status: res.statusCode ?? 0, body, server: String(res.headers.server ?? '') }));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function extractTitle(html: string): string {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

/** 先試 http 再試 https；兩個都不是網頁就回 ok=false。 */
export async function probeHttp(ip: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  for (const scheme of ['http', 'https'] as const) {
    const r = await request(`${scheme}://${ip}:${port}/`, timeoutMs);
    // http 打到 https port 常回 400 "plain HTTP request was sent to HTTPS port"
    if (r && !(scheme === 'http' && r.status === 400 && /https/i.test(r.body))) {
      return { ok: r.status > 0, scheme, status: r.status, title: extractTitle(r.body), server: r.server.split('/')[0].slice(0, 40) };
    }
  }
  return { ok: false, scheme: 'http', status: 0, title: '', server: '' };
}

export async function probeDomain(domain: string, timeoutMs: number) {
  const r = await request(`https://${domain}/`, timeoutMs);
  return { online: !!r && r.status > 0 && r.status < 500, status: r?.status ?? 0, title: r ? extractTitle(r.body) : '' };
}
