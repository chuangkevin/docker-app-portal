// 本服務自己的資料：探測結果（重開不會忘）與隱藏清單。
import Database from 'better-sqlite3';

export interface ServiceRow {
  key: string; // ip:port
  ip: string;
  port: number;
  scheme: 'http' | 'https';
  status: number;
  title: string;
  online: number;
  first_seen: number;
  last_seen: number;
}

export class Store {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      create table if not exists services (
        key text primary key, ip text not null, port integer not null,
        scheme text not null default 'http', status integer not null default 0,
        title text not null default '', online integer not null default 0,
        first_seen integer not null, last_seen integer not null
      );
      create table if not exists hidden (key text primary key, hidden_at integer not null);
      create table if not exists meta (k text primary key, v text not null);
    `);
  }

  upsertSeen(r: Omit<ServiceRow, 'first_seen' | 'last_seen' | 'online'>, now: number) {
    this.db
      .prepare(
        `insert into services(key, ip, port, scheme, status, title, online, first_seen, last_seen)
         values(@key, @ip, @port, @scheme, @status, @title, 1, @now, @now)
         on conflict(key) do update set scheme=@scheme, status=@status,
           title=case when @title != '' then @title else title end, online=1, last_seen=@now`,
      )
      .run({ ...r, now });
  }

  markOffline(key: string) {
    this.db.prepare('update services set online = 0 where key = ?').run(key);
  }

  /** 超過 keepMs 沒再看到的就刪掉（關掉的服務不要永遠留著）。 */
  prune(before: number) {
    this.db.prepare('delete from services where last_seen < ?').run(before);
  }

  services(): ServiceRow[] {
    return this.db.prepare('select * from services').all() as ServiceRow[];
  }

  hiddenKeys(): Set<string> {
    return new Set((this.db.prepare('select key from hidden').all() as { key: string }[]).map((r) => r.key));
  }

  setHidden(key: string, hidden: boolean) {
    if (hidden) this.db.prepare('insert or ignore into hidden(key, hidden_at) values(?, ?)').run(key, Date.now());
    else this.db.prepare('delete from hidden where key = ?').run(key);
  }

  getMeta(k: string): string | undefined {
    return (this.db.prepare('select v from meta where k = ?').get(k) as { v: string } | undefined)?.v;
  }

  setMeta(k: string, v: string) {
    this.db.prepare('insert into meta(k, v) values(?, ?) on conflict(k) do update set v = excluded.v').run(k, v);
  }
}
