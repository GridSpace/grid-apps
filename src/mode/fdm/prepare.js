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
        getRangeParameters = FDM.getRangeParameters;

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Function} update progress callback
     * @returns {Object[]} returns array of render objects
     */
    FDM.prepare = function(widgets, settings, update) {
        // filter ignored widgets
        widgets = widgets.filter(w => !w.track.ignore);

        settings = FDM.fixExtruders(settings);
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
            firstLayerHeight = isBelt ? process.sliceHeight : process.firstSliceHeight || process.sliceHeight,
            firstLayerSeek = process.outputSeekrate,
            firstLayerRate = process.firstLayerRate,
            firstLayerMult = process.firstLayerPrintMult,
            layerRetract = process.outputLayerRetract,
            layerno = 0,
            zoff = 0,
            layerout = [],
            slices = [],
            print = self.worker.print = KIRI.newPrint(settings, widgets),
            beltYoff = device.bedDepth / 2,
            beltfact = Math.cos(Math.PI/4),
            invbfact = 1 / beltfact,
            bfactor = invbfact * beltfact;

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

                // expand specified # of brims
                brims.forEach(function(brim) {
                    POLY.offset([brim], nozzle, {
                        outs: polys,
                        flat: true,
                        count: process.outputBrimCount,
                        z: firstLayerHeight / 2
                    });
                });

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
        for (let widget of widgets.slice()) {
            let sslices = [];
            if (!widget.slices) {
                console.log('invalid widget', widget);
                continue;
            }
            for (let slice of widget.slices) {
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
                settings.widget[swidget.id] = { extruder: process.sliceSupportNozzle };
                widgets.push(swidget);
            }
        }

        let lastPoly;
        let lastLayer;
        let extruders = [];
        let extcount = 0;

        // find max layers (for updates)
        // generate list of used extruders for purge blocks
        for (let widget of widgets) {
            let extruder = (settings.widget[widget.id] || {}).extruder || 0;
            if (!extruders[extruder]) {
                extruders[extruder] = {};
                extcount++;
            }
        }

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
                    poly: newPolygon().centerSpiral(pos, blok.x, blok.y, noz*2, 3)
                };
            blokpos.x += walkpos.x;
            blokpos.y += walkpos.y;
            return rec;
        });

        // generate purge block for given nozzle
        function purge(nozzle, track, layer, start, z, using) {
            if (extcount < 2 || isBelt) {
                return start;
            }
            let rec = track[nozzle];
            if (rec) {
                track[nozzle] = null;
                if (layer.last()) {
                    layer.last().retract = true;
                }
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

        // establish offsets
        for (let widget of widgets) {
            let { rotinfo, belt } = widget;
            let offset = Object.clone(widget.track.pos);
            if (isBelt) {
                let o = rotinfo.ypos * beltfact;
                offset = {
                    x: rotinfo.xpos,
                    y: o - belt.midy - belt.yadd/2,
                    z: o,
                };
                // offset = { x:0, y:0, z:0 };
                // locate the lowest point in slices and widget overall
                let minby = Infinity;
                for (let slice of widget.slices) {
                    slice.minby = Infinity;
                    for (let top of slice.tops) {
                        let poly = top.poly;
                        for (let point of poly.points) {
                            let ypos = -point.y + point.z * bfactor;
                            slice.minby = Math.min(slice.minby, ypos);
                            minby = Math.min(minby, ypos);
                        }
                    }
                }
                // todo remove b/c this is now calculated at slice time
                // flag slices as being on or off the bed / belt
                // for (let slice of widget.slices) {
                //     slice.onbelt = Math.abs(minby - slice.minby) < 0.01;
                // }
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
                let z = slice.z + widget.offset.z;
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

        let lastWidget;

        // walk cake layers bottom up
        for (let layer of cake) {
            // track purge blocks generated for each layer
            let track = extruders.slice();
            let lastOut;
            let lastExt;

            // iterate over layer slices, find closest widget, print, eliminate
            for (;;) {
                let order = [];
                // select slices of the same extruder type first then distance
                for (let slice of layer.slices) {
                    if (slice.prep) {
                        continue;
                    }
                    let offset = slice.widget.offset;
                    let find = slice.findClosestPointTo(printPoint.sub(offset));
                    if (find) {
                        let ext = slice.extruder;
                        let lex = lastOut ? lastOut.extruder : ext;
                        let dst = Math.abs(find.distance);
                        // penalize extruder swaps
                        if (ext !== lex) {
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
                let params = getRangeParameters(settings, slice.index);
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
                    printPoint = purge(slice.extruder, track, layerout, printPoint, slice.z);
                }
                let wtb = slice.widget.track.box;
                // output seek to start point between mesh slices if previous data
                printPoint = print.slicePrintPath(
                    slice,
                    slice.belt && slice.belt.touch ? newPoint(-wtb.w, wtb.d * 2, 0) : printPoint.sub(offset),
                    offset,
                    layerout,
                    {
                        seedPoint: printPoint.sub(offset),
                        danger: isDanger,
                        params, // range parameters
                        first: slice.index === 0,
                        support: slice.widget.support,
                        onBelt: slice.belt && slice.belt.touch,
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
                lastExt = lastOut.ext
                lastPoly = slice.lastPoly;
                lastLayer = layerout;
                if (layerRetract && layerout.length) {
                    layerout.last().retract = true;
                }
            }

            // if a declared extruder isn't used in a layer, use selected
            // extruder to fill the relevant purge blocks for later support
            track.forEach(ext => {
                if (ext && lastOut) {
                    printPoint = purge(ext.extruder, track, layerout, printPoint, lastOut.z, lastExt);
                }
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

            slices = [];
            layerout = [];
            lastOut = undefined;
        }

        print.output = output;

        // post-process for base extrusions (touching the bed)
        if (isBelt) {
            // find belt min y
            let minby = Infinity;
            for (let layer of output) {
                for (let rec of layer) {
                    let point = rec.point;
                    minby = Math.min(minby, -point.y + point.z * bfactor);
                }
            }
            // correct y offset to desired layer offset
            let miny = process.firstLayerYOffset || 0;
            let poff = minby - miny;
            for (let layer of output) {
                for (let rec of layer) {
                    rec.point.y += poff;
                }
            }

            // add lead in, when specified
            // if (process.firstLayerBeltLead) {
            //     // add belt lead in
            //     console.log({process, output});
            // }

            let thresh = firstLayerHeight * 1.05;
            // iterate over layers, find extrusion on belt and
            // apply corrections and add brim when specified
            for (let layer of output) {
                let params = getRangeParameters(settings, layer.layer || 0);
                let firstLayerBrim = params.firstLayerBrim;
                let firstLayerBrimTrig = params.firstLayerBrimTrig;
                if (!firstLayerBrim) {
                    continue;
                }

                let lastout, first = false;
                let minz = Infinity, maxy = -Infinity, minx = Infinity, maxx = -Infinity;
                let mins = Infinity;
                let miny = Infinity;
                for (let rec of layer) {
                    let point = rec.point;
                    let belty = rec.belty = -point.y + point.z * bfactor;
                    miny = Math.min(miny, belty);
                    if (rec.emit && belty <= thresh && lastout && Math.abs(lastout.belty - belty) < 0.005) {
                        rec.speed = firstLayerRate;
                        rec.emit *= firstLayerMult;
                        minx = Math.min(minx, point.x, lastout.point.x);
                        maxx = Math.max(maxx, point.x, lastout.point.x);
                        maxy = Math.max(maxy, point.y);
                        minz = Math.min(minz, point.z);
                        first = rec;
                        // find length of shortest bed-facing segment
                        mins = Math.min(mins, lastout.point.distTo2D(rec.point));
                    }
                    lastout = rec;
                }
                // skip if brim trigger not met
                if (firstLayerBrimTrig > 0 && mins > firstLayerBrimTrig) {
                    continue;
                }
                // do not add brims to anchor layers
                if (layer.anchor) {
                    continue;
                }
                // add brim, if specified
                if (first && firstLayerBrim) {
                    let { emit, tool } = first;
                    let y = maxy;
                    let z = minz;
                    let b = Math.max(firstLayerBrim, 1);
                    let tmpout = [];
                    layer.last().retract = true;
                    print.addOutput(tmpout, newPoint(maxx + b, y, z), 0,    firstLayerSeek, tool);
                    print.addOutput(tmpout, newPoint(maxx + 0, y, z), emit, firstLayerRate, tool).retract = true;
                    print.addOutput(tmpout, newPoint(minx - b, y, z), 0,    firstLayerSeek, tool);
                    print.addOutput(tmpout, newPoint(minx - 0, y, z), emit, firstLayerRate, tool).retract = false;
                    layer.splice(0,0,...tmpout);
                }
            }
        }

        // render if not explicitly disabled
        if (render) {
            print.render = FDM.prepareRender(output, (progress, layer) => {
                update(0.5 + progress * 0.5, "render", layer);
            }, { tools: device.extruders, thin: isThin, flat: isFlat, fdm: true });
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

    FDM.rateToColor = function(rate, max) {
        return currentColorFunction(rate/max, 1, 0.85);
    };

    FDM.prepareRender = function(levels, update, opts = {}) {
        levels = levels.filter(level => level.length);
        if (levels.length === 0) {
            self.worker.print.maxSpeed = 0;
            return [];
        }

        const tools = opts.tools || {};
        const flat = opts.flat;
        const thin = opts.thin && !flat;
        const ckspeed = opts.speed !== false;
        const headColor = 0x888888;
        const moveColor = opts.move >= 0 ? opts.move : 0xaaaaaa;
        const printColor = opts.print >= 0 ? opts.print : 0x777700;
        const arrowAll = false;
        const arrowSize = arrowAll ? 0.2 : 0.4;
        const layers = [];

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

        const maxspd = levels.map(level => {
            return level.map(o => o.speed || 0).reduce((a, v) => Math.max(a,v));
        }).reduce((a, v) => Math.max(a, v)) + 1;

        // for reporting
        self.worker.print.maxSpeed = maxspd - 1;
        self.worker.print.thinColor = thin;
        self.worker.print.flatColor = flat;

        let lastEnd = null;
        let lastOut = null;
        let current = null;
        let retracted = false;
        let retractz = 0;

        function color(point) {
            return FDM.rateToColor(point.speed, maxspd);
        }

        levels.forEach((level, index) => {
            const prints = {};
            const moves = [];
            const heads = [];
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
            if (retracts.length) {
                output
                    .setLayer('retract', { line: 0x550000, face: 0xff0000, opacity: 0.5 }, true)
                    .addAreas(retracts.map(point => {
                        return newPolygon().centerCircle(point, 0.2, 16).setZ(point.z + 0.01);
                    }), { outline: true });
            }
            if (engages.length) {
                output
                    .setLayer('engage', { line: 0x005500, face: 0x00ff00, opacity: 0.5 }, true)
                    .addAreas(engages.map(point => {
                        return newPolygon().centerCircle(point, 0.2, 16).setZ(point.z + 0.01);
                    }), { outline: true });
            }
            if (heads.length) {
                output
                    .setLayer('arrows', { face: headColor, line: 0x112233, opacity: 0.5 }, true)
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
                        poly.length--;
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
        default: hsv2rgb.bind({ seg: 5, fn: color5 }),
        simple: hsv2rgb.bind({ seg: 3, fn: color4 }),
        dark: hsv2rgb.bind({ seg: 3, fn: color3 })
    };

    let currentColorFunction = colorFunctions.default;

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

    function color3(rgb, inc, seg) {
        const dec = 1 - inc;
        switch (seg) {
            case 0:
                rgb.r = dec;
                rgb.g = inc;
                rgb.b = 0;
                break;
            case 1:
                rgb.r = 0;
                rgb.g = dec;
                rgb.b = inc;
                break;
            case 2:
                rgb.r = inc/2;
                rgb.g = 0;
                rgb.b = dec/2 + 0.5;
                break;
        }
    }

})();
