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

    if (kiri.client)
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

    if (kiri.worker)
    kiri.worker.cam_traces = function(data, send) {
        const { settings, single } = data;
        const widgets = Object.values(kiri.worker.cache);
        const fresh = widgets.filter(widget => CAM.traces(settings, widget, single));
        send.done(kiri.codec.encode(fresh.map(widget => { return {
            id: widget.id,
            traces: widget.traces,
        } } )));
    };

    if (kiri.client)
    CAM.surfaces = function(ondone) {
        kiri.client.sync();
        const settings = api.conf.get();
        kiri.client.send("cam_surfaces", { settings }, output => {
            ondone(output);
        });
    };

    if (kiri.worker)
    kiri.worker.cam_surfaces = function(data, send) {
        const { settings } = data;
        const widgets = Object.values(kiri.worker.cache);
        for (let widget of widgets) {
            if (!widget.tool) {
                let tool = widget.tool = new mesh.tool();
                tool.generateFaceMap(widget.getVertices().array);
            }
        }
        send.done({});
    };

    if (kiri.client)
    CAM.surface_find = function(id, face, ondone) {
        kiri.client.send("cam_surface_find", { id, face }, faces => {
            ondone(faces);
        });
    };

    if (kiri.worker)
    kiri.worker.cam_surface_find = function(data, send) {
        const { id, face } = data;
        const widget = kiri.worker.cache[id];
        const faces = widget.tool.findConnectedSurface([face], 0.1, 0.001);
        send.done(faces);
    };
});

});
