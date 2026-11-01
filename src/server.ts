import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Discovery } from './discovery.js';
import { Store } from './store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
const env = (k: string, d: string) => process.env[k] ?? d;
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const store = new Store(env('DATABASE_PATH', '/data/portal.db'));
const discovery = new Discovery(
  {
    beszelDb: env('BESZEL_DB', '/beszel/data.db'),
    caddyUrl: env('CADDY_CONFIG_URL', 'https://portal.sisihome.org/__caddy/servers'),
    caddyHostIp: env('CADDY_HOST_IP', '100.127.82.47'),
    domainSuffix: env('DOMAIN_SUFFIX', '.sisihome.org'),
    aliases: new Map(list(env('HOST_ALIASES', '')).map((p) => p.split('=') as [string, string])),
    skipPorts: new Set(list(env('SKIP_PORTS', '22,53,135,139,445,2869,5040,5357,5985,7680,45876,47001')).map(Number)),
    fullScanHours: Number(env('FULL_SCAN_HOURS', '3')),
    quickProbeSeconds: Number(env('QUICK_PROBE_SECONDS', '120')),
    scanConcurrency: Number(env('SCAN_CONCURRENCY', '150')),
    scanTimeoutMs: Number(env('SCAN_TIMEOUT_MS', '600')),
    keepDays: Number(env('KEEP_DAYS', '3')),
    magicDns: env('MAGIC_DNS', '100.100.100.100'),
  },
  store,
);

const app = Fastify({ logger: { level: 'warn' } });
app.register(fastifyStatic, {
  root: path.join(root, 'public'),
  setHeaders(res, file) {
    // 字型切片內容不會變（換字型會整批重產），讓瀏覽器永久快取
    if (file.includes(`${path.sep}fonts${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'no-cache');
  },
});
app.register(fastifyStatic, {
  root: path.join(root, 'node_modules/alpinejs/dist'),
  prefix: '/vendor/alpine/',
  decorateReply: false,
});

app.get('/api/health', async () => ({ ok: true, version }));
app.get('/api/overview', async () => ({ version, ...discovery.overview() }));
app.post<{ Body: { key?: unknown; hidden?: unknown } }>('/api/hidden', async (req, reply) => {
  const { key, hidden } = req.body ?? {};
  if (typeof key !== 'string' || !/^[\w.:-]+$/.test(key) || typeof hidden !== 'boolean') {
    return reply.code(400).send({ error: 'key（字串）與 hidden（true/false）都要給' });
  }
  store.setHidden(key, hidden);
  return { ok: true };
});

await app.listen({ host: env('HOST', '0.0.0.0'), port: Number(env('PORT', '3000')) });
discovery.start();
console.log(`portal v${version} listening`);
