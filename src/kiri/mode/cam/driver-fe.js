/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../core/api.js';
import { codec } from '../../core/codec.js';

function surface_prep(index, ondone) {
    api.client.sync();
    const settings = api.conf.get();
    api.client.send("cam_surfaces", { settings, index }, output => {
        ondone(output);
    });
};

function surface_show(widget) {
    widget.selectFaces(Object.values(widget._surfaces).flat());
};

function cylinder_show(widget) {
    widget.selectFaces(Object.values(widget._cylinders).flat());
};

function surface_toggle(widget, face, radians, ondone) {
    let surfaces = widget._surfaces = widget._surfaces || {};
    for (let [root, faces] of Object.entries(surfaces)) {
        if (faces.contains(face)) {
            // delete this face group
            delete surfaces[root];
            surface_show(widget);
            ondone(Object.keys(surfaces).map(v => parseInt(v)));
            return;
        }
    }
    api.client.send("cam_surface_find", { id: widget.id, face, radians }, faces => {
        if (faces.length) {
            surfaces[face] = faces;
            surface_show(widget);
        }
        ondone(Object.keys(surfaces).map(v => parseInt(v)));
    });
};

function surface_clear(widget) {
    widget.selectFaces([]);
    widget._surfaces = {};
};

function traces(ondone, single) {
    api.client.sync();
    const settings = api.conf.get();
    const widgets = api.widgets.map();
    api.client.send("cam_traces", { settings, single }, output => {
        const ids = [];
        codec.decode(output).forEach(rec => {
            ids.push(rec.id);
            widgets[rec.id].traces = rec.traces;
        });
        ondone(ids);
    });
};

function traces_clear(ondone) {
    api.client.send("cam_traces_clear", {}, () => {
        // console.log({clear_traces: true});
    });
};

function holes(indiv, rec, onProgress, onDone) {
    api.client.sync();
    const settings = api.conf.get();
    return new Promise((res,rej)=>{
        api.client.send("cam_holes", { settings, rec, indiv },  output => {
            let out = codec.decode(output);
            if (out.progress != undefined) {
                //if a progress message,
                onProgress(out.progress,out.msg)
            } else {
                api.hide.alert(alert);
                onDone(out);
                res(out);
            }
        });
    })
};

function cylinderShow(onProgress,onDone){
    kiri.client.sync();
    const settings = api.conf.get();
}

 function cylinderToggle(widget, face, onDone){
    let cyls = widget._cylinders = widget._cylinders || {};
    for (let [root, faces] of Object.entries(cyls)) {
        if (faces.contains(face)) { // if a face group contains the selected face
            // delete this face group
            delete cyls[root];
            CAM.cylinder_show(widget);
            onDone(Object.keys(cyls).map(v => parseInt(v)));
            return;
        }
    }
    //send 
    api.client.send("cam_cylinder_find", { id: widget.id, face }, ({faces,error}) => {
        if (faces?.length) {
            cyls[face] = faces;
            CAM.cylinder_show(widget);
        }
        onDone({faces:Object.keys(cyls).map(v => parseInt(v)),error});
    });
}

 function cylinderClear(widget){
    widget.selectFaces([]);
    widget._cylinders = {};
}

export const CAM = {
    surface_prep,
    surface_show,
    cylinder_show,
    cylinderToggle,
    cylinderClear,
    surface_toggle,
    surface_clear,
    traces,
    traces_clear,
    holes
};
