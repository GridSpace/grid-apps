/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { codec } from '../../kiri/codec.js';
import { cam_slice, holes, traces } from './slice.js';
import { cam_prepare } from './prepare.js';
import { cam_export } from './export.js';
import { tool as mesh_tool } from '../../mesh/tool.js';

function surface_prep(widget, index) {
    if (!widget.tool) {
        let tool = widget.tool = new mesh_tool();
        let translate = index ? true : false;
        tool.index(widget.getGeoVertices({ unroll: true, translate }));
    }
};

function surface_find(widget, faces, radians) {
    surface_prep(widget);
    return widget.tool.findConnectedSurface(faces, radians || 0, 0.0);
};

function init(worker) {
    worker.cam_surfaces = function(data, send) {
        const { settings, index } = data;
        const widgets = Object.values(worker.cache);
        for (let widget of widgets) {
            if (index) {
                widget.setIndexed(true);
                widget.setAxisIndex(-index);
            } else {
                widget.setIndexed(false);
                widget.setAxisIndex(0);
            }
            CAM.surface_prep(widget, index);
        }
        send.done({});
    };

    worker.cam_surface_find = function(data, send) {
        const { id, face, radians } = data;
        const widget = worker.cache[id];
        const faces = surface_find(widget, [face], radians);
        send.done(faces);
    }

    worker.cam_traces = async function(data, send) {
        const { settings, single } = data;
        const widgets = Object.values(worker.cache);
        const fresh = [];
        for (let widget of widgets) {
            if (await traces(settings, widget, single)) {
                fresh.push(widget);
            }
        }
        // const fresh = widgets.filter(widget => traces(settings, widget, single));
        send.done(codec.encode(fresh.map(widget => { return {
            id: widget.id,
            traces: widget.traces,
        } } )));
    };

    worker.cam_traces_clear = function(data, send) {
        for (let widget of Object.values(worker.cache)) {
            delete widget.traces;
            delete widget.topo;
        }
        send.done({});
    };

    worker.cam_holes = async function(data, send) {
        const { settings, indiv, rec } = data;
        const widgets = Object.values(worker.cache);
        const fresh = [];

        for (let [i,widget] of widgets.entries() ) {
            if (await holes(settings, widget, indiv, rec,
                ( prog, msg )=>{ send.data({progress: (i/widgets.length)+(prog/widgets.length),msg})}
            )){
                fresh.push(widget);
            }
        }

        // const fresh = widgets.filter(widget => CAM.traces(settings, widget, single));
        send.done(codec.encode(fresh.map(widget => { return {
            id: widget.id,
            holes: widget.drills,
            shadowed:widget.shadowedDrills
        } } )));
    }
}

export const CAM = {
    init,
    surface_prep,
    surface_find,
    slice: cam_slice,
    prepare: cam_prepare,
    export: cam_export
};
