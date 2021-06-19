/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        POLY = BASE.polygons,
        UTIL = BASE.util,
        SLA = KIRI.driver.SLA,
        FDM = KIRI.driver.FDM.share,
        SLICER = KIRI.slicer,
        newTop = KIRI.newTop,
        newSlice = KIRI.newSlice,
        newPoint = BASE.newPoint,
        newPolygon = BASE.newPolygon,
        fill_cache;

    /**
     * DRIVER SLICE CONTRACT - runs in worker
     *
     * @param {Object} settings
     * @param {Widget} Widget
     * @param {Function} onupdate (called with % complete and optional message)
     * @param {Function} ondone (called when complete with an array of Slice objects)
     */
    SLA.slice = function(settings, widget, onupdate, ondone) {
        let process = settings.process,
            device = settings.device,
            work_total,
            work_remain;

        if (SLA.legacy && !self.OffscreenCanvas) {
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

        let b64 = atob(self.worker.snap);
        let bin = Uint8Array.from(b64, c => c.charCodeAt(0));
        let img = new png.PNG();
        img.parse(bin, (err, data) => {
            SLA.preview = img;
            SLA.previewSmall = samplePNG(img, 200, 125);
            SLA.previewLarge = samplePNG(img, 400, 300);
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
                let union = POLY.union(polys, undefined, true).map(p => p.clone());
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
            let solidLayers = Math.round(process.slaShell / process.slaSlice);
            // setup solid fill
            slices.forEach(function(slice) {
                slice.solids = [];
            });
            // compute total work for progress bar
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
                    FDM.doShells(slice, 2, 0, process.slaShell);
                } else {
                    FDM.doShells(slice, 1, 0);
                }
            }, "slice");
            forSlices(slices, 10, (slice) => {
                if (slice.synth) return;
                FDM.doDiff(slice, 0.000001, true, !process.slaOpenBase);
            }, "delta");
            if (solidLayers) {
                forSlices(slices, 10, (slice) => {
                    if (slice.synth) return;
                    FDM.projectFlats(slice, solidLayers);
                    FDM.projectBridges(slice, solidLayers);
                }, "project");
                forSlices(slices, 10, (slice) => {
                    if (slice.synth) return;
                    FDM.doSolidsFill(slice, undefined, undefined, 0.001);
                    let traces = POLY.nest(POLY.flatten(slice.topShells()));
                    let trims = slice.solids || [];
                    traces.appendAll(trims);
                    let union = POLY.union(traces, undefined, true);
                    slice.unioned = union;
                }, "solid");
            } else {
                forSlices(slices, 10, (slice) => {
                    if (slice.synth) return;
                    slice.unioned = slice.topPolys();
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
            doRender(widget);
            ondone();
        }, function(update) {
            return onupdate(0.0 + update * 0.25);
        });
    };

    function doRender(widget) {
        widget.slices.forEach(slice => {
            const render = slice.output();

            if (slice.unioned) {
                // console.log('solid', slice.index)
                slice.unioned.forEach(poly => {
                    poly = poly.clone(true);//.move(widget.track.pos);
                    render
                        .setLayer("layers", { line: 0x010101, face: 0x0099cc, opacity: 0.2 })
                        .addAreas([poly], { outline: true });
                });
            } else if (slice.tops) {
                // console.log('top', slice.index)
                slice.tops.forEach(top => {
                    let poly = top.poly;//.clone(true).move(widget.track.pos);
                    render
                        .setLayer("layers", { line: 0x010101, face: 0xfcba03, opacity: 0.2 })
                        .addAreas([poly], { outline: true });
                });
            }

            if (slice.supports) {
                // console.log('support', slice.index)
                slice.supports.forEach(poly => {
                    render
                        .setLayer("support", { line: 0x010101, face: 0xfcba03, opacity: 0.2 })
                        .addAreas([poly], { outline: true });
                });
            }
        });
    }

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
            slice.mass = slice.unioned.reduce((t,p) => { return t + p.areaDeep() }, 0);
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
                slice.supports = POLY.union(slice.supports, 0, true);
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
            polys = slice.unioned,
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
            fill = POLY.union(fill, 0, true);
            fill_cache[seq_c] = fill;
        } else {
            fill = cached.slice().map(p => p.clone(true).setZ(slice.z));
        }

        fill = POLY.trimTo(fill, slice.tops.map(t => t.poly));
        fill = POLY.union(slice.unioned.appendAll(fill), 0, true);

        slice.unioned = fill;
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

})();
