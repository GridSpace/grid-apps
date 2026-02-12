/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../moto/webui.js';
import { api } from './api.js';
import { properties } from './properties.js';
import * as modelOps from './tree/model.js';
import * as renderOps from './tree/render.js';

const tree = {
    container: null,
    defaultGeometryExpanded: true,
    featuresExpanded: true,
    solidsExpanded: true,
    selectedFeatureId: null,
    selectedFeatureIds: new Set(),
    selectedSolidIds: new Set(),
    searchQuery: '',
    _searchCaret: 0,
    _searchRestorePending: false,
    _boundRuntimeChanges: false,

    build() {
        this.container = $('left-panel');
        if (!this.container) return;

        this.bindRuntimeChanges();
        window.addEventListener('void-state-change', () => this.render());
        window.addEventListener('void-clear-selection', () => {
            this.selectedFeatureId = null;
            this.selectedFeatureIds.clear();
            this.selectedSolidIds.clear();
            api.solids?.setSelected?.([]);
            api.sketchRuntime?.setSelected([]);
            this.render();
        });
        this.container.addEventListener('mouseleave', () => {
            const planes = api.datum?.getPlanes?.() || [];
            for (const plane of planes) {
                plane.setHovered(false);
            }
            api.sketchRuntime?.setHovered(null);
            api.solids?.setHovered?.([]);
            this.render();
        });
        window.addEventListener('keydown', event => {
            const isDelete = event.key === 'Delete' || event.key === 'Backspace';
            if (!isDelete) return;
            if (event.defaultPrevented) return;
            const activeTag = document.activeElement?.tagName;
            const editing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
            if (editing) return;
            if (api.interact?.isSketchEditing?.()) return;
            const ids = Array.from(this.selectedFeatureIds || []);
            if (!ids.length) return;
            for (const id of ids) {
                const feature = api.features.findById(id);
                if (!feature) continue;
                api.features.remove(feature);
                if (properties.currentFeatureId === id) {
                    properties.hide();
                }
                if (api.sketchRuntime?.editingId === id) {
                    api.sketchRuntime.setEditing(null);
                    api.interact?.clearSketchSelection?.();
                }
            }
            this.selectedFeatureId = null;
            this.selectedFeatureIds.clear();
            this.render();
            window.dispatchEvent(new CustomEvent('void-state-change'));
            event.preventDefault();
        });
        this.render();

        console.log({ tree_built: true });
    }
};

Object.assign(tree, modelOps);
Object.assign(tree, renderOps);

export { tree };
