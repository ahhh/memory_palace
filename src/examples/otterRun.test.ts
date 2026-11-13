import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOtterRun } from './otterRun';
import { unreachableRooms, validate } from '../model/validate';
import { decodeShare, encodeShare } from '../share/codec';
import { docsEqual } from '../share/delta';

describe('Otter Run example', () => {
  it('is a valid 4 bed / 2 bath palace that round-trips through a share link', async () => {
    const doc = buildOtterRun();
    expect(validate(doc)).toEqual([]);
    expect(unreachableRooms(doc).map((id) => doc.rooms[id].label)).toEqual([]);
    const rooms = Object.values(doc.rooms);
    expect(rooms.filter((r) => r.type === 'bedroom')).toHaveLength(4);
    expect(rooms.filter((r) => r.type === 'bath')).toHaveLength(2);
    expect(Object.values(doc.furniture).filter((f) => f.cat === 'otter').length).toBeGreaterThan(0);
    const code = await encodeShare(doc);
    expect(code.startsWith('d1.')).toBe(true);
    expect(docsEqual(await decodeShare(code), doc)).toBe(true);
    if (process.env.OTTER_OUT) writeFileSync(process.env.OTTER_OUT, code);
  });
});
