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

async function booleanMeshes(input, mode = 'add') {
    const inst = await ensureKernel();
    if (!inst?.Manifold) {
        return null;
    }
    const options = Array.isArray(input)
        ? { meshes: input, mode }
        : { ...(input || {}), mode: String((input || {}).mode || mode || 'add') };
    const op = String(options.mode || 'add');
    const meshes = Array.isArray(options.meshes) ? options.meshes : [];
    const targetMeshes = Array.isArray(options.targets) ? options.targets : null;
    const toolMeshes = Array.isArray(options.tools) ? options.tools : null;
    const manifolds = [];
    let result = null;
    try {
        const toManifold = meshData => {
            const kernelMesh = toKernelMesh(inst, meshData);
            return kernelMesh ? new inst.Manifold(kernelMesh) : null;
        };
        const combine = (list, kind = 'add') => {
            if (!Array.isArray(list) || !list.length) return null;
            if (list.length === 1) return list[0];
            if (kind === 'intersect') return inst.Manifold.intersection(list);
            if (kind === 'subtract') return inst.Manifold.difference(list);
            return inst.Manifold.union(list);
        };

        if (op === 'subtract' && targetMeshes && toolMeshes) {
            const targetMfs = targetMeshes.map(toManifold).filter(Boolean);
            const toolMfs = toolMeshes.map(toManifold).filter(Boolean);
            manifolds.push(...targetMfs, ...toolMfs);
            if (!targetMfs.length || !toolMfs.length) {
                return null;
            }
            const targetUnion = combine(targetMfs, 'add');
            const toolUnion = combine(toolMfs, 'add');
            if (!targetUnion || !toolUnion) return null;
            if (!targetMfs.includes(targetUnion)) manifolds.push(targetUnion);
            if (!toolMfs.includes(toolUnion)) manifolds.push(toolUnion);
            result = inst.Manifold.difference([targetUnion, toolUnion]);
        } else {
            for (const meshData of meshes) {
                const manifold = toManifold(meshData);
                if (!manifold) continue;
                manifolds.push(manifold);
            }
            if (manifolds.length < 2) {
                return null;
            }
            if (op === 'intersect') {
                result = inst.Manifold.intersection(manifolds);
            } else {
                result = inst.Manifold.union(manifolds);
            }
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
