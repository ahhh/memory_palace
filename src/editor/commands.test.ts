import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { emptyDoc } from '../model/defaults';
import { addAnchor, addOpening, addRoomRect, addWall, duplicateSelection, moveVertex, placeFurniture, splitWallAt, translateSelection } from './commands';
import { pickInRect } from './pick';
import { validate } from '../model/validate';
import type { PalaceDoc } from '../model/schema';

const room = () => produce(emptyDoc(), (d: PalaceDoc) => { addRoomRect(d, 'L1', [0, 0], [4, 3], { label: 'A' }); });

describe('editing commands', () => {
  it('room tool makes four walls and a floor, sharing walls with neighbors', () => {
    const d = produce(room(), (d) => { addRoomRect(d, 'L1', [4, 0], [7, 3], { label: 'B' }); });
    expect(Object.keys(d.rooms)).toHaveLength(2);
    expect(Object.keys(d.walls)).toHaveLength(7);
    expect(validate(d)).toEqual([]);
  });

  it('moving a corner drags joined walls and the room floor with it', () => {
    const d0 = room();
    const d = produce(d0, (d) => moveVertex(d, 'L1', [4, 3], [5, 3.5]));
    const ends = Object.values(d.walls).flatMap((w) => [w.a, w.b]);
    expect(ends.filter(([x, z]) => x === 5 && z === 3.5)).toHaveLength(2);
    expect(Object.values(d.rooms)[0].polygon).toContainEqual([5, 3.5]);
  });

  it('moving a corner slides openings back inside a shortened wall, or drops them', () => {
    let wall = '';
    const d0 = produce(emptyDoc(), (d: PalaceDoc) => {
      wall = addWall(d, 'L1', [0, 0], [6, 0])!;
      addOpening(d, wall, 'window', 4.5);
      addOpening(d, wall, 'door', 1);
    });
    const d = produce(d0, (d) => moveVertex(d, 'L1', [6, 0], [3, 0]));
    const ops = Object.values(d.openings);
    expect(ops).toHaveLength(2);
    expect(Math.max(...ops.map((o) => o.offset + o.width / 2))).toBeLessThanOrEqual(3);
    const d2 = produce(d0, (d) => moveVertex(d, 'L1', [6, 0], [0.8, 0]));
    expect(Object.values(d2.openings).length).toBeLessThan(2);
    expect(validate(d2)).toEqual([]);
  });

  it('box-select, translate and duplicate work on mixed selections', () => {
    const d0 = produce(room(), (d) => {
      placeFurniture(d, 'L1', 'sofa', [2, 1.5], 0);
      addAnchor(d, 'L1', [2, 1, 1.5], 'x');
      const w = Object.keys(d.walls)[0];
      addOpening(d, w, 'door', 2);
    });
    const sels = pickInRect(d0, 'L1', [-1, -1], [5, 4]);
    expect(sels.map((s) => s.kind).sort()).toEqual(['anchors', 'furniture', 'rooms', 'walls', 'walls', 'walls', 'walls']);
    const moved = produce(d0, (d) => translateSelection(d, sels, 10, -2));
    expect(Object.values(moved.furniture)[0].pos).toEqual([12, -0.5]);
    expect(Object.values(moved.rooms)[0].polygon[0]).toEqual([10, -2]);
    const dup = produce(d0, (d) => { duplicateSelection(d, sels, 0.5, 0.5); });
    expect(Object.keys(dup.walls)).toHaveLength(8);
    expect(Object.keys(dup.openings)).toHaveLength(2);
    expect(dup.journey).toHaveLength(2);
    expect(validate(dup)).toEqual([]);
  });

  it('splitting a wall re-bases openings onto the right half', () => {
    let w = '';
    const d = produce(emptyDoc(), (d: PalaceDoc) => {
      w = addWall(d, 'L1', [0, 0], [10, 0])!;
      addOpening(d, w, 'window', 8);
      splitWallAt(d, w, [5, 0]);
    });
    const o = Object.values(d.openings)[0];
    expect(o.wall).not.toBe(w);
    expect(o.offset).toBe(3);
  });
});
