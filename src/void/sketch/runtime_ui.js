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

function getDimensionMode(constraint) {
    return constraint?.data?.mode === 'driven' ? 'driven' : 'driving';
}

function formatMeasuredValue(value) {
    if (!Number.isFinite(value) || value <= 0) return 'D';
    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
        return value.toExponential(2);
    }
    return Number(value.toFixed(3)).toString();
}

function projectLocalToScreen(rec, local, getApi) {
    if (!rec?.entitiesGroup || !local) return null;
    const world = new THREE.Vector3(local.x || 0, local.y || 0, 0);
    rec.entitiesGroup.localToWorld(world);
    const proj = getApi().overlay.project3Dto2D(world);
    if (!proj?.visible) return null;
    return { x: proj.x, y: proj.y };
}

function getDimensionEndpoints(feature, constraint) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.map(e => [e?.id, e]));
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length === 1) {
        const line = byId.get(refs[0]);
        if (line?.type !== 'line') return null;
        const aId = typeof line?.a === 'string' ? line.a : (typeof line?.p1_id === 'string' ? line.p1_id : null);
        const bId = typeof line?.b === 'string' ? line.b : (typeof line?.p2_id === 'string' ? line.p2_id : null);
        const a = byId.get(aId);
        const b = byId.get(bId);
        if (a?.type !== 'point' || b?.type !== 'point') return null;
        return [a, b];
    }
    if (refs.length >= 2) {
        const a = byId.get(refs[0]);
        const b = byId.get(refs[1]);
        if (a?.type !== 'point' || b?.type !== 'point') return null;
        return [a, b];
    }
    return null;
}

function computeDimensionMeasurement(feature, constraint) {
    const pts = getDimensionEndpoints(feature, constraint);
    if (!pts) return NaN;
    const [a, b] = pts;
    return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
}

function clearDimensionDecorations3D(rec) {
    if (!rec?.dimensionGroup) return;
    while (rec.dimensionGroup.children.length) {
        const child = rec.dimensionGroup.children[0];
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) {
            for (const mat of child.material) mat?.dispose?.();
        } else {
            child.material?.dispose?.();
        }
        rec.dimensionGroup.remove(child);
    }
}

function worldPerPixelAt(rec, localPoint) {
    const { camera, renderer } = space.internals();
    if (!camera || !renderer || !rec?.entitiesGroup) return null;
    const viewHeightPx = renderer.domElement?.clientHeight || renderer.domElement?.height;
    if (!viewHeightPx) return null;
    const world = new THREE.Vector3(localPoint.x || 0, localPoint.y || 0, 0);
    rec.entitiesGroup.localToWorld(world);
    if (camera.isPerspectiveCamera) {
        const distance = camera.position.distanceTo(world);
        const fovRad = camera.fov * Math.PI / 180;
        return (2 * Math.tan(fovRad / 2) * distance) / viewHeightPx;
    }
    if (camera.isOrthographicCamera) {
        return ((camera.top - camera.bottom) / camera.zoom) / viewHeightPx;
    }
    return null;
}

function screenToSketchLocal(rec, sx, sy) {
    const { camera, renderer } = space.internals();
    if (!camera || !renderer || !rec?.entitiesGroup) return null;
    const rect = renderer.domElement?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(
        ((sx - rect.left) / rect.width) * 2 - 1,
        -(((sy - rect.top) / rect.height) * 2 - 1)
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const origin = new THREE.Vector3(0, 0, 0);
    rec.entitiesGroup.localToWorld(origin);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rec.entitiesGroup.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(plane, hit);
    if (!ok) return null;
    rec.entitiesGroup.worldToLocal(hit);
    return { x: hit.x || 0, y: hit.y || 0 };
}

function addLocalOffset(anchor, offset) {
    return {
        x: (anchor?.x || 0) + (offset?.x || 0),
        y: (anchor?.y || 0) + (offset?.y || 0)
    };
}

function getDimensionCenterLocal(rec, feature, constraint, drag = null) {
    const anchor = getConstraintAnchorLocal.call(this, feature, constraint);
    if (!anchor) return null;
    if (drag?.constraintId === constraint?.id && drag?.currentLocal) {
        return drag.currentLocal;
    }
    const localOff = constraint?.ui?.offset_local;
    if (localOff && Number.isFinite(localOff.x) && Number.isFinite(localOff.y)) {
        return addLocalOffset(anchor, localOff);
    }
    return anchor;
}

function addDimensionDecoration3D(rec, c, a, b, opts = {}) {
    if (!rec?.dimensionGroup) return;
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1e-6) return;
    const ux = dx / len;
    const uy = dy / len;
    const anchor = { x: ((a.x || 0) + (b.x || 0)) * 0.5, y: ((a.y || 0) + (b.y || 0)) * 0.5 };
    const center = opts?.centerLocal || anchor;
    const proj = p => {
        const rx = (p.x || 0) - center.x;
        const ry = (p.y || 0) - center.y;
        const t = rx * ux + ry * uy;
        return { x: center.x + ux * t, y: center.y + uy * t, t };
    };
    const b1 = proj(a);
    const b2 = proj(b);
    const start = b1.t <= b2.t ? b1 : b2;
    const end = b1.t <= b2.t ? b2 : b1;
    const wpp = worldPerPixelAt(rec, center);
    const offScale = Number.isFinite(wpp) ? wpp : 0.05;
    const capLen = 6 * offScale;
    const nx = -uy;
    const ny = ux;
    const mode = getDimensionMode(c);
    let color = mode === 'driven' ? 0x8e8e8e : 0xc6c6c6;
    if (opts?.hovered) color = 0xff9933;
    if (opts?.selected) color = 0x5a9fd4;

    const makeLine = (p1, p2, z = 0.002) => {
        const geom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(p1.x || 0, p1.y || 0, z),
            new THREE.Vector3(p2.x || 0, p2.y || 0, z)
        ]);
        const mat = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.95,
            depthTest: true,
            depthWrite: false
        });
        const line = new THREE.Line(geom, mat);
        line.renderOrder = 11;
        rec.dimensionGroup.add(line);
    };

    // extension lines
    makeLine(a, b1);
    makeLine(b, b2);
    // baseline
    makeLine(start, end);
    // end caps
    makeLine(
        { x: start.x - nx * capLen * 0.5, y: start.y - ny * capLen * 0.5 },
        { x: start.x + nx * capLen * 0.5, y: start.y + ny * capLen * 0.5 }
    );
    makeLine(
        { x: end.x - nx * capLen * 0.5, y: end.y - ny * capLen * 0.5 },
        { x: end.x + nx * capLen * 0.5, y: end.y + ny * capLen * 0.5 }
    );
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
    if (rec.dimensionGroup) {
        rec.dimensionGroup.visible = showEntities;
    }

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
        for (const r of this.sketches.values()) {
            clearDimensionDecorations3D(r);
        }
        return;
    }
    for (const r of this.sketches.values()) {
        clearDimensionDecorations3D(r);
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
        const alwaysVisible = constraint?.type === 'dimension';
        if (alwaysVisible || byEntity || byHover || byDrag) {
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
            const isDimension = c?.type === 'dimension';
            let pos;
            if (isDimension) {
                const centerLocal = getDimensionCenterLocal.call(this, rec, rec.feature, c, this._glyphDrag);
                const centerScreen = centerLocal ? this.projectConstraintAnchor(rec, centerLocal, getApi) : null;
                pos = centerScreen || this.applyConstraintOffset(c, screen, i, items.length, opts);
            } else {
                pos = this.applyConstraintOffset(c, screen, i, items.length, opts);
            }
            const glyph = document.createElement('button');
            glyph.className = 'sketch-constraint-glyph';
            const measured = isDimension ? computeDimensionMeasurement(rec.feature, c) : NaN;
            const mode = isDimension ? getDimensionMode(c) : 'driving';
            glyph.textContent = isDimension
                ? (mode === 'driven' ? formatMeasuredValue(measured) : formatDimensionLabel(c))
                : this.constraintGlyphLabel(c.type);
            glyph.style.left = `${Math.round(pos.x)}px`;
            glyph.style.top = `${Math.round(pos.y)}px`;
            if (isDimension) {
                glyph.classList.add('dimension');
                glyph.classList.toggle('driven', mode === 'driven');
                glyph.classList.toggle('driving', mode === 'driving');
                glyph.dataset.mode = mode === 'driven' ? 'R' : 'D';
                const ends = getDimensionEndpoints(rec.feature, c);
                if (ends) {
                    const centerLocal = getDimensionCenterLocal.call(this, rec, rec.feature, c, this._glyphDrag);
                    addDimensionDecoration3D(rec, c, ends[0], ends[1], {
                        selected: selectedConstraintIds.has(c.id),
                        hovered: hoveredConstraintId === c.id,
                        centerLocal
                    });
                }
            }
            if (selectedConstraintIds.has(c.id)) {
                glyph.classList.add('selected');
            } else if (hoveredConstraintId === c.id) {
                glyph.classList.add('hover');
            }
            glyph.title = isDimension
                ? `dimension (${mode}) - double-click edit, alt-click toggle driving/reference`
                : (c.type || 'constraint');
            glyph.ondblclick = event => {
                if (!isDimension || mode !== 'driving') return;
                event.preventDefault();
                event.stopPropagation();
                const api = getApi();
                api.interact?.editSketchDimensionConstraint?.(c.id);
            };
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
                if (isDimension && event.altKey) {
                    api.interact?.toggleSketchDimensionMode?.(c.id);
                    return;
                }
                if (isDimension) {
                    const now = performance.now();
                    const prev = this._glyphClick;
                    if (mode === 'driving' && prev && prev.id === c.id && (now - prev.time) < 360) {
                        this._glyphClick = null;
                        api.interact?.editSketchDimensionConstraint?.(c.id);
                        return;
                    }
                    this._glyphClick = { id: c.id, time: now };
                } else {
                    this._glyphClick = null;
                }
                api.interact?.selectSketchConstraint?.(c.id, event);
                this._glyphDrag = {
                    featureId: rec.feature.id,
                    constraintId: c.id,
                    isDimension,
                    startX: event.clientX,
                    startY: event.clientY,
                    base: c?.ui?.offset_px ? { x: c.ui.offset_px.x || 0, y: c.ui.offset_px.y || 0 } : { x: 0, y: -18 },
                    current: c?.ui?.offset_px ? { x: c.ui.offset_px.x || 0, y: c.ui.offset_px.y || 0 } : { x: 0, y: -18 },
                    currentLocal: getDimensionCenterLocal.call(this, rec, rec.feature, c, null),
                    localDelta: null,
                    moved: false
                };
                if (isDimension) {
                    const mouseLocal = screenToSketchLocal(rec, event.clientX, event.clientY);
                    if (mouseLocal && this._glyphDrag.currentLocal) {
                        this._glyphDrag.localDelta = {
                            x: (this._glyphDrag.currentLocal.x || 0) - (mouseLocal.x || 0),
                            y: (this._glyphDrag.currentLocal.y || 0) - (mouseLocal.y || 0)
                        };
                    }
                }
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
    drag.current = next;
    if (drag.isDimension) {
        const rec = this.getRecord?.(drag.featureId) || null;
        const mouseLocal = rec ? screenToSketchLocal(rec, event?.clientX || 0, event?.clientY || 0) : null;
        if (mouseLocal) {
            const delta = drag.localDelta || { x: 0, y: 0 };
            drag.currentLocal = {
                x: (mouseLocal.x || 0) + (delta.x || 0),
                y: (mouseLocal.y || 0) + (delta.y || 0)
            };
        }
    }
    this.updateConstraintGlyphs(getApi);
    space.update();
    if (done) {
        if (drag.moved) {
            const api = getApi();
            api.features.mutateTransient(drag.featureId, sketch => {
                sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
                const c = sketch.constraints.find(cst => cst?.id === drag.constraintId);
                if (!c) return;
                c.ui = c.ui || {};
                if (drag.isDimension) {
                    const anchor = getConstraintAnchorLocal.call(this, sketch, c);
                    const center = drag.currentLocal;
                    if (anchor && center) {
                        c.ui.offset_local = {
                            x: (center.x || 0) - (anchor.x || 0),
                            y: (center.y || 0) - (anchor.y || 0)
                        };
                    }
                } else {
                    c.ui.offset_px = next;
                }
            });
            api.features.commit(drag.featureId, {
                opType: 'feature.update',
                payload: { field: 'constraints.ui.move', id: drag.constraintId }
            });
        }
        this._glyphDrag = null;
        space.update();
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
