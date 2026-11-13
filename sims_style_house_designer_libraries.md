# Building a Sims-Style House Designer in JavaScript

## Goal

Build a browser-based architectural design app that feels as intuitive and fun as **The Sims Build Mode**, but retains practical value through accurate dimensions, editable components, and useful floor plans.

The core experience should let users **click, drag, snap, rotate, and place** walls, doors, windows, furniture, and other building components with minimal friction.

## Recommended JavaScript Libraries

### 1. Three.js + React Three Fiber — The 3D Building Environment

- **Three.js:** https://threejs.org/
- **React Three Fiber:** https://r3f.docs.pmnd.rs/

Use these as the foundation for the interactive 3D workspace. Three.js handles rendering, geometry, lighting, cameras, and materials. React Three Fiber brings 3D scenes into React and supports mouse/pointer interactions such as clicking, hovering, and selecting objects.

**Why:** Together, they provide the flexibility to build a game-like house editor without needing a full game engine.

### 2. Drei DragControls and TransformControls — Dragging and Editing

- **Drei DragControls:** https://drei.docs.pmnd.rs/gizmos/drag-controls
- **Three.js TransformControls:** https://threejs.org/docs/pages/TransformControls.html

Let users grab and move objects with the mouse, restrict movement to specific axes, and provide familiar move/rotate/scale handles.

**Why:** These controls supply much of the direct-manipulation behavior users expect from a visual editor. They do *not* automatically implement architectural snapping—you add that logic yourself.

### 3. Drei Grid + Transform Snapping — Precise Placement

- **Drei Grid:** https://drei.docs.pmnd.rs/gizmos/grid
- **Three.js TransformControls:** https://threejs.org/docs/pages/TransformControls.html

Show a ground-plane grid and snap object movement or rotation to specific increments. For example, walls might move in 0.1 m or 0.25 m steps.

**Why:** A clear grid and predictable increments make placement feel responsive while preserving useful dimensions. Magnetic wall, corner, and component snapping require a custom snapping layer on top.

### 4. gltfjsx + Poly Haven — A Reusable Component Catalog

- **gltfjsx:** https://github.com/pmndrs/gltfjsx
- **Poly Haven Models:** https://polyhaven.com/models

Import GLB/glTF models representing furniture, cabinets, appliances, and architectural accessories. `gltfjsx` helps turn 3D assets into reusable React components. Poly Haven offers CC0 assets.

**Why:** A browsable catalog of recognizable objects makes the app enjoyable quickly; users can choose an item and place it rather than modeling everything from scratch.

### 5. Konva.js — Optional 2D Editing

- **Konva.js:** https://konvajs.org/
- **React Konva:** https://konvajs.org/docs/react/

Konva provides a 2D canvas for floor plans, guides, labels, and snapping interactions.

**Why:** It's useful when you need an advanced drafting view. **For the first version, keep things simpler** by using an overhead camera in the same Three.js scene, then add a dedicated 2D editor if needed.

### 6. Zustand — Shared Editor State

- **Zustand:** https://zustand.docs.pmnd.rs/

Keep track of the current tool, selected component, walls, dimensions, materials, furniture, and placement state.

**Why:** A lightweight centralized state model ensures different UI controls and scene elements respond consistently to edits.

## Snapping Features to Prioritize

| Feature | How it should feel | Implementation idea |
| --- | --- | --- |
| **Grid snapping** | Objects move in neat increments without requiring precise mouse placement. | Round proposed positions to a configurable grid step (e.g., 0.1 m or 0.25 m). |
| **Magnetic wall snapping** | Wall endpoints connect automatically when dragged near each other. | Search nearby endpoints and align within a configurable distance threshold. |
| **Smart component placement** | A window hovered over a wall automatically aligns with it. | Raycast against candidate wall surfaces, project the placement point onto the wall, and orient the preview. |
| **Furniture alignment** | A sofa approaches a wall and settles into a sensible position. | Use bounding boxes and wall normals to suggest alignment and optional clearance. |
| **Placement previews** | Users see a proposed placement before clicking to confirm. | Render a translucent preview; mark invalid positions clearly. |

**Important:** No single library here ships a complete Sims-style building system. Three.js, React Three Fiber, and Drei provide interaction and rendering primitives. The app needs its own small **snapping and placement engine** to choose nearby attachment points, enforce rules, and preview the result.

## Recommended First Version: One 3D Workspace, Two Camera Modes

Avoid building two independent drawing engines at the start. Instead, keep one Three.js scene and offer two ways to see it:

### Build Mode

- Overhead / orthographic camera
- Grid visible
- Draw and snap walls
- Place doors, windows, and furniture
- Show useful dimensions while editing

### Explore Mode

- Tilted / orbiting 3D camera
- Inspect rooms and materials
- Rotate around the house
- View the design as a dollhouse-like model

**Why:** One shared scene means less duplicated interaction logic and a smoother transition between precise placement and playful exploration.

## Minimal Recommended Stack

Start with only these:

1. **Three.js** — Rendering and spatial geometry.
2. **React Three Fiber** — React-based scene components and pointer events.
3. **Drei** — Camera, dragging, transforms, and grid helpers.
4. **Zustand** — Editor state and building data.

Add **gltfjsx** and a reusable asset catalog when you introduce furniture. Add **Konva** only when you need a dedicated 2D drafting interface.

## The First Interaction to Build

> **Choose Wall → click the starting point → move the mouse → see a snapped wall preview → click to finish.**

Make this interaction quick, predictable, and satisfying. It establishes the core pattern for the rest of the app: **choose a component, preview the placement, snap intelligently, and click to commit**.

## Practical Value Without Losing the Fun

- Store **real-world measurements** separately from visual appearance (meters internally is a sensible default).
- Keep walls, doors, windows, and furniture as **editable data objects**, not just anonymous 3D meshes.
- Make snapping **configurable**, with a way to disable it for fine adjustments.
- Favor **smart defaults** over cluttered CAD menus; reveal precise controls only when useful.
- Treat the generated 3D model as a **design aid**, not an automatically construction-ready plan.

---

**Recommended direction:** Start with Three.js + React Three Fiber + Drei + Zustand, build satisfying wall placement and snapping, then add a simple drag-and-drop component catalog and a second camera mode.
