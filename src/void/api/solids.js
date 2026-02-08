/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE, BufferGeometryUtils } from '../../ext/three.js';
import { ensureKernel } from '../solid/kernel.js';
import { rebuildGeneratedSolids } from '../solid/rebuild.js';

function createSolidsApi(getApi) {
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
        const triNeighbors = Array.from({ length: triCount }, () => new Set());
        const triToGroup = new Int32Array(triCount).fill(-1);
        const edgeMap = new Map();
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

            const edges = [[i0, i1], [i1, i2], [i2, i0]];
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

        // Region join threshold for smooth surfaces. Sharp edges (near 90 deg) split regions.
        const smoothJoinDot = Math.cos(40 * Math.PI / 180);
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

            // A region is planar when all member vertices lie on one plane and normals are near-identical.
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
                planar
            });
            groupId++;
        }

        return { triToGroup, groups };
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
                    const edgesGeom = new THREE.EdgesGeometry(built.render, 30);
                    const edges = new THREE.LineSegments(edgesGeom, this._edgeMaterial.clone());
                    edges.userData.solidId = id;
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
                    view.edges.geometry = new THREE.EdgesGeometry(built.render, 30);
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

        getFaceHitFromIntersections(intersections = []) {
            if (!Array.isArray(intersections)) return null;
            for (const hit of intersections) {
                const object = hit?.object;
                const solidId = object?.userData?.solidId;
                const tri = hit?.faceIndex;
                if (!solidId || tri === undefined || tri === null) continue;
                const view = this._meshViews.get(solidId);
                if (!view) continue;
                const groupId = view.faceTriToGroup?.[tri];
                if (groupId === undefined) {
                    console.log('void.solid.face.map.miss', {
                        solidId,
                        tri,
                        triMapLen: view.faceTriToGroup?.length || 0
                    });
                }
                if (groupId === undefined || groupId < 0) continue;
                const key = `${solidId}:${groupId}`;
                return { key, solidId, groupId, intersection: hit };
            }
            if (intersections.length) {
                console.log('void.solid.face.hover.none', {
                    hitCount: intersections.length,
                    sample: intersections.slice(0, 3).map(hit => ({
                        solidId: hit?.object?.userData?.solidId || null,
                        faceIndex: hit?.faceIndex ?? null,
                        object: hit?.object?.name || hit?.object?.type || null
                    }))
                });
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
            console.log('void.solid.face.toggle', {
                key,
                multi,
                selected: Array.from(this._selectedFaceKeys)
            });
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
            const { meta, view, solidId, faceId } = face;
            if (!meta.planar) return null;
            const center = meta.center.clone().applyMatrix4(view.mesh.matrixWorld);
            const normal = meta.normal.clone().transformDirection(view.mesh.matrixWorld).normalize();
            const xAxis = meta.xAxis.clone().transformDirection(view.mesh.matrixWorld).normalize();
            return {
                kind: 'face',
                id: `${solidId}:f${faceId}`,
                name: 'Face',
                frame: {
                    origin: { x: center.x, y: center.y, z: center.z },
                    normal: { x: normal.x, y: normal.y, z: normal.z },
                    x_axis: { x: xAxis.x, y: xAxis.y, z: xAxis.z }
                },
                source: {
                    type: 'solid-face',
                    solid_id: solidId,
                    face_id: faceId
                }
            };
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
            try {
                const result = await rebuildGeneratedSolids(api, { reason });
                this._meshCache = result?.meshCache || new Map();
                this.syncRuntime();
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
