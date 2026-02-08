/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { Plane } from '../plane.js';
import * as markerOps from './sketch_runtime_markers.js';
import * as profileOps from './sketch_runtime_profiles.js';
import * as arcOps from './sketch_runtime_arc.js';
import * as uiOps from './sketch_runtime_ui.js';
import { isCircleCurve, isThreePointCircle } from './sketch_curve.js';

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
const CONSTRAINT_GLYPH_SIZE_PX = 18;
const CONSTRAINT_GLYPH_GAP_PX = 4;

function createSketchRuntimeApi(getApi) {
    return {
        root: null,
        sketches: new Map(), // id -> record
        hoveredId: null,
        editingId: null,
        selectedIds: new Set(),
        mutatingIds: new Set(),
        _glyphLayer: null,
        _glyphDrag: null,

        init(world) {
            if (this.root) return;
            this.root = new THREE.Group();
            this.root.name = 'sketch-runtime';
            world.add(this.root);
            this._tmpPointWorld = new THREE.Vector3();
            this.ensureConstraintGlyphLayer();
            const viewCtrl = space.view?.ctrl;
            if (viewCtrl && viewCtrl.addEventListener) {
                viewCtrl.addEventListener('change', () => {
                    this.updatePointScreenScales();
                    this.updateConstraintGlyphs();
                });
            }
            window.addEventListener('resize', () => {
                this.updatePointScreenScales();
                this.updateConstraintGlyphs();
            });
            window.addEventListener('mousemove', event => {
                if (this._glyphDrag) {
                    this.updateConstraintDrag(event, false);
                }
            });
            window.addEventListener('mouseup', event => {
                if (this._glyphDrag) {
                    this.updateConstraintDrag(event, true);
                }
            });
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
            this.updateConstraintGlyphs();
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
            const previewArc = new THREE.Line(
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
            previewArc.visible = false;
            previewArc.renderOrder = 9;
            entitiesGroup.add(previewArc);
            const previewStart = this.createSketchPointMarker(0, 0, { virtualOrigin: true });
            previewStart.visible = false;
            previewStart.renderOrder = 11;
            entitiesGroup.add(previewStart);
            const previewEnd = this.createSketchPointMarker(0, 0, { virtualOrigin: true });
            previewEnd.visible = false;
            previewEnd.renderOrder = 11;
            entitiesGroup.add(previewEnd);
            const previewArcCenter = this.createArcCenterMarker(0, 0);
            previewArcCenter.visible = false;
            previewArcCenter.renderOrder = 11;
            entitiesGroup.add(previewArcCenter);
            const previewRect = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Vector3(0, 0, 0),
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
            previewRect.visible = false;
            previewRect.renderOrder = 9;
            entitiesGroup.add(previewRect);

            group.add(planeGroup);
            group.add(entitiesGroup);

            return {
                feature,
                group,
                plane,
                entitiesGroup,
                previewLine,
                previewArc,
                previewStart,
                previewEnd,
                previewArcCenter,
                previewRect,
                entityViews: new Map(),
                interaction: {
                    hoveredId: null,
                    selectedIds: new Set(),
                    hoveredConstraintId: null,
                    selectedConstraintIds: new Set(),
                    previewLine: null,
                    previewArc: null,
                    previewRect: null,
                    previewStart: null,
                    previewEnd: null
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

        ensureConstraintGlyphLayer() {
            if (this._glyphLayer?.isConnected) {
                return this._glyphLayer;
            }
            const { container } = space.internals();
            if (!container) {
                return null;
            }
            const layer = document.createElement('div');
            layer.className = 'sketch-constraint-layer';
            container.appendChild(layer);
            this._glyphLayer = layer;
            return layer;
        },

        clearConstraintGlyphs() {
            if (this._glyphLayer) {
                this._glyphLayer.innerHTML = '';
            }
        },

        constraintGlyphLabel(type) {
            return uiOps.constraintGlyphLabel(type);
        },

        makePointRing(radius, color, opacity = 1) {
            return markerOps.makePointRing(radius, color, opacity);
        },

        createSketchPointMarker(x = 0, y = 0, opts = {}) {
            return markerOps.createSketchPointMarker(x, y, opts, SKETCH_COLORS);
        },

        createArcCenterMarker(x = 0, y = 0) {
            return markerOps.createArcCenterMarker(x, y, SKETCH_COLORS);
        },

        rebuildEntities(rec) {
            while (rec.entitiesGroup.children.length) {
                const child = rec.entitiesGroup.children[0];
                if (child === rec.previewLine || child === rec.previewArc || child === rec.previewRect || child === rec.previewStart || child === rec.previewEnd || child === rec.previewArcCenter) {
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
            this.tagPointMarker(originPoint, SKETCH_VIRTUAL_ORIGIN_ID);
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
            // Circle endpoint points are implementation details; hide their markers.
            const hiddenPointIds = new Set();
            for (const entity of entities) {
                if (entity?.type !== 'arc' || !isCircleCurve(entity)) continue;
                if (typeof entity.a === 'string') hiddenPointIds.add(entity.a);
                if (typeof entity.b === 'string') hiddenPointIds.add(entity.b);
            }
            if (!this.mutatingIds.has(rec.feature?.id)) {
                this.addClosedProfileFills(rec, entities, pointById);
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
                if (entity.type === 'arc' && entity.a && entity.b) {
                    const [a, b] = this.getArcEndpoints(entity, pointById);
                    if (!a || !b) continue;
                    const points = this.getArcRenderPoints(entity, a, b, 48);
                    if (points.length < 2) continue;
                    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, 0)));
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
                    const arc = new THREE.Line(geometry, material);
                    if (arc.computeLineDistances && entity.construction) {
                        arc.computeLineDistances();
                    }
                    arc.renderOrder = 7;
                    arc.userData.sketchEntityId = entity.id;
                    arc.userData.sketchEntityType = 'arc';
                    rec.entitiesGroup.add(arc);
                    rec.entityViews.set(entity.id, { entity, object: arc, type: 'arc' });

                    const center = this.getArcCenterLocal(entity, a, b);
                    if (center && !isThreePointCircle(entity)) {
                        const centerKey = `arc-center:${entity.id}`;
                        const centerMarker = this.createArcCenterMarker(center.x, center.y);
                        centerMarker.userData.sketchEntityId = centerKey;
                        centerMarker.userData.sketchEntityType = 'arc-center';
                        centerMarker.userData.sketchEntityRefId = entity.id;
                        rec.entitiesGroup.add(centerMarker);
                        rec.entityViews.set(centerKey, { entity, object: centerMarker, type: 'arc-center' });
                    }
                    continue;
                }

                if (entity.type === 'point') {
                    if (hiddenPointIds.has(entity.id)) {
                        continue;
                    }
                    const point = this.createSketchPointMarker(entity.x || 0, entity.y || 0);
                    point.userData.sketchEntityId = entity.id;
                    point.userData.sketchEntityType = 'point';
                    this.tagPointMarker(point, entity.id);
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
            if (rec.previewArc && rec.previewArc.parent !== rec.entitiesGroup) {
                rec.entitiesGroup.add(rec.previewArc);
            } else if (rec.previewArc) {
                rec.entitiesGroup.remove(rec.previewArc);
                rec.entitiesGroup.add(rec.previewArc);
            }
            if (rec.previewEnd && rec.previewEnd.parent !== rec.entitiesGroup) {
                rec.entitiesGroup.add(rec.previewEnd);
            } else if (rec.previewEnd) {
                rec.entitiesGroup.remove(rec.previewEnd);
                rec.entitiesGroup.add(rec.previewEnd);
            }
            if (rec.previewArcCenter && rec.previewArcCenter.parent !== rec.entitiesGroup) {
                rec.entitiesGroup.add(rec.previewArcCenter);
            } else if (rec.previewArcCenter) {
                rec.entitiesGroup.remove(rec.previewArcCenter);
                rec.entitiesGroup.add(rec.previewArcCenter);
            }
            if (rec.previewRect && rec.previewRect.parent !== rec.entitiesGroup) {
                rec.entitiesGroup.add(rec.previewRect);
            } else if (rec.previewRect) {
                rec.entitiesGroup.remove(rec.previewRect);
                rec.entitiesGroup.add(rec.previewRect);
            }
        },

        addClosedProfileFills(rec, entities, pointById) {
            return profileOps.addClosedProfileFills.call(this, rec, entities, pointById);
        },

        simplifyLoopsWithClipper(loops) {
            return profileOps.simplifyLoopsWithClipper.call(this, loops);
        },

        findClosedCurveLoops(feature, entities, pointById) {
            return profileOps.findClosedCurveLoops.call(this, feature, entities, pointById);
        },

        segmentIntersectionParams(a, b, c, d, eps = 1e-9) {
            return profileOps.segmentIntersectionParams.call(this, a, b, c, d, eps);
        },

        findClosedLineLoops(feature, entities, pointById) {
            return profileOps.findClosedLineLoops.call(this, feature, entities, pointById);
        },

        applySketchState(rec) {
            return uiOps.applySketchState.call(this, rec, getApi, SKETCH_COLORS);
        },

        applyPlaneStyle(plane, mode) {
            return uiOps.applyPlaneStyle.call(this, plane, mode, SKETCH_COLORS);
        },

        applyEntityStyle(rec, mode) {
            return uiOps.applyEntityStyle.call(this, rec, mode, SKETCH_COLORS);
        },

        getConstraintHoverHighlight(rec) {
            return uiOps.getConstraintHoverHighlight.call(this, rec);
        },

        applyPreviewLine(rec, mode, editing) {
            return uiOps.applyPreviewLine.call(this, rec, mode, editing, SKETCH_COLORS);
        },

        applyPreviewStart(rec, mode, editing) {
            return uiOps.applyPreviewStart.call(this, rec, mode, editing, SKETCH_COLORS);
        },

        applyPreviewEnd(rec, mode, editing) {
            return uiOps.applyPreviewEnd.call(this, rec, mode, editing, SKETCH_COLORS);
        },

        applyPreviewArc(rec, mode, editing) {
            return uiOps.applyPreviewArc.call(this, rec, mode, editing, SKETCH_COLORS);
        },

        applyPreviewRect(rec, mode, editing) {
            return uiOps.applyPreviewRect.call(this, rec, mode, editing, SKETCH_COLORS);
        },

        applyLabelState(rec, mode, showPlane) {
            return uiOps.applyLabelState.call(this, rec, mode, showPlane, getApi, SKETCH_COLORS);
        },

        removeLabel(rec) {
            return uiOps.removeLabel.call(this, rec, getApi);
        },

        getPlaneLabelPosition(plane) {
            return uiOps.getPlaneLabelPosition.call(this, plane);
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

        setMutating(featureId, active = false) {
            if (!featureId) return;
            if (active) {
                this.mutatingIds.add(featureId);
            } else {
                this.mutatingIds.delete(featureId);
            }
            this.sync();
        },

        setEntityInteraction(featureId, interaction = {}) {
            const rec = this.getRecord(featureId);
            if (!rec) return;
            rec.interaction.hoveredId = interaction.hoveredId || null;
            rec.interaction.selectedIds = new Set(interaction.selectedIds || []);
            rec.interaction.hoveredConstraintId = interaction.hoveredConstraintId || null;
            rec.interaction.selectedConstraintIds = new Set(interaction.selectedConstraintIds || []);
            rec.interaction.previewLine = interaction.previewLine || null;
            rec.interaction.previewArc = interaction.previewArc || null;
            rec.interaction.previewRect = interaction.previewRect || null;
            rec.interaction.previewStart = interaction.previewStart || null;
            rec.interaction.previewEnd = interaction.previewEnd || null;
            this.applySketchState(rec);
            this.updateConstraintGlyphs();
        },

        clearEntityInteraction(featureId) {
            const rec = this.getRecord(featureId);
            if (!rec) return;
            rec.interaction.hoveredId = null;
            rec.interaction.selectedIds = new Set();
            rec.interaction.hoveredConstraintId = null;
            rec.interaction.selectedConstraintIds = new Set();
            rec.interaction.previewLine = null;
            rec.interaction.previewArc = null;
            rec.interaction.previewRect = null;
            rec.interaction.previewStart = null;
            rec.interaction.previewEnd = null;
            this.applySketchState(rec);
            this.updateConstraintGlyphs();
        },

        getLineEndpoints(line, pointById) {
            return arcOps.getLineEndpoints(line, pointById);
        },

        getArcEndpoints(arc, pointById) {
            return arcOps.getArcEndpoints(arc, pointById);
        },

        getArcRenderPoints(arc, a, b, segments = 32) {
            return arcOps.getArcRenderPoints(arc, a, b, segments);
        },

        getArcCenterLocal(arc, a, b) {
            return arcOps.getArcCenterLocal(arc, a, b);
        },

        computeArcFromThreePoints(start, end, onArc) {
            return arcOps.computeArcFromThreePoints(start, end, onArc);
        },

        updatePointScreenScales() {
            return uiOps.updatePointScreenScales.call(this, {
                pointScreenRadiusPx: SKETCH_POINT_SCREEN_RADIUS_PX,
                pointBaseRadius: SKETCH_POINT_BASE_RADIUS
            });
        },

        getConstraintAnchorLocal(feature, constraint) {
            return uiOps.getConstraintAnchorLocal.call(this, feature, constraint);
        },

        projectConstraintAnchor(rec, local) {
            return uiOps.projectConstraintAnchor.call(this, rec, local, getApi);
        },

        tagPointMarker(marker, id) {
            return uiOps.tagPointMarker(marker, id);
        },

        applyConstraintOffset(constraint, screenPos, slotIndex = 0, slotCount = 1) {
            return uiOps.applyConstraintOffset(constraint, screenPos, slotIndex, slotCount, {
                glyphSizePx: CONSTRAINT_GLYPH_SIZE_PX,
                glyphGapPx: CONSTRAINT_GLYPH_GAP_PX
            });
        },

        updateConstraintGlyphs() {
            return uiOps.updateConstraintGlyphs.call(this, getApi, {
                glyphSizePx: CONSTRAINT_GLYPH_SIZE_PX,
                glyphGapPx: CONSTRAINT_GLYPH_GAP_PX
            });
        },

        updateConstraintDrag(event, done = false) {
            return uiOps.updateConstraintDrag.call(this, event, done, getApi);
        },

        refreshStates() {
            for (const rec of this.sketches.values()) {
                this.applySketchState(rec);
            }
            this.updateConstraintGlyphs();
        }
    };
}

export { createSketchRuntimeApi };
