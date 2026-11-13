import { useEffect, useRef, useState } from 'react';
import type { StyleId } from '../model/schema';
import { useStore } from '../editor/store';
import { LATEST, generate, paramsFor } from '../gen/registry';
import { sanitizeSeed } from '../share/recipeString';
import { decodeShare, encodeShare, shareUrl } from '../share/codec';
import { deleteFromLibrary, listLibrary, loadFromLibrary, newLibraryId, saveToLibrary, type LibraryEntry } from '../library/storage';
import { emptyDoc } from '../model/defaults';

const STYLES: { id: StyleId; name: string; blurb: string }[] = [
  { id: 'condo', name: 'Condo', blurb: 'A compact apartment: entry hall, open kitchen, a balcony. Quick to learn by heart.' },
  { id: 'family', name: 'Family home', blurb: 'Center-hall house, one or two storeys, garage and garden. The classic memory palace.' },
  { id: 'prairie', name: 'Prairie / Wright', blurb: 'Long low horizontals, hearth at the heart, terraces — even a house over a waterfall.' },
  { id: 'mansion', name: 'Mansion / Palace', blurb: 'Symmetric wings, grand hall and gallery, ballroom, fountain court. Room for hundreds of loci.' },
];

const PARAM_LABELS: Record<string, string> = { floors: 'Floors', bedrooms: 'Bedrooms', garage: 'Garage', corner: 'Corner unit', variant: 'Variant', court: 'Fountain court' };
const VALUE_LABELS: Record<string, string> = { '0': 'No', '1': 'Yes', robie: 'Robie (long & low)', fallingwater: 'Fallingwater (over a stream)', usonian: 'Usonian (L around a pond)' };
const binary = new Set(['garage', 'corner', 'court']);

const WORDS_A = ['amber', 'quiet', 'silver', 'velvet', 'hidden', 'golden', 'misty', 'lunar', 'copper', 'ivory', 'cobalt', 'secret', 'wild', 'sunlit'];
const WORDS_B = ['river', 'harbor', 'orchard', 'falcon', 'lantern', 'meadow', 'cedar', 'atlas', 'echo', 'garden', 'comet', 'fern', 'heron', 'quill'];
export const randomSeed = () => `${WORDS_A[Math.floor(Math.random() * WORDS_A.length)]}-${WORDS_B[Math.floor(Math.random() * WORDS_B.length)]}-${Math.floor(Math.random() * 100)}`;

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

export function NewPalaceDialog() {
  const load = useStore((s) => s.load);
  const setUi = useStore((s) => s.setUi);
  const [style, setStyle] = useState<StyleId>('family');
  const [seed, setSeed] = useState(randomSeed());
  const [params, setParams] = useState<Record<string, string>>({});
  const close = () => setUi({ dialog: null });
  const spec = paramsFor(style);
  const create = () => {
    const recipe = { style, ver: LATEST[style]!, seed: sanitizeSeed(seed), params: Object.fromEntries(Object.entries(params).filter(([k, v]) => v && spec[k])) };
    const doc = generate(recipe);
    load(doc, null);
    history.replaceState(null, '', location.pathname + location.search);
    setUi({ dialog: null, mode: 'explore' });
  };
  return (
    <Modal title="New palace" onClose={close}>
      <div className="styles">
        {STYLES.map((s) => (
          <button key={s.id} className={`style-card${style === s.id ? ' on' : ''}`} onClick={() => { setStyle(s.id); setParams({}); }}>
            <b>{s.name}</b><span>{s.blurb}</span>
          </button>
        ))}
      </div>
      <label className="field">
        <span>Seed</span>
        <span className="seed">
          <input value={seed} onChange={(e) => setSeed(e.target.value)} spellCheck={false} />
          <button onClick={() => setSeed(randomSeed())} title="Roll a new seed">🎲</button>
        </span>
      </label>
      <p className="muted small">The same style + seed always builds the same palace, for anyone, forever.</p>
      <div className="params">
        {Object.entries(spec).map(([k, values]) => (
          <label key={k} className="field">
            <span>{PARAM_LABELS[k] ?? k}</span>
            <select value={params[k] ?? ''} onChange={(e) => setParams({ ...params, [k]: e.target.value })}>
              <option value="">Surprise me</option>
              {values.map((v) => <option key={v} value={v}>{binary.has(k) ? VALUE_LABELS[v] : VALUE_LABELS[v] ?? v}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="modal-actions">
        <button onClick={() => { load(emptyDoc('Blank palace'), null); setUi({ dialog: null, mode: 'build', tool: 'room' }); }}>Start from a blank lot</button>
        <button className="primary" onClick={create}>Build it</button>
      </div>
    </Modal>
  );
}

export function ShareDialog() {
  const doc = useStore((s) => s.doc);
  const setUi = useStore((s) => s.setUi);
  const toast = useStore((s) => s.toast);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    encodeShare(doc).then((c) => live && setCode(c)).catch((e) => live && setErr(String(e)));
    return () => { live = false; };
  }, [doc]);
  const url = code ? shareUrl(code) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast('Select the link and copy it'); }
  };
  const download = () => {
    const blob = new Blob([code ?? ''], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.meta.name.replace(/[^\w-]+/g, '_') || 'palace'}.palace`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const kind = code?.startsWith('r1.') ? 'Recipe link: the palace is rebuilt from its seed.'
    : code?.startsWith('e1.') ? 'Recipe + changes: the palace is rebuilt from its seed, then your edits and anchors are applied.'
      : 'Full design: every wall and anchor is packed into the link.';
  return (
    <Modal title="Share this palace" onClose={() => setUi({ dialog: null })}>
      <p className="muted">Everything lives in the link itself: no server, no account. Anyone who opens it gets an identical palace, journey and notes.</p>
      {err && <p className="error">{err}</p>}
      {code ? (
        <>
          <textarea className="share-url" readOnly value={url} rows={4} onFocus={(e) => e.currentTarget.select()} />
          <p className="small">{kind} <b>{url.length.toLocaleString()}</b> characters.
            {url.length > 8000 && <span className="warn"> Some chat apps truncate long links; use the file below instead.</span>}
          </p>
          <div className="modal-actions">
            <button onClick={download}>Download .palace file</button>
            <button className="primary" onClick={copy}>Copy link</button>
          </div>
        </>
      ) : <p>Packing…</p>}
    </Modal>
  );
}

export function LibraryDialog() {
  const setUi = useStore((s) => s.setUi);
  const load = useStore((s) => s.load);
  const libraryId = useStore((s) => s.libraryId);
  const toast = useStore((s) => s.toast);
  const [items, setItems] = useState<LibraryEntry[]>(listLibrary());
  const file = useRef<HTMLInputElement>(null);
  const open = async (id: string) => {
    const doc = await loadFromLibrary(id);
    if (!doc) { toast('Could not open that palace'); return; }
    load(doc, id);
    history.replaceState(null, '', location.pathname + location.search);
    setUi({ dialog: null });
  };
  const importFile = async (f: File) => {
    try {
      const doc = await decodeShare(await f.text());
      const id = newLibraryId();
      await saveToLibrary(id, doc);
      load(doc, id);
      setUi({ dialog: null });
      toast(`Imported ${doc.meta.name}`);
    } catch {
      toast('That file is not a palace');
    }
  };
  return (
    <Modal title="Your palaces" onClose={() => setUi({ dialog: null })}>
      <p className="muted small">Saved only in this browser. Share links to move palaces between devices or friends.</p>
      {!items.length && <p>No saved palaces yet. Anything you edit is saved here automatically.</p>}
      <ul className="library">
        {items.map((e) => (
          <li key={e.id} className={e.id === libraryId ? 'on' : ''}>
            <button className="open" onClick={() => open(e.id)}>
              <b>{e.name}</b>
              <small>{e.style} · {e.anchors} loci · {new Date(e.updatedAt).toLocaleString()}</small>
            </button>
            <button className="danger small" onClick={() => { if (confirm(`Delete “${e.name}” from this browser?`)) { deleteFromLibrary(e.id); setItems(listLibrary()); } }}>Delete</button>
          </li>
        ))}
      </ul>
      <div className="modal-actions">
        <input ref={file} type="file" accept=".palace,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); }} />
        <button onClick={() => file.current?.click()}>Import .palace file</button>
      </div>
    </Modal>
  );
}

export function HelpDialog() {
  const setUi = useStore((s) => s.setUi);
  return (
    <Modal title="How to build a memory palace" onClose={() => setUi({ dialog: null })}>
      <ol className="help">
        <li><b>Build or generate a place you can picture.</b> New → pick a style and a seed. Every seed is a different house; the same seed is always the same house.</li>
        <li><b>Walk a fixed route.</b> Journey → <i>Suggest a journey</i> enters by the front door and keeps turning right, dropping loci on memorable furniture. Drag to reorder.</li>
        <li><b>Anchor ideas.</b> Click a locus and write the idea as a vivid, odd image placed on that spot.</li>
        <li><b>Rehearse.</b> Tour flies you stop to stop (← →). Recall mode hides notes until you reveal them. Walk lets you wander (WASD + mouse).</li>
        <li><b>Share.</b> The link contains the whole palace; friends can open it, add anchors, and send back their own link.</li>
      </ol>
      <h4>Build mode keys</h4>
      <p className="small">V select · M room · L wall · D door · N window · H arch · F furnish · A anchor · X erase · R rotate · Esc cancel · Del delete · ⌘/Ctrl+Z undo · Shift+⌘/Ctrl+Z redo · right-drag pans · wheel zooms · Alt disables snapping</p>
    </Modal>
  );
}
