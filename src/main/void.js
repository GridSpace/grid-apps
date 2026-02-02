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
    space.useDefaultKeys(true);
    space.init($('container'), delta => {}, false);

    // Configure sky and platform
    space.sky.set({
        grid: false,
        color: 0x101010
    });

    space.platform.set({
        visible: false,
        size: { width: 1000, depth: 1000, height: 0 },
        zoom: { reverse: true, speed: 1 },
        grid: {
            disabled: true,
        },
        origin: {
            show: true
        }
    });

    // Save camera position on movement
    space.platform.onMove(() => {
        db.admin.put('camera', {
            place: space.view.save(),
            focus: space.view.getFocus()
        });
    }, 100);

    // Restore saved camera position
    db.admin.get('camera').then(cam => {
        if (cam && cam.place) {
            space.view.load(cam.place);
            if (cam.focus) {
                space.view.setFocus(cam.focus);
            }
        }
    });

    // Build UI components
    toolbar.build();
    tree.build();

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
