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
    selectedFeatureId: null,
    _boundRuntimeChanges: false,

    build() {
        this.container = $('left-panel');
        if (!this.container) return;

        this.bindRuntimeChanges();
        window.addEventListener('keydown', event => {
            const isDelete = event.key === 'Delete' || event.key === 'Backspace';
            if (!isDelete) return;
            if (event.defaultPrevented) return;
            const activeTag = document.activeElement?.tagName;
            const editing = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable;
            if (editing) return;
            if (api.interact?.isSketchEditing?.()) return;
            const selectedId = this.selectedFeatureId;
            if (!selectedId) return;
            const feature = api.features.findById(selectedId);
            if (!feature) return;
            api.features.remove(feature);
            if (properties.currentFeatureId === selectedId) {
                properties.hide();
            }
            if (api.sketchRuntime?.editingId === selectedId) {
                api.sketchRuntime.setEditing(null);
                api.interact?.clearSketchSelection?.();
            }
            this.selectedFeatureId = null;
            this.render();
            window.dispatchEvent(new CustomEvent('void-state-change'));
            event.preventDefault();
        });
        this.container.addEventListener('mouseleave', () => {
            api.sketchRuntime?.setHovered(null);
        });
        this.render();

        console.log({ tree_built: true });
    }
};

Object.assign(tree, modelOps);
Object.assign(tree, renderOps);

export { tree };
