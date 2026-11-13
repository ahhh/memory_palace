/**
 * Share links that have shipped must decode to the same palace forever. To record new
 * fixtures (never edit old lines): UPDATE_LINK_FIXTURES=1 npx vitest run src/share/links.test.ts
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { produce } from 'immer';
import { decodeShare, encodeShare } from './codec';
import { docHash } from './hash';
import { generate } from '../gen/registry';
import { emptyDoc } from '../model/defaults';
import { addAnchor, addOpening, addRoomRect, placeFurniture } from '../editor/commands';

const FILE = fileURLToPath(new URL('./__fixtures__/links.txt', import.meta.url));

async function samples(): Promise<string[]> {
  const fam = generate({ style: 'family', ver: 1, seed: 'fixture-home', params: {} });
  const withJourney = produce(fam, (d) => {
    const L = Object.keys(d.levels)[0];
    addAnchor(d, L, [0, 1.2, 0], 'Kings of England', 'William I sits on the bench juggling arrows');
    addAnchor(d, L, [1, 1.0, 1], 'Second locus', 'A lion eating a heart');
  });
  const drawn = produce(emptyDoc('Fixture sketch'), (d) => {
    addRoomRect(d, 'L1', [0, 0], [4, 3], { label: 'Atrium', type: 'hall' });
    const w = Object.keys(d.walls)[0];
    addOpening(d, w, 'door', 2);
    placeFurniture(d, 'L1', 'statue', [2, 1.5], 90);
    addAnchor(d, 'L1', [2, 2.4, 1.5], 'Statue', 'Cicero, pointing at a loci diagram');
  });
  return [
    await encodeShare(generate({ style: 'condo', ver: 1, seed: 'fixture-flat', params: { bedrooms: '1' } })),
    await encodeShare(generate({ style: 'mansion', ver: 1, seed: 'fixture-hall', params: { floors: '3', court: '1' } })),
    await encodeShare(generate({ style: 'prairie', ver: 1, seed: 'fixture-falls', params: { variant: 'fallingwater' } })),
    await encodeShare(withJourney),
    await encodeShare(drawn),
  ];
}

describe('shipped share links', () => {
  it('still decode to the recorded palaces', async () => {
    if (process.env.UPDATE_LINK_FIXTURES || !existsSync(FILE)) {
      const prev = existsSync(FILE) ? readFileSync(FILE, 'utf8') : '# <docHash> <share code>\n';
      const lines: string[] = [];
      for (const code of await samples()) {
        if (prev.includes(code)) continue;
        lines.push(`${docHash(await decodeShare(code))} ${code}`);
      }
      writeFileSync(FILE, prev + lines.map((l) => l + '\n').join(''));
    }
    const rows = readFileSync(FILE, 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const [hash, code] = row.split(' ');
      expect(docHash(await decodeShare(code))).toBe(hash);
    }
  });
});
