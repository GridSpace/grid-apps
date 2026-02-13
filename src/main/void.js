/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';

import { $ } from '../moto/webui.js';
import { api } from '../void/api.js';
import { space } from '../moto/space.js';
import { open as dataOpen } from '../data/index.js';
import { toolbar } from '../void/toolbar.js';
import { tree } from '../void/tree.js';
import { overlay } from '../void/overlay.js';
import { datum } from '../void/datum.js';
import { interact } from '../void/interact.js';
import { properties } from '../void/properties.js';
import { ViewCube } from '../void/viewcube.js';
import { initSketchConstraintsSolver } from '../void/sketch/constraints.js';

const version = '0.1.0';
const dbindex = ["admin", "documents", "versions"];
const VOID_HOME_LEFT = Math.PI / 4;
// Match view direction along the test line vector (1,1,1) toward origin.
const VOID_HOME_UP = Math.acos(1 / Math.sqrt(3));
const LEFT_PANEL_WIDTH_KEY = 'left_panel_width';
const LEFT_PANEL_MIN_PX = 190;
const VIEWPORT_MIN_PX = 320;

function setupLeftPanelResize(db) {
    const content = $('content');
    const left = $('left-panel');
    const container = $('container');
    if (!content || !left || !container) return;

    let handle = $('left-panel-resizer');
    if (!handle) {
        handle = document.createElement('div');
        handle.id = 'left-panel-resizer';
        handle.title = 'Resize tree panel';
        content.insertBefore(handle, container);
    }

    const clampWidth = width => {
        const maxByLayout = Math.max(LEFT_PANEL_MIN_PX, (content.clientWidth || 1200) - VIEWPORT_MIN_PX);
        const max = Math.min(640, maxByLayout);
        return Math.max(LEFT_PANEL_MIN_PX, Math.min(max, Number(width) || LEFT_PANEL_MIN_PX));
    };

    const applyWidth = width => {
        const w = clampWidth(width);
        left.style.flex = `0 0 ${w}px`;
        left.style.width = `${w}px`;
        return w;
    };

    const persistWidth = width => {
        const w = applyWidth(width);
        try { localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(w)); } catch {}
        db?.admin?.put?.(LEFT_PANEL_WIDTH_KEY, w);
    };

    const restoreLocal = () => {
        try {
            const raw = localStorage.getItem(LEFT_PANEL_WIDTH_KEY);
            if (raw !== null) {
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) applyWidth(parsed);
            }
        } catch {}
    };

    restoreLocal();
    db?.admin?.get?.(LEFT_PANEL_WIDTH_KEY).then(width => {
        if (Number.isFinite(width)) applyWidth(width);
    });

    let dragging = false;
    let startX = 0;
    let startW = 0;

    const onMove = event => {
        if (!dragging) return;
        const dx = (event?.clientX || 0) - startX;
        const w = applyWidth(startW + dx);
        space.update();
        try { localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(w)); } catch {}
    };

    const onUp = event => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('left-panel-resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const dx = (event?.clientX || 0) - startX;
        persistWidth(startW + dx);
        space.update();
    };

    handle.onmousedown = event => {
        if (event.button !== 0) return;
        dragging = true;
        startX = event.clientX || 0;
        startW = left.getBoundingClientRect().width;
        document.body.classList.add('left-panel-resizing');
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        event.preventDefault();
        event.stopPropagation();
    };

    window.addEventListener('resize', () => {
        const curr = left.getBoundingClientRect().width;
        applyWidth(curr);
    });
}

// Main initialization function
async function init() {
    console.log({ void_form_init: version });

    // Initialize IndexedDB
    let stores = dataOpen('void', { stores: dbindex, version: 2 }).init();
    let db = api.db = {
        admin: stores.promise('admin'),
        documents: stores.promise('documents'),
        versions: stores.promise('versions')
    };

    // Mark init time and use count
    db.admin.put("init", Date.now());
    db.admin.get("uses").then(v => db.admin.put("uses", (v || 0) + 1));

    // Initialize API
    api.init();
    await initSketchConstraintsSolver();
    await api.solids.init();

    // Setup 3D workspace
    space.setAntiAlias(true);
    // Void owns its own keymap (Onshape-style); disable space.js defaults.
    space.useDefaultKeys(false);
    // Default void to orthographic (CAD-like), while saved camera projection
    // restoration below can still override per-document/session.
    space.init($('container'), delta => {}, true);
    api.sketchRuntime.init(space.world);
    api.solids.attach(space.world);

    // Initialize 2D overlay system
    overlay.init();

    // Initialize datum planes
    const datumGroup = datum.init({ size: 200, visible: true });
    space.world.add(datumGroup);

    // Add datum labels to overlay
    datum.updateLabels(overlay);

    // Hook overlay to update datum labels on camera movement
    overlay.onUpdate = () => {
        datum.updateLabels(overlay);
    };

    // Initialize interaction system (hover, select, drag)
    interact.init();
    api.document.bindRuntimeObservers();

    // Initialize ViewCube navigation widget
    const viewcube = new ViewCube({
        size: 80,        // Size in pixels
        padding: 20,     // Padding from corner
        cubeSize: 1.5    // 3D cube size
    });

    // Register viewcube to render after main scene
    space.afterRender((renderer) => {
        viewcube.render(renderer);
    });

    // Configure sky and platform
    space.sky.set({
        grid: false,
        color: 0x101010
    });

    space.view.setCtrl('void');
    // Rebind overlay camera/control hooks after Orbit -> Trackball swap.
    overlay.onProjectionChanged();
    space.view.setFitVisibleOnly(true);
    space.view.setHome(VOID_HOME_LEFT, VOID_HOME_UP);

    space.platform.set({
        visible: false,
        size: { width: 1000, depth: 1000, height: 0 },
        zoom: { reverse: true, speed: 1 },
        grid: {
            disabled: true,
        }
    });

    // Enable camera-aligned tracking plane for drag operations
    space.tracking.setMode('camera-aligned');
    space.tracking.setDistance(10000);  // Far behind camera to catch all rays

    // Save camera position on movement
    space.platform.onMove(() => {
        db.admin.put('camera', {
            place: space.view.save(),
            focus: space.view.getFocus(),
            projection: space.view.getProjection()
        });
    }, 100);

    // Restore saved camera position
    db.admin.get('camera').then(cam => {
        if (cam && cam.place) {
            if (cam.projection && cam.projection !== space.view.getProjection()) {
                space.view.setProjection(cam.projection);
                space.view.setCtrl('void');
                overlay.onProjectionChanged();
                toolbar.updateProjectionLabel();
            }
            space.view.load(cam.place);
            if (cam.focus) {
                space.view.setFocus(cam.focus);
            }
        } else {
            // Use void-specific default home view when no saved camera exists.
            space.view.home();
        }
    });

    // Build UI components
    toolbar.build();
    toolbar.updateProjectionLabel();
    properties.init();
    tree.build();
    setupLeftPanelResize(db);

    // Document history hotkeys: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+Y
    window.addEventListener('keydown', async event => {
        const isMeta = event.metaKey || event.ctrlKey;
        if (!isMeta) return;

        const activeTag = document.activeElement?.tagName;
        const editing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
        if (editing) return;

        const key = event.key.toLowerCase();
        let handled = false;

        if (key === 'z' && event.shiftKey) {
            handled = await api.document.redo();
        } else if (key === 'z') {
            handled = await api.document.undo();
        } else if (key === 'y') {
            handled = await api.document.redo();
        }

        if (handled) {
            event.preventDefault();
            toolbar.updateDocumentTitle();
            tree.render();
        }
    });

    // Ensure scene redraw when app state changes from non-canvas UI interactions
    // (tree toggles, toolbar actions, property edits, etc.).
    window.addEventListener('void-state-change', () => {
        space.update();
    });

    // Keep rendering responsive for keyboard-driven interactions even when
    // the pointer is not over the canvas and idle-throttling is active.
    window.addEventListener('keydown', event => {
        const activeTag = document.activeElement?.tagName;
        const editing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
        if (!editing) {
            space.update();
        }
    });

    // Restore last active document, or seed a new blank one.
    await api.document.restoreOrCreate();
    api.geometryStore?.seedFromDocument?.(api.document.current);
    api.sketchRuntime.sync();
    await api.solids.rebuild('startup');
    api.geometryStore?.seedFromDocument?.(api.document.current);
    toolbar.updateDocumentTitle();
    tree.render();

    // TEST: Add example overlay elements
    // These demonstrate the 2D overlay tracking 3D points
    if (true) { // Set to false to disable test overlays
        const { THREE } = window;

        // Show overlay
        overlay.show();

        // Add test points at origin and along axes
        overlay.add('origin-point', 'point', {
            pos3d: new THREE.Vector3(0, 0, 0),
            radius: 4.8,
            color: 'rgba(140, 140, 140, 0.45)',
            stroke: '#5a9fd4',
            strokeWidth: 2
        });
        api.origin.syncOverlayPoint();

        console.log({ test_overlays_added: 1 });
    }

    // Hide loading curtain
    const curtain = $('curtain');
    if (curtain) {
        curtain.style.opacity = '0';
        curtain.style.transition = 'opacity 0.3s';
        setTimeout(() => {
            curtain.style.display = 'none';
        }, 300);
    }

    console.log({ void_form_ready: true });
}

// Wait for DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
