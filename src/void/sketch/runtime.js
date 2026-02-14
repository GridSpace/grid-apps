/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE, Line2, LineGeometry, LineMaterial, LineSegments2, LineSegmentsGeometry } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { Plane } from '../plane.js';
import { VOID_PALETTE } from '../palette.js';
import * as markerOps from './runtime_markers.js';
import * as profileOps from './runtime_profiles.js';
import * as arcOps from './runtime_arc.js';
import * as uiOps from './runtime_ui.js';
import { isCircleCurve, isThreePointCircle } from './curve.js';

const SKETCH_COLORS = VOID_PALETTE.sketch;
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
        forcedVisibleIds: new Set(),
        mutatingIds: new Set(),
        hoveredProfileKey: null,
        selectedProfileKeys: new Set(),
        _glyphLayer: null,
        _glyphDrag: null,
        _glyphClick: null,
        _cameraSyncQueued: false,
        _viewCtrlBound: null,
        _viewCtrlChangeHandler: null,
        _renderPrefs: {
            arcSegmentLength: 2.5
        },

        init(world) {
            if (this.root) return;
            this.root = new THREE.Group();
            this.root.name = 'sketch-runtime';
            world.add(this.root);
            this._tmpPointWorld = new THREE.Vector3();
            this.ensureConstraintGlyphLayer();
            const queueGlyphSync = () => {
                if (this._cameraSyncQueued) return;
                this._cameraSyncQueued = true;
                self.requestAnimationFrame(() => {
                    this._cameraSyncQueued = false;
                    if (!this.sketches?.size) return;
                    this.updatePointScreenScales();
                    this.updateConstraintGlyphs();
                });
            };
            this._viewCtrlChangeHandler = queueGlyphSync;
            this.bindViewControl();
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
            this.bindViewControl();
            const api = getApi();
            const features = api.features.listBuilt().filter(f => f?.type === 'sketch');
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

        syncFeature(featureId) {
            if (!featureId) return this.sync();
            this.bindViewControl();
            const api = getApi();
            const feature = api.features.findById(featureId);
            if (!feature || feature.type !== 'sketch') {
                return this.sync();
            }
            let rec = this.sketches.get(feature.id);
            if (!rec) {
                rec = this.createSketchRecord(feature);
                this.sketches.set(feature.id, rec);
                this.root?.add(rec.group);
            } else {
                rec.feature = feature;
            }
            this.updateSketchRecord(rec);
            this.updatePointScreenScales();
            this.updateConstraintGlyphs();
        },

        bindViewControl() {
            const next = space.view?.ctrl || null;
            if (next === this._viewCtrlBound) {
                return;
            }
            if (this._viewCtrlBound?.removeEventListener && this._viewCtrlChangeHandler) {
                this._viewCtrlBound.removeEventListener('change', this._viewCtrlChangeHandler);
            }
            this._viewCtrlBound = next;
            if (this._viewCtrlBound?.addEventListener && this._viewCtrlChangeHandler) {
                this._viewCtrlBound.addEventListener('change', this._viewCtrlChangeHandler);
            }
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
            const dimensionGroup = new THREE.Group();
            dimensionGroup.name = `sketch-dimensions-${feature.id}`;
            const previewLine = this.createFatLine([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0)
            ], SKETCH_COLORS.linesHover, SKETCH_COLORS.lineWidths.hover);
            previewLine.visible = false;
            previewLine.renderOrder = 9;
            entitiesGroup.add(previewLine);
            const previewArc = this.createFatLine([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0)
            ], SKETCH_COLORS.linesHover, SKETCH_COLORS.lineWidths.hover);
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
            const previewRect = this.createFatLine([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0)
            ], SKETCH_COLORS.linesHover, SKETCH_COLORS.lineWidths.hover);
            previewRect.visible = false;
            previewRect.renderOrder = 9;
            entitiesGroup.add(previewRect);
            const previewFaceSegments = this.createFatSegments([], SKETCH_COLORS.linesProjectedFace, SKETCH_COLORS.lineWidths.hover);
            previewFaceSegments.visible = false;
            previewFaceSegments.renderOrder = 55;
            entitiesGroup.add(previewFaceSegments);
            const previewExternalWorldLine = this.createFatLine([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 0, 0)
            ], SKETCH_COLORS.linesDerivedActual, SKETCH_COLORS.lineWidths.hover);
            previewExternalWorldLine.visible = false;
            previewExternalWorldLine.renderOrder = 60;
            group.add(previewExternalWorldLine);
            const previewExternalWorldSegments = this.createFatSegments([], SKETCH_COLORS.linesDerivedActual, SKETCH_COLORS.lineWidths.hover);
            previewExternalWorldSegments.visible = false;
            previewExternalWorldSegments.renderOrder = 60;
            group.add(previewExternalWorldSegments);
            const previewExternalWorldPoint = this.createArcCenterMarker(0, 0);
            previewExternalWorldPoint.visible = false;
            previewExternalWorldPoint.renderOrder = 60;
            group.add(previewExternalWorldPoint);

            group.add(planeGroup);
            group.add(entitiesGroup);
            group.add(dimensionGroup);

            return {
                feature,
                group,
                plane,
                entitiesGroup,
                dimensionGroup,
                previewLine,
                previewArc,
                previewStart,
                previewEnd,
                previewArcCenter,
                previewRect,
                previewFaceSegments,
                previewExternalWorldLine,
                previewExternalWorldSegments,
                previewExternalWorldPoint,
                entityViews: new Map(),
                interaction: {
                    hoveredId: null,
                    selectedIds: new Set(),
                    mirrorMode: false,
                    mirrorAxisId: null,
                    circularPatternMode: false,
                    circularPatternCenterRef: null,
                    gridPatternMode: false,
                    gridPatternCenterRef: null,
                    hoveredProfileId: null,
                    selectedProfileIds: new Set(),
                    hoveredConstraintId: null,
                    selectedConstraintIds: new Set(),
                    previewLine: null,
                    previewArc: null,
                    previewRect: null,
                    previewFaceSegments: null,
                    previewExternalWorldLine: null,
                    previewExternalWorldSegments: null,
                    previewExternalWorldPoint: null,
                    previewStart: null,
                    previewEnd: null,
                    previewMid: null
                },
                labelId: `sketch-label-${feature.id}`
            };
        },

        createFatLine(points = [], color = SKETCH_COLORS.linesGray, width = SKETCH_COLORS.lineWidths.default) {
            const geo = new LineGeometry();
            const pos = [];
            for (const p of points) {
                pos.push(p.x || 0, p.y || 0, p.z || 0);
            }
            geo.setPositions(pos);
            const mat = new LineMaterial({
                color,
                linewidth: width,
                transparent: true,
                opacity: 1,
                depthWrite: false,
                alphaToCoverage: false
            });
            const { renderer } = space.internals();
            const w = renderer?.domElement?.clientWidth || renderer?.domElement?.width || 1;
            const h = renderer?.domElement?.clientHeight || renderer?.domElement?.height || 1;
            mat.resolution.set(w, h);
            const line = new Line2(geo, mat);
            line.computeLineDistances?.();
            line.userData = line.userData || {};
            line.userData.isFatLine = true;
            return line;
        },

        createFatSegments(positions = [], color = SKETCH_COLORS.linesGray, width = SKETCH_COLORS.lineWidths.default) {
            const geo = new LineSegmentsGeometry();
            geo.setPositions(positions);
            const mat = new LineMaterial({
                color,
                linewidth: width,
                transparent: true,
                opacity: 1,
                depthWrite: false,
                alphaToCoverage: false
            });
            const { renderer } = space.internals();
            const w = renderer?.domElement?.clientWidth || renderer?.domElement?.width || 1;
            const h = renderer?.domElement?.clientHeight || renderer?.domElement?.height || 1;
            mat.resolution.set(w, h);
            const line = new LineSegments2(geo, mat);
            line.computeLineDistances?.();
            line.userData = line.userData || {};
            line.userData.isFatLine = true;
            return line;
        },

        updateSketchRecord(rec) {
            const feature = rec.feature;
            if (feature?.plane) {
                rec.plane.setFrame(this.toDisplayPlaneFrame(feature.plane));
                const pg = rec.plane.getGroup();
                rec.entitiesGroup.position.copy(pg.position);
                rec.entitiesGroup.quaternion.copy(pg.quaternion);
                rec.entitiesGroup.scale.copy(pg.scale);
                rec.dimensionGroup.position.copy(pg.position);
                rec.dimensionGroup.quaternion.copy(pg.quaternion);
                rec.dimensionGroup.scale.copy(pg.scale);
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

        createSketchPointMarker(x = 0, y = 0, opts = {}) {
            return markerOps.createSketchPointMarker(x, y, opts, SKETCH_COLORS);
        },

        createArcCenterMarker(x = 0, y = 0) {
            return markerOps.createArcCenterMarker(x, y, SKETCH_COLORS);
        },

        rebuildEntities(rec) {
            while (rec.entitiesGroup.children.length) {
                const child = rec.entitiesGroup.children[0];
                if (child === rec.previewLine || child === rec.previewArc || child === rec.previewRect || child === rec.previewFaceSegments || child === rec.previewStart || child === rec.previewEnd || child === rec.previewArcCenter) {
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
                    const line = entity.construction
                        ? new THREE.Line(
                            new THREE.BufferGeometry().setFromPoints([
                                new THREE.Vector3(a.x || 0, a.y || 0, 0),
                                new THREE.Vector3(b.x || 0, b.y || 0, 0)
                            ]),
                            material
                        )
                        : this.createFatLine([
                            new THREE.Vector3(a.x || 0, a.y || 0, 0),
                            new THREE.Vector3(b.x || 0, b.y || 0, 0)
                        ], SKETCH_COLORS.linesGray, SKETCH_COLORS.lineWidths.default);
                    if (entity.construction && line.computeLineDistances) {
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
                    const points = this.getArcRenderPoints(entity, a, b, this.getArcSegmentsFor(entity, a, b, 'entity'));
                    if (points.length < 2) continue;
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
                    const arcPoints = points.map(p => new THREE.Vector3(p.x, p.y, 0));
                    const arc = entity.construction
                        ? new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPoints), material)
                        : this.createFatLine(arcPoints, SKETCH_COLORS.linesGray, SKETCH_COLORS.lineWidths.default);
                    if (entity.construction && arc.computeLineDistances) {
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
                        centerMarker.traverse(obj => {
                            obj.userData = obj.userData || {};
                            obj.userData.sketchEntityId = centerKey;
                            obj.userData.sketchEntityType = 'arc-center';
                            obj.userData.sketchEntityRefId = entity.id;
                        });
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
            if (rec.previewFaceSegments && rec.previewFaceSegments.parent !== rec.entitiesGroup) {
                rec.entitiesGroup.add(rec.previewFaceSegments);
            } else if (rec.previewFaceSegments) {
                rec.entitiesGroup.remove(rec.previewFaceSegments);
                rec.entitiesGroup.add(rec.previewFaceSegments);
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

        applyPreviewFaceSegments(rec, mode, editing) {
            return uiOps.applyPreviewFaceSegments.call(this, rec, mode, editing, SKETCH_COLORS);
        },

        applyPreviewExternalWorld(rec, mode, editing) {
            return uiOps.applyPreviewExternalWorld.call(this, rec, mode, editing, SKETCH_COLORS);
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

        setForcedVisible(featureIds) {
            this.forcedVisibleIds = new Set(featureIds || []);
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
            rec.interaction.mirrorMode = !!interaction.mirrorMode;
            rec.interaction.mirrorAxisId = interaction.mirrorAxisId || null;
            rec.interaction.circularPatternMode = !!interaction.circularPatternMode;
            rec.interaction.circularPatternCenterRef = interaction.circularPatternCenterRef || null;
            rec.interaction.gridPatternMode = !!interaction.gridPatternMode;
            rec.interaction.gridPatternCenterRef = interaction.gridPatternCenterRef || null;
            if (Object.prototype.hasOwnProperty.call(interaction, 'hoveredProfileId')) {
                rec.interaction.hoveredProfileId = interaction.hoveredProfileId || null;
            }
            if (Object.prototype.hasOwnProperty.call(interaction, 'selectedProfileIds')) {
                rec.interaction.selectedProfileIds = new Set(interaction.selectedProfileIds || []);
            }
            rec.interaction.hoveredConstraintId = interaction.hoveredConstraintId || null;
            rec.interaction.selectedConstraintIds = new Set(interaction.selectedConstraintIds || []);
            rec.interaction.previewLine = interaction.previewLine || null;
            rec.interaction.previewArc = interaction.previewArc || null;
            rec.interaction.previewRect = interaction.previewRect || null;
            rec.interaction.previewFaceSegments = interaction.previewFaceSegments || null;
            rec.interaction.previewExternalWorldLine = interaction.previewExternalWorldLine || null;
            rec.interaction.previewExternalWorldSegments = interaction.previewExternalWorldSegments || null;
            rec.interaction.previewExternalWorldPoint = interaction.previewExternalWorldPoint || null;
            rec.interaction.previewStart = interaction.previewStart || null;
            rec.interaction.previewEnd = interaction.previewEnd || null;
            rec.interaction.previewMid = interaction.previewMid || null;
            this.applySketchState(rec);
            if (!this.mutatingIds?.has?.(featureId)) {
                this.updateConstraintGlyphs();
            }
        },

        clearEntityInteraction(featureId) {
            const rec = this.getRecord(featureId);
            if (!rec) return;
            rec.interaction.hoveredId = null;
            rec.interaction.selectedIds = new Set();
            rec.interaction.mirrorMode = false;
            rec.interaction.mirrorAxisId = null;
            rec.interaction.circularPatternMode = false;
            rec.interaction.circularPatternCenterRef = null;
            rec.interaction.gridPatternMode = false;
            rec.interaction.gridPatternCenterRef = null;
            rec.interaction.hoveredProfileId = null;
            rec.interaction.selectedProfileIds = new Set();
            rec.interaction.hoveredConstraintId = null;
            rec.interaction.selectedConstraintIds = new Set();
            rec.interaction.previewLine = null;
            rec.interaction.previewArc = null;
            rec.interaction.previewRect = null;
            rec.interaction.previewFaceSegments = null;
            rec.interaction.previewExternalWorldLine = null;
            rec.interaction.previewExternalWorldSegments = null;
            rec.interaction.previewExternalWorldPoint = null;
            rec.interaction.previewStart = null;
            rec.interaction.previewEnd = null;
            rec.interaction.previewMid = null;
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

        getArcLength(arc, a, b) {
            if (!arc) return 0;
            const cx = Number(arc?.cx);
            const cy = Number(arc?.cy);
            let radius = Number(arc?.radius);
            if (!Number.isFinite(radius) || radius <= 0) {
                if (a && Number.isFinite(cx) && Number.isFinite(cy)) {
                    radius = Math.hypot((a.x || 0) - cx, (a.y || 0) - cy);
                } else {
                    radius = 0;
                }
            }
            if (isCircleCurve(arc)) {
                return radius > 0 ? (Math.PI * 2 * radius) : 0;
            }
            if (!Number.isFinite(radius) || radius <= 0) {
                if (a && b) {
                    return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
                }
                return 0;
            }
            let startAngle = Number(arc?.startAngle);
            let endAngle = Number(arc?.endAngle);
            let ccw = arc?.ccw !== false;
            if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my) && a && b) {
                const geom = this.computeArcFromThreePoints(
                    { x: a.x || 0, y: a.y || 0 },
                    { x: b.x || 0, y: b.y || 0 },
                    { x: arc.mx, y: arc.my }
                );
                if (geom) {
                    startAngle = geom.startAngle;
                    endAngle = geom.endAngle;
                    ccw = geom.ccw;
                }
            }
            if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
                if (a && b) {
                    return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
                }
                return 0;
            }
            const tau = Math.PI * 2;
            let sweep;
            if (ccw) {
                sweep = (endAngle - startAngle) % tau;
                if (sweep < 0) sweep += tau;
            } else {
                sweep = (startAngle - endAngle) % tau;
                if (sweep < 0) sweep += tau;
            }
            return Math.abs(sweep) * radius;
        },

        getArcSegmentsFor(arc, a, b, mode = 'entity') {
            const unit = Math.max(0.05, Number(this._renderPrefs?.arcSegmentLength || 2.5) || 2.5);
            const arcLength = Math.max(0, Number(this.getArcLength(arc, a, b) || 0));
            const base = Math.ceil(arcLength / unit);
            if (mode === 'profile') return Math.max(24, Math.min(768, base));
            if (mode === 'preview') return Math.max(16, Math.min(768, base));
            return Math.max(12, Math.min(768, base));
        },

        setRenderPreferences(next = {}) {
            if (!next || typeof next !== 'object') return;
            if (next.arcSegmentLength !== undefined) {
                const value = Math.max(0.05, Number(next.arcSegmentLength) || 2.5);
                this._renderPrefs.arcSegmentLength = value;
            }
            this.sync();
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
                glyphGapPx: CONSTRAINT_GLYPH_GAP_PX,
                colors: SKETCH_COLORS
            });
        },

        updateConstraintDrag(event, done = false) {
            return uiOps.updateConstraintDrag.call(this, event, done, getApi);
        },

        refreshStates() {
            const profileByFeature = new Map();
            for (const key of this.selectedProfileKeys) {
                const [featureId, profileId] = String(key || '').split(':');
                if (!featureId || !profileId) continue;
                if (!profileByFeature.has(featureId)) profileByFeature.set(featureId, new Set());
                profileByFeature.get(featureId).add(profileId);
            }
            const hovered = this.hoveredProfileKey ? String(this.hoveredProfileKey).split(':') : null;
            for (const rec of this.sketches.values()) {
                const featureId = rec.feature?.id;
                rec.interaction.hoveredProfileId = hovered && hovered[0] === featureId ? hovered[1] : null;
                rec.interaction.selectedProfileIds = profileByFeature.get(featureId) || new Set();
                this.applySketchState(rec);
            }
            this.updateConstraintGlyphs();
        },

        setHoveredProfile(profileKey) {
            this.hoveredProfileKey = profileKey || null;
            this.refreshStates();
        },

        setSelectedProfiles(profileKeys) {
            this.selectedProfileKeys = new Set(profileKeys || []);
            this.refreshStates();
        }
    };
}

export { createSketchRuntimeApi };
