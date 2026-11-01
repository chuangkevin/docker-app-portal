// 把三個來源合成一份「機器 → 服務」清單，並在背景持續更新。
import {
  type Container,
  type DomainRoute,
  type Machine,
  probeDomain,
  probeHttp,
  readBeszel,
  readCloudflare,
  readDomains,
  EXTERNAL_HOSTS,
  type DnsRecord,
  scanPorts,
} from './sources.js';
import type { Store } from './store.js';
import dns from 'node:dns/promises';

export interface Config {
  beszelDb: string;
  caddyUrl: string;
  caddyHostIp: string;
  domainSuffix: string;
  aliases: Map<string, string>;
  skipPorts: Set<number>;
  fullScanHours: number;
  quickProbeSeconds: number;
  scanConcurrency: number;
  scanTimeoutMs: number;
  keepDays: number;
  magicDns: string;
  cfToken: string;
  cfZone: string;
}

export interface ServiceView {
  key: string;
  name: string;
  title: string;
  url: string;
  domains: string[];
  ip: string;
  port: number;
  container: string | null;
  online: boolean;
  hidden: boolean;
  firstSeen: number;
  alsoOn?: string[];
}

export interface MachineView {
  id: string;
  name: string;
  ip: string;
  status: string;
  registered: boolean;
  services: ServiceView[];
}

export class Discovery {
  machines: Machine[] = [];
  containers: Container[] = [];
  routes: DomainRoute[] = [];
  domainState = new Map<string, { online: boolean; title: string }>();
  scanning: string | null = null;
  names = new Map<string, string>(); // 沒註冊的機器：用 Tailscale MagicDNS 反查名字
  errors: string[] = [];

  constructor(
    private cfg: Config,
    private store: Store,
  ) {}

  async refreshSources() {
    const errors: string[] = [];
    try {
      const b = readBeszel(this.cfg.beszelDb);
      this.machines = b.machines;
      this.containers = b.containers;
    } catch (e) {
      errors.push(`機器清單（Beszel）讀不到：${(e as Error).message}`);
    }
    let records: DnsRecord[] | null = null;
    if (this.cfg.cfToken) {
      try {
        records = await readCloudflare(this.cfg.cfToken, this.cfg.cfZone);
      } catch (e) {
        errors.push(`DNS 記錄（Cloudflare）讀不到：${(e as Error).message}`);
      }
    }
    try {
      this.routes = await readDomains(this.cfg.caddyUrl, this.cfg.domainSuffix, this.cfg.caddyHostIp, this.cfg.aliases, records);
    } catch (e) {
      errors.push(`網域設定（Caddy）讀不到：${(e as Error).message}`);
    }
    this.errors = errors;
    await this.lookupNames();
  }

  private async lookupNames() {
    const known = new Set(this.machines.map((m) => m.ip));
    const resolver = new dns.Resolver({ timeout: 2000, tries: 1 });
    resolver.setServers([this.cfg.magicDns]);
    for (const r of this.routes) {
      if (known.has(r.ip) || this.names.has(r.ip)) continue;
      if (r.ip in EXTERNAL_HOSTS || !r.ip.startsWith('100.')) {
        this.names.set(r.ip, EXTERNAL_HOSTS[r.ip] ?? '外部');
        continue;
      }
      try {
        const [host] = await resolver.reverse(r.ip);
        if (host) this.names.set(r.ip, host.split('.')[0]);
      } catch {
        /* 查不到就顯示 IP */
      }
    }
  }

  private async probeAndRecord(ip: string, port: number) {
    const key = `${ip}:${port}`;
    const r = await probeHttp(ip, port, 4000);
    if (r.ok) this.store.upsertSeen({ key, ip, port, scheme: r.scheme, status: r.status, title: r.title, server: r.server }, Date.now());
    else this.store.markOffline(key);
  }

  /** 快速更新：已知的服務、容器公開的 port、Caddy 指到的上游、所有網域。 */
  async quickProbe() {
    const targets = new Map<string, [string, number]>();
    for (const s of this.store.services()) targets.set(s.key, [s.ip, s.port]);
    const ipOf = new Map(this.machines.map((m) => [m.id, m.ip]));
    for (const c of this.containers) {
      const ip = ipOf.get(c.machineId);
      if (ip) for (const p of c.ports) if (!this.cfg.skipPorts.has(p)) targets.set(`${ip}:${p}`, [ip, p]);
    }
    for (const r of this.routes) if (!(r.ip in EXTERNAL_HOSTS)) targets.set(`${r.ip}:${r.port}`, [r.ip, r.port]);

    const list = [...targets.values()];
    await runLimited(list, 16, ([ip, port]) => this.probeAndRecord(ip, port));
    const domains = this.routes.flatMap((r) => r.domains);
    await runLimited(domains, 8, async (d) => this.domainState.set(d, await probeDomain(d, 8000)));
    this.store.prune(Date.now() - this.cfg.keepDays * 86_400_000);
  }

  /** 完整掃描：每台有註冊的機器 1–65535 全掃，找沒有網域、沒有容器資訊的服務。 */
  async fullScan() {
    for (const m of this.machines) {
      if (m.status !== 'up') continue;
      this.scanning = m.name;
      const open = await scanPorts(m.ip, {
        concurrency: this.cfg.scanConcurrency,
        timeoutMs: this.cfg.scanTimeoutMs,
        skip: this.cfg.skipPorts,
      });
      await runLimited(open, 16, (p) => this.probeAndRecord(m.ip, p));
    }
    this.scanning = null;
    this.store.setMeta('lastFullScan', String(Date.now()));
  }

  start() {
    const loop = async (fn: () => Promise<void>, everyMs: number, label: string) => {
      for (;;) {
        const t = Date.now();
        try {
          await fn();
        } catch (e) {
          console.error(`[${label}]`, e);
        }
        await sleep(Math.max(5_000, everyMs - (Date.now() - t)));
      }
    };
    void (async () => {
      await this.refreshSources();
      void loop(async () => {
        await this.refreshSources();
        await this.quickProbe();
      }, this.cfg.quickProbeSeconds * 1000, 'quick');
      if (this.cfg.fullScanHours <= 0) return; // 0 = 關閉完整掃描（本機開發用）
      const last = Number(this.store.getMeta('lastFullScan') ?? 0);
      // 第一次啟動等 1 分鐘再掃；之後接續上次的節奏，重開容器不會馬上重掃
      await sleep(last ? Math.max(0, last + this.cfg.fullScanHours * 3_600_000 - Date.now()) : 60_000);
      void loop(() => this.fullScan(), this.cfg.fullScanHours * 3_600_000, 'full');
    })();
  }

  private containerAt(ip: string, port: number) {
    const m = this.machines.find((x) => x.ip === ip);
    return m ? (this.containers.find((c) => c.machineId === m.id && c.ports.includes(port))?.name ?? null) : null;
  }

  overview() {
    const hidden = this.store.hiddenKeys();
    const routeByKey = new Map(this.routes.map((r) => [`${r.ip}:${r.port}`, r]));
    const machineByIp = new Map(this.machines.map((m) => [m.ip, m]));
    const groups = new Map<string, MachineView>();
    for (const m of this.machines) {
      groups.set(m.ip, { id: m.id, name: m.name, ip: m.ip, status: m.status, registered: true, services: [] });
    }
    const group = (ip: string) => {
      let g = groups.get(ip);
      if (!g) {
        const alias = [...this.cfg.aliases].find(([, v]) => v === ip)?.[0].split('.')[0];
        g = { id: ip, name: alias ?? this.names.get(ip) ?? ip, ip, status: ip in EXTERNAL_HOSTS || !ip.startsWith('100.') ? 'external' : 'unknown', registered: false, services: [] };
        groups.set(ip, g);
      }
      return g;
    };

    const rows = new Map(this.store.services().map((s) => [s.key, s]));
    const keys = new Set([...rows.keys(), ...routeByKey.keys()]);
    for (const key of keys) {
      const row = rows.get(key);
      const route = routeByKey.get(key);
      // 3 萬以上的 port 多半是系統隨機開的（Tailscale peerapi 之類）：沒網域、沒容器、沒標題就不列
      if (!route && row && row.port >= 32768 && !row.title && !this.containerAt(row.ip, row.port)) continue;
      const ip = row?.ip ?? route!.ip;
      const port = row?.port ?? route!.port;
      const machine = machineByIp.get(ip);
      const container = this.containerAt(ip, port);
      const domains = route?.domains ?? [];
      const ds = domains.map((d) => this.domainState.get(d)).find(Boolean);
      const title = ds?.title || row?.title || '';
      const online = domains.length ? (ds?.online ?? false) : !!row?.online;
      const label = domains[0]?.slice(0, -this.cfg.domainSuffix.length);
      group(ip).services.push({
        key,
        name: label ?? container ?? (title || row?.server || `port ${port}`),
        title,
        url: domains.length ? `https://${domains[0]}` : `${row?.scheme ?? 'http'}://${ip}:${port}`,
        domains,
        ip,
        port,
        container,
        online,
        hidden: hidden.has(key),
        firstSeen: row?.first_seen ?? 0,
      });
    }
    for (const g of groups.values()) g.services = mergeSameService(g.services);
    const machines = [...groups.values()]
      .filter((g) => g.registered || g.services.length)
      .map((g) => ({ ...g, services: g.services.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')) }))
      .sort((a, b) => Number(b.registered) - Number(a.registered) || a.name.localeCompare(b.name));
    return {
      generatedAt: Date.now(),
      lastFullScan: Number(this.store.getMeta('lastFullScan') ?? 0) || null,
      scanning: this.scanning,
      errors: this.errors,
      machines,
    };
  }
}

/** 同一台機器上標題一樣、都沒有網域的（例如 DSM 的 5000／5001、80／443），只留 port 最小的那張。 */
function mergeSameService(list: ServiceView[]): ServiceView[] {
  const keep = new Map<string, ServiceView>();
  const out: ServiceView[] = [];
  for (const s of [...list].sort((a, b) => a.port - b.port)) {
    if (s.domains.length || !s.title) {
      out.push(s);
      continue;
    }
    const first = keep.get(s.title);
    if (!first) {
      keep.set(s.title, s);
      out.push(s);
    } else {
      first.alsoOn = [...(first.alsoOn ?? []), s.url];
      first.online ||= s.online;
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runLimited<T>(items: T[], limit: number, fn: (x: T) => Promise<unknown>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}
