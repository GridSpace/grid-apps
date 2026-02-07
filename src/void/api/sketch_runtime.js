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
const CONSTRAINT_GLYPH_SIZE_PX = 18;
const CONSTRAINT_GLYPH_GAP_PX = 4;
const PROFILE_MERGE_EPS = 1e-3;

function createSketchRuntimeApi(getApi) {
    return {
        root: null,
        sketches: new Map(), // id -> record
        hoveredId: null,
        editingId: null,
        selectedIds: new Set(),
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
            const labels = {
                horizontal: 'H',
                vertical: 'V',
                horizontal_points: 'H',
                vertical_points: 'V',
                perpendicular: 'P',
                collinear: 'L',
                coincident: 'C',
                point_on_line: 'PL',
                point_on_arc: 'PA',
                arc_center_coincident: 'C',
                fixed: 'F',
                tangent: 'T',
                equal: '=',
                midpoint: 'M'
            };
            return labels[type] || '?';
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
            core.userData.sketchPointPick = true;
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

        createArcCenterMarker(x = 0, y = 0) {
            const marker = new THREE.Group();
            marker.position.set(x, y, 0);
            marker.renderOrder = 8;

            const core = new THREE.Mesh(
                new THREE.CircleGeometry(0.58, 20),
                new THREE.MeshBasicMaterial({
                    color: 0x8f8f8f,
                    transparent: true,
                    opacity: 0.95,
                    depthWrite: false,
                    side: THREE.DoubleSide
                })
            );
            core.renderOrder = 8;
            marker.add(core);

            const ring = this.makePointRing(0.9, 0xffffff, 0.9);
            ring.renderOrder = 9;
            marker.add(ring);

            const ringHighlight = this.makePointRing(1.15, SKETCH_COLORS.pointsHover, 0.95);
            ringHighlight.renderOrder = 10;
            ringHighlight.visible = false;
            marker.add(ringHighlight);

            marker.userData._markerParts = {
                core,
                ringWhite: ring,
                ringHighlight
            };
            marker.userData._isArcCenter = true;
            return marker;
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
                if (entity?.type !== 'arc' || !entity?.circle) continue;
                if (typeof entity.a === 'string') hiddenPointIds.add(entity.a);
                if (typeof entity.b === 'string') hiddenPointIds.add(entity.b);
            }
            this.addClosedProfileFills(rec, entities, pointById);
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
                    if (center) {
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
            const loops = this.findClosedCurveLoops(rec.feature, entities, pointById);
            for (const loop of loops) {
                if (!Array.isArray(loop) || loop.length < 3) continue;
                const shape = new THREE.Shape();
                shape.moveTo(loop[0].x, loop[0].y);
                for (let i = 1; i < loop.length; i++) {
                    shape.lineTo(loop[i].x, loop[i].y);
                }
                shape.closePath();
                const geom = new THREE.ShapeGeometry(shape);
                const mat = new THREE.MeshBasicMaterial({
                    color: 0x8f8f8f,
                    transparent: true,
                    opacity: 0.18,
                    depthWrite: false,
                    side: THREE.DoubleSide
                });
                const fill = new THREE.Mesh(geom, mat);
                fill.position.z = -0.005;
                fill.renderOrder = 6;
                rec.entitiesGroup.add(fill);
            }
        },

        findClosedCurveLoops(feature, entities, pointById) {
            const curves = entities.filter(e => (e?.type === 'line' || e?.type === 'arc') && !e.construction);
            if (!curves.length) return [];

            const q = v => Math.round(v / PROFILE_MERGE_EPS) * PROFILE_MERGE_EPS;
            const nodes = new Map(); // key -> { id, x, y }
            const nodeCoord = new Map(); // id -> { x, y }
            const edges = [];
            let nodeSeq = 0;

            const getNodeId = (x, y) => {
                const key = `${q(x)},${q(y)}`;
                let node = nodes.get(key);
                if (!node) {
                    node = { id: `n${++nodeSeq}`, x, y };
                    nodes.set(key, node);
                    nodeCoord.set(node.id, { x, y });
                }
                return node.id;
            };

            for (const curve of curves) {
                let poly = null;
                if (curve.type === 'line') {
                    const [a, b] = this.getLineEndpoints(curve, pointById);
                    if (a && b) {
                        poly = [
                            { x: a.x || 0, y: a.y || 0 },
                            { x: b.x || 0, y: b.y || 0 }
                        ];
                    }
                } else if (curve.type === 'arc') {
                    const [a, b] = this.getArcEndpoints(curve, pointById);
                    if (a && b) {
                        poly = this.getArcRenderPoints(curve, a, b, 64);
                    }
                }
                if (!poly || poly.length < 2) continue;

                for (let i = 0; i < poly.length - 1; i++) {
                    const p1 = poly[i];
                    const p2 = poly[i + 1];
                    const aId = getNodeId(p1.x || 0, p1.y || 0);
                    const bId = getNodeId(p2.x || 0, p2.y || 0);
                    if (!aId || !bId || aId === bId) continue;
                    edges.push({ id: edges.length, a: aId, b: bId });
                }
            }
            if (!edges.length) return [];

            const halfEdges = [];
            const outgoing = new Map();
            const addOutgoing = (nid, heId) => {
                if (!outgoing.has(nid)) outgoing.set(nid, []);
                outgoing.get(nid).push(heId);
            };
            for (const edge of edges) {
                const a = nodeCoord.get(edge.a);
                const b = nodeCoord.get(edge.b);
                if (!a || !b) continue;
                const heAB = {
                    id: halfEdges.length,
                    edgeId: edge.id,
                    from: edge.a,
                    to: edge.b,
                    angle: Math.atan2(b.y - a.y, b.x - a.x),
                    twin: -1
                };
                halfEdges.push(heAB);
                const heBA = {
                    id: halfEdges.length,
                    edgeId: edge.id,
                    from: edge.b,
                    to: edge.a,
                    angle: Math.atan2(a.y - b.y, a.x - b.x),
                    twin: heAB.id
                };
                halfEdges.push(heBA);
                heAB.twin = heBA.id;
                addOutgoing(heAB.from, heAB.id);
                addOutgoing(heBA.from, heBA.id);
            }
            for (const [nid, list] of outgoing.entries()) {
                list.sort((ha, hb) => halfEdges[ha].angle - halfEdges[hb].angle);
                outgoing.set(nid, list);
            }

            const visited = new Set();
            const loops = [];
            const minArea = 1e-5;
            for (const start of halfEdges) {
                if (visited.has(start.id)) continue;
                const cycleHes = [];
                let curr = start;
                let guard = 0;
                while (curr && !visited.has(curr.id) && guard++ < halfEdges.length * 4) {
                    visited.add(curr.id);
                    cycleHes.push(curr.id);
                    const outAtTo = outgoing.get(curr.to) || [];
                    if (!outAtTo.length) break;
                    const twinIndex = outAtTo.indexOf(curr.twin);
                    if (twinIndex < 0) break;
                    const nextIndex = (twinIndex - 1 + outAtTo.length) % outAtTo.length;
                    const nextId = outAtTo[nextIndex];
                    curr = halfEdges[nextId];
                    if (curr.id === start.id) {
                        cycleHes.push(curr.id);
                        break;
                    }
                }
                if (!cycleHes.length) continue;
                if (cycleHes[cycleHes.length - 1] !== start.id) continue;
                const nodeIds = [];
                for (let i = 0; i < cycleHes.length - 1; i++) {
                    nodeIds.push(halfEdges[cycleHes[i]].from);
                }
                if (nodeIds.length < 3) continue;
                const pts = nodeIds.map(nid => nodeCoord.get(nid)).filter(Boolean);
                if (pts.length < 3) continue;
                let area2 = 0;
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    const q2 = pts[(i + 1) % pts.length];
                    area2 += p.x * q2.y - q2.x * p.y;
                }
                const area = area2 * 0.5;
                if (area > minArea) {
                    loops.push(pts.map(p => ({ x: p.x, y: p.y })));
                }
            }
            return loops;
        },

        findClosedLineLoops(feature, entities, pointById) {
            const lines = entities.filter(e => e?.type === 'line' && e.a && e.b && !e.construction);
            if (!lines.length) return [];
            const constraints = Array.isArray(feature?.constraints) ? feature.constraints : [];

            const parent = new Map();
            const find = id => {
                if (!parent.has(id)) parent.set(id, id);
                let p = parent.get(id);
                while (p !== parent.get(p)) {
                    p = parent.get(p);
                }
                let n = id;
                while (parent.get(n) !== p) {
                    const next = parent.get(n);
                    parent.set(n, p);
                    n = next;
                }
                return p;
            };
            const union = (a, b) => {
                const ra = find(a);
                const rb = find(b);
                if (ra !== rb) parent.set(rb, ra);
            };

            for (const [id] of pointById) {
                find(id);
            }
            for (const c of constraints) {
                if (c?.type !== 'coincident') continue;
                const refs = Array.isArray(c.refs) ? c.refs : [];
                if (refs.length >= 2 && pointById.has(refs[0]) && pointById.has(refs[1])) {
                    union(refs[0], refs[1]);
                }
            }

            const byRep = new Map();
            for (const [id, p] of pointById) {
                const rep = find(id);
                if (!byRep.has(rep)) byRep.set(rep, []);
                byRep.get(rep).push(p);
            }

            const nodes = new Map();
            const repToNode = new Map();
            let nodeSeq = 0;
            const q = v => Math.round(v / PROFILE_MERGE_EPS) * PROFILE_MERGE_EPS;
            for (const [rep, pts] of byRep) {
                const avg = pts.reduce((a, p) => ({ x: a.x + (p.x || 0), y: a.y + (p.y || 0) }), { x: 0, y: 0 });
                avg.x /= pts.length;
                avg.y /= pts.length;
                const key = `${q(avg.x)},${q(avg.y)}`;
                let nid = nodes.get(key)?.id;
                if (!nid) {
                    nid = `n${++nodeSeq}`;
                    nodes.set(key, { id: nid, x: avg.x, y: avg.y });
                }
                repToNode.set(rep, nid);
            }

            const nodeCoord = new Map(Array.from(nodes.values()).map(n => [n.id, { x: n.x, y: n.y }]));
            const edges = [];
            for (const line of lines) {
                const ra = find(line.a);
                const rb = find(line.b);
                const na = repToNode.get(ra);
                const nb = repToNode.get(rb);
                if (!na || !nb || na === nb) continue;
                const edgeId = edges.length;
                edges.push({ id: edgeId, a: na, b: nb });
            }
            if (!edges.length) return [];

            // Build directed half-edges and face-walk the planar graph.
            const halfEdges = [];
            const outgoing = new Map();
            const addOutgoing = (nid, heId) => {
                if (!outgoing.has(nid)) outgoing.set(nid, []);
                outgoing.get(nid).push(heId);
            };
            for (const edge of edges) {
                const a = nodeCoord.get(edge.a);
                const b = nodeCoord.get(edge.b);
                if (!a || !b) continue;
                const heAB = {
                    id: halfEdges.length,
                    edgeId: edge.id,
                    from: edge.a,
                    to: edge.b,
                    angle: Math.atan2(b.y - a.y, b.x - a.x),
                    twin: -1
                };
                halfEdges.push(heAB);
                const heBA = {
                    id: halfEdges.length,
                    edgeId: edge.id,
                    from: edge.b,
                    to: edge.a,
                    angle: Math.atan2(a.y - b.y, a.x - b.x),
                    twin: heAB.id
                };
                halfEdges.push(heBA);
                heAB.twin = heBA.id;
                addOutgoing(heAB.from, heAB.id);
                addOutgoing(heBA.from, heBA.id);
            }
            for (const [nid, list] of outgoing.entries()) {
                list.sort((ha, hb) => halfEdges[ha].angle - halfEdges[hb].angle);
                outgoing.set(nid, list);
            }

            const visited = new Set();
            const loops = [];
            const minArea = 1e-5;
            for (const start of halfEdges) {
                if (visited.has(start.id)) continue;
                const cycleHes = [];
                let curr = start;
                let guard = 0;
                while (curr && !visited.has(curr.id) && guard++ < halfEdges.length * 4) {
                    visited.add(curr.id);
                    cycleHes.push(curr.id);
                    const outAtTo = outgoing.get(curr.to) || [];
                    if (!outAtTo.length) break;
                    const twinIndex = outAtTo.indexOf(curr.twin);
                    if (twinIndex < 0) break;
                    // predecessor in CCW sorted list keeps interior face on left.
                    const nextIndex = (twinIndex - 1 + outAtTo.length) % outAtTo.length;
                    const nextId = outAtTo[nextIndex];
                    curr = halfEdges[nextId];
                    if (curr.id === start.id) {
                        cycleHes.push(curr.id);
                        break;
                    }
                }
                if (!cycleHes.length) continue;
                if (cycleHes[cycleHes.length - 1] !== start.id) continue;
                const nodeIds = [];
                for (let i = 0; i < cycleHes.length - 1; i++) {
                    nodeIds.push(halfEdges[cycleHes[i]].from);
                }
                if (nodeIds.length < 3) continue;
                const pts = nodeIds.map(nid => nodeCoord.get(nid)).filter(Boolean);
                if (pts.length < 3) continue;
                let area2 = 0;
                for (let i = 0; i < pts.length; i++) {
                    const p = pts[i];
                    const q2 = pts[(i + 1) % pts.length];
                    area2 += p.x * q2.y - q2.x * p.y;
                }
                const area = area2 * 0.5;
                // Keep only interior faces (CCW), discard outer/inverted traces.
                if (area > minArea) {
                    loops.push(pts.map(p => ({ x: p.x, y: p.y })));
                }
            }
            return loops;
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
            this.applyPreviewArc(rec, mode, editing);
            this.applyPreviewRect(rec, mode, editing);
            this.applyPreviewStart(rec, mode, editing);
            this.applyPreviewEnd(rec, mode, editing);
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
            const constraintHighlight = this.getConstraintHoverHighlight(rec);

            for (const [id, view] of rec.entityViews.entries()) {
                const selected = mode === 'edit' && selectedIds.has(id);
                const constrained = mode === 'edit' && constraintHighlight.has(id) && !selected;
                const hovered = mode === 'edit' && (hoveredId === id || constrained) && !selected;

                if (view.type === 'line' || view.type === 'arc') {
                    const color = selected
                        ? SKETCH_COLORS.linesHover
                        : hovered
                            ? SKETCH_COLORS.linesHover
                            : baseLineColor;
                    view.object.material.color.setHex(color);
                    continue;
                }
                if (view.type === 'arc-center') {
                    const parts = view.object.userData?._markerParts || {};
                    const active = mode === 'edit' && (hoveredId === view.entity?.id || selectedIds.has(view.entity?.id));
                    view.object.visible = true;
                    if (parts.core?.material?.color) {
                        parts.core.material.color.setHex(active ? SKETCH_COLORS.pointsHover : basePointColor);
                    }
                    if (parts.ringHighlight) {
                        parts.ringHighlight.visible = !!active;
                    }
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

        getConstraintHoverHighlight(rec) {
            const out = new Set();
            const hoveredConstraintId = rec?.interaction?.hoveredConstraintId || null;
            if (!hoveredConstraintId) {
                return out;
            }
            const constraints = Array.isArray(rec?.feature?.constraints) ? rec.feature.constraints : [];
            const entities = Array.isArray(rec?.feature?.entities) ? rec.feature.entities : [];
            const byId = new Map(entities.map(e => [e?.id, e]));
            const c = constraints.find(cst => cst?.id === hoveredConstraintId);
            if (!c) return out;
            const refs = Array.isArray(c.refs) ? c.refs : [];
            const pointRefs = [];
            for (const ref of refs) {
                if (!ref) continue;
                out.add(ref);
                const ent = byId.get(ref);
                if (ent?.type === 'point') {
                    pointRefs.push(ref);
                }
            }
            // When point constraints are hovered (especially coincident), also
            // highlight incident curves so users can tell which chain segment is constrained.
            if (pointRefs.length) {
                for (const ent of entities) {
                    if ((ent?.type !== 'line' && ent?.type !== 'arc') || !ent.id) continue;
                    if (pointRefs.includes(ent.a) || pointRefs.includes(ent.b)) {
                        out.add(ent.id);
                    }
                }
            }
            return out;
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

        applyPreviewEnd(rec, mode, editing) {
            if (!rec.previewEnd) return;
            const end = rec.interaction?.previewEnd;
            if (!editing || !end) {
                rec.previewEnd.visible = false;
                return;
            }
            rec.previewEnd.position.set(end.x || 0, end.y || 0, 0);
            const parts = rec.previewEnd.userData?._markerParts || {};
            if (parts.core?.material?.color) {
                parts.core.material.color.setHex(SKETCH_COLORS.pointsGray);
            }
            if (parts.ringHighlight) {
                parts.ringHighlight.visible = true;
                if (parts.ringHighlight.material?.color) {
                    parts.ringHighlight.material.color.setHex(SKETCH_COLORS.pointsHover);
                }
            }
            rec.previewEnd.visible = true;
        },

        applyPreviewArc(rec, mode, editing) {
            if (!rec.previewArc) return;
            const preview = rec.interaction?.previewArc;
            if (!editing || !preview) {
                rec.previewArc.visible = false;
                if (rec.previewArcCenter) {
                    rec.previewArcCenter.visible = false;
                }
                return;
            }
            if (preview.mode === 'chord' && preview.a && preview.b) {
                const a = new THREE.Vector3(preview.a.x || 0, preview.a.y || 0, 0);
                const b = new THREE.Vector3(preview.b.x || 0, preview.b.y || 0, 0);
                rec.previewArc.geometry.dispose();
                rec.previewArc.geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
                rec.previewArc.material.color.setHex(mode === 'edit' ? SKETCH_COLORS.linesEdit : SKETCH_COLORS.linesHover);
                rec.previewArc.visible = true;
                if (rec.previewArcCenter) {
                    rec.previewArcCenter.visible = false;
                }
                return;
            }
            if ((preview.mode === 'arc' || preview.mode === 'circle') && Number.isFinite(preview.cx) && Number.isFinite(preview.cy)) {
                const pts = this.getArcRenderPoints(preview, preview.a, preview.b, 48);
                if (pts.length >= 2) {
                    rec.previewArc.geometry.dispose();
                    rec.previewArc.geometry = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
                    rec.previewArc.material.color.setHex(mode === 'edit' ? SKETCH_COLORS.linesEdit : SKETCH_COLORS.linesHover);
                    rec.previewArc.visible = true;
                    if (rec.previewArcCenter) {
                        rec.previewArcCenter.position.set(preview.cx || 0, preview.cy || 0, 0);
                        const parts = rec.previewArcCenter.userData?._markerParts || {};
                        if (parts.ringHighlight) {
                            parts.ringHighlight.visible = true;
                        }
                        rec.previewArcCenter.visible = true;
                    }
                    return;
                }
            }
            rec.previewArc.visible = false;
            if (rec.previewArcCenter) {
                rec.previewArcCenter.visible = false;
            }
        },

        applyPreviewRect(rec, mode, editing) {
            if (!rec.previewRect) return;
            const preview = rec.interaction?.previewRect;
            const corners = Array.isArray(preview?.corners) ? preview.corners : null;
            if (!editing || !corners || corners.length !== 4) {
                rec.previewRect.visible = false;
                return;
            }
            const pts = [
                new THREE.Vector3(corners[0].x || 0, corners[0].y || 0, 0),
                new THREE.Vector3(corners[1].x || 0, corners[1].y || 0, 0),
                new THREE.Vector3(corners[2].x || 0, corners[2].y || 0, 0),
                new THREE.Vector3(corners[3].x || 0, corners[3].y || 0, 0),
                new THREE.Vector3(corners[0].x || 0, corners[0].y || 0, 0)
            ];
            rec.previewRect.geometry.dispose();
            rec.previewRect.geometry = new THREE.BufferGeometry().setFromPoints(pts);
            rec.previewRect.material.color.setHex(mode === 'edit' ? SKETCH_COLORS.linesEdit : SKETCH_COLORS.linesHover);
            rec.previewRect.visible = true;
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
            const aId = typeof line?.a === 'string' ? line.a : (typeof line?.p1_id === 'string' ? line.p1_id : null);
            const bId = typeof line?.b === 'string' ? line.b : (typeof line?.p2_id === 'string' ? line.p2_id : null);
            let a = null;
            let b = null;
            if (aId) {
                a = pointById?.get(aId) || null;
            } else if (line?.a && typeof line.a === 'object') {
                a = line.a;
            }
            if (bId) {
                b = pointById?.get(bId) || null;
            } else if (line?.b && typeof line.b === 'object') {
                b = line.b;
            }
            return [a, b];
        },

        getArcEndpoints(arc, pointById) {
            const aId = typeof arc?.a === 'string' ? arc.a : null;
            const bId = typeof arc?.b === 'string' ? arc.b : null;
            const a = aId ? (pointById?.get(aId) || null) : null;
            const b = bId ? (pointById?.get(bId) || null) : null;
            return [a, b];
        },

        getArcRenderPoints(arc, a, b, segments = 32) {
            if (arc?.circle) {
                const cx = Number(arc?.cx);
                const cy = Number(arc?.cy);
                let radius = Number(arc?.radius);
                if (!Number.isFinite(radius) || radius <= 0) {
                    if (a) {
                        radius = Math.hypot((a.x || 0) - cx, (a.y || 0) - cy);
                    }
                }
                if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(radius) || radius <= 0) {
                    return [];
                }
                const count = Math.max(32, segments * 2);
                let start = 0;
                if (a) {
                    start = Math.atan2((a.y || 0) - cy, (a.x || 0) - cx);
                }
                const pts = [];
                for (let i = 0; i <= count; i++) {
                    const t = i / count;
                    const ang = start + t * Math.PI * 2;
                    pts.push({
                        x: cx + Math.cos(ang) * radius,
                        y: cy + Math.sin(ang) * radius
                    });
                }
                return pts;
            }
            let cx = Number(arc?.cx);
            let cy = Number(arc?.cy);
            let radius = Number(arc?.radius);
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
                    cx = geom.cx;
                    cy = geom.cy;
                    radius = geom.radius;
                    startAngle = geom.startAngle;
                    endAngle = geom.endAngle;
                    ccw = geom.ccw;
                }
            }
            if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
                return [];
            }
            if (!Number.isFinite(radius) || radius <= 0) {
                if (a) {
                    radius = Math.hypot((a.x || 0) - cx, (a.y || 0) - cy);
                }
            }
            if (!Number.isFinite(radius) || radius <= 0) {
                return [];
            }
            const tau = Math.PI * 2;
            let sweep;
            if (ccw) {
                sweep = (endAngle - startAngle) % tau;
                if (sweep < 0) sweep += tau;
            } else {
                sweep = (startAngle - endAngle) % tau;
                if (sweep < 0) sweep += tau;
                sweep = -sweep;
            }
            const count = Math.max(8, segments);
            const pts = [];
            for (let i = 0; i <= count; i++) {
                const t = i / count;
                const ang = startAngle + sweep * t;
                pts.push({
                    x: cx + Math.cos(ang) * radius,
                    y: cy + Math.sin(ang) * radius
                });
            }
            if (a) pts[0] = { x: a.x || 0, y: a.y || 0 };
            if (b) pts[pts.length - 1] = { x: b.x || 0, y: b.y || 0 };
            return pts;
        },

        getArcCenterLocal(arc, a, b) {
            if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my) && a && b) {
                const geom = this.computeArcFromThreePoints(
                    { x: a.x || 0, y: a.y || 0 },
                    { x: b.x || 0, y: b.y || 0 },
                    { x: arc.mx, y: arc.my }
                );
                if (geom) {
                    return { x: geom.cx, y: geom.cy };
                }
            }
            const cx = Number(arc?.cx);
            const cy = Number(arc?.cy);
            if (Number.isFinite(cx) && Number.isFinite(cy)) {
                return { x: cx, y: cy };
            }
            return null;
        },

        computeArcFromThreePoints(start, end, onArc) {
            const x1 = start.x || 0;
            const y1 = start.y || 0;
            const x2 = end.x || 0;
            const y2 = end.y || 0;
            const x3 = onArc.x || 0;
            const y3 = onArc.y || 0;
            const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
            if (Math.abs(d) < 1e-8) {
                return null;
            }
            const x1sq = x1 * x1 + y1 * y1;
            const x2sq = x2 * x2 + y2 * y2;
            const x3sq = x3 * x3 + y3 * y3;
            const cx = (x1sq * (y2 - y3) + x2sq * (y3 - y1) + x3sq * (y1 - y2)) / d;
            const cy = (x1sq * (x3 - x2) + x2sq * (x1 - x3) + x3sq * (x2 - x1)) / d;
            const radius = Math.hypot(x1 - cx, y1 - cy);
            if (!Number.isFinite(radius) || radius < 1e-6) {
                return null;
            }
            const startAngle = Math.atan2(y1 - cy, x1 - cx);
            const endAngle = Math.atan2(y2 - cy, x2 - cx);
            const midAngle = Math.atan2(y3 - cy, x3 - cx);
            const normalize = a => {
                let out = a % (Math.PI * 2);
                if (out < 0) out += Math.PI * 2;
                return out;
            };
            const sa = normalize(startAngle);
            const ea = normalize(endAngle);
            const ma = normalize(midAngle);
            const ccwSpan = (ea - sa + Math.PI * 2) % (Math.PI * 2);
            const ccwMid = (ma - sa + Math.PI * 2) % (Math.PI * 2);
            const ccw = ccwMid <= ccwSpan;
            return { cx, cy, radius, startAngle, endAngle, ccw };
        },

        updatePointScreenScales() {
            const { camera, renderer } = space.internals();
            if (!camera || !renderer) return;
            const viewHeightPx = renderer.domElement?.clientHeight || renderer.domElement?.height;
            if (!viewHeightPx) return;
            const tmp = this._tmpPointWorld || new THREE.Vector3();

            for (const rec of this.sketches.values()) {
                for (const view of rec.entityViews.values()) {
                    if ((view.type !== 'point' && view.type !== 'arc-center') || !view.object) continue;
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
                if (rec.previewEnd) {
                    rec.previewEnd.getWorldPosition(tmp);
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
                    rec.previewEnd.scale.setScalar(scale);
                }
                if (rec.previewArcCenter) {
                    rec.previewArcCenter.getWorldPosition(tmp);
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
                    rec.previewArcCenter.scale.setScalar(scale);
                }
            }
        },

        getConstraintAnchorLocal(feature, constraint) {
            const entities = Array.isArray(feature?.entities) ? feature.entities : [];
            const byId = new Map(entities.map(e => [e?.id, e]));
            const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
            const lineTypes = new Set(['horizontal', 'vertical', 'horizontal_points', 'vertical_points', 'tangent', 'equal', 'collinear']);

            if (lineTypes.has(constraint?.type)) {
                const line = refs.map(id => byId.get(id)).find(e => e?.type === 'line');
                if (line) {
                    const [a, b] = this.getLineEndpoints(line, byId);
                    if (a && b) {
                        return { x: ((a.x || 0) + (b.x || 0)) * 0.5, y: ((a.y || 0) + (b.y || 0)) * 0.5 };
                    }
                }
            }

            const points = refs.map(id => byId.get(id)).filter(e => e?.type === 'point');
            if (constraint?.type === 'midpoint' && points.length >= 3) {
                const a = points[1];
                const b = points[2];
                return { x: ((a.x || 0) + (b.x || 0)) * 0.5, y: ((a.y || 0) + (b.y || 0)) * 0.5 };
            }
            if (points.length >= 2) {
                return {
                    x: ((points[0].x || 0) + (points[1].x || 0)) * 0.5,
                    y: ((points[0].y || 0) + (points[1].y || 0)) * 0.5
                };
            }
            if (points.length === 1) {
                return { x: points[0].x || 0, y: points[0].y || 0 };
            }
            return null;
        },

        projectConstraintAnchor(rec, local) {
            if (!rec?.entitiesGroup || !local) {
                return null;
            }
            const world = new THREE.Vector3(local.x || 0, local.y || 0, 0);
            rec.entitiesGroup.localToWorld(world);
            const proj = getApi().overlay.project3Dto2D(world);
            if (!proj?.visible) {
                return null;
            }
            return { x: proj.x, y: proj.y };
        },

        tagPointMarker(marker, id) {
            if (!marker) return;
            marker.traverse(obj => {
                obj.userData = obj.userData || {};
                obj.userData.sketchEntityId = id;
                obj.userData.sketchEntityType = 'point';
            });
        },

        applyConstraintOffset(constraint, screenPos, slotIndex = 0, slotCount = 1) {
            const base = constraint?.ui?.offset_px || { x: 0, y: -18 };
            const rowWidth = slotCount * CONSTRAINT_GLYPH_SIZE_PX + Math.max(0, slotCount - 1) * CONSTRAINT_GLYPH_GAP_PX;
            const slotX = -rowWidth / 2 + (slotIndex + 0.5) * CONSTRAINT_GLYPH_SIZE_PX + slotIndex * CONSTRAINT_GLYPH_GAP_PX;
            return {
                x: screenPos.x + (base.x || 0) + slotX,
                y: screenPos.y + (base.y || 0)
            };
        },

        updateConstraintGlyphs() {
            const layer = this.ensureConstraintGlyphLayer();
            if (!layer) return;
            layer.innerHTML = '';

            const rec = this.getEditingRecord();
            if (!rec?.feature) {
                return;
            }

            const constraints = Array.isArray(rec.feature.constraints) ? rec.feature.constraints : [];
            if (!constraints.length) {
                return;
            }

            const selectedEntityIds = rec.interaction?.selectedIds || new Set();
            const hoveredEntityId = rec.interaction?.hoveredId || null;
            const selectedConstraintIds = rec.interaction?.selectedConstraintIds || new Set();
            const hoveredConstraintId = rec.interaction?.hoveredConstraintId || null;
            const draggingConstraintId = this._glyphDrag?.constraintId || null;

            const visible = [];
            for (const constraint of constraints) {
                const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
                const byEntity = refs.some(ref => selectedEntityIds.has(ref));
                const byHover = !!hoveredEntityId && refs.includes(hoveredEntityId);
                const byDrag = draggingConstraintId === constraint?.id;
                if (byEntity || byHover || byDrag) {
                    visible.push(constraint);
                }
            }
            // If the currently hovered constraint is no longer visible as a glyph,
            // clear hover state so constrained-entity highlight does not stick.
            if (hoveredConstraintId && !visible.some(c => c?.id === hoveredConstraintId)) {
                const api = getApi();
                api.interact?.setHoveredSketchConstraint?.(null);
            }
            if (!visible.length) {
                return;
            }

            const clusters = new Map();
            for (const constraint of visible) {
                const local = this.getConstraintAnchorLocal(rec.feature, constraint);
                const screen = this.projectConstraintAnchor(rec, local);
                if (!screen) continue;
                const key = `${Math.round(screen.x / 10)}:${Math.round(screen.y / 10)}`;
                if (!clusters.has(key)) {
                    clusters.set(key, { screen, items: [] });
                }
                clusters.get(key).items.push(constraint);
            }

            for (const { screen, items } of clusters.values()) {
                for (let i = 0; i < items.length; i++) {
                    const c = items[i];
                    const pos = this.applyConstraintOffset(c, screen, i, items.length);
                    const glyph = document.createElement('button');
                    glyph.className = 'sketch-constraint-glyph';
                    glyph.textContent = this.constraintGlyphLabel(c.type);
                    glyph.style.left = `${Math.round(pos.x)}px`;
                    glyph.style.top = `${Math.round(pos.y)}px`;
                    if (selectedConstraintIds.has(c.id)) {
                        glyph.classList.add('selected');
                    } else if (hoveredConstraintId === c.id) {
                        glyph.classList.add('hover');
                    }
                    glyph.title = c.type || 'constraint';
                    glyph.onmouseenter = () => {
                        const api = getApi();
                        api.interact?.setHoveredSketchConstraint?.(c.id);
                    };
                    glyph.onmouseleave = () => {
                        const api = getApi();
                        api.interact?.setHoveredSketchConstraint?.(null);
                    };
                    glyph.onmousedown = event => {
                        event.preventDefault();
                        event.stopPropagation();
                        const api = getApi();
                        api.interact?.selectSketchConstraint?.(c.id, event);
                        this._glyphDrag = {
                            featureId: rec.feature.id,
                            constraintId: c.id,
                            startX: event.clientX,
                            startY: event.clientY,
                            base: c?.ui?.offset_px ? { x: c.ui.offset_px.x || 0, y: c.ui.offset_px.y || 0 } : { x: 0, y: -18 },
                            moved: false
                        };
                    };
                    layer.appendChild(glyph);
                }
            }
        },

        updateConstraintDrag(event, done = false) {
            if (!this._glyphDrag) return;
            const drag = this._glyphDrag;
            const dx = (event?.clientX || 0) - drag.startX;
            const dy = (event?.clientY || 0) - drag.startY;
            const moved = Math.hypot(dx, dy) > 0.5;
            drag.moved = drag.moved || moved;
            const next = { x: drag.base.x + dx, y: drag.base.y + dy };
            const api = getApi();
            api.features.mutateTransient(drag.featureId, sketch => {
                sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
                const c = sketch.constraints.find(cst => cst?.id === drag.constraintId);
                if (!c) return;
                c.ui = c.ui || {};
                c.ui.offset_px = next;
            });
            if (done) {
                if (drag.moved) {
                    api.features.commit(drag.featureId, {
                        opType: 'feature.update',
                        payload: { field: 'constraints.ui.move', id: drag.constraintId }
                    });
                }
                this._glyphDrag = null;
            }
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
