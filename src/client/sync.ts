/**
 * Anonymous backups. localStorage is the only place the cat and the measured
 * play style live, and it is not durable: Safari drops it after a week away, and
 * "clear site data" takes everything. A five-letter code on the server means the
 * player can carry both to another device without an account.
 */
import { useStore } from './store';
import { STATS_KEY, healStats } from './stats';
import { healPersonality } from '../engine/bots/personality';
import { defaultCat, type CatAppearance } from './cat';
import type { Profile } from './net';

const SYNC_KEY = 'khm.sync.v1';
const PROFILE_KEY = 'khm.profile.v1';

export function syncCode(): string | null {
  try {
    return localStorage.getItem(SYNC_KEY);
  } catch {
    return null;
  }
}

function setSyncCode(code: string | null): void {
  try {
    if (code) localStorage.setItem(SYNC_KEY, code);
    else localStorage.removeItem(SYNC_KEY);
  } catch {
    /* private mode: backups are simply unavailable */
  }
}

/** What a backup carries: the cat as created, and the play that was measured. */
export function backupPayload(): { profile: unknown; stats: unknown } | null {
  try {
    const profile = localStorage.getItem(PROFILE_KEY);
    if (!profile) return null;
    return { profile: JSON.parse(profile), stats: JSON.parse(localStorage.getItem(STATS_KEY) ?? 'null') };
  } catch {
    return null;
  }
}

async function post(payload: unknown, code?: string | null): Promise<string> {
  const res = await fetch('/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: code ?? undefined, profile: payload }),
  });
  if (!res.ok) {
    const why = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(why.error ?? 'Could not save that.');
  }
  const data = (await res.json()) as { code: string };
  return data.code;
}

/** Give this cat a code, or refresh the one it already has. */
export async function backupNow(): Promise<string> {
  const payload = backupPayload();
  if (!payload) throw new Error('There is no cat to save yet.');
  const code = await post(payload, syncCode());
  setSyncCode(code);
  return code;
}

/** After every finished hand, quietly keep the code current. Never throws at the UI. */
export async function autoBackup(): Promise<void> {
  const code = syncCode();
  if (!code) return;
  const payload = backupPayload();
  if (!payload) return;
  try {
    await post(payload, code);
  } catch {
    /* offline, rate-limited, server down: the next hand tries again */
  }
}

/** Pull a backup into this browser. Returns the profile so the caller can show it. */
export async function restoreFrom(code: string): Promise<Profile> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const res = await fetch(`/profile/${clean}`);
  if (!res.ok) throw new Error('No cat with that code.');
  const data = (await res.json()) as { profile?: { profile?: unknown; stats?: unknown } };
  const profile = data.profile?.profile as Profile | undefined;
  if (!profile || typeof profile !== 'object') throw new Error('That backup is not a cat.');

  // a backup is just bytes from a network: heal both halves before they touch the UI
  const healedProfile: Profile = {
    ...profile,
    name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.slice(0, 14) : 'Cat',
    cat: { ...defaultCat(), ...((profile.cat ?? {}) as CatAppearance) },
    // a v1 backup carries a vector the v2 bot reads fields from
    personality: healPersonality(profile.personality, profile.name),
  };
  const healedStats = healStats(data.profile?.stats);
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(healedProfile));
    localStorage.setItem(STATS_KEY, JSON.stringify(healedStats));
  } catch {
    throw new Error('This browser will not store the cat.');
  }
  setSyncCode(clean);
  useStore.setState({ profile: healedProfile, stats: healedStats, screen: 'menu' });
  return healedProfile;
}
