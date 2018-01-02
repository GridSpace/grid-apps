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
            process = settings.process,
            mode = settings.mode,
            output = print.output,
            printPoint = newPoint(0,0,0),
            maxLayers = 0,
            layer = 0,
            mesh,
            meshIndex,
            lastIndex,
            layerout,
            closest,
            mindist,
            minidx,
            find,
            found,
            mslices,
            slices,
            sliceEntry;

        // find max layers (for updates)
        widgets.forEach(function(widget) {
            maxLayers = Math.max(maxLayers, widget.slices.length);
        });

        // for each layer until no layers are found
        for (;;) {
            slices = [];
            layerout = [];

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

            // create brim, if specificed in FDM mode (code shared by laser)
            if (layer === 0 && process.outputBrimCount) {
                var brims = [],
                    polys = [],
                    preout = [],
                    startPoint = printPoint;

                widgets.forEach(function(widget) {
                    var tops = [];
                    widget.slices[0].tops.forEach(function(top) {
                        tops.push(top.poly.clone());
                    });
                    POLY.nest(tops).forEach(function(poly) {
                        poly.offset(-process.outputBrimOffset+device.nozzleSize/2).forEach(function(brim) {
                            brim.move(widget.mesh.position);
                            brims.push(brim);
                        });
                    });
                });

                POLY.union(brims).forEach(function(brim) {
                    POLY.trace2count(brim, polys, -device.nozzleSize, process.outputBrimCount, 0);
                });

                printPoint = print.poly2polyEmit(polys, printPoint, function(poly, index, count, startPoint) {
                    return print.polyPrintPath(poly, startPoint, preout, {
                        rate: process.firstLayerRate,
                        onfirst: function(point) {
                            if (preout.length && point.distTo2D(startPoint) > 2) {
                                // retract between brim r
                                preout.last().retract = true;
                            }
                        }
                    });
                });

                print.addPrintPoints(preout, layerout, null);
                // preout.last().retract = true;
            }

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
                // output seek to start point between mesh slices if previous data
                printPoint = print.slicePrintPath(
                    closest.slice,
                    printPoint.sub(closest.offset),
                    closest.offset,
                    layerout,
                    // wipe after last layer or between widgets
                    (found > 1 && slices.length > 1) || (found === 1 && layer == maxLayers-1)
                );
                lastIndex = minidx;
            }

            if (layerout.length) output.append(layerout);
            layer++;
            update(layer / maxLayers);
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
            decimals = 4,
            progress = 0,
            distance = 0,
            emitted = 0,
            retracted = 0,
            pos = {x:0, y:0, z:0, f:0},
            last = null,
            zinc = process.sliceHeight,
            zpos = process.firstSliceHeight,
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

        function moveTo(newpos, rate, comment) {
            if (comment) {
                append(" ; " + comment);
            }
            var o = ['G1'];
            if (typeof newpos.x === 'number') {
                pos.x = UTIL.round(newpos.x,decimals);
                o.append(" X").append(pos.x);
            }
            if (typeof newpos.y === 'number') {
                pos.y = UTIL.round(newpos.y,decimals);
                o.append(" Y").append(pos.y);
            }
            if (typeof newpos.z === 'number') {
                pos.z = UTIL.round(newpos.z,decimals);
                o.append(" Z").append(pos.z);
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

        while (layer < layers.length) {
            path = layers[layer];

            if (trackLayers) {
                trackLayers.forEach(function(line) {
                    append(constReplace(line, {progress: progress, layer: layer, height: zpos}));
                });
            } else {
                append("; --- layer "+layer+" ---");
            }

            // second layer fan on
            if (layer === 1 && fan_power) {
                append(constReplace(fan_power,consts));
            }

            // move Z to layer height
            moveTo({z:zpos}, seekMMM);
            zpos += zinc;

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

                if (out.emit && retracted) {
                    moveTo({e:retracted}, retSpeed, "engage " + retracted);
                    retracted = 0;
                    time += (retDist / retSpeed) * 60 * 2; // retraction time
                }

                if (lastp && out.emit) {
                    emitMM = (layer === 0 ? emitPerMMLayer1 : emitPerMM) * out.emit * dist;
                    moveTo({x:x, y:y, e:emitMM}, speedMMM);
                    emitted += emitMM;
                } else {
                    moveTo({x:x, y:y}, speedMMM);
                }

                if (!retracted && out.retract) {
                    retracted = retDist;
                    moveTo({e:-retracted}, retSpeed, "retract " + retDist);
                    time += (retDist / retSpeed) * 60 * 2; // retraction time
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
