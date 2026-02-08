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

function toKernelMesh(inst, meshData) {
    const positions = meshData?.positions;
    const indices = meshData?.indices;
    if (!positions?.length || !indices?.length) return null;
    const vertCount = Math.floor(positions.length / 3);
    const props = new Float32Array(vertCount * 3);
    props.set(positions);
    return new inst.Mesh({
        numProp: 3,
        vertProperties: props,
        triVerts: Uint32Array.from(indices)
    });
}

function fromKernelMesh(mesh) {
    const numProp = Math.max(3, Number(mesh?.numProp || 3));
    const verts = mesh?.vertProperties;
    const triVerts = mesh?.triVerts;
    if (!verts?.length || !triVerts?.length) return null;
    const vertCount = Math.floor(verts.length / numProp);
    const positions = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
        const src = i * numProp;
        const dst = i * 3;
        positions[dst] = Number(verts[src] || 0);
        positions[dst + 1] = Number(verts[src + 1] || 0);
        positions[dst + 2] = Number(verts[src + 2] || 0);
    }
    return {
        positions,
        indices: Uint32Array.from(triVerts)
    };
}

async function booleanMeshes(meshes, mode = 'add') {
    const inst = await ensureKernel();
    if (!inst?.Manifold || !Array.isArray(meshes) || meshes.length < 2) {
        return null;
    }
    const manifolds = [];
    let result = null;
    try {
        for (const meshData of meshes) {
            const kernelMesh = toKernelMesh(inst, meshData);
            if (!kernelMesh) continue;
            manifolds.push(new inst.Manifold(kernelMesh));
        }
        if (manifolds.length < 2) {
            return null;
        }
        const op = String(mode || 'add');
        if (op === 'subtract') {
            result = inst.Manifold.difference(manifolds);
        } else if (op === 'intersect') {
            result = inst.Manifold.intersection(manifolds);
        } else {
            result = inst.Manifold.union(manifolds);
        }
        const mesh = result?.getMesh?.();
        return mesh ? { mesh: fromKernelMesh(mesh) } : null;
    } catch (error) {
        console.warn('void.solid.kernel boolean failed', error);
        return null;
    } finally {
        for (const manifold of manifolds) {
            manifold?.delete?.();
        }
        result?.delete?.();
    }
}

export {
    ensureKernel,
    isReady,
    getInstance,
    extrudePolygons,
    booleanMeshes
};
