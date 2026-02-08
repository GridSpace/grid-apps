/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { ensureKernel } from '../solid/kernel.js';
import { rebuildGeneratedSolids } from '../solid/rebuild.js';

function createSolidsApi(getApi) {
    return {
        _rebuildTimer: null,
        _rebuilding: false,
        _pendingReason: null,
        _meshCache: new Map(),
        _meshViews: new Map(),
        _selectedIds: new Set(),
        _root: null,
        _material: null,
        _edgeMaterial: null,

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

        syncRuntime() {
            if (!this._root) return;
            const solids = this.list();
            const byId = new Set(solids.map(s => s?.id).filter(Boolean));

            for (const [id, view] of this._meshViews.entries()) {
                if (byId.has(id)) continue;
                this._root.remove(view.group);
                view.mesh.geometry?.dispose?.();
                view.mesh.material?.dispose?.();
                view.edges.geometry?.dispose?.();
                view.edges.material?.dispose?.();
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
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
                    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
                    geometry.computeVertexNormals();
                    const mesh = new THREE.Mesh(geometry, this._material.clone());
                    mesh.userData.solidId = id;
                    mesh.userData.solid = true;
                    const edgesGeom = new THREE.EdgesGeometry(geometry, 30);
                    const edges = new THREE.LineSegments(edgesGeom, this._edgeMaterial.clone());
                    edges.userData.solidId = id;
                    const group = new THREE.Group();
                    group.name = `solid-${id}`;
                    group.add(mesh);
                    group.add(edges);
                    this._root.add(group);
                    view = { group, mesh, edges, hash: '' };
                    this._meshViews.set(id, view);
                } else {
                    const hash = `${meshData.positions.length}:${meshData.indices.length}`;
                    if (view.hash !== hash) {
                        view.mesh.geometry?.dispose?.();
                        view.edges.geometry?.dispose?.();
                        const geometry = new THREE.BufferGeometry();
                        geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.positions, 3));
                        geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
                        geometry.computeVertexNormals();
                        view.mesh.geometry = geometry;
                        view.edges.geometry = new THREE.EdgesGeometry(geometry, 30);
                        view.hash = hash;
                    }
                }
                const selected = this._selectedIds.has(id);
                if (view.mesh.material?.color) {
                    view.mesh.material.color.setHex(selected ? 0xa0b7d1 : 0x8d939a);
                }
                if (view.edges.material?.opacity !== undefined) {
                    view.edges.material.opacity = selected ? 0.9 : 0.22;
                }
                view.group.visible = visible;
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
