/** FROZEN (v1). Fresh-doc builder; every length argument is integer centimeters. */
import type {
  CollectionKey, Id, Meta, OpeningKind, PalaceDoc, PlantKind, RoofKind, RoomType, SlabKind, V2,
} from '../../../model/schema';
import { type Rect } from './rect';

const PREFIX: Record<CollectionKey, string> = {
  levels: 'L', walls: 'w', openings: 'o', rooms: 'r', slabs: 's', roofs: 'f', stairs: 't',
  masses: 'm', furniture: 'u', anchors: 'a', rivers: 'v', ponds: 'p', plants: 'g',
};
const M = (cm: number) => Math.round(cm) / 100 + 0; // +0 normalizes -0
const P = (x: number, z: number): V2 => [M(x), M(z)];
export const rectPolyM = (r: Rect): V2[] => [P(r.x0, r.z0), P(r.x1, r.z0), P(r.x1, r.z1), P(r.x0, r.z1)];

export class DocBuilder {
  doc: PalaceDoc;
  constructor(meta: Meta) {
    this.doc = {
      schema: 1, nextId: 1, meta,
      site: { size: [60, 60], ground: 'grass', terrain: { baseY: 0, amp: 0, scale: 20, seed: 1 } },
      levels: {}, walls: {}, openings: {}, rooms: {}, slabs: {}, roofs: {}, stairs: {}, masses: {},
      furniture: {}, anchors: {}, rivers: {}, ponds: {}, plants: {}, journey: [],
    };
  }
  id(kind: CollectionKey): Id {
    return PREFIX[kind] + (this.doc.nextId++).toString(36);
  }
  level(index: number, elevation: number, height: number, name: string): Id {
    const id = this.id('levels');
    this.doc.levels[id] = { id, index, elevation: M(elevation), height: M(height), name };
    return id;
  }
  wall(level: Id, ax: number, az: number, bx: number, bz: number, thickness: number, height: number, exterior: boolean, material: string): Id {
    const id = this.id('walls');
    this.doc.walls[id] = { id, level, a: P(ax, az), b: P(bx, bz), thickness: M(thickness), height: M(height), exterior, material };
    return id;
  }
  opening(wall: Id, kind: OpeningKind, offset: number, width: number, height: number, sill: number): Id {
    const id = this.id('openings');
    this.doc.openings[id] = { id, wall, kind, offset: M(offset), width: M(width), height: M(height), sill: M(sill) };
    return id;
  }
  room(level: Id, r: Rect, label: string, type: RoomType, floor: string, holes?: Rect[]): Id {
    const id = this.id('rooms');
    this.doc.rooms[id] = { id, level, polygon: rectPolyM(r), label, type, floor };
    if (holes && holes.length) this.doc.rooms[id].holes = holes.map(rectPolyM);
    return id;
  }
  slab(level: Id, poly: V2[] | Rect, kind: SlabKind, thickness: number, dy: number, railing: boolean, material: string): Id {
    const id = this.id('slabs');
    const polygon = Array.isArray(poly) ? poly : rectPolyM(poly);
    this.doc.slabs[id] = { id, level, polygon, kind, thickness: M(thickness), dy: M(dy), railing, material };
    return id;
  }
  roof(level: Id, r: Rect, kind: RoofKind, pitch: number, overhang: number, eaveY: number, thickness: number, material: string): Id {
    const id = this.id('roofs');
    this.doc.roofs[id] = {
      id, level, center: P((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2), size: P(r.x1 - r.x0, r.z1 - r.z0),
      kind, pitch, overhang: M(overhang), eaveY: M(eaveY), thickness: M(thickness), material,
    };
    return id;
  }
  stair(level: Id, sx: number, sz: number, dir: number, width: number, run: number, rise: number): Id {
    const id = this.id('stairs');
    this.doc.stairs[id] = { id, level, start: P(sx, sz), dir, width: M(width), run: M(run), rise: M(rise) };
    return id;
  }
  mass(level: Id, cxv: number, czv: number, sx: number, sy: number, sz: number, dy: number, material: string, rot = 0): Id {
    const id = this.id('masses');
    this.doc.masses[id] = { id, level, center: P(cxv, czv), size: [M(sx), M(sy), M(sz)], rot, dy: M(dy), material };
    return id;
  }
  furniture(level: Id, cat: string, x: number, z: number, rot: number, dy?: number): Id {
    const id = this.id('furniture');
    this.doc.furniture[id] = { id, level, cat, pos: P(x, z), rot };
    if (dy) this.doc.furniture[id].dy = M(dy);
    return id;
  }
  river(pts: [number, number, number][], width: number, depth: number): Id {
    const id = this.id('rivers');
    this.doc.rivers[id] = { id, pts: pts.map(([x, y, z]) => [M(x), M(y), M(z)]), width: M(width), depth: M(depth) };
    return id;
  }
  pond(poly: [number, number][], y: number, depth: number, fountain: boolean): Id {
    const id = this.id('ponds');
    this.doc.ponds[id] = { id, polygon: poly.map(([x, z]) => P(x, z)), y: M(y), depth: M(depth), fountain };
    return id;
  }
  plant(kind: PlantKind, x: number, z: number, scale: number): Id {
    const id = this.id('plants');
    this.doc.plants[id] = { id, kind, pos: P(x, z), scale: M(scale) };
    return id;
  }
}
