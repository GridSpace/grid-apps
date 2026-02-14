# AI Agent TL;DR - gs-apps

Quick reference for AI agents working on this project.

## What Is This?

**gs-apps** is a monorepo containing three Grid.Space web applications:

| App           | Purpose                       | Status     | Entry Point        |
| ------------- | ----------------------------- | ---------- | ------------------ |
| **kiri:moto** | Multi-axis CNC/FDM/SLA slicer | Production | `src/main/kiri.js` |
| **mesh:tool** | 3D mesh editor & repair       | Active dev | `src/main/mesh.js` |
| **void:form** | Parametric CAD modeler        | Phase 1    | `src/main/void.js` |

All three share common infrastructure in `src/moto/`, `src/geo/`, `src/load/`, and `src/ext/`.

---

## 1. KIRI:MOTO - CNC/FDM/SLA Slicer

### Purpose

Multi-mode manufacturing tool for slicing 3D models for CNC milling, 3D printing, laser cutting, SLA, wire EDM, and waterjet.

### Architecture

```
src/
├── main/kiri.js           # Bootstrap entry point (2.3KB)
├── kiri/
│   ├── app/              # Application layer (45 modules)
│   │   ├── api.js        # Main API surface (~10KB)
│   │   ├── platform.js   # Platform/printer setup (~40KB)
│   │   ├── inputs.js     # UI input handling (~30KB)
│   │   ├── paint.js      # Viewport rendering (~23KB)
│   │   ├── widget.js     # Core slicing widget (~12KB)
│   │   ├── devices.js    # Machine definitions
│   │   └── conf/         # Device/process configs
│   ├── core/             # Engine core (7 modules)
│   │   ├── codec.js      # Data encoding/decoding
│   │   ├── print.js      # Print/slice object (~30KB)
│   │   ├── slice.js      # Slicing logic
│   │   └── widget.js     # Widget manipulation (~30KB)
│   ├── mode/             # Machine implementations (7 types)
│   │   ├── cam/          # CNC/CAM milling
│   │   ├── fdm/          # 3D printing (FDM/FFF)
│   │   ├── laser/        # Laser cutting/engraving
│   │   ├── sla/          # Resin printing (SLA)
│   │   ├── drag/         # Drag operations
│   │   ├── wedm/         # Wire EDM cutting
│   │   └── wjet/         # Water jet cutting
│   └── run/              # Worker/threading (5 modules)
│       ├── worker.js     # Worker orchestration (~25KB)
│       ├── engine.js     # Engine execution (~6KB)
│       └── minion.js     # Worker pool (~10KB)
```

### Key Features

- **Multi-threaded slicing**: Web Worker pool (up to 4 minions)
- **Multiple modes**: CAM, FDM, LASER, SLA, WEDM, WJET
- **Device profiles**: JSON-based machine configs (`src/cli/`)
- **Widget-based**: Objects as "widgets" for slicing operations
- **Tabs interface**: Multi-document workspace

### Routes

- `/kiri/` - Main slicer interface
- `/lib/pack/kiri-main.js` - Main bundle (~28KB minified)
- `/lib/pack/kiri-work.js` - Worker bundle
- `/lib/pack/kiri-eng.js` - Engine bundle

### Documentation

- Full docs: `/Users/stewart/Code/gs-apps/docs/kiri-moto/`
- API reference: `/Users/stewart/Code/gs-apps/docs/kiri-moto/apis.md`

### Database (IndexedDB)

- Device profiles, process settings, print history
- Workspace restoration

---

## 2. MESH:TOOL - 3D Mesh Editor

### Purpose

Direct 3D mesh editing, boolean operations, mesh repair, face/edge selection, and 2D sketch system.

### Architecture

```
src/
├── main/mesh.js          # Bootstrap entry point (29KB)
└── mesh/
    ├── api.js            # Main API surface (~1,730 lines)
    ├── build.js          # UI builder (~42KB)
    ├── model.js          # Mesh model class (~26KB)
    ├── group.js          # Group/assembly (~4KB)
    ├── tool.js           # Tool operations (~35KB)
    ├── work.js           # Worker communication (~19KB)
    ├── sketch.js         # 2D sketch mode (~22KB)
    ├── handles.js        # Manipulation handles (~9KB)
    ├── edges.js          # Edge visualization (~6KB)
    ├── history.js        # Undo/redo system
    └── util.js           # Utilities (~9KB)
```

### Key Features

- **Mode-based UI**: Object, Tool, Face, Surface, Edge, Sketch modes
- **Boolean operations**: Union, intersect, difference (Manifold WASM)
- **Mesh repair**: Heal, clean, triangulate
- **Face/edge selection**: Direct geometry manipulation
- **2D sketching**: Sketch on 3D planes
- **Group management**: Assemblies and hierarchy
- **Undo/redo**: Full history system

### UI Components

- Feature tree (left panel)
- Mode buttons (object/tool/face/surface/edge/sketch)
- Object properties panel
- Wireframe/normals visualization

### Routes

- `/mesh/` - Main mesh editor
- `/lib/pack/mesh-main.js` - Main bundle
- `/lib/pack/mesh-work.js` - Worker bundle

### Database (IndexedDB)

- `admin` store - Metadata, preferences, cache
- `space` store - Models, groups, sketches

### Documentation

- `/Users/stewart/Code/gs-apps/docs/mesh-tool.md`

---

## 3. VOID:FORM - Parametric CAD

### Purpose

Onshape-inspired parametric CAD with constraint-based sketching, feature history, and BREP operations.

### Architecture

```
src/
├── main/void.js          # Bootstrap entry point (210 lines)
└── void/
    ├── api.js            # API composition root
    ├── api/
    │   ├── document.js   # Document persistence + revisions/undo/redo
    │   ├── features.js   # Feature list mutations
    │   ├── origin.js     # Origin point visibility/state
    │   ├── sketch.js     # Sketch feature creation scaffold
    │   ├── sketch_runtime.js # Sketch runtime orchestrator/state
    │   ├── sketch_runtime_arc.js # Arc/line endpoint + arc sampling helpers
    │   ├── sketch_runtime_markers.js # Sketch point/arc-center marker builders
    │   ├── sketch_runtime_profiles.js # Closed-profile detection + fill loops
    │   └── sketch_runtime_ui.js # Sketch runtime style/preview/glyph UI helpers
    ├── toolbar.js        # Top toolbar UI
    ├── tree.js           # Tree composition root
    ├── tree/
    │   ├── model.js      # Tree data/section logic
    │   └── render.js     # Tree DOM builders
    ├── overlay.js        # 2D/3D tracking overlay
    ├── datum.js          # Datum planes (XY, XZ, YZ)
    ├── plane.js          # Plane primitive class
    ├── interact.js       # Interaction composition root + event wiring
    ├── interact/
    │   ├── sketch.js     # Sketch interaction orchestrator (event flow + mutations)
    │   ├── sketch_constraints_actions.js # Constraint apply/toggle/delete actions
    │   ├── sketch_marquee.js # Marquee selection + geometry hit rules
    │   ├── sketch_pointer.js # Pointer/hover/drag gesture handlers
    │   ├── sketch_tools.js # Sketch tool mode + keybinding behavior
    │   ├── sketch_geometry.js # Sketch hit-test/projection/drag geometry helpers
    │   ├── sketch_constants.js # Shared sketch interaction constants
    │   ├── planes.js     # Plane hover/select/resize + view-normal
    │   ├── points.js     # Point hover/select hit-testing
    │   ├── selection.js  # Shared selection state transitions
    │   └── targets.js    # Sketch target/frame resolution
    ├── sketch_constraints.js # Constraint orchestration (planegcs + post-solve hooks)
    ├── sketch_constraints_fallback.js # Legacy/incremental fallback solver
    ├── sketch_constraints_tangent.js # Tangent constraint solver helpers
    └── viewcube.js       # ViewCube navigation widget (NEW)
```

### Key Features

- **Feature tree scaffold**: Sidebar structure is present; full history dependency/update graph is not wired yet
- **Datum planes**: XY, XZ, YZ reference planes
- **Constraint sketching**: integrated (`@salusoft89/planegcs` + fallback solver path)
- **Manifold BREP**: planned feature path (extrude/cut/revolve), early stubs today
- **Onshape camera**: Left=select, Middle=pan/zoom, Right=rotate
- **ViewCube**: 3D navigation widget (top-right corner)
- **2D overlay**: SVG overlay for 3D point tracking

### Status

**Very early development (Phase 1 foundation, early feature workflow in place)**

- 3D viewport with Onshape camera controls
- Datum planes with interaction
- Feature tree with default geometry visibility controls
- ViewCube navigation widget
- 2D/3D overlay system
- Document persistence + revision history with undo/redo
- Sketch feature creation scaffold (target plane/face -> sketch feature entry)

**Current implementation notes (important for agents)**

- Direct-call architecture in `void:form` (no broker event bus in current runtime path)
- `toolbar` wires real actions for docs, camera modes, undo/redo, and sketch creation
- `toolbar` now includes a `Preferences` dialog (`⚙`) with persisted runtime tuning:
  - solid edge loop-promotion threshold (segment count)
  - solid edge hover/select `Line2` widths
  - fit padding (perspective + orthographic)
- `tree.render()` is still caller-driven for feature mutations; refresh explicitly after non-tree-originated changes
- `src/main/void.js` currently enables overlay test primitives with a hardcoded `if (true)` block (debug scaffolding)
- `Origin` in void is an overlay point (not `space.platform` origin)
- IndexedDB revision store name is `versions` (older notes may still mention `features`)
- Feature tree now includes early history controls:
  - per-feature `suppress/unsuppress`
  - feature reorder (up/down)
  - timeline slider (`0..N`) controlling active rebuild prefix
  - all above are revisioned + undo/redoable
  - feature creation now inserts at the active timeline marker (`index + 1`) instead of always appending to the end
- Sketch runtime currently renders from the active rebuild set (`features.listBuilt()`), not raw full feature list
- Open TODO: stabilise dual-tangent sketch behavior (`line` tangent to two circles/arcs with endpoint-on-arc constraints)
- Min/max distance constraints are now wired (`circle/arc` vs `point/line/circle-arc`) but still need stability tuning under drag:
  - current known issue: circle-in-box (`min` to two orthogonal lines) can feel jerky while drag-resizing radius
  - current implementation favors deterministic branching for line targets; revisit with solver-side branch lock per drag gesture if needed
- Known regression history: commit `5093eec4` introduced an overly permissive derived-edge proximity gate (`segLen * 0.35`) in `resolveDerivedEdgeCandidate`; this causes incorrect face/edge picks in sketch derive hover. Keep tight gate (`2.5`) unless replaced with a screen-space metric.
- Geometry graph refactor plan is tracked in `docs/void/plan-geomgraph.md` (surfaces + boundaries as canonical entities; solids as derived artifacts).
- Derived sketch entity rearchitecture plan is tracked in `docs/void/plan-derived.md` (immutable, rebuild-driven references to upstream geometry).
- Terminology (use consistently in code/docs/issues):
  - `segment`: one boundary edge between two 3D points
  - `chain`: ordered open polyline of connected segments
  - `loop`: ordered closed polyline of connected segments
  - `surface`: bounded face patch on a solid (planar or curved)
  - `region`: selectable enclosed 2D sketch profile area
- TODO (open): de-dup overlapping boundary projections/derives in sketch `Use (u)` flow.
  - Symptom: side faces on cubes/cylinders/arc-cutouts can project/derive overlapping duplicate lines.
  - Requirement: de-dup identical segments/chains by geometric equivalence (endpoint tolerance + chain shape/length), not by source face id.
- Phase 0 scaffolding status:
  - new `GeometryStore` API is wired as the single active path (no rollout flags)
- Phase 1 in-progress status:
  - surface/profile/edge hover ranking logic has been extracted into `src/void/interact/selection_resolver.js`
  - `src/void/interact/planes.js#getPrimarySurfaceHitFromIntersections()` is now a thin delegate to the resolver
  - current behavior is parity-focused (same thresholds and tie-break order), giving a stable seam for future boundary/surface entity routing
  - resolver now accepts explicit `mode` + `intents` context (`SELECTION_MODES`, `SELECTION_INTENTS`) while preserving current behavior
  - resolver candidates now carry passive canonical entity descriptors:
    - `profile -> region`
    - `solid-face -> surface`
    - `solid-edge -> boundary-segment`
  - resolver now sources canonical face/edge entity ids from solids runtime mappings when available:
    - face key -> `surface:*` (stable)
    - edge key -> `segment:*` (stable)
    - loop edge key -> `boundary:*` (stable)
    - canonical ids are now primary for selection entity payloads
  - solids runtime now publishes a passive geometry snapshot into `document.geometry_store` on sync:
    - surfaces, boundaries, segments, points, regions, topology maps
    - still read-only; selection and ops remain on legacy paths for parity
  - sketch profile/area selection now toggles multi by default (no cmd/meta required); clear remains on `space`/`esc`
  - derive (`u`) path now carries canonical entity metadata for segment-backed sources:
    - `source.entity.kind = boundary-segment`
    - `source.entity.id = segment:faceedge:<faceKey>:<segIndex>`
    - plus `source.face_key` and `source.boundary_segment_id` for migration bridging
  - extrude profile targets now use `region_id` (canonical key) only in selection + rebuild paths
  - chamfer edge refs now carry canonical boundary metadata:
    - `boundary_segment_id` and `entity: { kind: 'boundary-segment', id: 'segment:...' }`
    - chamfer selection sync/remove resolves through canonical boundary refs
    - chamfer apply consumes canonical refs (legacy parse path removed)
  - boolean/solid-op editing paths removed `input.solids` compatibility branches (use `targets/tools` only)
  - TODO (tracked): during sketch editing, allow `Use (u)` derive from other visible sketch entities

**Phase 2: Sketch System (Current Workstream)**

- planegcs constraint solver integration is active
- sketch runtime supports point/line/arc/circle/rectangle workflows
- sketch mirror mode is now Onshape-style:
  - select exactly one line as mirror axis, then press `M` (or use Constraints -> Mirror)
  - while mirror mode is active, clicking sketch entities mirrors them immediately and keeps the axis highlighted
- sketch circular pattern mode (new, WIP):
  - enter from `Pattern -> Circular` with exactly one selected center point (point/origin/arc-center)
  - while active, clicking sketch entities creates linked circular copies around that center
  - pattern constraint glyph stays visible, supports drag offset, and double-click edits copy count
  - deleting the pattern glyph removes the driving pattern constraint and leaves copied geometry unbound
  - known regression (open): after certain circular-pattern drag operations, some entities become effectively locked/non-movable
    - observed after moving patterned elements with additional constraints in sketch
    - likely in drag ownership propagation / fallback solver interaction for `circular_pattern`
    - status: unresolved, needs focused repro + solver trace
- sketch grid pattern mode (new, WIP):
  - entered via `Pattern -> Grid`, requires exactly one selected sketch point as anchor
  - creates two construction guide lines (U/V) from anchor with default `horizontal`/`vertical` constraints
  - renders two always-visible count glyphs (`Hn`, `Vn`) near guide endpoints (double-click to edit counts)
  - copies are regenerated from source using guide-line vectors (guide constraints can be removed for skewed grids)
  - known issues (open):
    - dragging the grid anchor can invert U/V construction line direction unexpectedly
    - patterned circle dimension behavior is inconsistent between source and clone circles (dimension propagation/ownership)
  - mirror axis is highlighted purple while mode is active
  - each subsequently selected sketch entity is mirrored immediately across that axis
  - `Esc` or `Space` exits mirror mode
- constraints currently wired: coincident, point-on-line, fixed, horizontal, vertical, perpendicular, equal, collinear, tangent, arc-center coincident, midpoint, min-distance, max-distance
- deferred: Onshape-like under/fully constrained coloring for sketch entities needs a custom per-entity DoF analysis layer on top of planegcs (not directly exposed as per-entity status by solver)
- horizontal/vertical can target line entities or a selected point pair
- rectangle tools are implemented as constrained line sets:
  - corner rectangle
  - center rectangle

**Phase 3: Feature History Scaffold (in progress)**

- `extrude` can now be created as a history feature from a selected sketch (tree + document/history plumbing)
- 3D solid generation/rebuild is active via Manifold replay (extrude + boolean paths)
- timeline/reorder/suppress semantics are active at the feature-history layer before full BREP ops
- chamfer scaffolding (phase-1 UI only) is active:
  - solid-mode edge hover/select now parallels face hover/select
  - `Chamfer` feature can be created from selected edges (toolbar button + properties dialog with edge list)
  - geometry mutation/rebuild for chamfer edges is not yet applied (selection/dialog/history plumbing only)

**Solid Pipeline (new scaffold)**

- `void` now has a dedicated solid path (separate from `kiri/mesh` CSG wrappers):
  - `src/void/api/solids.js` (rebuild scheduling + orchestration)
  - `src/void/solid/kernel.js` (direct Manifold JS initialization/extrude entrypoint)
  - `src/void/solid/rebuild.js` (feature replay -> generated solids artifacts)
  - `src/void/solid/provenance.js` (seed provenance model for feature/profile->body mapping)
  - `src/void/worker/solids_worker.js` (phase-1 compute worker for rebuild replay)
- Solids tree should read generated artifacts (`doc.generated.solids`) rather than mirroring feature rows.
- Phase-1 worker behavior (current):
  - main thread builds a compact rebuild snapshot (`builtFeatures`, sketch planes, profile loops)
  - worker runs feature replay + manifold ops off-main-thread
  - mesh payload returns as transferable typed arrays (zero-copy `ArrayBuffer` transfer)
  - if worker fails, runtime falls back to existing main-thread rebuild path
- Path forward:
  - phase-2: incremental suffix replay + cancellation preemption
  - phase-3: cached per-feature artifacts keyed by input hash
  - phase-4: worker pool for independent heavy ops (exports/tessellation), keeping deterministic rebuild order

**Sketch MVP Contract (checkpointed, 2026-02-06)**

- Primitive rollout:
  - v1: `point` + `line`
  - `arc` implemented
  - `circle` implemented (internal circle-mode arc representation)
  - Rectangle is not a primitive; model as constrained lines (corner/center patterns)
- Input behavior:
  - Click+drag creation for points and lines
  - No snapping/inference in v1; rely on explicit constraints
- View behavior:
  - No auto camera orientation on sketch edit entry (user uses `n` manually)
  - Non-edit sketch display remains gray when visible, hidden when invisible
  - While editing a sketch, disable hover-highlight behavior for that sketch
- Coordinate model:
  - Store sketch geometry in sketch-local 2D coordinates
  - Plane/frame transform maps sketch-local geometry into 3D scene
  - This is required for future derived geometry from non-datum faces/parts
  - When rendering world-space derived previews inside sketch runtime, convert world coords to parent-local before drawing (avoid double-transform rotation/offset artifacts)
  - For solid feature ops that derive cutters from selected edges (ex: chamfer), preserve mesh-topology edges (`indices` adjacency) instead of position-welding vertices for adjacency lookup. Position welding can pair non-adjacent triangles and rotate/offset generated cutters.
  - Chamfer cutter prism winding matters: keep end-cap triangle winding outward/consistent with side faces. Reversed cap winding can make Manifold subtraction fail (`NotManifold`) even when cutter placement is correct.
- Constraint rollout (checkpoint):
  - Solver-backed enforcement is active (planegcs + fallback)
  - Implemented:
    - Lines: `horizontal`, `vertical`, `perpendicular`
    - Points: `coincident`, `fixed`
    - Arc/Circle: `arc_center_coincident`
  - Next target set:
    - `equal` (line length), `collinear`, `tangent`
- Dimensions:
  - Support both driven and derived dimensions (for later variable system)
- Selection roadmap:
  - v1: click selection
  - later: rectangle selection parity with Onshape semantics:
    - right-drag = must fully enclose
    - left-drag = crossing/touch selects
  - TODO later: bring rectangle/marquee selection parity to non-sketch (global 3D) mode
- Construction geometry:
  - Required early
  - Toggle selected entity construction state with `q`
  - Construction lines render dashed
- Undo/redo granularity:
  - One undo unit per mutation (entity create/complete move/change, dimension change)
  - Not per low-level pointer gesture frame

**Sketch Point Rendering (current)**

- Sketch point and arc-center markers are now shader-based (`THREE.Points` + fragment rings) in WebGL:
  - camera-facing, circular, pixel-sized (zoom invariant)
  - avoids DOM overlay jitter at high entity counts
- Legacy `_markerParts` compatibility shims are retained so existing hover/select styling code paths continue to work.
- Centralized JS color tuning now starts in `src/void/palette.js` (current coverage: sketch + viewcube, expanding incrementally).
- Sketch non-construction lines/arcs now use `Line2/LineMaterial` for visible hover/select thickness control (`lineWidths` in palette).
- Arc/circle sketch dimensions now use **diameter semantics** (stored/edited/measured as diameter; solver applies radius = diameter / 2). Dimension decoration renders:
  - inside circle/arc: full diameter line with arrow end caps
  - outside circle/arc: leader line with arrow pointing to the circle
- Known runtime refresh issue (open, under validation):
  - if pointer remains over tree/panels long enough, viewport updates can appear stalled (sketch hover/render). Keep `space` activity/refresh alive for UI-target mousemove paths.

### Routes

- `/void/` - Primary URL
- `/form/` - Alias (same app)

### Database (IndexedDB)

- `admin` store - Metadata, camera position
- `documents` store - Document data
- `versions` store - Revision history (snapshots/deltas)

### Documentation

- `/Users/stewart/Code/gs-apps/VOID-FORM.md` - Full implementation notes

### Dependencies (Unique to void:form)

- **@salusoft89/planegcs** ^1.1.7 - 2D constraint solver (active)

---

## Shared Infrastructure

All three apps build on common modules, but usage patterns differ by app:

### Core Systems (moto/)

#### 1. Event System (`broker.js` - 156 lines)

Used heavily by `kiri:moto` and `mesh:tool`. `void:form` currently does not use broker in its runtime path.

```javascript
import { broker } from '../moto/broker.js';

// Publish
broker.publish('feature.selected', { id: 'plane-1' });

// Subscribe
broker.subscribe('feature.selected', (data) => { ... });

// Typed send interface
broker.send.feature_selected({ id: 'plane-1' });
```

#### 2. 3D Viewport (`space.js` - 55KB)

Three.js wrapper with camera, scene, and interaction:

```javascript
import { space } from '../moto/space.js';

// Initialize viewport
space.init(container, onMove, useKeys);

// Scene hierarchy
SCENE (Three.js Scene)
└── WORLD (THREE.Group, rotated -π/2 on X-axis)
    └── Your objects here

// Use space.world.add(), NOT space.scene.add()
space.world.add(group);

// Camera controls (Onshape-style for void, configurable for others)
space.view.top()           // Top view
space.view.front()         // Front view
space.view.right()         // Right view
space.view.left()          // Left view
space.view.back()          // Back view
space.view.bottom()        // Bottom view
space.view.fit()           // Fit all to view

// Camera state
space.view.save()          // Returns { left, up, panX, panY, panZ, scale }
space.view.load(state)     // Restore saved state
space.view.getFocus()      // Get orbit target
space.view.setFocus(vec3)  // Set orbit target

// Mouse bindings (configurable)
RIGHT = Orbit   // Rotate around target
MIDDLE = Pan    // Pan view
WHEEL = Zoom    // Zoom in/out

// Internals access
const { camera, renderer, raycaster, platform, container } = space.internals();

// Listen for camera changes
space.view.ctrl.addEventListener('change', callback);

// After-render callbacks (for ViewCube, etc.)
space.afterRender((renderer) => {
    // Custom render pass
    viewcube.render(renderer);
});

// Tracking plane for drag operations (void:form)
space.tracking.setMode('camera-aligned');  // 'platform', 'camera-aligned', 'world-xy'
space.tracking.setDistance(1000);          // Distance from camera
space.tracking.getMode();                  // Get current mode
space.tracking.getPlane();                 // Get THREE.Mesh for advanced use
```

#### 3. Camera Controls (`orbit.js` - 25KB)

Orbit control class for camera manipulation:

- Spherical coordinates (theta/phi)
- Pan, zoom, rotate operations
- Tweening for smooth animations
- Touch support

#### 4. Web UI Helpers (`webui.js` - 4KB)

```javascript
import { $, $C, h } from '../moto/webui.js';

$('element-id')           // Get element by ID
$C('ClassName')           // Get elements by class
h.div([...])              // Create DOM elements
```

#### 5. Worker System (`client.js`, `worker.js`)

Web Worker abstraction with promise-based API:

```javascript
import { client } from '../moto/client.js';

const worker = client.new('worker-url.js');
worker.send('method', data).then(result => { ... });
```

### Geometry & Math (geo/)

Shared by all apps for 2D/3D operations:

- `base.js` - Core math utilities (22KB)
- `polygon.js` - 2D polygon operations (48KB)
- `polygons.js` - Multi-polygon operations (39KB)
- `point.js` - Point data structure (30KB)
- `paths.js` - Path operations (27KB)
- `slicer.js` - Slicing algorithms (31KB)
- `line.js`, `bounds.js`, `csg.js`, etc.

### File Loading (load/)

Format detection and parsing:

- `file.js` - Auto-detect file type
- `stl.js` - STL (binary & ASCII)
- `obj.js` - Wavefront OBJ
- `3mf.js` - 3MF (Microsoft 3D)
- `step.js` - STEP (CAD format)
- `svg.js` - SVG (2D vector)
- `gbr.js` - Gerber (PCB format)
- `png.js` - PNG (height map)

### External Libraries (ext/)

Pre-integrated WASM and libraries:

- `three.js` - Three.js v0.182.0 (2.4MB)
- `manifold.js` - 3D boolean operations (WASM)
- `quickjs.js` - JavaScript VM (2.4MB WASM)
- `jszip.js` - ZIP file handling
- `jspoly.js` - Polygon library (240KB)
- `clip2.js` - Polygon clipping (203KB)
- `pngjs.js` - PNG reading
- `earcut.js` - Polygon triangulation
- `tween.js` - Animation tweening
- `md5.js` - MD5 hashing

### Data Storage (data/)

IndexedDB wrapper:

```javascript
import { open as dataOpen } from '../data/index.js';

const stores = dataOpen('dbname', {
    stores: ['admin', 'documents'],
    version: 1
}).init();

const db = {
    admin: stores.promise('admin'),
    documents: stores.promise('documents')
};

db.admin.put('key', value);
db.admin.get('key').then(value => { ... });
```

---

## Common Architectural Patterns

### 1. Three.js Native Objects

All 3D primitives are native Three.js objects:

```javascript
import { THREE } from "../ext/three.js";

const { Group, Mesh, LineSegments, BoxGeometry, MeshBasicMaterial } = THREE;

// Create as Group with children
const group = new Group();
group.add(mesh);
group.add(outline);

// Add userData for back-references
group.userData.featureType = "plane";
group.userData.plane = this;

// Set renderOrder to control draw order (avoid z-fighting)
mesh.renderOrder = 1;
outline.renderOrder = 2;

// Transparent objects MUST have depthWrite: false
const material = new MeshBasicMaterial({
  transparent: true,
  opacity: 0.5,
  depthWrite: false, // CRITICAL for transparency
});
```

### 2. Event-Driven Communication

`kiri:moto` and `mesh:tool` use broker for loose coupling. `void:form` currently uses direct module calls/shared API state.

```javascript
// Subscribe to events
broker.subscribe("model.updated", (data) => {
  updateUI(data);
});

// Publish events
broker.publish("model.updated", { model });

// Or use typed interface
broker.send.model_updated({ model });
```

```javascript
// void:form pattern (current)
api.document.create();
api.features.add(feature);
tree.render();
datum.updateLabels(overlay);
```

### 2.1. Void Interaction Contract (Current)

`void:form` interaction is currently plane-centric and depends on `userData` back-references:

- Raycast targets are returned from `interact.getInteractiveObjects()`
- Selection/hover resolve via `intersection.object.userData.plane`
- Drag-resize logic is implemented for plane corner handles (`handleType = 'plane-resize'`)
- `space.mouse.*Select()` callbacks are two-phase: first call with no event returns raycast targets, second call handles resolved intersections
- For resize start, `interact.downSelect` should prioritize handle hits from full intersections (`ints`) so selected handles remain draggable when occluded by plane meshes
- Non-plane feature types should extend `src/void/interact/planes.js` + `src/void/interact/targets.js`; `registerPlane()` alone is not sufficient for custom interactions
- Plane labels should be bound to plane changes (size/position/rotation/label), not only camera movement

### 3. Mouse Interaction Pattern

Standard pattern across all apps:

```javascript
space.mouse.downSelect((intersection, event, allIntersections) => {
  if (!event) {
    // Return objects for raycasting
    return [mesh1, mesh2, mesh3];
  }
  // Handle click
  if (intersection) {
    const obj = intersection.object.userData.myObject;
    // ... do something
  }
});

space.mouse.onHover(
  (intersection, event, allIntersections) => {
    if (!event) return getInteractiveObjects();
    // Handle hover
  },
  () => {
    // Handle hover exit
  }
);

space.mouse.onDrag((delta) => {
  // Handle drag (delta = {x, y} in pixels)
});
```

### 4. Worker/Threading Pattern

- **Kiri**: Multi-threaded minion pool for slicing (up to 4 workers)
- **Mesh**: Single worker for heavy 3D operations
- **Void**: Single worker for solid rebuild replay (active), constraint solve still on main thread

### 5. API Surface Pattern

Each app exports main `api` object:

```javascript
// Kiri API - ~45 subsystems
api.widgets, api.function, api.mode, api.work, api.device, ...

// Mesh API - ~18 subsystems
api.selection, api.group, api.model, api.sketch, api.tool, ...

// Void API - ~6 subsystems (expanding)
api.document, api.features, api.sketch, api.origin, api.selection, api.datum, ...
```

### 6. Database Pattern

IndexedDB with named stores, per-app schema:

```javascript
dataOpen("appname", { stores: ["admin", "data"], version: 1 });
api.db.admin.put(key, value);
api.db.data.get(id);
```

---

## Key Differences Between Apps

| Aspect          | Kiri:Moto                    | Mesh:Tool                            | Void:Form                                       |
| --------------- | ---------------------------- | ------------------------------------ | ----------------------------------------------- |
| **Purpose**     | Slicing for manufacturing    | Mesh editing & repair                | Parametric CAD design                           |
| **Data Model**  | Widget-based slicing         | Triangle mesh + sketches             | Early document/features scaffold + datum planes |
| **UI Pattern**  | Tabs + device/process panels | Tree + mode buttons                  | Toolbar + feature tree scaffold                 |
| **3D System**   | space.js + platform          | space.js + platform                  | space.js + datum planes                         |
| **Calculation** | Web Workers (minion pool)    | Web Worker                           | Single rebuild worker (active)                  |
| **Modes**       | CAM/FDM/LASER/SLA/WEDM/WJET  | Object/Tool/Face/Surface/Edge/Sketch | Sketch mode (phase 2)                           |
| **Mouse**       | Configurable bindings        | Standard bindings                    | Onshape-style bindings                          |
| **Database**    | Profiles, settings, history  | Models, groups, sketches             | Documents + versions revision history           |
| **Status**      | Production mature            | Actively developed                   | Very early prototype / Phase 1 foundation       |
| **API Size**    | ~10KB, 45 subsystems         | ~1,730 lines, 18 subsystems          | Split modules (document/features/origin/sketch) |

---

## Common Tasks

### Adding a New Feature Type (void:form)

1. Create class in `src/void/yourfeature.js` similar to `Plane`
2. Return `THREE.Group` with children (mesh, outline, handles)
3. Set `userData.featureType = 'yourtype'` and `userData.yourfeature = this`
4. For plane-like behavior, register with `interact.registerPlane()`; for non-plane behavior, extend `src/void/interact/planes.js` hit-testing and/or `src/void/interact/targets.js`
5. If the feature has labels/anchors, expose change notifications so overlays update on geometry/transform edits
6. Update `api.document/features` and refresh dependent UI directly (no broker path today)

### Adding a Tool Operation (mesh:tool)

1. Add function to `src/mesh/tool.js`
2. Register in `api.tool.yourOperation()`
3. Send to worker if heavy operation (`api.work.send()`)
4. Update UI via broker events
5. Add history entry for undo/redo

### Adding a Slicing Mode (kiri:moto)

1. Create mode directory in `src/kiri/mode/yourmode/`
2. Implement slice, setup, export functions
3. Register mode in `api.mode`
4. Add device profiles in `src/cli/`
5. Update worker bundles

### Working with Transparent Objects

To avoid z-fighting with transparent planes/faces:

- Set `renderOrder` (higher = rendered later)
- Use `depthWrite: false` on transparent materials
- Consider separate render passes for complex transparency
- void:form ViewCube uses separate render pass to avoid z-fighting

### Viewport Rendering (Multiple Passes)

For widgets needing separate rendering (ViewCube pattern):

```javascript
space.afterRender((renderer) => {
  // Save current viewport
  const currentViewport = new THREE.Vector4();
  renderer.getViewport(currentViewport);

  // Set custom viewport (e.g., top-right corner)
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  renderer.setScissorTest(true);
  renderer.autoClear = false;

  // Render your scene
  renderer.render(myScene, myCamera);

  // Restore
  renderer.setViewport(currentViewport);
  renderer.setScissorTest(false);
});
```

ViewCube caveat:

- `ViewCube` renders in a separate pass via `space.afterRender()`
- Preserve and restore renderer viewport/scissor/autoclear state when adding more overlays/widgets

---

## Critical Rules

1. **ALWAYS** read files before editing them
2. **NEVER** use `SCENE.add()` - use `space.world.add()` instead
3. **NEVER** forget `depthWrite: false` on transparent materials
4. **ALWAYS** dispose of Three.js geometry/materials when removing objects
5. **ALWAYS** use `userData` for back-references on Three.js objects
6. **PREFER** repo-consistent tooling and keep edits minimal/reviewable
7. **ALWAYS** test z-fighting issues with transparent overlapping geometry
8. **NEVER** modify shared moto/ infrastructure without considering all three apps
9. **USE BROKER WHEN THE APP ALREADY FOLLOWS THAT PATTERN** (`kiri:moto`, `mesh:tool`); `void:form` currently uses direct module calls
10. **NEVER** block the main thread - use workers for heavy computation
11. **RESPECT SPACE MOUSE CALLBACK SHAPE**: target-discovery and event handling are separate phases; use full intersection lists when interaction priority matters

---

## Important File Paths

### Entry Points

- `/Users/stewart/Code/gs-apps/src/main/kiri.js` - Kiri:Moto bootstrap
- `/Users/stewart/Code/gs-apps/src/main/mesh.js` - Mesh:Tool bootstrap
- `/Users/stewart/Code/gs-apps/src/main/void.js` - Void:Form bootstrap

### Core APIs

- `/Users/stewart/Code/gs-apps/src/kiri/app/api.js` - Kiri API (~10KB)
- `/Users/stewart/Code/gs-apps/src/mesh/api.js` - Mesh API (~1,730 lines)
- `/Users/stewart/Code/gs-apps/src/void/api.js` - Void API composition root
- `/Users/stewart/Code/gs-apps/src/void/api/document.js` - Void document + revisions/undo/redo
- `/Users/stewart/Code/gs-apps/src/void/interact.js` - Void interaction composition root

### Shared Infrastructure

- `/Users/stewart/Code/gs-apps/src/moto/space.js` - 3D viewport (55KB)
- `/Users/stewart/Code/gs-apps/src/moto/broker.js` - Event system (156 lines)
- `/Users/stewart/Code/gs-apps/src/moto/orbit.js` - Camera controls (25KB)
- `/Users/stewart/Code/gs-apps/src/moto/webui.js` - DOM helpers (4KB)

### Geometry & Loading

- `/Users/stewart/Code/gs-apps/src/geo/` - Math & geometry (12 modules)
- `/Users/stewart/Code/gs-apps/src/load/` - File format loaders (9 formats)
- `/Users/stewart/Code/gs-apps/src/ext/` - External libraries (Three.js, Manifold, etc.)

### Documentation

- `/Users/stewart/Code/gs-apps/docs/kiri-moto/` - Kiri:Moto docs (extensive)
- `/Users/stewart/Code/gs-apps/docs/mesh-tool.md` - Mesh:Tool docs
- `/Users/stewart/Code/gs-apps/VOID-FORM.md` - Void:Form implementation notes

### Configuration

- `/Users/stewart/Code/gs-apps/app.js` - Express server (routes at lines 135-166)
- `/Users/stewart/Code/gs-apps/package.json` - Dependencies

---

## Routes

### Development URLs (http://localhost:8080)

- `/kiri/` - Kiri:Moto slicer
- `/mesh/` - Mesh:Tool editor
- `/void/` - Void:Form CAD (primary)
- `/form/` - Void:Form CAD (alias)

### Static Assets

- `/lib/pack/kiri-main.js` - Kiri main bundle (~28KB)
- `/lib/pack/kiri-work.js` - Kiri worker bundle
- `/lib/pack/kiri-eng.js` - Kiri engine bundle
- `/lib/pack/mesh-main.js` - Mesh main bundle
- `/lib/pack/mesh-work.js` - Mesh worker bundle
- `/lib/pack/void-main.js` - Void main bundle

---

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (port 8080)
npm run build        # Build for production
```

---

## Dependencies

### Shared (all apps)

- **three** ^0.182.0 - 3D rendering
- **manifold-3d** ^3.3.2 - BREP operations
- **jszip** - ZIP file handling

### Void-specific

- **@salusoft89/planegcs** ^1.1.7 - 2D constraint solver

---

## Git Status

- Current branch: `rel-4.6-void`
- Main branch: `master` (use for PRs)
- Recent work: ViewCube widget, datum planes, plane primitives

---

## Next Steps

### Kiri:Moto

- Mature product, maintenance mode
- Device profile updates
- Mode-specific improvements

### Mesh:Tool

- Active development
- Face/edge selection enhancements
- Boolean operation improvements
- Sketch system refinements

### Void:Form

**Phase 2: Sketch System** (Next)

1. planegcs constraint solver integration
2. 2D sketch canvas overlay
3. Geometric primitives (line, circle, arc)
4. Constraints (distance, angle, parallel, perpendicular)

**Phase 3: Features**

1. Extrude feature using Manifold
2. Feature history tree with parametric updates
3. Cut, revolve, sweep operations

---

**Last Updated:** 2026-02-03 (ViewCube integration, comprehensive coverage)
