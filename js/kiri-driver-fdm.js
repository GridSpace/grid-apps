/** Copyright 2014-2017 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_fdm = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.FDM) return;

    var KIRI = self.kiri,
        BASE = self.base,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        CONF = BASE.config,
        FDM = KIRI.driver.FDM = { },
        POLY = BASE.polygons,
        SLICER = KIRI.slicer,
        newPoint = BASE.newPoint,
        time = UTIL.time;

    // customer gcode post function for XYZ daVinci Mini W
    self.kiri_fdm_xyz_mini_w = function(gcode, options) {
        return btoa("; filename = kirimoto.gcode\n; machine = dv1MW0A000\n" + gcode);
    };

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
        var spro = settings.process,
            spri = settings.device,
            sout = settings.process,
            update_start = time(),
            minSolid = spro.sliceSolidMinArea,
            solidLayers = spro.sliceSolidLayers,
            doSolidLayers = solidLayers && !spro.sliceVase,
            firstOffset = spri.nozzleSize / 2,
            shellOffset = spri.nozzleSize * spro.sliceShellSpacing,
            fillOffset = shellOffset * settings.synth.fillOffsetMult,
            fillSpacing = spri.nozzleSize * spro.sliceFillSpacing,
            sliceFillAngle = spro.sliceFillAngle,
            view = widget.mesh && widget.mesh.newGroup ? widget.mesh.newGroup() : null;

        if (spro.sliceHeight < 0.01) {
            return ondone("invalid slice height");
        }

        if (spro.firstSliceHeight < spro.sliceHeight) {
            DBUG.log("invalid first layer height < slice height");
            DBUG.log("reverting to slice height");
            spro.firstSliceHeight = spro.sliceHeight;
        }

        SLICER.sliceWidget(widget, {
            height: spro.sliceHeight,
            view:view,
            firstHeight: sout.firstSliceHeight
        }, onSliceDone, onSliceUpdate);

        function onSliceUpdate(update) {
            onupdate(0.0 + update * 0.5);
        }

        function onSliceDone(slices) {
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
                slice.invalidateFill();
                slice.invalidateSolids();
                slice.invalidateSupports();
            });

            var supportEnabled = spro.sliceSupportEnable && spro.sliceSupportDensity > 0.0,
                supportMinArea = spro.sliceSupportArea;

            // create shells and diff inner fillable areas
            forSlices(0.0, 0.2, function(slice) {
                var solid = (
                        slice.index < spro.sliceBottomLayers ||
                        slice.index > slices.length - spro.sliceTopLayers-1 ||
                        spro.sliceFillSparse > 0.95
                    ) && !spro.sliceVase;
                slice.doShells(spro.sliceShells, firstOffset, shellOffset, fillOffset, {
                    vase: spro.sliceVase,
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
                    slice.doThinFill(fillSpacing, sliceFillAngle);
                    sliceFillAngle += 90.0;
                }, "solids");
            }

            // calculations only relevant when supports are enabled
            if (supportEnabled) {
                forSlices(0.5, 0.7, function(slice) {
                    slice.doSupport(spro.sliceSupportOffset, spro.sliceSupportSpan, spro.sliceSupportExtra, supportMinArea, spro.sliceSupportSize, spro.sliceSupportOffset);
                }, "support");
                forSlices(0.7, 0.8, function(slice) {
                    slice.doSupportFill(spri.nozzleSize, spro.sliceSupportDensity, supportMinArea);
                }, "support");
            }

            // sparse layers only present when non-vase mose and sparse % > 0
            if (!spro.sliceVase && spro.sliceFillSparse > 0.0) {
                forSlices(0.8, 1.0, function(slice) {
                    slice.doSparseLayerFill(fillSpacing, spro.sliceFillSparse, widget.getBoundingBox());
                }, "infill");
            }

            // report slicing complete
            ondone();
        }

    };

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Object} print state object
     * @param {Function} update incremental callback
     */
    FDM.printSetup = function(print, update) {
        var widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            nozzle = device.nozzleSize,
            process = settings.process,
            mode = settings.mode,
            output = print.output,
            printPoint = newPoint(0,0,0),
            firstLayerHeight = process.firstSliceHeight,
            maxLayers = 0,
            layer = 0,
            zoff = 0,
            mesh,
            meshIndex,
            lastIndex,
            closest,
            mindist,
            minidx,
            find,
            found,
            mslices,
            layerout = [],
            slices = [],
            sliceEntry;

        // create brim, skirt, raft if specificed in FDM mode (code shared by laser)
        if (process.outputBrimCount || process.outputRaft) {
            var brims = [],
                offset = process.outputBrimOffset || (process.outputRaft ? 4 : 0);

            // compute first brim
            widgets.forEach(function(widget) {
                var tops = [];
                // collect top outer polygons
                widget.slices[0].tops.forEach(function(top) {
                    tops.push(top.poly.clone());
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

            // if brim is offset, the expand and shrink to cause brims to merge
            if (offset && brims.length) {
                var extra = process.sliceSupportExtra + 2;
                brims = POLY.expand(brims, extra, 0, null, 1);
                brims = POLY.expand(brims, -extra, 0, null, 1);
            }

            // if raft is specified
            if (process.outputRaft) {
                var offset = newPoint(0,0,0),
                    height = nozzle;

                // cause first point of raft to be used
                printPoint = null;

                var raft = function(height, angle, spacing, speed, extrude) {
                    var slice = kiri.newSlice(zoff + height / 2);
                    brims.forEach(function(brim) {
                        // use first point of first brim as start point
                        if (printPoint === null) printPoint = brim.first();
                        var t = slice.addTop(brim);
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
                raft(nozzle/2, process.sliceFillAngle + 90, nozzle * 3.0, process.outputFeedrate, 1.0);
                raft(nozzle/2, process.sliceFillAngle + 0 , nozzle * 1.0, process.outputFeedrate, 1.0);
                raft(nozzle/2, process.sliceFillAngle + 0 , nozzle * 1.0, process.outputFeedrate, 1.0);

                // raise first layer off raft slightly to lessen adhesion
                firstLayerHeight += 0.2;
            }
            // raft excludes brims
            else
            // if using brim vs raft
            if (process.outputBrimCount) {
                var polys = [],
                    preout = [];

                // expand brims
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
                    preout.last().retract = true;
                }
            }
        }

        // find max layers (for updates)
        widgets.forEach(function(widget) {
            maxLayers = Math.max(maxLayers, widget.slices.length);
        });

        // for each layer until no layers are found
        for (;;) {
            // create list of mesh slice arrays with their platform offsets
            for (meshIndex = 0; meshIndex < widgets.length; meshIndex++) {
                mesh = widgets[meshIndex].mesh;
                if (!mesh.widget) continue;
                mslices = mesh.widget.slices;
                if (mslices && mslices[layer]) {
                    slices.push({slice:mslices[layer], offset:mesh.position});
                }
            }

            if (slices.length === 0) break;

            // iterate over layer slices, find closest widget, print, eliminate
            for (;;) {
                found = 0;
                closest = null;
                mindist = Infinity;
                for (meshIndex = 0; meshIndex < slices.length; meshIndex++) {
                    sliceEntry = slices[meshIndex];
                    if (!sliceEntry) continue;
                    find = sliceEntry.slice.findClosestPointTo(printPoint.sub(sliceEntry.offset));
                    if (find && (!closest || find.distance < mindist)) {
                        closest = sliceEntry;
                        mindist = find.distance;
                        minidx = meshIndex;
                    }
                    found++;
                }
                if (!closest) break;
                slices[minidx] = null;
                closest.offset.z = zoff;
                // output seek to start point between mesh slices if previous data
                printPoint = print.slicePrintPath(
                    closest.slice,
                    printPoint.sub(closest.offset),
                    closest.offset,
                    layerout,
                    {
                        // wipe after last layer or between widgets
                        wipeAfter: (found > 1 && slices.length > 1) || (found === 1 && layer == maxLayers-1),
                        // only use first layer settings in the absence of a raft
                        first: closest.slice.index === 0
                    }
                );
                lastIndex = minidx;
            }

            layerout.height = layer === 0 ? firstLayerHeight : process.sliceHeight;
            if (layerout.length) output.append(layerout);
            layer++;
            update(layer / maxLayers);

            slices = [];
            layerout = [];
        }
    };

    /**
     * @returns {Array} gcode lines
     */
    FDM.printExport = function(print, online) {
        var layers = print.output,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            fan_power = device.gcodeFan,
            trackLayers = device.gcodeLayer,
            trackProgress = device.gcodeTrack,
            time = 0,
            layer = 0,
            output = [],
            outputLength = 0,
            lastProgress = 0,
            decimals = 3,
            progress = 0,
            distance = 0,
            emitted = 0,
            retracted = 0,
            pos = {x:0, y:0, z:0, f:0},
            last = null,
            zpos = 0,
            offset = process.outputOriginCenter ? null : {
                x: device.bedWidth/2,
                y: device.bedDepth/2
            },
            consts = {
                temp: process.outputTemp,
                temp_bed: process.outputBedTemp,
                bed_temp: process.outputBedTemp,
                fan_speed: process.outputFanMax,
                speed: process.outputFanMax,
                top: offset ? device.bedDepth : device.bedDepth/2,
                left: offset ? 0 : -device.bedWidth/2,
                right: offset ? device.bedWidth : device.bedWidth/2,
                bottom: offset ? 0 : -device.bedDepth/2,
                z_max: device.maxHeight
            },
            seekMMM = process.outputSeekrate * 60,
            retDist = process.outputRetractDist,
            retSpeed = process.outputRetractSpeed * 60,
            retDwell = process.outputRetractDwell || 0,
            // ratio of nozzle area to filament area times
            // ratio of slice height to filament max noodle height
            emitPerMM = print.extrudePerMM(device.nozzleSize, device.filamentSize, process.sliceHeight),
            emitPerMMLayer1 = print.extrudePerMM(device.nozzleSize, device.filamentSize, process.firstSliceHeight),
            constReplace = print.constReplace,
            pidx, path, out, speedMMM, emitMM, lastp, laste, dist,
            appendAll = function(arr) {
                arr.forEach(function(line) { append(line) });
            },
            append,
            lines = 0,
            bytes = 0;

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

        append("; Generated by KIRI:MOTO");
        append("; "+new Date().toString());
        append(constReplace("; Bed left:{left} right:{right} top:{top} bottom:{bottom}", consts));
        append("; --- process ---");
        for (var pk in process) {
            append("; " + pk + " = " + process[pk]);
        }
        append("; --- startup ---");
        for (var i=0; i<device.gcodePre.length; i++) {
            var line = device.gcodePre[i];
            if (device.extrudeAbs && line.indexOf('E') > 0) {
                line.split(";")[0].split(' ').forEach(function (tok) {
                    // use max E position from gcode-preamble
                    if (tok[0] == 'E') {
                        outputLength = Math.max(outputLength, parseFloat(tok.substring(1)) || 0);
                    }
                });
            }
            append(constReplace(line, consts));
        }

        function dwell(ms) {
            append("G4 P" + ms);
        }

        function retract() {
            retracted = retDist;
            moveTo({e:-retracted}, retSpeed, "retract " + retDist);
            time += (retDist / retSpeed) * 60 * 2; // retraction time
        }

        function moveTo(newpos, rate, comment) {
            if (comment) {
                append(" ; " + comment);
            }
            var o = ['G1'];
            if (typeof newpos.x === 'number') {
                pos.x = UTIL.round(newpos.x,decimals);
                o.append(" X").append(pos.x.toFixed(decimals));
            }
            if (typeof newpos.y === 'number') {
                pos.y = UTIL.round(newpos.y,decimals);
                o.append(" Y").append(pos.y.toFixed(decimals));
            }
            if (typeof newpos.z === 'number') {
                pos.z = UTIL.round(newpos.z,decimals);
                o.append(" Z").append(pos.z.toFixed(decimals));
            }
            if (typeof newpos.e === 'number') {
                outputLength += newpos.e;
                if (device.extrudeAbs) {
                    // for cumulative (absolute) extruder positions
                    o.append(" E").append(UTIL.round(outputLength, decimals));
                } else {
                    o.append(" E").append(UTIL.round(newpos.e, decimals));
                }
            }
            if (rate && rate != pos.f) {
                o.append(" F").append(Math.round(rate));
                pos.f = rate
            }
            var line = o.join('');
            if (last == line) {
                // console.log({dup:line});
                return;
            }
            last = line;
            append(line);
        }

        // calc total distance traveled by head as proxy for progress
        var allout = [],
            totaldistance = 0;
        layers.forEach(function(outs) { allout.appendAll(outs) });
        allout.forEachPair(function (o1, o2) {
            totaldistance += o1.point.distTo2D(o2.point);
        }, 1);

        // retract before first move
        retract();

        while (layer < layers.length) {
            path = layers[layer];

            if (trackLayers) {
                trackLayers.forEach(function(line) {
                    append(constReplace(line, {
                        progress: progress,
                        layer: layer,
                        height: path.height.toFixed(3)}));
                });
            } else {
                append("; --- layer "+layer+" ---");
            }

            // second layer fan on
            if (layer === 1 && fan_power && process.outputCooling) {
                append(constReplace(fan_power, consts));
            }

            // move Z to layer height
            zpos += path.height;
            moveTo({z:zpos}, seekMMM);

            // iterate through layer outputs
            for (pidx=0; pidx<path.length; pidx++) {
                out = path[pidx];
                speedMMM = (out.speed || process.outputFeedrate) * 60;

                // if no point in output, it's a dwell command
                if (!out.point) {
                    dwell(out.speed);
                    continue;
                }
                var x = out.point.x,
                    y = out.point.y;

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
                    moveTo({e:retracted}, retSpeed, "engage " + retracted);
                    retracted = 0;
                    time += (retDist / retSpeed) * 60 * 2; // retraction time
                    if (retDwell) {
                        dwell(retDwell);
                        time += retDwell;
                    }
                }

                if (lastp && out.emit) {
                    emitMM = (layer === 0 ? emitPerMMLayer1 : emitPerMM) * out.emit * dist;
                    moveTo({x:x, y:y, e:emitMM}, speedMMM);
                    emitted += emitMM;
                } else {
                    moveTo({x:x, y:y}, speedMMM);
                }

                // retract filament
                if (!retracted && out.retract) {
                    retract();
                }

                // update time and distance
                time += (dist / speedMMM) * 60;
                distance += dist;
                progress = Math.round((distance / totaldistance) * 100);

                // emit tracked progress
                if (trackProgress && progress != lastProgress) {
                    append(constReplace(trackProgress, {progress:progress}));
                    lastProgress = progress;
                }

                lastp = out.point;
                laste = out.emit;
            }
            layer++;
        }

        consts.material = UTIL.round(emitted,2);
        consts.time = UTIL.round(time,2);

        append("; --- shutdown ---");
        for (var i=0; i<device.gcodePost.length; i++) {
            append(constReplace(device.gcodePost[i], consts));
        }
        append("; --- filament used: "  +consts.material + "mm ---");
        append("; --- print time: " + consts.time + "s ---");

        // force emit of buffer
        append();

        print.distance = emitted;
        print.lines = lines;
        print.bytes = bytes + lines - 1;
        print.time = time;

        return online ? null : output.join("\n");
    };

})();
