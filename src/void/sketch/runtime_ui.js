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
        arc_center_on_line: 'PL',
        arc_center_on_arc: 'PA',
        arc_center_fixed_origin: 'C',
        fixed: 'F',
        tangent: 'T',
        equal: '=',
        midpoint: 'M',
        dimension: 'D',
        min_distance: 'd<',
        max_distance: 'd>',
        polygon_pattern: 'PG',
        circular_pattern: 'CP',
        grid_pattern: 'GP',
        mirror_point: 'MR',
        mirror_line: 'MR',
        mirror_arc: 'MR'
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

function computeArcCenterForUi(arc, a, b) {
    const cx = Number(arc?.cx);
    const cy = Number(arc?.cy);
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
        return { x: cx, y: cy };
    }
    const mx = Number(arc?.mx);
    const my = Number(arc?.my);
    if (!Number.isFinite(mx) || !Number.isFinite(my) || !a || !b) {
        return null;
    }
    const x1 = a.x || 0;
    const y1 = a.y || 0;
    const x2 = b.x || 0;
    const y2 = b.y || 0;
    const x3 = mx;
    const y3 = my;
    const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
    if (Math.abs(d) < 1e-8) return null;
    const x1sq = x1 * x1 + y1 * y1;
    const x2sq = x2 * x2 + y2 * y2;
    const x3sq = x3 * x3 + y3 * y3;
    const ccx = (x1sq * (y2 - y3) + x2sq * (y3 - y1) + x3sq * (y1 - y2)) / d;
    const ccy = (x1sq * (x3 - x2) + x2sq * (x1 - x3) + x3sq * (x2 - x1)) / d;
    if (!Number.isFinite(ccx) || !Number.isFinite(ccy)) return null;
    return { x: ccx, y: ccy };
}

function isArcDimensionConstraint(feature, constraint) {
    const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    if (refs.length !== 1) return false;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.map(e => [e?.id, e]));
    return byId.get(refs[0])?.type === 'arc';
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
    const refs = Array.isArray(constraint?.ui?.display_refs) && constraint.ui.display_refs.length
        ? constraint.ui.display_refs
        : (Array.isArray(constraint?.refs) ? constraint.refs : []);
    if (refs.length === 1) {
        const ent = byId.get(refs[0]);
        if (ent?.type === 'line') {
            const aId = typeof ent?.a === 'string' ? ent.a : (typeof ent?.p1_id === 'string' ? ent.p1_id : null);
            const bId = typeof ent?.b === 'string' ? ent.b : (typeof ent?.p2_id === 'string' ? ent.p2_id : null);
            const a = byId.get(aId);
            const b = byId.get(bId);
            if (a?.type !== 'point' || b?.type !== 'point') return null;
            return [a, b];
        }
        if (ent?.type === 'arc') {
            const aId = typeof ent?.a === 'string' ? ent.a : (typeof ent?.p1_id === 'string' ? ent.p1_id : null);
            const bId = typeof ent?.b === 'string' ? ent.b : (typeof ent?.p2_id === 'string' ? ent.p2_id : null);
            const a = byId.get(aId);
            const b = byId.get(bId);
            if (a?.type !== 'point' || b?.type !== 'point') return null;
            const center = computeArcCenterForUi(ent, a, b);
            if (!center) return null;
            return [{ x: center.x, y: center.y, type: 'point' }, { x: a.x || 0, y: a.y || 0, type: 'point' }];
        }
        return null;
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
    const base = Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
    return isArcDimensionConstraint(feature, constraint) ? base * 2 : base;
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
    const palette = opts?.colors || {};
    let color = mode === 'driven'
        ? (palette.constraintGlyphDriven || 0x8e8e8e)
        : (palette.constraintGlyphDerived || 0xc6c6c6);
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

    const drawArrowHead = (tip, dir, size = capLen * 0.9) => {
        const dlen = Math.hypot(dir.x || 0, dir.y || 0);
        if (!Number.isFinite(dlen) || dlen < 1e-8) return;
        const ux = (dir.x || 0) / dlen;
        const uy = (dir.y || 0) / dlen;
        const px = -uy;
        const py = ux;
        const backX = (tip.x || 0) - ux * size;
        const backY = (tip.y || 0) - uy * size;
        const wing = size * 0.55;
        makeLine(tip, { x: backX + px * wing, y: backY + py * wing });
        makeLine(tip, { x: backX - px * wing, y: backY - py * wing });
    };

    // Diameter dimensions: inside the circle draw full diameter with end arrows.
    // Outside the circle draw a leader with a single arrow touching the circle.
    const isArcDim = isArcDimensionConstraint(rec?.feature, c);
    if (isArcDim) {
        const centerPt = a;
        const edgePt = b;
        const rdx = (edgePt.x || 0) - (centerPt.x || 0);
        const rdy = (edgePt.y || 0) - (centerPt.y || 0);
        const radius = Math.hypot(rdx, rdy);
        const odx = (center.x || 0) - (centerPt.x || 0);
        const ody = (center.y || 0) - (centerPt.y || 0);
        const off = Math.hypot(odx, ody);
        if (Number.isFinite(radius) && radius > 1e-6 && Number.isFinite(off) && off > radius + 1e-6) {
            const ux2 = odx / off;
            const uy2 = ody / off;
            const touch = {
                x: (centerPt.x || 0) + ux2 * radius,
                y: (centerPt.y || 0) + uy2 * radius
            };
            makeLine(center, touch);
            drawArrowHead(touch, { x: touch.x - (center.x || 0), y: touch.y - (center.y || 0) });
            return;
        }
        const ux2 = Number.isFinite(off) && off > 1e-6 ? odx / off : 1;
        const uy2 = Number.isFinite(off) && off > 1e-6 ? ody / off : 0;
        const d0 = {
            x: (centerPt.x || 0) - ux2 * radius,
            y: (centerPt.y || 0) - uy2 * radius
        };
        const d1 = {
            x: (centerPt.x || 0) + ux2 * radius,
            y: (centerPt.y || 0) + uy2 * radius
        };
        makeLine(d0, d1);
        drawArrowHead(d0, { x: d0.x - d1.x, y: d0.y - d1.y });
        drawArrowHead(d1, { x: d1.x - d0.x, y: d1.y - d0.y });
        return;
    }

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
    const forcedVisible = this.forcedVisibleIds?.has?.(feature.id) || false;
    const hovered = this.hoveredId === feature.id;
    const editing = this.editingId === feature.id;
    const selected = this.selectedIds.has(feature.id);

    const showPlane = editing || hovered || selected;
    const showEntities = visible || forcedVisible || hovered || editing || selected;

    rec.plane.setVisible(showPlane);
    rec.entitiesGroup.visible = showEntities;
    if (rec.dimensionGroup) {
        rec.dimensionGroup.visible = showEntities;
    }

    const mode = editing ? 'edit' : (hovered || selected ? 'hover' : 'default');
    this.applyPlaneStyle(rec.plane, mode, colors);
    this.applyEntityStyle(rec, mode, colors);
    this.applyPreviewLine(rec, mode, editing, colors);
    this.applyPreviewFaceSegments(rec, mode, editing, colors);
    this.applyPreviewExternalWorld(rec, mode, editing, colors);
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
    const mirrorMode = !!rec.interaction?.mirrorMode;
    const mirrorAxisId = rec.interaction?.mirrorAxisId || null;
    const circularPatternMode = !!rec.interaction?.circularPatternMode;
    const circularPatternCenterRef = rec.interaction?.circularPatternCenterRef || null;
    const hoveredProfileId = rec.interaction?.hoveredProfileId || null;
    const selectedProfileIds = rec.interaction?.selectedProfileIds || new Set();
    const constraintHighlight = this.getConstraintHoverHighlight(rec);
    const entities = Array.isArray(rec?.feature?.entities) ? rec.feature.entities : [];
    const pointAttachments = new Map();
    for (const entity of entities) {
        if ((entity?.type !== 'line' && entity?.type !== 'arc') || !entity?.id) continue;
        const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
        const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
        if (aId) {
            if (!pointAttachments.has(aId)) pointAttachments.set(aId, []);
            pointAttachments.get(aId).push(entity.id);
        }
        if (bId) {
            if (!pointAttachments.has(bId)) pointAttachments.set(bId, []);
            pointAttachments.get(bId).push(entity.id);
        }
    }
    const sketchHovered = mode === 'hover';
    const idleRingColor = colors.pointsRingIdle || colors.linesGray || 0x747474;
    const primitivePointCore = colors.pointsPrimitiveCore || 0x101010;

    for (const [id, view] of rec.entityViews.entries()) {
        const selected = mode === 'edit' && selectedIds.has(id);
        const constrained = mode === 'edit' && constraintHighlight.has(id) && !selected;
        const hovered = mode === 'edit' && (hoveredId === id || constrained) && !selected;

        if (view.type === 'line' || view.type === 'arc') {
            const isMirrorAxis = mirrorMode && view.type === 'line' && id === mirrorAxisId;
            const color = isMirrorAxis
                ? (colors.linesMirrorAxis || 0xb07cff)
                : selected
                    ? colors.linesHover
                    : hovered
                        ? colors.linesHover
                        : baseLineColor;
            view.object.material.color.setHex(color);
            if (view.object.material?.isLineMaterial) {
                const width = isMirrorAxis
                    ? (colors.lineWidths?.selected || 3.4)
                    : selected
                        ? (colors.lineWidths?.selected || 3.4)
                        : hovered
                            ? (colors.lineWidths?.hover || 3.0)
                            : (colors.lineWidths?.default || 1.2);
                view.object.material.linewidth = width;
                const { renderer } = space.internals();
                const w = renderer?.domElement?.clientWidth || renderer?.domElement?.width || 1;
                const h = renderer?.domElement?.clientHeight || renderer?.domElement?.height || 1;
                view.object.material.resolution?.set?.(w, h);
            }
            continue;
        }
        if (view.type === 'profile') {
            const activeSelected = selectedProfileIds.has(id);
            const activeHovered = hoveredProfileId === id;
            const fill = view.object;
            if (fill?.material?.color) {
                if (activeHovered) {
                    fill.material.color.setHex(colors.profileFillHover || 0xff9933);
                    fill.material.opacity = colors.profileOpacityHover ?? 0.24;
                } else if (activeSelected) {
                    fill.material.color.setHex(colors.profileFillSelected || 0x5a9fd4);
                    fill.material.opacity = colors.profileOpacitySelected ?? 0.28;
                } else {
                    fill.material.color.setHex(colors.profileFillDefault || 0x8f8f8f);
                    fill.material.opacity = colors.profileOpacityDefault ?? 0.18;
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
            const isPatternCenter = circularPatternMode && (
                circularPatternCenterRef === id ||
                circularPatternCenterRef === String(id || '').replace(/^arc-center:/, '')
            );
            const activeEdit = mode === 'edit' && (
                hoveredId === id ||
                selectedIds.has(id) ||
                constrained ||
                isPatternCenter
            );
            const coreColor = sketchHovered
                ? (isPatternCenter ? (colors.linesMirrorAxis || 0xb07cff) : (colors.linesHover || colors.pointsHover))
                : baseLineColor;
            view.object.visible = true;
            if (parts.core?.material?.color) {
                parts.core.material.color.setHex(coreColor);
            }
            if (parts.core?.material?.uniforms?.uCoreColor?.value?.setHex) {
                parts.core.material.uniforms.uCoreColor.value.setHex(coreColor);
            }
            if (parts.ringBase) parts.ringBase.visible = false;
            if (parts.core?.material?.uniforms?.uShowBaseRings) {
                parts.core.material.uniforms.uShowBaseRings.value = 0;
            }
            if (parts.ringHighlight) {
                parts.ringHighlight.visible = !!activeEdit;
                if (parts.ringHighlight.color) {
                    parts.ringHighlight.color.setHex(isPatternCenter ? (colors.linesMirrorAxis || 0xb07cff) : (colors.linesHover || 0xff9933));
                }
            }
            if (parts.ringWhite?.material?.color) {
                parts.ringWhite.material.color.setHex(mode === 'edit' ? 0xffffff : idleRingColor);
            }
            if (parts.ringBlack?.material?.color) {
                parts.ringBlack.material.color.setHex(0x101010);
            }
            continue;
        }

        if (view.type === 'point') {
            const parts = view.object.userData?._markerParts || {};
            const attachments = pointAttachments.get(id) || [];
            const attached = attachments.length > 0;
            const isPatternCenter = circularPatternMode && (
                circularPatternCenterRef === id ||
                circularPatternCenterRef === `arc-center:${id}`
            );
            const activeEdit = mode === 'edit' && (selected || hovered || constrained);
            const pointColor = activeEdit
                ? (isPatternCenter ? (colors.linesMirrorAxis || 0xb07cff) : (colors.linesHover || colors.pointsHover))
                : (attached
                    ? (sketchHovered
                        ? (isPatternCenter ? (colors.linesMirrorAxis || 0xb07cff) : (colors.linesHover || colors.pointsHover))
                        : baseLineColor)
                    : primitivePointCore);
            if (parts.core?.material?.color) {
                parts.core.material.color.setHex(pointColor);
            }
            if (parts.core?.material?.uniforms?.uCoreColor?.value?.setHex) {
                parts.core.material.uniforms.uCoreColor.value.setHex(pointColor);
            }
            if (parts.ringBase) parts.ringBase.visible = !attached;
            if (parts.core?.material?.uniforms?.uShowBaseRings) {
                parts.core.material.uniforms.uShowBaseRings.value = attached ? 0 : 1;
            }
            if (parts.ringHighlight) {
                parts.ringHighlight.visible = !!activeEdit;
                if (parts.ringHighlight.color) {
                    parts.ringHighlight.color.setHex(isPatternCenter ? (colors.linesMirrorAxis || 0xb07cff) : (colors.linesHover || 0xff9933));
                }
            }
            if (parts.ringWhite?.material?.color) {
                parts.ringWhite.material.color.setHex(mode === 'edit' ? 0xffffff : idleRingColor);
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
    const addEntityRef = ref => {
        if (!ref) return;
        out.add(ref);
        const ent = byId.get(ref);
        if (ent?.type === 'arc') {
            out.add(`arc-center:${ref}`);
        }
    };
    const c = constraints.find(cst => cst?.id === hoveredConstraintId);
    if (!c) return out;
    const refs = Array.isArray(c.refs) ? c.refs : [];
    const visRefs = Array.isArray(c?.ui?.display_refs) && c.ui.display_refs.length
        ? c.ui.display_refs
        : refs;
    if (c?.type === 'circular_pattern') {
        const centerRef = typeof c?.data?.centerRef === 'string' ? c.data.centerRef : visRefs[0];
        if (centerRef) out.add(centerRef);
        const sourceIds = Array.isArray(c?.data?.sourceIds) ? c.data.sourceIds : visRefs.slice(1);
        for (const id of sourceIds) out.add(id);
        return out;
    }
    if (c?.type === 'grid_pattern') {
        const centerRef = typeof c?.data?.centerPointId === 'string' ? c.data.centerPointId : visRefs[0];
        if (centerRef) out.add(centerRef);
        if (c?.data?.uLineId) out.add(c.data.uLineId);
        if (c?.data?.vLineId) out.add(c.data.vLineId);
        const sourceIds = Array.isArray(c?.data?.sourceIds) ? c.data.sourceIds : visRefs.slice(1);
        for (const id of sourceIds) addEntityRef(id);
        for (const rec of (Array.isArray(c?.data?.copies) ? c.data.copies : [])) {
            const ids = Array.isArray(rec)
                ? rec
                : (Array.isArray(rec?.ids) ? rec.ids : []);
            for (const id of ids) addEntityRef(id);
        }
        for (const rec of (Array.isArray(c?.data?.pointMaps) ? c.data.pointMaps : [])) {
            const pairs = Array.isArray(rec)
                ? rec
                : (Array.isArray(rec?.pairs) ? rec.pairs : []);
            for (const pair of pairs) {
                if (!Array.isArray(pair) || pair.length < 2) continue;
                addEntityRef(pair[0]);
                addEntityRef(pair[1]);
            }
        }
        return out;
    }
    if (c?.type === 'arc_center_coincident' && visRefs.length >= 2) {
        const arcId = visRefs[0];
        const pointId = visRefs[1];
        if (typeof arcId === 'string' && arcId) {
            out.add(`arc-center:${arcId}`);
        }
        if (pointId) out.add(pointId);
        return out;
    }
    if (c?.type === 'arc_center_on_line' && visRefs.length >= 2) {
        const arcId = visRefs.find(ref => byId.get(ref)?.type === 'arc') || visRefs[0];
        const lineId = visRefs.find(ref => byId.get(ref)?.type === 'line') || visRefs[1];
        if (typeof arcId === 'string' && arcId) out.add(`arc-center:${arcId}`);
        if (lineId) out.add(lineId);
        return out;
    }
    if (c?.type === 'arc_center_on_arc' && visRefs.length >= 2) {
        const arcs = visRefs.filter(ref => byId.get(ref)?.type === 'arc');
        if (arcs.length >= 2) {
            out.add(`arc-center:${arcs[0]}`);
            out.add(arcs[1]);
            return out;
        }
    }
    if (c?.type === 'arc_center_fixed_origin' && visRefs.length >= 1) {
        const arcId = visRefs[0];
        if (typeof arcId === 'string' && arcId) out.add(`arc-center:${arcId}`);
        return out;
    }
    const pointRefs = [];
    for (const ref of visRefs) {
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

function setLineObjectPoints(lineObject, points = []) {
    if (!lineObject || !Array.isArray(points) || points.length < 2) {
        return;
    }
    if (lineObject.material?.isLineMaterial && lineObject.geometry?.setPositions) {
        const flat = [];
        for (const p of points) {
            flat.push(p.x || 0, p.y || 0, p.z || 0);
        }
        // Debug mode: disable Line2 geometry reuse to isolate stateful buffer issues.
        const NextGeometry = lineObject.geometry?.constructor;
        const next = NextGeometry ? new NextGeometry() : null;
        if (next?.setPositions) {
            lineObject.geometry?.dispose?.();
            lineObject.geometry = next;
        }
        lineObject.geometry.setPositions(flat);
        lineObject.computeLineDistances?.();
        lineObject.geometry.computeBoundingSphere?.();
        return;
    }
    const verts = points.map(p => new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0));
    lineObject.geometry?.dispose?.();
    lineObject.geometry = new THREE.BufferGeometry().setFromPoints(verts);
}

function setLineObjectStyle(lineObject, color, width, depthTest = false) {
    if (!lineObject?.material) return;
    if (lineObject.material.color) {
        lineObject.material.color.setHex(color);
    }
    lineObject.material.depthTest = depthTest;
    if (lineObject.material.isLineMaterial) {
        if (Number.isFinite(width)) {
            lineObject.material.linewidth = width;
        }
        const { renderer } = space.internals();
        const w = renderer?.domElement?.clientWidth || renderer?.domElement?.width || 1;
        const h = renderer?.domElement?.clientHeight || renderer?.domElement?.height || 1;
        lineObject.material.resolution?.set?.(w, h);
    }
}

function applyPreviewLine(rec, mode, editing, colors) {
    if (!rec.previewLine) return;
    const preview = rec.interaction?.previewLine;
    const forceHover = !!preview?.forceHover;
    if (!(editing || forceHover) || !preview?.a || !preview?.b) {
        rec.previewLine.visible = false;
        return;
    }
    const a = { x: preview.a.x || 0, y: preview.a.y || 0, z: 0 };
    const b = { x: preview.b.x || 0, y: preview.b.y || 0, z: 0 };
    setLineObjectPoints(rec.previewLine, [a, b]);
    const useHover = !!preview.forceHover;
    const projected = !!preview.projected;
    const lineColor = projected
        ? (colors.linesProjectedFace || 0x5a9fd4)
        : (useHover ? colors.linesHover : (mode === 'edit' ? colors.linesEdit : colors.linesHover));
    setLineObjectStyle(rec.previewLine, lineColor, colors.lineWidths?.hover || 3.0, false);
    rec.previewLine.visible = true;
    rec.previewLine.renderOrder = 60;
}

function applyPreviewExternalWorld(rec, mode, editing, colors) {
    const line = rec.previewExternalWorldLine;
    const segments = rec.previewExternalWorldSegments;
    const point = rec.previewExternalWorldPoint;
    const srcLine = rec.interaction?.previewExternalWorldLine;
    const srcSegments = rec.interaction?.previewExternalWorldSegments;
    const srcPoint = rec.interaction?.previewExternalWorldPoint;
    const forceHover = !!(srcLine?.forceHover || srcPoint?.forceHover || (Array.isArray(srcSegments) && srcSegments.length));
    if (!(editing || forceHover)) {
        if (line) line.visible = false;
        if (segments) segments.visible = false;
        if (point) point.visible = false;
        return;
    }
    if (line && srcLine?.a && srcLine?.b) {
        const a = new THREE.Vector3(srcLine.a.x || 0, srcLine.a.y || 0, srcLine.a.z || 0);
        const b = new THREE.Vector3(srcLine.b.x || 0, srcLine.b.y || 0, srcLine.b.z || 0);
        // srcLine points are scene/world-space; convert into this line's parent-local space.
        if (line.parent?.worldToLocal) {
            line.parent.updateMatrixWorld?.(true);
            line.parent.worldToLocal(a);
            line.parent.worldToLocal(b);
        }
        setLineObjectPoints(line, [a, b]);
        setLineObjectStyle(line, colors.linesHover || 0xff9933, colors.lineWidths?.hover || 3.0, false);
        line.visible = true;
        line.renderOrder = 60;
    } else if (line) {
        line.visible = false;
    }
    if (segments && Array.isArray(srcSegments) && srcSegments.length) {
        const verts = [];
        const parent = segments.parent || null;
        if (parent?.worldToLocal) parent.updateMatrixWorld?.(true);
        for (const seg of srcSegments) {
            const sa = seg?.a;
            const sb = seg?.b;
            if (!sa || !sb) continue;
            const a = new THREE.Vector3(sa.x || 0, sa.y || 0, sa.z || 0);
            const b = new THREE.Vector3(sb.x || 0, sb.y || 0, sb.z || 0);
            if (parent?.worldToLocal) {
                parent.worldToLocal(a);
                parent.worldToLocal(b);
            }
            verts.push(a.x, a.y, a.z);
            verts.push(b.x, b.y, b.z);
        }
        if (segments.material?.isLineMaterial && segments.geometry?.setPositions) {
            // Debug mode: disable LineSegments2 geometry reuse to isolate stateful buffer issues.
            const NextGeometry = segments.geometry?.constructor;
            const next = NextGeometry ? new NextGeometry() : null;
            if (next?.setPositions) {
                segments.geometry?.dispose?.();
                segments.geometry = next;
            }
            segments.geometry.setPositions(verts);
            segments.computeLineDistances?.();
            segments.geometry.computeBoundingSphere?.();
        } else {
            segments.geometry?.dispose?.();
            segments.geometry = new THREE.BufferGeometry();
            segments.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        }
        setLineObjectStyle(segments, colors.linesHover || 0xff9933, colors.lineWidths?.hover || 3.0, false);
        segments.visible = true;
        segments.renderOrder = 60;
    } else if (segments) {
        segments.visible = false;
    }
    if (point && srcPoint) {
        const p = new THREE.Vector3(srcPoint.x || 0, srcPoint.y || 0, srcPoint.z || 0);
        // srcPoint is scene/world-space; convert into marker parent-local space.
        if (point.parent?.worldToLocal) {
            point.parent.updateMatrixWorld?.(true);
            point.parent.worldToLocal(p);
        }
        point.position.copy(p);
        const parts = point.userData?._markerParts || {};
        if (parts.core?.material?.color) parts.core.material.color.setHex(colors.pointsDerivedActual || 0x39d7ff);
        if (parts.core?.material) parts.core.material.depthTest = false;
        if (parts.ringWhite?.material?.color) parts.ringWhite.material.color.setHex(0xffffff);
        if (parts.ringWhite?.material) parts.ringWhite.material.depthTest = false;
        if (parts.ringOuter?.material) parts.ringOuter.material.depthTest = false;
        if (parts.ringInner?.material) parts.ringInner.material.depthTest = false;
        if (parts.ringHighlight) parts.ringHighlight.visible = false;
        point.visible = true;
        point.renderOrder = 60;
    } else if (point) {
        point.visible = false;
    }
}

function applyPreviewFaceSegments(rec, mode, editing, colors) {
    if (!rec.previewFaceSegments) return;
    const segs = rec.interaction?.previewFaceSegments || null;
    if (!editing || !Array.isArray(segs) || !segs.length) {
        rec.previewFaceSegments.visible = false;
        return;
    }
    const verts = [];
    for (const seg of segs) {
        const a = seg?.a;
        const b = seg?.b;
        if (!a || !b) continue;
        verts.push(a.x || 0, a.y || 0, 0.002);
        verts.push(b.x || 0, b.y || 0, 0.002);
    }
    if (!verts.length) {
        rec.previewFaceSegments.visible = false;
        return;
    }
    if (rec.previewFaceSegments.material?.isLineMaterial && rec.previewFaceSegments.geometry?.setPositions) {
        // Debug mode: disable LineSegments2 geometry reuse to isolate stateful buffer issues.
        const NextGeometry = rec.previewFaceSegments.geometry?.constructor;
        const next = NextGeometry ? new NextGeometry() : null;
        if (next?.setPositions) {
            rec.previewFaceSegments.geometry?.dispose?.();
            rec.previewFaceSegments.geometry = next;
        }
        rec.previewFaceSegments.geometry.setPositions(verts);
        rec.previewFaceSegments.computeLineDistances?.();
        rec.previewFaceSegments.geometry.computeBoundingSphere?.();
    } else {
        rec.previewFaceSegments.geometry?.dispose?.();
        rec.previewFaceSegments.geometry = new THREE.BufferGeometry();
        rec.previewFaceSegments.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    }
    setLineObjectStyle(
        rec.previewFaceSegments,
        colors.linesProjectedFace || 0x5a9fd4,
        colors.lineWidths?.hover || 3.0,
        false
    );
    rec.previewFaceSegments.renderOrder = 55;
    rec.previewFaceSegments.visible = true;
}

function applyPreviewStart(rec, mode, editing, colors) {
    if (!rec.previewStart) return;
    const start = rec.interaction?.previewStart;
    const forceHover = !!rec.interaction?.previewLine?.forceHover;
    if (!(editing || forceHover) || !start) {
        rec.previewStart.visible = false;
        return;
    }
    rec.previewStart.position.set(start.x || 0, start.y || 0, 0);
    const projected = !!start?.projected;
    const parts = rec.previewStart.userData?._markerParts || {};
    if (parts.core?.material?.color) {
        parts.core.material.color.setHex(colors.pointsGray);
        parts.core.material.depthTest = false;
    }
    if (parts.ringHighlight) {
        parts.ringHighlight.visible = true;
        if (parts.ringHighlight.color) {
            parts.ringHighlight.color.setHex(projected ? (colors.linesProjectedFace || 0x5a9fd4) : (colors.linesHover || 0xff9933));
        }
        if (parts.ringHighlight.material) {
            parts.ringHighlight.material.depthTest = false;
        }
    }
    if (parts.ringOuter?.material) {
        parts.ringOuter.material.depthTest = false;
    }
    if (parts.ringInner?.material) {
        parts.ringInner.material.depthTest = false;
    }
    rec.previewStart.renderOrder = 60;
    rec.previewStart.visible = true;
}

function applyPreviewEnd(rec, mode, editing, colors) {
    if (!rec.previewEnd) return;
    const end = rec.interaction?.previewEnd;
    const forceHover = !!rec.interaction?.previewLine?.forceHover;
    if (!(editing || forceHover) || !end) {
        rec.previewEnd.visible = false;
        return;
    }
    rec.previewEnd.position.set(end.x || 0, end.y || 0, 0);
    const parts = rec.previewEnd.userData?._markerParts || {};
    if (parts.core?.material?.color) {
        parts.core.material.color.setHex(colors.pointsGray);
        parts.core.material.depthTest = false;
    }
    if (parts.ringHighlight) {
        parts.ringHighlight.visible = true;
        if (parts.ringHighlight.color) {
            parts.ringHighlight.color.setHex(colors.linesHover || 0xff9933);
        }
        if (parts.ringHighlight.material) {
            parts.ringHighlight.material.depthTest = false;
        }
    }
    if (parts.ringOuter?.material) {
        parts.ringOuter.material.depthTest = false;
    }
    if (parts.ringInner?.material) {
        parts.ringInner.material.depthTest = false;
    }
    rec.previewEnd.renderOrder = 60;
    rec.previewEnd.visible = true;
}

function applyPreviewArc(rec, mode, editing, colors) {
    if (!rec.previewArc) return;
    const preview = rec.interaction?.previewArc;
    const forceHover = !!rec.interaction?.previewLine?.forceHover;
    if (!(editing || forceHover) || !preview) {
        rec.previewArc.visible = false;
        if (rec.previewArcCenter) {
            rec.previewArcCenter.visible = false;
        }
        return;
    }
    if (preview.mode === 'chord' && preview.a && preview.b) {
        const a = { x: preview.a.x || 0, y: preview.a.y || 0, z: 0 };
        const b = { x: preview.b.x || 0, y: preview.b.y || 0, z: 0 };
        setLineObjectPoints(rec.previewArc, [a, b]);
        setLineObjectStyle(rec.previewArc, mode === 'edit' ? colors.linesEdit : colors.linesHover, colors.lineWidths?.hover || 3.0, false);
        rec.previewArc.visible = true;
        if (rec.previewArcCenter) {
            rec.previewArcCenter.visible = false;
        }
        return;
    }
    if ((preview.mode === 'arc' || preview.mode === 'circle') && Number.isFinite(preview.cx) && Number.isFinite(preview.cy)) {
        const pts = this.getArcRenderPoints(preview, preview.a, preview.b, this.getArcSegmentsFor?.(preview, preview.a, preview.b, 'preview') || 48);
        if (pts.length >= 2) {
            setLineObjectPoints(rec.previewArc, pts.map(p => ({ x: p.x || 0, y: p.y || 0, z: 0 })));
            setLineObjectStyle(rec.previewArc, mode === 'edit' ? colors.linesEdit : colors.linesHover, colors.lineWidths?.hover || 3.0, false);
            rec.previewArc.visible = true;
            rec.previewArc.renderOrder = 60;
            if (rec.previewArcCenter) {
                rec.previewArcCenter.position.set(preview.cx || 0, preview.cy || 0, 0);
                const parts = rec.previewArcCenter.userData?._markerParts || {};
                if (parts.ringHighlight) {
                    parts.ringHighlight.visible = true;
                    if (parts.ringHighlight.material) {
                        parts.ringHighlight.material.depthTest = false;
                    }
                }
                if (parts.core?.material) parts.core.material.depthTest = false;
                if (parts.ringOuter?.material) parts.ringOuter.material.depthTest = false;
                if (parts.ringInner?.material) parts.ringInner.material.depthTest = false;
                rec.previewArcCenter.renderOrder = 60;
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
        { x: corners[0].x || 0, y: corners[0].y || 0, z: 0 },
        { x: corners[1].x || 0, y: corners[1].y || 0, z: 0 },
        { x: corners[2].x || 0, y: corners[2].y || 0, z: 0 },
        { x: corners[3].x || 0, y: corners[3].y || 0, z: 0 },
        { x: corners[0].x || 0, y: corners[0].y || 0, z: 0 }
    ];
    setLineObjectPoints(rec.previewRect, pts);
    setLineObjectStyle(rec.previewRect, mode === 'edit' ? colors.linesEdit : colors.linesHover, colors.lineWidths?.hover || 3.0, false);
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
        if (object?.userData?._shaderPoint) {
            return;
        }
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
        const syncLineRes = line => {
            if (!line?.material?.isLineMaterial) return;
            const { renderer: r } = space.internals();
            const w = r?.domElement?.clientWidth || r?.domElement?.width || 1;
            const h = r?.domElement?.clientHeight || r?.domElement?.height || 1;
            line.material.resolution?.set?.(w, h);
        };
        for (const view of rec.entityViews.values()) {
            if ((view.type === 'line' || view.type === 'arc') && view.object?.material?.isLineMaterial) {
                const { renderer: r } = space.internals();
                const w = r?.domElement?.clientWidth || r?.domElement?.width || 1;
                const h = r?.domElement?.clientHeight || r?.domElement?.height || 1;
                view.object.material.resolution?.set?.(w, h);
            }
            if ((view.type !== 'point' && view.type !== 'arc-center') || !view.object) continue;
            updateScale(view.object);
        }
        syncLineRes(rec.previewLine);
        syncLineRes(rec.previewArc);
        syncLineRes(rec.previewRect);
        syncLineRes(rec.previewFaceSegments);
        syncLineRes(rec.previewExternalWorldLine);
        syncLineRes(rec.previewExternalWorldSegments);
        if (rec.previewStart) updateScale(rec.previewStart);
        if (rec.previewEnd) updateScale(rec.previewEnd);
        if (rec.previewArcCenter) updateScale(rec.previewArcCenter);
        if (rec.previewExternalWorldPoint) updateScale(rec.previewExternalWorldPoint);
    }
}

function getConstraintAnchorLocal(feature, constraint) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.map(e => [e?.id, e]));
    const rawRefs = Array.isArray(constraint?.refs) ? constraint.refs : [];
    const displayRefs = Array.isArray(constraint?.ui?.display_refs) ? constraint.ui.display_refs : [];
    const refs = displayRefs.length ? displayRefs : rawRefs;
    const lineTypes = new Set(['horizontal', 'vertical', 'horizontal_points', 'vertical_points', 'tangent', 'equal', 'collinear', 'dimension', 'min_distance', 'max_distance', 'arc_center_on_line', 'arc_center_on_arc', 'mirror_line']);
    const pointLike = ref => {
        if (!ref) return null;
        if (ref === '__sketch-origin__') return { x: 0, y: 0 };
        if (typeof ref === 'string' && ref.startsWith('arc-center:')) {
            const arcId = ref.substring('arc-center:'.length);
            const ent = byId.get(arcId);
            if (!ent || ent.type !== 'arc') return null;
            const aId = typeof ent?.a === 'string' ? ent.a : (typeof ent?.p1_id === 'string' ? ent.p1_id : null);
            const bId = typeof ent?.b === 'string' ? ent.b : (typeof ent?.p2_id === 'string' ? ent.p2_id : null);
            const a = byId.get(aId);
            const b = byId.get(bId);
            if (a?.type !== 'point' || b?.type !== 'point') return null;
            return computeArcCenterForUi(ent, a, b);
        }
        const p = byId.get(ref);
        if (p?.type === 'point') return { x: p.x || 0, y: p.y || 0 };
        return null;
    };

    if (constraint?.type === 'circular_pattern') {
        const centerRef = typeof constraint?.data?.centerRef === 'string'
            ? constraint.data.centerRef
            : refs[0];
        const center = pointLike(centerRef);
        if (center) return center;
    }
    if (constraint?.type === 'grid_pattern') {
        const centerRef = typeof constraint?.data?.centerPointId === 'string'
            ? constraint.data.centerPointId
            : refs[0];
        const center = pointLike(centerRef);
        if (center) return center;
    }

    if (constraint?.type === 'mirror_line') {
        const src = byId.get(refs[1]);
        const dst = byId.get(refs[2]);
        const lineMid = line => {
            if (line?.type !== 'line') return null;
            const [a, b] = this.getLineEndpoints(line, byId);
            if (!a || !b) return null;
            return { x: ((a.x || 0) + (b.x || 0)) * 0.5, y: ((a.y || 0) + (b.y || 0)) * 0.5 };
        };
        const a = lineMid(src);
        const b = lineMid(dst);
        if (a && b) return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
        if (a) return a;
        if (b) return b;
    }

    if (lineTypes.has(constraint?.type)) {
        if (constraint?.type === 'dimension') {
            const refs = Array.isArray(constraint?.ui?.display_refs) && constraint.ui.display_refs.length
                ? constraint.ui.display_refs
                : (Array.isArray(constraint?.refs) ? constraint.refs : []);
            if (refs.length === 1) {
                const ent = byId.get(refs[0]);
                if (ent?.type === 'arc') {
                    const aId = typeof ent?.a === 'string' ? ent.a : (typeof ent?.p1_id === 'string' ? ent.p1_id : null);
                    const bId = typeof ent?.b === 'string' ? ent.b : (typeof ent?.p2_id === 'string' ? ent.p2_id : null);
                    const a = byId.get(aId);
                    const b = byId.get(bId);
                    if (a?.type === 'point' && b?.type === 'point') {
                        const center = computeArcCenterForUi(ent, a, b);
                        if (center) {
                            return { x: (center.x + (a.x || 0)) * 0.5, y: (center.y + (a.y || 0)) * 0.5 };
                        }
                    }
                }
            }
        }
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
        if (constraint?.type === 'arc_center_on_arc') {
            const arcRefs = refs.map(id => byId.get(id)).filter(e => e?.type === 'arc');
            if (arcRefs.length >= 2) {
                const src = arcRefs[0];
                const dst = arcRefs[1];
                const [sa, sb] = this.getArcEndpoints(src, byId);
                const [da, db] = this.getArcEndpoints(dst, byId);
                const sc = this.getArcCenterLocal(src, sa, sb);
                const dc = this.getArcCenterLocal(dst, da, db);
                if (sc && dc) {
                    return { x: (sc.x + dc.x) * 0.5, y: (sc.y + dc.y) * 0.5 };
                }
                if (sc) return sc;
                if (dc) return dc;
            }
        }
    }

    if (constraint?.type === 'mirror_arc') {
        const arc = refs.map(id => byId.get(id)).find(e => e?.type === 'arc');
        if (arc) {
            const aId = typeof arc?.a === 'string' ? arc.a : (typeof arc?.p1_id === 'string' ? arc.p1_id : null);
            const bId = typeof arc?.b === 'string' ? arc.b : (typeof arc?.p2_id === 'string' ? arc.p2_id : null);
            const a = byId.get(aId);
            const b = byId.get(bId);
            if (a?.type === 'point' && b?.type === 'point') {
                const center = computeArcCenterForUi(arc, a, b);
                if (center) return center;
            }
        }
    }

    const points = refs.map(id => byId.get(id)).filter(e => e?.type === 'point');
    if (constraint?.type === 'horizontal_points' || constraint?.type === 'vertical_points') {
        const p1 = pointLike(refs[0]);
        const p2 = pointLike(refs[1]);
        if (p1 && p2) {
            return {
                x: ((p1.x || 0) + (p2.x || 0)) * 0.5,
                y: ((p1.y || 0) + (p2.y || 0)) * 0.5
            };
        }
    }
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
    if (constraint?.type === 'arc_center_fixed_origin') {
        return { x: 0, y: 0 };
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
    const entities = Array.isArray(rec.feature.entities) ? rec.feature.entities : [];
    const entityById = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
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
        const visRefs = Array.isArray(constraint?.ui?.display_refs) && constraint.ui.display_refs.length
            ? constraint.ui.display_refs
            : refs;
        let byEntity = visRefs.some(ref => selectedEntityIds.has(ref));
        let byHover = !!hoveredEntityId && visRefs.includes(hoveredEntityId);
        if (constraint?.type === 'arc_center_coincident' && refs.length >= 2) {
            const arcId = visRefs[0];
            const pointId = visRefs[1];
            const arcCenterKey = typeof arcId === 'string' ? `arc-center:${arcId}` : null;
            byEntity = !!(
                (pointId && selectedEntityIds.has(pointId)) ||
                (arcCenterKey && selectedEntityIds.has(arcCenterKey))
            );
            byHover = !!(
                (pointId && hoveredEntityId === pointId) ||
                (arcCenterKey && hoveredEntityId === arcCenterKey)
            );
        }
        if (constraint?.type === 'arc_center_on_line' && refs.length >= 2) {
            const arcId = visRefs.find(ref => entityById.get(ref)?.type === 'arc') || null;
            const arcCenterKey = typeof arcId === 'string' ? `arc-center:${arcId}` : null;
            byEntity = !!(
                (arcCenterKey && selectedEntityIds.has(arcCenterKey)) ||
                visRefs.some(ref => selectedEntityIds.has(ref))
            );
            byHover = !!(
                (arcCenterKey && hoveredEntityId === arcCenterKey) ||
                visRefs.includes(hoveredEntityId)
            );
        }
        if (constraint?.type === 'arc_center_on_arc' && refs.length >= 2) {
            const arcIds = visRefs.filter(ref => entityById.get(ref)?.type === 'arc');
            const sourceArcId = arcIds[0] || null;
            const sourceCenterKey = typeof sourceArcId === 'string' ? `arc-center:${sourceArcId}` : null;
            byEntity = !!(
                (sourceCenterKey && selectedEntityIds.has(sourceCenterKey)) ||
                arcIds.some(ref => selectedEntityIds.has(ref))
            );
            byHover = !!(
                (sourceCenterKey && hoveredEntityId === sourceCenterKey) ||
                arcIds.includes(hoveredEntityId)
            );
        }
        if (constraint?.type === 'arc_center_fixed_origin' && refs.length >= 1) {
            const arcId = visRefs[0];
            const arcCenterKey = typeof arcId === 'string' ? `arc-center:${arcId}` : null;
            byEntity = !!(
                (arcCenterKey && selectedEntityIds.has(arcCenterKey))
            );
            byHover = !!(
                (arcCenterKey && hoveredEntityId === arcCenterKey)
            );
        }
        const byDrag = draggingConstraintId === constraint?.id;
        const alwaysVisible = constraint?.type === 'dimension' || constraint?.type === 'circular_pattern' || constraint?.type === 'grid_pattern';
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
            if (c?.type === 'grid_pattern') {
                const feature = rec.feature;
                const entities = Array.isArray(feature?.entities) ? feature.entities : [];
                const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
                const centerId = c?.data?.centerPointId;
                const center = byId.get(centerId);
                const mkEndpoint = lineId => {
                    const line = byId.get(lineId);
                    if (!line || line.type !== 'line' || !center) return null;
                    const a = byId.get(line.a);
                    const b = byId.get(line.b);
                    if (!a || !b) return null;
                    return line.a === centerId ? b : line.b === centerId ? a : b;
                };
                const hEnd = mkEndpoint(c?.data?.uLineId) || center || null;
                const vEnd = mkEndpoint(c?.data?.vLineId) || center || null;
                const hPos = hEnd ? this.projectConstraintAnchor(rec, { x: hEnd.x || 0, y: hEnd.y || 0 }, getApi) : null;
                const vPos = vEnd ? this.projectConstraintAnchor(rec, { x: vEnd.x || 0, y: vEnd.y || 0 }, getApi) : null;
                const entries = [
                    { axis: 'h', label: `H${Math.max(1, Number(c?.data?.countH || 0) || 3)}`, pos: hPos || screen },
                    { axis: 'v', label: `V${Math.max(1, Number(c?.data?.countV || 0) || 3)}`, pos: vPos || screen }
                ];
                for (const ent of entries) {
                    const glyph = document.createElement('button');
                    glyph.className = 'sketch-constraint-glyph';
                    glyph.textContent = ent.label;
                    glyph.style.left = `${Math.round(ent.pos.x)}px`;
                    glyph.style.top = `${Math.round(ent.pos.y)}px`;
                    if (selectedConstraintIds.has(c.id)) glyph.classList.add('selected');
                    else if (hoveredConstraintId === c.id) glyph.classList.add('hover');
                    glyph.title = `${ent.axis === 'h' ? 'horizontal' : 'vertical'} copies - double-click edit`;
                    glyph.ondblclick = event => {
                        event.preventDefault();
                        event.stopPropagation();
                        const api = getApi();
                        api.interact?.editSketchGridPatternConstraint?.(c.id, ent.axis);
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
                        api.interact?.selectSketchConstraint?.(c.id, event);
                    };
                    layer.appendChild(glyph);
                }
                continue;
            }
            const isDimension = c?.type === 'dimension';
            let pos;
            if (isDimension) {
                const centerLocal = getDimensionCenterLocal.call(this, rec, rec.feature, c, this._glyphDrag);
                const centerScreen = centerLocal ? this.projectConstraintAnchor(rec, centerLocal, getApi) : null;
                pos = centerScreen || this.applyConstraintOffset(c, screen, i, items.length, opts);
            } else {
                if (this._glyphDrag && this._glyphDrag.constraintId === c?.id && !this._glyphDrag.isDimension) {
                    const size = opts.glyphSizePx || 18;
                    const gap = opts.glyphGapPx || 4;
                    const rowWidth = items.length * size + Math.max(0, items.length - 1) * gap;
                    const slotX = -rowWidth / 2 + (i + 0.5) * size + i * gap;
                    const dragBase = this._glyphDrag.current || this._glyphDrag.base || { x: 0, y: -18 };
                    pos = {
                        x: screen.x + (dragBase.x || 0) + slotX,
                        y: screen.y + (dragBase.y || 0)
                    };
                } else {
                    pos = this.applyConstraintOffset(c, screen, i, items.length, opts);
                }
            }
            const glyph = document.createElement('button');
            glyph.className = 'sketch-constraint-glyph';
            const measured = isDimension ? computeDimensionMeasurement(rec.feature, c) : NaN;
            const mode = isDimension ? getDimensionMode(c) : 'driving';
            const isArcDim = isDimension ? isArcDimensionConstraint(rec.feature, c) : false;
            glyph.textContent = c?.type === 'circular_pattern'
                ? String(Math.max(2, Number(c?.data?.count || 0) || 3))
                : (isDimension
                ? (mode === 'driven' ? formatMeasuredValue(measured) : formatDimensionLabel(c))
                : this.constraintGlyphLabel(c.type));
            glyph.style.left = `${Math.round(pos.x)}px`;
            glyph.style.top = `${Math.round(pos.y)}px`;
            if (c?.type === 'circular_pattern') {
                const leader = document.createElement('div');
                leader.className = 'sketch-constraint-leader';
                const dx = (pos.x || 0) - (screen.x || 0);
                const dy = (pos.y || 0) - (screen.y || 0);
                const len = Math.hypot(dx, dy);
                const trim = 10;
                if (len > trim + 1) {
                    leader.style.left = `${Math.round(screen.x)}px`;
                    leader.style.top = `${Math.round(screen.y)}px`;
                    leader.style.width = `${Math.round(Math.max(0, len - trim))}px`;
                    leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
                    layer.appendChild(leader);
                }
            }
            if (isDimension) {
                glyph.classList.add('dimension');
                glyph.classList.toggle('driven', mode === 'driven');
                glyph.classList.toggle('driving', mode === 'driving');
                glyph.classList.toggle('radius', !!isArcDim);
                glyph.dataset.mode = mode === 'driven' ? 'R' : 'D';
                const ends = getDimensionEndpoints(rec.feature, c);
                if (ends) {
                    const centerLocal = getDimensionCenterLocal.call(this, rec, rec.feature, c, this._glyphDrag);
                    addDimensionDecoration3D(rec, c, ends[0], ends[1], {
                        selected: selectedConstraintIds.has(c.id),
                        hovered: hoveredConstraintId === c.id,
                        centerLocal,
                        colors: opts?.colors || null
                    });
                }
            }
            if (selectedConstraintIds.has(c.id)) {
                glyph.classList.add('selected');
            } else if (hoveredConstraintId === c.id) {
                glyph.classList.add('hover');
            }
            glyph.title = isDimension
                ? `${isArcDim ? 'diameter ' : ''}dimension (${mode}) - double-click edit, alt-click toggle driving/reference`
                : (c?.type === 'circular_pattern'
                    ? 'circular pattern - double-click edit copy count'
                    : (c.type || 'constraint'));
            glyph.ondblclick = event => {
                if (c?.type === 'circular_pattern') {
                    event.preventDefault();
                    event.stopPropagation();
                    this._glyphDrag = null;
                    const api = getApi();
                    api.interact?.editSketchCircularPatternConstraint?.(c.id);
                    return;
                }
                if (!isDimension || mode !== 'driving') return;
                event.preventDefault();
                event.stopPropagation();
                this._glyphDrag = null;
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
                if (c?.type === 'circular_pattern') {
                    const now = performance.now();
                    const prev = this._glyphClick;
                    if (prev && prev.id === c.id && (now - prev.time) < 360) {
                        this._glyphClick = null;
                        this._glyphDrag = null;
                        api.interact?.editSketchCircularPatternConstraint?.(c.id);
                        return;
                    }
                    this._glyphClick = { id: c.id, time: now };
                }
                if (isDimension) {
                    const now = performance.now();
                    const prev = this._glyphClick;
                    if (mode === 'driving' && prev && prev.id === c.id && (now - prev.time) < 360) {
                        this._glyphClick = null;
                        this._glyphDrag = null;
                        api.interact?.editSketchDimensionConstraint?.(c.id);
                        return;
                    }
                    this._glyphClick = { id: c.id, time: now };
                } else if (c?.type !== 'circular_pattern') {
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
    applyPreviewFaceSegments,
    applyPreviewExternalWorld,
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
