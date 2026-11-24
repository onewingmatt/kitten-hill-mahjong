/**
 * Room persistence. Rooms used to live in a `new Map()` and nothing else, so a
 * deploy, a crash or a `systemctl restart` ended every table in progress.
 *
 * Only the durable shape is stored — no sockets, no timers. On boot the server
 * rebuilds the rooms and lets the clock pick up again; seats carry a token so a
 * human can take their chair back from the stand-in bot.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const file = process.env.ROOMS_DB ?? path.resolve(process.cwd(), 'data/rooms.db');
mkdirSync(path.dirname(file), { recursive: true });

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    code       TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    state      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rooms_updated ON rooms (updated_at);
`);

const put = db.prepare(
  `INSERT INTO rooms (code, updated_at, state) VALUES (?, ?, ?)
   ON CONFLICT(code) DO UPDATE SET updated_at = excluded.updated_at, state = excluded.state`,
);
const del = db.prepare('DELETE FROM rooms WHERE code = ?');
const recent = db.prepare('SELECT code, state FROM rooms WHERE updated_at > ?');
const prune = db.prepare('DELETE FROM rooms WHERE updated_at < ?');

export function saveRoom(code: string, state: unknown): void {
  try {
    put.run(code, Date.now(), JSON.stringify(state));
  } catch (err) {
    // a write failure must never take the table down with it
    console.error('[kitten-hill] could not save room', code, err);
  }
}

export function dropRoom(code: string): void {
  try {
    del.run(code);
  } catch (err) {
    console.error('[kitten-hill] could not drop room', code, err);
  }
}

export function loadRecentRooms(since: number): { code: string; state: string }[] {
  return recent.all(since) as { code: string; state: string }[];
}

export function pruneRooms(before: number): number {
  return prune.run(before).changes;
}

/* ------------------------------------------------------------------------ *
 * Anonymous profile backups.
 *
 * localStorage is not durable: Safari clears it after a week of not visiting,
 * and "clear site data" takes the cat and every hand of measured play with it.
 * A short code plus a row in SQLite means a player can carry both to another
 * device — no account, no email, nothing to forget.
 * ------------------------------------------------------------------------ */

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    code       TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL,
    profile    TEXT NOT NULL
  );
`);

const putProfile = db.prepare(
  `INSERT INTO profiles (code, updated_at, profile) VALUES (?, ?, ?)
   ON CONFLICT(code) DO UPDATE SET updated_at = excluded.updated_at, profile = excluded.profile`,
);
const getProfile = db.prepare('SELECT profile FROM profiles WHERE code = ?');
const pruneProfiles = db.prepare('DELETE FROM profiles WHERE updated_at < ?');

export const PROFILE_MAX_BYTES = 16 * 1024;
export const PROFILE_TTL_MS = 180 * 24 * 60 * 60_000;

export function saveProfileRow(code: string, profile: unknown): void {
  putProfile.run(code, Date.now(), JSON.stringify(profile));
}

export function readProfileRow(code: string): unknown | null {
  const row = getProfile.get(code) as { profile: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.profile);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------ *
 * The cattery: player cats other players can meet.
 *
 * Opt-in, one row per cat, keyed by the sync code so it can be unpublished with
 * the same code that published it. Nothing here carries stats, score or the sync
 * code itself: the pool hands out an opaque id and the four things a bot needs.
 * ------------------------------------------------------------------------ */

db.exec(`
  CREATE TABLE IF NOT EXISTS pool (
    id          TEXT PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    updated_at  INTEGER NOT NULL,
    name        TEXT NOT NULL,
    cat         TEXT NOT NULL,
    personality TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pool_updated ON pool (updated_at);
`);

const putPool = db.prepare(
  `INSERT INTO pool (id, code, updated_at, name, cat, personality) VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(code) DO UPDATE SET updated_at = excluded.updated_at, name = excluded.name,
     cat = excluded.cat, personality = excluded.personality`,
);
const dropPool = db.prepare('DELETE FROM pool WHERE code = ?');
const getPoolByCode = db.prepare('SELECT id FROM pool WHERE code = ?');
const listPool = db.prepare('SELECT id, name, cat, personality FROM pool ORDER BY updated_at DESC LIMIT 400');
const prunePool = db.prepare('DELETE FROM pool WHERE updated_at < ?');

export const POOL_TTL_MS = 90 * 24 * 60 * 60_000;
export const POOL_MAX = 400;

export function publishPoolRow(code: string, entry: { name: string; cat: unknown; personality: unknown }): string {
  const existing = getPoolByCode.get(code) as { id: string } | undefined;
  const id = existing?.id ?? Math.random().toString(36).slice(2, 8).toUpperCase();
  putPool.run(id, code, Date.now(), entry.name, JSON.stringify(entry.cat), JSON.stringify(entry.personality));
  return id;
}

export function unpublishPoolRow(code: string): boolean {
  return dropPool.run(code).changes > 0;
}

export function listPoolRows(): { id: string; name: string; cat: unknown; personality: unknown }[] {
  return (listPool.all() as { id: string; name: string; cat: string; personality: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
    cat: JSON.parse(r.cat),
    personality: JSON.parse(r.personality),
  }));
}

export function prunePoolRows(before: number): number {
  return prunePool.run(before).changes;
}

export function pruneProfileRows(before: number): number {
  return pruneProfiles.run(before).changes;
}

/* ------------------------------------------------------------------------ *
 * A few counters, so the question "does anyone play a second hand?" has an
 * answer. No identifiers beyond a fresh per-page-load id and no free text.
 * ------------------------------------------------------------------------ */

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      INTEGER NOT NULL,
    session TEXT NOT NULL,
    name    TEXT NOT NULL,
    props   TEXT
  );
  CREATE INDEX IF NOT EXISTS events_at ON events (at);
`);

const putEvent = db.prepare('INSERT INTO events (at, session, name, props) VALUES (?, ?, ?, ?)');

export function logEvent(session: string, name: string, at: number, props: unknown): void {
  putEvent.run(at, session, name, props == null ? null : JSON.stringify(props).slice(0, 600));
}

export function eventSummary(since: number): { name: string; count: number }[] {
  return db
    .prepare('SELECT name, COUNT(*) AS count FROM events WHERE at > ? GROUP BY name ORDER BY count DESC')
    .all(since) as { name: string; count: number }[];
}
