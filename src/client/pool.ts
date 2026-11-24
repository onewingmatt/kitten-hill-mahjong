import { healPersonality, encodePersonality, playStyleLabel } from '../engine/bots/personality';
import type { Personality } from '../engine/types';
import type { CatAppearance } from './cat';
import { backupNow, syncCode } from './sync';

/**
 * The cattery: the player cats other people can meet.
 *
 * A cat is published explicitly, keyed by its backup code, and taken down with
 * the same code. What leaves the browser is the name, the cat's art and the
 * measured vector — never the record, the score or the code.
 */
export interface PoolCat {
  id: string;
  name: string;
  cat: CatAppearance;
  personality: Personality;
}

const PUBLISHED_KEY = 'khm.pool.v1';

export function publishedCode(): string | null {
  try {
    return localStorage.getItem(PUBLISHED_KEY);
  } catch {
    return null;
  }
}

function rememberPublished(code: string | null): void {
  try {
    if (code) localStorage.setItem(PUBLISHED_KEY, code);
    else localStorage.removeItem(PUBLISHED_KEY);
  } catch {
    /* private mode: publishing works for this session */
  }
}

export async function listPool(n = 12): Promise<PoolCat[]> {
  try {
    const res = await fetch(`/pool?n=${n}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { cats?: { id: string; name: string; cat: CatAppearance; personality: unknown }[] };
    return (data.cats ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      cat: c.cat,
      personality: healPersonality(c.personality, c.name),
    }));
  } catch {
    return [];
  }
}

/** Publish this browser's cat. Creates a backup code first if it has none. */
export async function publishCat(profile: { name: string; cat: CatAppearance; personality: Personality }): Promise<{ ok: boolean; why?: string }> {
  try {
    const code = syncCode() ?? (await backupNow());
    const res = await fetch('/pool/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name: profile.name, cat: profile.cat, personality: profile.personality }),
    });
    if (!res.ok) {
      const why = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, why: why.error ?? 'Could not publish that cat.' };
    }
    rememberPublished(code);
    return { ok: true };
  } catch {
    return { ok: false, why: 'The cattery is offline.' };
  }
}

export async function unpublishCat(): Promise<{ ok: boolean; why?: string }> {
  const code = publishedCode() ?? syncCode();
  if (!code) return { ok: false, why: 'This cat was never published.' };
  try {
    const res = await fetch('/pool/unpublish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return { ok: false, why: 'Could not take the cat down.' };
    rememberPublished(null);
    return { ok: true };
  } catch {
    return { ok: false, why: 'The cattery is offline.' };
  }
}

/** The share code a pool cat is played by: the same code a pasted one would use. */
export function poolCatCode(c: PoolCat): string {
  return encodePersonality(c.personality);
}

export function poolCatLabel(c: PoolCat): string {
  return playStyleLabel(c.personality);
}
