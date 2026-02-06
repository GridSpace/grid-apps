/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function createFeaturesApi(getApi) {
    return {
        list() {
            const api = getApi();
            const doc = api.document.current;
            return doc ? doc.features : [];
        },

        add(feature) {
            const api = getApi();
            const doc = api.document.current;
            if (doc) {
                doc.features.push(feature);
                api.document.save({
                    kind: 'micro',
                    opType: 'feature.add',
                    payload: {
                        type: feature?.type || 'unknown',
                        id: feature?.id || null
                    }
                });
            }
        },

        remove(feature) {
            const api = getApi();
            const doc = api.document.current;
            if (doc) {
                const index = doc.features.indexOf(feature);
                if (index >= 0) {
                    doc.features.splice(index, 1);
                    api.document.save({
                        kind: 'micro',
                        opType: 'feature.remove',
                        payload: {
                            type: feature?.type || 'unknown',
                            id: feature?.id || null
                        }
                    });
                }
            }
        }
    };
}

export { createFeaturesApi };
