/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { buildSeedProvenance } from './provenance.js';
import { extrudePolygons } from './kernel.js';

function profileLoopFromRuntime(api, sketchId, profileId) {
    const rec = api.sketchRuntime?.getRecord?.(sketchId);
    const view = rec?.entityViews?.get?.(profileId);
    const loop = view?.object?.userData?.sketchProfileLoop || view?.entity?.loop || null;
    return Array.isArray(loop) && loop.length >= 3 ? loop : null;
}

function makeBodyId(featureId, index) {
    return `${featureId}:body:${index}`;
}

async function rebuildGeneratedSolids(api, options = {}) {
    const doc = api.document.current;
    if (!doc) return [];

    const builtFeatures = api.features.listBuilt();
    const solids = [];
    let bodySeq = 0;

    for (const feature of builtFeatures) {
        if (feature?.type !== 'extrude') continue;
        const profiles = Array.isArray(feature?.input?.profiles) ? feature.input.profiles : [];
        if (!profiles.length) continue;
        const distance = Number(feature?.params?.distance || 1);

        for (const profileTarget of profiles) {
            const sketchId = profileTarget?.sketchId || null;
            const profileId = profileTarget?.profileId || null;
            if (!sketchId || !profileId) continue;
            const loop = profileLoopFromRuntime(api, sketchId, profileId);
            const bodyIndex = bodySeq++;
            const id = makeBodyId(feature.id, bodyIndex);
            const body = {
                id,
                name: `${feature.name || 'Extrude'}-${bodyIndex + 1}`,
                visible: feature.visible !== false,
                source: {
                    feature_id: feature.id,
                    feature_type: feature.type,
                    profile: profileTarget
                },
                provenance: buildSeedProvenance(feature, profileTarget, bodyIndex),
                mesh: null,
                status: loop ? 'pending_manifold' : 'missing_profile_loop'
            };

            if (loop) {
                // Initial direct-manifold path. Full boolean/replay topology comes next.
                const result = await extrudePolygons([loop.map(p => [p.x || 0, p.y || 0])], distance);
                if (result?.mesh) {
                    body.status = 'manifold_mesh_ready';
                    body.mesh = {
                        tri_count: (result.mesh?.triVerts?.length || 0) / 3,
                        vert_count: (result.mesh?.vertProperties?.length || 0) / Math.max(1, result.mesh?.numProp || 3)
                    };
                    result.manifold?.delete?.();
                }
            }

            solids.push(body);
        }
    }

    doc.generated = doc.generated || {};
    doc.generated.solids = solids;
    if (options.persist !== false) {
        await api.document.save({
            kind: 'micro',
            opType: 'solid.rebuild',
            undoable: false,
            clearRedo: false,
            payload: {
                reason: options.reason || 'rebuild',
                solids: solids.length
            }
        });
    }
    return solids;
}

export {
    rebuildGeneratedSolids
};

