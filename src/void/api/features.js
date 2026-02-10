/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

function createFeaturesApi(getApi) {
    function getEffectiveTimelineCount(doc, editFeatureId = null) {
        const features = Array.isArray(doc?.features) ? doc.features : [];
        if (!features.length) return 0;
        const raw = doc?.timeline?.index;
        let count;
        if (raw === null || raw === undefined) {
            count = features.length;
        } else {
            const index = Math.max(-1, Math.min(features.length - 1, Math.floor(raw)));
            count = index + 1;
        }
        if (editFeatureId) {
            const editIndex = features.findIndex(feature => feature?.id === editFeatureId);
            if (editIndex >= 0) {
                count = Math.min(count, editIndex + 1);
            }
        }
        return count;
    }

    return {
        list() {
            const api = getApi();
            const doc = api.document.current;
            return doc ? doc.features : [];
        },

        listBuilt() {
            const api = getApi();
            const doc = api.document.current;
            if (!doc) return [];
            const features = Array.isArray(doc.features) ? doc.features : [];
            const editFeatureId = api.document?.getAtomicEditFeatureId?.() || null;
            const timelineCount = getEffectiveTimelineCount(doc, editFeatureId);
            return features.filter((feature, index) => index < timelineCount && feature?.suppressed !== true);
        },

        isIndexBuilt(index) {
            const api = getApi();
            const doc = api.document.current;
            if (!doc || !Array.isArray(doc.features)) return false;
            const editFeatureId = api.document?.getAtomicEditFeatureId?.() || null;
            const timelineCount = getEffectiveTimelineCount(doc, editFeatureId);
            return index >= 0 && index < timelineCount;
        },

        isBuilt(featureId) {
            const api = getApi();
            const doc = api.document.current;
            if (!doc || !Array.isArray(doc.features)) return false;
            const index = doc.features.findIndex(f => f?.id === featureId);
            if (index < 0) return false;
            return this.isIndexBuilt(index);
        },

        add(feature) {
            const api = getApi();
            const doc = api.document.current;
            if (doc) {
                if (feature?.visible === undefined) {
                    feature.visible = true;
                }
                if (feature?.suppressed === undefined) {
                    feature.suppressed = false;
                }
                doc.features = Array.isArray(doc.features) ? doc.features : [];
                const rawTimeline = doc.timeline?.index;
                const hasTimelineMarker = rawTimeline !== null && rawTimeline !== undefined && Number.isFinite(rawTimeline);
                const timelineIndex = hasTimelineMarker
                    ? Math.max(-1, Math.min(doc.features.length - 1, Math.floor(rawTimeline)))
                    : (doc.features.length - 1);
                const insertIndex = hasTimelineMarker ? (timelineIndex + 1) : doc.features.length;
                doc.features.splice(insertIndex, 0, feature);
                api.document.save({
                    kind: 'micro',
                    opType: 'feature.add',
                    payload: {
                        type: feature?.type || 'unknown',
                        id: feature?.id || null
                    }
                });
                if (hasTimelineMarker) {
                    // Keep marker at the newly inserted feature so downstream remains disabled.
                    doc.timeline.index = insertIndex;
                }
                api.sketchRuntime?.sync();
                api.solids?.scheduleRebuild?.('feature.add');
            }
        },

        remove(feature) {
            const api = getApi();
            const doc = api.document.current;
            if (doc) {
                const index = doc.features.indexOf(feature);
                if (index >= 0) {
                    doc.features.splice(index, 1);
                    if (doc.timeline && doc.timeline.index !== null && doc.timeline.index !== undefined) {
                        const timelineIndex = Math.floor(doc.timeline.index);
                        if (timelineIndex >= doc.features.length) {
                            doc.timeline.index = doc.features.length ? doc.features.length - 1 : null;
                        }
                    }
                    api.document.save({
                        kind: 'micro',
                        opType: 'feature.remove',
                        payload: {
                            type: feature?.type || 'unknown',
                            id: feature?.id || null
                        }
                    });
                    api.sketchRuntime?.sync();
                    api.solids?.scheduleRebuild?.('feature.remove');
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
            api.solids?.scheduleRebuild?.('feature.update');
            return feature;
        },

        mutateTransient(featureId, mutator) {
            const api = getApi();
            const feature = this.findById(featureId);
            if (!feature) return null;
            if (typeof mutator === 'function') {
                mutator(feature);
            } else if (mutator && typeof mutator === 'object') {
                Object.assign(feature, mutator);
            }
            api.sketchRuntime?.sync();
            return feature;
        },

        commit(featureId, options = {}) {
            const api = getApi();
            const feature = this.findById(featureId);
            if (!feature) return null;
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
            api.solids?.scheduleRebuild?.('feature.commit');
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
        },

        setSuppressed(featureId, suppressed) {
            return this.update(featureId, feature => {
                feature.suppressed = !!suppressed;
            }, {
                opType: 'feature.suppress',
                payload: { field: 'suppressed', value: !!suppressed }
            });
        },

        move(featureId, toIndex) {
            const api = getApi();
            const doc = api.document.current;
            if (!doc || !featureId || !Array.isArray(doc.features)) return false;
            const fromIndex = doc.features.findIndex(f => f?.id === featureId);
            if (fromIndex < 0) return false;
            const clamped = Math.max(0, Math.min(doc.features.length - 1, Math.floor(Number(toIndex))));
            if (clamped === fromIndex) return false;
            const [feature] = doc.features.splice(fromIndex, 1);
            doc.features.splice(clamped, 0, feature);
            api.document.save({
                kind: 'micro',
                opType: 'feature.move',
                payload: { id: featureId, from: fromIndex, to: clamped }
            });
            api.sketchRuntime?.sync();
            api.solids?.scheduleRebuild?.('feature.move');
            return true;
        }
    };
}

export { createFeaturesApi };
