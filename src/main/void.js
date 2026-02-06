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
import { ViewCube } from '../void/viewcube.js';

const version = '0.1.0';
const dbindex = ["admin", "documents", "versions"];
const VOID_HOME_LEFT = Math.PI / 4;
// Match view direction along the test line vector (1,1,1) toward origin.
const VOID_HOME_UP = Math.acos(1 / Math.sqrt(3));

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

    // Setup 3D workspace
    space.setAntiAlias(true);
    space.useDefaultKeys(true);
    space.init($('container'), delta => {}, false);

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
    space.view.setHome(VOID_HOME_LEFT, VOID_HOME_UP);

    space.platform.set({
        visible: false,
        size: { width: 1000, depth: 1000, height: 0 },
        zoom: { reverse: true, speed: 1 },
        grid: {
            disabled: true,
        },
        origin: true  // Enable origin indicator
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
    tree.build();

    // Restore last active document, or seed a new blank one.
    await api.document.restoreOrCreate();
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
            radius: 6,
            color: '#ffffff',
            stroke: '#5a9fd4',
            strokeWidth: 2
        });

        overlay.add('origin-label', 'text', {
            pos3d: new THREE.Vector3(0, 0, 10),
            text: 'Origin (0,0,0)',
            color: '#ffffff',
            fontSize: 14
        });

        // X axis point (red)
        overlay.add('x-point', 'point', {
            pos3d: new THREE.Vector3(100, 0, 0),
            radius: 5,
            color: '#ff6666'
        });

        overlay.add('x-label', 'text', {
            pos3d: new THREE.Vector3(100, 0, 10),
            text: 'X+100',
            color: '#ff6666',
            fontSize: 12
        });

        // Y axis point (green)
        overlay.add('y-point', 'point', {
            pos3d: new THREE.Vector3(0, 100, 0),
            radius: 5,
            color: '#66ff66'
        });

        overlay.add('y-label', 'text', {
            pos3d: new THREE.Vector3(0, 100, 10),
            text: 'Y+100',
            color: '#66ff66',
            fontSize: 12
        });

        // Z axis point (blue)
        overlay.add('z-point', 'point', {
            pos3d: new THREE.Vector3(0, 0, 100),
            radius: 5,
            color: '#6666ff'
        });

        overlay.add('z-label', 'text', {
            pos3d: new THREE.Vector3(0, 0, 110),
            text: 'Z+100',
            color: '#6666ff',
            fontSize: 12
        });

        // Add a test line between two points
        overlay.add('test-line', 'line', {
            pos3d: new THREE.Vector3(0, 0, 0),
            pos3d2: new THREE.Vector3(50, 50, 50),
            color: '#5a9fd4',
            width: 2,
            dashed: true
        });

        console.log({ test_overlays_added: 7 });
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
