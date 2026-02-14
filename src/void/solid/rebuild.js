/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { buildSeedProvenance } from './provenance.js';
import { extrudePolygons, booleanMeshes } from './kernel.js';
import { ClipperLib } from '../../ext/clip2.esm.js';
import { applyChamferFeature } from './chamfer.js';

const CLIPPER_SCALE = 100000;

function resolveProfileTargetRef(profileTarget = {}) {
    const regionId = String(profileTarget?.region_id || '');
    const match = regionId.match(/^profile:([^:]+):([^:]+)$/);
    if (!match) return { regionId: null, sketchId: null, profileId: null, key: null };
    const sketchId = match[1];
    const profileId = match[2];
    return { regionId, sketchId, profileId, key: regionId };
}

function profileLoopsFromRuntime(api, profileTarget) {
    const { sketchId, profileId } = resolveProfileTargetRef(profileTarget);
    if (!sketchId || !profileId) return null;
    const rec = api.sketchRuntime?.getRecord?.(sketchId);
    const view = rec?.entityViews?.get?.(profileId);
    const loops = view?.object?.userData?.sketchProfileLoops || view?.entity?.loops || null;
    if (Array.isArray(loops) && loops.length) {
        const out = loops.filter(loop => Array.isArray(loop) && loop.length >= 3);
        return out.length ? out : null;
    }
    const loop = view?.object?.userData?.sketchProfileLoop || view?.entity?.loop || null;
    if (Array.isArray(loop) && loop.length >= 3) return [loop];
    return null;
}

function profileLoopsFromSnapshot(snapshot, profileTarget) {
    const { sketchId, profileId, key } = resolveProfileTargetRef(profileTarget);
    if (!key || !sketchId || !profileId) return null;
    const map = snapshot?.profileLoops || {};
    const loops = map[key];
    if (!Array.isArray(loops) || !loops.length) return null;
    return loops
        .filter(loop => Array.isArray(loop) && loop.length >= 3)
        .map(loop => loop.map(p => ({ x: Number(p?.x || 0), y: Number(p?.y || 0) })));
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

function polygonSignedArea(loop) {
    if (!Array.isArray(loop) || loop.length < 3) return 0;
    let area2 = 0;
    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        area2 += (a.x || 0) * (b.y || 0) - (b.x || 0) * (a.y || 0);
    }
    return area2 * 0.5;
}

function ensureLoopWinding(loop, ccw = true) {
    if (!Array.isArray(loop) || loop.length < 3) return loop;
    const isCCW = polygonSignedArea(loop) > 0;
    if ((ccw && isCCW) || (!ccw && !isCCW)) return loop;
    return loop.slice().reverse();
}

function toClipperPath(loop) {
    if (!Array.isArray(loop) || loop.length < 3) return null;
    const path = [];
    for (const p of loop) {
        path.push({
            X: Math.round((p?.x || 0) * CLIPPER_SCALE),
            Y: Math.round((p?.y || 0) * CLIPPER_SCALE)
        });
    }
    return path.length >= 3 ? path : null;
}

function fromClipperPath(path) {
    if (!Array.isArray(path) || path.length < 3) return null;
    return path.map(pt => ({
        x: Number(pt?.X || 0) / CLIPPER_SCALE,
        y: Number(pt?.Y || 0) / CLIPPER_SCALE
    }));
}

function unionSelectedRegions(profileLoopsList) {
    if (!Array.isArray(profileLoopsList) || !profileLoopsList.length || !ClipperLib?.Clipper) {
        return [];
    }
    const subject = [];
    for (const loops of profileLoopsList) {
        if (!Array.isArray(loops)) continue;
        for (const loop of loops) {
            const path = toClipperPath(loop);
            if (path) subject.push(path);
        }
    }
    if (!subject.length) return [];
    const clip = new ClipperLib.Clipper();
    clip.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
    const tree = new ClipperLib.PolyTree();
    const ok = clip.Execute(
        ClipperLib.ClipType.ctUnion,
        tree,
        ClipperLib.PolyFillType.pftEvenOdd,
        ClipperLib.PolyFillType.pftEvenOdd
    );
    if (!ok) return [];
    const exPolys = ClipperLib.JS?.PolyTreeToExPolygons
        ? ClipperLib.JS.PolyTreeToExPolygons(tree)
        : [];
    const out = [];
    for (const ex of exPolys || []) {
        const outer = fromClipperPath(ex?.outer);
        if (!outer || outer.length < 3) continue;
        const holes = [];
        for (const hole of ex?.holes || []) {
            const loop = fromClipperPath(hole);
            if (loop && loop.length >= 3) holes.push(loop);
        }
        out.push({
            outer: ensureLoopWinding(outer, true),
            holes: holes.map(loop => ensureLoopWinding(loop, false))
        });
    }
    return out;
}

function pointInLoop(point, loop) {
    if (!point || !Array.isArray(loop) || loop.length < 3) return false;
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
        const xi = Number(loop[i]?.x || 0);
        const yi = Number(loop[i]?.y || 0);
        const xj = Number(loop[j]?.x || 0);
        const yj = Number(loop[j]?.y || 0);
        const intersects = ((yi > point.y) !== (yj > point.y))
            && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-12) + xi);
        if (intersects) inside = !inside;
    }
    return inside;
}

function pointInRegion(point, region) {
    if (!point || !region?.outer) return false;
    if (!pointInLoop(point, region.outer)) return false;
    const holes = Array.isArray(region.holes) ? region.holes : [];
    for (const hole of holes) {
        if (pointInLoop(point, hole)) return false;
    }
    return true;
}

function loopCentroid(loop) {
    if (!Array.isArray(loop) || loop.length < 3) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const p of loop) {
        if (!p) continue;
        sx += Number(p.x || 0);
        sy += Number(p.y || 0);
        n++;
    }
    if (!n) return null;
    return { x: sx / n, y: sy / n };
}

async function rebuildGeneratedSolidsFromSnapshot(snapshot, options = {}) {
    const builtFeatures = Array.isArray(snapshot?.builtFeatures) ? snapshot.builtFeatures : [];
    const sketchPlanes = snapshot?.sketchPlanes || {};
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
            const bySketch = new Map();
            for (const profileTarget of profiles) {
                const { sketchId, profileId } = resolveProfileTargetRef(profileTarget);
                if (!sketchId || !profileId) continue;
                const profileLoops = profileLoopsFromSnapshot(snapshot, profileTarget);
                if (!profileLoops?.length) continue;
                const basis = basisFromPlaneFrame(sketchPlanes?.[sketchId] || {});
                if (!bySketch.has(sketchId)) {
                    bySketch.set(sketchId, { sketchId, basis, entries: [] });
                }
                bySketch.get(sketchId).entries.push({ profileTarget, profileLoops });
            }

            for (const sketchPack of bySketch.values()) {
                const resolvedRegions = unionSelectedRegions(sketchPack.entries.map(e => e.profileLoops));
                for (const region of resolvedRegions) {
                    const polygons = [
                        region.outer,
                        ...(region.holes || [])
                    ].map(loop => loop.map(p => [p.x || 0, p.y || 0]));
                    if (!polygons.length) continue;
                    const bodyIndex = bodySeq++;
                    const id = makeBodyId(feature.id, bodyIndex);
                    let primaryTarget = null;
                    const contributingProfileKeys = [];
                    for (const entry of sketchPack.entries) {
                        const { key } = resolveProfileTargetRef(entry?.profileTarget || {});
                        if (!key) continue;
                        let contributes = false;
                        const loops = Array.isArray(entry?.profileLoops) ? entry.profileLoops : [];
                        for (const loop of loops) {
                            const sample = loopCentroid(loop);
                            if (sample && pointInRegion(sample, region)) {
                                contributes = true;
                                break;
                            }
                        }
                        if (contributes) {
                            contributingProfileKeys.push(key);
                            if (!primaryTarget) primaryTarget = entry.profileTarget || null;
                        }
                    }
                    if (!primaryTarget) {
                        primaryTarget = sketchPack.entries[0]?.profileTarget || null;
                    }
                    const primaryRef = resolveProfileTargetRef(primaryTarget || {});
                    if (!contributingProfileKeys.length && primaryRef?.key) {
                        contributingProfileKeys.push(primaryRef.key);
                    }
                    const body = {
                        id,
                        name: `${feature.name || 'Extrude'}-${bodyIndex + 1}`,
                        visible: feature.visible !== false,
                        source: {
                            feature_id: feature.id,
                            feature_type: feature.type,
                            profile: primaryTarget,
                            profile_keys: contributingProfileKeys
                        },
                        provenance: buildSeedProvenance(feature, primaryTarget, bodyIndex),
                        mesh: null,
                        status: 'pending_manifold'
                    };
                    const result = await extrudePolygons(polygons, depth);
                    if (result?.mesh) {
                        const meshWorld = transformMeshToWorld(result.mesh, sketchPack.basis, localZShift);
                        body.status = 'manifold_mesh_ready';
                        body.mesh = {
                            tri_count: (result.mesh?.triVerts?.length || 0) / 3,
                            vert_count: (result.mesh?.vertProperties?.length || 0) / Math.max(1, result.mesh?.numProp || 3)
                        };
                        body.extrude = { depth, direction, symmetric };
                        if (meshWorld) {
                            meshCache.set(id, meshWorld);
                            createdBodyIds.push(id);
                        }
                        result.manifold?.delete?.();
                    }
                    solids.push(body);
                }
            }

            if ((operation === 'add' || operation === 'subtract') && createdBodyIds.length) {
                const targetIds = Array.isArray(feature?.input?.targets)
                    ? feature.input.targets.map(id => String(id || '')).filter(Boolean)
                    : [];
                const createdSolids = createdBodyIds.map(id => solids.find(s => s?.id === id)).filter(Boolean);
                const targetSolids = targetIds.map(id => solids.find(s => s?.id === id)).filter(Boolean);
                const toolMeshes = createdSolids.map(s => meshCache.get(s.id)).filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
                const targetMeshes = targetSolids.map(s => meshCache.get(s.id)).filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
                let merge = null;
                if (operation === 'add') {
                    const meshes = [...targetMeshes, ...toolMeshes];
                    if (meshes.length >= 2) merge = await booleanMeshes(meshes, 'add');
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
            const targets = Array.isArray(feature?.input?.targets)
                ? feature.input.targets.map(id => String(id || '')).filter(Boolean)
                : [];
            const tools = Array.isArray(feature?.input?.tools)
                ? feature.input.tools.map(id => String(id || '')).filter(Boolean)
                : [];
            const selectedIds = mode === 'subtract'
                ? Array.from(new Set([...targets, ...tools]))
                : targets.slice();
            if (!selectedIds.length) continue;
            const selectedSet = new Set(selectedIds);
            const targetSolids = targets.map(id => solids.find(s => s?.id === id)).filter(Boolean);
            const toolSolids = tools.map(id => solids.find(s => s?.id === id)).filter(Boolean);
            if (mode === 'subtract') {
                if (!targetSolids.length || !toolSolids.length) continue;
            } else if (targetSolids.length < 2) {
                continue;
            }
            const targetMeshes = targetSolids.map(s => meshCache.get(s.id)).filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
            const toolMeshes = toolSolids.map(s => meshCache.get(s.id)).filter(mesh => mesh?.positions?.length && mesh?.indices?.length);
            if (mode === 'subtract') {
                if (!targetMeshes.length || !toolMeshes.length) continue;
            } else if (targetMeshes.length < 2) {
                continue;
            }
            const sketchIds = new Set();
            for (const solid of [...targetSolids, ...toolSolids]) {
                for (const sid of getSketchIdsForSolid(solid)) sketchIds.add(sid);
            }
            const result = mode === 'subtract'
                ? await booleanMeshes({ mode, targets: targetMeshes, tools: toolMeshes })
                : await booleanMeshes(targetMeshes, mode);
            const kept = solids.filter(s => !selectedSet.has(s?.id));
            for (const target of [...targetSolids, ...toolSolids]) meshCache.delete(target?.id);
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
            continue;
        }

        if (feature?.type === 'chamfer') {
            const bodySeqRef = { value: bodySeq };
            const changed = await applyChamferFeature(
                solids,
                meshCache,
                feature,
                makeBodyId,
                bodySeqRef
            );
            bodySeq = bodySeqRef.value;
            if (changed) {
                // keep processing downstream features against updated solids
            }
        }
    }
    return { solids, meshCache };
}

async function rebuildGeneratedSolids(api, options = {}) {
    const doc = api.document.current;
    if (!doc) return { solids: [], meshCache: new Map() };
    const builtFeatures = api.features.listBuilt();
    const sketchPlanes = {};
    for (const feature of (api.features.list() || [])) {
        if (feature?.type === 'sketch' && feature?.id) {
            sketchPlanes[feature.id] = feature.plane || {};
        }
    }
    const profileLoops = {};
    for (const feature of builtFeatures) {
        if (feature?.type !== 'extrude') continue;
        const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
        for (const profileTarget of profiles) {
            const { sketchId, profileId, key } = resolveProfileTargetRef(profileTarget);
            if (!sketchId || !profileId) continue;
            const loops = profileLoopsFromRuntime(api, profileTarget);
            if (!loops?.length) continue;
            profileLoops[key] = loops;
        }
    }
    const { solids, meshCache } = await rebuildGeneratedSolidsFromSnapshot({
        builtFeatures,
        sketchPlanes,
        profileLoops
    }, options);

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
    rebuildGeneratedSolids,
    rebuildGeneratedSolidsFromSnapshot
};
