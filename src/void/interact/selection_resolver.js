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
                hit: { featureId, profileId, object: obj, intersection: hit },
                entity: {
                    kind: 'region',
                    id: `profile:${featureId}:${profileId}`
                }
            };
        }

        if (!nearestSolidFace) {
            const solidFaceHit = api?.solids?.getFaceHitFromIntersections?.([hit]);
            if (solidFaceHit) {
                const faceEntity = api?.solids?.resolveCanonicalFaceEntity?.(solidFaceHit.key) || null;
                nearestSolidFace = {
                    type: 'solid-face',
                    distance: Number(hit?.distance) || 0,
                    hit: solidFaceHit,
                    entity: faceEntity || null
                };
            }
        }
    }

    let nearestSolidEdge = null;
    if (nearestSolidFace?.hit?.key && nearestSolidFace?.hit?.intersection?.point) {
        // Primary path: resolve boundary from the currently hovered face itself.
        // This keeps edge picks aligned with face boundaries and avoids cross-face
        // edge steals (e.g. cylinder seam lines).
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
                },
                entity: api?.solids?.resolveCanonicalEdgeEntity?.(edge.key) || null
            };
        }
    }

    if (!nearestSolidEdge && nearestSolidFace?.hit?.solidId) {
        // Fallback: use rendered edge intersections on the same solid.
        const sameSolidEdgeInts = intersections.filter(hit => {
            const obj = hit?.object;
            return obj?.userData?.solidEdge === true
                && String(obj?.userData?.solidId || '') === String(nearestSolidFace.hit.solidId || '');
        });
        if (sameSolidEdgeInts.length) {
            const edgeHit = api?.solids?.getEdgeHitFromIntersections?.(sameSolidEdgeInts) || null;
            if (edgeHit?.aWorld && edgeHit?.bWorld) {
                const hitEdge = {
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
                },
                entity: api?.solids?.resolveCanonicalEdgeEntity?.(hitEdge.key) || null
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
