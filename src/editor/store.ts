import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { CollectionKey, Id, PalaceDoc, V2 } from '../model/schema';
import { emptyDoc } from '../model/defaults';
import { levelsSorted } from '../model/queries';

export type Mode = 'build' | 'explore' | 'walk' | 'tour';
export type Tool = 'select' | 'wall' | 'room' | 'door' | 'window' | 'arch' | 'furniture' | 'anchor' | 'erase';
export type WallView = 'up' | 'cutaway' | 'down';

export interface Selection { kind: CollectionKey; id: Id }

export interface UiState {
  mode: Mode;
  tool: Tool;
  activeLevel: Id;
  selection: Selection | null;
  furnitureCat: string;
  wallMaterial: string;
  snap: boolean;
  grid: number;
  wallView: WallView;
  showRoof: boolean;
  showLabels: boolean;
  showRoute: boolean;
  tourIndex: number;
  recall: boolean;
  /** Which anchor card is open in explore/walk. */
  openAnchor: Id | null;
  /** Cursor in plan coords (build mode). */
  cursor: V2 | null;
  dialog: null | 'new' | 'share' | 'library' | 'help';
  toast: string | null;
}

interface Store {
  doc: PalaceDoc;
  past: PalaceDoc[];
  future: PalaceDoc[];
  /** localStorage library id of the open palace (null = unsaved, e.g. just opened a link). */
  libraryId: string | null;
  /** Bumped by every edit, undo and redo (not by load) — drives autosave. */
  rev: number;
  ui: UiState;
  commit: (label: string, fn: (d: Draft<PalaceDoc>) => void) => void;
  undo: () => void;
  redo: () => void;
  load: (doc: PalaceDoc, libraryId: string | null) => void;
  setUi: (p: Partial<UiState>) => void;
  setLibraryId: (id: string | null) => void;
  toast: (msg: string) => void;
}

const HISTORY = 200;

/** Open on the top floor so Explore shows the whole building (roof included). */
function defaultLevel(doc: PalaceDoc): Id {
  return levelsSorted(doc).at(-1)?.id ?? 'L1';
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>((set, get) => ({
  doc: emptyDoc(),
  past: [],
  future: [],
  libraryId: null,
  rev: 0,
  ui: {
    mode: 'explore', tool: 'select', activeLevel: 'L1', selection: null, furnitureCat: 'sofa', wallMaterial: 'brick',
    snap: true, grid: 0.1, wallView: 'cutaway', showRoof: true, showLabels: true, showRoute: true, tourIndex: 0,
    recall: false, openAnchor: null, cursor: null, dialog: null, toast: null,
  },
  commit: (_label, fn) => {
    const { doc, past } = get();
    const next = produce(doc, fn);
    if (next === doc) return;
    set((s) => ({ doc: next, past: [...past.slice(-HISTORY + 1), doc], future: [], rev: s.rev + 1 }));
  },
  undo: () => {
    const { past, doc, future } = get();
    const prev = past.at(-1);
    if (!prev) return;
    set((s) => ({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], rev: s.rev + 1 }));
    get().setUi({ selection: null });
  },
  redo: () => {
    const { past, doc, future } = get();
    const next = future[0];
    if (!next) return;
    set((s) => ({ doc: next, past: [...past, doc], future: future.slice(1), rev: s.rev + 1 }));
  },
  load: (doc, libraryId) => {
    set({ doc, past: [], future: [], libraryId });
    set((s) => ({ ui: { ...s.ui, activeLevel: defaultLevel(doc), selection: null, tourIndex: 0, openAnchor: null } }));
  },
  setUi: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
  setLibraryId: (id) => set({ libraryId: id }),
  toast: (msg) => {
    set((s) => ({ ui: { ...s.ui, toast: msg } }));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set((s) => ({ ui: { ...s.ui, toast: null } })), 2600);
  },
}));

export const getDoc = () => useStore.getState().doc;
