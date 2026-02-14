/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';
import { space } from '../../moto/space.js';
import { api } from '../api.js';
import { isCircleCurve, isThreePointCircle, isCenterPointCircle } from './curve.js';
import {
    SKETCH_HIT_POINT_PX,
    SKETCH_HIT_LINE_PX,
    SKETCH_MIN_LINE_LENGTH,
    SKETCH_POINT_MERGE_EPS,
    SKETCH_VIRTUAL_ORIGIN_ID
} from './constants.js';

function pointerDistance(event, pointerDown) {
    if (!event || !pointerDown) return 0;
    return Math.hypot((event.clientX || 0) - pointerDown.clientX, (event.clientY || 0) - pointerDown.clientY);
}

function collectInternalCircleEndpointIds(entities = []) {
    const hidden = new Set();
    for (const entity of entities) {
        if (entity?.type !== 'arc' || !isCircleCurve(entity) || isThreePointCircle(entity)) continue;
        const aId = typeof entity?.a === 'string' ? entity.a : (typeof entity?.p1_id === 'string' ? entity.p1_id : null);
        const bId = typeof entity?.b === 'string' ? entity.b : (typeof entity?.p2_id === 'string' ? entity.p2_id : null);
        if (aId) hidden.add(aId);
        if (bId) hidden.add(bId);
    }
    return hidden;
}

function hitTestSketchEntity(event, feature) {
    if (!event || !feature) {
        return null;
    }

    const entities = Array.isArray(feature.entities) ? feature.entities : [];
    const internalCircleEndpointIds = collectInternalCircleEndpointIds(entities);

    const basis = this.getSketchBasis(feature);
    const screenPoint = this.getEventViewportXY(event);
    if (!basis || !screenPoint) {
        return null;
    }

    let bestPoint = null;
    let bestLine = null;
    const pointById = new Map();
    const pointHitPx = SKETCH_HIT_POINT_PX;
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id) {
            pointById.set(entity.id, entity);
        }
    }

    for (const entity of entities) {
        if (!entity?.id) continue;

        if (entity.type === 'point') {
            if (internalCircleEndpointIds.has(entity.id)) continue;
            const world = this.sketchLocalToWorld(entity, basis);
            const proj = api.overlay.project3Dto2D(world);
            if (!proj?.visible) continue;
            const dist = Math.hypot(screenPoint.x - proj.x, screenPoint.y - proj.y);
            if (dist <= pointHitPx && (!bestPoint || dist < bestPoint.dist)) {
                bestPoint = { id: entity.id, type: 'point', dist };
            }
            continue;
        }

        if (entity.type === 'line') {
            const [a, b] = this.getLineEndpoints(entity, pointById);
            if (!a || !b) continue;
            const wa = this.sketchLocalToWorld(a, basis);
            const wb = this.sketchLocalToWorld(b, basis);
            const pa = api.overlay.project3Dto2D(wa);
            const pb = api.overlay.project3Dto2D(wb);
            if (!pa?.visible || !pb?.visible) continue;
            const dist = this.distanceToSegmentPx(screenPoint.x, screenPoint.y, pa.x, pa.y, pb.x, pb.y);
            if (dist <= SKETCH_HIT_LINE_PX && (!bestLine || dist < bestLine.dist)) {
                bestLine = { id: entity.id, type: 'line', dist };
            }
        }
        if (entity.type === 'arc') {
            const center = this.getArcCenterLocalFromEntity(entity, pointById);
            if (center && !isThreePointCircle(entity)) {
                const wc = this.sketchLocalToWorld(center, basis);
                const pc = api.overlay.project3Dto2D(wc);
                if (pc?.visible) {
                    const cd = Math.hypot(screenPoint.x - pc.x, screenPoint.y - pc.y);
                    const bestIsArcCenter = bestPoint?.type === 'arc-center';
                    const sameDist = bestPoint ? Math.abs(cd - bestPoint.dist) <= 1e-6 : false;
                    if (cd <= pointHitPx && (
                        !bestPoint ||
                        cd < bestPoint.dist - 1e-6 ||
                        (bestIsArcCenter && sameDist)
                    )) {
                        bestPoint = { id: `arc-center:${entity.id}`, type: 'arc-center', dist: cd };
                    }
                }
            }
            const [a, b] = this.getArcEndpoints(entity, pointById);
            if (!a || !b) continue;
            const sample = this.sampleArcPolyline(entity, a, b, 32);
            let minDist = Infinity;
            for (let i = 0; i < sample.length - 1; i++) {
                const wa = this.sketchLocalToWorld(sample[i], basis);
                const wb = this.sketchLocalToWorld(sample[i + 1], basis);
                const pa = api.overlay.project3Dto2D(wa);
                const pb = api.overlay.project3Dto2D(wb);
                if (!pa?.visible || !pb?.visible) continue;
                const dist = this.distanceToSegmentPx(screenPoint.x, screenPoint.y, pa.x, pa.y, pb.x, pb.y);
                minDist = Math.min(minDist, dist);
            }
            if (minDist <= SKETCH_HIT_LINE_PX && (!bestLine || minDist < bestLine.dist)) {
                bestLine = { id: entity.id, type: 'arc', dist: minDist };
            }
        }
    }

    const originProj = api.overlay.project3Dto2D(basis.origin);
    if (originProj?.visible) {
        const originDist = Math.hypot(screenPoint.x - originProj.x, screenPoint.y - originProj.y);
        if (originDist <= pointHitPx && (!bestPoint || originDist < bestPoint.dist)) {
            bestPoint = { id: SKETCH_VIRTUAL_ORIGIN_ID, type: 'point', dist: originDist };
        }
    }

    return bestPoint || bestLine;
}

function getArcCenterLocalFromEntity(arc, pointById) {
    const [a, b] = this.getArcEndpoints(arc, pointById);
    if (!a || !b) return null;
    if (isCircleCurve(arc)) {
        const cx = Number(arc?.cx);
        const cy = Number(arc?.cy);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
            return { x: cx, y: cy };
        }
    }
    if (Number.isFinite(arc?.mx) && Number.isFinite(arc?.my)) {
        const geom = this.computeArcGeometry(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (geom) {
            return { x: geom.cx, y: geom.cy };
        }
    }
    if (Number.isFinite(arc?.cx) && Number.isFinite(arc?.cy)) {
        return { x: arc.cx, y: arc.cy };
    }
    return null;
}

function getSketchEntityHitFromIntersections(intersections, feature) {
    if (!intersections || !intersections.length) {
        return null;
    }
    const rec = api.sketchRuntime?.getRecord?.(feature?.id);
    const allowed = rec?.entityViews ? new Set(Array.from(rec.entityViews.keys())) : null;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const internalCircleEndpointIds = collectInternalCircleEndpointIds(entities);
    let bestPoint = null;
    let bestLine = null;
    for (const hit of intersections) {
        const id = hit?.object?.userData?.sketchEntityId;
        if (!id) continue;
        if (allowed && !allowed.has(id)) continue;
        const type = hit.object.userData?.sketchEntityType || null;
        if (type === 'profile') continue;
        // Arc-center hits must keep their synthetic id (`arc-center:<arcId>`)
        // so drag/snap code can resolve them unambiguously.
        const refId = (type === 'arc-center') ? id : (hit.object.userData?.sketchEntityRefId || id);
        if (type === 'point' && internalCircleEndpointIds.has(refId)) continue;
        const cand = { id: refId, type, distance: hit.distance ?? Infinity };
        if (type === 'point' || type === 'arc-center') {
            const bestIsArcCenter = bestPoint?.type === 'arc-center';
            const sameDist = bestPoint ? Math.abs((cand.distance ?? Infinity) - (bestPoint.distance ?? Infinity)) <= 1e-6 : false;
            if (!bestPoint || cand.distance < bestPoint.distance - 1e-6 || (type === 'point' && bestIsArcCenter && sameDist)) {
                bestPoint = cand;
            }
        } else if (!bestLine || cand.distance < bestLine.distance) {
            bestLine = cand;
        }
    }
    return bestPoint || bestLine || null;
}

function resolveSketchHit(event, intersections, feature) {
    const rayHit = this.getSketchEntityHitFromIntersections(intersections, feature);
    const screenHit = this.hitTestSketchEntity(event, feature);
    if (screenHit?.type === 'point' || screenHit?.type === 'arc-center') {
        return screenHit;
    }
    if (rayHit?.type === 'point' || rayHit?.type === 'arc-center') {
        return rayHit;
    }
    return rayHit || screenHit || null;
}

function worldToSketchLocal(world, basis) {
    if (!world || !basis) return null;
    const rel = world.clone().sub(basis.origin);
    return {
        x: rel.dot(basis.xAxis),
        y: rel.dot(basis.yAxis)
    };
}

function resolveDerivedEdgeCandidate(event, intersections, feature) {
    if (!event || !feature) return null;
    const basis = this.getSketchBasis(feature);
    if (!basis) return null;
    const vp = this.getEventViewportXY(event);
    if (!vp) return null;

    const primary = this.getPrimarySurfaceHitFromIntersections?.(intersections || []) || null;
    let faceKey = null;
    let facePoint = null;
    let solidId = '';
    let faceId = NaN;
    if (primary?.type === 'solid-face') {
        const faceHit = primary.hit || null;
        faceKey = String(faceHit?.key || '') || null;
        facePoint = faceHit?.intersection?.point || null;
    } else if (primary?.type === 'solid-edge') {
        const edge = primary.hit || null;
        solidId = String(edge?.solidId || '');
        faceId = Number(edge?.faceId);
        if (!solidId || !Number.isFinite(faceId)) {
            const raw = String(edge?.key || '');
            if (raw.startsWith('faceedge:') || raw.startsWith('faceedgeloop:')) {
                const parts = raw.split(':');
                faceId = Number(parts[parts.length - 2]);
                solidId = parts.slice(1, -2).join(':');
            }
        }
        if (solidId && Number.isFinite(faceId)) {
            faceKey = `${solidId}:${faceId}`;
            facePoint = edge?.intersection?.point || null;
        }
    }
    if (!faceKey || !facePoint) {
        const faceHit = api.solids?.getFaceHitFromIntersections?.(intersections || []) || null;
        faceKey = String(faceHit?.key || '') || null;
        facePoint = faceHit?.intersection?.point || null;
    }
    if (!faceKey || !facePoint) return null;
    const splitAt = String(faceKey).lastIndexOf(':');
    if (splitAt > 0) {
        solidId = String(faceKey).substring(0, splitAt);
        faceId = Number(String(faceKey).substring(splitAt + 1));
    }
    if (!solidId || !Number.isFinite(faceId)) return null;

    const loops = api.solids?.getFaceBoundaryLoops?.(faceKey) || [];
    if (!loops.length) return null;

    const segments = [];
    for (let li = 0; li < loops.length; li++) {
        const loop = loops[li];
        const points = Array.isArray(loop?.points) ? loop.points : [];
        if (points.length < 2) continue;
        const segIndices = Array.isArray(loop?.segmentIndices) ? loop.segmentIndices : [];
        for (let si = 0; si + 1 < points.length; si++) {
            const wa = points[si];
            const wb = points[si + 1];
            if (!wa || !wb) continue;
            const pwa = api.overlay.project3Dto2D(wa);
            const pwb = api.overlay.project3Dto2D(wb);
            if (!pwa?.visible || !pwb?.visible) continue;
            const dist = this.distanceToSegmentPx(vp.x, vp.y, pwa.x || 0, pwa.y || 0, pwb.x || 0, pwb.y || 0);
            if (!Number.isFinite(dist)) continue;
            const segIndex = Number(segIndices[si]);
            segments.push({
                loopIndex: li,
                segPos: si,
                segIndex: Number.isFinite(segIndex) ? segIndex : si,
                closed: !!loop?.closed,
                aWorld: wa.clone ? wa.clone() : new THREE.Vector3(Number(wa.x || 0), Number(wa.y || 0), Number(wa.z || 0)),
                bWorld: wb.clone ? wb.clone() : new THREE.Vector3(Number(wb.x || 0), Number(wb.y || 0), Number(wb.z || 0)),
                distPx: dist
            });
        }
    }
    if (!segments.length) return null;
    segments.sort((l, r) =>
        l.distPx - r.distPx
        || l.loopIndex - r.loopIndex
        || l.segPos - r.segPos
    );
    const bestSeg = segments[0];
    const bestSegDist = Number(bestSeg?.distPx || Infinity);
    // Only treat as edge-hover when pointer is genuinely near the edge.
    // Otherwise keep face-hover path active so full boundary preview renders.
    // Edge mode should only activate when genuinely near a boundary.
    // Otherwise allow face mode to show the full boundary set.
    const edgeHoverPx = Math.max(2.5, SKETCH_HIT_LINE_PX * 0.35);
    if (!Number.isFinite(bestSegDist) || bestSegDist > edgeHoverPx) {
        return null;
    }

    const a = bestSeg.aWorld;
    const b = bestSeg.bWorld;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const aLocal = this.worldToSketchLocal(a, basis);
    const bLocal = this.worldToSketchLocal(b, basis);
    const midLocal = this.worldToSketchLocal(mid, basis);
    if (!aLocal || !bLocal || !midLocal) return null;
    const pwa = api.overlay.project3Dto2D(a);
    const pwb = api.overlay.project3Dto2D(b);
    const pwm = api.overlay.project3Dto2D(mid);
    const pm = api.overlay.project3Dto2D(this.sketchLocalToWorld(midLocal, basis));

    const pointHits = [];
    if (pwa?.visible) pointHits.push({ kind: 'a', local: aLocal, dist: Math.hypot(vp.x - pwa.x, vp.y - pwa.y) });
    if (pwb?.visible) pointHits.push({ kind: 'b', local: bLocal, dist: Math.hypot(vp.x - pwb.x, vp.y - pwb.y) });
    if (pwm?.visible && pm?.visible) pointHits.push({ kind: 'mid', local: midLocal, dist: Math.hypot(vp.x - pwm.x, vp.y - pwm.y) });
    pointHits.sort((l, r) => l.dist - r.dist);
    const pointThreshold = Math.min(
        SKETCH_HIT_POINT_PX * 0.45,
        Math.max(2.25, bestSegDist * 0.35 + 0.5)
    );
    const hoverPoint = pointHits[0]
        && pointHits[0].dist <= pointThreshold
        && pointHits[0].dist <= (bestSegDist * 0.8)
        ? pointHits[0]
        : null;
    const hoverWorld = hoverPoint
        ? (hoverPoint.kind === 'a'
            ? { x: a.x, y: a.y, z: a.z }
            : hoverPoint.kind === 'b'
                ? { x: b.x, y: b.y, z: b.z }
                : { x: mid.x, y: mid.y, z: mid.z })
        : null;

    const loop = loops[bestSeg.loopIndex] || null;
    const segLen = a.distanceTo(b);
    const shortSegThreshold = 6;
    const promoteLoop = !!(loop?.closed && Number.isFinite(segLen) && segLen <= shortSegThreshold);
    const edgeKey = promoteLoop
        ? `faceedgeloop:${solidId}:${faceId}:${bestSeg.loopIndex}`
        : `faceedge:${solidId}:${faceId}:${bestSeg.segIndex}`;

    const solid = api.solids?.list?.().find?.(item => item?.id === solidId) || null;
    const target = api.solids?.getSketchTargetForFaceKey?.(faceKey) || null;
    const faceFrame = target?.frame || null;
    const frameBasis = (() => {
        if (!faceFrame?.origin || !faceFrame?.normal || !faceFrame?.x_axis) return null;
        const origin = new THREE.Vector3(
            Number(faceFrame.origin.x || 0),
            Number(faceFrame.origin.y || 0),
            Number(faceFrame.origin.z || 0)
        );
        const normal = new THREE.Vector3(
            Number(faceFrame.normal.x || 0),
            Number(faceFrame.normal.y || 0),
            Number(faceFrame.normal.z || 1)
        ).normalize();
        let xAxis = new THREE.Vector3(
            Number(faceFrame.x_axis.x || 1),
            Number(faceFrame.x_axis.y || 0),
            Number(faceFrame.x_axis.z || 0)
        );
        xAxis.addScaledVector(normal, -xAxis.dot(normal));
        if (xAxis.lengthSq() <= 1e-12) {
            xAxis.set(1, 0, 0);
            xAxis.addScaledVector(normal, -xAxis.dot(normal));
        }
        xAxis.normalize();
        const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
        return { origin, xAxis, yAxis };
    })();
    const toFaceLocal = world => {
        if (!world || !frameBasis) return null;
        const rel = world.clone().sub(frameBasis.origin);
        return {
            x: rel.dot(frameBasis.xAxis),
            y: rel.dot(frameBasis.yAxis)
        };
    };
    const localA = toFaceLocal(a);
    const localB = toFaceLocal(b);
    const localP = hoverWorld ? toFaceLocal(new THREE.Vector3(hoverWorld.x, hoverWorld.y, hoverWorld.z)) : null;
    const pathWorldSegments = [];
    const pathLocalSegments = [];
    const pathSegmentKeys = [];
    const pathSegmentEntityIds = [];
    if (promoteLoop) {
        const pts = Array.isArray(loop?.points) ? loop.points : [];
        const segIdx = Array.isArray(loop?.segmentIndices) ? loop.segmentIndices : [];
        for (let i = 0; i + 1 < pts.length; i++) {
            const wa = pts[i];
            const wb = pts[i + 1];
            if (!wa || !wb) continue;
            const la = this.worldToSketchLocal(wa, basis);
            const lb = this.worldToSketchLocal(wb, basis);
            if (!la || !lb) continue;
            pathLocalSegments.push({ a: la, b: lb });
            pathWorldSegments.push({
                a: { x: Number(wa.x || 0), y: Number(wa.y || 0), z: Number(wa.z || 0) },
                b: { x: Number(wb.x || 0), y: Number(wb.y || 0), z: Number(wb.z || 0) }
            });
            const segIndex = Number(segIdx?.[i]);
            if (Number.isFinite(segIndex) && Number.isFinite(faceId) && solidId) {
                const segKey = `faceedge:${solidId}:${faceId}:${segIndex}`;
                pathSegmentKeys.push(segKey);
                const ent = api.solids?.resolveCanonicalEdgeEntity?.(segKey) || null;
                pathSegmentEntityIds.push(String(ent?.id || ''));
            } else {
                pathSegmentKeys.push('');
                pathSegmentEntityIds.push('');
            }
        }
    }
    const canonicalEntity = api.solids?.resolveCanonicalEdgeEntity?.(edgeKey) || null;
    const canonicalEntityId = String(canonicalEntity?.id || '');
    const canonicalEntityKind = String(canonicalEntity?.kind || 'boundary-segment');
    const out = {
        type: 'solid-edge',
        solidId,
        solidFeatureId: solid?.source?.feature_id || null,
        index: Number(bestSeg.segIndex ?? 0),
        segDist: bestSegDist,
        aLocal,
        bLocal,
        midLocal,
        aWorld: { x: a.x, y: a.y, z: a.z },
        bWorld: { x: b.x, y: b.y, z: b.z },
        midWorld: { x: mid.x, y: mid.y, z: mid.z },
        pathLocalSegments: pathLocalSegments.length ? pathLocalSegments : null,
        pathWorldSegments: pathWorldSegments.length ? pathWorldSegments : null,
        pathSegmentKeys: pathSegmentKeys.length ? pathSegmentKeys : null,
        pathSegmentEntityIds: pathSegmentEntityIds.length ? pathSegmentEntityIds : null,
        a: { x: a.x, y: a.y, z: a.z },
        b: { x: b.x, y: b.y, z: b.z },
        hoverPoint: hoverPoint ? { ...hoverPoint, world: hoverWorld } : null,
        source: {
            type: 'solid-edge',
            entity: {
                kind: canonicalEntityKind,
                id: canonicalEntityId
            },
            solid_id: solidId,
            solid_feature_id: solid?.source?.feature_id || null,
            face_id: Number.isFinite(faceId) ? faceId : null,
            face_frame: faceFrame || null,
            face_key: faceKey || null,
            boundary_segment_id: canonicalEntityId,
            local_a: localA || null,
            local_b: localB || null,
            local_point: localP || null,
            edge_key: String(edgeKey || ''),
            edge_index: Number(bestSeg.segIndex ?? 0),
            a: { x: a.x, y: a.y, z: a.z },
            b: { x: b.x, y: b.y, z: b.z }
        }
    };
    return out;
}

function projectFaceBoundaryToSketch(feature, faceKey) {
    if (!feature || !faceKey) return null;
    const basis = this.getSketchBasis(feature);
    if (!basis) return null;
    const loops = api.solids?.getFaceBoundaryLoops?.(faceKey) || [];
    if (!loops.length) return null;
    const out = [];
    for (const loop of loops) {
        const points = Array.isArray(loop?.points) ? loop.points : [];
        if (points.length < 2) continue;
        for (let i = 0; i + 1 < points.length; i++) {
            const a = this.worldToSketchLocal(points[i], basis);
            const b = this.worldToSketchLocal(points[i + 1], basis);
            if (!a || !b) continue;
            out.push({ a, b });
        }
    }
    return out.length ? out : null;
}

function isSketchEventInViewport(event) {
    if (!event) return true;
    const { container } = space.internals();
    if (!container) return true;
    if (!event.target) return true;
    return container.contains(event.target);
}

function getSketchHitLocalPoint(feature, hit) {
    if (!hit?.id) {
        return null;
    }
    const isArcCenter = hit?.type === 'arc-center' || String(hit.id).startsWith('arc-center:');
    if (isArcCenter) {
        const arcId = String(hit.id).startsWith('arc-center:')
            ? String(hit.id).substring('arc-center:'.length)
            : String(hit.id);
        const entities = Array.isArray(feature?.entities) ? feature.entities : [];
        const pointById = new Map(entities.filter(e => e?.type === 'point' && e?.id).map(e => [e.id, e]));
        const arc = entities.find(entity => entity?.type === 'arc' && entity?.id === arcId) || null;
        if (arc) {
            const center = this.getArcCenterLocalFromEntity(arc, pointById);
            if (center) return { x: center.x || 0, y: center.y || 0 };
        }
    }
    if (hit.id === SKETCH_VIRTUAL_ORIGIN_ID) {
        return { x: 0, y: 0 };
    }

    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    for (const entity of entities) {
        if (entity?.type === 'point' && entity.id === hit.id) {
            return { x: entity.x || 0, y: entity.y || 0 };
        }
    }

    const rec = api.sketchRuntime?.getRecord?.(feature?.id);
    const view = rec?.entityViews?.get?.(hit.id);
    if (view?.type === 'point' && view.entity) {
        return { x: view.entity.x || 0, y: view.entity.y || 0 };
    }
    return null;
}

function getSketchDragSnapTarget(event, feature, movedPointIds) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const internalCircleEndpointIds = collectInternalCircleEndpointIds(entities);
    const basis = this.getSketchBasis(feature);
    const vp = this.getEventViewportXY(event);
    if (!basis || !vp) {
        return null;
    }

    const points = entities.filter(e => e?.type === 'point' && e.id && !internalCircleEndpointIds.has(e.id));
    const moved = points.filter(p => movedPointIds?.has(p.id));
    const others = points.filter(p => !movedPointIds?.has(p.id) && p.id !== SKETCH_VIRTUAL_ORIGIN_ID);
    if (!moved.length) {
        return null;
    }

    let target = null;
    for (const p of others) {
        const world = this.sketchLocalToWorld(p, basis);
        const proj = api.overlay.project3Dto2D(world);
        if (!proj?.visible) continue;
        const d = Math.hypot(vp.x - proj.x, vp.y - proj.y);
        if (d > SKETCH_HIT_POINT_PX * 1.8) continue;
        if (!target || d < target.dist) {
            target = { point: p, dist: d, type: 'point', hoveredId: p.id };
        }
    }
    const byId = new Map(points.map(p => [p.id, p]));
    for (const arc of entities) {
        if (arc?.type !== 'arc' || !arc.id) continue;
        if (isThreePointCircle(arc)) continue;
        const center = this.getArcCenterLocalFromEntity(arc, byId);
        if (!center) continue;
        const world = this.sketchLocalToWorld(center, basis);
        const proj = api.overlay.project3Dto2D(world);
        if (!proj?.visible) continue;
        const d = Math.hypot(vp.x - proj.x, vp.y - proj.y);
        if (d > SKETCH_HIT_POINT_PX * 1.8) continue;
        const arcCenterId = `arc-center:${arc.id}`;
        if (!target || d < target.dist) {
            target = { arc, center, dist: d, type: 'arc-center', hoveredId: arcCenterId };
        }
    }
    if (!target) {
        return null;
    }

    let nearestMoved = null;
    const tx = target.type === 'arc-center' ? (target.center.x || 0) : (target.point.x || 0);
    const ty = target.type === 'arc-center' ? (target.center.y || 0) : (target.point.y || 0);
    for (const p of moved) {
        const dx = (p.x || 0) - tx;
        const dy = (p.y || 0) - ty;
        const d = Math.hypot(dx, dy);
        if (!nearestMoved || d < nearestMoved.dist) {
            nearestMoved = { point: p, dist: d };
        }
    }
    if (!nearestMoved) {
        return null;
    }
    return {
        targetType: target.type || 'point',
        targetId: target.point?.id || null,
        targetArcId: target.arc?.id || null,
        hoveredId: target.hoveredId || target.point?.id || null,
        movedId: nearestMoved.point.id
    };
}

function findPointByCoord(feature, local, eps = SKETCH_POINT_MERGE_EPS) {
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    for (const entity of entities) {
        if (entity?.type !== 'point' || !entity.id) continue;
        if (Math.abs((entity.x || 0) - local.x) <= eps && Math.abs((entity.y || 0) - local.y) <= eps) {
            return entity;
        }
    }
    return null;
}

function ensureSketchPoint(sketch, local) {
    sketch.entities = Array.isArray(sketch.entities) ? sketch.entities : [];
    const existing = this.findPointByCoord(sketch, local, SKETCH_POINT_MERGE_EPS);
    if (existing) {
        return existing;
    }
    const point = {
        id: this.newSketchEntityId('point'),
        type: 'point',
        x: local.x,
        y: local.y,
        fixed: false
    };
    sketch.entities.push(point);
    return point;
}

function getLineEndpoints(line, pointById) {
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
}

function getArcEndpoints(arc, pointById) {
    const aId = typeof arc?.a === 'string' ? arc.a : null;
    const bId = typeof arc?.b === 'string' ? arc.b : null;
    const a = aId ? (pointById?.get(aId) || null) : null;
    const b = bId ? (pointById?.get(bId) || null) : null;
    return [a, b];
}

function applyCircleDragKinematics(feature, dx = 0, dy = 0, local = null) {
    const drag = this.sketchDrag;
    if (!drag) return;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const byId = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const ctrlByArcId = new Map((drag.arcControlBaseline || []).map(rec => [rec.entity?.id, rec]));

    for (const arc of entities) {
        if (arc?.type !== 'arc' || !arc.id) continue;
        const touchesCircle = drag.activeIds?.has?.(arc.id)
            || drag.movedPointIds?.has?.(arc.a)
            || drag.movedPointIds?.has?.(arc.b);
        if (!touchesCircle) continue;
        const a = byId.get(arc.a);
        const b = byId.get(arc.b);
        if (!a || !b) continue;

        // Arc-center drag should move the whole arc rigidly, regardless of
        // arc/circle definition, so the dragged center tracks the pointer.
        if (drag.centerDrag) {
            const cbase = ctrlByArcId.get(arc.id);
            if (cbase) {
                if (Number.isFinite(cbase.cx)) arc.cx = (cbase.cx || 0) + dx;
                if (Number.isFinite(cbase.cy)) arc.cy = (cbase.cy || 0) + dy;
                if (cbase.a) {
                    a.x = (cbase.a.x || 0) + dx;
                    a.y = (cbase.a.y || 0) + dy;
                }
                if (cbase.b) {
                    b.x = (cbase.b.x || 0) + dx;
                    b.y = (cbase.b.y || 0) + dy;
                }
                arc.mx = (cbase.mx || 0) + dx;
                arc.my = (cbase.my || 0) + dy;
                if (isCircleCurve(arc)) {
                    arc.radius = Number.isFinite(cbase.radius) ? cbase.radius : (arc.radius || 0);
                    arc.startAngle = 0;
                    arc.endAngle = Math.PI * 2;
                    arc.ccw = true;
                }
                continue;
            }
        }

        if (!isDragResizableCircleArc(arc, byId)) continue;
        let cx = Number(arc.cx || 0);
        let cy = Number(arc.cy || 0);

        const movedA = drag.movedPointIds?.has?.(a.id);
        const movedB = drag.movedPointIds?.has?.(b.id);
        cx = arc.cx;
        cy = arc.cy;

        const curveDrag = drag.circleCurveDragIds?.has?.(arc.id) && !drag.centerDrag;
        const anchor = movedA ? a : (movedB ? b : null);
        const vx = curveDrag && local ? ((local.x || 0) - cx) : ((anchor?.x || a.x || 0) - cx);
        const vy = curveDrag && local ? ((local.y || 0) - cy) : ((anchor?.y || a.y || 0) - cy);
        let radius = Math.hypot(vx, vy);
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            radius = Number(arc.radius || 0);
        }
        if (!Number.isFinite(radius) || radius < SKETCH_MIN_LINE_LENGTH) {
            continue;
        }
        const angle = Math.atan2(vy, vx);
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        a.x = px;
        a.y = py;
        b.x = px;
        b.y = py;
        arc.radius = radius;
        arc.mx = cx + Math.cos(angle + Math.PI / 2) * radius;
        arc.my = cy + Math.sin(angle + Math.PI / 2) * radius;
        arc.startAngle = 0;
        arc.endAngle = Math.PI * 2;
        arc.ccw = true;
    }
}

function isDragResizableCircleArc(entity, pointById) {
    if (entity?.type !== 'arc') return false;
    if (isCenterPointCircle(entity)) return true;
    if (!Number.isFinite(entity?.cx) || !Number.isFinite(entity?.cy) || !Number.isFinite(entity?.radius)) return false;
    const start = Number(entity?.startAngle);
    const end = Number(entity?.endAngle);
    const full = Number.isFinite(start) && Number.isFinite(end) && Math.abs(start) < 1e-6 && Math.abs(end - Math.PI * 2) < 1e-6;
    if (!full) return false;
    const a = typeof entity?.a === 'string' ? pointById?.get?.(entity.a) : null;
    const b = typeof entity?.b === 'string' ? pointById?.get?.(entity.b) : null;
    if (!a || !b) return !!isCircleCurve(entity);
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)) < 1e-6;
}

function projectPointOnArcConstraintsForArcs(feature, arcIds) {
    const idSet = arcIds instanceof Set ? arcIds : new Set(Array.isArray(arcIds) ? arcIds : []);
    if (!idSet.size) return;
    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const constraints = Array.isArray(feature?.constraints) ? feature.constraints : [];
    const pointById = new Map(entities.filter(e => e?.type === 'point' && e?.id).map(e => [e.id, e]));
    const arcById = new Map(entities.filter(e => e?.type === 'arc' && e?.id).map(e => [e.id, e]));
    for (const c of constraints) {
        if (c?.type !== 'point_on_arc') continue;
        const refs = Array.isArray(c.refs) ? c.refs : [];
        if (refs.length < 2) continue;
        const arcId = arcById.has(refs[0]) ? refs[0] : (arcById.has(refs[1]) ? refs[1] : null);
        const pointId = pointById.has(refs[0]) ? refs[0] : (pointById.has(refs[1]) ? refs[1] : null);
        if (!arcId || !pointId || !idSet.has(arcId)) continue;
        const arc = arcById.get(arcId);
        const point = pointById.get(pointId);
        if (!isCircleCurve(arc) || !point) continue;
        const cx = Number(arc.cx || 0);
        const cy = Number(arc.cy || 0);
        const radius = Number(arc.radius || 0);
        if (!Number.isFinite(radius) || radius <= SKETCH_MIN_LINE_LENGTH) continue;
        const vx = (point.x || 0) - cx;
        const vy = (point.y || 0) - cy;
        const len = Math.hypot(vx, vy);
        if (!Number.isFinite(len) || len <= 1e-9) continue;
        point.x = cx + (vx / len) * radius;
        point.y = cy + (vy / len) * radius;
    }
}

function rebaseSketchDragState(feature, local) {
    const drag = this.sketchDrag;
    if (!drag || !local) return;
    drag.start = { x: local.x || 0, y: local.y || 0 };

    if (drag.baseline instanceof Map) {
        for (const ref of drag.baseline.keys()) {
            drag.baseline.set(ref, { x: ref.x || 0, y: ref.y || 0 });
        }
    }

    const entities = Array.isArray(feature?.entities) ? feature.entities : [];
    const entityById = new Map(entities.filter(e => e?.id).map(e => [e.id, e]));
    const pointById = new Map(entities.filter(e => e?.type === 'point' && e?.id).map(e => [e.id, e]));
    drag.arcControlBaseline = [];
    for (const id of (drag.activeIds || [])) {
        const entity = entityById.get(id);
        if (entity?.type !== 'arc' || !entity.id) continue;
        if (!Number.isFinite(entity.mx) || !Number.isFinite(entity.my)) continue;
        const pa = pointById.get(entity.a) || null;
        const pb = pointById.get(entity.b) || null;
        drag.arcControlBaseline.push({
            entity,
            mx: entity.mx,
            my: entity.my,
            cx: Number(entity.cx || 0),
            cy: Number(entity.cy || 0),
            radius: Number(entity.radius || 0),
            a: pa ? { x: pa.x || 0, y: pa.y || 0 } : null,
            b: pb ? { x: pb.x || 0, y: pb.y || 0 } : null
        });
    }
}

function sampleArcPolyline(arc, a, b, segments = 24) {
    if (isCircleCurve(arc)) {
        const cx = Number(arc?.cx);
        const cy = Number(arc?.cy);
        let radius = Number(arc?.radius);
        if (!Number.isFinite(radius) || radius <= 0) {
            radius = a ? Math.hypot((a.x || 0) - cx, (a.y || 0) - cy) : 0;
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || radius <= 0) {
            return [];
        }
        const count = Math.max(24, segments * 2);
        let start = 0;
        if (a) {
            start = Math.atan2((a.y || 0) - cy, (a.x || 0) - cx);
        }
        const pts = [];
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const angle = start + t * Math.PI * 2;
            pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
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
        const geomFromThree = this.computeArcGeometry(
            { x: a.x || 0, y: a.y || 0 },
            { x: b.x || 0, y: b.y || 0 },
            { x: arc.mx, y: arc.my }
        );
        if (geomFromThree) {
            cx = geomFromThree.cx;
            cy = geomFromThree.cy;
            radius = geomFromThree.radius;
            startAngle = geomFromThree.startAngle;
            endAngle = geomFromThree.endAngle;
            ccw = geomFromThree.ccw;
        }
    }
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
        if (!a || !b) return [];
        const geom = this.computeArcGeometry(a, b, { x: ((a.x || 0) + (b.x || 0)) * 0.5, y: ((a.y || 0) + (b.y || 0)) * 0.5 + 1e-3 });
        if (!geom) return [{ x: a.x || 0, y: a.y || 0 }, { x: b.x || 0, y: b.y || 0 }];
        startAngle = geom.startAngle;
        endAngle = geom.endAngle;
        cx = geom.cx;
        cy = geom.cy;
        radius = geom.radius;
        ccw = geom.ccw;
    }
    if (!Number.isFinite(radius) || radius <= 0) {
        radius = a ? Math.hypot((a.x || 0) - cx, (a.y || 0) - cy) : 0;
    }
    if (radius <= 0) return [];
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
    const count = Math.max(6, segments);
    const pts = [];
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const angle = startAngle + sweep * t;
        pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    if (a) {
        pts[0] = { x: a.x || 0, y: a.y || 0 };
    }
    if (b) {
        pts[pts.length - 1] = { x: b.x || 0, y: b.y || 0 };
    }
    return pts;
}

function distanceToSegmentPx(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq <= 1e-9) {
        return Math.hypot(px - ax, py - ay);
    }
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const cx = ax + abx * t;
    const cy = ay + aby * t;
    return Math.hypot(px - cx, py - cy);
}

function getEventViewportXY(event) {
    const { renderer } = space.internals();
    const canvas = renderer?.domElement;
    if (!canvas || !event) {
        return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
    };
}

function getSketchBasis(feature) {
    const rec = api.sketchRuntime?.getRecord?.(feature?.id);
    const entitiesGroup = rec?.entitiesGroup;
    if (entitiesGroup) {
        entitiesGroup.updateMatrixWorld(true);
        const xAxis = new THREE.Vector3();
        const yAxis = new THREE.Vector3();
        const normal = new THREE.Vector3();
        entitiesGroup.matrixWorld.extractBasis(xAxis, yAxis, normal);
        xAxis.normalize();
        yAxis.normalize();
        normal.normalize();
        // Re-orthogonalize in case parent transforms introduce drift.
        yAxis.copy(new THREE.Vector3().crossVectors(normal, xAxis).normalize());
        xAxis.copy(new THREE.Vector3().crossVectors(yAxis, normal).normalize());
        const origin = new THREE.Vector3();
        entitiesGroup.getWorldPosition(origin);
        return { origin, normal, xAxis, yAxis };
    }

    const frame = feature?.plane;
    if (!frame) return null;
    const origin = new THREE.Vector3(
        frame.origin?.x || 0,
        frame.origin?.y || 0,
        frame.origin?.z || 0
    );
    const normal = new THREE.Vector3(
        frame.normal?.x ?? 0,
        frame.normal?.y ?? 0,
        frame.normal?.z ?? 1
    ).normalize();
    const xAxis = new THREE.Vector3(
        frame.x_axis?.x ?? 1,
        frame.x_axis?.y ?? 0,
        frame.x_axis?.z ?? 0
    ).normalize();
    const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
    return { origin, normal, xAxis, yAxis };
}

function sketchLocalToWorld(local, basis) {
    return basis.origin.clone()
        .addScaledVector(basis.xAxis, local.x || 0)
        .addScaledVector(basis.yAxis, local.y || 0);
}

function projectEventToSketchLocal(event, feature) {
    const basis = this.getSketchBasis(feature);
    const vp = this.getEventViewportXY(event);
    if (!basis || !vp) {
        return null;
    }

    const { camera } = space.internals();
    if (!camera) {
        return null;
    }

    const ndc = new THREE.Vector2(
        (vp.x / vp.width) * 2 - 1,
        -(vp.y / vp.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);

    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(basis.normal, basis.origin);
    const world = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, world);
    if (!hit) {
        return null;
    }

    const rel = world.clone().sub(basis.origin);
    return {
        x: rel.dot(basis.xAxis),
        y: rel.dot(basis.yAxis)
    };
}

export {
    pointerDistance,
    hitTestSketchEntity,
    getArcCenterLocalFromEntity,
    getSketchEntityHitFromIntersections,
    resolveSketchHit,
    resolveDerivedEdgeCandidate,
    projectFaceBoundaryToSketch,
    worldToSketchLocal,
    isSketchEventInViewport,
    getSketchHitLocalPoint,
    getSketchDragSnapTarget,
    findPointByCoord,
    ensureSketchPoint,
    getLineEndpoints,
    getArcEndpoints,
    applyCircleDragKinematics,
    projectPointOnArcConstraintsForArcs,
    rebaseSketchDragState,
    sampleArcPolyline,
    distanceToSegmentPx,
    getEventViewportXY,
    getSketchBasis,
    sketchLocalToWorld,
    projectEventToSketchLocal
};
