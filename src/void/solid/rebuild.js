/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { buildSeedProvenance } from './provenance.js';
import { extrudePolygons, booleanMeshes } from './kernel.js';

function profileLoopFromRuntime(api, sketchId, profileId) {
    const rec = api.sketchRuntime?.getRecord?.(sketchId);
    const view = rec?.entityViews?.get?.(profileId);
    const loop = view?.object?.userData?.sketchProfileLoop || view?.entity?.loop || null;
    return Array.isArray(loop) && loop.length >= 3 ? loop : null;
}

function makeBodyId(featureId, index) {
    return `${featureId}:body:${index}`;
}

function getSketchIdsForSolid(solid) {
    const ids = new Set();
    const add = value => {
        if (value) ids.add(value);
    };
    add(solid?.source?.profile?.sketchId);
    for (const sid of solid?.source?.sketch_ids || []) {
        add(sid);
    }
    add(solid?.provenance?.source?.profile?.sketchId);
    for (const face of solid?.provenance?.faces || []) {
        add(face?.source?.sketchId);
    }
    return ids;
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
        if (feature?.type === 'extrude') {
            const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
            if (!profiles.length) continue;
            const params = feature?.params || {};
            const depth = Math.max(0.0001, Math.abs(Number(params.depth ?? params.distance ?? 1)));
            const symmetric = params.symmetric === true;
            const direction = params.direction === 'reverse' ? 'reverse' : 'normal';
            const operation = ['new', 'add', 'subtract'].includes(String(params.operation || 'new'))
                ? String(params.operation || 'new')
                : 'new';
            const localZShift = symmetric ? (-depth / 2) : (direction === 'reverse' ? -depth : 0);
            const createdBodyIds = [];

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
                            createdBodyIds.push(id);
                        }
                        result.manifold?.delete?.();
                    }
                }

                solids.push(body);
            }
            if ((operation === 'add' || operation === 'subtract') && createdBodyIds.length) {
                const targetIds = Array.isArray(feature?.input?.targets)
                    ? feature.input.targets.map(id => String(id || '')).filter(Boolean)
                    : [];
                const createdSolids = createdBodyIds
                    .map(id => solids.find(s => s?.id === id))
                    .filter(Boolean);
                const targetSolids = targetIds
                    .map(id => solids.find(s => s?.id === id))
                    .filter(Boolean);
                const toolMeshes = createdSolids
                    .map(s => meshCache.get(s.id))
                    .filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
                const targetMeshes = targetSolids
                    .map(s => meshCache.get(s.id))
                    .filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
                let merge = null;
                if (operation === 'add') {
                    const meshes = [...targetMeshes, ...toolMeshes];
                    if (meshes.length >= 2) {
                        merge = await booleanMeshes(meshes, 'add');
                    }
                } else if (operation === 'subtract') {
                    if (targetMeshes.length && toolMeshes.length) {
                        merge = await booleanMeshes({ mode: 'subtract', targets: targetMeshes, tools: toolMeshes });
                    }
                }
                if (merge?.mesh?.positions?.length && merge?.mesh?.indices?.length) {
                    const consumed = new Set([...targetSolids.map(s => s.id), ...createdSolids.map(s => s.id)]);
                    const sketchIds = new Set();
                    for (const solid of [...targetSolids, ...createdSolids]) {
                        for (const sid of getSketchIdsForSolid(solid)) {
                            sketchIds.add(sid);
                        }
                        meshCache.delete(solid?.id);
                    }
                    const kept = solids.filter(s => !consumed.has(s?.id));
                    solids.length = 0;
                    solids.push(...kept);
                    const bodyIndex = bodySeq++;
                    const id = makeBodyId(feature.id, bodyIndex);
                    const body = {
                        id,
                        name: `${feature.name || 'Extrude'}-${bodyIndex + 1}`,
                        visible: feature.visible !== false,
                        source: {
                            feature_id: feature.id,
                            feature_type: feature.type,
                            operation,
                            targets: targetIds,
                            tools: createdBodyIds,
                            sketch_ids: Array.from(sketchIds)
                        },
                        provenance: {
                            source: {
                                feature_id: feature.id,
                                feature_type: feature.type,
                                operation,
                                targets: targetIds,
                                tools: createdBodyIds
                            },
                            parents: [...targetIds, ...createdBodyIds]
                        },
                        mesh: {
                            tri_count: (merge.mesh?.indices?.length || 0) / 3,
                            vert_count: (merge.mesh?.positions?.length || 0) / 3
                        },
                        status: 'manifold_extrude_boolean_ready'
                    };
                    meshCache.set(id, merge.mesh);
                    solids.push(body);
                }
            }
            continue;
        }

        if (feature?.type === 'boolean') {
            const mode = String(feature?.params?.mode || 'add');
            const legacyTargets = Array.isArray(feature?.input?.solids)
                ? feature.input.solids.map(id => String(id || '')).filter(Boolean)
                : [];
            const targets = Array.isArray(feature?.input?.targets)
                ? feature.input.targets.map(id => String(id || '')).filter(Boolean)
                : legacyTargets;
            const tools = Array.isArray(feature?.input?.tools)
                ? feature.input.tools.map(id => String(id || '')).filter(Boolean)
                : [];
            const selectedIds = mode === 'subtract'
                ? Array.from(new Set([...targets, ...tools]))
                : targets.slice();
            if (!selectedIds.length) continue;
            const selectedSet = new Set(selectedIds);
            const targetSolids = targets
                .map(id => solids.find(s => s?.id === id))
                .filter(Boolean);
            const toolSolids = tools
                .map(id => solids.find(s => s?.id === id))
                .filter(Boolean);
            if (mode === 'subtract') {
                if (!targetSolids.length || !toolSolids.length) continue;
            } else if (targetSolids.length < 2) {
                continue;
            }
            const targetMeshes = targetSolids
                .map(s => meshCache.get(s.id))
                .filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
            const toolMeshes = toolSolids
                .map(s => meshCache.get(s.id))
                .filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
            if (mode === 'subtract') {
                if (!targetMeshes.length || !toolMeshes.length) continue;
            } else if (targetMeshes.length < 2) {
                continue;
            }
            const sketchIds = new Set();
            for (const solid of [...targetSolids, ...toolSolids]) {
                for (const sid of getSketchIdsForSolid(solid)) {
                    sketchIds.add(sid);
                }
            }
            const result = mode === 'subtract'
                ? await booleanMeshes({ mode, targets: targetMeshes, tools: toolMeshes })
                : await booleanMeshes(targetMeshes, mode);
            const kept = solids.filter(s => !selectedSet.has(s?.id));
            for (const target of [...targetSolids, ...toolSolids]) {
                meshCache.delete(target?.id);
            }
            solids.length = 0;
            solids.push(...kept);
            if (result?.mesh?.positions?.length && result?.mesh?.indices?.length) {
                const bodyIndex = bodySeq++;
                const id = makeBodyId(feature.id, bodyIndex);
                const body = {
                    id,
                    name: `${feature.name || 'Boolean'}-${bodyIndex + 1}`,
                    visible: feature.visible !== false,
                    source: {
                        feature_id: feature.id,
                        feature_type: feature.type,
                        targets,
                        tools,
                        solids: selectedIds,
                        mode,
                        sketch_ids: Array.from(sketchIds)
                    },
                    provenance: {
                        source: {
                            feature_id: feature.id,
                            feature_type: feature.type,
                            targets,
                            tools,
                            solids: selectedIds,
                            mode
                        },
                        parents: selectedIds
                    },
                    mesh: {
                        tri_count: (result.mesh?.indices?.length || 0) / 3,
                        vert_count: (result.mesh?.positions?.length || 0) / 3
                    },
                    status: 'manifold_boolean_ready'
                };
                meshCache.set(id, result.mesh);
                solids.push(body);
            }
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
