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
                if (feature?.visible === undefined) {
                    feature.visible = true;
                }
                doc.features.push(feature);
                api.document.save({
                    kind: 'micro',
                    opType: 'feature.add',
                    payload: {
                        type: feature?.type || 'unknown',
                        id: feature?.id || null
                    }
                });
                api.sketchRuntime?.sync();
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
                    api.sketchRuntime?.sync();
                }
            }
        },

        findById(id) {
            const api = getApi();
            const doc = api.document.current;
            if (!doc || !Array.isArray(doc.features)) return null;
            return doc.features.find(f => f?.id === id) || null;
        },

        update(featureId, mutator, options = {}) {
            const api = getApi();
            const doc = api.document.current;
            if (!doc || !featureId) return null;
            const feature = this.findById(featureId);
            if (!feature) return null;

            if (typeof mutator === 'function') {
                mutator(feature);
            } else if (mutator && typeof mutator === 'object') {
                Object.assign(feature, mutator);
            }

            api.document.save({
                kind: 'micro',
                opType: options.opType || 'feature.update',
                payload: {
                    id: feature.id,
                    type: feature.type || 'unknown',
                    changes: options.payload || null
                }
            });

            api.sketchRuntime?.sync();
            return feature;
        },

        rename(featureId, name) {
            const nextName = String(name || '').trim();
            if (!nextName) return null;
            return this.update(featureId, feature => {
                feature.name = nextName;
            }, {
                opType: 'feature.rename',
                payload: { name: nextName }
            });
        },

        setVisible(featureId, visible) {
            return this.update(featureId, feature => {
                feature.visible = !!visible;
            }, {
                opType: 'feature.update',
                payload: { field: 'visible', value: !!visible }
            });
        }
    };
}

export { createFeaturesApi };
