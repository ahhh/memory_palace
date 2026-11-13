import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decodeShare, encodeShare } from './codec';
import { generate } from '../gen/registry';
import { emptyDoc } from '../model/defaults';
import { addAnchor, addOpening, addRoomRect, addWall, deleteEntity, placeFurniture } from '../editor/commands';
import { produce } from 'immer';
import { deepEqual } from './deepEqual';
import { applyPacked, diffPacked } from './delta';
import { base64urlToBytes, bytesToBase64url } from './base64url';
import type { PalaceDoc } from '../model/schema';
import { sortedIds } from '../model/ids';

const family = () => generate({ style: 'family', ver: 1, seed: 'oak-river-42', params: {} });

describe('share codec', () => {
  it('uses a short recipe link for an unedited generated palace', async () => {
    const doc = family();
    const code = await encodeShare(doc);
    expect(code).toBe('r1.family@1.oak-river-42');
    expect(deepEqual(await decodeShare(code), doc)).toBe(true);
  });

  it('keeps params in recipe links', async () => {
    const doc = generate({ style: 'prairie', ver: 1, seed: 'bear-run', params: { variant: 'fallingwater' } });
    const code = await encodeShare(doc);
    expect(code).toBe('r1.prairie@1.bear-run.variant=fallingwater');
    expect(deepEqual(await decodeShare(code), doc)).toBe(true);
  });

  it('encodes a generated palace + journey as a compact delta', async () => {
    const base = family();
    const doc = produce(base, (d) => {
      const L = Object.keys(d.levels)[0];
      for (let i = 0; i < 20; i++) addAnchor(d, L, [i * 0.5, 1.2, 1], `Locus ${i + 1} ✦ ünïcödé`, `Idea number ${i + 1}: a purple elephant juggling ${i} teacups`);
      const someWall = sortedIds(d.walls)[3];
      deleteEntity(d, 'walls', someWall);
      d.meta.name = 'My palace';
    });
    const code = await encodeShare(doc);
    expect(code.startsWith('e1.family@1.oak-river-42.')).toBe(true);
    expect(code.length).toBeLessThan(3000);
    expect(deepEqual(await decodeShare(code), doc)).toBe(true);
  });

  it('round-trips hand-drawn palaces as full documents', async () => {
    const doc = produce(emptyDoc('Hand drawn'), (d) => {
      addRoomRect(d, 'L1', [0, 0], [5.13, 4.07], { label: 'Study', type: 'office' });
      addRoomRect(d, 'L1', [5.13, 0], [9, 4.07], { label: 'Kitchen', type: 'kitchen' });
      const w = addWall(d, 'L1', [-3, -3], [-3.3333, 2.71828]);
      if (w) addOpening(d, w, 'window', 2);
      placeFurniture(d, 'L1', 'sofa', [1.234, 2.345], 450);
      addAnchor(d, 'L1', [1, 1.5, 1], 'Rome', 'Founded 753 BC');
    });
    const code = await encodeShare(doc);
    expect(code.startsWith('d1.')).toBe(true);
    const back = await decodeShare(code);
    expect(deepEqual(back, doc)).toBe(true);
  });

  it('delta apply reproduces the doc (property)', () => {
    const base = family();
    fc.assert(fc.property(
      fc.array(fc.record({ x: fc.integer({ min: -2000, max: 2000 }), z: fc.integer({ min: -2000, max: 2000 }), t: fc.string(), del: fc.boolean() }), { maxLength: 12 }),
      (ops) => {
        const doc = produce(base, (d) => {
          const L = Object.keys(d.levels)[0];
          const ids = sortedIds(d.furniture);
          ops.forEach((o, i) => {
            if (o.del && ids[i]) deleteEntity(d, 'furniture', ids[i]);
            else addAnchor(d, L, [o.x / 100, 1, o.z / 100], o.t, o.t + '!');
          });
        });
        const packed = JSON.parse(JSON.stringify(diffPacked(base, doc))) as unknown[];
        return deepEqual(applyPacked(base, packed), doc);
      },
    ), { numRuns: 60 });
  });

  it('round-trips random hand-drawn docs (property)', async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.tuple(fc.integer({ min: -3000, max: 3000 }), fc.integer({ min: -3000, max: 3000 }), fc.integer({ min: 60, max: 900 }), fc.integer({ min: 60, max: 900 }), fc.string({ maxLength: 20 })), { minLength: 1, maxLength: 6 }),
      async (rooms) => {
        const doc = produce(emptyDoc(), (d: PalaceDoc) => {
          for (const [x, z, w, h, label] of rooms) addRoomRect(d, 'L1', [x / 100, z / 100], [(x + w) / 100, (z + h) / 100], { label });
        });
        return deepEqual(await decodeShare(await encodeShare(doc)), doc);
      },
    ), { numRuns: 25 });
  });

  it('base64url handles all byte values', () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
    expect([...base64urlToBytes(bytesToBase64url(bytes))]).toEqual([...bytes]);
    expect(bytesToBase64url(new Uint8Array())).toBe('');
  });

  it('rejects garbage', async () => {
    await expect(decodeShare('zz.nope')).rejects.toThrow();
    await expect(decodeShare('r1.castle@1.x')).rejects.toThrow();
  });
});
