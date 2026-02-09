/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';

function constraintGlyphLabel(type) {
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
        midpoint: 'M',
        dimension: 'D',
        polygon_pattern: 'PG'
    };
    return labels[type] || '?';
}

function formatDimensionLabel(constraint) {
    const value = Number(constraint?.data?.value);
    if (!Number.isFinite(value) || value <= 0) {
        return 'D';
    }
    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
        return value.toExponential(2);
    }
    return Number(value.toFixed(3)).toString();
}

function applySketchState(rec, getApi, colors) {
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
    this.applyPlaneStyle(rec.plane, mode, colors);
    this.applyEntityStyle(rec, mode, colors);
    this.applyPreviewLine(rec, mode, editing, colors);
    this.applyPreviewArc(rec, mode, editing, colors);
    this.applyPreviewRect(rec, mode, editing, colors);
    this.applyPreviewStart(rec, mode, editing, colors);
    this.applyPreviewEnd(rec, mode, editing, colors);
    this.applyLabelState(rec, mode, showPlane, getApi, colors);
}

function applyPlaneStyle(plane, mode, colors) {
    const style = mode === 'edit'
        ? colors.planeEdit
        : mode === 'hover'
            ? colors.planeHover
            : colors.planeDefault;
    plane.setColor(style.fill);
    plane.setOpacity(style.fillOpacity);
    plane.setOutlineColor(style.outline);
    plane.setOutlineOpacity(style.outlineOpacity);
}

function applyEntityStyle(rec, mode, colors) {
    const baseLineColor = mode === 'edit'
        ? colors.linesEdit
        : mode === 'hover'
            ? colors.linesHover
            : colors.linesGray;
    const basePointColor = colors.pointsGray;

    const hoveredId = rec.interaction?.hoveredId || null;
    const selectedIds = rec.interaction?.selectedIds || new Set();
    const hoveredProfileId = rec.interaction?.hoveredProfileId || null;
    const selectedProfileIds = rec.interaction?.selectedProfileIds || new Set();
    const constraintHighlight = this.getConstraintHoverHighlight(rec);

    for (const [id, view] of rec.entityViews.entries()) {
        const selected = mode === 'edit' && selectedIds.has(id);
        const constrained = mode === 'edit' && constraintHighlight.has(id) && !selected;
        const hovered = mode === 'edit' && (hoveredId === id || constrained) && !selected;

        if (view.type === 'line' || view.type === 'arc') {
            const color = selected
                ? colors.linesHover
                : hovered
                    ? colors.linesHover
                    : baseLineColor;
            view.object.material.color.setHex(color);
            continue;
        }
        if (view.type === 'profile') {
            const activeSelected = selectedProfileIds.has(id);
            const activeHovered = hoveredProfileId === id && !activeSelected;
            const fill = view.object;
            if (fill?.material?.color) {
                if (activeSelected) {
                    fill.material.color.setHex(0x5a9fd4);
                    fill.material.opacity = 0.28;
                } else if (activeHovered) {
                    fill.material.color.setHex(0xff9933);
                    fill.material.opacity = 0.24;
                } else {
                    fill.material.color.setHex(0x8f8f8f);
                    fill.material.opacity = 0.18;
                }
                // Active sketch profile picks must draw above coplanar solid faces.
                const overlay = activeSelected || activeHovered;
                fill.material.depthTest = !overlay;
                fill.material.depthWrite = false;
                fill.renderOrder = overlay ? 55 : 6;
            }
            continue;
        }
        if (view.type === 'arc-center') {
            const parts = view.object.userData?._markerParts || {};
            const active = mode === 'edit' && (hoveredId === view.entity?.id || selectedIds.has(view.entity?.id));
            view.object.visible = true;
            if (parts.core?.material?.color) {
                parts.core.material.color.setHex(active ? colors.pointsHover : basePointColor);
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
                parts.core.material.color.setHex(active ? colors.pointsHover : basePointColor);
            }
            if (parts.ringHighlight) {
                parts.ringHighlight.visible = !!active;
                if (parts.ringHighlight.material?.color) {
                    parts.ringHighlight.material.color.setHex(colors.pointsHover);
                }
            }
            if (parts.ringWhite?.material?.color) {
                parts.ringWhite.material.color.setHex(0xffffff);
            }
            if (parts.ringBlack?.material?.color) {
                parts.ringBlack.material.color.setHex(0x101010);
            }
        }
    }
}

function getConstraintHoverHighlight(rec) {
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
    if (pointRefs.length) {
        for (const ent of entities) {
            if ((ent?.type !== 'line' && ent?.type !== 'arc') || !ent.id) continue;
            if (pointRefs.includes(ent.a) || pointRefs.includes(ent.b)) {
                out.add(ent.id);
            }
        }
    }
    return out;
}

function applyPreviewLine(rec, mode, editing, colors) {
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
    rec.previewLine.material.color.setHex(mode === 'edit' ? colors.linesEdit : colors.linesHover);
    rec.previewLine.visible = true;
}

function applyPreviewStart(rec, mode, editing, colors) {
    if (!rec.previewStart) return;
    const start = rec.interaction?.previewStart;
    if (!editing || !start) {
        rec.previewStart.visible = false;
        return;
    }
    rec.previewStart.position.set(start.x || 0, start.y || 0, 0);
    const parts = rec.previewStart.userData?._markerParts || {};
    if (parts.core?.material?.color) {
        parts.core.material.color.setHex(colors.pointsGray);
    }
    if (parts.ringHighlight) {
        parts.ringHighlight.visible = true;
        if (parts.ringHighlight.material?.color) {
            parts.ringHighlight.material.color.setHex(colors.pointsHover);
        }
    }
    rec.previewStart.visible = true;
}

function applyPreviewEnd(rec, mode, editing, colors) {
    if (!rec.previewEnd) return;
    const end = rec.interaction?.previewEnd;
    if (!editing || !end) {
        rec.previewEnd.visible = false;
        return;
    }
    rec.previewEnd.position.set(end.x || 0, end.y || 0, 0);
    const parts = rec.previewEnd.userData?._markerParts || {};
    if (parts.core?.material?.color) {
        parts.core.material.color.setHex(colors.pointsGray);
    }
    if (parts.ringHighlight) {
        parts.ringHighlight.visible = true;
        if (parts.ringHighlight.material?.color) {
            parts.ringHighlight.material.color.setHex(colors.pointsHover);
        }
    }
    rec.previewEnd.visible = true;
}

function applyPreviewArc(rec, mode, editing, colors) {
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
        rec.previewArc.material.color.setHex(mode === 'edit' ? colors.linesEdit : colors.linesHover);
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
            rec.previewArc.material.color.setHex(mode === 'edit' ? colors.linesEdit : colors.linesHover);
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
}

function applyPreviewRect(rec, mode, editing, colors) {
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
    rec.previewRect.material.color.setHex(mode === 'edit' ? colors.linesEdit : colors.linesHover);
    rec.previewRect.visible = true;
}

function applyLabelState(rec, mode, showPlane, getApi, colors) {
    const api = getApi();
    const overlay = api.overlay;
    if (!overlay) return;

    if (!showPlane) {
        this.removeLabel(rec, getApi);
        return;
    }

    const text = rec.feature?.name || 'Sketch';
    const color = mode === 'edit'
        ? colors.labelEdit
        : mode === 'hover'
            ? colors.labelHover
            : colors.labelDefault;
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
}

function removeLabel(rec, getApi) {
    const api = getApi();
    api.overlay?.remove(rec?.labelId);
}

function getPlaneLabelPosition(plane) {
    return plane.getTopLeftCorner();
}

function updatePointScreenScales(opts) {
    const { pointScreenRadiusPx, pointBaseRadius } = opts;
    const { camera, renderer } = space.internals();
    if (!camera || !renderer) return;
    const viewHeightPx = renderer.domElement?.clientHeight || renderer.domElement?.height;
    if (!viewHeightPx) return;
    const tmp = this._tmpPointWorld || new THREE.Vector3();

    const updateScale = object => {
        object.getWorldPosition(tmp);
        let worldPerPixel;
        if (camera.isPerspectiveCamera) {
            const distance = camera.position.distanceTo(tmp);
            const fovRad = camera.fov * Math.PI / 180;
            worldPerPixel = (2 * Math.tan(fovRad / 2) * distance) / viewHeightPx;
        } else if (camera.isOrthographicCamera) {
            worldPerPixel = ((camera.top - camera.bottom) / camera.zoom) / viewHeightPx;
        } else {
            return;
        }
        const desiredWorldRadius = pointScreenRadiusPx * worldPerPixel;
        const scale = Math.max(0.0001, desiredWorldRadius / pointBaseRadius);
        object.scale.setScalar(scale);
    };

    for (const rec of this.sketches.values()) {
        for (const view of rec.entityViews.values()) {
            if ((view.type !== 'point' && view.type !== 'arc-center') || !view.object) continue;
            updateScale(view.object);
        }
        if (rec.previewStart) updateScale(rec.previewStart);
        if (rec.previewEnd) updateScale(rec.previewEnd);
        if (rec.previewArcCenter) updateScale(rec.previewArcCenter);
    }
}

function getConstraintAnchorLocal(feature, constraint) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.map(e => [e?.id, e]));
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    const lineTypes = new Set(['horizontal', 'vertical', 'horizontal_points', 'vertical_points', 'tangent', 'equal', 'collinear', 'dimension']);

    if (lineTypes.has(constraint?.type)) {
        const line = refs.map(id => byId.get(id)).find(e => e?.type === 'line');
        if (line) {
            const [a, b] = this.getLineEndpoints(line, byId);
            if (a && b) {
                return { x: ((a.x || 0) + (b.x || 0)) * 0.5, y: ((a.y || 0) + (b.y || 0)) * 0.5 };
            }
        }
        if (constraint?.type === 'tangent') {
            const arcRefs = refs.map(id => byId.get(id)).filter(e => e?.type === 'arc');
            if (arcRefs.length >= 2) {
                const a1 = arcRefs[0];
                const a2 = arcRefs[1];
                const [p1a, p1b] = this.getArcEndpoints(a1, byId);
                const [p2a, p2b] = this.getArcEndpoints(a2, byId);
                const c1 = this.getArcCenterLocal(a1, p1a, p1b);
                const c2 = this.getArcCenterLocal(a2, p2a, p2b);
                if (c1 && c2) {
                    return { x: (c1.x + c2.x) * 0.5, y: (c1.y + c2.y) * 0.5 };
                }
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
}

function projectConstraintAnchor(rec, local, getApi) {
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
}

function tagPointMarker(marker, id) {
    if (!marker) return;
    marker.traverse(obj => {
        obj.userData = obj.userData || {};
        obj.userData.sketchEntityId = id;
        obj.userData.sketchEntityType = 'point';
    });
}

function applyConstraintOffset(constraint, screenPos, slotIndex = 0, slotCount = 1, opts = {}) {
    const size = opts.glyphSizePx || 18;
    const gap = opts.glyphGapPx || 4;
    const base = constraint?.ui?.offset_px || { x: 0, y: -18 };
    const rowWidth = slotCount * size + Math.max(0, slotCount - 1) * gap;
    const slotX = -rowWidth / 2 + (slotIndex + 0.5) * size + slotIndex * gap;
    return {
        x: screenPos.x + (base.x || 0) + slotX,
        y: screenPos.y + (base.y || 0)
    };
}

function updateConstraintGlyphs(getApi, opts = {}) {
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
        const screen = this.projectConstraintAnchor(rec, local, getApi);
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
            const pos = this.applyConstraintOffset(c, screen, i, items.length, opts);
            const glyph = document.createElement('button');
            glyph.className = 'sketch-constraint-glyph';
            glyph.textContent = c?.type === 'dimension'
                ? formatDimensionLabel(c)
                : this.constraintGlyphLabel(c.type);
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
}

function updateConstraintDrag(event, done = false, getApi) {
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
}

export {
    constraintGlyphLabel,
    applySketchState,
    applyPlaneStyle,
    applyEntityStyle,
    getConstraintHoverHighlight,
    applyPreviewLine,
    applyPreviewStart,
    applyPreviewEnd,
    applyPreviewArc,
    applyPreviewRect,
    applyLabelState,
    removeLabel,
    getPlaneLabelPosition,
    updatePointScreenScales,
    getConstraintAnchorLocal,
    projectConstraintAnchor,
    tagPointMarker,
    applyConstraintOffset,
    updateConstraintGlyphs,
    updateConstraintDrag
};
