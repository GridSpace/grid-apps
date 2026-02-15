/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { booleanMeshes } from './kernel.js';

function vec3(x = 0, y = 0, z = 0) {
    return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 };
}

function add(a, b) {
    return vec3(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
    return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mul(a, s) {
    return vec3(a.x * s, a.y * s, a.z * s);
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
    return vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

function length(a) {
    return Math.hypot(a.x, a.y, a.z);
}

function normalize(a) {
    const len = length(a) || 1;
    return vec3(a.x / len, a.y / len, a.z / len);
}

function distanceSq(a, b) {
    const d = sub(a, b);
    return dot(d, d);
}

function centroidFromPositions(pos) {
    const count = Math.floor((pos?.length || 0) / 3);
    if (!count) return vec3(0, 0, 0);
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < pos.length; i += 3) {
        sx += Number(pos[i] || 0);
        sy += Number(pos[i + 1] || 0);
        sz += Number(pos[i + 2] || 0);
    }
    return vec3(sx / count, sy / count, sz / count);
}

function pointFromPositions(pos, vi) {
    const i = vi * 3;
    return vec3(pos[i], pos[i + 1], pos[i + 2]);
}

function normalForTriangle(pos, i0, i1, i2) {
    const a = pointFromPositions(pos, i0);
    const b = pointFromPositions(pos, i1);
    const c = pointFromPositions(pos, i2);
    const ab = sub(b, a);
    const ac = sub(c, a);
    const n = cross(ab, ac);
    const len = length(n);
    return len > 1e-12 ? mul(n, 1 / len) : vec3(0, 0, 1);
}

function edgeKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function buildMeshAdjacency(mesh) {
    const pos = mesh?.positions;
    const idx = mesh?.indices;
    if (!pos?.length || !idx?.length) return null;
    const edgeToTris = new Map();
    const edgeVerts = new Map();
    const triCount = Math.floor(idx.length / 3);
    for (let t = 0; t < triCount; t++) {
        const i0 = idx[t * 3];
        const i1 = idx[t * 3 + 1];
        const i2 = idx[t * 3 + 2];
        const edges = [[i0, i1], [i1, i2], [i2, i0]];
        for (const [va, vb] of edges) {
            const k = edgeKey(va, vb);
            const list = edgeToTris.get(k);
            if (list) list.push(t);
            else edgeToTris.set(k, [t]);
            if (!edgeVerts.has(k)) edgeVerts.set(k, [va, vb]);
        }
    }
    return { positions: pos, indices: idx, edgeToTris, edgeVerts, centroid: centroidFromPositions(pos) };
}

function edgeEndpointScore(a, b, ea, eb) {
    const d1 = Math.sqrt(distanceSq(a, ea)) + Math.sqrt(distanceSq(b, eb));
    const d2 = Math.sqrt(distanceSq(a, eb)) + Math.sqrt(distanceSq(b, ea));
    return Math.min(d1, d2);
}

function makeTriPrismMesh(a0, a1, a2, b0, b1, b2) {
    const positions = new Float32Array([
        a0.x, a0.y, a0.z,
        a1.x, a1.y, a1.z,
        a2.x, a2.y, a2.z,
        b0.x, b0.y, b0.z,
        b1.x, b1.y, b1.z,
        b2.x, b2.y, b2.z
    ]);
    const indices = new Uint32Array([
        0, 2, 1,
        3, 4, 5,
        0, 1, 4,
        0, 4, 3,
        1, 2, 5,
        1, 5, 4,
        2, 0, 3,
        2, 3, 5
    ]);
    return { positions, indices };
}

function getEdgeRecordByKey(meshInfo, key) {
    const parts = String(key || '').split(':');
    if (parts.length !== 2) return null;
    const va = Number(parts[0]);
    const vb = Number(parts[1]);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) return null;
    const ek = edgeKey(va, vb);
    const rep = meshInfo?.edgeVerts?.get?.(ek) || null;
    const tris = meshInfo?.edgeToTris?.get?.(ek) || null;
    if (!rep || !Array.isArray(tris) || tris.length < 2) return null;
    return {
        va: Number(rep[0]),
        vb: Number(rep[1]),
        tris
    };
}

function chooseTrianglePair(meshInfo, tris, va, vb, strictCrease = false) {
    const positions = meshInfo.positions;
    const indices = meshInfo.indices;
    const creaseDotMax = Math.cos(30 * Math.PI / 180);
    let pair = null;
    let pairDot = 1;
    for (let i = 0; i < tris.length; i++) {
        for (let j = i + 1; j < tris.length; j++) {
            const t0 = tris[i];
            const t1 = tris[j];
            const t0i0 = indices[t0 * 3];
            const t0i1 = indices[t0 * 3 + 1];
            const t0i2 = indices[t0 * 3 + 2];
            const t1i0 = indices[t1 * 3];
            const t1i1 = indices[t1 * 3 + 1];
            const t1i2 = indices[t1 * 3 + 2];
            const n1 = normalForTriangle(positions, t0i0, t0i1, t0i2);
            const n2 = normalForTriangle(positions, t1i0, t1i1, t1i2);
            const d = Math.max(-1, Math.min(1, dot(n1, n2)));
            if (strictCrease && d > creaseDotMax) continue;
            if (d < pairDot) {
                pairDot = d;
                pair = { t0, t1 };
            }
        }
    }
    return pair;
}

function buildCutterFromResolvedEdge(meshInfo, va, vb, tris, distance) {
    const positions = meshInfo.positions;
    const indices = meshInfo.indices;
    const triPair = chooseTrianglePair(meshInfo, tris, va, vb, false);
    if (!triPair) return null;
    const t0 = triPair.t0;
    const t1 = triPair.t1;
    const t0i0 = indices[t0 * 3];
    const t0i1 = indices[t0 * 3 + 1];
    const t0i2 = indices[t0 * 3 + 2];
    const t1i0 = indices[t1 * 3];
    const t1i1 = indices[t1 * 3 + 1];
    const t1i2 = indices[t1 * 3 + 2];
    const n1 = normalForTriangle(positions, t0i0, t0i1, t0i2);
    const n2 = normalForTriangle(positions, t1i0, t1i1, t1i2);
    const a = pointFromPositions(positions, va);
    const b = pointFromPositions(positions, vb);
    const edge = sub(b, a);
    const edgeLen = length(edge);
    if (edgeLen <= 1e-8) return null;
    const e = mul(edge, 1 / edgeLen);
    let u1 = sub(n1, mul(e, dot(n1, e)));
    let u2 = sub(n2, mul(e, dot(n2, e)));
    if (length(u1) <= 1e-8 || length(u2) <= 1e-8) return null;
    u1 = normalize(u1);
    u2 = normalize(u2);
    const normalDelta = Math.max(-1, Math.min(1, dot(u1, u2)));
    if (normalDelta > 0.997) return null;
    let i1 = mul(u1, -1);
    let i2 = mul(u2, -1);
    const mid = mul(add(a, b), 0.5);
    const toCenter = sub(meshInfo.centroid, mid);
    if (dot(i1, toCenter) < 0 && dot(i2, toCenter) < 0) {
        i1 = mul(i1, -1);
        i2 = mul(i2, -1);
    }
    const ext = distance * 1.4;
    const spineA = add(a, mul(e, -ext));
    const spineB = add(b, mul(e, ext));
    let out = mul(add(i1, i2), -1);
    if (length(out) <= 1e-8) {
        out = mul(i1, -1);
    } else {
        out = normalize(out);
    }
    const insideScale = distance * 1.8;
    const outsideScale = distance * 0.7;
    const a0 = add(spineA, mul(out, outsideScale));
    const a1 = add(spineA, mul(i1, insideScale));
    const a2 = add(spineA, mul(i2, insideScale));
    const b0 = add(spineB, mul(out, outsideScale));
    const b1 = add(spineB, mul(i1, insideScale));
    const b2 = add(spineB, mul(i2, insideScale));
    const area = length(cross(sub(a1, a0), sub(a2, a0)));
    if (area <= 1e-8) return null;
    return {
        key: edgeKey(va, vb),
        mesh: makeTriPrismMesh(a0, a1, a2, b0, b1, b2)
    };
}

function buildCutterForMeshEdgeKey(meshInfo, meshEdgeKey, distance) {
    const rec = getEdgeRecordByKey(meshInfo, meshEdgeKey);
    if (!rec) return null;
    return buildCutterFromResolvedEdge(meshInfo, rec.va, rec.vb, rec.tris, distance);
}

function buildCutterForSegment(meshInfo, aPoint, bPoint, distance) {
    if (!meshInfo || !aPoint || !bPoint || !(distance > 0)) return null;
    const positions = meshInfo.positions;
    let best = null;
    let bestScore = Infinity;
    const creaseDotMax = Math.cos(30 * Math.PI / 180);
    const requestedLen = Math.sqrt(distanceSq(aPoint, bPoint));
    if (!(requestedLen > 1e-9)) return null;
    const reqDir = normalize(sub(bPoint, aPoint));
    const reqMid = mul(add(aPoint, bPoint), 0.5);
    const findBest = (relaxed = false) => {
        let localBest = null;
        let localBestScore = Infinity;
        for (const [ek, tris] of meshInfo.edgeToTris.entries()) {
            if (!Array.isArray(tris) || tris.length < 2) continue;
        const parts = String(ek).split(':');
            if (parts.length !== 2) continue;
            const rep = meshInfo.edgeVerts?.get?.(ek) || null;
            const va = Number(rep?.[0]);
            const vb = Number(rep?.[1]);
            if (!Number.isFinite(va) || !Number.isFinite(vb) || va === vb) continue;
            const ea = pointFromPositions(positions, va);
            const eb = pointFromPositions(positions, vb);
            const cand = sub(eb, ea);
            const candLen = length(cand);
            if (!(candLen > 1e-9)) continue;
            const candDir = mul(cand, 1 / candLen);
            const dirAlign = Math.abs(dot(reqDir, candDir));
            const candMid = mul(add(ea, eb), 0.5);
            const midDist = Math.sqrt(distanceSq(reqMid, candMid));
            if (!relaxed) {
                if (dirAlign < 0.5) continue;
                const maxMidDist = Math.max(1.5, requestedLen * 0.8, candLen * 0.8);
                if (midDist > maxMidDist) continue;
            }
            // Find a usable face-pair on this edge.
            const pair = chooseTrianglePair(meshInfo, tris, va, vb, false);
            const pairDot = (() => {
                if (!pair) return 1;
                const idx = meshInfo.indices;
                const t0i0 = idx[pair.t0 * 3];
                const t0i1 = idx[pair.t0 * 3 + 1];
                const t0i2 = idx[pair.t0 * 3 + 2];
                const t1i0 = idx[pair.t1 * 3];
                const t1i1 = idx[pair.t1 * 3 + 1];
                const t1i2 = idx[pair.t1 * 3 + 2];
                const n1 = normalForTriangle(meshInfo.positions, t0i0, t0i1, t0i2);
                const n2 = normalForTriangle(meshInfo.positions, t1i0, t1i1, t1i2);
                return Math.max(-1, Math.min(1, dot(n1, n2)));
            })();
            if (!pair) continue;
            if (!relaxed && pairDot > creaseDotMax) continue;
            const score = edgeEndpointScore(aPoint, bPoint, ea, eb) + midDist * 0.5 + (1 - dirAlign) * (relaxed ? 0.1 : 2);
            if (score < localBestScore) {
                localBestScore = score;
                localBest = { va, vb, tris: [pair.t0, pair.t1] };
            }
        }
        return { best: localBest, score: localBestScore };
    };
    const strict = findBest(false);
    if (strict.best) {
        best = strict.best;
        bestScore = strict.score;
    } else {
        const relaxed = findBest(true);
        best = relaxed.best;
        bestScore = relaxed.score;
    }
    if (!best) return null;
    return buildCutterFromResolvedEdge(meshInfo, best.va, best.vb, best.tris, distance);
}

function segmentsFromEdgeRef(edgeRef) {
    if (!edgeRef) return [];
    const path = Array.isArray(edgeRef.path) ? edgeRef.path : null;
    if (path?.length >= 2) {
        let pts = path.map(p => vec3(p.x, p.y, p.z));
        // Remove duplicated closing point if present.
        if (pts.length > 2) {
            const first = pts[0];
            const last = pts[pts.length - 1];
            if (Math.sqrt(distanceSq(first, last)) <= 1e-7) {
                pts = pts.slice(0, -1);
            }
        }
        // Decimate very dense loops for cutter robustness/perf.
        const maxPts = 49; // => at most 49 segments for closed loops
        if (pts.length > maxPts) {
            const reduced = [];
            for (let i = 0; i < maxPts; i++) {
                const t = i / (maxPts - 1);
                const idx = Math.round(t * (pts.length - 1));
                reduced.push(pts[Math.max(0, Math.min(pts.length - 1, idx))]);
            }
            pts = reduced;
        }
        const out = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            if (!a || !b) continue;
            out.push([a, b]);
        }
        // Close if this came from a loop path.
        if (pts.length > 2) {
            out.push([pts[pts.length - 1], pts[0]]);
        }
        return out;
    }
    const a = edgeRef?.a;
    const b = edgeRef?.b;
    if (a && b) return [[vec3(a.x, a.y, a.z), vec3(b.x, b.y, b.z)]];
    return [];
}

function concatMeshes(meshes = []) {
    if (!Array.isArray(meshes) || !meshes.length) return null;
    let posLen = 0;
    let idxLen = 0;
    for (const mesh of meshes) {
        if (!mesh?.positions?.length || !mesh?.indices?.length) continue;
        posLen += mesh.positions.length;
        idxLen += mesh.indices.length;
    }
    if (!posLen || !idxLen) return null;
    const positions = new Float32Array(posLen);
    const indices = new Uint32Array(idxLen);
    let po = 0;
    let io = 0;
    let vBase = 0;
    for (const mesh of meshes) {
        if (!mesh?.positions?.length || !mesh?.indices?.length) continue;
        positions.set(mesh.positions, po);
        for (let i = 0; i < mesh.indices.length; i++) {
            indices[io + i] = Number(mesh.indices[i] || 0) + vBase;
        }
        po += mesh.positions.length;
        io += mesh.indices.length;
        vBase += Math.floor(mesh.positions.length / 3);
    }
    return { positions, indices };
}

function scaleMeshAroundCentroid(mesh, scale = 1.001) {
    if (!mesh?.positions?.length || !mesh?.indices?.length) return null;
    const c = centroidFromPositions(mesh.positions);
    const out = new Float32Array(mesh.positions.length);
    for (let i = 0; i < mesh.positions.length; i += 3) {
        const x = Number(mesh.positions[i] || 0);
        const y = Number(mesh.positions[i + 1] || 0);
        const z = Number(mesh.positions[i + 2] || 0);
        out[i] = c.x + (x - c.x) * scale;
        out[i + 1] = c.y + (y - c.y) * scale;
        out[i + 2] = c.z + (z - c.z) * scale;
    }
    return {
        positions: out,
        indices: mesh.indices instanceof Uint32Array ? mesh.indices : new Uint32Array(mesh.indices || [])
    };
}

function cloneMesh(mesh) {
    if (!mesh?.positions?.length || !mesh?.indices?.length) return null;
    return {
        positions: mesh.positions instanceof Float32Array ? new Float32Array(mesh.positions) : new Float32Array(mesh.positions || []),
        indices: mesh.indices instanceof Uint32Array ? new Uint32Array(mesh.indices) : new Uint32Array(mesh.indices || [])
    };
}

function makePassThroughSolid(feature, targetSolid, solidId, bodySeqRef, makeBodyId, reason = 'no-op') {
    const nextId = makeBodyId(feature.id, bodySeqRef.value++);
    const sketchIds = Array.isArray(targetSolid?.source?.sketch_ids)
        ? targetSolid.source.sketch_ids.slice()
        : [];
    return {
        id: nextId,
        name: `${feature.name || 'Chamfer'}-${bodySeqRef.value}`,
        visible: feature.visible !== false,
        source: {
            feature_id: feature.id,
            feature_type: feature.type,
            parent: solidId,
            pass_through: true,
            reason,
            sketch_ids: sketchIds
        },
        provenance: {
            source: {
                feature_id: feature.id,
                feature_type: feature.type,
                parent: solidId,
                pass_through: true,
                reason
            },
            parents: [solidId]
        },
        mesh: {
            tri_count: targetSolid?.mesh?.tri_count || 0,
            vert_count: targetSolid?.mesh?.vert_count || 0
        },
        status: 'manifold_chamfer_passthrough'
    };
}

function parseBoundarySegmentRef(boundarySegmentId) {
    const raw = String(boundarySegmentId || '');
    if (!raw) return null;
    const parts = raw.split(':');
    if (raw.startsWith('segment:') && parts.length >= 5) {
        const segInLoop = Number(parts[parts.length - 1]);
        const loopIndex = Number(parts[parts.length - 2]);
        const faceId = Number(parts[parts.length - 3]);
        const solidId = parts.slice(1, -3).join(':');
        if (!solidId || !Number.isFinite(faceId) || !Number.isFinite(loopIndex) || !Number.isFinite(segInLoop)) return null;
        return { kind: 'segment', id: raw, solidId, faceId, loopIndex, segInLoop };
    }
    if (raw.startsWith('boundary:') && parts.length >= 4) {
        const loopIndex = Number(parts[parts.length - 1]);
        const faceId = Number(parts[parts.length - 2]);
        const solidId = parts.slice(1, -2).join(':');
        if (!solidId || !Number.isFinite(faceId) || !Number.isFinite(loopIndex)) return null;
        return { kind: 'boundary', id: raw, solidId, faceId, loopIndex };
    }
    return null;
}

async function applyChamferFeature(solids, meshCache, feature, makeBodyId, bodySeqRef) {
    const refs = Array.isArray(feature?.input?.edges) ? feature.input.edges : [];
    const distance = Math.max(0.0001, Math.abs(Number(feature?.params?.distance ?? 1)));
    const showCutters = feature?.params?.showCutters === true;
    if (!refs.length || !(distance > 0)) return false;

    const bySolid = new Map();
    for (const ref of refs) {
        let solidId = String(ref?.solidId || ref?.solid_id || '');
        if (!solidId) {
            const parsed = parseBoundarySegmentRef(ref?.boundary_segment_id || ref?.entity?.id || ref?.key || null);
            solidId = String(parsed?.solidId || '');
        }
        if (!solidId) continue;
        const list = bySolid.get(solidId);
        if (list) list.push(ref);
        else bySolid.set(solidId, [ref]);
    }
    if (!bySolid.size) return false;

    let changed = false;
    for (const [solidId, solidRefs] of bySolid.entries()) {
        const targetSolid = solids.find(s => s?.id === solidId) || null;
        const targetMesh = meshCache.get(solidId);
        if (!targetSolid || !targetMesh?.positions?.length || !targetMesh?.indices?.length) continue;
        const adj = buildMeshAdjacency(targetMesh);
        if (!adj) continue;
        const tools = [];
        const usedEdgeKeys = new Set();
        for (const ref of solidRefs) {
            const meshEdgeKeys = Array.isArray(ref?.meshEdgeKeys) ? ref.meshEdgeKeys.filter(Boolean) : [];
            if (meshEdgeKeys.length) {
                for (const mek of meshEdgeKeys) {
                    const built = buildCutterForMeshEdgeKey(adj, mek, distance);
                    const cutter = built?.mesh || null;
                    const cutterKey = String(built?.key || mek || '');
                    if (cutterKey && usedEdgeKeys.has(cutterKey)) continue;
                    if (cutter?.positions?.length && cutter?.indices?.length) {
                        if (cutterKey) usedEdgeKeys.add(cutterKey);
                        tools.push(cutter);
                    }
                }
                continue;
            }
            if (ref?.meshEdgeKey && !(Array.isArray(ref.path) && ref.path.length >= 2)) {
                const built = buildCutterForMeshEdgeKey(adj, ref.meshEdgeKey, distance);
                const cutter = built?.mesh || null;
                const cutterKey = String(built?.key || '');
                if (cutterKey && usedEdgeKeys.has(cutterKey)) continue;
                if (cutter?.positions?.length && cutter?.indices?.length) {
                    if (cutterKey) usedEdgeKeys.add(cutterKey);
                    tools.push(cutter);
                    continue;
                }
            }
            const segs = segmentsFromEdgeRef(ref);
            for (const [a, b] of segs) {
                const built = buildCutterForSegment(adj, a, b, distance);
                const cutter = built?.mesh || null;
                const cutterKey = String(built?.key || '');
                if (cutterKey && usedEdgeKeys.has(cutterKey)) continue;
                if (cutter?.positions?.length && cutter?.indices?.length) {
                    if (cutterKey) usedEdgeKeys.add(cutterKey);
                    tools.push(cutter);
                }
            }
        }
        if (!tools.length) {
            console.warn('void.chamfer.no_cutters', { featureId: feature?.id, solidId, refs: solidRefs.length });
            const targetIndex = solids.findIndex(s => s?.id === solidId);
            if (targetIndex >= 0) {
                const nextSolid = makePassThroughSolid(feature, targetSolid, solidId, bodySeqRef, makeBodyId, 'no_cutters');
                const copied = cloneMesh(targetMesh);
                if (copied?.positions?.length && copied?.indices?.length) {
                    solids[targetIndex] = nextSolid;
                    meshCache.delete(solidId);
                    meshCache.set(nextSolid.id, copied);
                    changed = true;
                }
            }
            continue;
        }
        if (showCutters) {
            const merged = concatMeshes(tools);
            if (merged?.positions?.length && merged?.indices?.length) {
                const nextId = makeBodyId(feature.id, bodySeqRef.value++);
                const nextSolid = {
                    id: nextId,
                    name: `${feature.name || 'Chamfer'}-cutters`,
                    visible: feature.visible !== false,
                    source: {
                        feature_id: feature.id,
                        feature_type: feature.type,
                        parent: solidId,
                        debug: 'cutters',
                        distance
                    },
                    provenance: {
                        source: {
                            feature_id: feature.id,
                            feature_type: feature.type,
                            parent: solidId,
                            debug: 'cutters'
                        },
                        parents: [solidId]
                    },
                    mesh: {
                        tri_count: (merged.indices.length || 0) / 3,
                        vert_count: (merged.positions.length || 0) / 3
                    },
                    status: 'manifold_chamfer_debug_cutters'
                };
                solids.push(nextSolid);
                meshCache.set(nextId, merged);
                console.log('void.chamfer.debug_cutters', {
                    featureId: feature?.id,
                    solidId,
                    cutters: tools.length,
                    tri: Math.floor((merged.indices.length || 0) / 3)
                });
                changed = true;
            }
            continue;
        }

        let result = await booleanMeshes({
            mode: 'subtract',
            targets: [targetMesh],
            tools
        });
        if (!result?.mesh?.positions?.length || !result?.mesh?.indices?.length) {
            // Fallback: sequential subtract can be more robust than bulk subtract.
            let current = targetMesh;
            let applied = 0;
            for (const tool of tools) {
                const step = await booleanMeshes({
                    mode: 'subtract',
                    targets: [current],
                    tools: [tool]
                });
                if (step?.mesh?.positions?.length && step?.mesh?.indices?.length) {
                    current = step.mesh;
                    applied++;
                    continue;
                }
                // Retry with tiny perturbation to avoid coplanar/not-manifold failures.
                const grown = scaleMeshAroundCentroid(tool, 1.001);
                if (grown) {
                    const stepGrown = await booleanMeshes({
                        mode: 'subtract',
                        targets: [current],
                        tools: [grown]
                    });
                    if (stepGrown?.mesh?.positions?.length && stepGrown?.mesh?.indices?.length) {
                        current = stepGrown.mesh;
                        applied++;
                    }
                }
            }
            if (applied > 0) {
                result = { mesh: current };
                console.warn('void.chamfer.bulk_failed_sequential_used', {
                    featureId: feature?.id,
                    solidId,
                    cutters: tools.length,
                    applied
                });
            }
        }
        if (!result?.mesh?.positions?.length || !result?.mesh?.indices?.length) {
            console.warn('void.chamfer.boolean_failed', { featureId: feature?.id, solidId, cutters: tools.length });
            const targetIndex = solids.findIndex(s => s?.id === solidId);
            if (targetIndex >= 0) {
                const nextSolid = makePassThroughSolid(feature, targetSolid, solidId, bodySeqRef, makeBodyId, 'boolean_failed');
                const copied = cloneMesh(targetMesh);
                if (copied?.positions?.length && copied?.indices?.length) {
                    solids[targetIndex] = nextSolid;
                    meshCache.delete(solidId);
                    meshCache.set(nextSolid.id, copied);
                    changed = true;
                }
            }
            continue;
        }

        const targetIndex = solids.findIndex(s => s?.id === solidId);
        if (targetIndex < 0) continue;
        const nextId = makeBodyId(feature.id, bodySeqRef.value++);
        const sketchIds = Array.isArray(targetSolid?.source?.sketch_ids)
            ? targetSolid.source.sketch_ids.slice()
            : [];
        const nextSolid = {
            id: nextId,
            name: `${feature.name || 'Chamfer'}-${bodySeqRef.value}`,
            visible: feature.visible !== false,
            source: {
                feature_id: feature.id,
                feature_type: feature.type,
                parent: solidId,
                edges: solidRefs.map(ref => ({
                    key: ref?.key || null,
                    boundary_segment_id: ref?.boundary_segment_id || null,
                    solidId: ref?.solidId || null,
                    edgeIndex: ref?.edgeIndex ?? null
                })),
                distance,
                sketch_ids: sketchIds
            },
            provenance: {
                source: {
                    feature_id: feature.id,
                    feature_type: feature.type,
                    parent: solidId,
                    distance
                },
                parents: [solidId]
            },
            mesh: {
                tri_count: (result.mesh.indices.length || 0) / 3,
                vert_count: (result.mesh.positions.length || 0) / 3
            },
            status: 'manifold_chamfer_ready'
        };
        solids.splice(targetIndex, 1, nextSolid);
        meshCache.delete(solidId);
        meshCache.set(nextId, result.mesh);
        if (false) console.log('void.chamfer.applied', {
            featureId: feature?.id,
            solidId,
            cutters: tools.length,
            triIn: Math.floor((targetMesh.indices?.length || 0) / 3),
            triOut: Math.floor((result.mesh.indices?.length || 0) / 3)
        });
        changed = true;
    }
    return changed;
}

export {
    applyChamferFeature
};
