import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { useStore } from './editor/store';
import { decodeShare, readHashCode } from './share/codec';
import { generate } from './gen/registry';
import { lastOpened, loadFromLibrary, newLibraryId, saveToLibrary } from './library/storage';
import { deleteSelection, duplicateSelection, isMovable, translateSelection, type Sel } from './editor/commands';
import { pickInRect } from './editor/pick';
import { Building } from './scene/Building';
import { SiteView } from './scene/SiteView';
import { Anchors } from './scene/Anchors';
import { BuildLayer } from './scene/BuildLayer';
import { Cameras } from './scene/Cameras';
import { LevelSwitcher, SidePanel, TOOL_KEYS, Toolbar } from './ui/Panels';
import { HelpDialog, LibraryDialog, NewPalaceDialog, ShareDialog } from './ui/Dialogs';
import { AnchorCard, ExploreControls, SheetToggle, StatusBar, Toast, TopBar, TourControls, WalkOverlay } from './ui/Overlays';
import { useBounds } from './scene/hooks';

const FIRST_PALACE = { style: 'prairie' as const, ver: 1, seed: 'bear-run', params: { variant: 'fallingwater' } };

async function openFromHash(): Promise<boolean> {
  const code = readHashCode();
  if (!code) return false;
  const { load, toast } = useStore.getState();
  try {
    const doc = await decodeShare(code);
    load(doc, null);
    toast(`Opened “${doc.meta.name}” from a link. Edit anything to keep a copy.`);
    return true;
  } catch (e) {
    console.error(e);
    toast('That palace link could not be read');
    return false;
  }
}

async function boot() {
  if (await openFromHash()) return;
  const last = lastOpened();
  if (last) {
    const doc = await loadFromLibrary(last);
    if (doc) { useStore.getState().load(doc, last); return; }
  }
  useStore.getState().load(generate(FIRST_PALACE), null);
  useStore.getState().setUi({ dialog: 'help' });
}

/** Save edits to the local library, debounced. A palace opened from a link is saved on first edit. */
function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return useStore.subscribe((s, prev) => {
      if (s.rev === prev.rev) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const st = useStore.getState();
        const id = st.libraryId ?? newLibraryId();
        if (!st.libraryId) st.setLibraryId(id);
        saveToLibrary(id, st.doc).then((ok) => { if (!ok) st.toast('Browser storage is full — download a .palace file to keep this'); });
      }, 900);
    });
  }, []);
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select') || st.ui.dialog) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); return; }
      if (st.ui.mode === 'build') {
        const multi = st.ui.multi;
        if (mod && e.key.toLowerCase() === 'd' && multi.length) {
          e.preventDefault();
          let copies: Sel[] = [];
          st.commit('Duplicate', (d) => { copies = duplicateSelection(d, multi, 0.5, 0.5); });
          st.setUi({ selection: copies.at(-1) ?? null, multi: copies });
          return;
        }
        if (mod && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          const all = pickInRect(st.doc, st.ui.activeLevel, [-1e6, -1e6], [1e6, 1e6]);
          st.setUi({ selection: all.at(-1) ?? null, multi: all });
          return;
        }
        const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (arrows[e.key] && multi.some((m) => isMovable(m.kind))) {
          e.preventDefault();
          const step = e.shiftKey ? 0.5 : st.ui.grid;
          const [ax, az] = arrows[e.key];
          st.commit('Nudge', (d) => translateSelection(d, multi.filter((m) => isMovable(m.kind)), ax * step, az * step));
          return;
        }
      }
      if (mod) return;
      if (st.ui.mode === 'walk' || st.ui.mode === 'tour') return;
      const k = e.key.toLowerCase();
      if (k === 'b') st.setUi({ mode: 'build' });
      else if (k === 'e') st.setUi({ mode: 'explore' });
      else if (k === 't' && st.doc.journey.length) st.setUi({ mode: 'tour', tourIndex: 0 });
      else if (st.ui.mode === 'build' && TOOL_KEYS[k]) st.setUi({ tool: TOOL_KEYS[k] });
      else if (k === 'w' && st.ui.mode === 'explore') st.setUi({ mode: 'walk' });
      else if ((e.key === 'Delete' || e.key === 'Backspace') && st.ui.multi.length) {
        const multi = st.ui.multi;
        st.commit('Delete', (d) => deleteSelection(d, multi));
        st.setUi({ selection: null });
      } else if (e.key === 'Escape') st.setUi({ selection: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Lights() {
  const b = useBounds();
  const r = Math.max(30, b.size * 1.2);
  return (
    <>
      <hemisphereLight args={['#dfeaf2', '#7d7259', 0.9]} />
      <ambientLight intensity={0.35} color="#fff3e0" />
      <directionalLight
        position={[b.cx + r * 0.6, r, b.cz + r * 0.4]}
        intensity={2.1}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-r}
        shadow-camera-right={r}
        shadow-camera-top={r}
        shadow-camera-bottom={-r}
        shadow-camera-far={r * 4}
        shadow-bias={-0.0004}
      >
        <object3D attach="target" position={[b.cx, 0, b.cz]} />
      </directionalLight>
    </>
  );
}

export default function App() {
  const mode = useStore((s) => s.ui.mode);
  const dialog = useStore((s) => s.ui.dialog);
  const loadId = useStore((s) => s.loadId);
  useAutosave();
  useHotkeys();
  useEffect(() => {
    boot();
    const onHash = () => { openFromHash(); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <div className={`app mode-${mode}`}>
      <TopBar />
      <main className="stage">
        <Canvas shadows dpr={[1, 2]} gl={{ antialias: true }} onPointerMissed={() => mode === 'explore' && useStore.getState().setUi({ openAnchor: null })}>
          <color attach="background" args={['#e9eef0']} />
          <fog attach="fog" args={['#e3e9ec', 120, 600]} />
          <Sky distance={4500} sunPosition={[80, 60, 40]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.8} />
          <Lights />
          <SiteView />
          <Building />
          <Anchors />
          {mode === 'build' && <BuildLayer />}
          <Cameras key={`${mode}-${loadId}`} />
        </Canvas>
        {mode === 'build' && <Toolbar />}
        {mode !== 'walk' && mode !== 'tour' && <LevelSwitcher />}
        {(mode === 'build' || mode === 'explore') && <SidePanel />}
        <AnchorCard />
        <TourControls />
        <WalkOverlay />
        <ExploreControls />
        <SheetToggle />
        <StatusBar />
      </main>
      {dialog === 'new' && <NewPalaceDialog />}
      {dialog === 'share' && <ShareDialog />}
      {dialog === 'library' && <LibraryDialog />}
      {dialog === 'help' && <HelpDialog />}
      <Toast />
    </div>
  );
}
