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

export async function readCaddy(
  url: string,
  domainSuffix: string,
  caddyHostIp: string,
  aliases: Map<string, string>,
): Promise<DomainRoute[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Caddy 設定讀取失敗：HTTP ${res.status}`);
  const pairs = parseCaddyServers((await res.json()) as never, domainSuffix);
  const byTarget = new Map<string, DomainRoute>();
  const seen = new Set<string>();
  for (const { domain, dial } of pairs) {
    if (seen.has(domain) && !dial) continue;
    const idx = dial.lastIndexOf(':');
    if (idx < 0) continue;
    const ip = await resolveIp(dial.slice(0, idx), caddyHostIp, aliases);
    const port = Number(dial.slice(idx + 1));
    if (!ip || !Number.isInteger(port)) continue;
    seen.add(domain);
    const key = `${ip}:${port}`;
    const cur = byTarget.get(key) ?? { domains: [], ip, port };
    if (!cur.domains.includes(domain)) cur.domains.push(domain);
    byTarget.set(key, cur);
  }
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
}

function request(url: string, timeoutMs: number): Promise<{ status: number; body: string } | null> {
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
        res.on('close', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

export function extractTitle(html: string): string {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

/** 先試 http 再試 https；兩個都不是網頁就回 ok=false。 */
export async function probeHttp(ip: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  for (const scheme of ['http', 'https'] as const) {
    const r = await request(`${scheme}://${ip}:${port}/`, timeoutMs);
    // http 打到 https port 常回 400 "plain HTTP request was sent to HTTPS port"
    if (r && !(scheme === 'http' && r.status === 400 && /https/i.test(r.body))) {
      return { ok: r.status > 0, scheme, status: r.status, title: extractTitle(r.body) };
    }
  }
  return { ok: false, scheme: 'http', status: 0, title: '' };
}

export async function probeDomain(domain: string, timeoutMs: number) {
  const r = await request(`https://${domain}/`, timeoutMs);
  return { online: !!r && r.status > 0 && r.status < 500, status: r?.status ?? 0, title: r ? extractTitle(r.body) : '' };
}
