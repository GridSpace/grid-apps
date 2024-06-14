/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: kiri-mode.laser.driver
gapp.register("kiri-mode.wedm.driver", [], (root, exports) => {

const { kiri, moto } = root;
const DRIVERS = kiri.driver;
const { CAM, LASER } = DRIVERS;
const { TYPE } = LASER;
const WEDM = DRIVERS.WEDM = Object.assign({}, LASER, {
    name: "WireEDM",
    type: TYPE.WEDM,
    init,
    prepare
});
const DEG2RAD = Math.PI / 180;

const state = {
    api: undefined,
    alert: undefined,
    radians: 0,
    surfaces: [],
    selecting: false
};

function faceAdd() {
    if (state.selecting) return faceDone();

    const { api, radians, surfaces } = state;
    CAM.surface_prep(radians, () => {
        api.hide.alert(alert);
        state.alert = api.show.alert("[esc] cancels surface selection");
        for (let [wid, arr] of Object.entries(surfaces)) {
            let widget = api.widgets.forid(wid);
            if (widget && arr.length)
            for (let faceid of arr) {
                CAM.surface_toggle(widget, faceid, radians, faceids => {
                    // surfaces[widget.id] = faceids;
                });
            }
        }
        api.feature.on_mouse_up = (obj, ev) => {
            let { face } = obj;
            let min = Math.min(face.a, face.b, face.c);
            let faceid = min / 3;
            let widget = obj.object.widget;
            CAM.surface_toggle(widget, faceid, radians, faceids => {
                surfaces[widget.id] = faceids;
            });
        };
        state.selecting = true;
    });
}

function faceDone() {
    if (!state.selecting) return;

    const { api, alert, surfaces } = state;
    for (let wid of Object.keys(surfaces)) {
        let widget = api.widgets.forid(wid);
        if (widget) {
            CAM.surface_clear(widget);
        } else {
            delete surfaces[wid];
        }
    }
    api.hide.alert(alert);
    api.feature.on_mouse_up = undefined;
    api.ui.faceAdd.classList.remove('editing')
    state.selecting = false;
}

function init(kiri, api, driver) {
    LASER.init(kiri, api, driver);

    state.api = api;

    api.event.on("key.esc", () => {
        if (state.selecting) {
            faceDone();
        }
    });

    // api.event.on("mode.set", (mode) => { });

    // api.event.on("view.set", (mode) => { });

    api.event.on("preview.view", view => {
        const process = api.conf.get().process;
        if (!process.ctOriginBounds) return;
        const bounds = new THREE.Box3().expandByObject(view);
        api.platform.set_bounds(new THREE.Box3(
            new THREE.Vector3(bounds.min.x, bounds.min.z, bounds.min.y),
            new THREE.Vector3(bounds.max.x, bounds.max.z, bounds.max.y),
        ));
    });

    // Surface Selection Buttons
    api.event.on("button.click", target => {
        let process = api.conf.get().process;
        switch (target) {
            case api.ui.faceAdd:
                target.classList.add('editing');
                return faceAdd();
            case api.ui.faceDun:
                return faceDone();
            case api.ui.faceClr:
                api.uc.confirm("clear surface selection?").then(ok => {
                    // todo
                });
                break;
        }
    });

};

async function prepare(widgets, settings, update) {
    // let device = settings.device,
    //     process = settings.process,
    //     print = self.worker.print = kiri.newPrint(settings, widgets),
    //     output = print.output = [];

    // filter ignored widgets
    widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);

    LASER.prepare(widgets, settings, update);
}

});

