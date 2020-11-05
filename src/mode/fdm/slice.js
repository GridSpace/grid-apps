/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        CONF = BASE.config,
        FDM = KIRI.driver.FDM,
        SLICER = KIRI.slicer;

    /**
     * DRIVER SLICE CONTRACT
     *
     * Given a widget and settings object, call functions necessary to produce
     * slices and then the computations using those slices. This function is
     * designed to run client or server-side and provides all output via
     * callback functions.
     *
     * @param {Object} settings
     * @param {Widget} Widget
     * @param {Function} onupdate (called with % complete and optional message)
     * @param {Function} ondone (called when complete with an array of Slice objects)
     */
    FDM.slice = function(settings, widget, onupdate, ondone) {
        FDM.fixExtruders(settings);
        let spro = settings.process,
            sdev = settings.device,
            update_start = Date.now(),
            minSolid = spro.sliceSolidMinArea,
            solidLayers = spro.sliceSolidLayers,
            vaseMode = spro.sliceFillType === 'vase',
            doSolidLayers = solidLayers && !vaseMode,
            metadata = settings.widget[widget.id] || {},
            extruder = metadata.extruder || 0,
            sliceHeight = spro.sliceHeight,
            nozzleSize = sdev.extruders[extruder].extNozzle,
            firstOffset = nozzleSize / 2,
            shellOffset = nozzleSize,
            fillOffsetMult = 1.0 - bound(spro.sliceFillOverlap, 0, 0.8),
            fillSpacing = nozzleSize,
            fillOffset = nozzleSize * fillOffsetMult,
            sliceFillAngle = spro.sliceFillAngle,
            view = widget.mesh && widget.mesh.newGroup ? widget.mesh.newGroup() : null;

        if (!(sliceHeight > 0 && sliceHeight < 100)) {
            return ondone("invalid slice height");
        }
        if (!(nozzleSize >= 0.01 && nozzleSize < 100)) {
            return ondone("invalid nozzle size");
        }

        if (spro.firstSliceHeight === 0) {
            spro.firstSliceHeight = sliceHeight;
        }

        if (spro.firstSliceHeight < sliceHeight) {
            DBUG.log("invalid first layer height < slice height");
            DBUG.log("reverting to slice height");
            spro.firstSliceHeight = sliceHeight;
        }

        SLICER.sliceWidget(widget, {
            height: sliceHeight,
            minHeight: sliceHeight > spro.sliceMinHeight ? spro.sliceMinHeight : 0,
            firstHeight: spro.firstSliceHeight,
            view: view
        }, onSliceDone, onSliceUpdate);

        function onSliceUpdate(update) {
            return onupdate(0.0 + update * 0.5);
        }

        function onSliceDone(slices) {
            // slices = slices.filter(slice => slice.tops.length);
            // remove all empty slices above part but leave below
            // for multi-part (multi-extruder) setups where the void is ok
            let found = false;
            slices = slices.reverse().filter(slice => {
                if (slice.tops.length) {
                    return found = true;
                } else {
                    return found;
                }
            }).reverse();

            widget.slices = slices;

            if (!slices) return;

            // calculate % complete and call onupdate()
            function doupdate(index, from, to, msg) {
                onupdate(0.5 + (from + ((index/slices.length) * (to-from))) * 0.5, msg);
            }

            // for each slice, performe a function and call doupdate()
            function forSlices(from, to, fn, msg) {
                slices.forEach(function(slice) {
                    fn(slice);
                    doupdate(slice.index, from, to, msg)
                });
            }

            // do not hint polygin fill longer than a max span length
            CONF.hint_len_max = UTIL.sqr(spro.sliceBridgeMax);

            // reset (if necessary) for solids and support projections
            slices.forEach(function(slice) {
                slice.extruder = extruder;
                slice.invalidateFill();
                slice.invalidateSolids();
                slice.invalidateSupports();
            });

            let supportEnabled = spro.sliceSupportEnable && spro.sliceSupportDensity > 0.0,
                supportMinArea = spro.sliceSupportArea;

            // create shells and diff inner fillable areas
            forSlices(0.0, 0.2, function(slice) {
                let solid = (
                        slice.index < spro.sliceBottomLayers ||
                        slice.index > slices.length - spro.sliceTopLayers-1 ||
                        spro.sliceFillSparse > 0.95
                    ) && !vaseMode;
                slice.doShells(spro.sliceShells, firstOffset, shellOffset, fillOffset, {
                    vase: vaseMode,
                    thin: spro.detectThinWalls
                });
                if (solid) slice.doSolidLayerFill(fillSpacing, sliceFillAngle);
                sliceFillAngle += 90.0;
            }, "offsets");

            // calculations only relevant when solid layers are used
            if (doSolidLayers) {
                forSlices(0.2, 0.34, function(slice) {
                    slice.doDiff(minSolid);
                }, "diff");
                forSlices(0.34, 0.35, function(slice) {
                    slice.projectFlats(solidLayers);
                    slice.projectBridges(solidLayers);
                }, "solids");
                forSlices(0.35, 0.5, function(slice) {
                    slice.doSolidsFill(fillSpacing, sliceFillAngle, minSolid);
                    sliceFillAngle += 90.0;
                }, "solids");
            }

            // calculations only relevant when supports are enabled
            if (supportEnabled) {
                forSlices(0.5, 0.7, function(slice) {
                    slice.doSupport(spro.sliceSupportOffset, spro.sliceSupportSpan, spro.sliceSupportExtra, supportMinArea, spro.sliceSupportSize, spro.sliceSupportOffset, spro.sliceSupportGap);
                }, "support");
                forSlices(0.7, 0.8, function(slice) {
                    slice.doSupportFill(nozzleSize, spro.sliceSupportDensity, supportMinArea);
                }, "support");
            }

            // sparse layers only present when non-vase mose and sparse % > 0
            if (!vaseMode && spro.sliceFillSparse > 0.0) {
                forSlices(0.8, 1.0, function(slice) {
                    slice.doSparseLayerFill({
                        settings: settings,
                        process: spro,
                        device: sdev,
                        lineWidth: nozzleSize,
                        spacing: fillOffset,
                        density: spro.sliceFillSparse,
                        bounds: widget.getBoundingBox(),
                        height: sliceHeight,
                        type: spro.sliceFillType
                    });
                }, "infill");
            }

            // let polish = spro.polishLayers;
            // // experimental polishing
            // if (polish) {
            //     let polish_layer = Math.floor(polish);
            //     let polish_step = Math.max(polish - polish_layer || 1, 0.25);
            //     widget.polish = {};
            //     let px = [];
            //     let py = [];
            //     // compute x polishing slices
            //     SLICER.sliceWidget(widget, {
            //         height: nozzleSize * polish_step,
            //         swapX: true,
            //         swapY: false,
            //         simple: true
            //     }, (polish_done => {
            //         widget.polish.x = polish_done
            //             .filter(s => s.groups.length)
            //             .map(s => s.groups)
            //             .forEach(p => px.appendAll(p));
            //     }), (polish_update) => {
            //         // console.log({polish_update});
            //     });
            //     // compute y polishing slices
            //     SLICER.sliceWidget(widget, {
            //         height: nozzleSize * polish_step,
            //         swapX: false,
            //         swapY: true,
            //         simple: true
            //     }, (polish_done => {
            //         widget.polish.y = polish_done
            //             .filter(s => s.groups.length)
            //             .map(s => s.groups)
            //             .forEach(p => py.appendAll(p));
            //     }), (polish_update) => {
            //         // console.log({polish_update});
            //     });
            //     // apply polishing finishes to layers
            //     forSlices(1.0, 1.0, (slice) => {
            //         if (polish_layer >= 2) {
            //             let sai = (slice.index - polish_layer);
            //             if (sai % (polish_layer-1) !== 0) {
            //                 return;
            //             }
            //         }
            //         if (slice.index >= polish_layer) {
            //             let sd = slice;
            //             for (let i=0; i<polish_layer; i++) {
            //                 sd = sd.down;
            //             }
            //             let zb = sd.z;
            //             let zt = slice.z;
            //             let pout = [];
            //             let cont = 0;
            //             [px, py].forEach(pa => {
            //
            //             let polys = [];
            //             pa.forEach(p => {
            //                 // rotate and test for self-intersection (points under model)
            //                 p.ensureXY();
            //                 let ox = p._aligned == 'yz' ? 0.1 : 0;
            //                 let oy = p._aligned == 'yz' ? 0 : 0.1;
            //                 p.forEachPoint(pt => {
            //                     let int = p.intersections(
            //                         pt.offset(ox,oy,0),
            //                         pt.offset(ox*10000,oy*10000,0));
            //                     if (int.length > 0) {
            //                         pt._under = true;
            //                     }
            //                 });
            //                 p.restoreXY();
            //
            //                 let lastp = undefined;
            //                 let poly = [];
            //                 // look for qualifying segments
            //                 p.forEachSegment((p1, p2) => {
            //                     // eliminate segments that projected up
            //                     // intersect with the polygon (bottom faces)
            //                     if (p1._under || p2._under) {
            //                         return;
            //                     }
            //                     // skip when both below layer range
            //                     if (p1.z < zb && p2.z < zb) {
            //                         return;
            //                     }
            //                     // skip when both above layer range
            //                     if (p1.z > zt && p2.z > zt) {
            //                         return;
            //                     }
            //                     // skip vertical
            //                     if (p1.x === p2.x && p1.y === p2.y) {
            //                         return;
            //                     }
            //                     // skip horizontal
            //                     // if (p1.z === p2.z) {
            //                     //     return;
            //                     // }
            //                     // order points lowest to highest
            //                     let swap = false;
            //                     if (p1.z > p2.z) {
            //                         let t = p2;
            //                         p2 = p1;
            //                         p1 = t;
            //                         swap = true;
            //                     }
            //                     let trimlo = false;
            //                     let trimhi = false;
            //                     if (p1.z < zb) {
            //                         trimlo = true;
            //                     }
            //                     if (p2.z > zt) {
            //                         trimhi = true;
            //                     }
            //                     let xaxis = p1.x === p2.x;
            //                     if (xaxis) {
            //                         p1 = BASE.newPoint(p1.y,p1.z,p1.x);
            //                         p2 = BASE.newPoint(p2.y,p2.z,p2.x);
            //                     } else {
            //                         p1 = BASE.newPoint(p1.x,p1.z,p1.y);
            //                         p2 = BASE.newPoint(p2.x,p2.z,p2.y);
            //                     }
            //                     let slope = BASE.newSlope(p1, p2);
            //                     let angle = slope.angle;
            //                     if (angle > 80 && angle < 100) {
            //                         return;
            //                     }
            //                     let len = p1.distTo2D(p2);
            //                     let np1 = p1;
            //                     if (trimlo) {
            //                         let zunder = zb - p1.y;
            //                         let zover = p2.y - zb;
            //                         let zdelt = p2.y - p1.y;
            //                         let pct = zunder / zdelt;
            //                         np1 = p1.follow(slope, len * pct);
            //                     }
            //                     if (trimhi) {
            //                         let zunder = zt - p1.y;
            //                         let zover = p2.y - zt;
            //                         let zdelt = p2.y - p1.y;
            //                         let pct = zover / zdelt;
            //                         p2 = p2.follow(slope.invert(), len * pct);
            //                     }
            //                     p1 = np1;
            //                     if (xaxis) {
            //                         p1 = BASE.newPoint(p1.z,p1.x,p1.y);
            //                         p2 = BASE.newPoint(p2.z,p2.x,p2.y);
            //                     } else {
            //                         p1 = BASE.newPoint(p1.x,p1.z,p1.y);
            //                         p2 = BASE.newPoint(p2.x,p2.z,p2.y);
            //                     }
            //                     if (!lastp) {
            //                         poly.push(p1);
            //                         poly.push(p2);
            //                     } else if (p1.isMergable2D(lastp)) {
            //                     // } else if (p1.isEqual(lastp)) {
            //                         poly.push(p2);
            //                         cont++;
            //                     } else if (poly.length) {
            //                         polys.push(poly);
            //                         poly = [p1, p2];
            //                     }
            //                     lastp = p2;
            //                 });
            //                 if (poly.length) {
            //                     polys.push(poly);
            //                 }
            //             });
            //             pout.push(polys);
            //             polys = [];
            //             });
            //
            //             if (pout.length && slice.tops.length) {
            //                 slice.tops[0].polish = {
            //                     x: pout[0]
            //                         .map(a => BASE.newPolygon(a).setOpen())
            //                         // .filter(p => p.perimeter() > nozzleSize)
            //                         ,
            //                     y: pout[1]
            //                         .map(a => BASE.newPolygon(a).setOpen())
            //                         // .filter(p => p.perimeter() > nozzleSize)
            //                 };
            //             }
            //         }
            //     });
            // }

            // report slicing complete
            ondone();
        }

    }

    function bound(v,min,max) {
        return Math.max(min,Math.min(max,v));
    }

})();
