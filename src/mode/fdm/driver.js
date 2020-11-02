/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.FDM) return;

    const KIRI = self.kiri,
        BASE = self.base,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        CONF = BASE.config,
        POLY = BASE.polygons,
        FDM = KIRI.driver.FDM = {
            init,
            slice,
            sliceRender,
            printSetup,
            printExport,
            printRender
        },
        SLICER = KIRI.slicer,
        newPoint = BASE.newPoint;

    // customer gcode post function for XYZ daVinci Mini W
    self.kiri_fdm_xyz_mini_w = function(gcode, options) {
        return btoa("; filename = kirimoto.gcode\n; machine = dv1MW0A000\n" + gcode);
    };

    function bound(v,min,max) {
        return Math.max(min,Math.min(max,v));
    }

    function fixExtruders(settings) {
        Object.entries(settings.widget).forEach(arr => {
            let [wid,val] = arr;
            let dext = settings.device.extruders[val.extruder];
            if (!dext) {
                settings.widget[wid].extruder = 0;
            }
        });
        return settings;
    }

    function init(kiri, api) {
        api.event.on("settings.load", (settings) => {
            if (settings.mode !== 'FDM') return;
            settings.process.outputOriginCenter = (settings.device.originCenter || false);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.fdmSupport.marker.style.display = proc.sliceSupportEnable ? 'flex' : 'none';
            api.ui.fdmInfill.marker.style.display = proc.sliceFillSparse > 0 ? 'flex' : 'none';
            api.ui.fdmRaft.marker.style.display = proc.outputRaft ? 'flex' : 'none';
        });
    }

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
    function slice(settings, widget, onupdate, ondone) {
        fixExtruders(settings);
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

    /**
     * DRIVER SLICE RENDER CONTRACT
     *
     * @param {Object} widget to render
     * @param {number} mode to use to select colors
     */
    function sliceRender(widget) {
        let slices = widget.slices;
        let settings = widget.settings;
        let extnum = widget.getExtruder(settings);
        let extarr = settings.device.extruders || [];
        let extinfo = extarr[extnum || 0];
        let extoff = (extinfo.extNozzle || 0.4) / 2;
        let thin = settings.controller.thinRender && settings.mode === 'FDM';

        if (!slices) return;

        // render outline
        slices.forEach(function(s) {
            let layers = s.layers;
            let tops = s.tops;
            let outline = layers.outline;
            let shells = layers.trace;
            let solids = layers.fill;
            let sparse = layers.sparse;
            let support = layers.support;
            let outsolid = layers.solid;
            let outbridge = layers.bridge;
            let outflat = layers.flat;

            outline.clear();
            shells.clear();
            solids.clear();
            sparse.clear();
            support.clear();
            outsolid.clear();
            outbridge.clear();
            outflat.clear();

            outline.setTransparent(true);
            shells.setTransparent(false);
            solids.setTransparent(false);
            sparse.setTransparent(false);
            support.setTransparent(false);
            outsolid.setTransparent(true);
            outbridge.setTransparent(true);
            outflat.setTransparent(true);

            tops.forEach(function(top) {
                // outline
                outline.poly(top.poly, 0xdddddd, true, false);
                outline.solid(top.poly, thin ? 0xdddddd : 0xcccccc);
                if (top.inner) outline.poly(top.inner, 0xdddddd, true);
                // if (top.thinner) outline.poly(top.thinner, 0x559999, true, null);

                // shells
                if (thin) {
                    shells.poly(top.traces, 0x77bbcc, true);
                } else {
                    shells.noodle(top.traces, extoff, 0x88aadd, 0x77bbcc);
                }
                if (top.polish) {
                    shells.poly(top.polish.x, 0x880000, true);
                    shells.poly(top.polish.y, 0x880000, true);
                }

                // solid fill
                if (thin) {
                    solids.lines(top.thin_fill, 0x77bbcc);
                    solids.lines(top.fill_lines, 0x77bbcc);
                } else {
                    solids.noodle_lines(top.thin_fill, extoff, 0x88aadd, 0x77bbcc, s.z);
                    solids.noodle_lines(top.fill_lines, extoff, 0x88aadd, 0x77bbcc, s.z);
                }

                // sparse fill
                if (top.fill_sparse) {
                    top.fill_sparse.forEach(function(poly) {
                        if (thin) {
                            // todo cull polys with single point before this
                            if (poly.length > 1) poly.render(sparse, 0x0, false, true);
                        } else {
                            sparse.noodle_open(poly, extoff, 0x88aadd, 0x77bbcc, s.z);
                        }
                    });
                }

                // support
                if (s.supports) {
                    if (thin) {
                        s.supports.forEach(function(poly) {
                            support.poly(poly, 0xffaadd, true);
                            support.lines(poly.fills, 0xffaadd);
                        });
                    } else {
                        support.noodle(s.supports, extoff, 0xeeaadd, 0x77bbcc);
                        s.supports.forEach(function(poly) {
                            support.noodle_lines(poly.fills, extoff, 0xeeaadd, 0x77bbcc, s.z);
                        });
                    }
                }
            });

            // solid outlines
            let trimmed = s.solids.trimmed;
            if (trimmed) trimmed.forEach(function(poly) {
                poly.setZ(s.z + 0.025);
                outsolid.poly(poly, 0x00cc00, true, false);
                outsolid.solid(poly, 0x00dd00);
            });

            // diff bridges
            if (s.bridges) s.bridges.forEach(function (poly) {
                poly.setZ(s.z + 0.05);
                outbridge.poly(poly, 0x0099ee, true, false);
                outbridge.solid(poly, 0x00aaff);
            });

            // diff flats
            if (s.flats) s.flats.forEach(function (poly) {
                poly.setZ(s.z + 0.05);
                outflat.poly(poly, 0xee0099, true, false);
                outflat.solid(poly, 0xff00aa);
            });

            outline.renderAll();
            shells.renderAll();
            solids.renderAll();
            sparse.renderAll();
            support.renderAll();
            outsolid.renderAll();
            outbridge.renderAll();
            outflat.renderAll();
        });
    }

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Object} print state object
     * @param {Function} update incremental callback
     */
    function printSetup(print, update) {
        let widgets = print.widgets.slice(),
            settings = fixExtruders(print.settings),
            device = settings.device,
            nozzle = device.extruders[0].extNozzle,
            process = settings.process,
            mode = settings.mode,
            output = print.output,
            bounds = settings.bounds,
            printPoint = newPoint(0,0,0),
            firstLayerHeight = process.firstSliceHeight || process.sliceHeight,
            maxLayers = 0,
            layer = 0,
            zoff = 0,
            meshIndex,
            lastIndex,
            closest,
            mindist,
            minidx,
            find,
            layerout = [],
            slices = [],
            sliceEntry;

        // TODO pick a widget with a slice on the first layer and use that nozzle
        // create brim, skirt, raft if specificed in FDM mode (code shared by laser)
        if (process.outputBrimCount || process.outputRaft) {
            let brims = [],
                offset = process.outputBrimOffset || (process.outputRaft ? 4 : 0);

            // compute first brim
            widgets.forEach(function(widget) {
                let tops = [];
                // collect top outer polygons
                widget.slices[0].tops.forEach(function(top) {
                    tops.push(top.poly.clone());
                });
                // collect support polygons
                if (widget.slices[0].supports)
                widget.slices[0].supports.forEach(function(support) {
                    tops.push(support.clone());
                });
                // nest and offset tops
                POLY.nest(tops).forEach(function(poly) {
                    poly.offset(-offset + nozzle / 2).forEach(function(brim) {
                        brim.move(widget.mesh.position);
                        brims.push(brim);
                    });
                });
            });

            // merge brims
            brims = POLY.union(brims);

            // if brim is offset, over-expand then shrink to induce brims to merge
            if (offset && brims.length) {
                let extra = process.sliceSupportExtra + 2;
                let zheight = brims[0].getZ();
                brims = POLY.expand(brims, extra, zheight, null, 1);
                brims = POLY.expand(brims, -extra, zheight, null, 1);
            }

            // if raft is specified
            if (process.outputRaft) {
                let offset = newPoint(0,0,0),
                    height = nozzle;

                // cause first point of raft to be used
                printPoint = null;

                let raft = function(height, angle, spacing, speed, extrude) {
                    let slice = kiri.newSlice(zoff + height / 2);
                    brims.forEach(function(brim) {
                        // use first point of first brim as start point
                        if (printPoint === null) printPoint = brim.first();
                        let t = slice.addTop(brim);
                        t.traces = [ brim ];
                        t.inner = POLY.expand(t.traces, -nozzle * 0.5, 0, null, 1);
                        // tweak bounds for fill to induce an offset
                        t.inner[0].bounds.minx -= nozzle/2;
                        t.inner[0].bounds.maxx += nozzle/2;
                        t.fill_lines = POLY.fillArea(t.inner, angle, spacing, []);
                    })
                    offset.z = slice.z;
                    printPoint = print.slicePrintPath(slice, printPoint, offset, layerout, {
                        speed: speed,
                        mult: extrude,
                    });
                    layerout.height = height;
                    output.append(layerout);

                    layerout = [];
                    zoff += height;
                };

                raft(nozzle/1, process.sliceFillAngle + 0 , nozzle * 6.0, process.firstLayerRate / 3, 4);
                raft(nozzle/1, process.sliceFillAngle + 0 , nozzle * 6.0, process.firstLayerRate / 2, 4);
                raft(nozzle/2, process.sliceFillAngle + 90, nozzle * 3.0, process.outputFeedrate, 2.5);
                raft(nozzle/2, process.sliceFillAngle + 0 , nozzle * 1.0, process.outputFeedrate, 1.5);
                raft(nozzle/2, process.sliceFillAngle + 0 , nozzle * 1.0, process.outputFeedrate, 1.0);

                // raise first layer off raft slightly to lessen adhesion
                firstLayerHeight += process.outputRaftSpacing || 0;

                // retract after last raft layer
                output.last().last().retract = true;
            }
            // raft excludes brims
            else
            // if using brim vs raft
            if (process.outputBrimCount) {
                let polys = [],
                    preout = [];

                // expand specified # of brims
                brims.forEach(function(brim) {
                    POLY.trace2count(brim, polys, -nozzle, process.outputBrimCount, 0);
                });

                // output brim points
                printPoint = print.poly2polyEmit(polys, printPoint, function(poly, index, count, startPoint) {
                    return print.polyPrintPath(poly, startPoint, preout, {
                        rate: process.firstLayerRate,
                        onfirst: function(point) {
                            if (preout.length && point.distTo2D(startPoint) > 2) {
                                // retract between brims
                                preout.last().retract = true;
                            }
                        }
                    });
                });

                print.addPrintPoints(preout, layerout, null);

                if (preout.length) {
                    // retract between brims and print
                    preout.last().retract = true;
                }
            }
            // recompute bounds for purge block offsets
            let bbounds = BASE.newBounds();
            brims.forEach(brim => {
                bbounds.merge(brim.bounds);
            });
            bounds.min.x = Math.min(bounds.min.x, bbounds.minx);
            bounds.min.y = Math.min(bounds.min.y, bbounds.miny);
            bounds.max.x = Math.max(bounds.max.x, bbounds.maxx);
            bounds.max.y = Math.max(bounds.max.y, bbounds.maxy);
        }

        // synthesize a support widget, if needed
        if (process.sliceSupportEnable) {
            let swidget = KIRI.newWidget();
            let sslices = swidget.slices = [];
            widgets.forEach(function(widget) {
                let slices = widget.slices;
                while (sslices.length < slices.length) {
                    let sslice = KIRI.newSlice(slices[sslices.length].z);
                    sslice.extruder = process.sliceSupportNozzle;
                    sslices.push(sslice);
                }
                slices.forEach((slice,index) => {
                    if (!slice.supports) return;
                    if (!sslices[index].supports) {
                        sslices[index].supports = [];
                    }
                    sslices[index].supports.appendAll(slice.supports.map(p => {
                        if (p.fills) p.fills.forEach(p => p.move(widget.track.pos));
                        return p.move(widget.track.pos);
                    }));
                });
            });
            swidget.support = true;
            swidget.mesh = { widget: swidget }; // fake for lookup
            settings.widget[swidget.id] = { extruder: process.sliceSupportNozzle };
            widgets.push(swidget);
        }

        let extruders = [];
        let extcount = 0;

        // find max layers (for updates)
        // generate list of used extruders for purge blocks
        widgets.forEach(function(widget) {
            maxLayers = Math.max(maxLayers, widget.slices.length);
            let extruder = (settings.widget[widget.id] || {}).extruder || 0;
            if (!extruders[extruder]) {
                extruders[extruder] = {};
                extcount++;
            }
        });

        let blokpos, walkpos, blok;
        if (bounds.min.x < bounds.min.y) {
            let dx = ((bounds.max.x - bounds.min.x) - (extcount * 10)) / 2 + 5;
            blokpos = { x:bounds.min.x + dx, y: bounds.max.y + 5};
            walkpos  = { x:10, y:0 };
            blok = { x:9, y:4 };
        } else {
            let dy = ((bounds.max.y - bounds.min.y) - (extcount * 10)) / 2 + 5;
            blokpos = { x:bounds.max.x + 5, y: bounds.min.y + dy};
            walkpos  = { x:0, y:10 };
            blok = { x:4, y:9 };
        }

        // compute purge blocks
        extruders = extruders.map((ext,i) => {
            if (!ext) return ext;
            let noz = device.extruders[i].extNozzle,
                pos = {x:blokpos.x, y:blokpos.y, z:0},
                rec = {
                    extruder: i,
                    poly: BASE.newPolygon().centerSpiral(pos, blok.x, blok.y, noz*2, 3)
                };
            blokpos.x += walkpos.x;
            blokpos.y += walkpos.y;
            return rec;
        });

        // generate purge block for given nozzle
        function purge(nozzle, track, layer, start, z, using) {
            if (extcount < 2) {
                return start;
            }
            let rec = track[nozzle];
            if (rec) {
                track[nozzle] = null;
                if (layer.last()) layer.last().retract = true;
                start = print.polyPrintPath(rec.poly.clone().setZ(z), start, layer, {
                    tool: using || nozzle,
                    open: true,
                    simple: true
                });
                layer.last().retract = true;
                return start;
            } else {
                console.log({already_purged: nozzle, from: track, layer});
                return start;
            }
        }

        // increment layer count until no widget has remaining slices
        for (;;) {
            // create list of mesh slice arrays with their platform offsets
            for (meshIndex = 0; meshIndex < widgets.length; meshIndex++) {
                let mesh = widgets[meshIndex].mesh;
                if (!mesh.widget) {
                    continue;
                }
                let mslices = mesh.widget.slices;
                if (mslices && mslices[layer]) {
                    slices.push({
                        slice: mslices[layer],
                        offset: mesh.position || {x:0, y:0, z:0},
                        widget: mesh.widget
                    });
                }
            }

            // exit if no slices
            if (slices.length === 0) {
                break;
            }

            // track purge blocks generated for each layer
            let track = extruders.slice();
            let lastOut;
            let lastExt;

            // iterate over layer slices, find closest widget, print, eliminate
            for (;;) {
                closest = null;
                mindist = Infinity;
                let order = [];
                // select slices of the same extruder type first then distance
                for (meshIndex = 0; meshIndex < slices.length; meshIndex++) {
                    sliceEntry = slices[meshIndex];
                    if (sliceEntry) {
                        find = sliceEntry.slice.findClosestPointTo(printPoint.sub(sliceEntry.offset));
                        if (find) {
                            let ext = sliceEntry.slice.extruder;
                            let lex = lastOut ? lastOut.extruder : ext;
                            let dst = Math.abs(find.distance);
                            if (ext !== lex) dst *= 10000;
                            order.push({dst,sliceEntry,meshIndex});
                        }
                    }
                }
                order.sort((a,b) => {
                    return a.dst - b.dst;
                });
                if (order.length) {
                    let find = order.shift();
                    closest = find.sliceEntry;
                    minidx = find.meshIndex;
                }

                if (!closest) {
                    if (sliceEntry) lastOut = sliceEntry.slice;
                    break;
                }
                // retract between widgets
                if (layerout.length && minidx !== lastIndex) {
                    layerout.last().retract = true;
                }
                layerout.height = layerout.height || closest.slice.height;
                slices[minidx] = null;
                closest.offset.z = zoff;
                // detect extruder change and print purge block
                if (!lastOut || lastOut.extruder !== closest.slice.extruder) {
                    printPoint = purge(closest.slice.extruder, track, layerout, printPoint, closest.slice.z);
                }
                // output seek to start point between mesh slices if previous data
                printPoint = print.slicePrintPath(
                    closest.slice,
                    printPoint.sub(closest.offset),
                    closest.offset,
                    layerout,
                    {
                        first: closest.slice.index === 0,
                        support: closest.widget.support
                    }
                );
                lastOut = closest.slice;
                lastExt = lastOut.ext
                lastIndex = minidx;
            }

            // if a declared extruder isn't used in a layer, use selected
            // extruder to fill the relevant purge blocks for later support
            track.forEach(ext => {
                if (ext) {
                    printPoint = purge(ext.extruder, track, layerout, printPoint, lastOut.z, lastExt);
                }
            });

            // if layer produced output, append to output array
            if (layerout.length) output.append(layerout);

            // notify progress
            layerout.layer = layer++;
            update(layer / maxLayers);

            // retract after last layer
            if (layer === maxLayers && layerout.length) {
                layerout.last().retract = true;
            }

            slices = [];
            layerout = [];
            lastOut = undefined;
        }
    };

    /**
     * @returns {Array} gcode lines
     */
    function printExport(print, online) {
        let layers = print.output,
            settings = fixExtruders(print.settings),
            device = settings.device,
            extruders = device.extruders,
            process = settings.process,
            gcodeFan = device.gcodeFan,
            gcodeLayer = device.gcodeLayer,
            gcodeTrack = device.gcodeTrack,
            tool = 0,
            extruder = extruders[tool],
            offset_x = extruder.extOffsetX,
            offset_y = extruder.extOffsetY,
            extrudeAbs = device.extrudeAbs,
            time = 0,
            layer = 0,
            pause = [],
            pauseCmd = device.gcodePause,
            output = [],
            outputLength = 0,
            lastProgress = 0,
            decimals = BASE.config.gcode_decimals || 4,
            progress = 0,
            distance = 0,
            emitted = 0,
            retracted = 0,
            pos = {x:0, y:0, z:0, f:0},
            last = null,
            zpos = 0,
            zhop = process.zHopDistance || 0,
            seekMMM = process.outputSeekrate * 60,
            retDist = process.outputRetractDist,
            retSpeed = process.outputRetractSpeed * 60,
            retDwell = process.outputRetractDwell || 0,
            timeDwell = retDwell / 1000,
            offset = process.outputOriginCenter ? null : {
                x: device.bedWidth/2,
                y: device.bedDepth/2
            },
            subst = {
                travel_speed: seekMMM,
                retract_speed: retSpeed,
                retract_distance: retDist,
                temp: process.firstLayerNozzleTemp || process.outputTemp,
                temp_bed: process.firstLayerBedTemp || process.outputBedTemp,
                bed_temp: process.firstLayerBedTemp || process.outputBedTemp,
                fan_speed: process.outputFanMax,
                speed: process.outputFanMax, // legacy
                top: offset ? device.bedDepth : device.bedDepth/2,
                left: offset ? 0 : -device.bedWidth/2,
                right: offset ? device.bedWidth : device.bedWidth/2,
                bottom: offset ? 0 : -device.bedDepth/2,
                z_max: device.maxHeight,
                layers: layers.length,
                nozzle: 0,
                tool: 0
            },
            pidx, path, out, speedMMM, emitMM, emitPerMM, lastp, laste, dist,
            append,
            lines = 0,
            bytes = 0;

        (process.gcodePauseLayers || "").split(",").forEach(function(lv) {
            let v = parseInt(lv);
            if (v >= 0) pause.push(v);
        });

        if (online) {
            append = function(line) {
                if (line) {
                    lines++;
                    bytes += line.length;
                    output.append(line);
                }
                if (!line || output.length > 1000) {
                    online(output.join("\n"));
                    output = [];
                }
            };
        } else {
            append = function(line) {
                if (!line) return;
                output.append(line);
                lines++;
                bytes += line.length;
            }
        }

        function appendSub(line) {
            append(print.constReplace(line, subst));
        }

        function appendAll(arr) {
            if (!arr) return;
            if (!Array.isArray(arr)) arr = [ arr ];
            arr.forEach(function(line) { append(line) });
        }

        function appendAllSub(arr) {
            if (!arr) return;
            if (!Array.isArray(arr)) arr = [ arr ];
            arr.forEach(function(line) { appendSub(line) });
        }

        append(`; Generated by Kiri:Moto ${KIRI.version}`);
        append(`; ${new Date().toString()}`);
        appendSub("; Bed left:{left} right:{right} top:{top} bottom:{bottom}");
        append(`; Target: ${settings.filter[settings.mode]}`);
        append("; --- process ---");
        for (let pk in process) {
            append("; " + pk + " = " + process[pk]);
        }
        append("; --- startup ---");
        let t0 = false;
        let t1 = false;
        for (let i=0; i<device.gcodePre.length; i++) {
            let line = device.gcodePre[i];
            if (line.indexOf('T0') >= 0) t0 = true; else
            if (line.indexOf('T1') >= 0) t1 = true; else
            if (line.indexOf('M82') >= 0) extrudeAbs = true; else
            if (line.indexOf('M83') >= 0) extrudeAbs = false; else
            if (line.indexOf('G90') >= 0) extrudeAbs = true; else
            if (line.indexOf('G91') >= 0) extrudeAbs = false; else
            if (line.indexOf('G92') === 0) {
                line.split(";")[0].split(' ').forEach(function (tok) {
                    let val = parseFloat(tok.substring(1) || 0) || 0;
                    switch (tok[0]) {
                        case 'X': pos.x = val; break;
                        case 'Y': pos.y = val; break;
                        case 'Z': pos.z = val; break;
                        case 'E': outputLength = val; break;
                    }
                });
            }
            if (extrudeAbs && line.indexOf('E') > 0) {
                line.split(";")[0].split(' ').forEach(function (tok) {
                    // use max E position from gcode-preamble
                    if (tok[0] == 'E') {
                        outputLength = Math.max(outputLength, parseFloat(tok.substring(1)) || 0);
                    }
                });
            }
            appendSub(line);
        }

        function dwell(ms) {
            append(`G4 P${ms}`);
            time += timeDwell;
        }

        function retract(zhop) {
            retracted = retDist;
            moveTo({e:-retracted}, retSpeed, `e-retract ${retDist}`);
            if (zhop) moveTo({z:zpos + zhop}, seekMMM, "z-hop start");
            time += (retDist / retSpeed) * 60 * 2; // retraction time
        }

        function moveTo(newpos, rate, comment) {
            if (comment) {
                append(";; " + comment);
            }
            let o = [!rate && !newpos.e ? 'G0' : 'G1'];
            if (typeof newpos.x === 'number') {
                pos.x = newpos.x;//UTIL.round(newpos.x,decimals);
                o.append(" X").append(pos.x.toFixed(decimals));
            }
            if (typeof newpos.y === 'number') {
                pos.y = newpos.y;//UTIL.round(newpos.y,decimals);
                o.append(" Y").append(pos.y.toFixed(decimals));
            }
            if (typeof newpos.z === 'number') {
                pos.z = newpos.z;//UTIL.round(newpos.z,decimals);
                o.append(" Z").append(pos.z.toFixed(decimals));
            }
            if (typeof newpos.e === 'number') {
                outputLength += newpos.e;
                if (extrudeAbs) {
                    // for cumulative (absolute) extruder positions
                    // o.append(" E").append(UTIL.round(outputLength, decimals));
                    o.append(" E").append(outputLength.toFixed(decimals));
                } else {
                    // o.append(" E").append(UTIL.round(newpos.e, decimals));
                    o.append(" E").append(newpos.e.toFixed(decimals));
                }
            }
            if (rate && rate != pos.f) {
                o.append(" F").append(Math.round(rate));
                pos.f = rate
            }
            let line = o.join('');
            if (last == line) {
                // console.log({dup:line});
                return;
            }
            last = line;
            append(line);
        }

        // calc total distance traveled by head as proxy for progress
        let allout = [], totaldistance = 0;
        layers.forEach(function(outs) {
            allout.appendAll(outs);
        });
        allout.forEachPair(function (o1, o2) {
            totaldistance += o1.point.distTo2D(o2.point);
        }, 1);

        // retract before first move
        retract();

        while (layer < layers.length) {
            path = layers[layer];
            emitPerMM = print.extrudePerMM(
                extruder.extNozzle,
                extruder.extFilament,
                path.layer === 0 ?
                    (process.firstSliceHeight || process.sliceHeight) : path.height);

            subst.z = (zpos + path.height).toFixed(3);
            subst.Z = subst.z;
            subst.layer = layer;
            subst.height = path.height.toFixed(3);

            if (pauseCmd && pause.indexOf(layer) >= 0) {
                appendAllSub(pauseCmd)
            }

            if (gcodeLayer && gcodeLayer.length) {
                appendAllSub(gcodeLayer);
            } else {
                append(`;; --- layer ${layer} (${subst.height} @ ${subst.z}) ---`);
            }

            if (layer > 0 && process.outputLayerRetract) {
                retract();
            }

            // enable fan at fan layer
            if (gcodeFan && layer === process.outputFanLayer) {
                appendAllSub(gcodeFan);
            }

            // second layer transitions
            if (layer === 1) {
                // update temps when first layer overrides are present
                if (process.firstLayerNozzleTemp) {
                    subst.temp = process.outputTemp;
                    if (t0) appendSub("M104 S{temp} T0");
                    if (t1) appendSub("M104 S{temp} T1");
                    if (!(t0 || t1)) appendSub("M104 S{temp} T{tool}");
                }
                if (process.firstLayerBedTemp) {
                    subst.bed_temp = subst.temp_bed = process.outputBedTemp;
                    appendSub("M140 S{temp_bed} T0");
                }
            }

            // move Z to layer height
            zpos += path.height;
            moveTo({z:zpos}, seekMMM);

            // iterate through layer outputs
            for (pidx=0; pidx<path.length; pidx++) {
                out = path[pidx];
                speedMMM = (out.speed || process.outputFeedrate) * 60;

                // look for extruder change and recalc emit factor
                if (out.tool !== undefined && out.tool !== tool) {
                    tool = out.tool;
                    subst.nozzle = subst.tool = tool;
                    extruder = extruders[tool];
                    offset_x = extruder.extOffsetX;
                    offset_y = extruder.extOffsetY;
                    emitPerMM = print.extrudePerMM(
                        extruder.extNozzle,
                        extruder.extFilament,
                        path.layer === 0 ?
                            (process.firstSliceHeight || process.sliceHeight) : path.height);
                    appendAllSub(extruder.extSelect);
                }

                // if no point in output, it's a dwell command
                if (!out.point) {
                    dwell(out.speed);
                    continue;
                }

                let x = out.point.x + offset_x,
                    y = out.point.y + offset_y,
                    z = out.point.z;

                // adjust for inversions and offsets
                if (process.outputInvertX) x = -x;
                if (process.outputInvertY) y = -y;
                if (offset) {
                    x += offset.x;
                    y += offset.y;
                }

                dist = lastp ? lastp.distTo2D(out.point) : 0;

                // re-engage post-retraction before new extrusion
                if (out.emit && retracted) {
                    // when enabled, resume previous Z
                    if (zhop && pos.z != zpos) moveTo({z:zpos}, seekMMM, "z-hop end");
                    // re-engage retracted filament
                    moveTo({e:retracted}, retSpeed, `e-engage ${retracted}`);
                    retracted = 0;
                    // optional dwell after re-engaging filament to allow pressure to build
                    if (retDwell) dwell(retDwell);
                    time += (retDist / retSpeed) * 60 * 2; // retraction time
                }

                if (lastp && out.emit) {
                    emitMM = emitPerMM * out.emit * dist;
                    moveTo({x:x, y:y, e:emitMM}, speedMMM);
                    emitted += emitMM;
                } else {
                    moveTo({x:x, y:y}, seekMMM);
                    // TODO disabling out of plane z moves until a better mechanism
                    // can be built that doesn't rely on computed zpos from layer heights...
                    // when making z moves (like polishing) allow slowdown vs fast seek
                    // let moveSpeed = (lastp && lastp.z !== z) ? speedMMM : seekMMM;
                    // moveTo({x:x, y:y, z:z}, moveSpeed);
                }

                // retract filament if point retract flag set
                if (!retracted && out.retract) {
                    retract(zhop);
                }

                // update time and distance (should calc in moveTo() instead)
                time += (dist / speedMMM) * 60 * 1.5;
                distance += dist;
                subst.progress = progress = Math.round((distance / totaldistance) * 100);

                // emit tracked progress
                if (gcodeTrack && progress != lastProgress) {
                    appendAllSub(gcodeTrack);
                    lastProgress = progress;
                }

                lastp = out.point;
                laste = out.emit;
            }
            layer++;
        }

        subst.time = UTIL.round(time,2);
        subst.material = UTIL.round(emitted,2);

        append("; --- shutdown ---");
        appendAllSub(device.gcodePost);
        append(`; --- filament used: ${subst.material} mm ---`);
        append(`; --- print time: ${time.toFixed(0)}s ---`);

        // force emit of buffer
        append();

        print.distance = emitted;
        print.lines = lines;
        print.bytes = bytes + lines - 1;
        print.time = time;

        return online ? null : output.join("\n");
    };

    function toPoint(obj) {
        return base.newPoint(obj.x, obj.y, obj.z);
    }

    function printRender(print, options) {
        let debug = KIRI.api.const.LOCAL;
        let scope = print, emits, last,
            moves, moving = true,
            opt = options || {},
            tools = opt.tools || [],
            showmoves = !opt.nomoves,
            maxspeed = 0;
        // find max speed
        scope.output.forEach(function(layerout) {
            layerout.forEach(function(out, index) {
                if (out.emit && out.speed) {
                    maxspeed = Math.max(maxspeed, out.speed);
                }
            });
        });
        if (maxspeed === 0) {
            maxspeed = 4000;
        }
        maxspeed *= 1.001;
        // render layered output
        scope.lines = 0;
        scope.output.forEach(function(layerout) {
            let move = [], print = [], cprint;
            layerout.forEach(function(out, index) {
                let point = toPoint(out.point);
                if (last) {
                    // drop short segments
                    // if (point.emit === last.emit && UTIL.distSq(last, point) < 0.001 && point.z === last.z) {
                    //     return;
                    // }
                    if (out.emit > 0) {
                        if (moving || !cprint) {
                            cprint = base.newPolygon().setOpen(true).append(last);
                            print.push({
                                poly: cprint,
                                speed: out.speed || maxspeed || 4000,
                                tool:tools[out.tool]
                            });
                        }
                        try {
                            cprint.append(point);
                        } catch (e) {
                            console.log(e, {cprint});
                        }
                        moving = false;
                    } else {
                        cprint = null;
                        move.push(last);
                        move.push(point);
                        moving = true;
                    }
                    // move direction arrow heads
                    if (debug && last.z == point.z) {
                        let rs = BASE.newSlope(
                            {x: point.x, y: point.y},
                            {x: last.x, y: last.y}
                        );
                        let ao1 = BASE.newSlopeFromAngle(rs.angle + 25);
                        let ao2 = BASE.newSlopeFromAngle(rs.angle - 25);
                        let sp = BASE.newPoint(point.x, point.y, point.z);
                        move.push(sp);
                        move.push(sp.projectOnSlope(ao1, BASE.config.debug_arrow));
                        move.push(sp);
                        move.push(sp.projectOnSlope(ao2, BASE.config.debug_arrow));
                    }
                }
                last = point;
            });
            emits = KIRI.newLayer(scope.group);
            if (showmoves) {
                moves = KIRI.newLayer(scope.group);
                moves.lines(move, opt.move_color || 0x888888);
            }
            emits.setTransparent(false);
            // emit printing shapes
            print.forEach(segment => {
                let {poly, speed, tool} = segment;
                let off = tool ? (tool.extNozzle || 0.4) / 2 : 0.2;
                let sint = Math.min(maxspeed, parseInt(speed));
                let rgb = scope.hsv2rgb({h:sint/maxspeed, s:1, v:1});
                let color = ((rgb.r * 0xff) << 16) |
                    ((rgb.g * 0xff) <<  8) |
                    ((rgb.b * 0xff) <<  0);
                if (opt.flat) {
                    poly = poly.clone().setZ(0);
                }
                if (opt.aslines) {
                    emits.poly(poly, opt.color || color, false, true);
                } else {
                    emits.noodle_open(poly, off - 0.02, color, 0x0, poly.getZ());
                }
            });
            emits.renderAll();
            if (showmoves) {
                moves.render();
                scope.movesView.push(moves);
            }
            scope.printView.push(emits);
            scope.lines += print.length;
        });
    }

})();
