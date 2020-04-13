/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

let gs_kiri_sla = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.SLA) return;

    let KIRI = self.kiri,
        BASE = self.base,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        CONF = BASE.config,
        POLY = BASE.polygons,
        SLA = KIRI.driver.SLA = {
            slice,
            printSetup,
            printExport
        },
        SLICER = KIRI.slicer,
        newPoint = BASE.newPoint;

    /**
     * DRIVER SLICE CONTRACT
     *
     * @param {Object} settings
     * @param {Widget} Widget
     * @param {Function} onupdate (called with % complete and optional message)
     * @param {Function} ondone (called when complete with an array of Slice objects)
     */
    function slice(settings, widget, onupdate, ondone) {
        let process = settings.process,
            device = settings.device;

        SLICER.sliceWidget(widget, { height: sliceHeight }, onSliceDone, onSliceUpdate);

        function onSliceUpdate(update) {
            return onupdate(0.0 + update * 0.5);
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
    function printSetup(print, update) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            output = print.output,
            bounds = settings.bounds,
            printPoint = newPoint(0,0,0);

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
                    slices.push({slice:mslices[layer], offset:mesh.position});
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
                    { first: closest.slice.index === 0 }
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
     * DRIVER PRINT CONTRACT
     *
     * @returns {Array} gcode lines
     */
    function printExport(print, online) {
        let layers = print.output,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            append,
            output = [];

        if (online) {
            append = function(line) {
                if (line) {
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
            }
        }

        // print.distance = emitted;
        // print.lines = lines;
        // print.bytes = bytes + lines - 1;
        // print.time = time;

        return online ? null : output.join("\n");
    };

})();
