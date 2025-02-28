/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("kiri.consts", (root, exports) => {

const COLOR = {
    wireframe: 0x444444,
    wireframe_opacity: 0.25,
    selected: [ 0xbbff00, 0xbbee00, 0xbbdd00, 0xbb9900 ],
    deselected: [ 0xffff00, 0xffdd00, 0xffbb00, 0xff9900 ],
    model_opacity: 1.0,
    preview_opacity: 0.0,
    slicing: 0xffaaaa,
    slicing_opacity: 0.5,
    sliced_opacity: 0.0,
    cam_preview: 0x888888,
    cam_preview_opacity_dark: 0.2,
    cam_preview_opacity: 0.1,
    cam_sliced_opacity: 0.2
};

const LISTS = {
    shell: [
        { name: "in-out" },
        { name: "out-in" },
        { name: "alternate" }
    ],
    start: [
        { name: "last" },
        { name: "center" },
        { name: "origin" },
        { name: "random" },
    ],
    infill: [
        { name: "none" },
        { name: "hex" },
        { name: "grid" },
        // { name: "cubic" },
        { name: "linear" },
        { name: "triangle" },
        { name: "gyroid" },
        { name: "vase" }
    ],
    units: [
        { name: "mm" },
        { name: "in" }
    ],
    antialias: [
        { name: "1", id: 1 },
        { name: "2", id: 2 },
        { name: "4", id: 4 },
        { name: "8", id: 8 }
    ],
    detail: [
        { name: "100" },
        { name: "75" },
        { name: "50" },
        { name: "25" },
    ],
    linetype: [
        { name: "path" },
        { name: "flat" },
        { name: "line" }
    ],
    animesh: [
        { name: "100" },
        { name: "200" },
        { name: "300" },
        { name: "400" },
        { name: "500" },
        { name: "600" },
        { name: "700" },
        { name: "800" },
        { name: "900" },
        { name: "1000" },
        { name: "1500" },
        { name: "2000" },
        { name: "2500" },
        { name: "3000" },
        { name: "4000" },
    ],
    select: [
        { name: "loops" },
        { name: "lines" },
        // { name: "surface" }
    ],
    trace: [
        { name: "follow" },
        { name: "clear" }
    ],
    traceoff: [
        { name: "none" },
        { name: "inside" },
        { name: "outside" }
    ],
    zanchor: [
        { name: "top" },
        { name: "middle" },
        { name: "bottom" }
    ],
    xyaxis: [
        { name: "X" },
        { name: "Y" }
    ],
    regaxis: [
        { name: "X" },
        { name: "Y" },
        { name: "-" }
    ],
    regpoints: [
        { name: "2" },
        { name: "3" }
    ],
    thin: [
        { name: "off" },
        { name: "type 1" },
        { name: "type 2" },
        { name: "type 3" }
    ]
};

// primary device mode
const MODES = {
    FDM:   1,  // fused deposition modeling (also FFF)
    LASER: 2,  // laser cutters (base for all 2d device types)
    CAM:   3,  // 3 axis milling/machining
    SLA:   4,  // cured resin printers
    DRAG:  5,  // drag knife (a variation on laser / 2d)
    WJET:  6,  // waterjet (a varation on laser / 2d)
    WEDM:  7   // wire-edm (a variation on laser / 2d)
};

// view mode within device mode
const VIEWS = {
    ARRANGE: 1,
    SLICE:   2,
    PREVIEW: 3,
    ANIMATE: 4
};

// preview modes
const PMODES = {
    SPEED: 1,
    TOOLS: 2
};

const SEED = 'kiri-seed';

exports({
    PMODES,
    COLOR,
    LISTS,
    MODES,
    VIEWS,
    SEED,
    beltfact: Math.cos(Math.PI / 4)
});

});
