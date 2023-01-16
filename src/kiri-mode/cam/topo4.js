/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.line
// dep: geo.point
// dep: geo.polygon
// dep: geo.polygons
// dep: kiri.slice
// dep: kiri-mode.cam.driver
// dep: kiri-mode.cam.slicer2
// dep: moto.broker
gapp.register("kiri-mode.cam.topo", [], (root, exports) => {

const { base, kiri } = root;
const { driver, newSlice } = kiri;
const { CAM } = driver;
const { polygons, newLine, newSlope, newPoint, newPolygon } = base;

const PRO = CAM.process;
const POLY = polygons;
const RAD2DEG = 180 / Math.PI;

class Topo4 {
    constructor() { }

    async generate(opt = {}) {
        let { state, op, onupdate, ondone } = opt;
        let { widget, settings, tabs } = opt.state;
        let { controller, process } = settings;

        let axis = op.axis.toLowerCase(),
            tool = new CAM.Tool(settings, op.tool),
            bounds = widget.getBoundingBox().clone(),
            density = parseInt(controller.animesh || 100) * 2500,
            { min, max } = bounds,
            span = {
                x: max.x - min.x,
                y: max.y - min.y
            },
            contour = {
                x: axis === "x",
                y: axis === "y"
            },
            tolerance = op.tolerance,
            zMin = min.z + 0.0001,
            resolution = tolerance ? tolerance : 1 / Math.sqrt(density / (span.x * span.y)),
            toolOffset = tool.generateProfile(resolution).profile,
            toolDiameter = tool.fluteDiameter(),
            toolStep = toolDiameter * op.step,
            steps = {
                x: Math.ceil(span.x / resolution),
                y: Math.ceil(span.y / resolution)
            };

        if (tolerance === 0) {
            console.log(widget.id, 'topo4 auto tolerance', resolution.round(4));
        }

        this.tolerance = resolution;

        onupdate(0, "lathe");
        onupdate(1, "lathe");

        ondone([]);
    }
}

CAM.Topo4 = async function(opt) {
    return new Topo4().generate(opt);
};

moto.broker.subscribe("minion.started", msg => {
    const { funcs, cache, reply, log } = msg;

    funcs.topo4_raster = (data, seq) => {
    };

    funcs.trace4_init = data => {
    };

    funcs.trace4_y = (data, seq) => {
    };

    funcs.trace4_x = (data, seq) => {
        const { cache } = self;
        const { trace } = cache.trace;
        trace.crossX_sync(data.params, slice => {
            slice = kiri.codec.encode(slice);
            reply({ seq, slice });
        });
    };

    funcs.trace4_cleanup = () => {
        delete cache.trace;
    };
});

});
