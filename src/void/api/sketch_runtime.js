/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { Plane } from '../plane.js';

const SKETCH_COLORS = {
    planeDefault: { fill: 0x5a9fd4, fillOpacity: 0.1, outline: 0x5a9fd4, outlineOpacity: 0.65 },
    planeHover: { fill: 0xff9933, fillOpacity: 0.14, outline: 0xff9933, outlineOpacity: 0.95 },
    planeEdit: { fill: 0x9ec7ff, fillOpacity: 0.08, outline: 0x5a9fd4, outlineOpacity: 0.9 },
    linesGray: 0x8f8f8f,
    linesHover: 0xff9933,
    linesEdit: 0xffffff,
    linesSelected: 0x9ec7ff,
    pointsGray: 0x8f8f8f,
    pointsHover: 0xff9933,
    pointsEdit: 0xffffff,
    pointsSelected: 0x9ec7ff,
    labelDefault: '#8f8f8f',
    labelHover: '#ff9933',
    labelEdit: '#a7cbff'
};
const SKETCH_PLANE_SCALE = 0.86;
const SKETCH_PLANE_MIN_SIZE = 24;
const SKETCH_POINT_SCREEN_RADIUS_PX = 6;
const SKETCH_POINT_BASE_RADIUS = 1.8;
const SKETCH_VIRTUAL_ORIGIN_ID = '__sketch-origin__';

function createSketchRuntimeApi(getApi) {
    return {
        root: null,
        sketches: new Map(), // id -> record
        hoveredId: null,
        editingId: null,
        selectedIds: new Set(),

        init(world) {
            if (this.root) return;
            this.root = new THREE.Group();
            this.root.name = 'sketch-runtime';
            world.add(this.root);
            this._tmpPointWorld = new THREE.Vector3();
            const viewCtrl = space.view?.ctrl;
            if (viewCtrl && viewCtrl.addEventListener) {
                viewCtrl.addEventListener('change', () => this.updatePointScreenScales());
            }
            window.addEventListener('resize', () => this.updatePointScreenScales());
        },

        sync() {
            const api = getApi();
            const features = api.features.list().filter(f => f?.type === 'sketch');
            const present = new Set(features.map(f => f.id));

            for (const [id, rec] of this.sketches.entries()) {
                if (!present.has(id)) {
                    this.removeLabel(rec);
                    this.root?.remove(rec.group);
                    rec.plane?.dispose?.();
                    this.sketches.delete(id);
                }
            }

            for (const feature of features) {
                let rec = this.sketches.get(feature.id);
                if (!rec) {
                    rec = this.createSketchRecord(feature);
                    this.sketches.set(feature.id, rec);
                    this.root?.add(rec.group);
                } else {
                    rec.feature = feature;
                }
                this.updateSketchRecord(rec);
            }
            this.updatePointScreenScales();
        },

        getRecord(featureId) {
            return this.sketches.get(featureId) || null;
        },

        getEditingRecord() {
            return this.getRecord(this.editingId);
        },

        createSketchRecord(feature) {
            const group = new THREE.Group();
            group.name = `sketch-${feature.id}`;
            const plane = new Plane({
                id: `sketch-plane-${feature.id}`,
                name: feature.name || 'Sketch Plane',
                size: 160,
                showHandles: false,
                color: SKETCH_COLORS.planeDefault.fill,
                outlineColor: SKETCH_COLORS.planeDefault.outline,
                opacity: SKETCH_COLORS.planeDefault.fillOpacity,
                outlineOpacity: SKETCH_COLORS.planeDefault.outlineOpacity
            });
            const planeGroup = plane.getGroup();
            planeGroup.visible = false;

            const entitiesGroup = new THREE.Group();
            entitiesGroup.name = `sketch-entities-${feature.id}`;
            const previewLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 0)
                ]),
                new THREE.LineBasicMaterial({
                    color: SKETCH_COLORS.linesHover,
                    transparent: true,
                    opacity: 0.9,
                    depthWrite: false
                })
            );
            previewLine.visible = false;
            previewLine.renderOrder = 9;
            entitiesGroup.add(previewLine);
            const previewStart = this.createSketchPointMarker(0, 0, { virtualOrigin: true });
            previewStart.visible = false;
            previewStart.renderOrder = 11;
            entitiesGroup.add(previewStart);

            group.add(planeGroup);
            group.add(entitiesGroup);

            return {
                feature,
                group,
                plane,
                entitiesGroup,
                previewLine,
                previewStart,
                entityViews: new Map(),
                interaction: {
                    hoveredId: null,
                    selectedIds: new Set(),
                    previewLine: null,
                    previewStart: null
                },
                labelId: `sketch-label-${feature.id}`
            };
        },

        updateSketchRecord(rec) {
            const feature = rec.feature;
            if (feature?.plane) {
                rec.plane.setFrame(this.toDisplayPlaneFrame(feature.plane));
                const pg = rec.plane.getGroup();
                rec.entitiesGroup.position.copy(pg.position);
                rec.entitiesGroup.quaternion.copy(pg.quaternion);
                rec.entitiesGroup.scale.copy(pg.scale);
            }
            this.rebuildEntities(rec);
            this.applySketchState(rec);
        },

        toDisplayPlaneFrame(frame) {
            if (!frame || typeof frame !== 'object') {
                return frame;
            }
            const out = JSON.parse(JSON.stringify(frame));
            const width = Number(out?.size?.width);
            const height = Number(out?.size?.height);
            if (Number.isFinite(width) && Number.isFinite(height)) {
                out.size.width = Math.max(SKETCH_PLANE_MIN_SIZE, width * SKETCH_PLANE_SCALE);
                out.size.height = Math.max(SKETCH_PLANE_MIN_SIZE, height * SKETCH_PLANE_SCALE);
            }
            return out;
        },

        makePointRing(radius, color, opacity = 1) {
            const seg = 24;
            const verts = [];
            for (let i = 0; i <= seg; i++) {
                const t = (i / seg) * Math.PI * 2;
                verts.push(Math.cos(t) * radius, Math.sin(t) * radius, 0.01);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
            const mat = new THREE.LineBasicMaterial({
                color,
                transparent: opacity < 1,
                opacity,
                depthWrite: false
            });
            const ring = new THREE.Line(geo, mat);
            return ring;
        },

        createSketchPointMarker(x = 0, y = 0, opts = {}) {
            const marker = new THREE.Group();
            marker.position.set(x, y, 0);
            marker.renderOrder = 8;

            const core = new THREE.Mesh(
                new THREE.CircleGeometry(0.72, 20),
                new THREE.MeshBasicMaterial({
                    color: 0x8f8f8f,
                    transparent: false,
                    depthWrite: false,
                    side: THREE.DoubleSide
                })
            );
            core.renderOrder = 8;
            marker.add(core);

            const ringBlack = this.makePointRing(0.94, 0x101010, 0.95);
            ringBlack.renderOrder = 9;
            marker.add(ringBlack);

            const ringWhite = this.makePointRing(1.18, 0xffffff, 0.95);
            ringWhite.renderOrder = 10;
            marker.add(ringWhite);

            const ringHighlight = this.makePointRing(1.45, SKETCH_COLORS.pointsHover, 0.95);
            ringHighlight.renderOrder = 11;
            ringHighlight.visible = false;
            marker.add(ringHighlight);

            marker.userData._markerParts = {
                core,
                ringBlack,
                ringWhite,
                ringHighlight
            };
            marker.userData._isVirtualOrigin = !!opts.virtualOrigin;

            return marker;
        },

        rebuildEntities(rec) {
            while (rec.entitiesGroup.children.length) {
                const child = rec.entitiesGroup.children[0];
                if (child === rec.previewLine || child === rec.previewStart) {
                    rec.entitiesGroup.remove(child);
                    continue;
                }
                child.traverse?.(obj => {
                    obj.geometry?.dispose?.();
                    if (Array.isArray(obj.material)) {
                        for (const mat of obj.material) mat?.dispose?.();
                    } else {
                        obj.material?.dispose?.();
                    }
                });
                rec.entitiesGroup.remove(child);
            }
            rec.entityViews.clear();

            // Sketch-local origin point, always available for snapping/line anchoring.
            const originPoint = this.createSketchPointMarker(0, 0, { virtualOrigin: true });
            originPoint.userData.sketchEntityId = SKETCH_VIRTUAL_ORIGIN_ID;
            originPoint.userData.sketchEntityType = 'point';
            rec.entitiesGroup.add(originPoint);
            rec.entityViews.set(SKETCH_VIRTUAL_ORIGIN_ID, {
                entity: { id: SKETCH_VIRTUAL_ORIGIN_ID, type: 'point', x: 0, y: 0, virtual: true },
                object: originPoint,
                type: 'point',
                virtual: true
            });

            const entities = Array.isArray(rec.feature?.entities) ? rec.feature.entities : [];
            const pointById = new Map();
            for (const entity of entities) {
                if (entity?.type === 'point' && entity.id) {
                    pointById.set(entity.id, entity);
                }
            }
            for (const entity of entities) {
                if (!entity?.id) {
                    continue;
                }
                if (entity.type === 'line' && entity.a && entity.b) {
                    const [a, b] = this.getLineEndpoints(entity, pointById);
                    if (!a || !b) continue;
                    const geometry = new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(a.x || 0, a.y || 0, 0),
                        new THREE.Vector3(b.x || 0, b.y || 0, 0)
                    ]);
                    const material = entity.construction
                        ? new THREE.LineDashedMaterial({
                            color: SKETCH_COLORS.linesGray,
                            transparent: true,
                            opacity: 1,
                            dashSize: 3,
                            gapSize: 2,
                            depthWrite: false
                        })
                        : new THREE.LineBasicMaterial({
                            color: SKETCH_COLORS.linesGray,
                            transparent: true,
                            opacity: 1,
                            depthWrite: false
                        });
                    const line = new THREE.Line(geometry, material);
                    if (line.computeLineDistances && entity.construction) {
                        line.computeLineDistances();
                    }
                    line.renderOrder = 7;
                    line.userData.sketchEntityId = entity.id;
                    line.userData.sketchEntityType = 'line';
                    rec.entitiesGroup.add(line);
                    rec.entityViews.set(entity.id, { entity, object: line, type: 'line' });
                    continue;
                }

                if (entity.type === 'point') {
                    const point = this.createSketchPointMarker(entity.x || 0, entity.y || 0);
                    point.userData.sketchEntityId = entity.id;
                    point.userData.sketchEntityType = 'point';
                    rec.entitiesGroup.add(point);
                    rec.entityViews.set(entity.id, { entity, object: point, type: 'point' });
                }
            }
            if (rec.previewLine && rec.previewLine.parent !== rec.entitiesGroup) {
                rec.entitiesGroup.add(rec.previewLine);
            } else if (rec.previewLine) {
                rec.entitiesGroup.remove(rec.previewLine);
                rec.entitiesGroup.add(rec.previewLine);
            }
            if (rec.previewStart && rec.previewStart.parent !== rec.entitiesGroup) {
                rec.entitiesGroup.add(rec.previewStart);
            } else if (rec.previewStart) {
                rec.entitiesGroup.remove(rec.previewStart);
                rec.entitiesGroup.add(rec.previewStart);
            }
        },

        applySketchState(rec) {
            const feature = rec.feature || {};
            const visible = feature.visible !== false;
            const hovered = this.hoveredId === feature.id;
            const editing = this.editingId === feature.id;
            const selected = this.selectedIds.has(feature.id);

            const showPlane = editing || hovered || selected;
            const showEntities = visible || hovered || editing || selected;

            rec.plane.setVisible(showPlane);
            rec.entitiesGroup.visible = showEntities;

            const mode = editing ? 'edit' : (hovered || selected ? 'hover' : 'default');
            this.applyPlaneStyle(rec.plane, mode);
            this.applyEntityStyle(rec, mode);
            this.applyPreviewLine(rec, mode, editing);
            this.applyPreviewStart(rec, mode, editing);
            this.applyLabelState(rec, mode, showPlane);
        },

        applyPlaneStyle(plane, mode) {
            const style = mode === 'edit'
                ? SKETCH_COLORS.planeEdit
                : mode === 'hover'
                    ? SKETCH_COLORS.planeHover
                    : SKETCH_COLORS.planeDefault;
            plane.setColor(style.fill);
            plane.setOpacity(style.fillOpacity);
            plane.setOutlineColor(style.outline);
            plane.setOutlineOpacity(style.outlineOpacity);
        },

        applyEntityStyle(rec, mode) {
            const baseLineColor = mode === 'edit'
                ? SKETCH_COLORS.linesEdit
                : mode === 'hover'
                    ? SKETCH_COLORS.linesHover
                    : SKETCH_COLORS.linesGray;
            const basePointColor = SKETCH_COLORS.pointsGray;

            const hoveredId = rec.interaction?.hoveredId || null;
            const selectedIds = rec.interaction?.selectedIds || new Set();

            for (const [id, view] of rec.entityViews.entries()) {
                const selected = mode === 'edit' && selectedIds.has(id);
                const hovered = mode === 'edit' && hoveredId === id && !selected;

                if (view.type === 'line') {
                    const color = selected
                        ? SKETCH_COLORS.linesHover
                        : hovered
                            ? SKETCH_COLORS.linesHover
                            : baseLineColor;
                    view.object.material.color.setHex(color);
                    continue;
                }

                if (view.type === 'point') {
                    const parts = view.object.userData?._markerParts || {};
                    const active = selected || hovered;
                    if (parts.core?.material?.color) {
                        parts.core.material.color.setHex(active ? SKETCH_COLORS.pointsHover : basePointColor);
                    }
                    if (parts.ringHighlight) {
                        parts.ringHighlight.visible = !!active;
                        if (parts.ringHighlight.material?.color) {
                            parts.ringHighlight.material.color.setHex(SKETCH_COLORS.pointsHover);
                        }
                    }
                    if (parts.ringWhite?.material?.color) {
                        parts.ringWhite.material.color.setHex(active ? 0xffffff : 0xffffff);
                    }
                    if (parts.ringBlack?.material?.color) {
                        parts.ringBlack.material.color.setHex(0x101010);
                    }
                }
            }
        },

        applyPreviewLine(rec, mode, editing) {
            if (!rec.previewLine) return;
            const preview = rec.interaction?.previewLine;
            if (!editing || !preview?.a || !preview?.b) {
                rec.previewLine.visible = false;
                return;
            }
            const a = new THREE.Vector3(preview.a.x || 0, preview.a.y || 0, 0);
            const b = new THREE.Vector3(preview.b.x || 0, preview.b.y || 0, 0);
            rec.previewLine.geometry.dispose();
            rec.previewLine.geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
            rec.previewLine.material.color.setHex(mode === 'edit' ? SKETCH_COLORS.linesEdit : SKETCH_COLORS.linesHover);
            rec.previewLine.visible = true;
        },

        applyPreviewStart(rec, mode, editing) {
            if (!rec.previewStart) return;
            const start = rec.interaction?.previewStart;
            if (!editing || !start) {
                rec.previewStart.visible = false;
                return;
            }
            rec.previewStart.position.set(start.x || 0, start.y || 0, 0);
            const parts = rec.previewStart.userData?._markerParts || {};
            if (parts.core?.material?.color) {
                parts.core.material.color.setHex(SKETCH_COLORS.pointsGray);
            }
            if (parts.ringHighlight) {
                parts.ringHighlight.visible = true;
                if (parts.ringHighlight.material?.color) {
                    parts.ringHighlight.material.color.setHex(SKETCH_COLORS.pointsHover);
                }
            }
            rec.previewStart.visible = true;
        },

        applyLabelState(rec, mode, showPlane) {
            const api = getApi();
            const overlay = api.overlay;
            if (!overlay) return;

            if (!showPlane) {
                this.removeLabel(rec);
                return;
            }

            const text = rec.feature?.name || 'Sketch';
            const color = mode === 'edit'
                ? SKETCH_COLORS.labelEdit
                : mode === 'hover'
                    ? SKETCH_COLORS.labelHover
                    : SKETCH_COLORS.labelDefault;
            const pos3d = this.getPlaneLabelPosition(rec.plane);
            const id = rec.labelId;

            if (overlay.elements.has(id)) {
                overlay.update(id, { pos3d, text, color });
            } else {
                overlay.add(id, 'text', {
                    pos3d,
                    text,
                    color,
                    fontSize: 13,
                    anchor: 'start',
                    className: 'sketch-label'
                });
            }
        },

        removeLabel(rec) {
            const api = getApi();
            api.overlay?.remove(rec?.labelId);
        },

        getPlaneLabelPosition(plane) {
            return plane.getTopLeftCorner();
        },

        setHovered(featureId) {
            this.hoveredId = featureId || null;
            this.refreshStates();
        },

        setEditing(featureId) {
            this.editingId = featureId || null;
            this.refreshStates();
        },

        setSelected(featureIds) {
            this.selectedIds = new Set(featureIds || []);
            this.refreshStates();
        },

        setEntityInteraction(featureId, interaction = {}) {
            const rec = this.getRecord(featureId);
            if (!rec) return;
            rec.interaction.hoveredId = interaction.hoveredId || null;
            rec.interaction.selectedIds = new Set(interaction.selectedIds || []);
            rec.interaction.previewLine = interaction.previewLine || null;
            rec.interaction.previewStart = interaction.previewStart || null;
            this.applySketchState(rec);
        },

        clearEntityInteraction(featureId) {
            const rec = this.getRecord(featureId);
            if (!rec) return;
            rec.interaction.hoveredId = null;
            rec.interaction.selectedIds = new Set();
            rec.interaction.previewLine = null;
            rec.interaction.previewStart = null;
            this.applySketchState(rec);
        },

        getLineEndpoints(line, pointById) {
            let a = null;
            let b = null;
            if (typeof line?.a === 'string') {
                a = pointById?.get(line.a) || null;
            } else if (line?.a && typeof line.a === 'object') {
                a = line.a;
            }
            if (typeof line?.b === 'string') {
                b = pointById?.get(line.b) || null;
            } else if (line?.b && typeof line.b === 'object') {
                b = line.b;
            }
            return [a, b];
        },

        updatePointScreenScales() {
            const { camera, renderer } = space.internals();
            if (!camera || !renderer) return;
            const viewHeightPx = renderer.domElement?.clientHeight || renderer.domElement?.height;
            if (!viewHeightPx) return;
            const tmp = this._tmpPointWorld || new THREE.Vector3();

            for (const rec of this.sketches.values()) {
                for (const view of rec.entityViews.values()) {
                    if (view.type !== 'point' || !view.object) continue;
                    view.object.getWorldPosition(tmp);
                    let worldPerPixel;
                    if (camera.isPerspectiveCamera) {
                        const distance = camera.position.distanceTo(tmp);
                        const fovRad = camera.fov * Math.PI / 180;
                        worldPerPixel = (2 * Math.tan(fovRad / 2) * distance) / viewHeightPx;
                    } else if (camera.isOrthographicCamera) {
                        worldPerPixel = ((camera.top - camera.bottom) / camera.zoom) / viewHeightPx;
                    } else {
                        continue;
                    }
                    const desiredWorldRadius = SKETCH_POINT_SCREEN_RADIUS_PX * worldPerPixel;
                    const scale = Math.max(0.0001, desiredWorldRadius / SKETCH_POINT_BASE_RADIUS);
                    view.object.scale.setScalar(scale);
                }
                if (rec.previewStart) {
                    rec.previewStart.getWorldPosition(tmp);
                    let worldPerPixel;
                    if (camera.isPerspectiveCamera) {
                        const distance = camera.position.distanceTo(tmp);
                        const fovRad = camera.fov * Math.PI / 180;
                        worldPerPixel = (2 * Math.tan(fovRad / 2) * distance) / viewHeightPx;
                    } else if (camera.isOrthographicCamera) {
                        worldPerPixel = ((camera.top - camera.bottom) / camera.zoom) / viewHeightPx;
                    } else {
                        continue;
                    }
                    const desiredWorldRadius = SKETCH_POINT_SCREEN_RADIUS_PX * worldPerPixel;
                    const scale = Math.max(0.0001, desiredWorldRadius / SKETCH_POINT_BASE_RADIUS);
                    rec.previewStart.scale.setScalar(scale);
                }
            }
        },

        refreshStates() {
            for (const rec of this.sketches.values()) {
                this.applySketchState(rec);
            }
        }
    };
}

export { createSketchRuntimeApi };
