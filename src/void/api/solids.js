/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE, BufferGeometryUtils } from '../../ext/three.js';
import { ensureKernel } from '../solid/kernel.js';
import { rebuildGeneratedSolids } from '../solid/rebuild.js';

const SOLID_CREASE_ANGLE_DEG = 30;

function createSolidsApi(getApi) {
    function profileLoopsFromRuntime(api, profileTarget) {
        const sketchId = profileTarget?.sketchId || null;
        const profileId = profileTarget?.profileId || null;
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
                const sketchId = profileTarget?.sketchId || null;
                const profileId = profileTarget?.profileId || null;
                if (!sketchId || !profileId) continue;
                const loops = profileLoopsFromRuntime(api, profileTarget);
                if (!loops?.length) continue;
                profileLoops[`${sketchId}:${profileId}`] = loops;
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
                boundarySegmentsLocal: null
            });
            groupId++;
        }
        return { triToGroup, groups };
    }

    function buildBoundarySegmentsFromGeometry(geometry) {
        if (!geometry) return [];
        const edgesGeom = new THREE.EdgesGeometry(geometry, 1);
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
        _faceMats: null,
        _worker: null,
        _workerReady: false,
        _workerReqId: 0,
        _workerPending: new Map(),
        _rebuildSeq: 0,

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
            world?.add?.(this._root);
        },

        list() {
            const api = getApi();
            return Array.isArray(api.document.current?.generated?.solids)
                ? api.document.current.generated.solids
                : [];
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
                    const group = new THREE.Group();
                    group.name = `solid-${id}`;
                    group.add(mesh);
                    group.add(edges);
                    group.add(overlays);
                    this._root.add(group);
                    view = { group, mesh, edges, overlays, faceOverlays: new Map(), faceTriToGroup: new Int32Array(0), faceGroups: new Map(), indexedGeometry: built.indexed };
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
                    const built = buildSolidGeometry(meshData);
                    view.mesh.geometry = built.render;
                    view.indexedGeometry = built.indexed;
                    view.edges.geometry = new THREE.EdgesGeometry(built.render, SOLID_CREASE_ANGLE_DEG);
                }
                const faceData = buildSurfaceRegionData(view.indexedGeometry || view.mesh.geometry);
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
            this.syncFaceOverlays();
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
                const segIndex = Number(hit?.index);
                if (!solidId || !Number.isFinite(segIndex)) continue;
                const seg = this.getEdgeSegmentWorld(object, segIndex);
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
                let bestFace = null;
                let bestFaceScore = Infinity;
                for (let i = 0; i < segs.length; i++) {
                    const seg = segs[i];
                    if (!seg?.a || !seg?.b) continue;
                    const score = scoreSegment(seg.a, seg.b);
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
            const exactMeta = Number.isFinite(sourceFaceId) ? view?.faceGroups?.get?.(sourceFaceId) : null;
            if (exactMeta?.planar) {
                return {
                    solidId,
                    faceId: sourceFaceId,
                    frame: this.frameFromFaceMeta(exactMeta, preferredFrame)
                };
            }
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
            if (view) {
                // Keep attachment stable: when the referenced solid still exists,
                // only search faces on that solid.
                evalView(solidId, view, 0.1);
            } else {
                // Fallback only when referenced solid no longer exists.
                const solidsById = new Map((this.list() || []).map(item => [String(item?.id || ''), item]));
                const candidates = [];
                for (const [sid, meshView] of this._meshViews.entries()) {
                    const solid = solidsById.get(String(sid));
                    const sameFeature = sourceFeatureId && String(solid?.source?.feature_id || '') === sourceFeatureId;
                    candidates.push({ sid, meshView, sameFeature });
                }
                if (sourceFeatureId && candidates.some(c => c.sameFeature)) {
                    for (const c of candidates) {
                        if (!c.sameFeature) continue;
                        evalView(c.sid, c.meshView, 0.06);
                    }
                } else {
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
                const source = feature?.target?.source || null;
                if (source?.type !== 'solid-face' && source?.type !== 'face') continue;
                const sourceSolidId = String(source?.solid_id || '');
                const currentDepSig = sourceSolidId ? this.getSolidDependencySignature(sourceSolidId) : null;
                if (sourceSolidId && currentDepSig && source?.dep_sig && source.dep_sig === currentDepSig) {
                    continue;
                }
                const resolved = this.resolveSketchFrameForSource(source, feature.plane || null);
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

        scheduleRebuild(reason = 'schedule', delay = 25) {
            this._pendingReason = reason;
            clearTimeout(this._rebuildTimer);
            this._rebuildTimer = setTimeout(() => {
                this.rebuild(this._pendingReason || 'schedule');
                this._pendingReason = null;
            }, delay);
        },

        async rebuild(reason = 'manual') {
            const api = getApi();
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
                    if (seq !== this._rebuildSeq) {
                        return this.list();
                    }
                    api.document.current.generated = api.document.current.generated || {};
                    api.document.current.generated.solids = result?.solids || [];
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
        }
    };
}

export { createSolidsApi };
