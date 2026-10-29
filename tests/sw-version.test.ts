import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TILE_SPRITE_VERSION } from '../src/engine/tiles';

/**
 * The tile sprites are not content-hashed, so their URL version and the service
 * worker's cache name are the only things that make a repaint reach an installed
 * client. If these drift, the new art is live on the server and invisible on the
 * phone — exactly the bug `khm-v1` shipped. Keep them equal.
 */
describe('service worker cache version', () => {
  const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

  it('carries the same version as the tile sprite URLs', () => {
    const match = sw.match(/const TILES_VERSION = '([^']+)';/);
    expect(match, 'TILES_VERSION missing from public/sw.js').toBeTruthy();
    expect(match![1]).toBe(TILE_SPRITE_VERSION);
  });

  it('keys the tile cache on the versioned URL instead of ignoring the query', () => {
    expect(sw).toMatch(/TILES\.map\(tileUrl\)/);
    expect(sw).toContain("caches.match(req);");
  });
});
