/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.SLA) return;

    const KIRI = self.kiri,
        BASE = self.base,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        CONF = BASE.config,
        POLY = BASE.polygons,
        SLA = KIRI.driver.SLA = {
            init,
            slice,
            sliceRender,
            printSetup,
            printExport,
            printDownload,
            printRender
        },
        SLICER = KIRI.slicer,
        newTop = KIRI.newTop,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon;

    let preview,
        previewSmall,
        previewLarge,
        fill_cache,
        legacy = false;

    if (legacy) console.log("SLA Driver in Legacy Mode");

    function init(kiri, api) {
        api.event.on("mode.set", (mode) => {
            if (mode === 'SLA') {
                api.ui.act.preview.classList.add('hide');
            } else {
                api.ui.act.preview.classList.remove('hide');
            }
        });
    }

    /**
     * DRIVER SLICE CONTRACT - runs in worker
     *
     * @param {Object} settings
     * @param {Widget} Widget
     * @param {Function} onupdate (called with % complete and optional message)
     * @param {Function} ondone (called when complete with an array of Slice objects)
     */
    function slice(settings, widget, onupdate, ondone) {
        let process = settings.process,
            device = settings.device,
            work_total,
            work_remain;

        if (legacy && !self.OffscreenCanvas) {
            return ondone("browser lacks support for OffscreenCanvas",true);
        }

        // calculate % complete and call onupdate()
        function doupdate(work, msg) {
            onupdate(0.25 + ((work_total - work_remain) / work_total) * 0.75, msg);
            work_remain -= work;
        }

        // for each slice, perform a function and call doupdate()
        function forSlices(slices, work, fn, msg) {
            slices.forEach(function(slice,index) {
                fn(slice,index);
                doupdate(work / slices.length, msg)
            });
        }

        let b64 = atob(currentSnap);
        let bin = Uint8Array.from(b64, c => c.charCodeAt(0));
        let img = new png.PNG().parse(bin, (err, data) => {
            preview = img;
            previewSmall = samplePNG(img, 200, 125);
            previewLarge = samplePNG(img, 400, 300);
        });
        let height = process.slaSlice || 0.05;

        SLICER.sliceWidget(widget, {
            height: height,
            add: !process.slaOpenTop
        }, function(slices) {
            // hold onto last (empty) slice
            let last = slices[slices.length-1];
            // remove empty slices
            slices = widget.slices = slices.filter(slice => slice.tops.length);
            if (!process.slaOpenTop) {
                // re-add last empty slice for open top
                slices.push(last);
            }
            // prepend raft layers to slices array
            if (process.slaSupportEnable && process.slaSupportLayers) {
                let layers = process.slaSupportLayers,
                    zoff = height / 2,
                    snew = [],
                    polys = [],
                    gap = process.slaSupportGap, // gap layers above raft
                    grow = height, // union per layer expand
                    off = 1 - (layers * grow); // starting union offset from part
                let outer = slices.forEach(slice => {
                    // poly.clone prevents inner voids from forming
                    polys.appendAll(slice.tops.map(t => t.poly.clone()));
                });
                // p.clone prevents inner voids from forming
                let union = POLY.union(polys).map(p => p.clone());
                let expand = POLY.expand(union, off, zoff, [], 1);
                let lastraft;
                for (let s=0; s<layers + gap; s++) {
                    let slice = newSlice(zoff);
                    slice.height = height;
                    slice.index = snew.length;
                    if (s < layers) {
                        slice.synth = true;
                        expand.forEach(u => {
                            slice.tops.push(newTop(u.clone(true).setZ(zoff)));
                        });
                        expand = POLY.expand(expand, grow, zoff, [], 1);
                        lastraft = slice;
                    }
                    snew.push(slice);
                    zoff += height;
                }
                // compensate for midline start
                zoff -= height / 2;
                // replace slices with new appended array
                slices = widget.slices = snew.concat(slices.map(s => {
                    s.tops.forEach(t => t.poly.setZ(s.z + zoff));
                    s.index += snew.length;
                    s.z += zoff;
                    return s;
                }));
                // annotate widget for support generation
                widget.union = union;
                widget.lastraft = lastraft;
            }
            // re-connect slices into linked list for island/bridge projections
            for (let i=1; i<slices.length; i++) {
                slices[i-1].up = slices[i];
                slices[i].down = slices[i-1];
            }
            // reset for solids and support projections
            slices.forEach(function(slice) {
                slice.invalidateFill();
                slice.invalidateSolids();
                slice.invalidateSupports();
                slice.isSolidFill = false;
            });
            let solidLayers = Math.round(process.slaShell / process.slaSlice);
            work_total = [
                5,  // shell
                10, // diff
                solidLayers ? 10 : 0, // shell project
                solidLayers ? 10 : 0, // shell fill
                !solidLayers ? 10 : 0, // solid
                process.slaFillDensity && process.slaShell ? 60 : 0, // infill
                process.slaSupportEnable && process.slaSupportLayers && process.slaSupportDensity ? 100 : 0
            ].reduce((t,v) => { return t+v });
            work_remain = work_total;
            forSlices(slices, 5, (slice,index) => {
                if (process.slaShell) {
                    slice.doShells(2, 0, process.slaShell);
                } else {
                    slice.doShells(1, 0);
                }
            }, "slice");
            forSlices(slices, 10, (slice) => {
                if (slice.synth) return;
                slice.doDiff(0.000001, 0.005, !process.slaOpenBase);
            }, "delta");
            if (solidLayers) {
                forSlices(slices, 10, (slice) => {
                    if (slice.synth) return;
                    slice.projectFlats(solidLayers);
                    slice.projectBridges(solidLayers);
                }, "project");
                forSlices(slices, 10, (slice) => {
                    if (slice.synth) return;
                    slice.doSolidsFill(undefined, undefined, 0.001);
                    let traces = POLY.nest(POLY.flatten(slice.gatherTraces([])));
                    let trims = slice.solids.trimmed || [];
                    traces.appendAll(trims);
                    let union = POLY.union(traces);
                    slice.solids.unioned = union;
                }, "solid");
            } else {
                forSlices(slices, 10, (slice) => {
                    if (slice.synth) return;
                    slice.solids.unioned = slice.gatherTopPolys([]);
                }, "solid");
            }
            if (process.slaFillDensity && process.slaShell) {
                fill_cache = [];
                forSlices(slices, 60, (slice) => {
                    if (slice.synth) return;
                    fillPolys(slice, settings);
                }, "infill");
            }
            if (process.slaSupportEnable && process.slaSupportLayers && process.slaSupportDensity) {
                computeSupports(widget, process, progress => {
                    doupdate(100 * progress, "support");
                });
            }
            ondone();
        }, function(update) {
            return onupdate(0.0 + update * 0.25);
        });
    };

    function computeSupports(widget, process, progress) {
        let area = widget.union.reduce((t,p) => { return t + p.areaDeep() }, 0),
            perim = widget.union.reduce((t,p) => { return t + p.perimeter() }, 0),
            slices = widget.slices,
            length = slices.length,
            tot_mass = 0, // total widget "mass"
            tot_bear = 0; // total "mass-bearing" area

        let ops = slices.filter(slice => !slice.synth);

        // compute total "mass" by slice
        ops.forEach(slice => {
            slice.mass = slice.solids.unioned.reduce((t,p) => { return t + p.areaDeep() }, 0);
            if (slice.up && slice.up.bridges) {
                slice.bear = slice.up.bridges.reduce((t,p) => { return t + p.areaDeep() }, 0);
                slice.bear_up = slice.up.bridges;
                tot_bear += slice.bear;
            } else {
                slice.bear = 0;
            }
            tot_mass += slice.mass;
        });

        let mass_per_bear = (tot_mass / tot_bear) * (1 / process.slaSupportDensity);

        // console.log({tot_mass, tot_bear, ratio: tot_mass / tot_bear, mass_per_bear});

        let first;
        ops.slice().map((s,i) => {
            if (!first && s.bear) {
                s.ord_first = first = true;
            }
            // 30x lowest to 1x highest
            s.ord_weight = Math.pow(30,((ops.length - i) / ops.length));
            return s;
        }).sort((a,b) => {
            if (a.ord_first) return -1;
            if (b.ord_first) return 1;
            return (b.bear * b.ord_weight) - (a.bear * a.ord_weight);
        }).forEach((slice, index) => {
            slice.ord_bear = index;
        })

        let rem_mass = tot_mass,
            rem_bear = tot_bear;

        // compute remaining mass, bearing surface, for each slice
        let run, runLast, runCount = 0, runList = [];
        ops.forEach(slice => {
            slice.rem_mass = rem_mass;
            slice.rem_bear = rem_bear;
            // slice.can_bear = slice.mass * mass_per_bear;
            slice.can_bear = slice.bear * mass_per_bear;
            rem_mass -= slice.mass;
            rem_bear -= slice.bear;
        });

        let ord = ops.sort((a,b) => {
            return a.ord_bear - b.ord_bear;
        });

        rem_mass = tot_mass;
        rem_bear = tot_bear;

        // in order of load bearing capability, select layer
        // and recompute the requirements on the slices below
        for (let i=0; i<ord.length; i++) {
            let slice = ord[i],
                bearing = Math.min(slice.can_bear, slice.rem_mass);

            // remove from slices below the amount of mass they have to bear
            for (let j=slice.index - 1; j>ops[0].index; j--) {
                slices[j].rem_mass -= bearing;
            }

            // remove total mass left to bear
            rem_mass -= bearing;
            slice.can_emit = true;
            if (rem_mass <= 0) {
                // console.log({break: i, of: ord.length});
                break;
            }
        }

        let seq = 0,
            seqLast = 0,
            spacing = (1 - process.slaSupportDensity) * 10,
            size = Math.bound(process.slaSupportSize / 2, 0.25, 1);

        // compute and project support pillars
        slices.forEach((slice,index) => {
            if (slice.can_emit) {
                if (seq === 0 || slice.index - seqLast > 5) {
                    slice.bear_up.map(p => {
                        return p.clone(true).setZ(slice.z);
                    }).forEach(p => {
                        projectSupport(process, slice, p, size, spacing);
                    });
                    seq++;
                } else if (seq > 5) {
                    seq = 0;
                } else {
                    seq++;
                }
                seqLast = slice.index;
            }
            progress(1 / slices.length);
        });

        // union support pillars
        slices.forEach(slice => {
            if (slice.supports) {
                slice.supports = POLY.union(slice.supports,0);
            }
        });
    }

    function projectSupport(process, slice, poly, size, spacing) {
        let flat = poly.circularityDeep() > 0.1,
            arr = [ poly ];

        // insetting polys produces arrays. consume til gone
        while (arr.length) {
            poly = arr.shift();
            let out = [],
                seg = [],
                per = poly.perimeter(),
                crit = 0,
                polys = poly.clone(true).flattenTo([]);

            polys.forEach(p => p.forEachSegment((p1, p2) => {
                let rec = {dist: p1.distTo2D(p2), p1, p2};
                if (rec.dist >= spacing || slice.ord_first) crit++;
                seg.push(rec);
            }));

            seg.sort((a,b) => {
                return b.dist - a.dist;
            });

            // emit all critical (long) segments. min 3
            while (seg.length && (crit > 0 || out.length < 3)) {
                let {dist, p1, p2} = seg.shift();
                if (dist >= spacing) {
                    // spaced along line
                    let num = Math.ceil(dist / spacing) + 1,
                        step = dist / num,
                        pt = p1;
                    while (num-- >= 0) {
                        out.push(pt);
                        pt = pt.offsetPointTo(p2, step);
                    }
                    crit--;
                } else {
                    // line midpoint
                    out.push(p1.offsetPointTo(p2, dist / 2));
                }
            }

            // drop points too close to other pillars
            if (!slice.ord_first)
            drop: for (let i=0; i<out.length; i++) {
                for (let j=i+1; j<out.length; j++) {
                    if (out[i].distTo2D(out[j]) <= size) {
                        out[i] = null;
                        continue drop;
                    }
                }
                if (slice.pillars) slice.pillars.forEach(rec => {
                    if (out[i] && out[i].distTo2D(rec.point) <= size) {
                        out[i] = null;
                    }
                });
            }

            // mark support pillar for each point
            out.filter(p => p !== null)
                .forEach(p => {
                    let track = projectPillar(process, slice, p, size, []);
                    // find stunted pillars terminating on a face (not raft or merged)
                    if (track.length && !(track.max || track.synth || track.merged)) {
                        // remove stunted pillar
                        track.forEach(rec => {
                            let sp = rec.slice.supports;
                            let rp = sp.indexOf(rec.pillar);
                            if (rp >= 0) sp.splice(rp,1);
                        });
                    }
                });

            // inset polygon for flat area support
            if (flat) poly.offset(Math.max(0.2, 1 - process.slaSupportDensity), arr);
        }
    }

    function projectPillar(process, slice, point, size, track) {
        if (!slice.supports) slice.supports = [];
        if (!slice.pillars) slice.pillars = [];

        let points = process.slaSupportPoints,
            pillar = newPolygon()
                .centerCircle(point, size/2, points, true)
                .setZ(slice.z),
            max = process.slaSupportSize,
            inc = process.slaSlice/2,
            end = false, // center intersects
            over = [], // overlapping points
            safe = [], // non-overlapping points
            low = slice.index < process.slaSupportGap + process.slaSupportLayers;

        track.min = track.min ? Math.min(track.min, size) : size;
        track.max = (track.max ? true : false) || size >= max;
        track.synth = track.synth || slice.synth;

        slice.tops.forEach(t => {
            if (track.length > 3 && point.isInPolygon(t.poly)) {
                end = true;
            }
            pillar.points.forEach(p => {
                let isin = p.isInPolygon(t.poly);// || p.nearPolygon(t.poly, 0.001);
                if (isin) {
                    over.push(p);
                } else {
                    safe.push(p);
                }
            });
        });

        if (end) {
            // backtrack shrinking pillars to point if
            // not landing on the base and size is max'd
            if (!slice.synth && track.max) {
                let nusize = track.min;
                while (track.length) {
                    let prec = track.pop(),
                        npil = newPolygon()
                                .centerCircle(prec.point, nusize/2, points, true)
                                .setZ(prec.slice.z),
                        spos = prec.slice.supports.indexOf(prec.pillar);
                    // if we find our old pillar, replace
                    if (spos >= 0) {
                        prec.slice.supports[spos] = npil;
                        nusize += inc;
                    }
                    if (nusize > prec.size) {
                        break;
                    }
                }
            }
            return track;
        }

        let nextpoint = point;

        if (over.length) {
            // move toward average of safe (non-overlapping) points
            if (safe.length) {
                let x = 0, y = 0;
                safe.forEach(p => { x += p.x; y += p.y });
                x /= safe.length;
                y /= safe.length;
                nextpoint = point.offsetPointTo({x, y, z:slice.z}, inc);
            }
            // once max'ed out, can only shrink in size
            if (track.max) {
                size -= inc;
            }
        } else if (!track.max || low) {
            size += inc;
            if (low) max += (process.slaSupportGap * process.slaSlice * 2);
        }

        if (size < track.min) {
            return track;
        }

        // let close = [];
        // for (let i=0; i<slice.pillars.length; i++) {
        //     let p = slice.pillars[i].point;
        //     let d = point.distTo2D(p);
        //     // terminate if we're inside another pillar
        //     if (d < inc) {
        //         track.merged = true;
        //         return track;
        //     }
        //     if (d <= process.slaSupportSize * 1.5) {
        //         close.push(p);
        //     }
        // }
        // if (close.length) {
        //     let newp = point.clone();
        //     close.forEach(p => {
        //         newp.x += p.x;
        //         newp.y += p.y;
        //     });
        //     newp.x /= (close.length + 1);
        //     newp.y /= (close.length + 1);
        //     nextpoint = point.offsetPointTo(newp, inc);
        // }

        slice.supports.push(pillar);
        slice.pillars.push({point, pillar, size});
        track.push({slice, point, pillar, size});
        if (slice.down) {
            projectPillar(process, slice.down, nextpoint, Math.min(size, max), track);
        }
        return track;
    }

    function fillPolys(slice, settings) {
        let process = settings.process,
            device = settings.device,
            polys = slice.solids.unioned,
            bounds = settings.bounds,
            width = bounds.max.x - bounds.min.x,
            depth = bounds.max.y - bounds.min.y,
            max = Math.max(width,depth),
            seq = Math.round(process.slaFillLine / process.slaSlice),
            linew = process.slaFillLine,
            units_w = (width / linew) * process.slaFillDensity,
            units_d = (depth / linew) * process.slaFillDensity,
            step_x = width / units_w,
            step_y = depth / units_d,
            start_x = -(width / 2),
            start_y = -(depth / 2),
            end_x = width / 2,
            end_y = depth / 2,
            fill = [];

        let seq_i = Math.floor(slice.index / seq),
            seq_c = seq_i % 4,
            cached = fill_cache[seq_c];

        if (!cached && seq_c !== 1)
        for (let x=start_x; x<end_x; x += step_x) {
            fill.push(
                BASE.newPolygon().centerRectangle({
                    x: x + step_x/2,
                    y: 0,
                    z: slice.z
                }, linew, depth)
            );
        }

        if (!cached && seq_c !== 3)
        for (let y=start_y; y<end_y; y += step_y) {
            fill.push(
                BASE.newPolygon().centerRectangle({
                    x: 0,
                    y: y + step_y/2,
                    z: slice.z
                }, width, linew)
            );
        }

        if (!cached) {
            fill = POLY.union(fill);
            fill_cache[seq_c] = fill;
        } else {
            fill = cached.slice().map(p => p.clone(true).setZ(slice.z));
        }

        fill = POLY.trimTo(fill, slice.tops.map(t => t.poly));
        fill = POLY.union(slice.solids.unioned.appendAll(fill));

        slice.solids.unioned = fill;
    }

    /**
     * DRIVER PRINT CONTRACT - runs in worker
     * @param {Object} print state object
     * @param {Function} update incremental callback
     */
    function printSetup(print, update) {
        update(1);
    };

    /**
     * DRIVER PRINT CONTRACT - runs in worker
     * @param {Object} print state object
     * @param {Function} online streaming reply
     * @param {Function} ondone last reply
     */
    function printExport(print, online, ondone) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            output = print.output,
            layermax = 0,
            width = 2560,
            height = 1440,
            width2 = width/2,
            height2 = height/2,
            scaleX = width / device.bedWidth,
            scaleY = height / device.bedDepth,
            mark = Date.now(),
            layers = process.slaAntiAlias || 1,
            masks = [],
            images = [],
            slices = [],
            legacyMode = legacy || layers > 1,
            part1 = legacyMode ? 0.25 : 0.85,
            part2 = legacyMode ? 0.75 : 0.15;

        let d = 8 / layers;
        for (let i=0; i<layers; i++) {
            masks.push((1 << (8 - i * d)) - 1);
        }

        // find max layer count
        widgets.forEach(widget => {
            layermax = Math.max(widget.slices.length);
        });

        let render = legacyMode ? renderLayer : renderLayerWasm;

        // generate layer bitmaps
        // in wasm mode, rle layers generated here, too
        for (let index=0; index < layermax; index++) {
            let param = { index, width, height, widgets, scaleX, scaleY, masks };
            let {image, layers, end} = render(param);
            images.push(image);
            slices.push(layers);
            // transfer images to browser main
            online({
                progress: (index / layermax) * part1,
                message: "image_gen",
                data: image
            });
            if (end) break;
        }

        let exp_func;

        switch (device.deviceName) {
            case 'Anycubic.Photon':
                exp_func = generatePhoton;
                break;
            case 'Anycubic.Photon.S':
                exp_func = generatePhotons;
                break;
        }

        let file = exp_func(print, {
            width: width,
            height: height,
            small: previewSmall.data,
            large: previewLarge.data,
            lines: images,
            slices: slices
        }, (progress, message) => {
            online({progress: progress * part2 + part1, message});
        });

        ondone({
            width: width,
            height: height,
            file: file
        },[file]);

        console.log('print.export', Date.now() - mark);
    };

    // runs in browser main
    function sliceRender(widget) {
        // legacy debug
        return;

        widget.slices.forEach(slice => {
            let layers = slice.layers,
                outline = layers.outline,
                support = layers.support;

            if (slice.solids.unioned) {
                // console.log('solid', slice.index)
                slice.solids.unioned.forEach(poly => {
                    poly = poly.clone(true);//.move(widget.track.pos);
                    outline.poly(poly, 0x010101, true);
                    outline.solid(poly, 0x0099cc);
                });
            } else if (slice.tops) {
                // console.log('top', slice.index)
                slice.tops.forEach(top => {
                    let poly = top.poly;//.clone(true).move(widget.track.pos);
                    outline.poly(poly, 0x010101, true, false);
                    outline.solid(poly, 0xfcba03);
                });
            }

            if (slice.supports) {
                // console.log('support', slice.index)
                slice.supports.forEach(poly => {
                    //poly = poly.clone(true).move(widget.track.pos);
                    support.poly(poly, 0x010101, true, false);
                    support.solid(poly, 0xfcba03);
                });
            }

            slice.renderDiff();
            slice.renderSolidOutlines();

            outline.renderAll();
            support.renderAll();
        });
    }

    // runs in browser main
    function printRender(print) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process;

        for (let index=0; ; index++) {
            let layer = KIRI.newLayer(print.group);
            let count = 0;

            widgets.forEach(widget => {
                let slice = widget.slices[index];
                if (!slice) {
                    return;
                }
                count++;
                let polys = slice.solids.unioned;
                if (!polys) polys = slice.tops.map(t => t.poly);
                if (slice.supports) polys.appendAll(slice.supports);
                polys.forEach(poly => {
                    poly = poly.clone(true).move(widget.track.pos);
                    layer.poly(poly, 0x010101, true);
                    layer.solid(poly, 0x0099cc);
                });
            });

            layer.renderSolid();
            layer.render();

            if (count === 0) {
                // TODO fix with contract for exposing layer count
                // hack uses expected gcode output array in print object
                print.output = print.printView;
                return;
            }

            print.printView.push(layer);
        }
    }

    // runs in browser main
    function printDownload(print) {
        let { API, lines, done } = print.sla;
        let filename = `print-${new Date().getTime().toString(36)}`;

        API.ajax("/kiri/output-sla.html", html => {
            API.ui.print.innerHTML = html;

            let printset = print.settings,
                process = printset.process,
                device = printset.device,
                print_sec = (process.slaBaseLayers * process.slaBaseOn) +
                    (lines.length - process.slaBaseLayers) * process.slaLayerOn;

            // add peel lift/drop times to total print time
            for (let i=0; i<lines.length; i++) {
                let dist = process.slaPeelDist,
                    lift = process.slaPeelLiftRate,
                    drop = process.slaPeelDropRate,
                    off = process.slaLayerOff;
                if (i < process.slaBaseLayers) {
                    dist = process.slaBasePeelDist;
                    lift = process.slaBasePeelLiftRate;
                    off = process.slaBaseOff;
                }
                print_sec += (dist * lift) / 60;
                print_sec += (dist * drop) / 60;
                print_sec += off;
            }

            let print_min = Math.floor(print_sec/60),
                print_hrs = Math.floor(print_min/60),
                download = $('print-photon');

            // add lift/drop time
            print_sec -= (print_min * 60);
            print_min -= (print_hrs * 60);
            print_sec = Math.round(print_sec).toString().padStart(2,'0');
            print_min = print_min.toString().padStart(2,'0');
            print_hrs = print_hrs.toString().padStart(2,'0');

            $('print-filename').value = filename;
            $('print-layers').value = lines.length;
            $('print-time').value = `${print_hrs}:${print_min}:${print_sec}`;

            switch (device.deviceName) {
                case 'Anycubic.Photon':
                    download.innerText += " .photon";
                    download.onclick = () => { saveFile(API, done.file, ".photon") };
                    break;
                case 'Anycubic.Photon.S':
                    download.innerText += " .photons";
                    download.onclick = () => { saveFile(API, done.file, ".photons") };
                    break;
            }

            let canvas = $('print-canvas');
            let ctx = canvas.getContext('2d');
            let img = ctx.createImageData(done.height, done.width);
            let imgDV = new DataView(img.data.buffer);
            let range = $('print-range');
            range.value = 0;
            range.min = 0;
            range.max = lines.length - 1;
            range.oninput = function() {
                let lineDV = new DataView(lines[range.value].buffer);
                for (let i=0; i<lineDV.byteLength; i++) {
                    imgDV.setUint32(i*4, lineDV.getUint8(i));
                }
                ctx.putImageData(img,0,0);
                $('print-layer').innerText = range.value.padStart(4,'0');
            };

            range.oninput();
            API.modal.show('print');
        });
    }

    function saveFile(API, file, ext) {
        saveAs(
            new Blob([file], { type: "application/octet-stream" }),
            $('print-filename').value + ext);
        API.modal.hide();
    }

    function generatePhoton(print, conf, progress) {
        let printset = print.settings,
            process = printset.process,
            device = printset.device,
            width = conf.width,
            height = conf.height,
            layerCount = conf.lines.length,
            layerBytes = width * height,
            small = conf.small,
            large = conf.large,
            slices = conf.slices,
            subcount = process.slaAntiAlias || 1,
            masks = [],
            coded;

        if (legacy || subcount > 1) {
            let d = 8 / subcount;
            for (let i=0; i<subcount; i++) {
                masks.push((1 << (8 - i * d)) - 1);
            }
            let ccl = 0;
            let tcl = conf.lines.length * subcount;
            let converted = conf.lines.map((line, index) => {
                let count = line.length;
                let lineDV = new DataView(line.buffer);
                let bits = new Uint8Array(line.length);
                let bitsDV = new DataView(bits.buffer);
                let subs = [{ data: bits, view: bitsDV }];
                for (let sl=1; sl<subcount; sl++) {
                    bits = bits.slice();
                    bitsDV = new DataView(bits.buffer);
                    subs.push({ data: bits, view: bitsDV });
                }
                // use R from RGB since that was painted on the canvas
                for (let s=0; s<subcount; s++) {
                    let view = subs[s].view;
                    let mask = masks[s];
                    for (let i = 0; i < count; i++) {
                        let dv = lineDV.getUint8(i);
                        view.setUint8(i, (dv / subcount) & mask ? 1 : 0);
                    }
                    progress((ccl++/tcl) * 0.4, `layer_convert`);
                }
                return { subs };
            });

            coded = encodeLayers(converted, "photon", (pro => {
                progress(pro * 0.4 + 0.4, "layer_encode");
            }));
        } else {
            let codedlen = slices.reduce((t,l) => {
                return t + l.reduce((t,a) => {
                    return t + a.length
                }, 0);
            }, 0);
            coded = {
                layers: slices.map(slice => { return { sublayers: slice }}),
                length: codedlen
            };
        }

        let buflen = 3000 + coded.length + (layerCount * subcount * 28) + small.byteLength + large.byteLength;
        let filebuf = new ArrayBuffer(buflen);
        let filedat = new DataWriter(new DataView(filebuf));
        let printtime = (process.slaBaseLayers * process.slaBaseOn) +
                (coded.layers.length - process.slaBaseLayers) * process.slaLayerOn;

        filedat.writeU32(0x1900fd12); // header
        filedat.writeU32(2,true); // version
        filedat.writeF32(68.04, true); // bed x
        filedat.writeF32(120.96, true); // bed y
        filedat.writeF32(150.0, true); // bed z
        filedat.skip(12); // padding
        filedat.writeF32(process.slaSlice, true); // layer height
        filedat.writeF32(process.slaLayerOn, true); // default lamp on
        filedat.writeF32(process.slaBaseOn, true); // base lamp on
        filedat.writeF32(process.slaLayerOff, true); // lamp off
        filedat.writeU32(process.slaBaseLayers, true); // base layers
        filedat.writeU32(1440, true); // device x
        filedat.writeU32(2560, true); // device y
        let hirez = filedat.skip(4); // hirez preview address filled pater
        let layerpos = filedat.skip(4); // layer data address filled later
        filedat.writeU32(layerCount, true);
        let lorez = filedat.skip(4); // hirez preview address filled later
        filedat.writeU32(printtime, true); // print time seconds
        filedat.writeU32(1, true); // projection type (1=lcd, 0=cast)
        let proppos = filedat.skip(4); // print properties address filled later
        let proplen = filedat.skip(4); // print properties length filled later
        filedat.writeU32(subcount, true); // AA level (sub layers)
        filedat.writeU16(0x00ff, true); // light pwm (TODO);
        filedat.writeU16(0x00ff, true); // light pwm bottom (TODO);

        let propstart = filedat.pos;
        filedat.view.setUint32(proppos, filedat.pos, true);
        // write print properties
        filedat.writeF32(process.slaBasePeelDist, true);
        filedat.writeF32(process.slaBasePeelLiftRate * 60 , true);
        filedat.writeF32(process.slaPeelDist, true);
        filedat.writeF32(process.slaPeelLiftRate * 60 , true);
        filedat.writeF32(process.slaPeelDropRate * 60, true);
        filedat.writeF32(0, true); // volume of used
        filedat.writeF32(0, true); // weight of used
        filedat.writeF32(0, true); // cost of used
        filedat.writeF32(0, true); // bottom off delay time
        filedat.writeF32(0, true); // light off delay time
        filedat.writeU32(process.slaBaseLayers, true);
        filedat.writeF32(0, true); // p1 ?
        filedat.writeF32(0, true); // p2 ?
        filedat.writeF32(0, true); // p3 ?
        filedat.writeF32(0, true); // p4 ?
        filedat.view.setUint32(proplen, filedat.pos - propstart, true);

        filedat.view.setUint32(layerpos, filedat.pos, true);
        // write layer headers
        let layers = coded.layers;
        let layerat = [];

        for (let sc=0; sc<subcount; sc++)
        for (let l=0; l<layers.length; l++) {
            let layer = layers[l].sublayers[sc];
            filedat.writeF32(process.slaFirstOffset + process.slaSlice * l, true); // layer height
            filedat.writeF32(l < process.slaBaseLayers ? process.slaBaseOn : process.slaLayerOn, true);
            filedat.writeF32(l < process.slaBaseLayers ? process.slaBaseOff : process.slaLayerOff, true);
            layerat.push(layer.repos = filedat.skip(4)); // rewrite later
            filedat.writeU32(layer.length, true);
            filedat.skip(16); // padding
        }

        // write layer data
        let clo = 0;
        let tlo = layers.length * subcount;
        for (let sc=0; sc<subcount; sc++)
        for (let l=0; l<layers.length; l++) {
            let layer = layers[l].sublayers[sc];
            filedat.view.setUint32(layer.repos, filedat.pos, true);
            for (let j=0; j<layer.length; j++) {
                filedat.writeU8(layer[j], false);
            }
            progress(((clo++/tlo) * 0.1) + 0.9, "layer_write");
        }

        filedat.view.setUint32(hirez, filedat.pos, true);
        writePhotonImage({
            width: 400,
            height: 300,
            data: conf.large
        }, filedat);

        filedat.view.setUint32(lorez, filedat.pos, true);
        writePhotonImage({
            width: 200,
            height: 125,
            data: conf.small
        }, filedat);

        return filebuf;
    }

    function generatePhotons(print, conf, progress) {
        let printset = print.settings,
            process = printset.process,
            device = printset.device,
            width = conf.width,
            height = conf.height,
            slices = conf.slices,
            layerCount = conf.lines.length,
            layerBytes = width * height,
            coded;

        if (legacy) {
            let converted = conf.lines.map((line, index) => {
                let count = line.length / 4;
                let bits = new Uint8Array(line.length / 4);
                let bitsDV = new DataView(bits.buffer);
                let lineDV = new DataView(line.buffer);
                // reduce RGB to R = 0||1
                for (let i = 0; i < count; i++) {
                    // defeat anti-aliasing for the moment
                    bitsDV.setUint8(i, lineDV.getUint8(i * 4) > 0 ? 1 : 0);
                }
                progress(index / conf.lines.length);
                return { subs: [{
                    exposureTime: process.slaLayerOn,
                    data: bits
                }] };
            });
            coded = encodeLayers(converted, "photons");
        } else {
            let codedlen = slices.reduce((t,l) => {
                return t + l.reduce((t,a) => {
                    return t + a.length
                }, 0);
            }, 0);
            coded = {
                layers: slices.map(slice => { return { sublayers: slice }}),
                length: codedlen
            };
        }

        let filebuf = new ArrayBuffer(75366 + coded.length + 28 * layerCount);
        let filedat = new DataView(filebuf);
        let filePos = 0;

        filedat.setUint32 (0,  2,                     false);
        filedat.setUint32 (4,  3227560,               false);
        filedat.setUint32 (8,  824633720,             false);
        filedat.setUint16 (12, 10,                    false);
        filedat.setFloat64(14, process.slaSlice,      false);
        filedat.setFloat64(22, process.slaLayerOn,    false);
        filedat.setFloat64(30, process.slaLayerOff,   false);
        filedat.setFloat64(38, process.slaBaseOn,     false);
        filedat.setUint32 (46, process.slaBaseLayers, false);
        filedat.setFloat64(50, process.slaPeelDist,   false);
        filedat.setFloat64(58, process.slaPeelLift,   false);
        filedat.setFloat64(66, process.slaPeelDrop,   false);
        filedat.setFloat64(74, 69420,                 false);
        filedat.setUint32 (82, 224,                   false);
        filedat.setUint32 (86, 42,                    false);
        filedat.setUint32 (90, 168,                   false);
        filedat.setUint32 (94, 10,                    false);
        filedat.setUint32 (75362, layerCount,         false);

        filePos = 75366;
        for (let i = 0; i < layerCount; i++) {
            let layer = coded.layers[i],
                sublayer = layer.sublayers[0],
                numbytes = sublayer.length;

            filedat.setUint32 (filePos + 0,  69420,  false);
            filedat.setFloat64(filePos + 4,  0);
            filedat.setUint32 (filePos + 12, height, false);
            filedat.setUint32 (filePos + 16, width,  false);
            filedat.setUint32 (filePos + 20, numbytes * 8 + 32, false);
            filedat.setUint32 (filePos + 24, 2684702720, false);
            filePos += 28;
            for (let j = 0; j < numbytes; j++) {
                filedat.setUint8(filePos + j, sublayer[j], false);
            }
            filePos += numbytes;
            progress((i / layerCount) / 2 + 0.5);
        }

        return filebuf;
    }

    function encodeLayers(input, type, progress) {
        let layers = [], length = 0, total = 0, count = 0;
        input.forEach(layer => {
            layer.subs.forEach(sub => total++);
        });
        for (let index = 0; index < input.length; index++) {
            let subs = input[index].subs,
                sublayers = [],
                sublength = 0;
            for (let subindex = 0; subindex < subs.length; subindex++) {
                let data = subs[subindex].data;
                let encoded = rleEncode(data, type);
                sublength += encoded.length;
                sublayers.push(encoded);
                if (progress) progress(count++/total);
                if (type == "photons") break;
            }
            length += sublength;
            layers.push({
                sublength,
                sublayers
            });
        }
        return { length, layers };
    }

    function rleEncode(data, type) {
        let maxlen = (type === 'photons') ? 128 : 125,
            color = data[0],
            runlen = 1,
            output = [];
        for (let index = 1; index < data.length; index++) {
            let newColor = data[index];
            if (newColor !== color) {
                output.push(rleByte(color, runlen, type));
                color = newColor;
                runlen = 1;
            } else {
                if (runlen === maxlen) {
                    output.push(rleByte(color, runlen, type));
                    runlen = 1;
                } else {
                    runlen++;
                }
            }
        }
        if (runlen > 0) {
            output.push(rleByte(color, runlen, type));
        }
        return output;
    }

    function rleByte(color, length, type) {
        switch (type) {
            case 'photon':
                return (length & 0x7f) | ((color << 7) & 0x80);
            case 'photons':
                length--;
                return (length & 1  ? 128 : 0) |
                     (length & 2  ?  64 : 0) |
                     (length & 4  ?  32 : 0) |
                     (length & 8  ?  16 : 0) |
                     (length & 16 ?   8 : 0) |
                     (length & 32 ?   4 : 0) |
                     (length & 64 ?   2 : 0) | color;
            }
    }

    function rleDecode(data, type) {
        let bytes = [];
        if (type === 'photon') {
            for (let i = 0; i < data.length; i++) {
                let val = data[i],
                    color = val >> 7,
                    count = val & 0x7f;
                for (let j = 0; j < count; j++) {
                    bytes.push(color);
                }
            }
        } else {
            for (let i = 0; i < data.length; i++) {
                let val = data[i],
                    color = val & 1,
                    count =
                    ((val & 128 ?  1 : 0) |
                     (val &  64 ?  2 : 0) |
                     (val &  32 ?  4 : 0) |
                     (val &  16 ?  8 : 0) |
                     (val &   8 ? 16 : 0) |
                     (val &   4 ? 32 : 0) |
                     (val &   2 ? 64 : 0)) + 1;
                for (let j = 0; j < count; j++) {
                    bytes.push(color);
                }
            }
        }
        return bytes;
    }

    function pixAt(png,x,y) {
        let idx = (x + png.width * y) * 4;
        let dat = png.data;
        return [
            dat[idx++],
            dat[idx++],
            dat[idx++],
            dat[idx++]
        ];
    }

    function averageBlock(png,x1,y1,x2,y2) {
        let val = [0, 0, 0, 0], count = 0, x, y, z, v2;
        for (x=x1; x<x2; x++) {
            for (y=y1; y<y2; y++) {
                v2 = pixAt(png,x,y);
                for (z=0; z<4; z++) {
                    val[z] += v2[z];
                }
                count++;
            }
        }
        for (z=0; z<4; z++) {
            val[z] = Math.abs(val[z] / count);
        }
        return val;
    };

    function samplePNG(png, width, height) {
        let th = width, tw = height,
            ratio = png.width / png.height,
            buf = new Uint8Array(th * tw * 4),
            div, xoff, yoff, dx, ex, dy, ey, bidx, pixval;

        if (ratio > 4/3) {
            div = png.height / tw;
            xoff = Math.round((png.width - (th * div)) / 2);
            yoff = 0;
        } else {
            div = png.width / th;
            xoff = 0;
            yoff = Math.round((png.height - (tw * div)) / 2);
        }

        for (let y=0; y<tw; y++) {
            dy = Math.round(y * div + yoff);
            if (dy < 0 || dy > png.height) continue;
            ey = Math.round((y+1) * div + yoff);
            for (let x=0; x<th; x++) {
                dx = Math.round(x * div + xoff);
                if (dx < 0 || dx > png.width) continue;
                ex = Math.round((x+1) * div + xoff);
                bidx = (y * th + x) * 4;
                pixval = averageBlock(png,dx,dy,ex,ey);
                buf[bidx+0] = pixval[0];
                buf[bidx+1] = pixval[1];
                buf[bidx+2] = pixval[2];
                buf[bidx+3] = pixval[3];
            }
        }

        return {width, height, data:buf, png};
    }

    // write out a thumbnail image
    function writePhotonImage(preview, writer) {
        let data = new Uint8Array(preview.data), len = data.byteLength;
        writer.writeU32(preview.width, true);
        writer.writeU32(preview.height, true);
        let hpos = writer.skip(4);
        writer.writeU32(len/2, true);
        writer.view.setUint32(hpos, writer.pos, true);
        let pos = 0;
        while (pos < len) {
            let r = data[pos++],
                g = data[pos++],
                b = data[pos++],
                a = data[pos++],
                v = (((r/4)&0x1f) << 11) |
                    (((g/4)&0x1f) <<  6) |
                    (((b/4)&0x1f) <<  0) ;
            writer.writeU16(v, true);
        }
    }

    // load renderer code in worker context only
    if (!self.window) {
        fetch('/wasm/kiri-sla.wasm')
            .then(response => response.arrayBuffer())
            .then(bytes => WebAssembly.instantiate(bytes, {
                env: {
                    reportf: (a,b) => { console.log('[f]',a,b) },
                    reporti: (a,b) => { console.log('[i]',a,b) }
                }
            }))
            .then(results => {
                let {module, instance} = results;
                let {exports} = instance;
                let heap = new Uint8Array(exports.memory.buffer);
                self.wasm = {
                    heap,
                    memory: exports.memory,
                    render: exports.render,
                    rle_encode: exports.rle_encode
                };
            });

        // new WebAssembly rasterizer
        self.renderLayerWasm = function renderLayer(params) {
            let { width, height, index, widgets, scaleX, scaleY, masks } = params;
            let width2 = width / 2, height2 = height / 2;
            let array = [];
            let count = 0;
            let wasm = self.wasm;

            function scaleMovePoly(poly) {
                let points = poly.points;
                let bounds = poly.bounds = BASE.newBounds();
                for (let i=0, il=points.length; i<il; i++) {
                    let p = points[i];
                    p.y = height - (p.y * scaleY + height2);
                    p.x = p.x * scaleX + width2;
                    bounds.update(p);
                }
                if (poly.inner) {
                    for (let i=0, ia=poly.inner, il=poly.inner.length; i<il; i++) {
                        scaleMovePoly(ia[i]);
                    }
                }
            }

            // serialize poly into wasm heap memory
            function writePoly(writer, poly) {
                let pos = writer.skip(2);
                let inner = poly.inner;
                writer.writeU16(inner ? inner.length : 0, true);
                let points = poly.points;
                let bounds = poly.bounds;
                writer.writeU16(points.length, true);
                writer.writeU16(bounds.minx, true);
                writer.writeU16(bounds.maxx, true);
                writer.writeU16(bounds.miny, true);
                writer.writeU16(bounds.maxy, true);
                for (let j=0, jl=points.length; j<jl; j++) {
                    let point = points[j];
                    writer.writeF32(point.x, true);
                    writer.writeF32(point.y, true);
                }
                if (inner && inner.length) {
                    for (let i=0, il=inner.length; i<il; i++) {
                        writePoly(writer, inner[i]);
                    }
                }
                // write total struct length at struct head
                writer.view.setUint16(pos, writer.pos - pos, true);
            }

            widgets.forEach(widget => {
                let slice = widget.slices[index];
                if (slice) {
                    if (slice.synth) count++;
                    let polys = slice.solids.unioned;
                    if (!polys) polys = slice.tops.map(t => t.poly);
                    if (slice.supports) polys.appendAll(slice.supports);
                    array.appendAll(polys.map(poly => {
                        return poly.clone(true).move(widget.track.pos);
                    }));
                    count += polys.length;
                }
            });

            let imagelen = width * height;
            let writer = new DataWriter(new DataView(wasm.memory.buffer), imagelen);
            writer.writeU16(width, true);
            writer.writeU16(height, true);
            writer.writeU16(array.length, true);

            // scale and move all polys to fit in rendered platform coordinates
            for (let i=0, il=array.length; i<il; i++) {
                let poly = array[i];
                scaleMovePoly(poly);
                writePoly(writer, poly);
            }

            wasm.render(0, imagelen, 0);
            let image = wasm.heap.slice(0, imagelen), layers = [];

            // one rle encoded bitstream for each mash (anti-alias sublayer)
            for (let l=0; l<masks.length; l++) {
                // while the image is still in wasm heap memory, rle encode it
                let rlelen = wasm.rle_encode(0, 0, imagelen, masks[l], imagelen, 0);
                layers.push(wasm.heap.slice(imagelen, imagelen + rlelen));
            }

            return { image, layers, end: count === 0 };
        }

        // legacy JS-only rasterizer uses OffscreenCanvas
        self.renderLayer = function renderLayer(params) {
            let {width, height, index, widgets, scaleX, scaleY} = params;
            let layer = new OffscreenCanvas(height,width);
            let opt = { scaleX, scaleY, width, height, width2: width/2, height2: height/2 };
            let ctx = layer.getContext('2d');
            ctx.fillStyle = 'rgb(200, 0, 0)';
            let count = 0;
            widgets.forEach(widget => {
                let slice = widget.slices[index];
                if (slice) {
                    // prevent premature exit on empty synth slice
                    if (slice.synth) count++;
                    let polys = slice.solids.unioned;
                    if (!polys) polys = slice.tops.map(t => t.poly);
                    if (slice.supports) polys.appendAll(slice.supports);
                    polys.forEach(poly => {
                        poly.move(widget.track.pos);
                        ctx.beginPath();
                        polyout(poly.setClockwise(), ctx, opt);
                        if (poly.inner) {
                            poly.inner.forEach(inner => {
                                polyout(inner.setCounterClockwise(), ctx, opt);
                            });
                        }
                        ctx.fill();
                        count++;
                    });
                } else {
                    // console.log({no_slice_at: index})
                }
            });
            let data = ctx.getImageData(0,0,height,width).data;
            // reduce RGBA to R
            let red = new Uint8ClampedArray(data.length / 4);
            for (let i=0; i<red.length; i++) {
                red[i] = data[i*4];
            }
            return { image: red, end: count === 0 };
        }

        function polyout(poly, ctx, opt) {
            let { scaleX, scaleY, width, height, width2, height2 } = opt;
            poly.forEachPoint((p,i) => {
                if (i === 0) {
                    ctx.moveTo(height - (p.y * scaleY + height2), p.x * scaleX + width2);
                } else {
                    ctx.lineTo(height - (p.y * scaleY + height2), p.x * scaleX + width2);
                }
            }, true);
            ctx.closePath();
        }

    }

})();
