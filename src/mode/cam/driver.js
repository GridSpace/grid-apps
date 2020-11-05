/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.CAM) return;

    const KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        CAM = KIRI.driver.CAM = {
            init,
            // slice,       // src/mode/cam/slice.js
            sliceRender,
            // printSetup,  // src/mode/cam/prepare.js
            // printExport, // src/mode/cam/export.js
            printRender
        },
        CPRO = CAM.process = {
            LEVEL: 1,
            ROUGH: 2,
            OUTLINE: 3,
            CONTOUR_X: 4,
            CONTOUR_Y: 5,
            TRACE: 6,
            DRILL: 7
        },
        newLine = BASE.newLine,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon;

    function init(kiri, api) {
        api.event.on("mode.set", (mode) => {
            let isCAM = mode === 'CAM';
            $('set-tools').style.display = isCAM ? '' : 'none';
            kiri.space.platform.setColor(isCAM ? 0xeeeeee : 0xcccccc);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.camTabs.marker.style.display = proc.camTabsOn ? 'flex' : 'none';
            api.ui.camRough.marker.style.display = proc.camRoughOn ? 'flex' : 'none';
            api.ui.camDrill.marker.style.display =
                proc.camDrillingOn || proc.camDrillReg !== 'none' ? 'flex' : 'none';
            api.ui.camOutline.marker.style.display = proc.camOutlineOn ? 'flex' : 'none';
            api.ui.camContour.marker.style.display =
                proc.camContourXOn || proc.camContourYOn ? 'flex' : 'none';
        });
    }

    // runs in browser main
    function sliceRender(widget) {
        let slices = widget.slices;
        if (!slices) return;

        slices.forEach(function(slice) {
            let tops = slice.tops,
                layers = slice.layers,
                outline = layers.outline,
                open = (slice.camMode === CPRO.CONTOUR_X || slice.camMode === CPRO.CONTOUR_Y);

            layers.outline.clear(); // slice raw edges
            layers.trace.clear();   // roughing
            layers.solid.clear();   // outline
            layers.bridge.clear();  // outline x
            layers.flat.clear();    // outline y
            layers.fill.clear();    // facing

            tops.forEach(function(top) {
                outline.poly(top.poly, 0x999900, true, open);
                // if (top.inner) outline.poly(top.inner, 0xdddddd, true);
                if (top.inner) outline.poly(top.inner, 0xff0000, true);
            });

            // various outlining
            let layer;
            slice.tops.forEach(function(top) {
                switch (slice.camMode) {
                    case CPRO.OUTLINE:
                        layer = layers.solid;
                        break;
                    case CPRO.CONTOUR_X:
                        layer = layers.bridge;
                        break;
                    case CPRO.CONTOUR_Y:
                        layer = layers.flat;
                        break;
                    default: // roughing
                        layer = layers.trace;
                        break;
                }
                if (top.traces) {
                    layer.poly(top.traces, 0x010101, true, null);
                }
            });

            // facing (previously separate. now part of roughing)
            layer = slice.layers.fill;
            slice.tops.forEach(function(top) {
                if (top.fill_lines) {
                    layer.lines(top.fill_lines, fill_color);
                }
            });

            outline.render();
            layers.trace.render();
            layers.solid.render();
            layers.bridge.render();
            layers.flat.render();
            layers.fill.render();
        });
    }

    function printRender(print) {
        return KIRI.driver.FDM.printRender(print, {aslines: true, color: 0x010101, move_color: 0xcc3333});
    }

    /**
     * Find top paths to trace when using ball and taper mills
     * in waterline outlining and tracing modes.
     */
    function findTracingPaths(widget, slice, tool, profile, partial) {
        // for now, only emit completed polys and not segments
        // TODO consider limiting to nup path lengths that are >= tool radius
        let only_whole = !partial;
        // check for ball and taper mills paths and add to top[0].inner
        let polys = [];
        let nups = [];
        let cull = [];
        slice.gatherTopPolys([]).forEach(poly => poly.flattenTo(polys));
        polys.forEach(poly => {
            let pz = poly.first().z;
            let mz = -Infinity;
            let np = newPolygon().setOpen();
            let mp = 0;
            // find top poly segments that are not significantly offset
            // from tool profile and add to new polygons which accumulate
            // to the top inner array
            poly.forEachSegment((p1,p2) => {
                let nz = getTopoZPathMax(widget, profile, p1.x, p1.y, p2.x, p2.y);
                if (nz > mz) {
                    mz = nz;
                }
                // this # should be computed from topo resolution
                if (nz - pz < 0.01) {
                    mp++
                    if (np.length) {
                        if (!np.first().isEqual(p2)) {
                            np.append(p2);
                        } else {
                            np.setClosed();
                        }
                    } else {
                        np.append(p1).append(p2);
                    }
                } else if (np.length) {
                    if (!only_whole) {
                        nups.append(np);
                    }
                    np = newPolygon().setOpen();
                }
            });
            if (np.length) {
                if (np.length === poly.length) {
                    np.setClosed();
                }
                // if a trace poly has no interruptions for an endmill
                // and it's an inner poly, eliminate it from the parent
                // so it won't be offset.
                let parent = poly.parent;
                if (np.isClosed() && parent) {
                    // console.log(slice.z,'cull',poly);
                    if (parent.inner) {
                        parent.inner = parent.inner.filter(p => p !== poly);
                    }
                    if (only_whole) {
                        nups.append(np);
                    }
                }
                if (!only_whole) {
                    nups.append(np);
                }
            }
        });
        if (nups.length) {
            // console.log(slice.z,'nups',nups.length);
            slice.tops[0].inner = nups;
        }
    }

})();
