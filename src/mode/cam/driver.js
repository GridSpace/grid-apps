/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    const KIRI = self.kiri,
        CAM = KIRI.driver.CAM = {
            // init,        // src/mode/cam/client.js
            // slice,       // src/mode/cam/slice.js
            // prepare,     // src/mode/cam/prepare.js
            // export       // src/mode/cam/export.js
        },
        CPRO = CAM.process = {
            LEVEL: 1,
            ROUGH: 2,
            OUTLINE: 3,
            CONTOUR_X: 4,
            CONTOUR_Y: 5,
            TRACE: 6,
            DRILL: 7
        };

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
