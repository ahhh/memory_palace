import { useMemo, useState } from 'react';
import type { CollectionKey, Id, RoomType } from '../model/schema';
import { useStore, type Tool } from '../editor/store';
import { MATERIALS } from '../model/defaults';
import { CATALOG, CATALOG_GROUPS } from '../catalog/furniture';
import { levelsSorted, wallLength } from '../model/queries';
import { addAnchor, addLevelAbove, copyOutline, deleteEntity, openingFits, reorderJourney } from '../editor/commands';
import { suggestJourney } from '../journey/suggest';
import { q, deg } from '../model/units';

const TOOLS: { id: Tool; label: string; key: string; icon: string; hint: string }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: '↖', hint: 'Click to select, drag furniture and anchors to move' },
  { id: 'room', label: 'Room', key: 'M', icon: '▭', hint: 'Drag a rectangle to build four walls and a floor' },
  { id: 'wall', label: 'Wall', key: 'L', icon: '╱', hint: 'Click to start, click to place; double-click or Esc to stop. Alt = no snap' },
  { id: 'door', label: 'Door', key: 'D', icon: '🚪', hint: 'Hover a wall and click to add a door' },
  { id: 'window', label: 'Window', key: 'N', icon: '🪟', hint: 'Hover a wall and click to add a window' },
  { id: 'arch', label: 'Arch', key: 'H', icon: '⌒', hint: 'Wide open passage between rooms' },
  { id: 'furniture', label: 'Furnish', key: 'F', icon: '🛋', hint: 'Pick an item, click to place. R rotates, Shift = ignore walls' },
  { id: 'anchor', label: 'Anchor', key: 'A', icon: '✦', hint: 'Click a spot or a piece of furniture to place a memory anchor' },
  { id: 'erase', label: 'Erase', key: 'X', icon: '⌫', hint: 'Click anything to delete it' },
];
export const TOOL_KEYS: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]));

export function Toolbar() {
  const tool = useStore((s) => s.ui.tool);
  const setUi = useStore((s) => s.setUi);
  const cat = useStore((s) => s.ui.furnitureCat);
  const wallMaterial = useStore((s) => s.ui.wallMaterial);
  const snap = useStore((s) => s.ui.snap);
  const showLabels = useStore((s) => s.ui.showLabels);
  const [group, setGroup] = useState(CATALOG[cat]?.group ?? CATALOG_GROUPS[0]);
  const hint = TOOLS.find((t) => t.id === tool)?.hint;
  return (
    <div className="toolbar panel">
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tool${tool === t.id ? ' on' : ''}`} onClick={() => setUi({ tool: t.id })} title={`${t.label} (${t.key})`}>
            <span className="ico">{t.icon}</span>
            <span className="lbl">{t.label}</span>
          </button>
        ))}
      </div>
      <p className="hint">{hint}</p>
      {(tool === 'wall' || tool === 'room') && (
        <label className="field">
          <span>Wall finish</span>
          <select value={wallMaterial} onChange={(e) => setUi({ wallMaterial: e.target.value })}>
            {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </label>
      )}
      {tool === 'furniture' && (
        <div className="catalog">
          <div className="chips">
            {CATALOG_GROUPS.map((g) => <button key={g} className={`chip${g === group ? ' on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}
          </div>
          <div className="items">
            {Object.values(CATALOG).filter((c) => c.group === group).map((c) => (
              <button key={c.id} className={`item${cat === c.id ? ' on' : ''}`} onClick={() => setUi({ furnitureCat: c.id })}>
                {c.label}
                <small>{(c.dims[0] / 100).toFixed(1)}×{(c.dims[1] / 100).toFixed(1)} m</small>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="toggles">
        <label><input type="checkbox" checked={snap} onChange={(e) => setUi({ snap: e.target.checked })} /> Snap</label>
        <label><input type="checkbox" checked={showLabels} onChange={(e) => setUi({ showLabels: e.target.checked })} /> Labels</label>
      </div>
    </div>
  );
}

export function LevelSwitcher() {
  const doc = useStore((s) => s.doc);
  const active = useStore((s) => s.ui.activeLevel);
  const mode = useStore((s) => s.ui.mode);
  const wallView = useStore((s) => s.ui.wallView);
  const showRoof = useStore((s) => s.ui.showRoof);
  const setUi = useStore((s) => s.setUi);
  const commit = useStore((s) => s.commit);
  const levels = levelsSorted(doc).slice().reverse();
  return (
    <div className="levels panel">
      <div className="levels-title">Floors</div>
      {levels.map((l) => (
        <button key={l.id} className={`level${l.id === active ? ' on' : ''}`} onClick={() => setUi({ activeLevel: l.id, selection: { kind: 'levels', id: l.id } })}>
          <b>{l.index + 1}</b> {l.name}
        </button>
      ))}
      {mode === 'build' && (
        <button className="level add" onClick={() => {
          let id = '';
          const from = active;
          commit('Add floor', (d) => { id = addLevelAbove(d); copyOutline(d, from, id); });
          setUi({ activeLevel: id });
        }}>+ Add floor</button>
      )}
      {mode === 'explore' && (
        <div className="wallview">
          {(['up', 'cutaway', 'down'] as const).map((v) => (
            <button key={v} className={`chip${wallView === v ? ' on' : ''}`} onClick={() => setUi({ wallView: v })}>
              {v === 'up' ? 'Walls up' : v === 'cutaway' ? 'Cutaway' : 'Walls down'}
            </button>
          ))}
          <label className="roof-toggle"><input type="checkbox" checked={showRoof} onChange={(e) => setUi({ showRoof: e.target.checked })} /> Roof</label>
        </div>
      )}
    </div>
  );
}

const ROOM_TYPES: RoomType[] = ['living', 'kitchen', 'dining', 'bedroom', 'bath', 'hall', 'office', 'library', 'salon', 'music', 'gallery', 'ballroom', 'garage', 'laundry', 'closet', 'other'];
const KIND_LABEL: Partial<Record<CollectionKey, string>> = {
  walls: 'Wall', openings: 'Opening', rooms: 'Room', furniture: 'Furniture', anchors: 'Memory anchor', stairs: 'Stair',
  masses: 'Masonry', slabs: 'Terrace / slab', levels: 'Floor', roofs: 'Roof',
};

function Num({ label, value, step = 0.05, min, max, onChange, unit = 'm' }: { label: string; value: number; step?: number; min?: number; max?: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="num"><input type="number" value={value} step={step} min={min} max={max} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} />{unit}</span>
    </label>
  );
}

export function Inspector() {
  const sel = useStore((s) => s.ui.selection);
  const doc = useStore((s) => s.doc);
  const commit = useStore((s) => s.commit);
  const setUi = useStore((s) => s.setUi);
  if (!sel) {
    return (
      <div className="inspector empty">
        <p>Select something to edit it.</p>
        <p className="muted">In Build mode use <b>Select</b> (V), or place a <b>Memory anchor</b> (A) on any piece of furniture.</p>
      </div>
    );
  }
  const del = () => { commit('Delete', (d) => deleteEntity(d, sel.kind, sel.id)); setUi({ selection: null }); };
  const header = (
    <div className="insp-head">
      <h3>{KIND_LABEL[sel.kind] ?? sel.kind}</h3>
      {sel.kind !== 'levels' || Object.keys(doc.levels).length > 1 ? <button className="danger small" onClick={del}>Delete</button> : null}
    </div>
  );
  switch (sel.kind) {
    case 'rooms': {
      const r = doc.rooms[sel.id];
      if (!r) return null;
      return (
        <div className="inspector">{header}
          <label className="field"><span>Name</span><input value={r.label} onChange={(e) => commit('Rename', (d) => { d.rooms[sel.id].label = e.target.value; })} /></label>
          <label className="field"><span>Type</span>
            <select value={r.type} onChange={(e) => commit('Type', (d) => { d.rooms[sel.id].type = e.target.value as RoomType; })}>
              {ROOM_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field"><span>Floor</span>
            <select value={r.floor} onChange={(e) => commit('Floor', (d) => { d.rooms[sel.id].floor = e.target.value; })}>
              {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </label>
        </div>
      );
    }
    case 'walls': {
      const w = doc.walls[sel.id];
      if (!w) return null;
      return (
        <div className="inspector">{header}
          <p className="muted">Length {wallLength(w).toFixed(2)} m</p>
          <Num label="Thickness" value={w.thickness} step={0.01} min={0.05} max={1} onChange={(v) => commit('Wall', (d) => { d.walls[sel.id].thickness = q(v); })} />
          <Num label="Height" value={w.height} step={0.1} min={0.3} max={12} onChange={(v) => commit('Wall', (d) => { d.walls[sel.id].height = q(v); })} />
          <label className="field"><span>Finish</span>
            <select value={w.material} onChange={(e) => commit('Wall', (d) => { d.walls[sel.id].material = e.target.value; })}>
              {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={w.exterior} onChange={(e) => commit('Wall', (d) => { d.walls[sel.id].exterior = e.target.checked; })} /> Exterior wall</label>
        </div>
      );
    }
    case 'openings': {
      const o = doc.openings[sel.id];
      if (!o) return null;
      const w = doc.walls[o.wall];
      const set = (patch: Partial<typeof o>) => commit('Opening', (d) => {
        const next = { ...d.openings[sel.id], ...patch };
        if (w && openingFits(d, d.walls[o.wall], next.offset, next.width, sel.id)) Object.assign(d.openings[sel.id], patch);
      });
      return (
        <div className="inspector">{header}
          <label className="field"><span>Kind</span>
            <select value={o.kind} onChange={(e) => set({ kind: e.target.value as typeof o.kind })}>
              <option value="door">Door</option><option value="window">Window</option><option value="arch">Arch</option>
            </select>
          </label>
          <Num label="Position" value={o.offset} step={0.05} onChange={(v) => set({ offset: q(v) })} />
          <Num label="Width" value={o.width} step={0.05} min={0.3} onChange={(v) => set({ width: q(v) })} />
          <Num label="Height" value={o.height} step={0.05} min={0.3} onChange={(v) => set({ height: q(v) })} />
          <Num label="Sill" value={o.sill} step={0.05} min={0} onChange={(v) => set({ sill: q(v) })} />
        </div>
      );
    }
    case 'furniture': {
      const f = doc.furniture[sel.id];
      if (!f) return null;
      return (
        <div className="inspector">{header}
          <p><b>{CATALOG[f.cat]?.label ?? f.cat}</b></p>
          <div className="row">
            <button onClick={() => commit('Rotate', (d) => { d.furniture[sel.id].rot = deg(f.rot - 90); })}>⟲ 90°</button>
            <button onClick={() => commit('Rotate', (d) => { d.furniture[sel.id].rot = deg(f.rot + 90); })}>⟳ 90°</button>
            <button onClick={() => commit('Rotate', (d) => { d.furniture[sel.id].rot = deg(f.rot + 15); })}>+15°</button>
          </div>
          <button className="wide" onClick={() => {
            const item = CATALOG[f.cat];
            const lv = doc.levels[f.level];
            const h = Math.min((item?.dims[2] ?? 80) / 100 + 0.35, (lv?.height ?? 3) - 0.3);
            let id = '';
            commit('Anchor', (d) => { id = addAnchor(d, f.level, [f.pos[0], h, f.pos[1]], `${item?.label ?? 'Locus'}`); });
            setUi({ selection: { kind: 'anchors', id } });
          }}>✦ Anchor a memory here</button>
        </div>
      );
    }
    case 'anchors':
      return <AnchorEditor id={sel.id} header={header} />;
    case 'levels': {
      const l = doc.levels[sel.id];
      if (!l) return null;
      return (
        <div className="inspector">{header}
          <label className="field"><span>Name</span><input value={l.name} onChange={(e) => commit('Floor', (d) => { d.levels[sel.id].name = e.target.value; })} /></label>
          <Num label="Ceiling height" value={l.height} step={0.1} min={2} max={10} onChange={(v) => commit('Floor', (d) => { d.levels[sel.id].height = q(v); })} />
          <Num label="Elevation" value={l.elevation} step={0.1} onChange={(v) => commit('Floor', (d) => { d.levels[sel.id].elevation = q(v); })} />
        </div>
      );
    }
    default:
      return <div className="inspector">{header}<p className="muted">This element is part of the generated structure.</p></div>;
  }
}

function AnchorEditor({ id, header }: { id: Id; header: React.ReactNode }) {
  const a = useStore((s) => s.doc.anchors[id]);
  const journey = useStore((s) => s.doc.journey);
  const rooms = useStore((s) => s.doc.rooms);
  const commit = useStore((s) => s.commit);
  if (!a) return null;
  const idx = journey.indexOf(id);
  return (
    <div className="inspector">{header}
      <p className="muted">Locus {idx + 1} of {journey.length}{a.room && rooms[a.room] ? ` · ${rooms[a.room].label}` : ''}</p>
      <label className="field"><span>Title</span><input value={a.title} onChange={(e) => commit('Anchor', (d) => { d.anchors[id].title = e.target.value; })} /></label>
      <label className="field col"><span>The idea to remember</span>
        <textarea rows={6} value={a.note} placeholder="Picture something vivid and strange here…" onChange={(e) => commit('Anchor', (d) => { d.anchors[id].note = e.target.value; })} />
      </label>
      <Num label="Height" value={a.pos[1]} step={0.1} min={0} max={10} onChange={(v) => commit('Anchor', (d) => { d.anchors[id].pos[1] = q(v); })} />
      <Num label="Facing" value={a.facing} step={15} unit="°" onChange={(v) => commit('Anchor', (d) => { d.anchors[id].facing = deg(v); })} />
    </div>
  );
}

export function JourneyPanel() {
  const doc = useStore((s) => s.doc);
  const sel = useStore((s) => s.ui.selection);
  const commit = useStore((s) => s.commit);
  const setUi = useStore((s) => s.setUi);
  const toast = useStore((s) => s.toast);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const items = useMemo(() => doc.journey.map((id) => doc.anchors[id]).filter(Boolean), [doc.journey, doc.anchors]);
  const suggest = (replace: boolean) => {
    const s = suggestJourney(doc);
    if (!s.length) { toast('No rooms with doors to walk through yet'); return; }
    commit('Suggest journey', (d) => {
      if (replace) for (const id of [...d.journey]) deleteEntity(d, 'anchors', id);
      for (const a of s) {
        const id = addAnchor(d, a.level, a.pos, a.title, '', a.facing);
        d.anchors[id].room = a.room;
      }
    });
    toast(`${s.length} loci placed along a walk through the palace`);
  };
  return (
    <div className="journey">
      <div className="journey-actions">
        <button onClick={() => suggest(items.length > 0)} title="Walk the palace from the front door, always turning right, placing loci on memorable furniture">
          ✦ {items.length ? 'Re-suggest route' : 'Suggest a journey'}
        </button>
        <button className="primary" disabled={!items.length} onClick={() => setUi({ mode: 'tour', tourIndex: 0, openAnchor: null })}>▶ Tour</button>
      </div>
      {!items.length && (
        <p className="muted">A journey is an ordered route of memory anchors (loci). Place anchors with the Anchor tool, or let the palace suggest a route, then attach an idea to each stop.</p>
      )}
      <ol className="loci">
        {items.map((a, i) => (
          <li key={a.id}
            draggable
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragFrom !== null && dragFrom !== i) commit('Reorder', (d) => reorderJourney(d, dragFrom, i)); setDragFrom(null); }}
            className={sel?.id === a.id ? 'on' : ''}
            onClick={() => setUi({ selection: { kind: 'anchors', id: a.id }, activeLevel: a.level })}
          >
            <span className="n">{i + 1}</span>
            <span className="t">
              <b>{a.title || 'Untitled'}</b>
              <small>{a.note ? a.note.slice(0, 70) : <i>no idea attached yet</i>}</small>
            </span>
            <button className="go" title="Tour from here" onClick={(e) => { e.stopPropagation(); setUi({ mode: 'tour', tourIndex: i }); }}>▶</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SidePanel() {
  const [tab, setTab] = useState<'journey' | 'inspect'>('journey');
  const sel = useStore((s) => s.ui.selection);
  const shown = sel && tab === 'journey' && sel.kind !== 'anchors' ? 'inspect' : tab;
  return (
    <div className="side panel">
      <div className="tabs">
        <button className={shown === 'journey' ? 'on' : ''} onClick={() => { setTab('journey'); useStore.getState().setUi({ selection: null }); }}>Journey</button>
        <button className={shown === 'inspect' ? 'on' : ''} onClick={() => setTab('inspect')}>Inspector</button>
      </div>
      {shown === 'journey' ? <><JourneyPanel />{sel?.kind === 'anchors' && <Inspector />}</> : <Inspector />}
    </div>
  );
}
