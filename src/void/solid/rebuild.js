/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { buildSeedProvenance } from './provenance.js';
import { extrudePolygons } from './kernel.js';

function profileLoopFromRuntime(api, sketchId, profileId) {
    const rec = api.sketchRuntime?.getRecord?.(sketchId);
    const view = rec?.entityViews?.get?.(profileId);
    const loop = view?.object?.userData?.sketchProfileLoop || view?.entity?.loop || null;
    return Array.isArray(loop) && loop.length >= 3 ? loop : null;
}

function makeBodyId(featureId, index) {
    return `${featureId}:body:${index}`;
}

function basisFromPlaneFrame(frame) {
    const origin = {
        x: Number(frame?.origin?.x ?? 0),
        y: Number(frame?.origin?.y ?? 0),
        z: Number(frame?.origin?.z ?? 0)
    };
    const normalRaw = {
        x: Number(frame?.normal?.x ?? 0),
        y: Number(frame?.normal?.y ?? 0),
        z: Number(frame?.normal?.z ?? 1)
    };
    const nxLen = Math.hypot(normalRaw.x, normalRaw.y, normalRaw.z) || 1;
    const normal = {
        x: normalRaw.x / nxLen,
        y: normalRaw.y / nxLen,
        z: normalRaw.z / nxLen
    };
    const xAxisRaw = {
        x: Number(frame?.x_axis?.x ?? 1),
        y: Number(frame?.x_axis?.y ?? 0),
        z: Number(frame?.x_axis?.z ?? 0)
    };
    // remove normal component
    const xDotN = xAxisRaw.x * normal.x + xAxisRaw.y * normal.y + xAxisRaw.z * normal.z;
    let xAxis = {
        x: xAxisRaw.x - normal.x * xDotN,
        y: xAxisRaw.y - normal.y * xDotN,
        z: xAxisRaw.z - normal.z * xDotN
    };
    const xLen = Math.hypot(xAxis.x, xAxis.y, xAxis.z) || 1;
    xAxis = { x: xAxis.x / xLen, y: xAxis.y / xLen, z: xAxis.z / xLen };
    // y = n x x
    const yAxis = {
        x: normal.y * xAxis.z - normal.z * xAxis.y,
        y: normal.z * xAxis.x - normal.x * xAxis.z,
        z: normal.x * xAxis.y - normal.y * xAxis.x
    };
    return { origin, xAxis, yAxis, normal };
}

function transformMeshToWorld(mesh, basis, zShift = 0) {
    const numProp = Math.max(3, Number(mesh?.numProp || 3));
    const verts = mesh?.vertProperties;
    const triVerts = mesh?.triVerts;
    if (!verts?.length || !triVerts?.length) return null;
    const vertCount = Math.floor(verts.length / numProp);
    const positions = new Float32Array(vertCount * 3);
    const { origin, xAxis, yAxis, normal } = basis;
    for (let i = 0; i < vertCount; i++) {
        const o = i * numProp;
        const lx = Number(verts[o] || 0);
        const ly = Number(verts[o + 1] || 0);
        const lz = Number(verts[o + 2] || 0) + (Number(zShift) || 0);
        const wx = origin.x + xAxis.x * lx + yAxis.x * ly + normal.x * lz;
        const wy = origin.y + xAxis.y * lx + yAxis.y * ly + normal.y * lz;
        const wz = origin.z + xAxis.z * lx + yAxis.z * ly + normal.z * lz;
        const p = i * 3;
        positions[p] = wx;
        positions[p + 1] = wy;
        positions[p + 2] = wz;
    }
    return {
        positions,
        indices: Uint32Array.from(triVerts)
    };
}

async function rebuildGeneratedSolids(api, options = {}) {
    const doc = api.document.current;
    if (!doc) return { solids: [], meshCache: new Map() };

    const builtFeatures = api.features.listBuilt();
    const solids = [];
    const meshCache = new Map();
    let bodySeq = 0;

    for (const feature of builtFeatures) {
        if (feature?.type !== 'extrude') continue;
        const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
        if (!profiles.length) continue;
        const params = feature?.params || {};
        const depth = Math.max(0.0001, Math.abs(Number(params.depth ?? params.distance ?? 1)));
        const symmetric = params.symmetric === true;
        const direction = params.direction === 'reverse' ? 'reverse' : 'normal';
        const localZShift = symmetric ? (-depth / 2) : (direction === 'reverse' ? -depth : 0);

        for (const profileTarget of profiles) {
            const sketchId = profileTarget?.sketchId || null;
            const profileId = profileTarget?.profileId || null;
            if (!sketchId || !profileId) continue;
            const loop = profileLoopFromRuntime(api, sketchId, profileId);
            const sketchFeature = api.features.findById(sketchId);
            const basis = basisFromPlaneFrame(sketchFeature?.plane || {});
            const bodyIndex = bodySeq++;
            const id = makeBodyId(feature.id, bodyIndex);
            const body = {
                id,
                name: `${feature.name || 'Extrude'}-${bodyIndex + 1}`,
                visible: feature.visible !== false,
                source: {
                    feature_id: feature.id,
                    feature_type: feature.type,
                    profile: profileTarget
                },
                provenance: buildSeedProvenance(feature, profileTarget, bodyIndex),
                mesh: null,
                status: loop ? 'pending_manifold' : 'missing_profile_loop'
            };

            if (loop) {
                // Initial direct-manifold path. Full boolean/replay topology comes next.
                const result = await extrudePolygons([loop.map(p => [p.x || 0, p.y || 0])], depth);
                if (result?.mesh) {
                    const meshWorld = transformMeshToWorld(result.mesh, basis, localZShift);
                    body.status = 'manifold_mesh_ready';
                    body.mesh = {
                        tri_count: (result.mesh?.triVerts?.length || 0) / 3,
                        vert_count: (result.mesh?.vertProperties?.length || 0) / Math.max(1, result.mesh?.numProp || 3)
                    };
                    body.extrude = {
                        depth,
                        direction,
                        symmetric
                    };
                    if (meshWorld) {
                        meshCache.set(id, meshWorld);
                    }
                    result.manifold?.delete?.();
                }
            }

            solids.push(body);
        }
    }

    doc.generated = doc.generated || {};
    doc.generated.solids = solids;
    if (options.persist !== false) {
        await api.document.save({
            kind: 'micro',
            opType: 'solid.rebuild',
            undoable: false,
            clearRedo: false,
            payload: {
                reason: options.reason || 'rebuild',
                solids: solids.length
            }
        });
    }
    return { solids, meshCache };
}

export {
    rebuildGeneratedSolids
};
