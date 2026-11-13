import { useEffect, useState } from 'react';
import { useStore, type Mode } from '../editor/store';
import { camBus, isTouchDevice } from '../scene/bus';

const MODES: { id: Mode; label: string; key: string }[] = [
  { id: 'build', label: 'Build', key: 'B' },
  { id: 'explore', label: 'Explore', key: 'E' },
  { id: 'walk', label: 'Walk', key: 'W' },
  { id: 'tour', label: 'Tour', key: 'T' },
];

export function TopBar() {
  const name = useStore((s) => s.doc.meta.name);
  const style = useStore((s) => s.doc.meta.style);
  const mode = useStore((s) => s.ui.mode);
  const setUi = useStore((s) => s.setUi);
  const commit = useStore((s) => s.commit);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const libraryId = useStore((s) => s.libraryId);
  const journeyLen = useStore((s) => s.doc.journey.length);
  const [menu, setMenu] = useState(false);
  const pick = (d: 'new' | 'library' | 'help') => { setMenu(false); setUi({ dialog: d }); };
  return (
    <header className="topbar">
      <div className="brand" title="Memory Palace">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden><path d="M4 13 16 5l12 8v2H4z" fill="currentColor" /><path d="M7 16h3v9H7zm7.5 0h3v9h-3zM22 16h3v9h-3zM4 26h24v2H4z" fill="currentColor" /></svg>
        <span>Memory Palace</span>
      </div>
      <input className="name" value={name} onChange={(e) => commit('Rename', (d) => { d.meta.name = e.target.value; })} aria-label="Palace name" />
      <span className="style-tag">{style}{libraryId ? '' : ' · not saved'}</span>
      <nav className="modes" aria-label="Mode">
        {MODES.map((m) => (
          <button key={m.id} className={mode === m.id ? 'on' : ''} disabled={m.id === 'tour' && !journeyLen}
            onClick={() => setUi({ mode: m.id, openAnchor: null, tourIndex: m.id === 'tour' ? 0 : useStore.getState().ui.tourIndex })}
            title={`${m.label} (${m.key})`}>{m.label}</button>
        ))}
      </nav>
      <div className="actions">
        <button className="desk" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button className="desk" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
        <button className="desk" onClick={() => setUi({ dialog: 'new' })}>New</button>
        <button className="desk" onClick={() => setUi({ dialog: 'library' })}>Library</button>
        <button className="primary" onClick={() => setUi({ dialog: 'share' })}>Share</button>
        <button className="desk" onClick={() => setUi({ dialog: 'help' })} title="Help">?</button>
        <button className="more" aria-label="More" onClick={() => setMenu(!menu)}>⋯</button>
        {menu && (
          <div className="menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => pick('new')}>New palace</button>
            <button onClick={() => pick('library')}>Library</button>
            <button onClick={() => { setMenu(false); undo(); }} disabled={!canUndo}>Undo</button>
            <button onClick={() => { setMenu(false); redo(); }} disabled={!canRedo}>Redo</button>
            <button onClick={() => pick('help')}>Help</button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Card for the current/nearby anchor in explore, walk and tour modes. */
export function AnchorCard() {
  const mode = useStore((s) => s.ui.mode);
  const openAnchor = useStore((s) => s.ui.openAnchor);
  const tourIndex = useStore((s) => s.ui.tourIndex);
  const journey = useStore((s) => s.doc.journey);
  const anchors = useStore((s) => s.doc.anchors);
  const rooms = useStore((s) => s.doc.rooms);
  const recall = useStore((s) => s.ui.recall);
  const setUi = useStore((s) => s.setUi);
  const commit = useStore((s) => s.commit);
  const [revealed, setRevealed] = useState(false);
  const id = mode === 'tour' ? journey[tourIndex] : openAnchor;
  useEffect(() => setRevealed(false), [id]);
  if (!id || mode === 'build') return null;
  const a = anchors[id];
  if (!a) return null;
  const n = journey.indexOf(id) + 1;
  const hide = recall && !revealed;
  return (
    <div className={`anchor-card${mode === 'tour' ? ' tour' : ''}`}>
      <div className="ac-head">
        <span className="ac-n">{n || '•'}<small>/{journey.length}</small></span>
        <span className="ac-room">{a.room && rooms[a.room]?.label}</span>
        {mode === 'explore' && <button className="x" onClick={() => setUi({ openAnchor: null })}>×</button>}
      </div>
      {mode === 'tour' ? (
        <input className="ac-title" value={a.title} onChange={(e) => commit('Anchor', (d) => { d.anchors[id].title = e.target.value; })} />
      ) : <h3>{a.title}</h3>}
      {hide ? (
        <button className="reveal" onClick={() => setRevealed(true)}>What was here? <b>Reveal</b></button>
      ) : mode === 'tour' ? (
        <textarea className="ac-note" rows={3} value={a.note} placeholder="Attach an idea to this place…" onChange={(e) => commit('Anchor', (d) => { d.anchors[id].note = e.target.value; })} />
      ) : (
        <p className="ac-note-ro">{a.note || <i>No idea attached yet.</i>}</p>
      )}
    </div>
  );
}

export function TourControls() {
  const mode = useStore((s) => s.ui.mode);
  const idx = useStore((s) => s.ui.tourIndex);
  const len = useStore((s) => s.doc.journey.length);
  const recall = useStore((s) => s.ui.recall);
  const setUi = useStore((s) => s.setUi);
  useEffect(() => {
    if (mode !== 'tour') return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea')) return;
      const i = useStore.getState().ui.tourIndex;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setUi({ tourIndex: Math.min(len - 1, i + 1) }); }
      if (e.key === 'ArrowLeft') setUi({ tourIndex: Math.max(0, i - 1) });
      if (e.key === 'Escape') setUi({ mode: 'explore' });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [mode, len, setUi]);
  if (mode !== 'tour') return null;
  return (
    <div className="tour-controls panel">
      <button onClick={() => setUi({ tourIndex: Math.max(0, idx - 1) })} disabled={idx === 0}>← Prev</button>
      <span className="progress"><span style={{ width: `${len ? ((idx + 1) / len) * 100 : 0}%` }} /></span>
      <button className="primary" onClick={() => setUi({ tourIndex: Math.min(len - 1, idx + 1) })} disabled={idx >= len - 1}>Next →</button>
      <label className="recall"><input type="checkbox" checked={recall} onChange={(e) => setUi({ recall: e.target.checked })} /> Recall mode</label>
      <button onClick={() => setUi({ mode: 'explore' })}>Exit</button>
    </div>
  );
}

export function WalkOverlay() {
  const mode = useStore((s) => s.ui.mode);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const f = () => setLocked(!!document.pointerLockElement);
    document.addEventListener('pointerlockchange', f);
    return () => document.removeEventListener('pointerlockchange', f);
  }, []);
  const [touch] = useState(isTouchDevice);
  if (mode !== 'walk') return null;
  if (touch) {
    return (
      <div className="walk-pad">
        <p className="pad-hint">Tap the floor to walk there · swipe to look</p>
        <div className="pad-row">
          <button aria-label="Turn left" onClick={() => camBus.emit({ type: 'turn', deg: 45 })}>↶</button>
          <button aria-label="Step forward" className="primary" onClick={() => camBus.emit({ type: 'step', dist: 1.5 })}>▲</button>
          <button aria-label="Turn right" onClick={() => camBus.emit({ type: 'turn', deg: -45 })}>↷</button>
        </div>
        <div className="pad-row">
          <button aria-label="Turn around" onClick={() => camBus.emit({ type: 'turn', deg: 180 })}>⟲</button>
          <button aria-label="Step back" onClick={() => camBus.emit({ type: 'step', dist: -1 })}>▼</button>
          <button aria-label="Exit walk" onClick={() => useStore.getState().setUi({ mode: 'explore' })}>✕</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {locked ? <div className="crosshair" /> : (
        <div className="walk-start">
          <button id="walk-start" className="primary big">Click to walk</button>
          <p>WASD or arrows to move · mouse to look · Shift to hurry · Esc to release</p>
          <p className="muted">Walk up to a glowing anchor to read what is kept there.</p>
        </div>
      )}
    </>
  );
}

/** Tap-only camera buttons for Explore (also handy with a mouse). */
export function ExploreControls() {
  const mode = useStore((s) => s.ui.mode);
  if (mode !== 'explore') return null;
  const o = (e: Parameters<typeof camBus.emit>[0]) => () => camBus.emit(e);
  return (
    <div className="cam-pad panel" aria-label="Camera">
      <button aria-label="Rotate left" onClick={o({ type: 'orbit', dTheta: -Math.PI / 6 })}>⟲</button>
      <button aria-label="Tilt up" onClick={o({ type: 'orbit', dPhi: -0.2 })}>▲</button>
      <button aria-label="Rotate right" onClick={o({ type: 'orbit', dTheta: Math.PI / 6 })}>⟳</button>
      <button aria-label="Zoom in" onClick={o({ type: 'orbit', zoom: 0.7 })}>＋</button>
      <button aria-label="Tilt down" onClick={o({ type: 'orbit', dPhi: 0.2 })}>▼</button>
      <button aria-label="Zoom out" onClick={o({ type: 'orbit', zoom: 1.45 })}>－</button>
      <button className="home" aria-label="Reset view" onClick={o({ type: 'orbit', reset: true })}>⌂ Reset view</button>
      {!isTouchDevice() && <p className="keys-hint">←↑→↓ pan · Shift+arrows orbit · Q/E turn · +/− zoom · Home reset</p>}
    </div>
  );
}

/** Phone-only button that slides the journey/inspector panel up as a sheet. */
export function SheetToggle() {
  const mode = useStore((s) => s.ui.mode);
  const open = useStore((s) => s.ui.sheet);
  const n = useStore((s) => s.doc.journey.length);
  const setUi = useStore((s) => s.setUi);
  if (mode !== 'build' && mode !== 'explore') return null;
  return <button className="sheet-toggle" onClick={() => setUi({ sheet: !open })}>{open ? '✕ Close' : `☰ Journey${n ? ` · ${n}` : ''}`}</button>;
}

export function Toast() {
  const t = useStore((s) => s.ui.toast);
  return t ? <div className="toast" role="status">{t}</div> : null;
}

export function StatusBar() {
  const mode = useStore((s) => s.ui.mode);
  const cursor = useStore((s) => s.ui.cursor);
  if (mode !== 'build' || !cursor) return null;
  return <div className="statusbar">x {cursor[0].toFixed(2)} m · z {cursor[1].toFixed(2)} m</div>;
}
