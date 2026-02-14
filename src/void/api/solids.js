/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE, BufferGeometryUtils } from '../../ext/three.js';
import { Line2, LineGeometry, LineMaterial } from '../../ext/three.js';
import { ensureKernel } from '../solid/kernel.js';
import { rebuildGeneratedSolids } from '../solid/rebuild.js';
import { space } from '../../moto/space.js';

const SOLID_CREASE_ANGLE_DEG = 30;

function createSolidsApi(getApi) {
    function resolveProfileTargetRef(profileTarget = {}) {
        const regionId = String(profileTarget?.region_id || '');
        const match = regionId.match(/^profile:([^:]+):([^:]+)$/);
        if (!match) return { regionId: null, sketchId: null, profileId: null, key: null };
        const sketchId = match[1];
        const profileId = match[2];
        return { regionId, sketchId, profileId, key: regionId };
    }

    function frameToBasis(frame) {
        if (!frame?.origin || !frame?.normal || !frame?.x_axis) return null;
        const origin = new THREE.Vector3(
            Number(frame.origin.x || 0),
            Number(frame.origin.y || 0),
            Number(frame.origin.z || 0)
        );
        const normal = new THREE.Vector3(
            Number(frame.normal.x || 0),
            Number(frame.normal.y || 0),
            Number(frame.normal.z || 1)
        ).normalize();
        let xAxis = new THREE.Vector3(
            Number(frame.x_axis.x || 1),
            Number(frame.x_axis.y || 0),
            Number(frame.x_axis.z || 0)
        );
        xAxis.addScaledVector(normal, -xAxis.dot(normal));
        if (xAxis.lengthSq() <= 1e-12) {
            xAxis.set(1, 0, 0);
            xAxis.addScaledVector(normal, -xAxis.dot(normal));
        }
        xAxis.normalize();
        const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
        return { origin, normal, xAxis, yAxis };
    }

    function frameLocalToWorld(local, basis) {
        if (!local || !basis) return null;
        return basis.origin.clone()
            .addScaledVector(basis.xAxis, Number(local.x || 0))
            .addScaledVector(basis.yAxis, Number(local.y || 0));
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

    function buildRebuildSnapshot(api) {
        const builtFeatures = api.features.listBuilt();
        const sketchPlanes = {};
        const profileLoops = {};
        for (const feature of (api.features.list() || [])) {
            if (feature?.type === 'sketch' && feature?.id) {
                sketchPlanes[feature.id] = feature.plane || {};
            }
        }
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
        return { builtFeatures, sketchPlanes, profileLoops };
    }

    function meshCacheFromWorkerPayload(payloadMeshes = []) {
        const map = new Map();
        for (const rec of payloadMeshes || []) {
            const id = rec?.id;
            if (!id) continue;
            const positions = rec.positions instanceof Float32Array
                ? rec.positions
                : new Float32Array(rec.positions || []);
            const indices = rec.indices instanceof Uint32Array
                ? rec.indices
                : new Uint32Array(rec.indices || []);
            if (!positions.length || !indices.length) continue;
            map.set(id, { positions, indices });
        }
        return map;
    }

    function isObjectEffectivelyVisible(obj) {
        let node = obj;
        while (node) {
            if (node.visible === false) return false;
            node = node.parent;
        }
        return true;
    }

    function flattenMeshToTriangleVertexArray(meshData) {
        const positions = meshData?.positions;
        const indices = meshData?.indices;
        if (!positions?.length || !indices?.length) return new Float32Array(0);
        const out = new Float32Array(indices.length * 3);
        let oi = 0;
        for (let i = 0; i < indices.length; i++) {
            const vi = indices[i] * 3;
            out[oi++] = positions[vi];
            out[oi++] = positions[vi + 1];
            out[oi++] = positions[vi + 2];
        }
        return out;
    }

    function buildSolidGeometry(meshData) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
        const indexed = geometry.clone();
        if (BufferGeometryUtils?.toCreasedNormals) {
            // Keep hard CAD-like edges while preserving smooth shading where faces are near-coplanar.
            const creased = BufferGeometryUtils.toCreasedNormals(geometry, Math.PI / 3);
            geometry.dispose();
            return { render: creased, indexed };
        }
        geometry.computeVertexNormals();
        return { render: geometry, indexed };
    }

    function vec3FromPos(posArray, index, out = new THREE.Vector3()) {
        const i = index * 3;
        out.set(posArray[i], posArray[i + 1], posArray[i + 2]);
        return out;
    }

function edgeKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

    function distancePointToSegmentSquared(p, a, b) {
        const ab = new THREE.Vector3().subVectors(b, a);
        const ap = new THREE.Vector3().subVectors(p, a);
        const abLenSq = ab.lengthSq();
        if (abLenSq <= 1e-18) return p.distanceToSquared(a);
        let t = ap.dot(ab) / abLenSq;
        t = Math.max(0, Math.min(1, t));
        const proj = a.clone().addScaledVector(ab, t);
        return p.distanceToSquared(proj);
    }

    function buildSurfaceRegionData(geometry) {
        const posAttr = geometry?.getAttribute?.('position');
        const idxAttr = geometry?.getIndex?.();
        if (!posAttr) {
            return { triToGroup: new Int32Array(0), groups: new Map() };
        }
        const positions = posAttr.array;
        const vertCount = Math.floor(positions.length / 3);
        const indices = idxAttr?.array || Uint32Array.from(Array.from({ length: vertCount }, (_, i) => i));
        const triCount = Math.floor(indices.length / 3);
        if (!triCount) {
            return { triToGroup: new Int32Array(0), groups: new Map() };
        }

        const triNormals = new Float32Array(triCount * 3);
        const triDs = new Float32Array(triCount);
        const triNeighbors = Array.from({ length: triCount }, () => new Set());
        const triToGroup = new Int32Array(triCount).fill(-1);
        const edgeMap = new Map();
        const posPointId = new Map();
        const pointIdByIndex = new Map();
        let pointSeq = 0;
        const quant = 1e6;
        const pointIdForIndex = (vi) => {
            const cached = pointIdByIndex.get(vi);
            if (cached !== undefined) return cached;
            const p = vi * 3;
            const kx = Math.round(positions[p] * quant);
            const ky = Math.round(positions[p + 1] * quant);
            const kz = Math.round(positions[p + 2] * quant);
            const key = `${kx},${ky},${kz}`;
            let pid = posPointId.get(key);
            if (pid === undefined) {
                pid = pointSeq++;
                posPointId.set(key, pid);
            }
            pointIdByIndex.set(vi, pid);
            return pid;
        };
        const tmpA = new THREE.Vector3();
        const tmpB = new THREE.Vector3();
        const tmpC = new THREE.Vector3();
        const tmpAB = new THREE.Vector3();
        const tmpAC = new THREE.Vector3();
        const tmpN = new THREE.Vector3();

        for (let t = 0; t < triCount; t++) {
            const i0 = indices[t * 3];
            const i1 = indices[t * 3 + 1];
            const i2 = indices[t * 3 + 2];
            vec3FromPos(positions, i0, tmpA);
            vec3FromPos(positions, i1, tmpB);
            vec3FromPos(positions, i2, tmpC);
            tmpAB.subVectors(tmpB, tmpA);
            tmpAC.subVectors(tmpC, tmpA);
            tmpN.crossVectors(tmpAB, tmpAC);
            if (tmpN.lengthSq() > 0) tmpN.normalize();
            triNormals[t * 3] = tmpN.x;
            triNormals[t * 3 + 1] = tmpN.y;
            triNormals[t * 3 + 2] = tmpN.z;
            triDs[t] = tmpN.dot(tmpA);

            const p0 = pointIdForIndex(i0);
            const p1 = pointIdForIndex(i1);
            const p2 = pointIdForIndex(i2);
            const edges = [[p0, p1], [p1, p2], [p2, p0]];
            for (const [ea, eb] of edges) {
                const ek = edgeKey(ea, eb);
                const list = edgeMap.get(ek);
                if (list) list.push(t);
                else edgeMap.set(ek, [t]);
            }
        }

        for (const list of edgeMap.values()) {
            if (list.length < 2) continue;
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    triNeighbors[list[i]].add(list[j]);
                    triNeighbors[list[j]].add(list[i]);
                }
            }
        }

        // Must match EdgesGeometry threshold so selectable regions align with drawn boundaries.
        const smoothJoinDot = Math.cos(SOLID_CREASE_ANGLE_DEG * Math.PI / 180);
        const groups = new Map();
        let groupId = 0;

        for (let t = 0; t < triCount; t++) {
            if (triToGroup[t] >= 0) continue;
            const queue = [t];
            const tris = [];
            triToGroup[t] = groupId;

            while (queue.length) {
                const cur = queue.pop();
                tris.push(cur);
                for (const nb of triNeighbors[cur]) {
                    if (triToGroup[nb] >= 0) continue;
                    const cNx = triNormals[cur * 3];
                    const cNy = triNormals[cur * 3 + 1];
                    const cNz = triNormals[cur * 3 + 2];
                    const nNx = triNormals[nb * 3];
                    const nNy = triNormals[nb * 3 + 1];
                    const nNz = triNormals[nb * 3 + 2];
                    const dot = cNx * nNx + cNy * nNy + cNz * nNz;
                    if (dot < smoothJoinDot) continue;
                    triToGroup[nb] = groupId;
                    queue.push(nb);
                }
            }

            const groupIndices = [];
            const vertexSet = new Set();
            let xAxis = new THREE.Vector3(1, 0, 0);
            const avgNormal = new THREE.Vector3();
            for (const tri of tris) {
                const i0 = indices[tri * 3];
                const i1 = indices[tri * 3 + 1];
                const i2 = indices[tri * 3 + 2];
                groupIndices.push(i0, i1, i2);
                vertexSet.add(i0);
                vertexSet.add(i1);
                vertexSet.add(i2);
                if (xAxis.lengthSq() <= 1e-8) {
                    vec3FromPos(positions, i0, tmpA);
                    vec3FromPos(positions, i1, tmpB);
                    xAxis = tmpB.sub(tmpA);
                }
                avgNormal.x += triNormals[tri * 3];
                avgNormal.y += triNormals[tri * 3 + 1];
                avgNormal.z += triNormals[tri * 3 + 2];
            }
            const center = new THREE.Vector3();
            if (vertexSet.size) {
                for (const vi of vertexSet) {
                    vec3FromPos(positions, vi, tmpA);
                    center.add(tmpA);
                }
                center.multiplyScalar(1 / vertexSet.size);
            }
            const normal = avgNormal.lengthSq() > 1e-12 ? avgNormal.normalize() : new THREE.Vector3(0, 0, 1);
            const xDotN = xAxis.dot(normal);
            xAxis = xAxis.sub(normal.clone().multiplyScalar(xDotN));
            if (xAxis.lengthSq() <= 1e-8) {
                xAxis = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
                xAxis.sub(normal.clone().multiplyScalar(xAxis.dot(normal)));
            }
            xAxis.normalize();
            const planeD = normal.dot(center);
            let maxPlanarError = 0;
            let minDot = 1;
            for (const vi of vertexSet) {
                vec3FromPos(positions, vi, tmpA);
                const dErr = Math.abs(normal.dot(tmpA) - planeD);
                if (dErr > maxPlanarError) maxPlanarError = dErr;
            }
            for (const tri of tris) {
                const nx = triNormals[tri * 3];
                const ny = triNormals[tri * 3 + 1];
                const nz = triNormals[tri * 3 + 2];
                const dot = nx * normal.x + ny * normal.y + nz * normal.z;
                if (dot < minDot) minDot = dot;
            }
            const planar = maxPlanarError < 1e-4 && minDot > (1 - 1e-4);

            const faceGeom = new THREE.BufferGeometry();
            faceGeom.setAttribute('position', posAttr.clone());
            faceGeom.setIndex(new THREE.BufferAttribute(Uint32Array.from(groupIndices), 1));

            groups.set(groupId, {
                id: groupId,
                geometry: faceGeom,
                center,
                normal,
                xAxis,
                planar,
                boundarySegmentsLocal: null,
                boundaryLoopsLocal: null
            });
            groupId++;
        }
        return { triToGroup, groups };
    }

    function buildBoundarySegmentsFromGeometry(geometry) {
        if (!geometry) return [];
        // Keep boundary extraction aligned with rendered edge topology.
        // Using the same crease threshold avoids partial/extra loop artifacts.
        const edgesGeom = new THREE.EdgesGeometry(geometry, SOLID_CREASE_ANGLE_DEG);
        const pos = edgesGeom.getAttribute?.('position');
        if (!pos) return [];
        const out = [];
        for (let i = 0; i + 1 < pos.count; i += 2) {
            const a = new THREE.Vector3().fromBufferAttribute(pos, i);
            const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
            out.push({ a, b, mid: a.clone().add(b).multiplyScalar(0.5) });
        }
        edgesGeom.dispose?.();
        return out;
    }

    function buildBoundaryLoopsFromSegments(segments = []) {
        if (!Array.isArray(segments) || !segments.length) return [];
        const quant = 1e6;
        const nodeKey = (v) => `${Math.round(Number(v?.x || 0) * quant)},${Math.round(Number(v?.y || 0) * quant)},${Math.round(Number(v?.z || 0) * quant)}`;
        const nodePos = new Map();
        const nodeEdges = new Map();
        const edgeNodes = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (!seg?.a || !seg?.b) continue;
            const ka = nodeKey(seg.a);
            const kb = nodeKey(seg.b);
            edgeNodes[i] = [ka, kb];
            if (!nodePos.has(ka)) nodePos.set(ka, seg.a.clone());
            if (!nodePos.has(kb)) nodePos.set(kb, seg.b.clone());
            if (!nodeEdges.has(ka)) nodeEdges.set(ka, []);
            if (!nodeEdges.has(kb)) nodeEdges.set(kb, []);
            nodeEdges.get(ka).push(i);
            nodeEdges.get(kb).push(i);
        }
        const used = new Set();
        const loops = [];
        for (let i = 0; i < segments.length; i++) {
            if (used.has(i) || !edgeNodes[i]) continue;
            let [startNode, nextNode] = edgeNodes[i];
            const segIndices = [i];
            const points = [nodePos.get(startNode)?.clone(), nodePos.get(nextNode)?.clone()].filter(Boolean);
            used.add(i);
            let prevEdge = i;
            let closed = false;
            for (let guard = 0; guard < segments.length + 4; guard++) {
                if (nextNode === startNode) {
                    closed = true;
                    break;
                }
                const options = (nodeEdges.get(nextNode) || []).filter(edgeIndex => !used.has(edgeIndex) && edgeIndex !== prevEdge);
                if (!options.length) break;
                const edgeIndex = options[0];
                const pair = edgeNodes[edgeIndex];
                if (!pair) break;
                const [a, b] = pair;
                const newNode = a === nextNode ? b : a;
                used.add(edgeIndex);
                segIndices.push(edgeIndex);
                const p = nodePos.get(newNode);
                if (p) points.push(p.clone());
                prevEdge = edgeIndex;
                nextNode = newNode;
            }
            if (points.length >= 2) {
                loops.push({ segmentIndices: segIndices, points, closed: closed && points.length >= 4 });
            }
        }
        return loops;
    }

    function shouldPromoteLoopSelection(loop, minSegments = 10) {
        const segCount = Array.isArray(loop?.segmentIndices) ? loop.segmentIndices.length : 0;
        const threshold = Math.max(3, Number(minSegments) || 10);
        const pts = Array.isArray(loop?.points) ? loop.points : [];
        if (pts.length < 4) return false;
        const closed = !!loop?.closed;
        if (!closed) return false;

        let maxTurnDeg = 0;
        let sharpTurnCount = 0;
        const count = pts.length;
        for (let i = 0; i < count; i++) {
            const p0 = pts[(i - 1 + count) % count];
            const p1 = pts[i];
            const p2 = pts[(i + 1) % count];
            if (!p0 || !p1 || !p2) continue;
            const e1 = new THREE.Vector3().subVectors(p1, p0);
            const e2 = new THREE.Vector3().subVectors(p2, p1);
            if (e1.lengthSq() <= 1e-16 || e2.lengthSq() <= 1e-16) continue;
            e1.normalize();
            e2.normalize();
            const dot = Math.max(-1, Math.min(1, e1.dot(e2)));
            const turnDeg = Math.acos(dot) * 180 / Math.PI;
            if (turnDeg > maxTurnDeg) maxTurnDeg = turnDeg;
            if (turnDeg > 85) sharpTurnCount++;
        }

        // Strong circle-like detection: points at roughly constant radius from centroid.
        // This should promote cylinder cap rings even when user tuning raises segment threshold.
        // Guard with turn-angle smoothness so sharp-corner polygons (square/hex) remain segment-pickable.
        const center = new THREE.Vector3();
        for (const p of pts) center.add(p);
        center.multiplyScalar(1 / pts.length);
        let sumR = 0;
        const radii = [];
        for (const p of pts) {
            const r = p.distanceTo(center);
            radii.push(r);
            sumR += r;
        }
        const meanR = sumR / Math.max(1, radii.length);
        if (meanR > 1e-8) {
            let varR = 0;
            for (const r of radii) {
                const d = r - meanR;
                varR += d * d;
            }
            const sigmaR = Math.sqrt(varR / Math.max(1, radii.length));
            const rel = sigmaR / meanR;
            if (segCount >= 5 && rel <= 0.08 && maxTurnDeg <= 55) {
                return true;
            }
        }

        if (segCount < threshold) return false;

        // Promote only "smooth" dense loops. Mixed straight/curved boundaries
        // (with sharp corners) should remain segment-selectable.
        if (sharpTurnCount >= 3) return false;
        return maxTurnDeg <= 80;
    }

    function buildSmoothChainFromLoop(loop, anchorSegIndex) {
        const segIndices = Array.isArray(loop?.segmentIndices) ? loop.segmentIndices : [];
        const pts = Array.isArray(loop?.points) ? loop.points : [];
        const closed = !!loop?.closed;
        const n = segIndices.length;
        if (!n || pts.length < 3) return null;
        const anchorPos = segIndices.indexOf(Number(anchorSegIndex));
        if (anchorPos < 0) return null;

        const segLen = new Array(n).fill(0).map((_, i) => {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            return (a && b && a.distanceToSquared) ? Math.sqrt(a.distanceToSquared(b)) : 0;
        });
        const dirAt = (i) => {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            if (!a || !b) return null;
            const d = new THREE.Vector3().subVectors(b, a);
            const len = d.length();
            if (len <= 1e-9) return null;
            return d.multiplyScalar(1 / len);
        };
        const angleBetweenSegs = (i, j) => {
            const di = dirAt(i);
            const dj = dirAt(j);
            if (!di || !dj) return 180;
            const dotv = Math.max(-1, Math.min(1, di.dot(dj)));
            return Math.acos(dotv) * 180 / Math.PI;
        };

        const nextIndex = (i, step) => {
            if (closed) return (i + step + n) % n;
            const v = i + step;
            return (v < 0 || v >= n) ? null : v;
        };

        let start = anchorPos;
        let end = anchorPos;
        let typical = Math.max(1e-9, segLen[anchorPos] || 1);
        let count = 1;
        const maxExpand = closed ? n - 1 : n;

        const canGrow = (from, cand) => {
            if (cand === null) return false;
            const l1 = Math.max(1e-9, segLen[from] || 1e-9);
            const l2 = Math.max(1e-9, segLen[cand] || 1e-9);
            const ratio = Math.max(l1, l2, typical) / Math.max(1e-9, Math.min(l1, l2, typical));
            if (ratio > 2.5) return false;
            const turn = angleBetweenSegs(from, cand);
            return turn <= 55;
        };

        for (let guard = 0; guard < maxExpand; guard++) {
            const cand = nextIndex(start, -1);
            if (!canGrow(cand, start)) break;
            start = cand;
            typical = (typical * count + Math.max(1e-9, segLen[start] || 1e-9)) / (count + 1);
            count++;
        }
        for (let guard = 0; guard < maxExpand; guard++) {
            const cand = nextIndex(end, +1);
            if (!canGrow(end, cand)) break;
            end = cand;
            typical = (typical * count + Math.max(1e-9, segLen[end] || 1e-9)) / (count + 1);
            count++;
            if (closed && nextIndex(end, +1) === start) break;
        }

        if (count < 2) return null;
        if (closed && count >= n - 1) return null;

        const path = [];
        let i = start;
        path.push(pts[i]?.clone?.() || null);
        for (let guard = 0; guard < n + 2; guard++) {
            const ni = nextIndex(i, +1);
            if (ni === null) break;
            path.push(pts[ni]?.clone?.() || null);
            if (i === end) break;
            i = ni;
            if (i === start) break;
        }
        const clean = path.filter(Boolean);
        if (clean.length < 2) return null;
        return {
            startPos: start,
            endPos: end,
            startSegIndex: Number(segIndices[start]),
            endSegIndex: Number(segIndices[end]),
            pathWorld: clean
        };
    }

    function makeFaceMaterials() {
        return {
            hover: new THREE.MeshBasicMaterial({
                color: 0xffa347,
                transparent: true,
                opacity: 0.26,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            }),
            selected: new THREE.MeshBasicMaterial({
                color: 0xffa347,
                transparent: true,
                opacity: 0.34,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            })
        };
    }

    function quantPointKey(v) {
        const q = 1e6;
        const x = Math.round(Number(v?.x || 0) * q);
        const y = Math.round(Number(v?.y || 0) * q);
        const z = Math.round(Number(v?.z || 0) * q);
        return `${x}:${y}:${z}`;
    }

    return {
        _rebuildTimer: null,
        _rebuilding: false,
        _pendingReason: null,
        _meshCache: new Map(),
        _meshViews: new Map(),
        _selectedIds: new Set(),
        _hoveredIds: new Set(),
        _root: null,
        _material: null,
        _edgeMaterial: null,
        _selectedFaceKeys: new Set(),
        _hoveredFaceKey: null,
        _selectedEdgeKeys: new Set(),
        _hoveredEdgeKey: null,
        _renderPrefs: {
            edgeLoopPromotionSegments: 10,
            edgeHoverLineWidth: 2.5,
            edgeSelectedLineWidth: 3.25
        },
        _faceMats: null,
        _worker: null,
        _workerReady: false,
        _workerReqId: 0,
        _workerPending: new Map(),
        _rebuildSeq: 0,
        _geomSurfaceIdByFaceKey: new Map(),
        _geomSegmentIdByEdgeKey: new Map(),
        _geomBoundaryIdByLoopKey: new Map(),
        _edgeKeyByGeomSegmentId: new Map(),
        _loopKeyByGeomBoundaryId: new Map(),
        _frozenChamferEdges: null,
        _frozenEdgeOverlays: null,

        async init() {
            await ensureKernel();
            if (!this._material) {
                this._material = new THREE.MeshPhongMaterial({
                    color: 0x8d939a,
                    shininess: 28,
                    transparent: true,
                    opacity: 1,
                    side: THREE.DoubleSide
                });
                this._edgeMaterial = new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: 0.22
                });
            }
            if (!this._faceMats) {
                this._faceMats = makeFaceMaterials();
            }
            this.ensureWorker();
        },

        ensureWorker() {
            if (this._worker) return this._worker;
            try {
                const worker = new Worker(new URL('../worker/solids_worker.js', import.meta.url), { type: 'module' });
                worker.onmessage = (event) => {
                    const msg = event?.data || {};
                    const req = this._workerPending.get(msg?.id);
                    if (!req) return;
                    this._workerPending.delete(msg.id);
                    if (msg?.ok) req.resolve(msg);
                    else req.reject(new Error(msg?.error || 'worker rebuild failed'));
                };
                worker.onerror = (error) => {
                    for (const req of this._workerPending.values()) {
                        req.reject(error instanceof Error ? error : new Error(String(error)));
                    }
                    this._workerPending.clear();
                    this._worker = null;
                    this._workerReady = false;
                };
                this._worker = worker;
                this._workerReady = true;
            } catch (error) {
                this._worker = null;
                this._workerReady = false;
            }
            return this._worker;
        },

        requestWorkerRebuild(snapshot, reason = 'worker') {
            const worker = this.ensureWorker();
            if (!worker) return Promise.reject(new Error('worker unavailable'));
            const id = ++this._workerReqId;
            return new Promise((resolve, reject) => {
                this._workerPending.set(id, { resolve, reject });
                worker.postMessage({
                    id,
                    type: 'rebuild',
                    reason,
                    snapshot
                });
            });
        },

        attach(world) {
            if (this._root) return;
            this._root = new THREE.Group();
            this._root.name = 'void-solids-runtime';
            this._frozenEdgeOverlays = new THREE.Group();
            this._frozenEdgeOverlays.name = 'void-solids-frozen-edge-overlays';
            this._root.add(this._frozenEdgeOverlays);
            world?.add?.(this._root);
        },

        list() {
            const api = getApi();
            return Array.isArray(api.document.current?.generated?.solids)
                ? api.document.current.generated.solids
                : [];
        },

        buildGeometryStoreSnapshot() {
            this._geomSurfaceIdByFaceKey = new Map();
            this._geomSegmentIdByEdgeKey = new Map();
            this._geomBoundaryIdByLoopKey = new Map();
            this._edgeKeyByGeomSegmentId = new Map();
            this._loopKeyByGeomBoundaryId = new Map();
            const surfaces = [];
            const boundaries = [];
            const segments = [];
            const points = [];
            const regions = [];
            const pointIdByKey = new Map();
            const topology = {
                surface_to_segments: {},
                segment_to_surfaces: {}
            };

            const getPointId = (p, role = 'boundary-vertex') => {
                const key = quantPointKey(p);
                let pid = pointIdByKey.get(key);
                if (!pid) {
                    pid = `point:${pointIdByKey.size}`;
                    pointIdByKey.set(key, pid);
                    points.push({
                        id: pid,
                        x: Number(p?.x || 0),
                        y: Number(p?.y || 0),
                        z: Number(p?.z || 0),
                        role
                    });
                }
                return pid;
            };

            for (const [solidId, view] of this._meshViews.entries()) {
                if (!view?.faceGroups?.size) continue;
                for (const [faceId, meta] of view.faceGroups.entries()) {
                    const faceKey = `${solidId}:${faceId}`;
                    const surfaceId = `surface:${faceKey}`;
                    const loops = this.getFaceBoundaryLoops(faceKey) || [];
                    const normal = meta?.normal || {};
                    const center = meta?.center || {};
                    surfaces.push({
                        id: surfaceId,
                        solid_id: solidId,
                        face_id: faceId,
                        type: meta?.planar ? 'planar' : 'curved',
                        center: {
                            x: Number(center.x || 0),
                            y: Number(center.y || 0),
                            z: Number(center.z || 0)
                        },
                        normal: {
                            x: Number(normal.x || 0),
                            y: Number(normal.y || 0),
                            z: Number(normal.z || 1)
                        },
                        source: {
                            type: 'solid-face',
                            face_key: faceKey
                        }
                    });
                    this._geomSurfaceIdByFaceKey.set(faceKey, surfaceId);

                    const surfaceSegmentIds = [];
                    for (let li = 0; li < loops.length; li++) {
                        const loop = loops[li];
                        let loopPoints = Array.isArray(loop?.points) ? loop.points.slice() : [];
                        if (loopPoints.length < 2) continue;
                        const closed = !!loop?.closed;
                        if (closed && loopPoints.length >= 3) {
                            const first = loopPoints[0];
                            const last = loopPoints[loopPoints.length - 1];
                            if (first && last && first.distanceToSquared?.(last) <= 1e-16) {
                                loopPoints = loopPoints.slice(0, -1);
                            }
                        }
                        if (loopPoints.length < 2) continue;

                        const boundaryId = `boundary:${faceKey}:${li}`;
                        this._geomBoundaryIdByLoopKey.set(`faceedgeloop:${solidId}:${faceId}:${li}`, boundaryId);
                        this._loopKeyByGeomBoundaryId.set(boundaryId, `faceedgeloop:${solidId}:${faceId}:${li}`);
                        const boundarySegmentIds = [];
                        const stepCount = closed ? loopPoints.length : (loopPoints.length - 1);
                        for (let si = 0; si < stepCount; si++) {
                            const a = loopPoints[si];
                            const b = loopPoints[(si + 1) % loopPoints.length];
                            if (!a || !b) continue;
                            if (a.distanceToSquared?.(b) <= 1e-16) continue;
                            const segmentId = `segment:${faceKey}:${li}:${si}`;
                            const aId = getPointId(a, 'boundary-vertex');
                            const bId = getPointId(b, 'boundary-vertex');
                            const mid = a.clone().add(b).multiplyScalar(0.5);
                            const midId = getPointId(mid, 'boundary-midpoint');
                            segments.push({
                                id: segmentId,
                                boundary_id: boundaryId,
                                kind: 'line',
                                a: { x: Number(a.x || 0), y: Number(a.y || 0), z: Number(a.z || 0) },
                                b: { x: Number(b.x || 0), y: Number(b.y || 0), z: Number(b.z || 0) },
                                mid: { x: Number(mid.x || 0), y: Number(mid.y || 0), z: Number(mid.z || 0) },
                                point_ids: [aId, bId, midId],
                                source: {
                                    type: 'solid-edge',
                                    edge_key: `faceedge:${faceKey}:${Number(loop?.segmentIndices?.[si] ?? si)}`
                                }
                            });
                            this._geomSegmentIdByEdgeKey.set(`faceedge:${faceKey}:${Number(loop?.segmentIndices?.[si] ?? si)}`, segmentId);
                            this._edgeKeyByGeomSegmentId.set(segmentId, `faceedge:${faceKey}:${Number(loop?.segmentIndices?.[si] ?? si)}`);
                            boundarySegmentIds.push(segmentId);
                            surfaceSegmentIds.push(segmentId);
                            topology.segment_to_surfaces[segmentId] = [surfaceId];
                        }
                        boundaries.push({
                            id: boundaryId,
                            surface_id: surfaceId,
                            segment_ids: boundarySegmentIds,
                            closed,
                            source: {
                                type: 'solid-face-loop',
                                face_key: faceKey,
                                loop_index: li
                            }
                        });
                        regions.push({
                            id: `region:${faceKey}:${li}`,
                            surface_id: surfaceId,
                            boundary_ids: [boundaryId],
                            source: {
                                type: 'surface-loop-region',
                                face_key: faceKey,
                                loop_index: li
                            }
                        });
                    }
                    topology.surface_to_segments[surfaceId] = surfaceSegmentIds;
                }
            }
            return {
                surfaces,
                boundaries,
                segments,
                points,
                regions,
                topology,
                meta: {
                    feature_count: Number(getApi()?.features?.list?.()?.length || 0)
                }
            };
        },

        getSolidDependencySignature(solidId) {
            const id = String(solidId || '');
            if (!id) return null;
            const meshData = this._meshCache?.get?.(id);
            const pos = meshData?.positions;
            const idx = meshData?.indices;
            if (!pos?.length || !idx?.length) return null;
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let i = 0; i < pos.length; i += 3) {
                const x = pos[i];
                const y = pos[i + 1];
                const z = pos[i + 2];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (z < minZ) minZ = z;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                if (z > maxZ) maxZ = z;
            }
            const q = v => Math.round(Number(v || 0) * 1000) / 1000;
            return [
                pos.length,
                idx.length,
                q(minX), q(minY), q(minZ),
                q(maxX), q(maxY), q(maxZ)
            ].join('|');
        },

        getExportRecords(ids = []) {
            const requested = Array.isArray(ids) ? ids.filter(Boolean) : [];
            const wanted = requested.length ? new Set(requested) : null;
            const solids = this.list();
            const out = [];
            for (const solid of solids) {
                const id = solid?.id;
                if (!id) continue;
                if (wanted && !wanted.has(id)) continue;
                const meshData = this._meshCache.get(id);
                if (!meshData) continue;
                const varr = flattenMeshToTriangleVertexArray(meshData);
                if (!varr.length) continue;
                out.push({
                    id,
                    file: String(solid?.name || `solid-${id}`),
                    varr
                });
            }
            return out;
        },

        setSelected(ids = []) {
            this._selectedIds = new Set(ids || []);
            this.syncRuntime();
        },

        setHovered(ids = []) {
            this._hoveredIds = new Set(ids || []);
            this.syncRuntime();
        },

        syncRuntime() {
            if (!this._root) return;
            const solids = this.list();
            const byId = new Set(solids.map(s => s?.id).filter(Boolean));

            for (const [id, view] of this._meshViews.entries()) {
                if (byId.has(id)) continue;
                this._root.remove(view.group);
                view.mesh.geometry?.dispose?.();
                view.indexedGeometry?.dispose?.();
                view.mesh.material?.dispose?.();
                view.edges.geometry?.dispose?.();
                view.edges.material?.dispose?.();
                for (const overlay of view.faceOverlays?.values?.() || []) {
                    overlay.geometry?.dispose?.();
                }
                while (view.edgeOverlays?.children?.length) {
                    const child = view.edgeOverlays.children[0];
                    child.geometry?.dispose?.();
                    child.material?.dispose?.();
                    view.edgeOverlays.remove(child);
                }
                this._meshViews.delete(id);
            }

            for (const solid of solids) {
                const id = solid?.id;
                if (!id) continue;
                const meshData = this._meshCache.get(id);
                const visible = solid?.visible !== false;
                if (!meshData) {
                    const stale = this._meshViews.get(id);
                    if (stale) {
                        stale.group.visible = false;
                    }
                    continue;
                }
                let view = this._meshViews.get(id);
                if (!view) {
                    const built = buildSolidGeometry(meshData);
                    const mesh = new THREE.Mesh(built.render, this._material.clone());
                    mesh.userData.solidId = id;
                    mesh.userData.solid = true;
                    const edgesGeom = new THREE.EdgesGeometry(built.render, SOLID_CREASE_ANGLE_DEG);
                    const edges = new THREE.LineSegments(edgesGeom, this._edgeMaterial.clone());
                    edges.userData.solidId = id;
                    edges.userData.solidEdge = true;
                    // Edge picking needs a small tolerance bump over global line picks.
                    const baseRaycast = edges.raycast.bind(edges);
                    edges.raycast = function(raycaster, intersects) {
                        const prev = Number(raycaster?.params?.Line?.threshold || 0);
                        if (raycaster?.params?.Line) {
                            raycaster.params.Line.threshold = Math.max(prev, 1);
                        }
                        baseRaycast(raycaster, intersects);
                        if (raycaster?.params?.Line) {
                            raycaster.params.Line.threshold = prev;
                        }
                    };
                    const overlays = new THREE.Group();
                    overlays.name = `solid-${id}-face-overlays`;
                    const edgeOverlays = new THREE.Group();
                    edgeOverlays.name = `solid-${id}-edge-overlays`;
                    const group = new THREE.Group();
                    group.name = `solid-${id}`;
                    group.add(mesh);
                    group.add(edges);
                    group.add(overlays);
                    group.add(edgeOverlays);
                    this._root.add(group);
                    view = { group, mesh, edges, overlays, edgeOverlays, faceOverlays: new Map(), faceTriToGroup: new Int32Array(0), faceGroups: new Map(), indexedGeometry: built.indexed };
                    this._meshViews.set(id, view);
                } else {
                    // Always replace geometry on rebuild. Topology counts can stay
                    // constant while positions change (depth/direction/symmetric).
                    view.mesh.geometry?.dispose?.();
                    view.indexedGeometry?.dispose?.();
                    view.edges.geometry?.dispose?.();
                    for (const overlay of view.faceOverlays?.values?.() || []) {
                        overlay.geometry?.dispose?.();
                    }
                    view.faceOverlays?.clear?.();
                    while (view.overlays?.children?.length) {
                        view.overlays.remove(view.overlays.children[0]);
                    }
                    while (view.edgeOverlays?.children?.length) {
                        const child = view.edgeOverlays.children[0];
                        child.geometry?.dispose?.();
                        child.material?.dispose?.();
                        view.edgeOverlays.remove(child);
                    }
                    const built = buildSolidGeometry(meshData);
                    view.mesh.geometry = built.render;
                    view.indexedGeometry = built.indexed;
                    view.edges.geometry = new THREE.EdgesGeometry(built.render, SOLID_CREASE_ANGLE_DEG);
                }
                // Build selectable face regions from the same geometry used for ray hits.
                // This keeps surface-region hover/selection aligned with rendered shading.
                const faceData = buildSurfaceRegionData(view.mesh.geometry || view.indexedGeometry);
                view.faceTriToGroup = faceData.triToGroup;
                view.faceGroups = faceData.groups;
                for (const [faceId, face] of faceData.groups.entries()) {
                    const mesh = new THREE.Mesh(face.geometry, this._faceMats.hover);
                    mesh.visible = false;
                    mesh.renderOrder = 40;
                    mesh.userData.solidFaceOverlay = true;
                    view.overlays.add(mesh);
                    view.faceOverlays.set(faceId, mesh);
                }
                const selected = this._selectedIds.has(id);
                const hovered = this._hoveredIds.has(id);
                if (view.mesh.material?.color) {
                    view.mesh.material.color.setHex(selected ? 0xa0b7d1 : (hovered ? 0x97a8b8 : 0x8d939a));
                }
                if (view.edges.material?.opacity !== undefined) {
                    view.edges.material.opacity = selected ? 0.9 : (hovered ? 0.55 : 0.22);
                }
                view.group.visible = visible;
            }
            this._selectedFaceKeys = new Set(Array.from(this._selectedFaceKeys).filter(key => this.getFaceByKey(key)));
            if (this._hoveredFaceKey && !this.getFaceByKey(this._hoveredFaceKey)) {
                this._hoveredFaceKey = null;
            }
            this._selectedEdgeKeys = new Set(Array.from(this._selectedEdgeKeys).filter(key => this.getEdgeByKey(key)));
            if (this._hoveredEdgeKey && !this.getEdgeByKey(this._hoveredEdgeKey)) {
                this._hoveredEdgeKey = null;
            }
            this.syncFaceOverlays();
            this.syncEdgeOverlays();
            const api = getApi();
            const doc = api?.document?.current || null;
            if (doc) {
                const snapshot = this.buildGeometryStoreSnapshot();
                api.geometryStore?.applySolidSnapshot?.(doc, snapshot);
            }
        },

        getPickMeshes() {
            const out = [];
            for (const view of this._meshViews.values()) {
                if (view?.group?.visible !== false && view?.mesh?.visible !== false) {
                    out.push(view.mesh);
                }
            }
            return out;
        },

        getPickEdges() {
            const out = [];
            for (const view of this._meshViews.values()) {
                if (view?.group?.visible === false) continue;
                if (view?.edges?.visible === false) continue;
                if (view?.mesh?.visible === false) continue;
                out.push(view.edges);
            }
            return out;
        },

        getPickEdgeForSolid(solidId) {
            const id = String(solidId || '');
            if (!id) return null;
            const view = this._meshViews.get(id);
            if (!view || view?.group?.visible === false || view?.mesh?.visible === false || view?.edges?.visible === false) {
                return null;
            }
            return view.edges || null;
        },

        getEdgeSegmentWorld(object, segmentIndex) {
            if (!object?.geometry || segmentIndex < 0) return null;
            object.updateMatrixWorld?.(true);
            const pos = object.geometry.getAttribute?.('position');
            if (!pos) return null;
            const idx = object.geometry.getIndex?.();
            const ai = segmentIndex * 2;
            const bi = ai + 1;
            let ia = ai;
            let ib = bi;
            if (idx?.array?.length) {
                if (bi >= idx.array.length) return null;
                ia = idx.array[ai];
                ib = idx.array[bi];
            } else if (bi >= pos.count) {
                return null;
            }
            const a = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(object.matrixWorld);
            const b = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(object.matrixWorld);
            return { a, b };
        },

        getEdgeHitFromIntersections(intersections = []) {
            if (!Array.isArray(intersections)) return null;
            for (const hit of intersections) {
                const object = hit?.object;
                if (!object || !isObjectEffectivelyVisible(object)) continue;
                if (object?.userData?.solidEdge !== true) continue;
                const solidId = String(object?.userData?.solidId || '');
                if (!solidId) continue;

                let segIndex = Number(hit?.index);
                let seg = Number.isFinite(segIndex) ? this.getEdgeSegmentWorld(object, segIndex) : null;

                // Some line raycast paths do not provide a stable segment index.
                // Resolve by nearest world-space segment to the reported hit point.
                if (!seg && hit?.point) {
                    const pos = object.geometry?.getAttribute?.('position');
                    const idx = object.geometry?.getIndex?.();
                    const segCount = idx?.array?.length
                        ? Math.floor(idx.array.length / 2)
                        : Math.floor((pos?.count || 0) / 2);
                    let bestI = -1;
                    let bestD2 = Infinity;
                    for (let i = 0; i < segCount; i++) {
                        const cand = this.getEdgeSegmentWorld(object, i);
                        if (!cand) continue;
                        const d2 = distancePointToSegmentSquared(hit.point, cand.a, cand.b);
                        if (d2 < bestD2) {
                            bestD2 = d2;
                            bestI = i;
                            seg = cand;
                        }
                    }
                    if (bestI >= 0) {
                        segIndex = bestI;
                    }
                }

                if (!seg) continue;
                const mid = seg.a.clone().add(seg.b).multiplyScalar(0.5);
                return {
                    solidId,
                    index: segIndex,
                    aWorld: seg.a,
                    bWorld: seg.b,
                    midWorld: mid,
                    intersection: hit
                };
            }
            return null;
        },

        getEdgeByKey(key) {
            const raw = String(key || '');
            const frozen = this._frozenChamferEdges;
            if (frozen) {
                const exact = frozen.byKey?.get?.(raw) || null;
                if (exact) return exact;
                if (raw.startsWith('segment:')) {
                    const mapped = frozen.geomSegToEdgeKey?.get?.(raw) || null;
                    if (mapped) {
                        return frozen.byKey?.get?.(mapped) || null;
                    }
                    if (raw.startsWith('segment:faceedge:') || raw.startsWith('segment:faceedgeloop:')) {
                        const ek = raw.substring('segment:'.length);
                        return frozen.byKey?.get?.(ek) || null;
                    }
                }
                if (raw.startsWith('boundary:')) {
                    const mapped = frozen.geomBoundaryToEdgeKey?.get?.(raw) || null;
                    if (mapped) {
                        return frozen.byKey?.get?.(mapped) || null;
                    }
                }
                // In frozen chamfer mode, never fall through to live topology lookup.
                return null;
            }
            if (raw.startsWith('faceedgeloop:')) {
                const parts = raw.split(':');
                if (parts.length < 4) return null;
                const loopIndex = Number(parts[parts.length - 1]);
                const faceId = Number(parts[parts.length - 2]);
                const solidId = parts.slice(1, -2).join(':');
                if (!solidId || !Number.isFinite(faceId) || !Number.isFinite(loopIndex)) return null;
                const loops = this.getFaceBoundaryLoops(`${solidId}:${faceId}`) || [];
                const loop = loops[loopIndex];
                if (!loop?.points?.length) return null;
                const pathWorld = loop.points.map(p => p.clone());
                if (loop.closed && pathWorld.length >= 2) {
                    const first = pathWorld[0];
                    const last = pathWorld[pathWorld.length - 1];
                    if (first.distanceToSquared(last) > 1e-16) {
                        pathWorld.push(first.clone());
                    }
                }
                const meshEdgeKeys = [];
                for (let i = 0; i + 1 < pathWorld.length; i++) {
                    const mk = this.getNearestMeshEdgeKeyForWorldSegment(solidId, pathWorld[i], pathWorld[i + 1]);
                    if (mk && !meshEdgeKeys.includes(mk)) meshEdgeKeys.push(mk);
                }
                const segIndex = Number(loop.segmentIndices?.[0]);
                return {
                    key: raw,
                    solidId,
                    faceId,
                    index: Number.isFinite(segIndex) ? segIndex : null,
                    pathWorld,
                    loop: true,
                    meshEdgeKey: meshEdgeKeys[0] || null,
                    meshEdgeKeys
                };
            }
            if (raw.startsWith('faceedgechain:')) {
                const parts = raw.split(':');
                if (parts.length < 6) return null;
                const endSegIndex = Number(parts[parts.length - 1]);
                const startSegIndex = Number(parts[parts.length - 2]);
                const loopIndex = Number(parts[parts.length - 3]);
                const faceId = Number(parts[parts.length - 4]);
                const solidId = parts.slice(1, -4).join(':');
                if (!solidId || !Number.isFinite(faceId) || !Number.isFinite(loopIndex)
                    || !Number.isFinite(startSegIndex) || !Number.isFinite(endSegIndex)) return null;
                const loops = this.getFaceBoundaryLoops(`${solidId}:${faceId}`) || [];
                const loop = loops[loopIndex];
                if (!loop?.points?.length) return null;
                const segIndices = Array.isArray(loop.segmentIndices) ? loop.segmentIndices : [];
                const startPos = segIndices.indexOf(startSegIndex);
                const endPos = segIndices.indexOf(endSegIndex);
                if (startPos < 0 || endPos < 0) return null;
                const n = segIndices.length;
                const pts = loop.points;
                const pathWorld = [];
                let i = startPos;
                pathWorld.push(pts[i]?.clone?.() || null);
                for (let guard = 0; guard < n + 2; guard++) {
                    const ni = loop.closed ? ((i + 1) % n) : (i + 1);
                    if (ni < 0 || ni >= n) break;
                    pathWorld.push(pts[ni]?.clone?.() || null);
                    if (i === endPos) break;
                    i = ni;
                    if (loop.closed && i === startPos) break;
                }
                const clean = pathWorld.filter(Boolean);
                if (clean.length < 2) return null;
                const meshEdgeKeys = [];
                for (let si = 0; si + 1 < clean.length; si++) {
                    const mk = this.getNearestMeshEdgeKeyForWorldSegment(solidId, clean[si], clean[si + 1]);
                    if (mk && !meshEdgeKeys.includes(mk)) meshEdgeKeys.push(mk);
                }
                return {
                    key: raw,
                    solidId,
                    faceId,
                    index: startSegIndex,
                    chain: true,
                    pathWorld: clean,
                    aWorld: clean[0]?.clone?.() || null,
                    bWorld: clean[clean.length - 1]?.clone?.() || null,
                    midWorld: clean[Math.floor(clean.length / 2)]?.clone?.() || null,
                    meshEdgeKey: meshEdgeKeys[0] || null,
                    meshEdgeKeys
                };
            }
            if (raw.startsWith('faceedge:')) {
                const parts = raw.split(':');
                if (parts.length < 4) return null;
                const segIndex = Number(parts[parts.length - 1]);
                const faceId = Number(parts[parts.length - 2]);
                const solidId = parts.slice(1, -2).join(':');
                if (!solidId || !Number.isFinite(faceId) || !Number.isFinite(segIndex)) return null;
                const segs = this.getFaceBoundarySegments(`${solidId}:${faceId}`) || [];
                const seg = segs[segIndex];
                if (!seg?.a || !seg?.b) return null;
                const meshEdgeKey = this.getNearestMeshEdgeKeyForWorldSegment(solidId, seg.a, seg.b);
                return {
                    key: raw,
                    solidId,
                    index: segIndex,
                    faceId,
                    aWorld: seg.a,
                    bWorld: seg.b,
                    midWorld: seg.mid || seg.a.clone().add(seg.b).multiplyScalar(0.5),
                    meshEdgeKey: meshEdgeKey || null
                };
            }
            const splitAt = raw.lastIndexOf(':');
            if (splitAt <= 0 || splitAt >= raw.length - 1) return null;
            const solidId = raw.substring(0, splitAt);
            const edgeIndex = Number(raw.substring(splitAt + 1));
            if (!solidId || !Number.isFinite(edgeIndex)) return null;
            const edgeObj = this.getPickEdgeForSolid(solidId);
            if (!edgeObj) return null;
            const seg = this.getEdgeSegmentWorld(edgeObj, edgeIndex);
            if (!seg) return null;
            const meshEdgeKey = this.getNearestMeshEdgeKeyForWorldSegment(solidId, seg.a, seg.b);
            return {
                key: `${solidId}:${edgeIndex}`,
                solidId,
                index: edgeIndex,
                aWorld: seg.a,
                bWorld: seg.b,
                midWorld: seg.a.clone().add(seg.b).multiplyScalar(0.5),
                meshEdgeKey: meshEdgeKey || null
            };
        },

        getNearestMeshEdgeKeyForWorldSegment(solidId, aWorld, bWorld) {
            if (!solidId || !aWorld || !bWorld) return null;
            const view = this._meshViews.get(String(solidId));
            const geo = view?.indexedGeometry;
            const pos = geo?.getAttribute?.('position')?.array;
            const idx = geo?.getIndex?.()?.array;
            const mesh = view?.mesh;
            if (!pos?.length || !idx?.length || !mesh?.matrixWorld) return null;
            mesh.updateMatrixWorld?.(true);
            const reqA = aWorld.clone ? aWorld.clone() : new THREE.Vector3(Number(aWorld.x || 0), Number(aWorld.y || 0), Number(aWorld.z || 0));
            const reqB = bWorld.clone ? bWorld.clone() : new THREE.Vector3(Number(bWorld.x || 0), Number(bWorld.y || 0), Number(bWorld.z || 0));
            const scoreSegment = (ea, eb) => {
                const d1 = ea.distanceTo(reqA) + eb.distanceTo(reqB);
                const d2 = ea.distanceTo(reqB) + eb.distanceTo(reqA);
                return Math.min(d1, d2);
            };
            const edgeToTris = new Map();
            const edgeVerts = new Map();
            const triCount = Math.floor(idx.length / 3);
            for (let t = 0; t < triCount; t++) {
                const i0 = idx[t * 3];
                const i1 = idx[t * 3 + 1];
                const i2 = idx[t * 3 + 2];
                const edges = [[i0, i1], [i1, i2], [i2, i0]];
                for (const [va, vb] of edges) {
                    const ek = edgeKey(va, vb);
                    const list = edgeToTris.get(ek);
                    if (list) list.push(t);
                    else edgeToTris.set(ek, [t]);
                    if (!edgeVerts.has(ek)) edgeVerts.set(ek, [va, vb]);
                }
            }
            let bestKey = null;
            let bestScore = Infinity;
            for (const [ek, tris] of edgeToTris.entries()) {
                if (!Array.isArray(tris) || tris.length < 2) continue;
                const rep = edgeVerts.get(ek);
                const va = Number(rep?.[0]);
                const vb = Number(rep?.[1]);
                if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
                const pa = new THREE.Vector3(pos[va * 3], pos[va * 3 + 1], pos[va * 3 + 2]).applyMatrix4(mesh.matrixWorld);
                const pb = new THREE.Vector3(pos[vb * 3], pos[vb * 3 + 1], pos[vb * 3 + 2]).applyMatrix4(mesh.matrixWorld);
                const score = scoreSegment(pa, pb);
                if (score < bestScore) {
                    bestScore = score;
                    bestKey = ek;
                }
            }
            return bestKey;
        },

        getFaceEdgeHit(faceKey, worldPoint, maxWorldDist = 2.5) {
            if (!faceKey || !worldPoint) return null;
            const frozen = this._frozenChamferEdges;
            if (frozen?.list?.length) {
                const maxD2 = Math.max(0.01, Number(maxWorldDist || 2.5) ** 2);
                let best = null;
                let bestD2 = Infinity;
                const eps = 1e-10;
                for (const edge of frozen.list) {
                    let d2 = Infinity;
                    if (Array.isArray(edge?.pathWorld) && edge.pathWorld.length >= 2) {
                        for (let i = 0; i < edge.pathWorld.length - 1; i++) {
                            const a = edge.pathWorld[i];
                            const b = edge.pathWorld[i + 1];
                            if (!a || !b) continue;
                            const cand = distancePointToSegmentSquared(worldPoint, a, b);
                            if (cand < d2) d2 = cand;
                        }
                    } else if (edge?.aWorld && edge?.bWorld) {
                        d2 = distancePointToSegmentSquared(worldPoint, edge.aWorld, edge.bWorld);
                    }
                    if (!Number.isFinite(d2)) continue;
                    const better = d2 < (bestD2 - eps);
                    const tiePreferPath = Math.abs(d2 - bestD2) <= eps
                        && !!edge?.pathWorld
                        && edge.pathWorld.length >= 3
                        && !(best?.pathWorld && best.pathWorld.length >= 3);
                    const nearPreferPath = !better
                        && !!edge?.pathWorld
                        && edge.pathWorld.length >= 3
                        && !(best?.pathWorld && best.pathWorld.length >= 3)
                        && d2 <= (bestD2 * 1.15 + eps);
                    if (better || tiePreferPath || nearPreferPath) {
                        bestD2 = d2;
                        best = edge;
                    }
                }
                if (best && bestD2 <= maxD2) {
                    return {
                        key: best.key,
                        solidId: best.solidId,
                        faceId: best.faceId,
                        index: best.index,
                        loop: !!best.loop,
                        pathWorld: Array.isArray(best.pathWorld) ? best.pathWorld : null,
                        aWorld: best.aWorld,
                        bWorld: best.bWorld,
                        midWorld: best.midWorld
                    };
                }
                return null;
            }
            const splitAt = String(faceKey).lastIndexOf(':');
            if (splitAt <= 0) return null;
            const solidId = String(faceKey).substring(0, splitAt);
            const faceId = Number(String(faceKey).substring(splitAt + 1));
            if (!solidId || !Number.isFinite(faceId)) return null;
            const segs = this.getFaceBoundarySegments(faceKey) || [];
            if (!segs.length) return null;
            const loops = this.getFaceBoundaryLoops(faceKey) || [];
            const segLoopMeta = new Map();
            for (let li = 0; li < loops.length; li++) {
                const loop = loops[li];
                const segIndices = Array.isArray(loop?.segmentIndices) ? loop.segmentIndices : [];
                for (const si of segIndices) {
                    segLoopMeta.set(Number(si), { loopIndex: li, closed: !!loop?.closed });
                }
            }

            let bestAnyIndex = -1;
            let bestAnyD2 = Infinity;
            let bestClosedIndex = -1;
            let bestClosedD2 = Infinity;
            for (let i = 0; i < segs.length; i++) {
                const seg = segs[i];
                if (!seg?.a || !seg?.b) continue;
                const d2 = distancePointToSegmentSquared(worldPoint, seg.a, seg.b);
                if (d2 < bestAnyD2) {
                    bestAnyD2 = d2;
                    bestAnyIndex = i;
                }
                const meta = segLoopMeta.get(i);
                if (meta?.closed && d2 < bestClosedD2) {
                    bestClosedD2 = d2;
                    bestClosedIndex = i;
                }
            }
            const maxD2 = maxWorldDist * maxWorldDist;
            if (bestAnyIndex < 0 || bestAnyD2 > maxD2) return null;

            // Prefer closed-loop boundaries over open seam chains when both are plausible.
            let bestIndex = bestAnyIndex;
            if (bestClosedIndex >= 0 && bestClosedD2 <= maxD2) {
                const openPicked = !segLoopMeta.get(bestAnyIndex)?.closed;
                if (openPicked || bestClosedD2 <= (bestAnyD2 * 1.5)) {
                    bestIndex = bestClosedIndex;
                }
            }
            const seg = segs[bestIndex];
            const loopIndex = loops.findIndex(loop => Array.isArray(loop?.segmentIndices) && loop.segmentIndices.includes(bestIndex));
            if (loopIndex >= 0) {
                const loop = loops[loopIndex];
                if (shouldPromoteLoopSelection(loop, this._renderPrefs?.edgeLoopPromotionSegments)) {
                    const pathWorld = Array.isArray(loop?.points) ? loop.points.map(p => p.clone()) : [];
                    if (loop?.closed && pathWorld.length >= 2) {
                        const first = pathWorld[0];
                        const last = pathWorld[pathWorld.length - 1];
                        if (first.distanceToSquared(last) > 1e-16) {
                            pathWorld.push(first.clone());
                        }
                    }
                    if (pathWorld.length >= 2) {
                        return {
                            key: `faceedgeloop:${solidId}:${faceId}:${loopIndex}`,
                            solidId,
                            faceId,
                            index: bestIndex,
                            pathWorld,
                            loop: true
                        };
                    }
                }
                const chain = buildSmoothChainFromLoop(loop, bestIndex);
                if (chain?.pathWorld?.length >= 2) {
                    return {
                        key: `faceedgechain:${solidId}:${faceId}:${loopIndex}:${chain.startSegIndex}:${chain.endSegIndex}`,
                        solidId,
                        faceId,
                        index: bestIndex,
                        chain: true,
                        pathWorld: chain.pathWorld
                    };
                }
            }
            return {
                key: `faceedge:${solidId}:${faceId}:${bestIndex}`,
                solidId,
                faceId,
                index: bestIndex,
                aWorld: seg.a,
                bWorld: seg.b,
                midWorld: seg.mid || seg.a.clone().add(seg.b).multiplyScalar(0.5)
            };
        },

        resolveEdgeFromSource(source = {}) {
            if (source?.type !== 'solid-edge') return null;
            const targetSolidId = String(source?.solid_id || '');
            const targetFeatureId = String(source?.solid_feature_id || '');
            const sourceFaceId = Number(source?.face_id);
            const sa = source?.a;
            const sb = source?.b;
            if (!sa || !sb) return null;
            const srcA = new THREE.Vector3(Number(sa.x || 0), Number(sa.y || 0), Number(sa.z || 0));
            const srcB = new THREE.Vector3(Number(sb.x || 0), Number(sb.y || 0), Number(sb.z || 0));
            const solids = this.list() || [];
            const scoreSegment = (aWorld, bWorld) => {
                const d1 = aWorld.distanceTo(srcA) + bWorld.distanceTo(srcB);
                const d2 = aWorld.distanceTo(srcB) + bWorld.distanceTo(srcA);
                return Math.min(d1, d2);
            };
            if (targetSolidId && Number.isFinite(sourceFaceId)) {
                const faceKey = `${targetSolidId}:${sourceFaceId}`;
                const segs = this.getFaceBoundarySegments(faceKey) || [];
                const sourceEdgeIndex = Number(source?.edge_index);
                if (Number.isFinite(sourceEdgeIndex) && sourceEdgeIndex >= 0 && sourceEdgeIndex < segs.length) {
                    const seg = segs[sourceEdgeIndex];
                    if (seg?.a && seg?.b) {
                        return {
                            solidId: targetSolidId,
                            index: sourceEdgeIndex,
                            aWorld: seg.a,
                            bWorld: seg.b,
                            midWorld: seg.a.clone().add(seg.b).multiplyScalar(0.5)
                        };
                    }
                }
                const face = this.getFaceByKey(faceKey);
                const faceFrame = face?.meta ? this.frameFromFaceMeta(face.meta, source?.face_frame || null) : null;
                const faceBasis = frameToBasis(faceFrame);
                const srcLocalA = source?.local_a && faceBasis ? source.local_a : null;
                const srcLocalB = source?.local_b && faceBasis ? source.local_b : null;
                const srcPredA = srcLocalA ? frameLocalToWorld(srcLocalA, faceBasis) : null;
                const srcPredB = srcLocalB ? frameLocalToWorld(srcLocalB, faceBasis) : null;
                let bestFace = null;
                let bestFaceScore = Infinity;
                for (let i = 0; i < segs.length; i++) {
                    const seg = segs[i];
                    if (!seg?.a || !seg?.b) continue;
                    const score = (srcPredA && srcPredB)
                        ? Math.min(
                            seg.a.distanceTo(srcPredA) + seg.b.distanceTo(srcPredB),
                            seg.a.distanceTo(srcPredB) + seg.b.distanceTo(srcPredA)
                        )
                        : scoreSegment(seg.a, seg.b);
                    if (score < bestFaceScore) {
                        bestFaceScore = score;
                        bestFace = { solidId: targetSolidId, index: i, aWorld: seg.a, bWorld: seg.b };
                    }
                }
                if (bestFace) {
                    bestFace.midWorld = bestFace.aWorld.clone().add(bestFace.bWorld).multiplyScalar(0.5);
                    return bestFace;
                }
            }
            const searchSets = [];
            if (targetSolidId) {
                searchSets.push([targetSolidId]);
            }
            if (targetFeatureId) {
                const byFeature = [];
                for (const solid of solids) {
                    if (String(solid?.source?.feature_id || '') === targetFeatureId && solid?.id) {
                        byFeature.push(String(solid.id));
                    }
                }
                if (byFeature.length) searchSets.push(byFeature);
            }
            const all = [];
            for (const solid of solids) {
                if (solid?.id) all.push(String(solid.id));
            }
            if (all.length) searchSets.push(all);
            let best = null;
            let bestScore = Infinity;
            const scanSet = (wanted = []) => {
                for (const solidId of wanted) {
                    const view = this._meshViews.get(solidId);
                    const edgesObj = view?.edges;
                    if (!edgesObj?.geometry) continue;
                    const pos = edgesObj.geometry.getAttribute?.('position');
                    const idx = edgesObj.geometry.getIndex?.();
                    if (!pos) continue;
                    const segCount = idx?.array?.length
                        ? Math.floor(idx.array.length / 2)
                        : Math.floor(pos.count / 2);
                    for (let i = 0; i < segCount; i++) {
                        const seg = this.getEdgeSegmentWorld(edgesObj, i);
                        if (!seg) continue;
                        const score = scoreSegment(seg.a, seg.b);
                        if (score < bestScore) {
                            bestScore = score;
                            best = { solidId, index: i, aWorld: seg.a, bWorld: seg.b };
                        }
                    }
                }
            };
            for (const wanted of searchSets) {
                if (best) break;
                scanSet(wanted);
            }
            if (!best) return null;
            best.midWorld = best.aWorld.clone().add(best.bWorld).multiplyScalar(0.5);
            return best;
        },

        resolvePointFromSource(source = {}) {
            if (source?.type !== 'solid-edge') return null;
            const targetSolidId = String(source?.solid_id || '');
            const sourceFaceId = Number(source?.face_id);
            if (targetSolidId && Number.isFinite(sourceFaceId) && source?.local_point) {
                const faceKey = `${targetSolidId}:${sourceFaceId}`;
                const face = this.getFaceByKey(faceKey);
                if (face?.meta) {
                    const frame = this.frameFromFaceMeta(face.meta, source?.face_frame || null);
                    const basis = frameToBasis(frame);
                    const world = frameLocalToWorld(source.local_point, basis);
                    if (world) return world;
                }
            }
            const seg = this.resolveEdgeFromSource(source);
            if (!seg) return null;
            const kind = source?.point_kind || 'mid';
            if (kind === 'a') return seg.aWorld;
            if (kind === 'b') return seg.bWorld;
            return seg.midWorld;
        },

        getFaceHitFromIntersections(intersections = []) {
            if (!Array.isArray(intersections)) return null;
            for (const hit of intersections) {
                const object = hit?.object;
                if (!object || !isObjectEffectivelyVisible(object)) continue;
                const solidId = object?.userData?.solidId;
                const tri = hit?.faceIndex;
                if (!solidId || tri === undefined || tri === null) continue;
                const view = this._meshViews.get(solidId);
                if (!view) continue;
                const groupId = view.faceTriToGroup?.[tri];
                if (groupId === undefined || groupId < 0) continue;
                const key = `${solidId}:${groupId}`;
                return { key, solidId, groupId, intersection: hit };
            }
            return null;
        },

        getFaceByKey(key) {
            const raw = String(key || '');
            const splitAt = raw.lastIndexOf(':');
            if (splitAt <= 0 || splitAt >= raw.length - 1) return null;
            const solidId = raw.substring(0, splitAt);
            const faceIdRaw = raw.substring(splitAt + 1);
            const faceId = Number(faceIdRaw);
            if (!Number.isFinite(faceId)) return null;
            const view = this._meshViews.get(solidId);
            const meta = view?.faceGroups?.get(faceId);
            if (!view || !meta) return null;
            return { key: `${solidId}:${faceId}`, solidId, faceId, view, meta };
        },

        getPromotedLoopEdgeKeyForSelection(edgeKey) {
            const raw = String(edgeKey || '');
            if (!raw.startsWith('faceedge:')) return raw || null;
            const parts = raw.split(':');
            if (parts.length < 4) return raw;
            const segIndex = Number(parts[parts.length - 1]);
            const faceId = Number(parts[parts.length - 2]);
            const solidId = parts.slice(1, -2).join(':');
            if (!solidId || !Number.isFinite(faceId) || !Number.isFinite(segIndex)) return raw;
            const faceKey = `${solidId}:${faceId}`;
            const loops = this.getFaceBoundaryLoops(faceKey) || [];
            for (let li = 0; li < loops.length; li++) {
                const loop = loops[li];
                const segs = Array.isArray(loop?.segmentIndices) ? loop.segmentIndices : [];
                if (!segs.includes(segIndex)) continue;
                if (!shouldPromoteLoopSelection(loop, this._renderPrefs?.edgeLoopPromotionSegments)) {
                    return raw;
                }
                return `faceedgeloop:${solidId}:${faceId}:${li}`;
            }
            return raw;
        },

        resolveCanonicalFaceEntity(faceKey) {
            const key = String(faceKey || '');
            if (!key) return null;
            return {
                kind: 'surface',
                id: this._geomSurfaceIdByFaceKey.get(key) || `surface:${key}`
            };
        },

        resolveCanonicalEdgeEntity(edgeKey) {
            const key = String(edgeKey || '');
            if (!key) return null;
            const loopBoundary = this._geomBoundaryIdByLoopKey.get(key);
            if (loopBoundary) {
                return { kind: 'boundary', id: loopBoundary };
            }
            const segId = this._geomSegmentIdByEdgeKey.get(key);
            if (segId) {
                return { kind: 'boundary-segment', id: segId };
            }
            return { kind: 'boundary-segment', id: `segment:${key}` };
        },

        getEdgeKeyForBoundaryRef(refId) {
            const raw = String(refId || '');
            if (!raw) return null;
            const frozen = this._frozenChamferEdges;
            if (frozen) {
                if (raw.startsWith('faceedge:') || raw.startsWith('faceedgeloop:')) {
                    return frozen.byKey?.has?.(raw) ? raw : null;
                }
                if (raw.startsWith('segment:faceedge:') || raw.startsWith('segment:faceedgeloop:')) {
                    const key = raw.substring('segment:'.length);
                    return frozen.byKey?.has?.(key) ? key : null;
                }
                if (raw.startsWith('segment:')) {
                    return frozen.geomSegToEdgeKey?.get?.(raw) || null;
                }
                if (raw.startsWith('boundary:')) {
                    return frozen.geomBoundaryToEdgeKey?.get?.(raw) || null;
                }
            }
            if (raw.startsWith('faceedge:') || raw.startsWith('faceedgeloop:')) {
                return raw;
            }
            if (raw.startsWith('segment:faceedge:') || raw.startsWith('segment:faceedgeloop:')) {
                return raw.substring('segment:'.length);
            }
            if (raw.startsWith('segment:')) {
                return this._edgeKeyByGeomSegmentId.get(raw) || null;
            }
            if (raw.startsWith('boundary:')) {
                return this._loopKeyByGeomBoundaryId.get(raw) || null;
            }
            return null;
        },

        resolveChamferRefToEdgeKey(ref = {}) {
            const frozen = this._frozenChamferEdges;
            if (!frozen?.list?.length) return null;
            const mapped = this.getEdgeKeyForBoundaryRef(ref?.boundary_segment_id || ref?.entity?.id || '');
            if (mapped && this.getEdgeByKey(mapped)) return mapped;
            const explicit = String(ref?.key || '').trim();
            if (explicit && this.getEdgeByKey(explicit)) return explicit;
            return null;
        },

        captureChamferEdgeSnapshotFromCurrentViews() {
            const byKey = new Map();
            const list = [];
            const geomSegToEdgeKey = new Map();
            const geomBoundaryToEdgeKey = new Map();
            for (const [solidId, view] of this._meshViews.entries()) {
                const faceGroups = view?.faceGroups;
                if (!faceGroups || typeof faceGroups.keys !== 'function') continue;
                for (const faceId of faceGroups.keys()) {
                    if (!Number.isFinite(faceId)) continue;
                    const faceKey = `${solidId}:${faceId}`;
                    const segs = this.getFaceBoundarySegments(faceKey) || [];
                    for (let i = 0; i < segs.length; i++) {
                        const seg = segs[i];
                        if (!seg?.a || !seg?.b) continue;
                        const key = `faceedge:${solidId}:${faceId}:${i}`;
                        const edge = {
                            key,
                            solidId,
                            faceId,
                            index: i,
                            aWorld: seg.a.clone ? seg.a.clone() : new THREE.Vector3(seg.a.x, seg.a.y, seg.a.z),
                            bWorld: seg.b.clone ? seg.b.clone() : new THREE.Vector3(seg.b.x, seg.b.y, seg.b.z),
                            midWorld: seg.mid?.clone ? seg.mid.clone() : (seg.a.clone ? seg.a.clone().add(seg.b).multiplyScalar(0.5) : new THREE.Vector3()),
                            meshEdgeKey: this.getNearestMeshEdgeKeyForWorldSegment(solidId, seg.a, seg.b) || null
                        };
                        byKey.set(key, edge);
                        list.push(edge);
                        const geomSeg = this._geomSegmentIdByEdgeKey.get(key);
                        if (geomSeg) geomSegToEdgeKey.set(geomSeg, key);
                    }
                    const loops = this.getFaceBoundaryLoops(faceKey) || [];
                    for (let li = 0; li < loops.length; li++) {
                        const loop = loops[li];
                        const points = Array.isArray(loop?.points) ? loop.points : [];
                        if (points.length < 2) continue;
                        if (shouldPromoteLoopSelection(loop, this._renderPrefs?.edgeLoopPromotionSegments)) {
                            const pathWorld = points.map(p => p.clone ? p.clone() : new THREE.Vector3(p.x, p.y, p.z));
                            if (loop?.closed && pathWorld.length >= 2) {
                                const first = pathWorld[0];
                                const last = pathWorld[pathWorld.length - 1];
                                if (first.distanceToSquared(last) > 1e-16) pathWorld.push(first.clone());
                            }
                            if (pathWorld.length >= 2) {
                                const key = `faceedgeloop:${solidId}:${faceId}:${li}`;
                                const edge = {
                                    key,
                                    solidId,
                                    faceId,
                                    index: Number(loop?.segmentIndices?.[0] ?? null),
                                    loop: true,
                                    pathWorld,
                                    aWorld: pathWorld[0].clone(),
                                    bWorld: pathWorld[1].clone(),
                                    midWorld: pathWorld[0].clone().add(pathWorld[1]).multiplyScalar(0.5),
                                    meshEdgeKey: null
                                };
                                byKey.set(key, edge);
                                const geomBoundary = this._geomBoundaryIdByLoopKey.get(key);
                                if (geomBoundary) geomBoundaryToEdgeKey.set(geomBoundary, key);
                            }
                        } else {
                            const segIndices = Array.isArray(loop?.segmentIndices) ? loop.segmentIndices : [];
                            const chainKeys = new Set();
                            for (const segIndex of segIndices) {
                                const chain = buildSmoothChainFromLoop(loop, Number(segIndex));
                                if (!chain?.pathWorld?.length || chain.pathWorld.length < 2) continue;
                                const key = `faceedgechain:${solidId}:${faceId}:${li}:${chain.startSegIndex}:${chain.endSegIndex}`;
                                if (chainKeys.has(key)) continue;
                                chainKeys.add(key);
                                const edge = {
                                    key,
                                    solidId,
                                    faceId,
                                    index: Number(segIndex),
                                    chain: true,
                                    pathWorld: chain.pathWorld,
                                    aWorld: chain.pathWorld[0].clone(),
                                    bWorld: chain.pathWorld[chain.pathWorld.length - 1].clone(),
                                    midWorld: chain.pathWorld[Math.floor(chain.pathWorld.length / 2)].clone(),
                                    meshEdgeKey: null
                                };
                                byKey.set(key, edge);
                            }
                        }
                    }
                }
            }
            this._frozenChamferEdges = { byKey, list, geomSegToEdgeKey, geomBoundaryToEdgeKey };
            this._selectedEdgeKeys = new Set(Array.from(this._selectedEdgeKeys).filter(key => this.getEdgeByKey(key)));
            if (this._hoveredEdgeKey && !this.getEdgeByKey(this._hoveredEdgeKey)) {
                this._hoveredEdgeKey = null;
            }
            this.syncEdgeOverlays();
        },

        async beginChamferEdgeSnapshot(featureId = null) {
            const api = getApi();
            const doc = api.document.current;
            const features = api.features.list() || [];
            if (!doc || !Array.isArray(features)) {
                this.captureChamferEdgeSnapshotFromCurrentViews();
                return;
            }

            const featureIndex = featureId
                ? features.findIndex(feature => feature?.id === featureId)
                : -1;
            const canRollback = featureIndex >= 0;
            const originalTimeline = doc.timeline?.index ?? null;
            let rolledBack = false;

            try {
                if (canRollback) {
                    doc.timeline = doc.timeline || { index: null };
                    doc.timeline.index = featureIndex > 0 ? (featureIndex - 1) : -1;
                    rolledBack = true;
                    await this.rebuild('chamfer.snapshot.pre', { persist: false });
                }
                this.captureChamferEdgeSnapshotFromCurrentViews();
            } finally {
                if (rolledBack) {
                    doc.timeline = doc.timeline || { index: null };
                    doc.timeline.index = originalTimeline;
                    await this.rebuild('chamfer.snapshot.restore', { persist: false });
                    this.syncEdgeOverlays();
                }
            }
        },

        endChamferEdgeSnapshot() {
            this._frozenChamferEdges = null;
            this._selectedEdgeKeys = new Set(Array.from(this._selectedEdgeKeys).filter(key => this.getEdgeByKey(key)));
            if (this._hoveredEdgeKey && !this.getEdgeByKey(this._hoveredEdgeKey)) {
                this._hoveredEdgeKey = null;
            }
            this.syncEdgeOverlays();
        },

        getFaceBoundarySegments(key) {
            const face = this.getFaceByKey(key);
            if (!face?.meta?.geometry) return [];
            if (!Array.isArray(face.meta.boundarySegmentsLocal)) {
                face.meta.boundarySegmentsLocal = buildBoundarySegmentsFromGeometry(face.meta.geometry);
            }
            const local = face.meta.boundarySegmentsLocal || [];
            if (!local.length) return [];
            const mesh = face?.view?.mesh || null;
            if (!mesh?.matrixWorld) return [];
            mesh.updateMatrixWorld?.(true);
            const out = [];
            for (const seg of local) {
                if (!seg?.a || !seg?.b) continue;
                const a = seg.a.clone().applyMatrix4(mesh.matrixWorld);
                const b = seg.b.clone().applyMatrix4(mesh.matrixWorld);
                out.push({
                    a,
                    b,
                    mid: a.clone().add(b).multiplyScalar(0.5)
                });
            }
            return out;
        },

        getFaceBoundaryLoops(key) {
            const face = this.getFaceByKey(key);
            if (!face?.meta?.geometry) return [];
            if (!Array.isArray(face.meta.boundarySegmentsLocal)) {
                face.meta.boundarySegmentsLocal = buildBoundarySegmentsFromGeometry(face.meta.geometry);
            }
            if (!Array.isArray(face.meta.boundaryLoopsLocal)) {
                face.meta.boundaryLoopsLocal = buildBoundaryLoopsFromSegments(face.meta.boundarySegmentsLocal || []);
            }
            const loops = face.meta.boundaryLoopsLocal || [];
            if (!loops.length) return [];
            const mesh = face?.view?.mesh || null;
            if (!mesh?.matrixWorld) return [];
            mesh.updateMatrixWorld?.(true);
            return loops.map(loop => ({
                segmentIndices: Array.isArray(loop.segmentIndices) ? loop.segmentIndices.slice() : [],
                closed: !!loop.closed,
                points: Array.isArray(loop.points)
                    ? loop.points.map(p => p.clone().applyMatrix4(mesh.matrixWorld))
                    : []
            }));
        },

        setHoveredFace(key = null) {
            const next = key && this.getFaceByKey(key) ? key : null;
            if (next === this._hoveredFaceKey) return;
            this._hoveredFaceKey = next;
            this.syncFaceOverlays();
        },

        setSelectedFaces(keys = []) {
            this._selectedFaceKeys = new Set((keys || []).filter(key => this.getFaceByKey(key)));
            this.syncFaceOverlays();
        },

        toggleSelectedFace(key, multi = false) {
            if (!this.getFaceByKey(key)) return Array.from(this._selectedFaceKeys);
            if (!multi) this._selectedFaceKeys.clear();
            if (this._selectedFaceKeys.has(key)) this._selectedFaceKeys.delete(key);
            else this._selectedFaceKeys.add(key);
            this.syncFaceOverlays();
            return Array.from(this._selectedFaceKeys);
        },

        clearFaceSelection() {
            this._selectedFaceKeys.clear();
            this._hoveredFaceKey = null;
            this.syncFaceOverlays();
        },

        getSelectedFaceKeys() {
            return Array.from(this._selectedFaceKeys);
        },

        setHoveredEdge(key = null) {
            const next = key && this.getEdgeByKey(key) ? key : null;
            if (next === this._hoveredEdgeKey) return;
            this._hoveredEdgeKey = next;
            this.syncEdgeOverlays();
        },

        setSelectedEdges(keys = []) {
            this._selectedEdgeKeys = new Set((keys || []).filter(key => this.getEdgeByKey(key)));
            this.syncEdgeOverlays();
        },

        toggleSelectedEdge(key, multi = false) {
            if (!this.getEdgeByKey(key)) return Array.from(this._selectedEdgeKeys);
            if (!multi) this._selectedEdgeKeys.clear();
            if (this._selectedEdgeKeys.has(key)) this._selectedEdgeKeys.delete(key);
            else this._selectedEdgeKeys.add(key);
            this.syncEdgeOverlays();
            return Array.from(this._selectedEdgeKeys);
        },

        clearEdgeSelection() {
            this._selectedEdgeKeys.clear();
            this._hoveredEdgeKey = null;
            this.syncEdgeOverlays();
        },

        getSelectedEdgeKeys() {
            return Array.from(this._selectedEdgeKeys);
        },

        getRenderPreferences() {
            return { ...(this._renderPrefs || {}) };
        },

        setRenderPreferences(next = {}) {
            const curr = this._renderPrefs || {};
            const merged = {
                edgeLoopPromotionSegments: Math.max(3, Math.round(Number(next.edgeLoopPromotionSegments ?? curr.edgeLoopPromotionSegments ?? 10) || 10)),
                edgeHoverLineWidth: Math.max(0.5, Number(next.edgeHoverLineWidth ?? curr.edgeHoverLineWidth ?? 2.5) || 2.5),
                edgeSelectedLineWidth: Math.max(0.5, Number(next.edgeSelectedLineWidth ?? curr.edgeSelectedLineWidth ?? 3.25) || 3.25)
            };
            this._renderPrefs = merged;
            this.syncEdgeOverlays();
            return this.getRenderPreferences();
        },

        getSketchTargetForFaceKey(key) {
            const face = this.getFaceByKey(key);
            if (!face) return null;
            const { meta, solidId, faceId } = face;
            if (!meta.planar) return null;
            const frame = this.frameFromFaceMeta(meta, null);
            if (!frame) return null;
            const solid = this.list().find(item => item?.id === solidId) || null;
            return {
                kind: 'face',
                id: `${solidId}:f${faceId}`,
                name: 'Face',
                frame,
                source: {
                    type: 'solid-face',
                    solid_id: solidId,
                    face_id: faceId,
                    solid_feature_id: solid?.source?.feature_id || null,
                    dep_sig: this.getSolidDependencySignature(solidId),
                    anchor: {
                        x: Number(meta.center?.x || 0),
                        y: Number(meta.center?.y || 0),
                        z: Number(meta.center?.z || 0)
                    },
                    anchor_normal: {
                        x: Number(meta.normal?.x || 0),
                        y: Number(meta.normal?.y || 0),
                        z: Number(meta.normal?.z || 1)
                    }
                }
            };
        },

        frameFromFaceMeta(meta, preferredFrame = null) {
            if (!meta?.planar || !meta?.center || !meta?.normal) return null;
            const center = meta.center.clone();
            const normal = meta.normal.clone().normalize();
            let xAxis = preferredFrame?.x_axis
                ? new THREE.Vector3(
                    Number(preferredFrame.x_axis.x || 0),
                    Number(preferredFrame.x_axis.y || 0),
                    Number(preferredFrame.x_axis.z || 0)
                )
                : new THREE.Vector3(1, 0, 0);
            if (xAxis.lengthSq() <= 1e-12) {
                xAxis.set(1, 0, 0);
            }
            xAxis.addScaledVector(normal, -xAxis.dot(normal));
            if (xAxis.lengthSq() <= 1e-10) {
                xAxis.set(1, 0, 0);
                if (Math.abs(xAxis.dot(normal)) > 0.95) {
                    xAxis.set(0, 1, 0);
                }
                xAxis.addScaledVector(normal, -xAxis.dot(normal));
            }
            if (xAxis.lengthSq() <= 1e-10) {
                xAxis.set(0, 0, 1).addScaledVector(normal, -normal.z);
            }
            xAxis.normalize();
            return {
                origin: { x: center.x, y: center.y, z: center.z },
                normal: { x: normal.x, y: normal.y, z: normal.z },
                x_axis: { x: xAxis.x, y: xAxis.y, z: xAxis.z }
            };
        },

        applyOffsetToFrame(frame, offset = 0) {
            const off = Number(offset || 0);
            if (!frame || !Number.isFinite(off) || Math.abs(off) < 1e-12) {
                return frame ? JSON.parse(JSON.stringify(frame)) : null;
            }
            const normal = frame.normal || {};
            const nx = Number(normal.x || 0);
            const ny = Number(normal.y || 0);
            const nz = Number(normal.z || 0);
            const nlen = Math.hypot(nx, ny, nz) || 1;
            const ox = Number(frame.origin?.x || 0) + (nx / nlen) * off;
            const oy = Number(frame.origin?.y || 0) + (ny / nlen) * off;
            const oz = Number(frame.origin?.z || 0) + (nz / nlen) * off;
            return {
                origin: { x: ox, y: oy, z: oz },
                normal: {
                    x: nx / nlen,
                    y: ny / nlen,
                    z: nz / nlen
                },
                x_axis: {
                    x: Number(frame.x_axis?.x || 1),
                    y: Number(frame.x_axis?.y || 0),
                    z: Number(frame.x_axis?.z || 0)
                }
            };
        },

        resolveSketchFrameForSource(source, preferredFrame = null) {
            const sourceType = String(source?.type || '');
            if (sourceType !== 'solid-face' && sourceType !== 'face') return null;
            const solidId = String(source?.solid_id || '');
            const preferredSolidId = solidId || null;
            const view = solidId ? this._meshViews.get(solidId) : null;
            const sourceFaceId = Number(source?.face_id);
            const sourceFeatureId = String(source?.solid_feature_id || '');
            const anchor = source?.anchor
                ? new THREE.Vector3(
                    Number(source.anchor.x || 0),
                    Number(source.anchor.y || 0),
                    Number(source.anchor.z || 0)
                )
                : null;
            const anchorNormal = source?.anchor_normal
                ? new THREE.Vector3(
                    Number(source.anchor_normal.x || 0),
                    Number(source.anchor_normal.y || 0),
                    Number(source.anchor_normal.z || 1)
                ).normalize()
                : null;
            let preferredOrigin = null;
            let preferredNormal = null;
            if (preferredFrame?.origin && preferredFrame?.normal) {
                preferredOrigin = new THREE.Vector3(
                    Number(preferredFrame.origin.x || 0),
                    Number(preferredFrame.origin.y || 0),
                    Number(preferredFrame.origin.z || 0)
                );
                preferredNormal = new THREE.Vector3(
                    Number(preferredFrame.normal.x || 0),
                    Number(preferredFrame.normal.y || 0),
                    Number(preferredFrame.normal.z || 1)
                ).normalize();
            }
            let best = null;
            let bestScore = -Infinity;
            const evalView = (sid, meshView, scoreBias = 0) => {
                if (!meshView?.faceGroups?.size) return;
                for (const [faceId, meta] of meshView.faceGroups.entries()) {
                    if (!meta?.planar) continue;
                    const n = meta.normal.clone().normalize();
                    const alignPref = preferredNormal ? n.dot(preferredNormal) : 0;
                    if (preferredNormal && alignPref < 0.95) {
                        continue;
                    }
                    const alignAnchor = anchorNormal ? n.dot(anchorNormal) : 0;
                    if (anchorNormal && alignAnchor < 0.93) {
                        continue;
                    }
                    const distPref = preferredOrigin ? preferredOrigin.distanceTo(meta.center) : 0;
                    const planeDistAnchor = anchor
                        ? Math.abs(n.dot(anchor) - n.dot(meta.center))
                        : 0;
                    const centerDistAnchor = anchor ? anchor.distanceTo(meta.center) : 0;
                    const sameFaceBonus = (sid === preferredSolidId && Number.isFinite(sourceFaceId) && sourceFaceId === faceId)
                        ? 2
                        : 0;
                    const score =
                        (alignPref * 6) +
                        (alignAnchor * 2) -
                        (distPref * 0.03) -
                        (planeDistAnchor * 6) -
                        (centerDistAnchor * 0.003) +
                        scoreBias +
                        sameFaceBonus;
                    if (score > bestScore + 1e-9) {
                        bestScore = score;
                        best = { solidId: sid, faceId, meta, distPref, planeDistAnchor, centerDistAnchor };
                    } else if (Math.abs(score - bestScore) <= 1e-9 && best) {
                        // Deterministic tie-break to avoid jitter.
                        const bestTuple = [best.planeDistAnchor, best.distPref, best.centerDistAnchor, String(best.solidId), Number(best.faceId)];
                        const nextTuple = [planeDistAnchor, distPref, centerDistAnchor, String(sid), Number(faceId)];
                        if (
                            nextTuple[0] < bestTuple[0] - 1e-9 ||
                            (Math.abs(nextTuple[0] - bestTuple[0]) <= 1e-9 && (
                                nextTuple[1] < bestTuple[1] - 1e-9 ||
                                (Math.abs(nextTuple[1] - bestTuple[1]) <= 1e-9 && (
                                    nextTuple[2] < bestTuple[2] - 1e-9 ||
                                    (Math.abs(nextTuple[2] - bestTuple[2]) <= 1e-9 && (
                                        nextTuple[3] < bestTuple[3] ||
                                        (nextTuple[3] === bestTuple[3] && nextTuple[4] < bestTuple[4])
                                    ))
                                ))
                            ))
                        ) {
                            best = { solidId: sid, faceId, meta, distPref, planeDistAnchor, centerDistAnchor };
                        }
                    }
                }
            };
            // Always attempt the referenced solid first for stability.
            if (view) {
                evalView(solidId, view, 0.1);
            }

            // If nothing matched on the referenced solid (or it no longer exists),
            // fall back to same-feature solids, then all solids.
            if (!best) {
                const solidsById = new Map((this.list() || []).map(item => [String(item?.id || ''), item]));
                const candidates = [];
                for (const [sid, meshView] of this._meshViews.entries()) {
                    if (view && sid === solidId) continue;
                    const solid = solidsById.get(String(sid));
                    const sameFeature = sourceFeatureId && String(solid?.source?.feature_id || '') === sourceFeatureId;
                    candidates.push({ sid, meshView, sameFeature });
                }
                if (sourceFeatureId && candidates.some(c => c.sameFeature)) {
                    for (const c of candidates) {
                        if (!c.sameFeature) continue;
                        evalView(c.sid, c.meshView, 0.06);
                    }
                }
                if (!best) {
                    for (const c of candidates) {
                        const bias = preferredSolidId && c.sid === preferredSolidId ? 0.02 : 0;
                        evalView(c.sid, c.meshView, bias);
                    }
                }
            }
            if (!best) return null;
            return {
                solidId: best.solidId,
                faceId: best.faceId,
                frame: this.frameFromFaceMeta(best.meta, preferredFrame)
            };
        },

        refreshSketchFaceAttachments() {
            const api = getApi();
            const features = api.features.list() || [];
            let changed = false;
            for (const feature of features) {
                if (feature?.type !== 'sketch') continue;
                const target = feature?.target || {};
                let source = target?.source || null;
                let resolved = null;

                // Preferred path: if target.id already references an existing face key,
                // resolve directly from current runtime face data.
                if (target?.kind === 'face' && typeof target?.id === 'string') {
                    const m = target.id.match(/^(.*):f(\d+)$/);
                    if (m) {
                        const directKey = `${String(m[1] || '')}:${Number(m[2])}`;
                        const directTarget = this.getSketchTargetForFaceKey(directKey);
                        if (directTarget?.frame) {
                            resolved = {
                                solidId: String(m[1] || ''),
                                faceId: Number(m[2]),
                                frame: directTarget.frame
                            };
                            source = {
                                ...(source || {}),
                                ...(directTarget.source || {}),
                                type: 'solid-face',
                                solid_id: String(m[1] || ''),
                                face_id: Number(m[2])
                            };
                        }
                    }
                }

                // Backfill missing/incomplete face source metadata from target.id
                // (format: "<solidId>:f<faceId>") so attachments can rebind without
                // requiring manual sketch edit.
                if ((!source || (!source.type && target?.kind === 'face')) && typeof target?.id === 'string') {
                    const m = target.id.match(/^(.*):f(\d+)$/);
                    if (m) {
                        source = {
                            ...(source || {}),
                            type: 'solid-face',
                            solid_id: String(m[1] || ''),
                            face_id: Number(m[2])
                        };
                        api.features.mutateTransient(feature.id, item => {
                            item.target = item.target || {};
                            item.target.source = {
                                ...(item.target.source || {}),
                                type: 'solid-face',
                                solid_id: source.solid_id,
                                face_id: source.face_id
                            };
                        });
                    }
                }
                if (source?.type !== 'solid-face' && source?.type !== 'face') continue;
                if (!resolved) {
                    resolved = this.resolveSketchFrameForSource(source, feature.plane || null);
                }
                if (!resolved?.frame) continue;
                const frame = this.applyOffsetToFrame(resolved.frame, Number(feature?.target?.offset || 0));
                const prev = feature.plane || {};
                const nextSolidId = String(resolved.solidId || source?.solid_id || '');
                const same =
                    Math.abs((prev.origin?.x || 0) - frame.origin.x) < 1e-6 &&
                    Math.abs((prev.origin?.y || 0) - frame.origin.y) < 1e-6 &&
                    Math.abs((prev.origin?.z || 0) - frame.origin.z) < 1e-6 &&
                    Math.abs((prev.normal?.x || 0) - frame.normal.x) < 1e-6 &&
                    Math.abs((prev.normal?.y || 0) - frame.normal.y) < 1e-6 &&
                    Math.abs((prev.normal?.z || 0) - frame.normal.z) < 1e-6 &&
                    Math.abs((prev.x_axis?.x || 0) - frame.x_axis.x) < 1e-6 &&
                    Math.abs((prev.x_axis?.y || 0) - frame.x_axis.y) < 1e-6 &&
                    Math.abs((prev.x_axis?.z || 0) - frame.x_axis.z) < 1e-6 &&
                    Number(source?.face_id) === Number(resolved.faceId) &&
                    String(source?.solid_id || '') === nextSolidId &&
                    source?.type === 'solid-face';
                if (same) continue;
                api.features.mutateTransient(feature.id, item => {
                    item.plane = frame;
                    item.target = item.target || {};
                    item.target.source = item.target.source || {};
                    item.target.source.type = 'solid-face';
                    item.target.source.solid_id = nextSolidId;
                    item.target.source.face_id = resolved.faceId;
                    if (!item.target.source.solid_feature_id) {
                        const solid = this.list().find(s => s?.id === nextSolidId);
                        item.target.source.solid_feature_id = solid?.source?.feature_id || null;
                    }
                    item.target.source.dep_sig = this.getSolidDependencySignature(nextSolidId);
                    item.target.source.anchor = {
                        x: Number(resolved.frame.origin.x || 0),
                        y: Number(resolved.frame.origin.y || 0),
                        z: Number(resolved.frame.origin.z || 0)
                    };
                    item.target.source.anchor_normal = {
                        x: Number(resolved.frame.normal.x || 0),
                        y: Number(resolved.frame.normal.y || 0),
                        z: Number(resolved.frame.normal.z || 1)
                    };
                    item.target.id = `${nextSolidId}:f${resolved.faceId}`;
                    item.target.kind = 'face';
                    item.target.name = 'Face';
                });
                changed = true;
            }
            return changed;
        },

        syncFaceOverlays() {
            for (const view of this._meshViews.values()) {
                for (const [faceId, overlay] of view.faceOverlays?.entries?.() || []) {
                    const key = `${view.mesh?.userData?.solidId}:${faceId}`;
                    const selected = this._selectedFaceKeys.has(key);
                    const hovered = this._hoveredFaceKey === key;
                    overlay.visible = selected || hovered;
                    overlay.material = selected ? this._faceMats.selected : this._faceMats.hover;
                }
            }
        },

        syncEdgeOverlays() {
            const { renderer } = space.internals();
            const rw = Math.max(1, Number(renderer?.domElement?.clientWidth || renderer?.domElement?.width || window.innerWidth || 1));
            const rh = Math.max(1, Number(renderer?.domElement?.clientHeight || renderer?.domElement?.height || window.innerHeight || 1));
            const frozenActive = !!this._frozenChamferEdges;
            this._root?.updateMatrixWorld?.(true);
            if (this._frozenEdgeOverlays) {
                while (this._frozenEdgeOverlays.children.length) {
                    const child = this._frozenEdgeOverlays.children[0];
                    child.geometry?.dispose?.();
                    child.material?.dispose?.();
                    this._frozenEdgeOverlays.remove(child);
                }
            }
            for (const [solidId, view] of this._meshViews.entries()) {
                if (!view?.edgeOverlays) continue;
                while (view.edgeOverlays.children.length) {
                    const child = view.edgeOverlays.children[0];
                    child.geometry?.dispose?.();
                    child.material?.dispose?.();
                    view.edgeOverlays.remove(child);
                }
                if (frozenActive) {
                    continue;
                }
                view.group?.updateMatrixWorld?.(true);
                const wanted = [];
                for (const key of this._selectedEdgeKeys) {
                    const edge = this.getEdgeByKey(key);
                    if (edge?.solidId === solidId) wanted.push({ key, selected: true });
                }
                if (this._hoveredEdgeKey && !this._selectedEdgeKeys.has(this._hoveredEdgeKey)) {
                    const edge = this.getEdgeByKey(this._hoveredEdgeKey);
                    if (edge?.solidId === solidId) wanted.push({ key: this._hoveredEdgeKey, selected: false });
                }
                for (const item of wanted) {
                    const edge = this.getEdgeByKey(item.key);
                    const path = Array.isArray(edge?.pathWorld) && edge.pathWorld.length >= 2
                        ? edge.pathWorld.map(p => view.group.worldToLocal(p.clone()))
                        : (edge?.aWorld && edge?.bWorld)
                            ? [view.group.worldToLocal(edge.aWorld.clone()), view.group.worldToLocal(edge.bWorld.clone())]
                            : null;
                    if (!path || path.length < 2) continue;
                    const geo = new LineGeometry();
                    const positions = [];
                    for (const p of path) {
                        positions.push(Number(p.x || 0), Number(p.y || 0), Number(p.z || 0));
                    }
                    geo.setPositions(positions);
                    const mat = new LineMaterial({
                        color: item.selected ? 0xff9933 : 0xffb366,
                        linewidth: item.selected
                            ? Number(this._renderPrefs?.edgeSelectedLineWidth || 3.25)
                            : Number(this._renderPrefs?.edgeHoverLineWidth || 2.5),
                        transparent: true,
                        opacity: item.selected ? 0.95 : 0.85,
                        depthTest: false,
                        depthWrite: false,
                        dashed: false
                    });
                    mat.resolution.set(rw, rh);
                    const line = new Line2(geo, mat);
                    line.frustumCulled = false;
                    line.renderOrder = 80;
                    view.edgeOverlays.add(line);
                }
            }
            if (!frozenActive) return;
            if (!this._frozenEdgeOverlays && this._root) {
                this._frozenEdgeOverlays = new THREE.Group();
                this._frozenEdgeOverlays.name = 'void-solids-frozen-edge-overlays';
                this._root.add(this._frozenEdgeOverlays);
            }
            if (!this._frozenEdgeOverlays || !this._root) return;
            this._frozenEdgeOverlays.updateMatrixWorld?.(true);
            const wanted = [];
            for (const key of this._selectedEdgeKeys) {
                if (this.getEdgeByKey(key)) wanted.push({ key, selected: true });
            }
            if (this._hoveredEdgeKey && !this._selectedEdgeKeys.has(this._hoveredEdgeKey)) {
                if (this.getEdgeByKey(this._hoveredEdgeKey)) wanted.push({ key: this._hoveredEdgeKey, selected: false });
            }
            for (const item of wanted) {
                const edge = this.getEdgeByKey(item.key);
                const pathWorld = Array.isArray(edge?.pathWorld) && edge.pathWorld.length >= 2
                    ? edge.pathWorld
                    : (edge?.aWorld && edge?.bWorld)
                        ? [edge.aWorld, edge.bWorld]
                        : null;
                if (!pathWorld || pathWorld.length < 2) continue;
                const geo = new LineGeometry();
                const positions = [];
                for (const p of pathWorld) {
                    const local = this._root.worldToLocal(p.clone ? p.clone() : new THREE.Vector3(Number(p.x || 0), Number(p.y || 0), Number(p.z || 0)));
                    positions.push(Number(local.x || 0), Number(local.y || 0), Number(local.z || 0));
                }
                geo.setPositions(positions);
                const mat = new LineMaterial({
                    color: item.selected ? 0xff9933 : 0xffb366,
                    linewidth: item.selected
                        ? Number(this._renderPrefs?.edgeSelectedLineWidth || 3.25)
                        : Number(this._renderPrefs?.edgeHoverLineWidth || 2.5),
                    transparent: true,
                    opacity: item.selected ? 0.95 : 0.85,
                    depthTest: false,
                    depthWrite: false,
                    dashed: false
                });
                mat.resolution.set(rw, rh);
                const line = new Line2(geo, mat);
                line.frustumCulled = false;
                line.renderOrder = 80;
                this._frozenEdgeOverlays.add(line);
            }
        },

        scheduleRebuild(reason = 'schedule', delay = 25) {
            this._pendingReason = reason;
            clearTimeout(this._rebuildTimer);
            this._rebuildTimer = setTimeout(() => {
                this.rebuild(this._pendingReason || 'schedule');
                this._pendingReason = null;
            }, delay);
        },

        async rebuild(reason = 'manual', options = {}) {
            const api = getApi();
            const persist = options?.persist !== false;
            if (this._rebuilding) {
                this._pendingReason = reason;
                return this.list();
            }
            this._rebuilding = true;
            const seq = ++this._rebuildSeq;
            try {
                let result = null;
                let passReason = reason;
                for (let pass = 0; pass < 3; pass++) {
                    api.sketchRuntime?.sync?.();
                    const snapshot = buildRebuildSnapshot(api);
                    const forceMainThread = String(passReason || '').startsWith('feature.edit.exit');
                    if (forceMainThread) {
                        result = await rebuildGeneratedSolids(api, { reason: passReason, persist: false });
                    } else {
                        try {
                            const workerReply = await this.requestWorkerRebuild(snapshot, passReason);
                            result = {
                                solids: workerReply?.solids || [],
                                meshCache: meshCacheFromWorkerPayload(workerReply?.meshes || [])
                            };
                        } catch (error) {
                            console.warn('void.solids: worker rebuild failed, using main-thread fallback', error);
                            result = await rebuildGeneratedSolids(api, { reason: passReason, persist: false });
                        }
                    }
                    if (seq !== this._rebuildSeq) {
                        return this.list();
                    }
                    api.document.current.generated = api.document.current.generated || {};
                    api.document.current.generated.solids = result?.solids || [];
                    if (persist) {
                        await api.document.save({
                            kind: 'micro',
                            opType: 'solid.rebuild',
                            undoable: false,
                            clearRedo: false,
                            payload: {
                                reason: passReason || 'rebuild',
                                solids: api.document.current.generated.solids.length
                            }
                        });
                    }
                    this._meshCache = result?.meshCache || new Map();
                    this.syncRuntime();
                    let derivedChanged = false;
                    for (const feature of (api.features.list() || [])) {
                        if (feature?.type !== 'sketch') continue;
                        if (api.interact?.refreshDerivedSketchGeometry?.(feature)) {
                            derivedChanged = true;
                        }
                    }
                    const rebound = this.refreshSketchFaceAttachments();
                    if (rebound || derivedChanged) {
                        if (persist) {
                            await api.document.save({
                                kind: 'micro',
                                opType: 'feature.auto.refresh',
                                undoable: false,
                                clearRedo: false,
                                payload: {
                                    rebound: !!rebound,
                                    derived: !!derivedChanged
                                }
                            });
                        }
                    }
                    if (rebound && pass < 2) {
                        api.sketchRuntime?.sync?.();
                        passReason = 'sketch.face.rebind';
                        continue;
                    }
                    if (derivedChanged && pass < 2) {
                        api.sketchRuntime?.sync?.();
                        passReason = 'sketch.derived.refresh';
                        continue;
                    }
                    if (rebound || derivedChanged) {
                        api.sketchRuntime?.sync?.();
                    }
                    break;
                }
                return result?.solids || this.list();
            } finally {
                this._rebuilding = false;
                if (this._pendingReason) {
                    const next = this._pendingReason;
                    this._pendingReason = null;
                    this.scheduleRebuild(next, 10);
                }
            }
        },

        async rebuildDownstreamFrom(featureId, reason = 'feature.edit.exit') {
            const api = getApi();
            const doc = api.document.current;
            const features = api.features.list() || [];
            const idx = features.findIndex(feature => feature?.id === featureId);
            if (!doc || idx < 0) {
                return this.rebuild(reason);
            }
            doc.timeline = doc.timeline || { index: null };
            const originalTimeline = doc.timeline.index ?? null;
            try {
                const max = features.length;
                for (let count = idx + 1; count <= max; count++) {
                    doc.timeline.index = count >= max ? null : (count - 1);
                    await this.rebuild(`${reason}.step.${count}`, { persist: false });
                }
            } finally {
                doc.timeline.index = originalTimeline;
            }
            return this.rebuild(`${reason}.final`);
        }
    };
}

export { createSolidsApi };
