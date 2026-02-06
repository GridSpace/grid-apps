# AI Agent TL;DR - gs-apps

Quick reference for AI agents working on this project.

## What Is This?

**gs-apps** is a monorepo containing three Grid.Space web applications:

| App | Purpose | Status | Entry Point |
|-----|---------|--------|-------------|
| **kiri:moto** | Multi-axis CNC/FDM/SLA slicer | Production | `src/main/kiri.js` |
| **mesh:tool** | 3D mesh editor & repair | Active dev | `src/main/mesh.js` |
| **void:form** | Parametric CAD modeler | Phase 1 | `src/main/void.js` |

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
    ├── api.js            # Main API surface (113 lines, minimal)
    ├── toolbar.js        # Top toolbar UI
    ├── tree.js           # Feature tree sidebar
    ├── overlay.js        # 2D/3D tracking overlay
    ├── datum.js          # Datum planes (XY, XZ, YZ)
    ├── plane.js          # Plane primitive class
    ├── interact.js       # Mouse interaction (hover, select, drag)
    └── viewcube.js       # ViewCube navigation widget (NEW)
```

### Key Features
- **Feature tree scaffold**: Sidebar structure is present; full history dependency/update graph is not wired yet
- **Datum planes**: XY, XZ, YZ reference planes
- **Constraint sketching**: planned (`@salusoft89/planegcs`), not integrated yet
- **Manifold BREP**: planned feature path (extrude/cut/revolve), early stubs today
- **Onshape camera**: Left=select, Middle=pan/zoom, Right=rotate
- **ViewCube**: 3D navigation widget (top-right corner)
- **2D overlay**: SVG overlay for 3D point tracking

### Status
**Very early development (Phase 1 foundation in place)**
- 3D viewport with Onshape camera controls
- Datum planes with interaction
- Feature tree UI structure
- ViewCube navigation widget
- 2D/3D overlay system

**Current implementation notes (important for agents)**
- Direct-call architecture in `void:form` (no broker event bus in current runtime path)
- `toolbar` has placeholders/TODO actions for sketch/extrude/view presets
- `tree.render()` is not auto-subscribed to `api.features`; callers must refresh UI explicitly after mutations
- `src/main/void.js` currently enables overlay test primitives with a hardcoded `if (true)` block (debug scaffolding)

**Phase 2: Sketch System (Next)**
- planegcs constraint solver integration
- 2D sketch canvas overlay
- Geometric primitives (line, circle, arc)
- Constraints (distance, angle, parallel, perpendicular)

### Routes
- `/void/` - Primary URL
- `/form/` - Alias (same app)

### Database (IndexedDB)
- `admin` store - Metadata, camera position
- `documents` store - Document data
- `features` store - Feature history

### Documentation
- `/Users/stewart/Code/gs-apps/VOID-FORM.md` - Full implementation notes

### Dependencies (Unique to void:form)
- **@salusoft89/planegcs** ^1.1.7 - 2D constraint solver (planned use)

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
import { THREE } from '../ext/three.js';

const { Group, Mesh, LineSegments, BoxGeometry, MeshBasicMaterial } = THREE;

// Create as Group with children
const group = new Group();
group.add(mesh);
group.add(outline);

// Add userData for back-references
group.userData.featureType = 'plane';
group.userData.plane = this;

// Set renderOrder to control draw order (avoid z-fighting)
mesh.renderOrder = 1;
outline.renderOrder = 2;

// Transparent objects MUST have depthWrite: false
const material = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.5,
    depthWrite: false  // CRITICAL for transparency
});
```

### 2. Event-Driven Communication
`kiri:moto` and `mesh:tool` use broker for loose coupling. `void:form` currently uses direct module calls/shared API state.
```javascript
// Subscribe to events
broker.subscribe('model.updated', (data) => {
    updateUI(data);
});

// Publish events
broker.publish('model.updated', { model });

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
- Non-plane feature types should extend `interact.js` behavior; `registerPlane()` alone is not sufficient for custom interactions
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

space.mouse.onHover((intersection, event, allIntersections) => {
    if (!event) return getInteractiveObjects();
    // Handle hover
}, () => {
    // Handle hover exit
});

space.mouse.onDrag((delta) => {
    // Handle drag (delta = {x, y} in pixels)
});
```

### 4. Worker/Threading Pattern
- **Kiri**: Multi-threaded minion pool for slicing (up to 4 workers)
- **Mesh**: Single worker for heavy 3D operations
- **Void**: Single worker for constraint solving (planned)

### 5. API Surface Pattern
Each app exports main `api` object:
```javascript
// Kiri API - ~45 subsystems
api.widgets, api.function, api.mode, api.work, api.device, ...

// Mesh API - ~18 subsystems
api.selection, api.group, api.model, api.sketch, api.tool, ...

// Void API - ~6 subsystems (expanding)
api.document, api.features, api.selection, api.datum, ...
```

### 6. Database Pattern
IndexedDB with named stores, per-app schema:
```javascript
dataOpen('appname', { stores: ['admin', 'data'], version: 1 })
api.db.admin.put(key, value)
api.db.data.get(id)
```

---

## Key Differences Between Apps

| Aspect | Kiri:Moto | Mesh:Tool | Void:Form |
|--------|-----------|-----------|-----------|
| **Purpose** | Slicing for manufacturing | Mesh editing & repair | Parametric CAD design |
| **Data Model** | Widget-based slicing | Triangle mesh + sketches | Early document/features scaffold + datum planes |
| **UI Pattern** | Tabs + device/process panels | Tree + mode buttons | Toolbar + feature tree scaffold |
| **3D System** | space.js + platform | space.js + platform | space.js + datum planes |
| **Calculation** | Web Workers (minion pool) | Web Worker | Single worker (planned) |
| **Modes** | CAM/FDM/LASER/SLA/WEDM/WJET | Object/Tool/Face/Surface/Edge/Sketch | Sketch mode (phase 2) |
| **Mouse** | Configurable bindings | Standard bindings | Onshape-style bindings |
| **Database** | Profiles, settings, history | Models, groups, sketches | Documents, features, history |
| **Status** | Production mature | Actively developed | Very early prototype / Phase 1 foundation |
| **API Size** | ~10KB, 45 subsystems | ~1,730 lines, 18 subsystems | ~113 lines, 6 subsystems |

---

## Common Tasks

### Adding a New Feature Type (void:form)
1. Create class in `src/void/yourfeature.js` similar to `Plane`
2. Return `THREE.Group` with children (mesh, outline, handles)
3. Set `userData.featureType = 'yourtype'` and `userData.yourfeature = this`
4. For plane-like behavior, register with `interact.registerPlane()`; for non-plane behavior, extend `src/void/interact.js` hit-testing and handlers
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
- `/Users/stewart/Code/gs-apps/src/void/api.js` - Void API (~113 lines)

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
