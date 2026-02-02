/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../add/array.js';
import '../add/class.js';
import '../add/three.js';

import { $ } from '../moto/webui.js';
import { api } from '../void/api.js';
import { space } from '../moto/space.js';
import { broker } from '../moto/broker.js';
import { open as dataOpen } from '../data/index.js';

import '../void/toolbar.js';
import '../void/tree.js';

const version = '0.1.0';
const dbindex = ["admin", "documents", "features"];

// Main initialization function
function init() {
    console.log({ void_form_init: version });

    // Initialize IndexedDB
    let stores = dataOpen('void', { stores: dbindex, version: 1 }).init();
    let db = api.db = {
        admin: stores.promise('admin'),
        documents: stores.promise('documents'),
        features: stores.promise('features')
    };

    // Mark init time and use count
    db.admin.put("init", Date.now());
    db.admin.get("uses").then(v => db.admin.put("uses", (v || 0) + 1));

    // Initialize API
    api.init();

    // Setup 3D workspace
    space.setAntiAlias(true);
    space.useDefaultKeys(false);
    space.init($('container'), () => {}, false);

    // Configure sky and platform
    space.sky.set({
        grid: false,
        color: 0x1a1a1a
    });

    space.platform.set({
        volume: true,
        round: false,
        opacity: 0.1,
        color: 0x404040,
        size: { width: 300, depth: 300, height: 300 },
        grid: {
            major: 25,
            minor: 5,
            zOffset: 0,
            colorMajor: 0x404040,
            colorMinor: 0x303030,
            colorX: 0x884444,
            colorY: 0x444488
        }
    });

    // Save camera position on movement
    space.platform.onMove(() => {
        db.admin.put('camera', {
            place: space.view.save(),
            focus: space.view.getFocus()
        });
    }, 100);

    // Build UI
    broker.publish('ui.build');

    // Initialize camera controls
    api.camera.init();

    // Restore saved camera position
    db.admin.get('camera').then(cam => {
        if (cam && cam.place) {
            space.view.load(cam.place);
            if (cam.focus) {
                space.view.setFocus(cam.focus);
            }
        }
    });

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
