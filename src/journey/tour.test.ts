import { describe, expect, it } from 'vitest';
import type { PalaceDoc, StyleId } from '../model/schema';
import { generate } from '../gen/registry';
import { paramSets } from '../gen/fixtureRecipes';
import { addAnchor } from '../editor/commands';
import { pointInPolygon } from '../model/geometry2d';
import { buildColliders } from '../walk/collision';
import { suggestJourney } from './suggest';
import { anchorViewpoint, clearView, tourRoute } from './tour';

function withJourney(doc: PalaceDoc): PalaceDoc {
  for (const a of suggestJourney(doc)) {
    const id = addAnchor(doc, a.level, a.pos, a.title, '', a.facing);
    doc.anchors[id].room = a.room;
  }
  return doc;
}

const palaces = (['family', 'condo', 'mansion', 'prairie'] as StyleId[]).flatMap((style) =>
  paramSets(style, 2).flatMap((params) => ['t1', 't2'].map((seed) => ({ style, params, seed }))));

describe('tour viewpoints', () => {
  it('suggests one locus per room by default', () => {
    for (const { style, params, seed } of palaces) {
      const rooms = suggestJourney(generate({ style, ver: 2, seed, params })).map((a) => a.room);
      expect(new Set(rooms).size).toBe(rooms.length);
    }
  });

  it.each(palaces.map((p) => [`${p.style} ${JSON.stringify(p.params)} ${p.seed}`, p] as const))(
    '%s: the camera stands in the room, clear of furniture, with a view of each locus',
    (_k, { style, params, seed }) => {
      const doc = withJourney(generate({ style, ver: 2, seed, params }));
      const segs = buildColliders(doc);
      let roomy = 0;
      for (const id of doc.journey) {
        const a = doc.anchors[id];
        const vp = anchorViewpoint(doc, id, segs)!;
        const eye: [number, number] = [vp.eye[0], vp.eye[2]];
        const target: [number, number] = [a.pos[0], a.pos[2]];
        expect(pointInPolygon(eye, doc.rooms[a.room!].polygon)).toBe(true);
        expect(clearView(eye, target, doc.levels[a.level].elevation, segs)).toBe(true);
        if (Math.hypot(eye[0] - target[0], eye[1] - target[1]) >= 1.0) roomy++;
      }
      // Nearly every locus is seen from a comfortable distance, not from on top of it.
      expect(roomy).toBeGreaterThanOrEqual(Math.floor(doc.journey.length * 0.9));
    },
  );

  it('routes pass straight through doorways', () => {
    const doc = withJourney(generate({ style: 'family', ver: 2, seed: 'route', params: { plan: 'colonial', floors: '1' } }));
    const [a, b] = [doc.journey[0], doc.journey[doc.journey.length - 1]];
    const route = tourRoute(doc, a, b);
    expect(route.length).toBeGreaterThanOrEqual(3);
    expect(route.length % 3).toBe(0); // one floor, so every hop is before / door / after
  });
});
