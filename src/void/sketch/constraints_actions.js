/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../api.js';
import { space } from '../../moto/space.js';
import { enforceSketchConstraintsInPlace } from './constraints.js';
import * as sketchCreate from './create.js';
import { SKETCH_VIRTUAL_ORIGIN_ID } from './constants.js';

function getConstraintMode(constraint) {
    const mode = constraint?.data?.mode;
    return mode === 'driven' ? 'driven' : 'driving';
}

function buildPatternCloneToSourceMap(feature) {
    const map = new Map();
    const constraints = Array.isArray(feature?.constraints) ? feature.constraints : [];
    for (const c of constraints) {
        if (c?.type !== 'circular_pattern' && c?.type !== 'grid_pattern') continue;
        const data = c?.data || {};
        const sourceIds = Array.isArray(data?.sourceIds) ? data.sourceIds.filter(id => typeof id === 'string' && id) : [];
        const copies = Array.isArray(data?.copies) ? data.copies : [];
        const pointMaps = Array.isArray(data?.pointMaps) ? data.pointMaps : [];
        for (const copyRec of copies) {
            const ids = Array.isArray(copyRec)
                ? copyRec
                : (Array.isArray(copyRec?.ids) ? copyRec.ids : []);
            for (let i = 0; i < sourceIds.length; i++) {
                const srcId = sourceIds[i];
                const dstId = ids[i];
                if (typeof srcId === 'string' && srcId && typeof dstId === 'string' && dstId) {
                    map.set(dstId, srcId);
                }
            }
        }
        for (const pointRec of pointMaps) {
            const pairs = Array.isArray(pointRec)
                ? pointRec
                : (Array.isArray(pointRec?.pairs) ? pointRec.pairs : []);
            for (const pair of pairs) {
                if (!Array.isArray(pair) || pair.length < 2) continue;
                const srcId = pair[0];
                const dstId = pair[1];
                if (typeof srcId === 'string' && srcId && typeof dstId === 'string' && dstId) {
                    map.set(dstId, srcId);
                }
            }
        }
    }
    return map;
}

function mapPatternRefToSource(ref, cloneToSource) {
    if (ref === SKETCH_VIRTUAL_ORIGIN_ID) return ref;
    if (typeof ref !== 'string' || !ref) return ref;
    if (ref.startsWith('arc-center:')) {
        const arcId = ref.substring('arc-center:'.length);
        const srcArcId = cloneToSource.get(arcId) || arcId;
        return `arc-center:${srcArcId}`;
    }
    return cloneToSource.get(ref) || ref;
}

function applyConstraintDisplayRefs(constraint, displayRefs = null) {
    if (!constraint) return;
    const refs = Array.isArray(displayRefs) ? displayRefs.filter(Boolean) : [];
    if (!refs.length) return;
    constraint.ui = constraint.ui || {};
    constraint.ui.display_refs = refs;
}

function clearSketchTransientInputState(ctx) {
    if (!ctx) return;
    ctx.sketchPointerDown = null;
    ctx.sketchDrag = null;
    if (api?.sketchRuntime) {
        api.sketchRuntime._glyphDrag = null;
    }
    // Native prompt can swallow pointer-up events; flush camera/input controls
    // so trackball/orbit state cannot remain latched into drag mode.
    try {
        const ctrl = space?.view?.ctrl;
        ctrl?.onMouseUp?.({ button: 0 });
        ctrl?.resetInputState?.();
        const doc = self.document;
        const evtInit = { bubbles: true, cancelable: true, button: 0, buttons: 0, clientX: 0, clientY: 0 };
        doc?.dispatchEvent?.(new MouseEvent('mouseup', evtInit));
        if (typeof PointerEvent !== 'undefined') {
            doc?.dispatchEvent?.(new PointerEvent('pointerup', evtInit));
        }
    } catch (e) {
        // no-op
    }
    space?.update?.();
}

function getLineEndpointIds(line) {
    if (!line) return [null, null];
    const aId = typeof line?.a === 'string' ? line.a : (typeof line?.p1_id === 'string' ? line.p1_id : null);
    const bId = typeof line?.b === 'string' ? line.b : (typeof line?.p2_id === 'string' ? line.p2_id : null);
    return [aId, bId];
}

function getArcEndpoints(arc) {
    if (!arc) return [null, null];
    const aId = typeof arc?.a === 'string' ? arc.a : (typeof arc?.p1_id === 'string' ? arc.p1_id : null);
    const bId = typeof arc?.b === 'string' ? arc.b : (typeof arc?.p2_id === 'string' ? arc.p2_id : null);
    return [aId, bId];
}

function resolvePointLike(byId, ref) {
    if (!ref) return null;
    if (ref === SKETCH_VIRTUAL_ORIGIN_ID) {
        return { x: 0, y: 0 };
    }
    if (typeof ref === 'string' && ref.startsWith('arc-center:')) {
        const arcId = ref.substring('arc-center:'.length);
        const arc = byId.get(arcId);
        if (arc?.type !== 'arc') return null;
        const cx = Number(arc?.cx);
        const cy = Number(arc?.cy);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
            return { x: cx, y: cy };
        }
        const [aId, bId] = getArcEndpoints(arc);
        const a = byId.get(aId);
        const b = byId.get(bId);
        if (!a || !b) return null;
        const mx = Number(arc?.mx);
        const my = Number(arc?.my);
        if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
        const x1 = a.x || 0; const y1 = a.y || 0;
        const x2 = b.x || 0; const y2 = b.y || 0;
        const x3 = mx; const y3 = my;
        const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
        if (Math.abs(d) < 1e-8) return null;
        const x1sq = x1 * x1 + y1 * y1;
        const x2sq = x2 * x2 + y2 * y2;
        const x3sq = x3 * x3 + y3 * y3;
        const cx2 = (x1sq * (y2 - y3) + x2sq * (y3 - y1) + x3sq * (y1 - y2)) / d;
        const cy2 = (x1sq * (x3 - x2) + x2sq * (x1 - x3) + x3sq * (x2 - x1)) / d;
        if (!Number.isFinite(cx2) || !Number.isFinite(cy2)) return null;
        return { x: cx2, y: cy2 };
    }
    const point = byId.get(ref);
    if (point?.type === 'point') {
        return { x: point.x || 0, y: point.y || 0 };
    }
    return null;
}

function measureDimensionValue(entities, refs = []) {
    const byId = new Map((entities || []).map(e => [e?.id, e]));
    if (refs.length === 1) {
        const ent = byId.get(refs[0]);
        if (ent?.type === 'line') {
            const [aId, bId] = getLineEndpointIds(ent);
            const a = byId.get(aId);
            const b = byId.get(bId);
            if (a?.type !== 'point' || b?.type !== 'point') return NaN;
            return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
        }
        if (ent?.type === 'arc') {
            const center = resolvePointLike(byId, `arc-center:${ent.id}`);
            if (!center) return NaN;
            const [aId] = getArcEndpoints(ent);
            const a = byId.get(aId);
            if (a?.type !== 'point') return NaN;
            return Math.hypot((a.x || 0) - center.x, (a.y || 0) - center.y) * 2;
        }
        return NaN;
    }
    if (refs.length >= 2) {
        const a = resolvePointLike(byId, refs[0]);
        const b = resolvePointLike(byId, refs[1]);
        if (!a || !b) return NaN;
        return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0));
    }
    return NaN;
}

function deleteSelectedSketchConstraints() {
    const feature = this.getEditingSketchFeature();
    if (!feature || !this.selectedSketchConstraints?.size) {
        return false;
    }
    const removeIds = new Set(this.selectedSketchConstraints);
    let removed = 0;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const keep = [];
        for (const c of sketch.constraints) {
            if (c?.id && removeIds.has(c.id)) {
                removed++;
            } else {
                keep.push(c);
            }
        }
        sketch.constraints = keep;
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'constraints.remove', ids: Array.from(removeIds) }
    });
    if (!removed) {
        return false;
    }
    this.selectedSketchConstraints.clear();
    this.hoveredSketchConstraintId = null;
    this.updateSketchInteractionVisuals();
    return true;
}

function deleteSelectedSketchEntities() {
    const feature = this.getEditingSketchFeature();
    if (!feature || !this.selectedSketchEntities.size) {
        return false;
    }

    const removeIds = new Set(this.selectedSketchEntities);
    let removed = 0;
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];

        const endpointCandidates = new Set();
        for (const entity of sketch.entities) {
            if (!removeIds.has(entity?.id)) continue;
            if (entity?.type !== 'line' && entity?.type !== 'arc') continue;
            if (typeof entity.a === 'string') endpointCandidates.add(entity.a);
            if (typeof entity.b === 'string') endpointCandidates.add(entity.b);
            if (entity?.type === 'arc') {
                const threePointIds = Array.isArray(entity?.data?.threePointIds) ? entity.data.threePointIds : [];
                for (const pid of threePointIds) {
                    if (typeof pid === 'string') endpointCandidates.add(pid);
                }
            }
        }
        if (endpointCandidates.size) {
            const prospectiveRemove = new Set([...removeIds, ...endpointCandidates]);
            const usedByRemainingCurve = new Set();
            for (const entity of sketch.entities) {
                if (removeIds.has(entity?.id)) continue;
                if (entity?.type !== 'line' && entity?.type !== 'arc') continue;
                if (typeof entity.a === 'string') usedByRemainingCurve.add(entity.a);
                if (typeof entity.b === 'string') usedByRemainingCurve.add(entity.b);
            }
            const usedByRemainingConstraint = new Set();
            for (const constraint of sketch.constraints) {
                const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
                if (refs.some(ref => prospectiveRemove.has(ref))) continue;
                for (const ref of refs) {
                    usedByRemainingConstraint.add(ref);
                }
            }
            for (const pointId of endpointCandidates) {
                if (usedByRemainingCurve.has(pointId)) continue;
                if (usedByRemainingConstraint.has(pointId)) continue;
                removeIds.add(pointId);
            }
        }

        const keep = [];
        for (const entity of sketch.entities) {
            if (removeIds.has(entity.id)) {
                removed++;
            } else {
                keep.push(entity);
            }
        }
        sketch.entities = keep;
        sketch.constraints = sketch.constraints.filter(constraint => {
            const refs = Array.isArray(constraint?.refs) ? constraint.refs : [];
            if (refs.some(ref => removeIds.has(ref))) return false;
            if (constraint?.type === 'circular_pattern') {
                const data = constraint?.data || {};
                for (const arr of (data?.copies || [])) {
                    const ids = Array.isArray(arr) ? arr : (Array.isArray(arr?.ids) ? arr.ids : []);
                    for (const id of ids) {
                        if (removeIds.has(id)) return false;
                    }
                }
                for (const pairs of (data?.pointMaps || [])) {
                    const recPairs = Array.isArray(pairs) ? pairs : (Array.isArray(pairs?.pairs) ? pairs.pairs : []);
                    for (const pair of recPairs) {
                        if (Array.isArray(pair) && removeIds.has(pair[1])) return false;
                    }
                }
            }
            return true;
        });
        enforceSketchConstraintsInPlace(sketch);
    }, {
        opType: 'feature.update',
        payload: { field: 'entities.remove', ids: Array.from(removeIds) }
    });

    if (!removed) {
        return false;
    }

    this.selectedSketchEntities.clear();
    this.selectedSketchArcCenters?.clear?.();
    this.hoveredSketchEntityId = null;
    this.setSketchTool('select');
    this.updateSketchInteractionVisuals();
    return true;
}

function toggleSelectedConstruction() {
    const feature = this.getEditingSketchFeature();
    if (!feature || !this.selectedSketchEntities.size) {
        return false;
    }

    const selected = (feature.entities || []).filter(entity =>
        this.selectedSketchEntities.has(entity.id) && (entity.type === 'line' || entity.type === 'arc'));
    if (!selected.length) {
        return false;
    }

    const setConstruction = selected.some(entity => !entity.construction);
    api.features.update(feature.id, sketch => {
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        for (const entity of sketch.entities) {
            if (!this.selectedSketchEntities.has(entity.id) || (entity.type !== 'line' && entity.type !== 'arc')) {
                continue;
            }
            entity.construction = setConstruction;
        }
    }, {
        opType: 'feature.update',
        payload: { field: 'construction', value: setConstruction }
    });

    this.updateSketchInteractionVisuals();
    return true;
}

function applySketchConstraint(type) {
    const feature = this.getEditingSketchFeature();
    if (!feature) {
        return false;
    }
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const cloneToSource = buildPatternCloneToSourceMap(feature);
    const selectedEntityIds = new Set(
        Array.from(this.selectedSketchEntities || [])
            .map(id => mapPatternRefToSource(id, cloneToSource))
            .filter(Boolean)
    );
    const selectedArcCenterIds = new Set(
        Array.from(this.selectedSketchArcCenters || [])
            .map(id => mapPatternRefToSource(id, cloneToSource))
            .map(ref => typeof ref === 'string' && ref.startsWith('arc-center:') ? ref.substring('arc-center:'.length) : ref)
            .filter(id => typeof id === 'string' && id)
    );
    const sourceToDisplay = new Map();
    for (const raw of Array.from(this.selectedSketchEntities || [])) {
        const mapped = mapPatternRefToSource(raw, cloneToSource);
        if (typeof mapped === 'string' && mapped && !sourceToDisplay.has(mapped)) {
            sourceToDisplay.set(mapped, raw);
        }
    }
    for (const rawArcId of Array.from(this.selectedSketchArcCenters || [])) {
        const raw = `arc-center:${rawArcId}`;
        const mapped = mapPatternRefToSource(raw, cloneToSource);
        if (typeof mapped === 'string' && mapped && !sourceToDisplay.has(mapped)) {
            sourceToDisplay.set(mapped, raw);
        }
    }
    const displayRefsFor = refs => (Array.isArray(refs) ? refs.map(ref => sourceToDisplay.get(ref) || ref) : []);
    const selected = entities.filter(entity => selectedEntityIds.has(entity.id));
    const hasOriginSelected = selectedEntityIds.has(SKETCH_VIRTUAL_ORIGIN_ID);
    const hasArcCenterSelected = selectedArcCenterIds.size > 0;
    if (!selected.length && !hasOriginSelected && !hasArcCenterSelected) {
        return false;
    }

    const lines = selected.filter(entity => entity.type === 'line');
    const arcs = selected.filter(entity => entity.type === 'arc');
    const points = selected.filter(entity => entity.type === 'point');
    const entitiesById = new Map(entities.filter(entity => entity?.id).map(entity => [entity.id, entity]));
    const arcCenters = Array.from(selectedArcCenterIds || [])
        .map(id => entitiesById.get(id))
        .filter(entity => entity?.type === 'arc');
    const pointLikeRefs = [];
    for (const point of points) pointLikeRefs.push(point.id);
    for (const arc of arcCenters) pointLikeRefs.push(`arc-center:${arc.id}`);
    if (hasOriginSelected) pointLikeRefs.push(SKETCH_VIRTUAL_ORIGIN_ID);
    const specs = [];

    if (type === 'horizontal' || type === 'vertical') {
        if (lines.length) {
            for (const line of lines) {
                specs.push({ type, refs: [line.id], displayRefs: displayRefsFor([line.id]) });
            }
        } else if (pointLikeRefs.length === 2) {
            const refs = [pointLikeRefs[0], pointLikeRefs[1]];
            specs.push({ type: `${type}_points`, refs, displayRefs: displayRefsFor(refs) });
        } else {
            return false;
        }
    } else if (type === 'perpendicular') {
        if (lines.length !== 2) {
            return false;
        }
        {
            const refs = [lines[0].id, lines[1].id];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        }
    } else if (type === 'equal') {
        if (lines.length >= 2) {
            const base = lines[0];
            for (let i = 1; i < lines.length; i++) {
                const refs = [base.id, lines[i].id];
                specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
            }
        } else if (arcs.length >= 2) {
            const base = arcs[0];
            for (let i = 1; i < arcs.length; i++) {
                const refs = [base.id, arcs[i].id];
                specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
            }
        } else {
            return false;
        }
    } else if (type === 'collinear') {
        if (lines.length !== 2) {
            return false;
        }
        {
            const refs = [lines[0].id, lines[1].id];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        }
    } else if (type === 'tangent') {
        if (lines.length === 1 && arcs.length === 1) {
            const refs = [lines[0].id, arcs[0].id];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        } else if (lines.length === 0 && arcs.length === 2) {
            const refs = [arcs[0].id, arcs[1].id];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        } else {
            return false;
        }
    } else if (type === 'midpoint') {
        if (points.length === 3) {
            const refs = [points[0].id, points[1].id, points[2].id];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        } else if (points.length === 1 && lines.length === 1) {
            const line = lines[0];
            const aId = typeof line?.a === 'string' ? line.a : (typeof line?.p1_id === 'string' ? line.p1_id : null);
            const bId = typeof line?.b === 'string' ? line.b : (typeof line?.p2_id === 'string' ? line.p2_id : null);
            if (!aId || !bId) {
                return false;
            }
            const refs = [points[0].id, aId, bId];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        } else {
            return false;
        }
    } else if (type === 'coincident') {
        if (points.length === 2) {
            const circleArc = this.findArcWithEndpoints(feature, points[0].id, points[1].id);
            if (circleArc) {
                const converted = this.convertArcToCircle(feature, circleArc.id, points[0].id, points[1].id);
                if (converted) {
                    this.clearSketchSelection?.();
                }
                return converted;
            }
            const refs = [points[0].id, points[1].id];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        } else if (points.length === 1 && lines.length === 1) {
            const refs = [points[0].id, lines[0].id];
            specs.push({ type: 'point_on_line', refs, displayRefs: displayRefsFor(refs) });
        } else if (points.length === 1 && arcs.length === 1) {
            const refs = [points[0].id, arcs[0].id];
            specs.push({ type: 'point_on_arc', refs, displayRefs: displayRefsFor(refs) });
        } else if (points.length === 1 && arcCenters.length === 1) {
            const refs = [arcCenters[0].id, points[0].id];
            specs.push({ type: 'arc_center_coincident', refs, displayRefs: displayRefsFor(refs) });
        } else if (arcCenters.length === 1 && arcs.length === 1 && points.length === 0 && lines.length === 0) {
            const sourceArcId = arcCenters[0].id;
            const targetArcId = arcs[0].id;
            if (!sourceArcId || !targetArcId || sourceArcId === targetArcId) {
                return false;
            }
            const refs = [sourceArcId, targetArcId];
            specs.push({ type: 'arc_center_on_arc', refs, displayRefs: displayRefsFor(refs) });
        } else if (points.length === 1 && hasOriginSelected && lines.length === 0 && arcs.length === 0 && arcCenters.length === 0) {
            const refs = [points[0].id];
            specs.push({
                type: 'fixed',
                refs,
                displayRefs: displayRefsFor(refs),
                data: { anchors: { [points[0].id]: { x: 0, y: 0 } } }
            });
        } else if (arcCenters.length === 1 && lines.length === 1 && points.length === 0 && arcs.length === 0) {
            const refs = [arcCenters[0].id, lines[0].id];
            specs.push({ type: 'arc_center_on_line', refs, displayRefs: displayRefsFor(refs) });
        } else if (arcCenters.length === 1 && hasOriginSelected && points.length === 0 && lines.length === 0 && arcs.length === 0) {
            const refs = [arcCenters[0].id];
            specs.push({ type: 'arc_center_fixed_origin', refs, displayRefs: displayRefsFor(refs) });
        } else {
            return false;
        }
    } else if (type === 'dimension') {
        let dimRefs = null;
        if (lines.length === 1 && points.length === 0 && arcs.length === 0) {
            dimRefs = [lines[0].id];
        } else if (arcs.length === 1 && lines.length === 0 && points.length === 0 && arcCenters.length === 0 && !hasOriginSelected) {
            dimRefs = [arcs[0].id];
        } else if (pointLikeRefs.length === 2 && lines.length === 0 && arcs.length === 0) {
            dimRefs = [pointLikeRefs[0], pointLikeRefs[1]];
        } else {
            return false;
        }
        const normalized = this.normalizeConstraintRefs('dimension', dimRefs);
        const current = this.findSketchConstraintInList?.(feature, 'dimension', normalized);
        const currentValue = Number(current?.data?.value);
        const measured = measureDimensionValue(entities, normalized);
        const seed = Number.isFinite(currentValue) && currentValue > 0
            ? currentValue
            : (Number.isFinite(measured) && measured > 0 ? measured : 10);
        clearSketchTransientInputState(this);
        const input = window.prompt('Dimension value', String(Number(seed.toFixed(4))));
        clearSketchTransientInputState(this);
        if (input === null) {
            return false;
        }
        const value = Number(input);
        if (!Number.isFinite(value) || value <= 0) {
            return false;
        }
        specs.push({
            type,
            refs: normalized,
            displayRefs: displayRefsFor(normalized),
            data: { value, mode: getConstraintMode(current) }
        });
    } else if (type === 'min_distance' || type === 'max_distance') {
        let refs = null;
        if (arcs.length === 1 && pointLikeRefs.length === 1 && lines.length === 0) {
            refs = [arcs[0].id, pointLikeRefs[0]];
        } else if (arcs.length === 1 && lines.length === 1 && pointLikeRefs.length === 0) {
            refs = [arcs[0].id, lines[0].id];
        } else if (arcs.length === 2 && lines.length === 0 && pointLikeRefs.length === 0) {
            refs = [arcs[0].id, arcs[1].id];
        } else {
            return false;
        }
        const normalized = this.normalizeConstraintRefs(type, refs);
        const current = this.findSketchConstraintInList?.(feature, type, normalized);
        const currentValue = Number(current?.data?.value);
        const seed = Number.isFinite(currentValue) && currentValue > 0 ? currentValue : 1;
        clearSketchTransientInputState(this);
        const promptLabel = type === 'min_distance' ? 'Min distance value' : 'Max distance value';
        const input = window.prompt(promptLabel, String(Number(seed.toFixed(4))));
        clearSketchTransientInputState(this);
        if (input === null) {
            return false;
        }
        const value = Number(input);
        if (!Number.isFinite(value) || value <= 0) {
            return false;
        }
        specs.push({
            type,
            refs: normalized,
            displayRefs: displayRefsFor(normalized),
            data: { value }
        });
    } else if (type === 'fixed') {
        for (const point of points) {
            const refs = [point.id];
            specs.push({ type, refs, displayRefs: displayRefsFor(refs) });
        }
    } else {
        return false;
    }

    if (!specs.length) {
        return false;
    }

    let changed = false;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        for (const spec of specs) {
            if (this.toggleSketchConstraintInList(sketch, sketch.constraints, spec.type, spec.refs, spec.data || null, spec.displayRefs || null)) {
                changed = true;
            }
        }
        if (changed) {
            // Apply-path should settle quickly without over-driving fallback.
            enforceSketchConstraintsInPlace(sketch, { iterations: 48 });
            enforceSketchConstraintsInPlace(sketch, {
                useFallback: true,
                iterations: 48,
                tangentAggressive: false
            });
        }
    }, {
        opType: 'feature.update',
        payload: {
            field: 'constraints.apply',
            type,
            refs: specs.map(spec => spec.refs),
            data: specs.map(spec => spec.data || null)
        }
    });

    if (changed) {
        this.clearSketchSelection?.();
    }
    return changed;
}

function editSketchDimensionConstraint(constraintId) {
    const feature = this.getEditingSketchFeature();
    if (!feature || !constraintId) return false;
    clearSketchTransientInputState(this);
    const constraints = Array.isArray(feature.constraints) ? feature.constraints : [];
    const found = constraints.find(c => c?.id === constraintId && c?.type === 'dimension');
    if (!found) return false;
    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const measured = measureDimensionValue(entities, Array.isArray(found.refs) ? found.refs : []);
    const current = Number(found?.data?.value);
    const seed = Number.isFinite(current) && current > 0
        ? current
        : (Number.isFinite(measured) && measured > 0 ? measured : 10);
    const input = window.prompt('Dimension value', String(Number(seed.toFixed(4))));
    clearSketchTransientInputState(this);
    if (input === null) return false;
    const value = Number(input);
    if (!Number.isFinite(value) || value <= 0) return false;

    let changed = false;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        const c = sketch.constraints.find(k => k?.id === constraintId && k?.type === 'dimension');
        if (!c) return;
        c.data = c.data || {};
        const prev = Number(c.data.value);
        if (Math.abs(prev - value) < 1e-9) return;
        c.data.value = value;
        changed = true;
        if (getConstraintMode(c) === 'driving') {
            enforceSketchConstraintsInPlace(sketch, { iterations: 48 });
            enforceSketchConstraintsInPlace(sketch, {
                useFallback: true,
                iterations: 48,
                tangentAggressive: false
            });
        }
    }, {
        opType: 'feature.update',
        payload: { field: 'constraints.dimension.value', id: constraintId, value }
    });
    return changed;
}

function toggleSketchDimensionMode(constraintId) {
    const feature = this.getEditingSketchFeature();
    if (!feature || !constraintId) return false;
    let changed = false;
    api.features.update(feature.id, sketch => {
        sketch.constraints = Array.isArray(sketch.constraints) ? sketch.constraints : [];
        sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
        const c = sketch.constraints.find(k => k?.id === constraintId && k?.type === 'dimension');
        if (!c) return;
        c.data = c.data || {};
        const prev = getConstraintMode(c);
        const next = prev === 'driving' ? 'driven' : 'driving';
        if (next === prev) return;
        if (next === 'driving') {
            const measured = measureDimensionValue(sketch.entities, Array.isArray(c.refs) ? c.refs : []);
            if (Number.isFinite(measured) && measured > 0) {
                c.data.value = measured;
            }
        }
        c.data.mode = next;
        changed = true;
        if (next === 'driving') {
            enforceSketchConstraintsInPlace(sketch, { iterations: 48 });
            enforceSketchConstraintsInPlace(sketch, {
                useFallback: true,
                iterations: 48,
                tangentAggressive: false
            });
        }
    }, {
        opType: 'feature.update',
        payload: { field: 'constraints.dimension.mode', id: constraintId }
    });
    return changed;
}

function findArcWithEndpoints(feature, p1Id, p2Id) {
    return sketchCreate.findArcWithEndpoints.call(this, feature, p1Id, p2Id);
}

function convertArcToCircle(feature, arcId, p1Id, p2Id) {
    return sketchCreate.convertArcToCircle.call(this, feature, arcId, p1Id, p2Id);
}

function findSketchConstraintInList(sketch, type, refs) {
    const list = Array.isArray(sketch?.constraints) ? sketch.constraints : [];
    const key = this.makeSketchConstraintKey(type, refs);
    for (const existing of list) {
        if (this.makeSketchConstraintKey(existing?.type, existing?.refs || []) === key) {
            return existing;
        }
    }
    return null;
}

function toggleSketchConstraintInList(sketch, list, type, refs, dataIn = null, displayRefsIn = null) {
    const key = this.makeSketchConstraintKey(type, refs);
    for (let i = 0; i < list.length; i++) {
        const existing = list[i];
        if (this.makeSketchConstraintKey(existing?.type, existing?.refs || []) === key) {
            if (type === 'dimension') {
                existing.data = existing.data || {};
                const prev = Number(existing.data.value);
                const next = Number(dataIn?.value);
                if (!Number.isFinite(next) || next <= 0) {
                    return false;
                }
                if (Math.abs(prev - next) < 1e-9) {
                    return false;
                }
                existing.data.value = next;
                applyConstraintDisplayRefs(existing, displayRefsIn);
                return true;
            }
            if (type === 'min_distance' || type === 'max_distance') {
                existing.data = existing.data || {};
                const prev = Number(existing.data.value);
                const next = Number(dataIn?.value);
                if (!Number.isFinite(next) || next <= 0) {
                    return false;
                }
                if (Math.abs(prev - next) < 1e-9) {
                    return false;
                }
                existing.data.value = next;
                applyConstraintDisplayRefs(existing, displayRefsIn);
                return true;
            }
            if (type === 'fixed' && dataIn?.anchors && typeof dataIn.anchors === 'object') {
                existing.data = existing.data || {};
                existing.data.anchors = existing.data.anchors || {};
                let changed = false;
                for (const id of this.normalizeConstraintRefs(type, refs)) {
                    const anchor = dataIn.anchors[id];
                    if (!anchor) continue;
                    const x = Number(anchor.x);
                    const y = Number(anchor.y);
                    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                    const prev = existing.data.anchors[id];
                    if (!prev || Math.abs((prev.x || 0) - x) > 1e-9 || Math.abs((prev.y || 0) - y) > 1e-9) {
                        existing.data.anchors[id] = { x, y };
                        changed = true;
                    }
                }
                if (changed) {
                    applyConstraintDisplayRefs(existing, displayRefsIn);
                }
                return changed;
            }
            list.splice(i, 1);
            return true;
        }
    }
    const data = {};
    if (type === 'fixed') {
        const provided = dataIn?.anchors && typeof dataIn.anchors === 'object' ? dataIn.anchors : null;
        data.anchors = {};
        if (provided) {
            for (const id of this.normalizeConstraintRefs(type, refs)) {
                const anchor = provided[id];
                if (!anchor) continue;
                const x = Number(anchor.x);
                const y = Number(anchor.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                data.anchors[id] = { x, y };
            }
        }
        if (!Object.keys(data.anchors).length) {
            const entities = Array.isArray(sketch?.entities) ? sketch.entities : [];
            const pointById = new Map(entities.filter(e => e?.type === 'point' && e.id).map(e => [e.id, e]));
            for (const id of this.normalizeConstraintRefs(type, refs)) {
                const p = pointById.get(id);
                if (p) {
                    data.anchors[id] = { x: p.x || 0, y: p.y || 0 };
                }
            }
        }
    }
    const rec = {
        id: this.newSketchEntityId('cst'),
        type,
        refs: this.normalizeConstraintRefs(type, refs),
        data,
        created_at: Date.now()
    };
    applyConstraintDisplayRefs(rec, displayRefsIn);
    if (type === 'dimension') {
        const value = Number(dataIn?.value);
        if (!Number.isFinite(value) || value <= 0) {
            return false;
        }
        rec.data = { ...rec.data, value };
    }
    if (type === 'min_distance' || type === 'max_distance') {
        const value = Number(dataIn?.value);
        if (!Number.isFinite(value) || value <= 0) {
            return false;
        }
        rec.data = { ...rec.data, value };
    }
    list.push(rec);
    return true;
}

function normalizeConstraintRefs(type, refs) {
    const out = Array.from(new Set((refs || []).filter(Boolean)));
    if (type === 'horizontal' || type === 'vertical' || type === 'fixed') {
        return out.slice(0, 1);
    }
    if (type === 'horizontal_points' || type === 'vertical_points') {
        return out.slice(0, 2).sort();
    }
    if (type === 'point_on_line' || type === 'point_on_arc') {
        return out.slice(0, 2).sort();
    }
    if (type === 'min_distance' || type === 'max_distance') {
        return out.slice(0, 2).sort();
    }
    if (type === 'arc_center_on_line') {
        return out.slice(0, 2).sort();
    }
    if (type === 'arc_center_on_arc') {
        return out.slice(0, 2).sort();
    }
    if (type === 'arc_center_fixed_origin') {
        return out.slice(0, 1);
    }
    if (type === 'midpoint') {
        return out.slice(0, 3);
    }
    if (type === 'arc_center_coincident') {
        return out.slice(0, 2);
    }
    if (type === 'dimension') {
        if (out.length === 1) {
            return out;
        }
        return out.slice(0, 2).sort();
    }
    return out.sort();
}

function makeSketchConstraintKey(type, refs) {
    return `${type}:${this.normalizeConstraintRefs(type, refs).join(',')}`;
}

export {
    deleteSelectedSketchConstraints,
    deleteSelectedSketchEntities,
    toggleSelectedConstruction,
    applySketchConstraint,
    editSketchDimensionConstraint,
    toggleSketchDimensionMode,
    findArcWithEndpoints,
    convertArcToCircle,
    findSketchConstraintInList,
    toggleSketchConstraintInList,
    normalizeConstraintRefs,
    makeSketchConstraintKey
};
