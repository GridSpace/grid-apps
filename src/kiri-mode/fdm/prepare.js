/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.paths
// dep: geo.point
// dep: geo.polygons
// dep: kiri.utils
// dep: kiri.slice
// dep: kiri.consts
// dep: kiri.render
// dep: kiri-mode.fdm.driver
gapp.register("kiri-mode.fdm.prepare", [], (root, exports) => {

const { base, kiri } = root;
const { consts, driver, newSlice, render } = kiri;
const { polygons, paths, util, newPoint, newPolygon, Polygon } = base;
const { poly2polyEmit, tip2tipEmit } = paths;
const { numOrDefault } = util;
const { fillArea } = polygons;
const { beltfact } = consts;
const { FDM } = driver;
const { getRangeParameters } = FDM;
const POLY = polygons;

/**
 * DRIVER PRINT CONTRACT
 *
 * @param {Function} update progress callback
 * @returns {Object[]} returns array of render objects
 */
FDM.prepare = async function(widgets, settings, update) {
    // filter ignored widgets
    widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);

    let { device, process, controller, bounds } = settings,
        { sliceHeight, firstSliceHeight, firstLayerRate } = process,
        { outputSeekrate, outputDraftShield, outputPurgeTower } = process,
        { bedWidth, bedDepth } = device,
        { lineType } = controller,
        printPoint = newPoint(0,0,0),
        print = self.worker.print = kiri.newPrint(settings, widgets),
        nozzle = process.sliceLineWidth || device.extruders[0].extNozzle,
        isBelt = device.bedBelt,
        isThin = lineType === "line",
        isFlat = lineType === "flat",
        useRaft = process.outputRaft || false,
        firstLayerHeight = isBelt ? sliceHeight : firstSliceHeight || sliceHeight,
        layerno = 0,
        zneg = 0,
        zoff = 0,
        zmin = 0,
        shield,
        output = [],
        layerout = [];

    let lastLayerStart = null;

    // compute bounds if missing
    if (!bounds) {
        bounds = new THREE.Box3();
        for (let widget of widgets) {
            let wp = widget.track.pos;
            let wb = widget.bounds.clone();
            wb.min.x += wp.x;
            wb.max.x += wp.x;
            wb.min.y += wp.y;
            wb.max.y += wp.y;
            bounds.union(wb);
        }
        settings.bounds = bounds;
    }

    // TODO pick a widget with a slice on the first layer and use that nozzle
    // create brim, skirt, raft if specificed in FDM mode (code shared by laser)
    if (!isBelt && (process.outputBrimCount || useRaft)) {
        let brims = [],
            offset = process.outputBrimOffset || (useRaft ? 4 : 0);

        // compute first brim
        widgets.filter(w => w.slices.length).forEach(function(widget) {
            let tops = [];
            let slices = [];
            if (outputDraftShield) {
                slices.appendAll(widget.slices);
            } else {
                slices.push(widget.slices[0]);
            }
            for (let slice of slices) {
                // collect top outer polygons
                if (slice.tops)
                slice.tops.forEach(function(top) {
                    tops.push(top.poly.clone());
                });
                // collect support polygons
                if (slice.supports)
                slice.supports.forEach(function(support) {
                    tops.push(support.clone());
                });
            }
            if (outputDraftShield) {
                tops = POLY.union(tops,1,true);
            }
            // nest and offset tops
            POLY.nest(tops).forEach(function(poly) {
                let off = poly.offset(-offset + nozzle / 2);
                if (off) off.forEach(function(brim) {
                    brim.move(widget.track.pos);
                    brims.push(brim);
                });
            });
        });

        // merge brims
        brims = POLY.union(brims, undefined, true);

        // if brim is offset, over-expand then shrink to induce brims to merge
        if (brims.length > 1 && offset >= nozzle) {
            let extra = process.sliceSupportExtra + 2;
            let zheight = brims[0].getZ();
            brims = POLY.expand(brims, extra, zheight, null, 1);
            brims = POLY.expand(brims, -extra, zheight, null, 1);
        }

        // if raft is specified
        if (useRaft) {
            let offset = newPoint(0,0,0),
                height = nozzle,
                angle = process.sliceFillAngle,
                rate1 = firstLayerRate / 3,
                rate2 = process.outputFeedrate,
                rafts = process.outputBrimCount ?
                    POLY.expand(brims, nozzle * 4, 0, null, 1) : brims;

            function raft(height, angle, spacing, speed, extrude, outline) {
                let slice = newSlice(zoff + height / 2);
                for (let brim of rafts) {
                    // use first point of first brim as start point
                    if (printPoint === null) printPoint = brim.first();
                    let t = slice.addTop(brim);
                    if (outline) t.traces = [ brim ];
                    t.inner = POLY.expand([ brim ], nozzle * -0.8, 0, null, 1);
                    t.fill_lines = fillArea(t.inner, angle, spacing, []);
                    t.isRaft = true;
                }
                offset.z = slice.z;
                printPoint = slicePrintPath(print, slice, printPoint, offset, layerout, {
                    speed,
                    mult: extrude,
                });
                layerout.z = zoff + height;
                layerout.height = height;
                output.append(layerout);

                layerout = [];
                zoff += height;
                zneg = height / 2;
            };

            // cause first point of raft to be used
            printPoint = null;

            // emit raft layers
            raft(nozzle * 1.5, angle +  0, nozzle * 6.00, rate1, 2.50, true);
            raft(nozzle * 0.5, angle + 90, nozzle * 2.00, rate2, 1.50, true);
            raft(nozzle * 0.5, angle +  0, nozzle * 1.00, rate2, 1.00);
            raft(nozzle * 0.5, angle + 90, nozzle * 0.75, rate2, 0.75);

            // raise first layer off raft slightly to lessen adhesion
            firstLayerHeight += process.outputRaftSpacing || 0;
            zoff += process.outputRaftSpacing || 0;

            // retract after last raft layer
            output.last().last().retract = true;
        }

        // if using brim or skirt
        if (process.outputBrimCount) {
            let polys = [],
                preout = [];

            // offset specified # of brims
            POLY.offset(brims, nozzle, {
                outs: polys,
                flat: true,
                count: process.outputBrimCount,
                z: firstLayerHeight / 2 + zoff - zneg
            });

            print.setType('brim');
            shield = POLY.nest(polys.clone(), true).clone();

            // output brim points
            let brimStart = offset < nozzle * 2 ? newPoint(-bedWidth, -bedDepth, 0) : printPoint;
            printPoint = poly2polyEmit(polys, brimStart, (poly, index, count, startPoint) => {
                return print.polyPrintPath(poly, startPoint, preout, {
                    rate: firstLayerRate,
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
        let bbounds = base.newBounds();
        brims.forEach(brim => {
            bbounds.merge(brim.bounds);
        });
        bounds.min.x = Math.min(bounds.min.x, bbounds.minx);
        bounds.min.y = Math.min(bounds.min.y, bbounds.miny);
        bounds.max.x = Math.max(bounds.max.x, bbounds.maxx);
        bounds.max.y = Math.max(bounds.max.y, bbounds.maxy);
    }

    // synthesize support widgets when needed
    // so that they can use a separate extruder
    // compute zmin for belt purge towers
    for (let widget of widgets.slice()) {
        let sslices = [];
        if (!widget.slices) {
            console.log('invalid widget', widget);
            continue;
        }
        for (let slice of widget.slices) {
            zmin = Math.min(zmin, slice.z);
            if (!slice.supports) {
                continue;
            }
            let sslice = newSlice(slice.z);
            sslice.extruder = process.sliceSupportNozzle;
            sslice.supports = slice.supports.slice();
            sslice.height = slice.height;
            sslices.push(sslice);
        }
        if (sslices.length) {
            let swidget = kiri.newWidget(null,widget.group);
            swidget.slices = sslices;
            swidget.support = true;
            swidget.belt = widget.belt;
            swidget.track = Object.clone(widget.track);
            swidget.mesh = { widget: swidget, position: swidget.track.pos };
            widget.anno.extruder = process.sliceSupportNozzle;
            widgets.push(swidget);
        }
    }

    let lastPoly;
    let lastLayer;
    let lastOffset;
    let extruders = print.extruders = [];
    let extcount = 0;

    // find max layers (for updates)
    // generate list of used extruders for purge blocks
    for (let widget of widgets) {
        let extruder = widget.anno.extruder ?? 0;
        if (!extruders[extruder]) {
            extruders[extruder] = {};
            extcount++;
        }
    }

    // determine size/location of purge blocks
    let blokw = Math.sqrt(outputPurgeTower || 0);
    let blokh = blokw;
    let blokpos, walkpos, blok;

    function mkblok(w,h) {
        let count = extcount - 1;
        let gap = nozzle;
        if (isBelt) {
            let step = w + gap;
            let mp = (bounds.max.y + bounds.min.y) / 2;         // part y midpoint
            let sp = (bounds.max.y - bounds.min.y);             // part y span
            let ts = (w * count) + (gap * (count - 1));         // tower y span
            let ty = -ts + w/2 - gap/2;                         // tower start y
            blokpos = { y:ty, x: bounds.max.x + 2 + h / 2};     // first block pos
            walkpos = { y:step, x:0 };
            blok = { x:h, y:w };
        } else if (bounds.min.x < bounds.min.y) {
            let step = h + gap;
            let mp = (bounds.max.x + bounds.min.x) / 2;         // part y midpoint
            let sp = (bounds.max.x - bounds.min.x);             // part y span
            let ts = (h * count) + (gap * (count - 1));         // tower y span
            let tx = mp - ts / 2 + step / 2;                    // tower start y
            blokpos = { x:tx, y: bounds.max.y + 2 + w / 2};     // first block pos
            walkpos = { x:step, y:0 };
            blok = { x:w, y:h };
        } else {
            let step = w + gap;
            let mp = (bounds.max.y + bounds.min.y) / 2;         // part y midpoint
            let sp = (bounds.max.y - bounds.min.y);             // part y span
            let ts = (w * count) + (gap * (count - 1));         // tower y span
            let ty = mp - ts / 2 + step / 2;                    // tower start y
            blokpos = { y:ty, x: bounds.max.x + 2 + h / 2};     // first block pos
            walkpos = { y:step, x:0 };
            blok = { x:w, y:h };
        }
    }

    function mkrec(i, angle = 45, thin = 6) {
        let exi = device.extruders[i],
            noz = exi.extNozzle,
            pos = {x:blokpos.x + walkpos.x * i, y:blokpos.y + walkpos.y * i, z:0},
            rect = newPolygon().centerRectangle(pos, blok.x, blok.y),
            full = linesToPoly(fillArea([
                newPolygon().centerRectangle(pos, blok.x - noz, blok.y - noz)
            ], angle, noz)),
            sparse = rect.area() > 10 ? linesToPoly(fillArea([
                newPolygon().centerRectangle(pos, blok.x - noz, blok.y - noz)
            ], angle + 90, noz * thin)) : newPolygon(),
            rec = {
                extruder: i,
                diameter: exi.extNozzle,
                rect,
                full,
                sparse,
                pause: newPoint(pos.x + walkpos.y, pos.y + walkpos.x, pos.z)
            };
        return rec;
    }

    mkblok(blokw, blokh);

    // allocate tower space for extruders-1 locations
    let towers = extruders.slice(1).map((ext,i) => {
        return ext ? mkrec(i) : ext;
    });

    function linesToPoly(points) {
        let poly = newPolygon().setOpen();
        let ping = 0;
        for (let i=0; i<points.length; i += 2) {
            let p1 = points[i];
            let p2 = points[i+1];
            if (ping++ % 2 === 0) {
                poly.push(p1);
                poly.push(p2);
            } else {
                poly.push(p2);
                poly.push(p1);
            }
        }
        return poly;
    }

    let purgedFirst = false;
    let lastPurgeTool;

    // generate purge block for given nozzle
    function purge(nozzle, track, layer, start, z, using, offset) {
        if (!outputPurgeTower || extcount < 2) {
            return start;
        }
        let rec = track.shift();
        let thin = using >= 0 || lastPurgeTool === nozzle;
        let tool = using >= 0 ? using : nozzle;
        let first = isBelt ? !purgedFirst && layer.slice.index >= 0 : layer.slice.index === 0;
        let rate = first ? process.firstLayerRate : process.outputFeedrate;
        let wipe = true;
        lastPurgeTool = tool;
        if (rec) {
            print.setType('purge tower');
            if (layer.last()) {
                layer.last().retract = true;
            }
            purgedFirst = purgedFirst || first;
            let purgeOn = first || !thin;
            if (isBelt && z < 0) {
                let scale = 1 - ((z / zmin));
                mkblok(blokw * scale, blokh);
                rec = mkrec(rec.extruder, 0, 10);
                rate = (process.outputFeedrate - process.firstLayerRate) * scale + process.firstLayerRate;
                wipe = false;
            }
            let box = rec.rect.clone().setZ(z);
            let pause = rec.pause.clone().setZ(z);
            let fill = (z >= 0 && purgeOn ? rec.full : rec.sparse).clone().setZ(z);
            if (isBelt) {
                let bmove = {x:0, y:z, z:0};
                box.move(bmove);
                pause.move(bmove);
                if (fill) {
                    fill.move(bmove);
                }
                if (offset) {
                    let bo = { x:0, y:offset.y, z:offset.z };
                    box.move(bo);
                    pause.move(bo);
                    if (fill) fill.move(bo);
                }
            }
            start = print.polyPrintPath(box, start, layer, {
                tool,
                rate,
                simple: true,
                open: false,
                onfirstout: (out => out.overate = (isBelt ? rate : 0))
            });
            if (fill && fill.length) {
                // for pings, split path at 20mm
                start = print.polyPrintPath(fill, start, layer, {
                    tool,
                    rate,
                    simple: true,
                    open: true,
                    onfirst: (point) => { point.purgeOn = purgeOn ? pause : undefined }
                });
            }
            layer.last().retract = true;
            // experimental post-retract wipe
            if (wipe) start = print.polyPrintPath(box, start, layer, {
                tool,
                rate,
                simple: true,
                open: false,
                extrude: 0
            });
            layer.last().overate = 0;
            return start;
        } else {
            console.log({no_purge_tower_for: nozzle, using, track, layer});
            return start;
        }
    }

    // establish offsets
    for (let widget of widgets) {
        let { belt } = widget;
        let offset = Object.clone(widget.track.pos);
        if (isBelt) {
            offset = {
                x: belt.xpos,
                y: belt.ypos * belt.cosf,
                z: belt.ypos * belt.sinf
            };
        } else {
            // when rafts used this is non-zero
            offset.z = zoff;
        }
        widget.offset = offset;
    }

    // create shuffled slice cake by z offset (slice.z + offset.z)
    let cake = [];
    let zrec = {};
    for (let widget of widgets) {
        // skip synthesized support widget(s)
        if (!widget.mesh) {
            continue;
        }
        for (let slice of widget.slices) {
            slice.widget = widget;
            let z = (slice.z + widget.offset.z).round(2);
            let rec = zrec[z] = zrec[z] || {z, slices:[]};
            if (rec.slices.length === 0) {
                cake.push(rec);
            }
            rec.slices.push(slice);
        }
    }
    cake.sort((a, b) => {
        return a.z - b.z;
    });

    let firstTool;
    let lastWidget;
    let lastExt;
    let lastOut;

    // walk cake layers bottom up
    for (let layer of cake) {
        // track purge blocks generated for each layer
        let track = towers.slice();

        // iterate over layer slices, find closest widget, print, eliminate
        for (;;) {
            let order = [];
            // select slices of the same extruder type first then distance
            for (let slice of layer.slices) {
                if (slice.prep) {
                    continue;
                }
                let offset = lastOffset = slice.widget.offset;
                let find = slice.findClosestPointTo(printPoint.sub(offset));
                if (find) {
                    let ext = slice.extruder;
                    let lex = lastExt;
                    let dst = Math.abs(find.distance);
                    // penalize extruder swaps
                    if (ext !== lex) {
                        dst *= 10000;
                    }
                    // for first object, penalize extruders other than first
                    if (lastExt === undefined && ext > 0) {
                        dst *= 10000;
                    }
                    order.push({dst, slice, offset, z: layer.z});
                }
            }
            if (order.length === 0) {
                break;
            }
            order.sort((a,b) => {
                return a.dst - b.dst;
            });
            let { z, slice, offset } = order[0];
            if (firstTool === undefined) {
                firstTool = slice.extruder;
            }

            // when layers switch between widgets, force retraction
            let forceRetract = lastOut && lastOut.widget !== slice.widget;
            if (forceRetract && output.length) {
                // selecet last output of last layer
                output.last().last().retract = true;
            }

            let params = getRangeParameters(process, slice.index);
            slice.prep = true;
            // retract between widgets or layers (when set)
            if (layerout.length && slice.widget !== lastWidget) {
                layerout.last().retract = true;
            }
            lastWidget = slice.widget;
            layerout.z = z + slice.height / 2;
            layerout.height = layerout.height || slice.height;
            layerout.slice = slice;
            layerout.params = params;
            // mark layer as anchor if slice is belt and flag set
            layerout.anchor = slice.belt && slice.belt.anchor;
            // detect extruder change and print purge block
            if (!lastOut || lastOut.extruder !== slice.extruder) {
                if (slice.extruder >= 0)
                printPoint = purge(slice.extruder, track, layerout, printPoint, slice.z, undefined, offset);
            }
            let wtb = slice.widget.track.box;
            let beltStart = slice.belt && slice.belt.touch;// && (widgets.length === 1);
            // output seek to start point between mesh slices if previous data
            print.setType('layer');
            print.setWidget(lastWidget);
            printPoint = slicePrintPath(
                print,
                slice,
                beltStart ? newPoint(-5000, 5000, 0) : printPoint.sub(offset),
                offset,
                layerout,
                {
                    routeAround: process.outputAvoidGaps,
                    seedPoint: printPoint.sub(offset),
                    params, // range parameters
                    first: slice.index === 0,
                    support: slice.widget.support,
                    onBelt: beltStart,
                    pretract: (wipeDist) => {
                        if (!(lastLayer && lastLayer.length)) {
                            return;
                        }
                        let lastOut = lastLayer.last().set_retract();
                        if (wipeDist && lastPoly && lastOut.point) {
                            let center = lastPoly.center(true).add(offset);
                            let maxDist = lastOut.point.distTo2D(center);
                            let useDist = Math.min(wipeDist, maxDist);
                            let endpoint = lastOut.point.followTo(center, useDist);
                            if (endpoint.inPolygon(lastPoly)) {
                                print.addOutput(lastLayer, endpoint, null, null, lastOut.tool);
                            }
                        }
                    }
                }
            );
            print.setWidget(null);

            lastOut = slice;
            lastExt = lastOut.extruder;
            lastPoly = slice.lastPoly;
            lastLayer = layerout;

            if (params.outputLayerRetract && layerout.length) {
                layerout.last().retract = true;
            }
        }

        // clear slice.prep so it can be re-previewed in a different mode
        for (let widget of widgets) {
            // skip synthesized support widget(s)
            if (!widget.mesh) {
                continue;
            }
            for (let slice of widget.slices) {
                slice.prep = false;
            }
        }

        // draft shield
        if (layerno > 0 && shield && outputDraftShield) {
            print.setType('shield');
            shield = POLY.setZ(shield.clone(), printPoint.z);
            let preout = [];
            printPoint = poly2polyEmit(shield, printPoint, (poly, index, count, startPoint) => {
                return print.polyPrintPath(poly, startPoint, preout, {
                    onfirst: function(point) {
                        if (preout.length && point.distTo2D(startPoint) > 2) {
                            // retract between part and shield
                            preout.last().retract = true;
                        }
                    }
                });
            });
            preout.last().retract = true;
            layerout.appendAll(preout);
        }

        // if a declared extruder isn't used in a layer, use selected
        // extruder to fill the relevant purge blocks for later support
        if (lastOut) track.slice().forEach(ext => {
            printPoint = purge(ext.extruder, track, layerout, printPoint, lastOut.z, lastExt, lastOffset);
        });

        // if layer produced output, append to output array
        if (layerout.length) {
            output.append(layerout);
        }

        // retract after last layer
        if (layerno === cake.length - 1 && layerout.length) {
            layerout.last().retract = true;
        }

        // notify progress
        layerout.layer = layerno++;
        update((layerno / cake.length) * 0.5, "prepare");

        layerout = [];
    }

    print.output = output;
    print.firstTool = firstTool;

    // post-process for base extrusions (touching the bed)
    if (isBelt) {
        // all widgets should have the same belt scaling constants
        let belt = widgets[0].belt;
        // tune base threshold
        let thresh = Infinity;
        for (let layer of output) {
            for (let rec of layer) {
                let point = rec.point;
                thresh = Math.min(thresh, (belt.slope * point.z) - point.y);
            }
        }
        // store this offset to be removed from Y values in export
        print.belty = thresh;
        thresh = Math.max(0, thresh) + firstLayerHeight * belt.slope;
        // track last layer out b/c it might be connected to the current
        // layer first point, in which case the injected brim will cause a long print line
        let lastLayerOut;
        // iterate over layers, find extrusion on belt and
        // apply corrections and add brim when specified
        for (let layer of output) {
            let params = getRangeParameters(process, layer.layer || 0);
            let brimHalf = params.firstLayerBrim < 0;
            let firstLayerBrim = Math.abs(params.firstLayerBrim);
            let firstLayerBrimIn = params.firstLayerBrimIn || 0;
            let firstLayerBrimTrig = params.firstLayerBrimTrig || 0;
            let firstLayerBrimGap = params.firstLayerBrimGap || 0;
            let lastout, first = false;
            let minz = Infinity, maxy = -Infinity, minx = Infinity, maxx = -Infinity;
            let mins = Infinity;
            let miny = Infinity;
            let pads = [];
            let overate = 0;

            for (let rec of layer) {
                overate = rec.overate >= 0 ? rec.overate : overate;
                let brate = params.firstLayerRate || firstLayerRate;
                let bmult = params.firstLayerPrintMult || params.firstLayerPrintMult;
                let point = rec.point;
                let belty = rec.belty = -point.y + (point.z * belt.slope);
                let lowrate = belty <= thresh ? brate : overate || brate;
                miny = Math.min(miny, belty);
                if (layer.anchor) {
                    // apply base rate to entire anchor (including bump)
                    rec.speed = Math.min(rec.speed, lowrate);
                }
                if (rec.emit && belty <= thresh && lastout && Math.abs(lastout.belty - belty) < 0.01) {
                    // apply base speed to segments touching belt
                    rec.speed = params.firstLayerRate || Math.min(rec.speed, lowrate);
                    rec.emit *= bmult;
                    rec.fan = params.firstLayerFanSpeed;
                    minx = Math.min(minx, point.x, lastout.point.x);
                    maxx = Math.max(maxx, point.x, lastout.point.x);
                    maxy = Math.max(maxy, point.y);
                    minz = Math.min(minz, point.z);
                    first = rec;
                    // find length of shortest bed-facing segment
                    mins = Math.min(mins, lastout.point.distTo2D(rec.point));
                    // add to pads list if > 1mm long
                    if (point.x - lastout.point.x > 1) {
                        pads.push([lastout.point.x, point.x]);
                    }
                }
                lastout = rec;
            }
            // do not add brims to anchor layers
            if (!first || layer.anchor) {
                continue;
            }
            let tmpout = [];
            let trigmet = firstLayerBrimTrig === 0 || (firstLayerBrimTrig && mins <= firstLayerBrimTrig);
            let brimax = Math.max(firstLayerBrim, firstLayerBrimIn);
            // add brim when all conditions met
            if (brimax && trigmet) {
                let { emit, tool } = first;
                let y = maxy;
                let z = minz;
                let g = firstLayerBrimGap || 0;
                let b = Math.max(firstLayerBrim, 1) + g;
                let bi = Math.max(firstLayerBrimIn, 1) + g;
                let lastLayerOut = layer.last();
                lastLayerOut.retract = true;
                // if routaround selected, move to belt before moving to brim start
                if (process.outputAvoidGaps) {
                    let beltPoint = lastLayerOut.point.clone();
                    beltPoint.y = y;
                    print.addOutput(tmpout, beltPoint, 0, outputSeekrate, tool);
                }
                // outside brim
                if (firstLayerBrim && !brimHalf) {
                    print.addOutput(tmpout, newPoint(maxx + b, y, z), 0,    outputSeekrate, tool);
                    print.addOutput(tmpout, newPoint(maxx + g, y, z), emit, firstLayerRate, tool).retract = true;
                }
                // inside brim
                if (firstLayerBrimIn && pads.length > 1) {
                    let gaps = [];
                    let lpad = pads[0];
                    for (let pad of pads.slice(1)) {
                        let x0 = lpad[1];
                        let x1 = pad[0];
                        lpad = pad;
                        if (x1 - x0 > bi * 2) {
                            // over 2x brim so emit two segments
                            print.addOutput(tmpout, newPoint(x1 - g, y, z), 0,    outputSeekrate, tool);
                            print.addOutput(tmpout, newPoint(x1 - bi, y, z), emit, firstLayerRate, tool).retract = true;
                            print.addOutput(tmpout, newPoint(x0 + bi, y, z), 0,    outputSeekrate, tool);
                            print.addOutput(tmpout, newPoint(x0 + g, y, z), emit, firstLayerRate, tool).retract = true;
                        } else if (x1 - x0 > bi / 3) {
                            // over 1/3rd brim length emit single segment
                            print.addOutput(tmpout, newPoint(x1 - g, y, z), 0,    outputSeekrate, tool);
                            print.addOutput(tmpout, newPoint(x0 + g, y, z), emit, firstLayerRate, tool).retract = true;
                        }
                    }
                }
                // outside brim
                if (firstLayerBrim) {
                    print.addOutput(tmpout, newPoint(minx - b, y, z), 0,    outputSeekrate, tool);
                    print.addOutput(tmpout, newPoint(minx - g, y, z), emit, firstLayerRate, tool).retract = false;
                }
                // when there is a printing move between layers
                // inject non-printing move to after brim to prevent erroneous extrusion
                if (layer[0].emit && lastLayerOut) {
                    print.addOutput(tmpout, layer[0].point.clone(), 0, outputSeekrate, tool);
                }
                layer.splice(0,0,...tmpout);
            } else {
                // for any layer touching belt, ensure start point is nearest origin
                // print.addOutput(tmpout, newPoint(minx, maxy, minz), 0, outputSeekrate, first.tool);
                // print.lastPoint = newPoint(minx, maxy, minz);
            }
            lastLayerOut = layer.peek();
        }
    }

    // render if not explicitly disabled
    if (settings.render !== false) {
        await render.path(output, (progress, layer) => {
            update(0.5 + progress * 0.5, "render", layer);
        }, {
            lineWidth: settings.process.sliceLineWidth,
            toolMode: settings.pmode === 2,
            tools: device.extruders,
            thin: isThin,
            flat: isFlat,
            fdm: true
        });
    }
};

function slicePrintPath(print, slice, startPoint, offset, output, opt = {}) {
    const { settings } = print;
    const { device } = settings;
    const { bedWidth, bedDepth, bedRound } = device;

    let preout = [],
        process = opt.params || settings.process,
        originCenter = device.originCenter || bedRound,
        extruder = parseInt(slice.extruder || 0),
        nozzleSize = process.sliceLineWidth || device.extruders[extruder].extNozzle,
        firstLayer = (opt.first || false) && !opt.support,
        thinWall = nozzleSize * (opt.thinWall || 1.75),
        retractDist = opt.retractOver || (nozzleSize * 5),
        fillMult = opt.mult || process.outputFillMult,
        shellMult = opt.mult || process.outputShellMult || (process.ctSliceHeight >= 0 ? 1 : 0),
        shellOrder = {"out-in":-1,"in-out":1,"alternate":-2}[process.sliceShellOrder] || -1,
        sparseMult = process.outputSparseMult,
        coastDist = process.outputCoastDist || 0,
        finishSpeed = opt.speed || process.outputFinishrate,
        firstShellSpeed = process.firstLayerRate,
        firstFillSpeed = process.firstLayerFillRate,
        firstPrintMult = process.firstLayerPrintMult,
        printSpeed = opt.speed || (firstLayer ? firstShellSpeed : process.outputFeedrate),
        fillSpeed = opt.speed || opt.fillSpeed || (firstLayer ? firstFillSpeed || firstShellSpeed : process.outputFeedrate),
        infillSpeed = process.sliceFillRate || opt.infillSpeed || fillSpeed || printSpeed,
        moveSpeed = process.outputSeekrate,
        origin = startPoint.add(offset),
        zhop = process.zHopDistance || 0,
        antiBacklash = process.antiBacklash,
        wipeDist = process.outputRetractWipe || 0,
        isBelt = device.bedBelt,
        bedOffset = originCenter ? {
            x: 0,
            y: 0,
            z: 0
        } : {
            x: bedWidth/2,
            y: isBelt ? 0 : bedDepth/2,
            z: 0
        },
        beltFirst = process.outputBeltFirst || false,
        startClone = startPoint.clone(),
        seedPoint = opt.seedPoint || startPoint,
        switchTop = print.lastPoly && print.lastPoly.perimeter() < process.outputShortPoly,
        z = slice.z,
        lastPoly;

    // support alternating shell order
    if (Math.abs(shellOrder) > 1 && slice.index % 2 === 1) {
        shellOrder = -shellOrder;
    }

    if (slice.finishSolids) {
        fillSpeed = process.sliceSolidRate || finishSpeed;
    }

    // apply first layer extrusion multipliers
    if (firstLayer) {
        fillMult *= firstPrintMult;
        shellMult *= firstPrintMult;
        sparseMult *= firstPrintMult;
    }

    function retract() {
        let array = preout.length ? preout : output;
        if (array.length) {
            let last = array.last();
            last.retract = true;
            if (wipeDist && lastPoly && last.point) {
                let center = lastPoly.center(true);
                let maxDist = last.point.distTo2D(center);
                let useDist = Math.min(wipeDist, maxDist);
                let endpoint = last.point.followTo(center, useDist);
                if (endpoint.inPolygon(lastPoly)) {
                    print.addOutput(array, endpoint, null, null, last.tool);
                }
            }
        } else if (opt.pretract) {
            opt.pretract(wipeDist);
        } else {
            console.log('unable to retract. no preout or output');
        }
    }

    // return true if move path from p1 to p2 intersects a
    // top and a path around the top (inside print) was not found
    function intersectsTop(p1, p2) {
        if (slice.index < 0) {
            return false;
        }
        let int = false;
        slice.topPolysFlat().forEach((poly) => {
            if (!int) poly.forEachSegment((s1, s2) => {
                if (util.intersect(p1,p2,s1,s2,base.key.SEGINT)) {
                    return int = true;
                }
            });
        });
        // if intersecting, look for a route around
        if (int && opt.routeAround) {
            return !routeAround(p1, p2);
        }
        return int;
    }

    // returns true if routed around or no retract requried
    function routeAround(p1, p2) {
        const dbug = false;
        if (dbug === slice.index) console.log(slice.index, {p1, p2, d: p1.distTo2D(p2)});

        let ints = [];
        let tops = slice.topRouteFlat();
        for (let poly of tops) {
            poly.forEachSegment((s1, s2) => {
                let ip = util.intersect(p1,p2,s1,s2,base.key.SEGINT);
                if (ip) {
                    ints.push({ip, poly});
                }
            });
        }

        // no intersections
        if (ints.length === 0) {
            if (dbug === slice.index) console.log(slice.index, 'no ints');
            return false;
        }

        // odd # of intersections ?!? do retraction
        if (ints.length && ints.length % 2 !== 0) {
            if (dbug === slice.index) console.log(slice.index, {odd_intersects: ints});
            return false;
        }

        // sort by distance
        ints.sort((a, b) => {
            return a.ip.dist - b.ip.dist;
        });

        if (dbug === slice.index) console.log(slice.index, {ints});

        // check pairs. eliminate too close points.
        // pairs must intersect same poly or retract.
        for (let i=0; i<ints.length; i += 2) {
            let i1 = ints[i];
            let i2 = ints[i+1];
            // different poly. force retract
            if (i1.poly !== i2.poly) {
                if (dbug === slice.index) console.log(slice.index, {int_diff_poly: ints, i});
                return false;
            }
            // mark invalid intersect pairs (low or zero dist, etc)
            // TODO: only if this is the outer pair and there are closer inner pairs
            if (i1.ip.distTo2D(i2.ip) < retractDist) {
                if (dbug === slice.index) console.log(slice.index, {int_dist_too_small: i1.ip.distTo2D(i2.ip), retractDist});
                ints[i] = undefined;
                ints[i+1] = undefined;
            }
        }
        // filter out invalid intersection pairs
        ints = ints.filter(i => i);

        if (ints.length > 2) {
            if (dbug === slice.index) console.log(slice.index, {complex_route: ints.length});
            return false;
        }

        if (ints.length === 2) {
            // can route around intersected top polys
            for (let i=0; i<ints.length; i += 2) {
                let i1 = ints[0];
                let i2 = ints[1];

                // output first point
                print.addOutput(preout, i1.ip, 0, moveSpeed, extruder);

                // create two loops around poly
                // find shortest of two paths and emit poly points
                let poly = i1.poly;
                let isCW = poly.isClockwise();
                let points = poly.points;

                let p1p = isCW ? points : points.slice().reverse(); // CW
                let p2p = isCW ? points.slice().reverse() : points; // CCW

                let r1s = p1p.indexOf(isCW ? i1.ip.p2 : i1.ip.p1);
                let r1e = p1p.indexOf(isCW ? i2.ip.p1 : i2.ip.p2);

                let r1 = r1s === r1e ?
                    [ p1p[r1s] ] : r1s < r1e ?
                    [ ...p1p.slice(r1s,r1e+1) ] :
                    [ ...p1p.slice(r1s), ...p1p.slice(0,r1e+1) ];

                let r1d = 0;
                for (let i=1; i<r1.length; i++) {
                    r1d += r1[i-1].distTo2D(r1[i]);
                }

                let r2s = p2p.indexOf(isCW ? i1.ip.p1 : i1.ip.p2);
                let r2e = p2p.indexOf(isCW ? i2.ip.p2 : i2.ip.p1);

                let r2 = r2s === r2e ?
                    [ p2p[r2s] ] : r2s < r2e ?
                    [ ...p2p.slice(r2s,r2e+1) ] :
                    [ ...p2p.slice(r2s), ...p2p.slice(0,r2e+1) ];

                let r2d = 0;
                for (let i=1; i<r2.length; i++) {
                    r2d += r2[i-1].distTo2D(r2[i]);
                }

                let route = r1d <= r2d ? r1 : r2;

                if (dbug === slice.index) console.log(slice.index, {
                    ints: ints.map(i=>i.ip.dist),
                    i1, i2, same: i1.poly === i2.poly,
                    route,
                    p1, p2, dist: p1.distTo2D(p2),
                    r1, r1d, r1s, r1e,
                    r2, r2d, r2s, r2e,
                    isCW});

                for (let p of route) {
                    print.addOutput(preout, p, 0, moveSpeed, extruder);
                }

                // output last point
                print.addOutput(preout, i2.ip, 0, moveSpeed, extruder);
            }
            return true;
        }

        return false;
    }

    // solid infill
    function outputTraces(poly, opt = {}) {
        if (!poly) return;
        if (Array.isArray(poly)) {
            if (opt.sort) {
                let polys = poly.slice().sort((a,b) => {
                    return (a.perimeter() - b.perimeter()) * opt.sort;
                });
                let debug = polys.length > 3;
                let last;
                while (polys.length) {
                    let next;
                    for (let p of polys) {
                        if (!last) {
                            next = p;
                            break;
                        }
                        if (opt.sort > 0) {
                            // in-out
                            if (last.isInside(p)) {
                                next = p;
                                break;
                            }
                        } else {
                            // out-in
                            if (p.isInside(last)) {
                                next = p;
                                break;
                            }
                        }
                    }
                    if (next) {
                        last = next;
                        polys.remove(next);
                        outputTraces(next, opt);
                    } else {
                        last = null;
                    }
                }
            } else {
                outputOrderClosest(poly, function(next) {
                    outputTraces(next, opt);
                }, null);
            }
        } else {
            let finishShell = poly.depth === 0 && !firstLayer;
            startPoint = print.polyPrintPath(poly, startPoint, preout, {
                ccw: opt.shell && process.outputAlternating && slice.index % 2,
                tool: extruder,
                rate: finishShell ? finishSpeed : printSpeed,
                accel: finishShell,
                wipe: process.outputWipeDistance || 0,
                coast: firstLayer ? 0 : coastDist,
                extrude: numOrDefault(opt.extrude, shellMult),
                onfirst: function(firstPoint) {
                    let from = seedPoint || startPoint;
                    if (from.distTo2D(firstPoint) > retractDist) {
                        if (intersectsTop(from, firstPoint)) {
                            retract();
                        }
                    }
                    seedPoint = null;
                }
            });
            lastPoly = slice.lastPoly = poly;
        }
    }

    /**
     * output sparse infill
     * @param {Polygon[]} polys
     */
    function outputSparse(polys, extrude, speed) {
        if (!polys) return;
        let proxy = polys.map((poly) => {
            return {poly: poly, first: poly.first(), last: poly.last()};
        });
        let lp = startPoint;
        startPoint = tip2tipEmit(proxy, startPoint, (el, point, count) => {
            let poly = el.poly;
            if (poly.last() === point) {
                poly.reverse();
            }
            poly.forEachPoint((p, i) => {
                let dist = lp.distTo2D(p);
                let rdst = dist > retractDist;
                let itop = rdst && intersectsTop(lp,p);
                let emit = extrude;
                // retract if dist trigger and crosses a slice top polygon
                if (i === 0) {
                    if (itop) {
                        retract();
                        emit = 0;
                    } else if (dist > nozzleSize) {
                        emit = 0;
                    }
                }
                // let emit = i === 0 ? 0 : extrude;
                // handle shallow cloned infill
                if (poly.z !== undefined) {
                    p = p.clone().setZ(poly.z);
                }
                print.addOutput(preout, p, emit, speed || printSpeed, extruder);
                lp = p;
            }, !poly.open);
            return lp;
        });
    }

    /**
     * convert cross-hatch thin-fill into lines by connecting short segment mid-points
     */
    function outputThin(lines) {
        if (!lines) {
            return;
        }
        let points = lines.group(2).map(grp => {
            let [ p1, p2 ] = grp;
            return newPoint(
                (p1.x + p2.x) / 2,
                (p1.y + p2.y) / 2,
                (p1.z + p2.z) / 2
            )
        });
        let order = util.orderClosest(points, (p1, p2) => p1.distTo2D(p2));
        if (order.length === 0) {
            return;
        }
        let first = points[0];
        let last = first;
        if (startPoint && startPoint.distTo2D(first) > thinWall && intersectsTop(startPoint, first)) {
            retract();
        }
        print.addOutput(preout, first, 0, moveSpeed, extruder);
        for (let p of order) {
            let dist = last ? last.distTo2D(p) : 0;
            if (dist > thinWall) {
                retract();
                print.addOutput(preout, p, 0, moveSpeed, extruder);
            }
            print.addOutput(preout, p, 1, fillSpeed, extruder);
            startPoint = last = p;
        }
        // close a circle
        if (last && last.distTo2D(first) <= thinWall) {
            print.addOutput(preout, first, 1, fillSpeed, extruder);
            startPoint = first;
        }
    }

    /**
     * output solid infill
     * @param {*} lines
     * @param {*} opt
     */
    function outputFills(lines, opt = {}) {
        if (!lines || lines.length === 0) {
            return;
        }
        let p, p1, p2, dist, len, found, group, mindist, t1, t2,
            marked = 0,
            start = 0,
            skip = false,
            lastIndex = -1,
            raft = opt.raft || false,
            flow = opt.flow || 1,
            near = opt.near || (antiBacklash ? false : true),
            fast = opt.fast || false, // support infill only!
            fill = (opt.fill >= 0 ? opt.fill : fillMult) * flow,
            thinDist = near ? thinWall : thinWall;

        // continue until all lines in array are "marked" as used
        while (lines && marked < lines.length) {
            group = null;
            found = false;
            mindist = Infinity;

            // use next nearest line endpoint strategy
            if (near)
            for (let i=0; i<lines.length; i += 2) {
                t1 = lines[i];
                if (t1.del) {
                    continue;
                }
                t2 = lines[i+1];
                let d1 = t1.distToSq2D(startPoint);
                let d2 = t2.distToSq2D(startPoint);
                // penalize next nearest point if it's not on an adjacent line
                let idiff = startPoint.index ? Math.abs(startPoint.index - t1.index) : 1;
                let min = Math.min(d1, d2) * (idiff !== 1 ? 10 : 1);
                if (min < mindist) {
                    if (d2 < d1) {
                        p2 = t1;
                        p1 = t2;
                    } else {
                        p1 = t1;
                        p2 = t2;
                    }
                    mindist = min;
                }
            }

            // use next line index strategy (perpendicular offset from origin)
            if (!near)
            for (let i=start; i<lines.length; i += 2) {
                p = lines[i];
                if (p.del) {
                    continue;
                }
                if (group === null && p.index > lastIndex) {
                    group = p.index;
                }
                if (group !== null) {
                    if (p.index !== group) {
                        break;
                    }
                    if (p.index % 2 === 0) {
                        t1 = lines[i];
                        t2 = lines[i+1];
                    } else {
                        t2 = lines[i];
                        t1 = lines[i+1];
                    }
                    dist = Math.min(t1.distTo2D(startPoint), t2.distTo2D(startPoint));
                    if (dist < mindist) {
                        p1 = t1;
                        p2 = t2;
                        mindist = dist;
                    }
                    start = i;
                    found = true;
                }
            }

            // go back to start and try again
            if (!near && !found) {
                if (start === 0 && lastIndex === -1) {
                    console.log('infinite loop', lines, {
                        marked, i, group, start, lastIndex,
                        points: lines.map(p => p.index).join(', ')
                    });
                    break;
                }
                start = 0;
                lastIndex = -1;
                continue;
            }

            dist = startPoint.distToSq2D(p1);
            len = p1.distToSq2D(p2);

            // go back to start when dist > retractDist
            if (!near && !fast && !skip && dist > retractDist) {
                skip = true;
                start = 0;
                lastIndex = -1;
                continue;
            }
            skip = false;

            // re-seek a new start index within fill array
            let restart = lastIndex < 0;

            // mark as used
            p1.del = true;
            p2.del = true;
            marked += 2;
            lastIndex = p1.index;

            // if dist to new segment is less than thinWall
            // and segment length is less than thinWall then
            // just extrude to midpoint of next segment. this is
            // to avoid shaking the printer to death.
            if (dist <= thinDist && len <= thinDist) {
                p2 = p1.midPointTo(p2);
                // this.addOutput(preout, p2, fill * (dist / thinWall), fillSpeed, extruder);
                print.addOutput(preout, p2, fill, fillSpeed, extruder);
            } else {
                // retract if dist trigger or crosses a slice top polygon
                if (!fast && dist > retractDist && (zhop || intersectsTop(startPoint, p1))) {
                    retract();
                }

                // anti-backlash on longer move
                if (!fast && antiBacklash && dist > retractDist) {
                    print.addOutput(preout, p1.add({x:antiBacklash,y:-antiBacklash,z:0}), 0, moveSpeed, extruder);
                }

                // bridge ends of fill when they're close together
                if (dist < thinDist) {
                    print.addOutput(preout, p1, fill, fillSpeed, extruder);
                } else if (raft && !restart) {
                    // connect raft lines unless it's a restart
                    print.addOutput(preout, p1, fill, fillSpeed, extruder);
                } else {
                    print.addOutput(preout, p1, 0, moveSpeed, extruder);
                }
                print.addOutput(preout, p2, fill, fillSpeed, extruder);
            }

            startPoint = p2;
        }

        // clear delete marks so we can re-print later
        if (lines) lines.forEach(p => { p.del = false });
    }

    /**
     * given array of polygons, emit them in next closest order with
     * the special exception that depth is considered into distance
     * so that inner polygons are emitted first.
     *
     * @param {Array} array of Polygons or Polygon wrappers (tops)
     * @param {Function} fn call to emit next candidate
     * @param {Function} fnp convert 'next' object into a Polygon for closeness
     */
    function outputOrderClosest(array, fn, fnp) {
        if (array.length === 1) {
            return fn(array[0]);
        }
        array = array.slice();
        let closest, find, next, order, poly, lastDepth = 0;
        for (;;) {
            order = [];
            closest = null;
            for (let i=0; i<array.length; i++) {
                next = array[i];
                if (!next) continue;
                poly = fnp ? fnp(next) : next;
                find = poly.findClosestPointTo(startPoint);
                order.push({
                    i: i,
                    n: next,
                    d: find.distance - (poly.depth * thinWall),
                });
            }
            if (order.length === 0) {
                return;
            }
            // when previous top is under a certain length
            // seek furthest top on layer switch
            if (switchTop) {
                switchTop = false;
                order.sort((a,b) => {
                    return b.d - a.d;
                });
            } else {
                order.sort((a,b) => {
                    return a.d - b.d;
                });
            }
            array[order[0].i] = null;
            fn(order[0].n);
        }
    }

    let out = [];
    if (slice.tops) {
        out.appendAll(slice.tops);
    }
    if (opt.support && slice.supports) {
        out.appendAll(slice.supports);
    }

    let lastTop = null;
    outputOrderClosest(out, function(next) {
        if (next instanceof Polygon) {
            print.setType('support');
            // support polygon
            next.setZ(z);
            if (process.sliceSupportOutline !== false) {
                outputTraces([next].appendAll(next.inner || []));
            }
            if (next.fill) {
                next.fill.forEach(p => { p.z = z });
                outputFills(next.fill, {fast: true, near: true});
            }
        } else {
            // solid infill
            let top = next;
            let isRaft = top.isRaft;

            print.setType('shells');
            if (lastTop && lastTop !== next) {
                retract();
            }

            // control of layer start point
            switch (process.sliceLayerStart) {
                case "last":
                    break;
                case "random":
                    let bounds = top.poly.bounds;
                    let center = bounds.center();
                    let radius = Math.max(bounds.width(), bounds.height());
                    let angle = Math.random()*Math.PI*2;
                    let x = center.x + Math.cos(angle)*radius;
                    let y = center.y + Math.sin(angle)*radius;
                    startPoint = newPoint(x,y,startPoint.z);
                    break;
                case "center":
                    startPoint = newPoint(0,0,startPoint.z);
                    break;
                case "origin":
                    startPoint = newPoint(-bedOffset.x, -bedOffset.y, startPoint.z);
                    break;
                case "position":
                    startPoint = newPoint(-bedOffset.x+process.sliceLayerStartX, -bedOffset.y+process.sliceLayerStartY, startPoint.z);
                    break;
            }

            // optimize start point on belt for tops touching belt
            // and enforce optimal shell order (outer first)
            if (isBelt && opt.onBelt) {
                startPoint = startClone;
                if (beltFirst) {
                    shellOrder = -1;
                }
            }

            // raft
            if (top.traces) outputTraces(top.traces);

            // innermost shells
            let inner = next.innerShells() || [];
            let shells = next.shells || [];

            // alternating winding option
            // if (process.outputAlternating || slice.index % 2) {
            //     console.log({alternating: slice, shells, inner});
            //     POLY.setWinding(inner, false);
            //     POLY.setWinding(shells, false);
            // }

            // output inner polygons
            if (shellOrder > 0) outputTraces(inner, { sort: shellOrder, shell: true });

            outputTraces(shells, { sort: shellOrder, shell: true });

            // output outer polygons
            if (shellOrder < 0) outputTraces(inner, { sort: shellOrder, shell: true });

            // output thin fill
            print.setType('thin fill');
            outputThin(next.thin_fill);

            // then output solid and sparse fill
            print.setType('solid fill');
            outputFills(next.fill_lines, { flow: fillMult, raft: isRaft });

            print.setType('sparse infill');
            outputSparse(next.fill_sparse, sparseMult, infillSpeed);

            lastTop = next;
        }
    }, function(obj) {
        // for tops, return the wrapped poly
        return obj instanceof Polygon ? obj : obj.poly;
    });

    // produce polishing paths when present
    if (slice.tops && slice.tops.length && slice.tops[0].polish) {
        let {x,y} = slice.tops[0].polish;
        if (x) {
            outputSparse(x, 0, process.polishSpeed);
        }
        if (y) {
            outputSparse(y, 0, process.polishSpeed);
        }
    }

    // offset print points
    for (let i=0; i<preout.length; i++) {
        preout[i].point = preout[i].point.add(offset);
    }

    // add offset points to total print
    print.addPrintPoints(preout, output, origin, extruder);

    return startPoint.add(offset);
}

});
