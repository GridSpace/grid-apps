/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function createSketchApi(getApi, idFactory) {
    return {
        createFromTarget(target) {
            const api = getApi();
            const doc = api.document.current;
            if (!doc || !target?.frame) {
                return null;
            }
            const sketchCount = (doc.features || []).filter(f => f?.type === 'sketch').length;
            const feature = {
                id: idFactory(),
                type: 'sketch',
                name: `Sketch ${sketchCount + 1}`,
                created_at: Date.now(),
                plane: JSON.parse(JSON.stringify(target.frame)),
                entities: [],
                constraints: [],
                dimensions: [],
                target: {
                    kind: target.kind || 'plane',
                    id: target.id || null,
                    name: target.name || null,
                    label: target.label || null,
                    source: target.source || null,
                    offset: Number(target?.offset || 0)
                }
            };
            api.features.add(feature);
            return feature;
        }
    };
}

export { createSketchApi };
