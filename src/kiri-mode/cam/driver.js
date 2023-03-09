/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: main.kiri
// use: kiri.codec
// use: mesh.tool
gapp.register("kiri-mode.cam.driver", [], (root, exports) => {

const { kiri } = root;
const { driver } = kiri;
const CAM = driver.CAM = {};

CAM.process = {
    LEVEL: 1,
    ROUGH: 2,
    OUTLINE: 3,
    CONTOUR_X: 4,
    CONTOUR_Y: 5,
    TRACE: 6,
    DRILL: 7
};

// defer loading until kiri.client and kiri.worker exist
kiri.load(api => {

    if (kiri.client) {
        CAM.surface_prep = function(index, ondone) {
            kiri.client.sync();
            const settings = api.conf.get();
            kiri.client.send("cam_surfaces", { settings, index }, output => {
                ondone(output);
            });
        };

        CAM.surface_show = function(widget) {
            widget.selectFaces(Object.values(widget._surfaces).flat());
        };

        CAM.surface_toggle = function(widget, face, radians, ondone) {
            let surfaces = widget._surfaces = widget._surfaces || {};
            for (let [root, faces] of Object.entries(surfaces)) {
                if (faces.contains(face)) {
                    // delete this face group
                    delete surfaces[root];
                    CAM.surface_show(widget);
                    ondone(Object.keys(surfaces).map(v => parseInt(v)));
                    return;
                }
            }
            kiri.client.send("cam_surface_find", { id: widget.id, face, radians }, faces => {
                if (faces.length) {
                    surfaces[face] = faces;
                    CAM.surface_show(widget);
                }
                ondone(Object.keys(surfaces).map(v => parseInt(v)));
            });
        };

        CAM.surface_clear = function(widget) {
            widget.selectFaces([]);
            widget._surfaces = {};
        };

        CAM.traces = function(ondone, single) {
            kiri.client.sync();
            const settings = api.conf.get();
            const widgets = api.widgets.map();
            kiri.client.send("cam_traces", { settings, single }, output => {
                const ids = [];
                kiri.codec.decode(output).forEach(rec => {
                    ids.push(rec.id);
                    widgets[rec.id].traces = rec.traces;
                });
                ondone(ids);
            });
        };

        CAM.traces_clear = function(ondone) {
            kiri.client.send("cam_traces_clear", {}, () => {
                // console.log({clear_traces: true});
            });
        };
    }

    if (kiri.worker) {
        CAM.surface_prep = function(widget, index) {
            if (!widget.tool) {
                let tool = widget.tool = new mesh.tool();
                let translate = index ? true : false;
                tool.index(widget.getGeoVertices({ unroll: true, translate }));
            }
        };

        CAM.surface_find = function(widget, faces, radians) {
            CAM.surface_prep(widget);
            return widget.tool.findConnectedSurface(faces, radians || 0, 0.0);
        };

        kiri.worker.cam_surfaces = function(data, send) {
            const { settings, index } = data;
            const widgets = Object.values(kiri.worker.cache);
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

        kiri.worker.cam_surface_find = function(data, send) {
            const { id, face, radians } = data;
            const widget = kiri.worker.cache[id];
            const faces = CAM.surface_find(widget, [face], radians);
            send.done(faces);
        }

        kiri.worker.cam_traces = async function(data, send) {
            const { settings, single } = data;
            const widgets = Object.values(kiri.worker.cache);
            const fresh = [];
            for (let widget of widgets) {
                if (await CAM.traces(settings, widget, single)) {
                    fresh.push(widget);
                }
            }
            // const fresh = widgets.filter(widget => CAM.traces(settings, widget, single));
            send.done(kiri.codec.encode(fresh.map(widget => { return {
                id: widget.id,
                traces: widget.traces,
            } } )));
        };

        kiri.worker.cam_traces_clear = function(data, send) {
            for (let widget of Object.values(kiri.worker.cache)) {
                delete widget.traces;
                delete widget.topo;
            }
            send.done({});
        };
    }

});

});
