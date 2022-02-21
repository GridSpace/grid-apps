/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// use: kiri.api
gapp.register("kiri-mode.fdm.driver", [], (root, exports) => {

const { kiri } = root;
const { driver } = kiri;
const FDM = driver.FDM = { getRangeParameters };

// shared by client and worker contexts
function getRangeParameters(process, index) {
    if (index === undefined || index === null || index < 0) {
        return process;
    }
    let ranges = process.ranges;
    if (!(ranges && ranges.length)) {
        return process;
    }
    let params = Object.clone(process);
    for (let range of ranges) {
        if (index >= range.lo && index <= range.hi) {
            for (let [key, value] of Object.entries(range.fields)) {
                params[key] = value;
                params._range = true;
            }
        }
    }
    return params;
}

// defer loading until client and worker exist
kiri.load(api => {

    const { client, worker } = kiri;

    if (client) {
        FDM.support_generate = function(ondone) {
            client.clear();
            client.sync();
            const settings = api.conf.get();
            const widgets = api.widgets.map();
            client.send("fdm_support_generate", { settings }, (gen) => {
                if (gen && gen.error) {
                    api.show.alert('support generation canceled');
                    return ondone([]);
                }
                for (let g of gen) {
                    g.widget = widgets[g.id];
                }
                ondone(gen);
            });
        };
    }

    if (worker) {
        worker.fdm_support_generate = function(data, send) {
            const { settings } = data;
            const widgets = Object.values(wcache);
            const fresh = widgets.filter(widget => FDM.supports(settings, widget));
            send.done(kiri.codec.encode(fresh.map(widget => { return {
                id: widget.id,
                supports: widget.supports,
            } } )));
        };
    }

});

});
