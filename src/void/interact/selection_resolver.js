/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { THREE } from '../../ext/three.js';

const DEFAULTS = Object.freeze({
    sketchFaceEpsilon: 0.25,
    edgeGateDistance: 2.5
});

const SELECTION_INTENTS = Object.freeze({
    profile: 'profile',
    solidFace: 'solid-face',
    solidEdge: 'solid-edge',
    point: 'point',
    segment: 'segment',
    boundary: 'boundary',
    surface: 'surface',
    region: 'region'
});

const SELECTION_MODES = Object.freeze({
    sketch: 'sketch',
    sketchRetarget: 'sketch-retarget',
    extrudeProfiles: 'extrude-profiles',
    solid: 'solid'
});

function resolvePrimarySurfaceHit(intersections, options = {}) {
    if (!Array.isArray(intersections)) return null;

    const {
        api = null,
        retargetMode = false,
        editingExtrudeProfiles = false,
        sketchFaceEpsilon = DEFAULTS.sketchFaceEpsilon,
        edgeGateDistance = DEFAULTS.edgeGateDistance
    } = options;

    let nearestProfile = null;
    let nearestSolidFace = null;

    for (const hit of intersections) {
        const obj = hit?.object;
        if (!obj) continue;

        const profileId = obj.userData?.sketchProfileId || null;
        const featureId = obj.userData?.sketchFeatureId || null;
        if (!retargetMode && !nearestProfile && profileId && featureId) {
            nearestProfile = {
                type: 'profile',
                distance: Number(hit?.distance) || 0,
                hit: { featureId, profileId, object: obj, intersection: hit }
            };
        }

        if (!nearestSolidFace) {
            const solidFaceHit = api?.solids?.getFaceHitFromIntersections?.([hit]);
            if (solidFaceHit) {
                nearestSolidFace = {
                    type: 'solid-face',
                    distance: Number(hit?.distance) || 0,
                    hit: solidFaceHit
                };
            }
        }
    }

    let nearestSolidEdge = null;
    if (nearestSolidFace?.hit?.solidId) {
        // First preference: real render-edge intersections on the same solid.
        // This matches what is actually drawn (e.g. cylinder cap circles).
        const sameSolidEdgeInts = intersections.filter(hit => {
            const obj = hit?.object;
            return obj?.userData?.solidEdge === true
                && String(obj?.userData?.solidId || '') === String(nearestSolidFace.hit.solidId || '');
        });

        if (sameSolidEdgeInts.length) {
            const edgeHit = api?.solids?.getEdgeHitFromIntersections?.(sameSolidEdgeInts) || null;
            if (edgeHit?.aWorld && edgeHit?.bWorld) {
                const facePoint = nearestSolidFace?.hit?.intersection?.point || null;
                const line = facePoint ? new THREE.Line3(edgeHit.aWorld, edgeHit.bWorld) : null;
                const near = line ? new THREE.Vector3() : null;
                if (line && near) {
                    line.closestPointToPoint(facePoint, true, near);
                    const worldDist = near.distanceTo(facePoint);
                    // Gate edge picks to local neighborhood of the currently hovered face.
                    if (worldDist <= edgeGateDistance) {
                        const faceEdge = api?.solids?.getFaceEdgeHit?.(nearestSolidFace.hit.key, near, edgeGateDistance) || null;
                        const hitEdge = faceEdge || {
                            key: `${edgeHit.solidId}:${edgeHit.index}`,
                            solidId: edgeHit.solidId,
                            index: edgeHit.index,
                            aWorld: edgeHit.aWorld,
                            bWorld: edgeHit.bWorld,
                            midWorld: edgeHit.midWorld
                        };
                        nearestSolidEdge = {
                            type: 'solid-edge',
                            distance: Number(edgeHit?.intersection?.distance) || Math.max(0, (nearestSolidFace.distance || 0) - 1e-4),
                            hit: {
                                ...hitEdge,
                                intersection: edgeHit.intersection || nearestSolidFace.hit.intersection
                            }
                        };
                    }
                }
            }
        }
    }

    if (!nearestSolidEdge && nearestSolidFace?.hit?.key && nearestSolidFace?.hit?.intersection?.point) {
        // Boundary fallback for planar faces (non-planar boundaries can contain seam artifacts).
        const faceMeta = api?.solids?.getFaceByKey?.(nearestSolidFace.hit.key)?.meta || null;
        if (faceMeta?.planar) {
            const edge = api?.solids?.getFaceEdgeHit?.(
                nearestSolidFace.hit.key,
                nearestSolidFace.hit.intersection.point,
                edgeGateDistance
            );
            if (edge) {
                nearestSolidEdge = {
                    type: 'solid-edge',
                    // Slightly prefer edge over owning face when near boundary.
                    distance: Math.max(0, (nearestSolidFace.distance || 0) - 1e-4),
                    hit: {
                        ...edge,
                        intersection: nearestSolidFace.hit.intersection
                    }
                };
            }
        }
    }

    if (editingExtrudeProfiles) {
        return nearestProfile || null;
    }
    if (nearestProfile && nearestSolidEdge && nearestSolidFace) {
        return [nearestProfile, nearestSolidEdge, nearestSolidFace]
            .sort((a, b) => a.distance - b.distance)[0];
    }
    if (nearestProfile && nearestSolidEdge) {
        const delta = nearestProfile.distance - nearestSolidEdge.distance;
        if (delta <= sketchFaceEpsilon) return nearestProfile;
        return nearestSolidEdge;
    }
    if (nearestProfile && nearestSolidFace) {
        const delta = nearestProfile.distance - nearestSolidFace.distance;
        if (delta <= sketchFaceEpsilon) {
            return nearestProfile;
        }
        return nearestSolidFace;
    }
    if (nearestSolidEdge && nearestSolidFace) {
        return nearestSolidEdge.distance <= nearestSolidFace.distance + sketchFaceEpsilon
            ? nearestSolidEdge
            : nearestSolidFace;
    }
    if (nearestProfile) return nearestProfile;
    if (nearestSolidEdge) return nearestSolidEdge;
    if (nearestSolidFace) return nearestSolidFace;
    return null;
}

function resolveSelectionCandidate(intersections, options = {}) {
    const mode = options.mode || SELECTION_MODES.solid;
    const intents = new Set(Array.isArray(options.intents) ? options.intents : []);

    // Phase 1 parity routing:
    // keep current behavior, but route through explicit mode/intent context.
    if (mode === SELECTION_MODES.extrudeProfiles) {
        return resolvePrimarySurfaceHit(intersections, {
            ...options,
            editingExtrudeProfiles: true
        });
    }
    if (intents.size === 0
        || intents.has(SELECTION_INTENTS.profile)
        || intents.has(SELECTION_INTENTS.solidFace)
        || intents.has(SELECTION_INTENTS.solidEdge)) {
        return resolvePrimarySurfaceHit(intersections, options);
    }
    return null;
}

export {
    SELECTION_INTENTS,
    SELECTION_MODES,
    resolvePrimarySurfaceHit,
    resolveSelectionCandidate
};
