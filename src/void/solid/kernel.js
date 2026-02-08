/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import manifold from '../../ext/manifold.js';

let _instance = null;
let _initPromise = null;

function locateFile(path) {
    return `../wasm/${path}`;
}

async function ensureKernel() {
    if (_instance) return _instance;
    if (_initPromise) return _initPromise;
    _initPromise = manifold({ locateFile }).then(inst => {
        inst.setup();
        _instance = inst;
        return _instance;
    }).catch(error => {
        console.warn('void.solid.kernel init failed', error);
        return null;
    });
    return _initPromise;
}

function isReady() {
    return !!_instance;
}

function getInstance() {
    return _instance;
}

async function extrudePolygons(polygons, height = 1) {
    const inst = await ensureKernel();
    if (!inst?.Manifold || !Array.isArray(polygons) || !polygons.length) {
        return null;
    }
    try {
        const man = inst.Manifold.extrude(polygons, Number(height) || 1);
        const mesh = man.getMesh();
        // Callers are responsible for consuming mesh data and deleting manifold.
        return { manifold: man, mesh };
    } catch (error) {
        console.warn('void.solid.kernel extrude failed', error);
        return null;
    }
}

export {
    ensureKernel,
    isReady,
    getInstance,
    extrudePolygons
};
