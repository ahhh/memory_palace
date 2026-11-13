/**
 * Compact, versioned tuple packing of PalaceDoc entities.
 *
 * PACK v1 is FROZEN once deployed: field lists may only gain new trailing optional
 * fields (older payloads simply lack them). Anything else needs a PACK v2 + migration.
 */
import {
  COLLECTIONS, ID_PREFIX, SCHEMA_VERSION, type CollectionKey, type Id, type Meta, type PalaceDoc, type Site,
} from '../model/schema';
import { idFromNum, idNum, sortedIds } from '../model/ids';
import { formatRecipe, parseRecipe } from './recipeString';

type FieldType =
  | 'id' | 'int' | 'cm' | 'str' | 'bool' | 'v2' | 'v3' | 'poly' | 'poly3' | 'polys'
  | `ref:${CollectionKey}`;
interface Field { key: string; type: FieldType; optional: boolean }

const f = (spec: string): Field => {
  const [k, t] = spec.split(':', 2) as [string, string];
  const optional = k.endsWith('?');
  const rest = spec.slice(spec.indexOf(':') + 1);
  return { key: optional ? k.slice(0, -1) : k, type: (t === 'ref' ? rest : t) as FieldType, optional };
};

export const FIELDS: Record<CollectionKey, Field[]> = {
  levels: ['id:id', 'index:int', 'elevation:cm', 'height:cm', 'name:str'].map(f),
  walls: ['id:id', 'level:ref:levels', 'a:v2', 'b:v2', 'thickness:cm', 'height:cm', 'exterior:bool', 'material:str'].map(f),
  openings: ['id:id', 'wall:ref:walls', 'kind:str', 'offset:cm', 'width:cm', 'height:cm', 'sill:cm'].map(f),
  rooms: ['id:id', 'level:ref:levels', 'polygon:poly', 'label:str', 'type:str', 'floor:str', 'holes?:polys'].map(f),
  slabs: ['id:id', 'level:ref:levels', 'polygon:poly', 'kind:str', 'thickness:cm', 'dy:cm', 'railing:bool', 'material:str'].map(f),
  roofs: ['id:id', 'level:ref:levels', 'center:v2', 'size:v2', 'kind:str', 'pitch:int', 'overhang:cm', 'eaveY:cm', 'thickness:cm', 'material:str'].map(f),
  stairs: ['id:id', 'level:ref:levels', 'start:v2', 'dir:int', 'width:cm', 'run:cm', 'rise:cm'].map(f),
  masses: ['id:id', 'level:ref:levels', 'center:v2', 'size:v3', 'rot:int', 'dy:cm', 'material:str'].map(f),
  furniture: ['id:id', 'level:ref:levels', 'cat:str', 'pos:v2', 'rot:int', 'dy?:cm'].map(f),
  anchors: ['id:id', 'level:ref:levels', 'pos:v3', 'facing:int', 'title:str', 'note:str', 'room?:ref:rooms'].map(f),
  rivers: ['id:id', 'pts:poly3', 'width:cm', 'depth:cm'].map(f),
  ponds: ['id:id', 'polygon:poly', 'y:cm', 'depth:cm', 'fountain:bool'].map(f),
  plants: ['id:id', 'kind:str', 'pos:v2', 'scale:cm'].map(f),
};

const cm = (m: number) => Math.round(m * 100);
const m = (c: number) => c / 100;

function packVal(t: FieldType, v: unknown): unknown {
  switch (t) {
    case 'id': return idNum(v as string);
    case 'int': return Math.round(v as number);
    case 'cm': return cm(v as number);
    case 'str': return v as string;
    case 'bool': return v ? 1 : 0;
    case 'v2': case 'v3': return (v as number[]).map(cm);
    case 'poly': case 'poly3': return (v as number[][]).flat().map(cm);
    case 'polys': return (v as number[][][]).map((p) => p.flat().map(cm));
    default: return idNum(v as string); // ref
  }
}

function chunk(flat: number[], n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + n <= flat.length; i += n) out.push(flat.slice(i, i + n).map(m));
  return out;
}

function unpackVal(t: FieldType, v: unknown, kind: CollectionKey): unknown {
  switch (t) {
    case 'id': return idFromNum(kind, v as number);
    case 'int': return v as number;
    case 'cm': return m(v as number);
    case 'str': return String(v);
    case 'bool': return v === 1 || v === true;
    case 'v2': case 'v3': return (v as number[]).map(m);
    case 'poly': return chunk(v as number[], 2);
    case 'poly3': return chunk(v as number[], 3);
    case 'polys': return (v as number[][]).map((p) => chunk(p, 2));
    default: return idFromNum(t.slice(4) as CollectionKey, v as number);
  }
}

export function packEntity(kind: CollectionKey, e: Record<string, unknown>): unknown[] {
  const out = FIELDS[kind].map((fl) => (e[fl.key] === undefined ? null : packVal(fl.type, e[fl.key])));
  while (out.length && out[out.length - 1] === null && FIELDS[kind][out.length - 1].optional) out.pop();
  return out;
}

export function unpackEntity(kind: CollectionKey, t: unknown[]): Record<string, unknown> {
  const e: Record<string, unknown> = {};
  FIELDS[kind].forEach((fl, i) => {
    const v = t[i];
    if (v === null || v === undefined) {
      if (!fl.optional) throw new Error(`Missing ${kind}.${fl.key}`);
      return;
    }
    e[fl.key] = unpackVal(fl.type, v, kind);
  });
  return e;
}

export const packMeta = (meta: Meta) => [meta.name, meta.style, meta.origin ? formatRecipe(meta.origin) : null];
export function unpackMeta(t: unknown[]): Meta {
  const meta: Meta = { name: String(t[0]), style: t[1] as Meta['style'] };
  if (t[2]) meta.origin = parseRecipe(String(t[2]));
  return meta;
}
export const packSite = (s: Site) => [
  ...s.size.map(cm), s.ground, cm(s.terrain.baseY), cm(s.terrain.amp), cm(s.terrain.scale), s.terrain.seed,
];
export function unpackSite(t: unknown[]): Site {
  const n = t as number[];
  return {
    size: [m(n[0]), m(n[1])], ground: String(t[2]),
    terrain: { baseY: m(n[3]), amp: m(n[4]), scale: m(n[5]), seed: n[6] },
  };
}

export function packCollection(kind: CollectionKey, rec: Record<Id, unknown>): unknown[][] {
  return sortedIds(rec).map((id) => packEntity(kind, rec[id] as Record<string, unknown>));
}

/** Full document → JSON-able nested arrays. */
export function packDoc(doc: PalaceDoc): unknown[] {
  return [
    1, // pack version
    doc.nextId,
    packMeta(doc.meta),
    packSite(doc.site),
    COLLECTIONS.map((k) => packCollection(k, doc[k] as Record<Id, unknown>)),
    doc.journey.map(idNum),
  ];
}

export function unpackDoc(t: unknown[]): PalaceDoc {
  if (t[0] !== 1) throw new Error(`Unsupported pack version ${String(t[0])}`);
  const cols = t[4] as unknown[][][];
  const doc = {
    schema: SCHEMA_VERSION,
    nextId: t[1] as number,
    meta: unpackMeta(t[2] as unknown[]),
    site: unpackSite(t[3] as unknown[]),
    journey: (t[5] as number[]).map((n) => idFromNum('anchors', n)),
  } as PalaceDoc;
  COLLECTIONS.forEach((k, i) => {
    const rec: Record<Id, unknown> = {};
    for (const tuple of cols[i] ?? []) {
      const e = unpackEntity(k, tuple);
      rec[e.id as string] = e;
    }
    (doc as unknown as Record<string, unknown>)[k] = rec;
  });
  return doc;
}

export { ID_PREFIX };
