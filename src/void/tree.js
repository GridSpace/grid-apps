/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../moto/webui.js';
import { api } from './api.js';
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
