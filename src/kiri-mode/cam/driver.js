/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: main.kiri
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
        const widgets = Object.values(wcache);
        const fresh = widgets.filter(widget => CAM.traces(settings, widget, single));
        send.done(kiri.codec.encode(fresh.map(widget => { return {
            id: widget.id,
            traces: widget.traces,
        } } )));
    };

});

});
