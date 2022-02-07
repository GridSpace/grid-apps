/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        FDM = KIRI.driver.FDM,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon,
        getRangeParameters = FDM.getRangeParameters,
        debug = false;

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Function} update progress callback
     * @returns {Object[]} returns array of render objects
     */
    FDM.prepare = function(widgets, settings, update) {
        // filter ignored widgets
        widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);

        let render = settings.render !== false,
            { device, process, controller, bounds, mode } = settings,
            { bedWidth, bedDepth } = device,
            output = [],
            printPoint = newPoint(0,0,0),
            nozzle = device.extruders[0].extNozzle,
            isBelt = device.bedBelt,
            isThin = controller.lineType === "line",
            isFlat = controller.lineType === "flat",
            isDanger = controller.danger || false,
            isPalette = device.filamentSource === 'palette3',
            firstLayerHeight = isBelt ? process.sliceHeight : process.firstSliceHeight || process.sliceHeight,
            firstLayerSeek = process.outputSeekrate,
            firstLayerRate = process.firstLayerRate,
            firstLayerMult = process.firstLayerPrintMult,
            purgeTower = process.outputPurgeTower || 0,
            layerRetract = process.outputLayerRetract,
            draftShield = process.outputDraftShield,
            layerno = 0,
            zoff = 0,
            zmin = 0,
            shield,
            layerout = [],
            print = self.worker.print = KIRI.newPrint(settings, widgets),
            beltfact = Math.cos(Math.PI/4);

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
        if (!isBelt && (process.outputBrimCount || process.outputRaft)) {
            let brims = [],
                offset = process.outputBrimOffset || (process.outputRaft ? 4 : 0);

            // compute first brim
            widgets.filter(w => w.slices.length).forEach(function(widget) {
                let tops = [];
                let slices = [];
                if (draftShield) {
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
                if (draftShield) {
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
            if (brims.length) {
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
                    let slice = KIRI.newSlice(zoff + height / 2);
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
                    layerout.z = zoff + height;
                    layerout.height = height;
                    output.append(layerout);

                    layerout = [];
                    zoff += height;
                };

                raft(nozzle/1, process.sliceFillAngle + 0 , nozzle * 5.0, firstLayerRate / 3, 4);
                raft(nozzle/1, process.sliceFillAngle + 0 , nozzle * 5.0, firstLayerRate / 2, 4);
                raft(nozzle/2, process.sliceFillAngle + 90, nozzle * 3.0, process.outputFeedrate, 2.5);
                raft(nozzle/2, process.sliceFillAngle + 0 , nozzle * 1.0, process.outputFeedrate, 1.5);
                raft(nozzle/2, process.sliceFillAngle + 90 , nozzle * 0.7, process.outputFeedrate, 0.75);

                // raise first layer off raft slightly to lessen adhesion
                firstLayerHeight += process.outputRaftSpacing || 0;
                zoff += process.outputRaftSpacing || 0;

                // retract after last raft layer
                output.last().last().retract = true;
            }
            // raft excludes brims
            else
            // if using brim vs raft
            if (process.outputBrimCount) {
                let polys = [],
                    preout = [];

                // offset specified # of brims
                POLY.offset(brims, nozzle, {
                    outs: polys,
                    flat: true,
                    count: process.outputBrimCount,
                    z: firstLayerHeight / 2
                });

                print.setType('brim');
                shield = POLY.nest(polys.clone(), true).clone();

                // output brim points
                let brimStart = offset < nozzle * 2 ? newPoint(-bedWidth, -bedDepth, 0) : printPoint;
                printPoint = print.poly2polyEmit(polys, brimStart, (poly, index, count, startPoint) => {
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
            let bbounds = BASE.newBounds();
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
                let sslice = KIRI.newSlice(slice.z);
                sslice.extruder = process.sliceSupportNozzle;
                sslice.supports = slice.supports.slice();
                sslice.height = slice.height;
                sslices.push(sslice);
            }
            if (sslices.length) {
                let swidget = KIRI.newWidget(null,widget.group);
                swidget.slices = sslices;
                swidget.support = true;
                swidget.rotinfo = widget.rotinfo;
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
            let extruder = widget.anno.extruder || 0;
            if (!extruders[extruder]) {
                extruders[extruder] = {};
                extcount++;
            }
        }

        // determine size/location of purge blocks
        let blokw = Math.sqrt(purgeTower);
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
                full = linesToPoly(POLY.fillArea([
                    newPolygon().centerRectangle(pos, blok.x - noz, blok.y - noz)
                ], angle, noz)),
                sparse = rect.area() > 10 ? linesToPoly(POLY.fillArea([
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
            if (!purgeTower || extcount < 2) {
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
            let { rotinfo, belt } = widget;
            let offset = Object.clone(widget.track.pos);
            if (isBelt) {
                let o = rotinfo.ypos * beltfact;
                offset = {
                    x: rotinfo.xpos,
                    y: o,
                    z: o
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

        let firstExt;
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
                if (firstExt === undefined) {
                    firstExt = slice.extruder;
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
                printPoint = print.slicePrintPath(
                    slice,
                    beltStart ? newPoint(-5000, 5000, 0) : printPoint.sub(offset),
                    offset,
                    layerout,
                    {
                        routeAround: process.outputAvoidGaps,
                        seedPoint: printPoint.sub(offset),
                        danger: isDanger,
                        params, // range parameters
                        first: slice.index === 0,
                        support: slice.widget.support,
                        onBelt: beltStart,
                        pretract: (wipeDist) => {
                            if (lastLayer && lastLayer.length) {
                                let lastOut = lastLayer.last();
                                lastOut.retract = true;
                                if (wipeDist && lastPoly && lastOut.point) {
                                    let endpoint = lastOut.point.followTo(lastPoly.center(true).add(offset), wipeDist);
                                    if (endpoint.inPolygon(lastPoly)) {
                                        print.addOutput(lastLayer, endpoint);
                                    }
                                }
                            }
                        }
                    }
                );
                lastOut = slice;
                lastExt = lastOut.extruder;
                lastPoly = slice.lastPoly;
                lastLayer = layerout;

                if (layerRetract && layerout.length) {
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
            if (layerno > 0 && shield && draftShield) {
                print.setType('shield');
                shield = POLY.setZ(shield.clone(), printPoint.z);
                let preout = [];
                printPoint = print.poly2polyEmit(shield, printPoint, (poly, index, count, startPoint) => {
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
            track.slice().forEach(ext => {
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

        // post-process for base extrusions (touching the bed)
        if (isBelt) {
            // tune base threshold
            let thresh = Infinity;
            for (let layer of output) {
                for (let rec of layer) {
                    let point = rec.point;
                    thresh = Math.min(thresh, point.z - point.y);
                }
            }
            // store this offset to be removed from Y values in export
            print.belty = thresh;
            thresh = thresh + firstLayerHeight * 0.25;
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
                    let bmult = params.firstLayerPrintMult || firstLayerMult;
                    let point = rec.point;
                    let belty = rec.belty = -point.y + point.z;
                    let lowrate = belty <= thresh ? brate : overate || brate;
                    miny = Math.min(miny, belty);
                    if (layer.anchor) {
                        // apply base rate to entire anchor (including bump)
                        rec.speed = Math.min(rec.speed, lowrate);
                    }
                    if (rec.emit && belty <= thresh && lastout && Math.abs(lastout.belty - belty) < 0.005) {
                        // apply base speed to segments touching belt
                        rec.speed = Math.min(rec.speed, lowrate);
                        rec.emit *= bmult;
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
                    layer.last().retract = true;
                    // outside brim
                    if (firstLayerBrim && !brimHalf) {
                        print.addOutput(tmpout, newPoint(maxx + b, y, z), 0,    firstLayerSeek, tool);
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
                                print.addOutput(tmpout, newPoint(x1 - g, y, z), 0,    firstLayerSeek, tool);
                                print.addOutput(tmpout, newPoint(x1 - bi, y, z), emit, firstLayerRate, tool).retract = true;
                                print.addOutput(tmpout, newPoint(x0 + bi, y, z), 0,    firstLayerSeek, tool);
                                print.addOutput(tmpout, newPoint(x0 + g, y, z), emit, firstLayerRate, tool).retract = true;
                            } else if (x1 - x0 > bi / 3) {
                                // over 1/3rd brim length emit single segment
                                print.addOutput(tmpout, newPoint(x1 - g, y, z), 0,    firstLayerSeek, tool);
                                print.addOutput(tmpout, newPoint(x0 + g, y, z), emit, firstLayerRate, tool).retract = true;
                            }
                        }
                    }
                    // outside brim
                    if (firstLayerBrim) {
                        print.addOutput(tmpout, newPoint(minx - b, y, z), 0,    firstLayerSeek, tool);
                        print.addOutput(tmpout, newPoint(minx - g, y, z), emit, firstLayerRate, tool).retract = false;
                    }
                } else {
                    // for any layer touching belt, ensure start point is nearest origin
                    // print.addOutput(tmpout, newPoint(minx, maxy, minz), 0, firstLayerSeek, first.tool);
                    // print.lastPoint = newPoint(minx, maxy, minz);
                }
                layer.splice(0,0,...tmpout);
            }
        }

        // render if not explicitly disabled
        if (render) {
            print.render = FDM.prepareRender(output, (progress, layer) => {
                update(0.5 + progress * 0.5, "render", layer);
            }, {
                toolMode: settings.pmode === 2,
                tools: device.extruders,
                thin: isThin,
                flat: isFlat,
                fdm: true
            });
        }

        return print.render;
    };

    class Counter {
        constructor() {
            this.map = {};
            this.total = 0;
        }
        put(key) {
            const map = this.map;
            const kp = key || 'bad';
            map[kp] = (map[kp] || 0) + 1;
            this.total++;
        }
        get() {
            return { map: this.map, total: this.total };
        }
    }

    FDM.isDark = function() {
        return current.print.settings.controller.dark ? true : false;
    };

    FDM.rateToColor = function(rate, max) {
        return FDM.isDark() ?
            darkColorFunction(rate/max, 1, 0.85) :
            currentColorFunction(rate/max, 1, 0.85);
    };

    FDM.prepareRender = function(levels, update, opts = {}) {
        levels = levels.filter(level => level.length);
        if (levels.length === 0) {
            self.worker.print.maxSpeed = 0;
            return [];
        }

        const dark = FDM.isDark();
        const tools = opts.tools || {};
        const flat = opts.flat;
        const thin = opts.thin && !flat;
        const ckspeed = opts.speed !== false;
        const headColor = 0x888888;
        const moveColor = opts.move >= 0 ? opts.move : 0xaaaaaa;
        const printColor = opts.print >= 0 ? opts.print : 0x777700;
        const arrowAll = true;
        const arrowSize = arrowAll ? 0.2 : 0.4;
        const layers = [];
        const toolMode = opts.toolMode;

        const moveOpt = {
            face: moveColor,
            line: flat ? 1 : moveColor,
            opacity: flat ? 0.5 : 1
        };
        const printOpt = {
            face: printColor,
            line: flat ? 1 : printColor,
            opacity: flat ? 0.5 : 1
        };

        let minspd = Infinity;
        let maxspd = opts.maxspeed || 0;
        let maxtool = [];

        for (let level of levels) {
            for (let o of level) {
                if (o.speed) {
                    minspd = Math.min(minspd, o.speed);
                    maxspd = Math.max(maxspd, o.speed);
                }
                if (toolMode && o.tool !== undefined) {
                    if (maxtool.indexOf(o.tool) < 0) {
                        maxtool.push(o.tool);
                    }
                }
            }
        }

        // const maxspd = levels.map(level => {
        //     return level.map(o => o.speed || 0).reduce((a, v) => Math.max(a,v));
        // }).reduce((a, v) => Math.max(a, v)) + 1;

        // for reporting
        self.worker.print.minSpeed = minspd;
        self.worker.print.maxSpeed = maxspd;
        self.worker.print.thinColor = thin;
        self.worker.print.flatColor = flat;

        let lastTool = null;
        let lastEnd = null;
        let lastOut = null;
        let current = null;
        let retracted = false;
        let retractz = 0;

        function color(point) {
            if (toolMode) {
                return FDM.rateToColor(maxtool.indexOf(point.tool), maxtool.length);
            } else {
                return FDM.rateToColor(point.speed, maxspd);
            }
        }

        levels.forEach((level, index) => {
            const prints = {};
            const moves = [];
            const heads = [];
            const changes = [];
            const retracts = [];
            const engages = [];
            const output = new KIRI.Layers();
            layers.push(output);

            const pushPrint = (toolid, poly) => {
                toolid = toolid || 0;
                const array = prints[toolid] = prints[toolid] || [];
                const tool = tools[toolid] || {};
                array.width = (tool.extNozzle || 1) / 2;
                array.push(poly);
                emits++;
            };

            let height = level.height / 2;
            let width = 1;
            let emits = 0;

            level.forEach((out,oi) => {
                if (retracted && out.emit) {
                    retracted = false;
                    engages.push(lastOut.point);
                }
                if (out.tool !== lastTool) {
                    lastTool = out.tool;
                    changes.push(out.point);
                }
                if (out.retract) {
                    retracts.push(out.point);
                    retracted = true;
                    retractz++;
                }
                if (!out.point) {
                    // in cam mode, these are drilling or dwell ops
                    return;
                }

                if (lastOut) {
                    if (arrowAll || lastOut.emit !== out.emit) {
                        heads.push({p1: lastOut.point, p2: out.point});
                    }
                    const op = out.point, lp = lastOut.point;
                    // const moved = Math.max(
                    //     Math.abs(op.x - lp.x),
                    //     Math.abs(op.y - lp.y),
                    //     Math.abs(op.z - lp.z));
                    // if (moved < 0.0001) return;
                    if (out.emit) {
                        if (!lastOut.emit || (ckspeed && out.speed !== lastOut.speed) || lastEnd) {
                            current = newPolygon().setOpen();
                            current.push(lastOut.point);
                            current.color = color(out);
                            pushPrint(out.tool, current);
                        }
                        current.push(out.point);
                    } else {
                        if (lastOut.emit || lastEnd) {
                            current = newPolygon().setOpen();
                            current.push(lastOut.point);
                            moves.push(current);
                        }
                        current.push(out.point);
                    }
                    lastEnd = null;
                } else {
                    current = newPolygon().setOpen();
                    current.push(out.point);
                    if (out.emit) {
                        current.color = color(out);
                        pushPrint(out.tool, current);
                    } else {
                        moves.push(current);
                    }
                }
                lastOut = out;
            });
            // all moves with an emit at the very end (common in contouring)
            if (lastOut.emit && !emits) {
                pushPrint(lastOut.tool, current)
            }
            lastEnd = lastOut;
            if (changes.length) {
                output
                    .setLayer('tool', { line: 0x000055, face: 0x0000ff, opacity: 0.5 }, true)
                    .addAreas(changes.map(point => {
                        return newPolygon().centerCircle(point, 0.2, 4).setZ(point.z + 0.03);
                    }), { outline: true });
            }
            if (retracts.length) {
                output
                    .setLayer('retract', { line: 0x550000, face: 0xff0000, opacity: 0.5 }, true)
                    .addAreas(retracts.map(point => {
                        return newPolygon().centerCircle(point, 0.2, 5).setZ(point.z + 0.01);
                    }), { outline: true });
            }
            if (engages.length) {
                output
                    .setLayer('engage', { line: 0x005500, face: 0x00ff00, opacity: 0.5 }, true)
                    .addAreas(engages.map(point => {
                        return newPolygon().centerCircle(point, 0.2, 7).setZ(point.z + 0.02);
                    }), { outline: true });
            }
            if (heads.length) {
                let line = dark ? 0xffffff : 0x112233;
                output
                    .setLayer('arrows', { face: headColor, line, opacity: 0.75 }, true)
                    .addAreas(heads.map(points => {
                        const {p1, p2} = points;
                        const slope = p2.slopeTo(p1);
                        const s1 = BASE.newSlopeFromAngle(slope.angle + 20);
                        const s2 = BASE.newSlopeFromAngle(slope.angle - 20);
                        const p3 = points.p2.projectOnSlope(s1, arrowSize);
                        const p4 = points.p2.projectOnSlope(s2, arrowSize);
                        return newPolygon().addPoints([p2,p3,p4]).setZ(p2.z + 0.01);
                    }), { thin: true, outline: true });
            }
            output
                .setLayer(opts.other || 'move', moveOpt, opts.moves !== true)
                .addPolys(moves, { thin: true, z: opts.z });
            // force level when present
            let pz = level.z ? level.z - height : opts.z;
            Object.values(prints).forEach(array => {
                array.forEach(poly => {
                    if (flat && poly.appearsClosed()) {
                        poly.setClosed();
                        poly.points.pop();
                    }
                    output
                    .setLayer(opts.action || 'print', printOpt)
                    .addPolys([ poly ],
                        thin ? { thin, z: opts.z, color: poly.color } :
                        flat ? {
                            flat, z: pz, color: poly.color,
                            outline: true, offset: array.width, open: poly.open  } :
                        {
                            offset: array.width, height, z: pz,
                            color: { face: poly.color, line: poly.color }
                        })
                });
            });

            update(index / levels.length, output);
        });
        // console.log({retractz});
        return layers;
    }

    const colorFunctions = FDM.colorFunctions = {
        default: hsv2rgb.bind({ seg: 4, fn: color4d }),
        simple: hsv2rgb.bind({ seg: 3, fn: color4 }),
        dark: hsv2rgb.bind({ seg: 4, fn: color4d })
    };

    let currentColorFunction = colorFunctions.default;
    let darkColorFunction = colorFunctions.dark;

    // hsv values all = 0 to 1
    function hsv2rgb(h, s, v) {
        const div = this.seg;
        const ss = 1 / div;
        const seg = Math.floor(h / ss);
        const rem = h - (seg * ss);
        const inc = (rem / ss);
        const dec = (1 - inc);
        const rgb = {r: 0, g: 0, b: 0};
        this.fn(rgb, inc, seg);
        rgb.r = ((rgb.r * 255 * v) & 0xff) << 16;
        rgb.g = ((rgb.g * 255 * v) & 0xff) << 8;
        rgb.b = ((rgb.b * 255 * v) & 0xff);
        return rgb.r | rgb.g | rgb.b;
    }

    function color5(rgb, inc, seg) {
        const dec = 1 - inc;
        switch (seg) {
            case 0:
                rgb.r = 1;
                rgb.g = inc;
                rgb.b = 0;
                break;
            case 1:
                rgb.r = dec;
                rgb.g = 1;
                rgb.b = 0;
                break;
            case 2:
                rgb.r = 0;
                rgb.g = dec;
                rgb.b = inc;
                break;
            case 3:
                rgb.r = inc;
                rgb.g = 0;
                rgb.b = 1;
                break;
            case 4:
                rgb.r = dec;
                rgb.g = 0;
                rgb.b = dec;
                break;
        }
    }

    function color4d(rgb, inc, seg) {
        const dec = 1 - inc;
        switch (seg) {
            case 0:
                rgb.r = 1;
                rgb.g = inc;
                rgb.b = 0;
                break;
            case 1:
                rgb.r = dec;
                rgb.g = 1;
                rgb.b = 0;
                break;
            case 2:
                rgb.r = 0;
                rgb.g = dec;
                rgb.b = inc;
                break;
            case 3:
                rgb.r = inc * 0.85;
                rgb.g = 0;
                rgb.b = 1;
                break;
            case 4:
                rgb.r = 0.85;
                rgb.g = 0;
                rgb.b = 1;
                break;
        }
    }


    function color4(rgb, inc, seg) {
        const dec = 1 - inc;
        switch (seg) {
            case 0:
                rgb.r = 0;
                rgb.g = inc;
                rgb.b = 1;
                break;
            case 1:
                rgb.r = inc;
                rgb.g = 1;
                rgb.b = 0;
                break;
            case 2:
                rgb.r = 1;
                rgb.g = dec;
                rgb.b = 0;
                break;
            case 3:
                rgb.r = dec;
                rgb.g = 0;
                rgb.b = 0;
                break;
        }
    }

})();
