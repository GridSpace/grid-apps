/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    const KIRI = self.kiri,
        BASE = self.base,
        DBUG = BASE.debug,
        POLY = BASE.polygons,
        UTIL = BASE.util,
        CONF = BASE.config,
        FDM = KIRI.driver.FDM,
        SLICER = KIRI.slicer,
        fillArea = POLY.fillArea,
        newPoint = BASE.newPoint,
        newSlice = KIRI.newSlice,
        tracker = UTIL.pwait,
        FILL = KIRI.fill,
        FILLFIXED = KIRI.fill_fixed,
        COLOR = {
            shell: { check: 0x0077bb, face: 0x0077bb, line: 0x0077bb, opacity: 1 },
            fill: { check: 0x00bb77, face: 0x00bb77, line: 0x00bb77, opacity: 1 },
            infill: { check: 0x3322bb, face: 0x3322bb, line: 0x3322bb, opacity: 1 },
            support: { check: 0xaa5533, face: 0xaa5533, line: 0xaa5533, opacity: 1 },
            gaps: { check: 0xaa3366, face: 0xaa3366, line: 0xaa3366, opacity: 1 }
        },
        PROTO = Object.clone(COLOR),
        bwcomp = (1 / Math.cos(Math.PI/4)),
        getRangeParameters = FDM.getRangeParameters,
        noop = function() {},
        profile = false,
        profileStart = profile ? console.profile : noop,
        profileEnd = profile ? console.profileEnd : noop,
        debug = false;

    let isThin = false, // force line rendering
        isFlat = false, // force flat rendering
        offset = 0;     // poly line generation offsets

    let lastLogTime = 0;

    function timelog() {
        let now = Date.now();
        console.log(now - (lastLogTime || now), ...arguments);
        lastLogTime = now;
    }

    function vopt(opt) {
        if (opt) {
            if (isFlat) {
                opt.flat = true;
                opt.outline = true;
                return opt;
            }
            if (isThin) return null;
        }
        return opt;
    }

    /**
     * may run in minion or worker context. do not create objects
     * that will not quickly encode in threaded mode. add to existing
     * data object. return is ignored.
     */
    FDM.slicePost = function(data, options, params) {
        let { lines, groups, tops } = data;
        let { z, index, total, height, thick } = params;
        let { process, isSynth, isDanger, vaseMode, shellOffset, fillOffset } = options.post;
        let range = getRangeParameters(process, index);
        // calculate fractional shells
        let shellFrac = (range.sliceShells - (range.sliceShells | 0));
        let sliceShells = range.sliceShells | 0;
        if (shellFrac) {
            let v1 = shellFrac > 0.5 ? 1 - shellFrac : shellFrac;
            let v2 = 1 - v1;
            let parts = Math.round(v2/v1) + 1;
            let rem = index % parts;
            let trg = shellFrac > 0.5 ? 1 : parts - 1;
            sliceShells += rem >= trg ? 1 : 0;
        }
        let spaceMult = index === 0 ? process.firstLayerLineMult || 1 : 1;
        let count = isSynth ? 1 : sliceShells;
        let offset =  shellOffset * spaceMult;
        let fillOff = fillOffset * spaceMult;
        let nutops = [];
        // co-locate shell processing with top generation in slicer
        for (let top of tops) {
            nutops.push(FDM.share.doTopShells(z, top, count, offset/2, offset, fillOff, {
                vase: vaseMode,
                thin: process.detectThinWalls && !isSynth,
                danger: isDanger
            }));
        }
        // add simple (low rez poly) where less accuracy is OK
        for (let top of nutops) {
            top.simple = top.poly.clean(true, undefined, CONF.clipper / 10);
        }
        data.tops = nutops;
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
        FDM.fixExtruders(settings);
        let render = settings.render !== false,
            { process, device, controller } = settings,
            isBelt = device.bedBelt,
            isSynth = widget.track.synth,
            isDanger = controller.danger,
            isConcurrent = controller.threaded && KIRI.minions.concurrent,
            solidMinArea = process.sliceSolidMinArea,
            solidLayers = process.sliceSolidLayers || 0,
            vaseMode = process.sliceFillType === 'vase' && !isSynth,
            metadata = settings.widget[widget.id] || {},
            extruder = metadata.extruder || 0,
            sliceHeight = process.sliceHeight,
            sliceHeightBase = (isBelt ? sliceHeight : process.firstSliceHeight) || sliceHeight,
            nozzleSize = device.extruders[extruder].extNozzle,
            lineWidth = process.sliceLineWidth || nozzleSize,
            fillOffsetMult = 1.0 - bound(process.sliceFillOverlap, 0, 0.8),
            shellOffset = lineWidth,
            fillSpacing = lineWidth,
            fillOffset = lineWidth * fillOffsetMult,
            sliceFillAngle = process.sliceFillAngle,
            supportDensity = process.sliceSupportDensity,
            beltfact = Math.cos(Math.PI/4);

        // override globals used by vopt()
        isFlat = controller.lineType === "flat";
        isThin = !isFlat && controller.lineType === "line";
        offset = lineWidth / 2;

        if (isFlat) {
            Object.values(COLOR).forEach(color => {
                color.flat = true;
                color.line = 1
                color.opacity = 0.5;
            });
        } else {
            Object.keys(COLOR).forEach(key => {
                const color = COLOR[key];
                const proto = PROTO[key]
                color.flat = proto.flat;
                color.line = proto.line;
                color.opacity = proto.opacity;
            });
        }

        if (!(sliceHeight > 0 && sliceHeight < 100)) {
            return ondone("invalid slice height");
        }
        if (!(nozzleSize >= 0.01 && nozzleSize < 100)) {
            return ondone("invalid nozzle size");
        }

        const sliceMinHeight = process.sliceAdaptive && process.sliceMinHeight > 0 ?
            Math.min(process.sliceMinHeight, sliceHeight) : 0;

        if (sliceHeightBase < sliceHeight) {
            DBUG.log("invalid first layer height < slice height");
            DBUG.log("reverting to min valid slice height");
            sliceHeightBase = sliceMinHeight || sliceHeight;
        }

        SLICER.sliceWidget(widget, {
            mode: 'FDM',
            height: sliceHeight,
            minHeight: sliceMinHeight,
            firstHeight: sliceHeightBase,
            union: controller.healMesh,
            indices: process.indices,
            concurrent: isConcurrent,
            post: {
                shellOffset,
                fillOffset,
                lineWidth,
                vaseMode,
                isSynth,
                process,
                isDanger
            }
            // debug: true,
            // view: view,
            // xray: 3,
        }, slices => {
            onSliceDone(slices).then(ondone);
        }, update => {
            return onupdate(0.0 + update * 0.5);
        });

        async function doShadow(slices) {
            if (widget.shadow) {
                return;
            }
            // create shadow for clipping supports
            let alltops = widget.group
                .map(w => w.slices).flat()
                .map(s => s.tops).flat().map(t => t.simple);
            let shadow = isConcurrent ?
                await KIRI.minions.union(alltops, 0.1) :
                POLY.union(alltops, 0.1, true);
            // expand shadow when requested (support clipping)
            if (process.sliceSupportExtra) {
                shadow = POLY.offset(shadow, process.sliceSupportExtra);
            }
            widget.shadow = POLY.setZ(shadow, 0);
            // slices[0].output()
            //     .setLayer('shadow', { line: 0xff0000, check: 0xff0000 })
            //     .addPolys(shadow);
        }

        async function onSliceDone(slices) {
            // remove all empty slices above part but leave below
            // for multi-part (multi-extruder) setups where the void is ok
            // also reverse because slicing occurs bottom-up
            let found = false;
            slices = slices.reverse().filter(slice => {
                if (slice.tops.length) {
                    return found = true;
                } else {
                    return found;
                }
            }).reverse();

            widget.slices = slices;

            if (!slices) {
                return;
            }

            // attach range params to each slice
            for (let slice of slices) {
                slice.params = getRangeParameters(process, slice.index);
            }

            // create shadow for non-belt supports
            if (!isBelt && (isSynth || (!isSynth && supportDensity && process.sliceSupportEnable))) {
                await doShadow(slices);
            }

            // for synth support widgets, merge tops
            if (isSynth) {
                for (let slice of slices) {
                    // union top support polys
                    let tops = slice.topPolys();
                    let union = POLY.union(tops, null, true);
                    if (union.length < tops.length) {
                        slice.tops = [];
                        for (let u of union) {
                            slice.addTop(u);
                        }
                    }
                    let gap = sliceHeight * (isBelt ? 0 : process.sliceSupportGap);
                    // clip tops to other widgets in group
                    tops = slice.topPolys();
                    for (let peer of widget.group) {
                        // skip self
                        if (peer === widget || !peer.slices) {
                            continue;
                        }
                        for (let pslice of peer.slices) {
                            if (Math.abs(Math.abs(pslice.z - slice.z) - gap) > 0.1) {
                                continue;
                            }
                            // offset pslice tops by process.sliceSupportOffset
                            if (!pslice.synth_off) {
                                pslice.synth_off = POLY.offset(pslice.topPolys(), process.sliceSupportOffset);
                            }
                            let ptops = pslice.synth_off;
                            let ntops = [];
                            POLY.subtract(tops, ptops, ntops, null, slice.z, 0);
                            tops = ntops;
                        }
                        // trim to group's shadow if not in belt mode
                        if (!isBelt) {
                            tops = POLY.setZ(POLY.trimTo(tops, widget.shadow), slice.z);
                        }
                    }
                    slice.tops = [];
                    for (let t of tops) {
                        slice.addTop(t);
                    }
                }
            }

            // calculate % complete and call onupdate()
            function doupdate(index, from, to, msg) {
                // onupdate(0.5 + (from + ((index/slices.length) * (to-from))) * 0.5, msg);
                trackupdate(index / slices.length, from, to, msg);
            }

            function trackupdate(pct, from, to, msg) {
                onupdate(0.5 + (from + (pct * (to - from))) * 0.5, msg);
            }

            // for each slice, performe a function and call doupdate()
            function forSlices(from, to, fn, msg) {
                slices.forEach(slice => {
                    fn(slice);
                    doupdate(slice.index, from, to, msg)
                });
            }

            // do not hint polygon fill longer than a max span length
            CONF.hint_len_max = UTIL.sqr(process.sliceBridgeMax);

            // reset for solids, support projections
            // and other annotations
            slices.forEach(slice => {
                slice.widget = widget;
                slice.extruder = extruder;
                slice.solids = [];
            });

            // just the top/bottom special solid layers or range defined solid layers
            forSlices(0.15, 0.2, slice => {
                let range = slice.params;
                let spaceMult = slice.index === 0 ? process.firstLayerLineMult || 1 : 1;
                let isBottom = slice.index < process.sliceBottomLayers;
                let isTop = slice.index > slices.length - process.sliceTopLayers - 1;
                let isDense = range.sliceFillSparse > 0.98;
                let isSolid = (isBottom || ((isTop || isDense) && !vaseMode)) && !isSynth;
                let solidWidth = isSolid ? range.sliceFillWidth || 1 : 0;
                if (solidWidth) {
                    let fillSpace = fillSpacing * spaceMult * solidWidth;
                    doSolidLayerFill(slice, fillSpace, sliceFillAngle);
                }
                sliceFillAngle += 90.0;
            }, "solid layers");

            // add lead in anchor when specified in belt mode (but not for synths)
            if (isBelt && !isSynth) {
                // find adjusted zero point from slices
                let smin = Infinity;
                for (let slice of slices) {
                    let miny = Infinity;
                    for (let poly of slice.topPolys()) {
                        let y = poly.bounds.maxy;
                        let z = slice.z;
                        let by = z - y;
                        if (by < miny) miny = by;
                        if (by < smin) smin = by;
                    }
                    slice.belt = { miny, touch: false };
                }
                // mark slices with tops touching belt
                // also find max width of first 5 layers
                let start;
                let minx = Infinity, maxx = -Infinity;
                let peek = 0;
                for (let slice of slices) {
                    if (slice.tops.length && peek++ < 5) {
                        for (let poly of slice.topPolys()) {
                            minx = Math.min(minx, poly.bounds.minx);
                            maxx = Math.max(maxx, poly.bounds.maxx);
                        }
                    }
                    // mark slice as touching belt if near miny
                    if (Math.abs(slice.belt.miny - smin) < 0.01) {
                        slice.belt.touch = true;
                        if (!start) start = slice;
                    }
                }
                // ensure we start against a layer with shells
                while (start.up && start.topShells().length === 0) {
                    start = start.up;
                }
                // if a brim applies, add that width to anchor
                let brim = getRangeParameters(process, 0).firstLayerBrim || 0;
                if (brim) {
                    minx -= brim;
                    maxx += brim;
                }
                let adds = [];
                // add enough lead in layers to fill anchor area
                let anchorlen = process.firstLayerBeltLead * beltfact;
                while (anchorlen && start && anchorlen >= sliceHeight) {
                    let addto = start.down;
                    if (!addto) {
                        addto = newSlice(start.z - sliceHeight);
                        addto.belt = { };
                        addto.height = start.height;
                        addto.up = start;
                        start.down = addto;
                        slices.splice(0,0,addto);
                    } else if (!addto.belt) {
                        console.log({addto_missing_belt: addto});
                        addto.belt = {};
                    }
                    addto.index = -1;
                    addto.belt.anchor = true;
                    // this allows the anchor to print bi-directionally
                    // by removing the forced start-point in print.js
                    addto.belt.touch = false;
                    let z = addto.z;
                    let y = z - smin - (nozzleSize / 2);
                    // let splat = BASE.newPolygon().add(wb.min.x, y, z).add(wb.max.x, y, z).setOpen();
                    let splat = BASE.newPolygon().add(minx, y, z).add(maxx, y, z).setOpen();
                    let snew = addto.addTop(splat).fill_sparse = [ splat ];
                    adds.push(snew);
                    start = addto;
                    anchorlen -= sliceHeight;
                }
                // add anchor bump
                let bump = process.firstLayerBeltBump;
                if (bump) {
                    adds = adds.reverse().slice(1, adds.length - 1);
                    let count = 1;
                    for (let add of adds) {
                        let poly = add[0];
                        let y = count++ * -start.height * 2;
                        if (-y > bump) {
                            count--;
                            // break;
                        }
                        let first = poly.first();
                        poly.push(poly.last().add({x:0, y, z:0}));
                        poly.push(poly.first().add({x:0, y, z:0}));
                        poly.setClosed();
                        if (count > 2 && maxx - minx > 10) {
                            let mp = (maxx + minx) / 2;
                            let dx = (maxx - minx - 2);
                            dx = (Math.floor(dx / 3) * 3) / 2;
                            let fy = first.y;
                            let fz = first.z;
                            let n2 = nozzleSize / 2;
                            for (let x = mp - dx; x <= mp + dx ; x += 3) {
                                add.push( BASE.newPolygon().add(x, fy - n2, fz).add(x, fy + y + n2, fz).setOpen() );
                            }
                        }
                    }
                }
            }

            // calculations only relevant when solid layers are used
            if (solidLayers && !vaseMode && !isSynth) {
                profileStart("delta");
                forSlices(0.2, 0.34, slice => {
                    if (slice.index > 0) doDiff(slice, solidMinArea);
                }, "layer deltas");
                profileEnd();
                profileStart("delta-project");
                forSlices(0.34, 0.35, slice => {
                    projectFlats(slice, solidLayers);
                    projectBridges(slice, solidLayers);
                }, "layer deltas");
                profileEnd();
                profileStart("solid-fill")
                let promises = isConcurrent ? [] : undefined;
                forSlices(0.35, promises ? 0.4 : 0.5, slice => {
                    let params = slice.params || process;
                    let first = slice.index === 0;
                    let solidWidth = params.sliceFillWidth || 1;
                    let spaceMult = first ? params.firstLayerLineMult || 1 : 1;
                    let fillSpace = fillSpacing * spaceMult * solidWidth;
                    doSolidsFill(slice, fillSpace, sliceFillAngle, solidMinArea, promises);
                    sliceFillAngle += 90.0;
                }, "fill solids");
                if (promises) {
                    await tracker(promises, (i, t) => {
                        trackupdate(i / t, 0.4, 0.5);
                    });
                }
                profileEnd();
            }

            if (!isSynth && !vaseMode) {
                // sparse layers only present when non-vase mose and sparse % > 0
                let lastType;
                let promises = isConcurrent ? [] : undefined;
                forSlices(0.5, promises ? 0.55 : 0.7, slice => {
                    let params = slice.params || process;
                    if (!params.sliceFillSparse) {
                        return;
                    }
                    let newType = params.sliceFillType;
                    doSparseLayerFill(slice, {
                        settings,
                        process,
                        device,
                        lineWidth,
                        spacing: fillOffset,
                        density: params.sliceFillSparse,
                        bounds: widget.getBoundingBox(),
                        height: sliceHeight,
                        type: newType,
                        cache: params._range !== true && lastType === newType && !isConcurrent,
                        promises
                    });
                    lastType = newType;
                }, "infill");
                if (promises) {
                    await tracker(promises, (i, t) => {
                        trackupdate(i / t, 0.55, 0.7);
                    });
                }
            } else if (isSynth) {
                // fill supports differently
                let promises = isConcurrent ? [] : undefined;
                forSlices(0.5, promises ? 0.6 : 0.7, slice => {
                    let params = slice.params || process;
                    let density = params.sliceSupportDensity;
                    if (density)
                    for (let top of slice.tops) {
                        let offset = [];
                        POLY.expand(top.shells, -nozzleSize/4, slice.z, offset);
                        fillSupportPolys(promises, offset, lineWidth, density, slice.z);
                        top.fill_lines = offset.map(o => o.fill).flat().filter(v => v);
                    }
                }, "infill");
                if (promises) {
                    await tracker(promises, (i, t) => {
                        trackupdate(i / t, 0.6, 0.7);
                    });
                }
            }

            // auto support generation
            if (!isBelt && !isSynth && supportDensity && process.sliceSupportEnable) {
                doShadow(slices);
                profileStart("support");
                let promises = [];
                forSlices(0.7, 0.75, slice => {
                    promises.push(doSupport(slice, process, widget.shadow, { exp: isDanger }));
                }, "support");
                await tracker(promises, (i, t) => {
                    trackupdate(i / t, 0.75, 0.8);
                });
                profileEnd();
                profileStart("support-fill");
                promises = false && isConcurrent ? [] : undefined;
                forSlices(0.8, promises ? 0.88 : 0.9, slice => {
                    doSupportFill(promises, slice, lineWidth, supportDensity, process.sliceSupportArea);
                }, "support");
                if (promises) {
                    await tracker(promises, (i, t) => {
                        trackupdate(i / t, 0.88, 0.9);
                    });
                }
                profileEnd();
            }

            // render if not explicitly disabled
            if (render) {
                forSlices(0.9, 1.0, slice => {
                    let params = slice.params || process;
                    doRender(slice, isSynth, params, controller.devel);
                }, "render");
            }

            if (isBelt) {
                let bounds = BASE.newBounds();
                for (let top of slices[0].tops) {
                    bounds.merge(top.poly.bounds);
                }
                widget.belt.miny = -bounds.miny;
                widget.belt.midy = (bounds.miny + bounds.maxy) / 2;
            }
        }

    }

    function bound(v,min,max) {
        return Math.max(min,Math.min(max,v));
    }

    function doRender(slice, isSynth, params, devel) {
        const output = slice.output();
        const height = slice.height / 2;
        const solidWidth = params.sliceFillWidth || 1;

        slice.tops.forEach(top => {
            if (isThin) output
                .setLayer('part', { line: 0x333333, check: 0x333333 })
                .addPolys(top.poly);

            output
                .setLayer("shells", isSynth ? COLOR.support : COLOR.shell)
                .addPolys(top.shells || [], vopt({ offset, height, clean: true }));

            output
                .setLayer("solid fill", isSynth ? COLOR.support : COLOR.fill)
                .addLines(top.fill_lines || [], vopt({ offset: offset * solidWidth, height }));

            output
                .setLayer("sparse fill", COLOR.infill)
                .addPolys(top.fill_sparse || [], vopt({ offset, height, outline: true }))

            if (top.thin_fill) output
                .setLayer("thin fill", COLOR.fill)
                .addLines(top.thin_fill, vopt({ offset, height }));

            if (top.gaps) output
                .setLayer("gaps", COLOR.gaps)
                .addPolys(top.gaps, vopt({ offset, height, thin: true }));

            if (isThin && devel && top.fill_off && top.fill_off.length) {
                slice.output()
                    .setLayer('fill inset', { face: 0, line: 0xaaaaaa, check: 0xaaaaaa })
                    .addPolys(top.fill_off);
                    // .setLayer('last', { face: 0, line: 0x008888, check: 0x008888 })
                    // .addPolys(top.last);
            }
        });

        if (isThin && devel) {
            if (slice.solids && slice.solids.length) output
                .setLayer("solids", { face: 0xbbbb00, check: 0xbbbb00 })
                .addAreas(slice.solids);

            if (slice.bridges && slice.bridges.length) output
                .setLayer("bridges", { face: 0x00cccc, line: 0x00cccc, check: 0x00cccc })
                .addAreas(slice.bridges);

            if (slice.flats && slice.flats.length) output
                .setLayer("flats", { face: 0xaa00aa, line: 0xaa00aa, check: 0xaa00aa })
                .addAreas(slice.flats);
        }

        if (slice.supports) output
            .setLayer("support", COLOR.support)
            .addPolys(slice.supports, vopt({ offset, height }));

        if (slice.supports) slice.supports.forEach(poly => {
            if (poly.fill) output
                .setLayer("support", COLOR.support)
                .addLines(poly.fill, vopt({ offset, height }));
        });

        // console.log(slice.index, slice.render.stats);
    }

    // shared with SLA driver and minions
    FDM.share = {
        doShells,
        doTopShells,
        doDiff,
        projectFlats,
        projectBridges
    };

    /**
     * Compute offset shell polygons. For FDM, the first offset is usually half
     * of the nozzle width.  Each subsequent offset is a full nozzle width.  User
     * parameters control tweaks to these numbers to allow for better shell bonding.
     * The last shell generated is a "fillOffset" shell.  Fill lines are clipped to
     * this polygon.  Adjusting fillOffset controls bonding of infill to the shells.
     *
     * Most of this is done in slicePost() in FDM mode. now this is used by SLA, Laser
     *
     * @param {number} count
     * @param {number} offsetN
     * @param {number} fillOffset
     * @param {Obejct} options
     */
    function doShells(slice, count, offset1, offsetN, fillOffset, opt = {}) {
        for (let top of slice.tops) {
            doTopShells(slice.z, top, count, offset1, offsetN, fillOffset, opt);
        }
    }

    function doTopShells(z, top, count, offset1, offsetN, fillOffset, opt = {}) {
        // pretend we're a top object in minions
        if (!top.poly) {
            top = { poly: top };
        }

        let top_poly = [ top.poly ];

        if (opt.vase) {
            // remove top poly inners in vase mode
            top.poly = top.poly.clone(false);
        }

        top.shells = [];
        top.fill_off = [];
        top.fill_lines = [];

        let last = [],
            gaps = [];

        if (count) {
            // permit offset of 0 for laser and drag knife
            if (offset1 === 0 && count === 1) {
                last = top_poly.clone(true);
                top.shells = last;
            } else {
                // heal top open polygons if the ends are close (benchy tilt test)
                top_poly.forEach(p => { if (p.open) {
                    let dist = p.first().distTo2D(p.last());
                    if (dist < 1) p.open = false;
                } });
                if (opt.danger && opt.thin) {
                    top.thin_fill = [];
                    top.fill_sparse = [];
                    let layers = POLY.inset(top_poly, offsetN, count, z);
                    last = layers.last().mid;
                    top.shells = layers.map(r => r.mid).flat();
                    top.gaps = layers.map(r => r.gap).flat();
                    let off = offsetN;
                    let min = off * 0.75;
                    let max = off * 4;
                    for (let poly of layers.map(r => r.gap).flat()) {
                        let centers = poly.centers(off/2, z, min, max, {lines:false});
                        top.fill_sparse.appendAll(centers);
                        // top.fill_lines.appendAll(centers);
                    }
                } else if (opt.thin) {
                    top.thin_fill = [];
                    let oso = {z, count, gaps: [], outs: [], minArea: 0.05};
                    POLY.offset(top_poly, [-offset1, -offsetN], oso);

                    oso.outs.forEach((polys, i) => {
                        polys.forEach(p => {
                            p.depth = i;
                            if (p.fill_off) {
                                p.fill_off.forEach(pi => pi.depth = i);
                            }
                            if (p.inner) {
                                for (let pi of p.inner) {
                                    pi.depth = p.depth;
                                }
                            }
                            top.shells.push(p);
                        });
                        last = polys;
                    });

                    // slice.solids.trimmed = slice.solids.trimmed || [];
                    oso.gaps.forEach((polys, i) => {
                        let off = (i == 0 ? offset1 : offsetN);
                        polys = POLY.offset(polys, -off * 0.8, {z, minArea: 0});
                        top.thin_fill.appendAll(cullIntersections(
                            fillArea(polys, 45, off/2, [], 0.01, off*2),
                            fillArea(polys, 135, off/2, [], 0.01, off*2),
                        ));
                        gaps = polys;
                    });
                } else {
                    // standard wall offsetting strategy
                    POLY.expand(
                        top_poly,   // reference polygon(s)
                        -offset1,   // first inset distance
                        z,          // set new polys to this z
                        top.shells, // accumulator array
                        count,      // number of insets to perform
                        -offsetN,   // subsequent inset distance
                        // on each new offset trace ...
                        function(polys, countNow) {
                            last = polys;
                            // mark each poly with depth (offset #) starting at 0
                            polys.forEach(function(p) {
                                p.depth = count - countNow;
                                if (p.fill_off) p.fill_off.forEach(function(pi) {
                                    // use negative offset for inners
                                    pi.depth = -(count - countNow);
                                });
                                if (p.inner) {
                                    for (let pi of p.inner) {
                                        pi.depth = p.depth;
                                    }
                                }
                            });
                        });
                }
            }
        } else {
            // no shells, just infill, is permitted
            last = [top.poly];
        }

        // generate fill offset poly set from last offset to top.fill_off
        if (fillOffset && last.length > 0) {
            // if gaps present, remove that area from fill inset
            if (gaps.length) {
                let nulast = [];
                POLY.subtract(last, gaps, nulast, null, z);
                last = nulast;
            }
            last.forEach(function(inner) {
                POLY.offset([inner], -fillOffset, {outs: top.fill_off, flat: true, z});
            });
        }

        // for diffing
        top.last = last;
        // top.last_simple = last.map(p => p.clean(true, undefined, CONF.clipper / 10));

        return top;
    }

    /**
     * Create an entirely solid layer by filling all top polygons
     * with an alternating pattern.
     *
     * @param {number} linewidth
     * @param {number} angle
     * @param {number} density
     */
     function doSolidLayerFill(slice, spacing, angle) {
        if (slice.tops.length === 0 || typeof(angle) != 'number') {
            slice.isSolidLayer = false;
            return;
        }

        slice.tops.forEach(function(top) {
            let lines = fillArea(top.fill_off, angle, spacing, null);
            top.fill_lines.appendAll(lines);
        });

        slice.isSolidLayer = true;
    };

    /**
     * Take output from pluggable sparse infill algorithm and clip to
     * the bounds of the top polygons and their inner solid areas.
     */
    function doSparseLayerFill(slice, options = {}) {
        let process = options.process,
            spacing = options.spacing,  // spacing space between fill lines
            density = options.density,  // density of infill 0.0 - 1.0
            bounds = options.bounds,    // bounding box of widget
            height = options.height,    // z layer height
            cache = !(options.cache === false),
            type = options.type || 'hex';

        if (slice.tops.length === 0 || density === 0.0 || slice.isSolidLayer) {
            slice.isSparseFill = false;
            return;
        }

        let tops = slice.tops,
            down = slice.down,
            clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            poly,
            polys = [],
            lines = [],
            line = [],
            solids = [],
            // callback passed to pluggable infill algorithm
            target = {
                // slice and slice property access
                slice: function() { return slice },
                zIndex: function() { return slice.index },
                zValue: function() { return slice.z },
                // various option map access
                options: function() { return options },
                lineWidth: function() { return options.lineWidth },
                bounds: function() { return bounds },
                zHeight: function() { return height },
                offset: function() { return spacing },
                density: function() { return density },
                repeat: function() { return process.sliceFillRepeat },
                // output functions
                emit: function(x,y) {
                    if (isNaN(x)) {
                        solids.push(x);
                    } else {
                        line.push(newPoint(x, y, slice.z));
                        slice.isSparseFill = true;
                    }
                },
                newline: function() {
                    if (line.length > 0) {
                        lines.push(line);
                        line = [];
                    }
                }
            };

        // use specified fill type
        if (type && FILL[type]) {
            FILL[type](target);
        } else {
            console.log({missing_infill: type});
            return;
        }

        // force emit of last line
        target.newline();

        // prepare top infill structure
        for (let top of tops) {
            top.fill_sparse = top.fill_sparse || [];
            polys.appendAll(top.fill_off);
            polys.appendAll(top.solids);
        }

        // update fill fingerprint for this slice
        slice._fill_finger = POLY.fingerprint(polys);

        let skippable = cache && FILLFIXED[type] ? true : false;
        let miss = false;
        // if the layer below has the same fingerprint,
        // we may be able to clone the infill instead of regenerating it
        if (skippable && slice.fingerprintSame(down)) {
            // the fill fingerprint can slightly different because of solid projections
            if (down._fill_finger && POLY.fingerprintCompare(slice._fill_finger, down._fill_finger)) {
                for (let i=0; i<tops.length; i++) {
                    // the layer below may not have infill computed if it's solid
                    if (down.tops[i].fill_sparse) {
                        tops[i].fill_sparse = down.tops[i].fill_sparse.map(poly => {
                            return poly.clone().setZ(slice.z);
                        });
                    } else {
                        miss = true;
                    }
                }
                // if any of the fills as missing from below, re-compute
                if (!miss) {
                    return;
                }
            }
        }

        let sparse_clip = slice.isSparseFill;

        // solid fill areas
        if (solids.length) {
            for (let top of tops) {
                if (!top.fill_off) return;
                let masks = top.fill_off.slice();
                if (top.solids) {
                    masks = POLY.subtract(masks, top.solids, [], null, slice.z);
                }
                let angl = process.sliceFillAngle * ((slice.index % 2) + 1);
                for (let solid of solids) {
                    let inter = [],
                        fillable = [];
                    for (let mask of masks) {
                        let p = solid.mask(mask);
                        if (p && p.length) inter.appendAll(p);
                    }
                    // offset fill area to accommodate trace
                    if (inter.length) {
                        POLY.expand(inter, -options.lineWidth/2, slice.z, fillable);
                    }
                    // fill intersected areas
                    if (inter.length) {
                        slice.isSparseFill = true;
                        for (let p of inter) {
                            p.forEachSegment((p1, p2) => {
                                top.fill_lines.push(p1, p2);
                            });
                        }
                    }
                    if (fillable.length) {
                        let lines = POLY.fillArea(fillable, angl, options.lineWidth);
                        top.fill_lines.appendAll(lines);
                    }
                }
            }
        }

        // if only solids were added and no lines to clip
        if (!sparse_clip) {
            return;
        }

        if (options.promises) {
            options.promises.push(KIRI.minions.clip(slice, polys, lines));
            return;
        }

        lines = lines.map(a => a.map(p => p.toClipper()));
        clip.AddPaths(lines, ptyp.ptSubject, false);
        clip.AddPaths(POLY.toClipper(polys), ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
            for (let node of ctre.m_AllPolys) {
                poly = POLY.fromClipperNode(node, slice.z);
                for (let top of tops) {
                    // use only polygons inside this top
                    if (poly.isInside(top.poly)) {
                        top.fill_sparse.push(poly);
                    }
                }
            }
        }
    };

    /**
     * Find difference between fill inset poly on two adjacent layers.
     * Used to calculate bridges, flats and then solid projections.
     * 'expand' is used for top offsets in SLA mode
     */
    function doDiff(slice, minArea, sla, fakedown) {
        if (slice.index === 0 && !fakedown) {
            return;
        }
        const top = slice,
            down = slice.down || (fakedown ? newSlice(-1) : null),
            topInner = sla ? top.topPolys() : top.topInners(),
            downInner = sla ? down.topPolys() : down.topInners(),
            bridges = top.bridges = [],
            flats = down.flats = [];

        // skip diffing layers that are identical
        if (slice.fingerprintSame(down)) {
            top.bridges = bridges;
            down.flats = flats;
            return;
        }

        POLY.subtract(topInner, downInner, bridges, flats, slice.z, minArea);
    };

    /**
     *
     *
     * @param {Polygon[]} polys
     */
    function addSolidFills(slice, polys) {
        if (slice.solids) {
            slice.solids.appendAll(polys);
        } else if (polys && polys.length) {
            console.log({no_solids_in: slice, for: polys})
        }
    };

    /**
     * project bottom flats down
     */
    function projectFlats(slice, count) {
        if (slice.isSolidLayer || !slice.down || !slice.flats) return;
        projectSolid(slice, slice.flats, count, false, true);
    };

    /**
     * project top bridges up
     */
    function projectBridges(slice, count) {
        if (slice.isSolidLayer || !slice.up || !slice.bridges) return;
        projectSolid(slice, slice.bridges, count, true, true);
    };

    /**
     * fill projected areas and store line data
     * @return {boolean} true if filled, false if not
     */
    function doSolidsFill(slice, spacing, angle, minArea, fillQ) {
        let minarea = minArea || 1,
            tops = slice.tops,
            solids = slice.solids;

        if (!(tops && solids)) {
            return;
        }

        let unioned = POLY.union(solids, undefined, true).flat(),
            isSLA = (spacing === undefined && angle === undefined);

        if (solids.length === 0) return false;
        if (unioned.length === 0) return false;

        let trims = [],
            inner = isSLA ? slice.topPolys() : slice.topFillOff();

        // trim each solid to the inner bounds
        for (let p of unioned) {
            p.setZ(slice.z);
            for (let i of inner) {
                let masks = p.mask(i);
                if (masks && masks.length > 0) {
                    trims.appendAll(masks);
                }
            }
        }

        // clear old solids and make array for new
        tops.forEach(top => { top.solids = [] });

        // replace solids with merged and trimmed solids
        slice.solids = solids = trims;

        // parent each solid polygon inside the smallest bounding top
        for (let solid of solids) {
            for (let top of tops) {
                if (top.poly.overlaps(solid)) {
                    if (!solid.parent || solid.parent.area() > top.poly.area()) {
                        if (solid.areaDeep() < minarea) {
                            // console.log({i:slice.index,cull_solid:solid,area:solid.areaDeep()});
                            continue;
                        }
                        solid.parent = top.poly;
                        top.solids.push(solid);
                    }
                }
            }
        }

        // for SLA to bypass line infill
        if (isSLA) {
            return true;
        }

        // create empty filled line array for each top
        for (let top of tops) {
            // synth belt anchor tops don't want fill
            if (!top.fill_lines) {
                continue;
            }
            const tofill = [];
            const angfill = [];
            const newfill = top.fill_lines = [];
            // determine fill orientation from top
            for (let solid of solids) {
                if (solid.parent === top.poly) {
                    if (solid.fillang) {
                        angfill.push(solid);
                    } else {
                        tofill.push(solid);
                    }
                }
            }
            if (tofill.length > 0) {
                doFillArea(fillQ, tofill, angle, spacing, newfill);
                top.fill_lines_norm = {angle:angle,spacing:spacing};
            }
            if (angfill.length > 0) {
                top.fill_lines_ang = {spacing:spacing,list:[],poly:[]};
                for (let af of angfill) {
                    doFillArea(fillQ, [af], af.fillang.angle + 45, spacing, newfill);
                    top.fill_lines_ang.list.push(af.fillang.angle + 45);
                    top.fill_lines_ang.poly.push(af.clone());
                }
            }
        }
    }

    function doFillArea(fillQ, polys, angle, spacing, output, minLen, maxLen) {
        if (fillQ) {
            fillQ.push(KIRI.minions.fill(polys, angle, spacing, output, minLen, maxLen));
        } else {
            POLY.fillArea(polys, angle, spacing, output, minLen, maxLen);
        }
    }

    /**
     * calculate external overhangs requiring support
     */
    async function doSupport(slice, proc, shadow, opt = {}) {
        let maxBridge = proc.sliceSupportSpan || 5,
            minArea = proc.supportMinArea,
            pillarSize = proc.sliceSupportSize,
            offset = proc.sliceSupportOffset,
            gap = proc.sliceSupportGap,
            min = minArea || 0.01,
            size = (pillarSize || 1),
            tops = slice.topPolys(),
            trimTo = tops;

        // create inner clip offset from tops (unless pre-computed)
        if (!slice.offsets) {
            // POLY.expand(tops, offset, slice.z, slice.offsets = []);
            slice.offsets = geo.wasm.js.offset(tops, offset, slice.z);
        }

        let traces = POLY.flatten(slice.topShells().clone(true)),
            fill = slice.topFill(),
            points = [],
            down = slice.down,
            down_tops = down ? down.topPolys() : null,
            down_traces = down ? POLY.flatten(down.topShells().clone(true)) : null;

        if (opt.exp && down_tops) {
            let points = down_tops.map(p => p.deepLength).reduce((a,v)=>a+v);
            if (points > 200) {
                // use de-rez'd top shadow instead
                down_tops = down.topSimples();
                // de-rez trace polys because it's not that important for supports
                down_traces = down_traces.map(p => p.clean(true, undefined, CONF.clipper / 10));
            }
        }

        // check if point is supported by layer below
        function checkPointSupport(point) {
            // skip points close to other support points
            for (let i=0; i<points.length; i++) {
                if (point.distTo2D(points[i]) < size/4) return;
            }
            let supported = point.isInPolygonOnly(down_tops);
            if (!supported) down_traces.forEach(function(trace) {
                trace.forEachSegment(function(p1, p2) {
                    if (point.distToLine(p1, p2) <= offset) {
                        return supported = true;
                    }
                });
                return supported;
            });
            if (!supported) points.push(point);
        }

        // todo support entire line if both endpoints unsupported
        // segment line and check if midpoints are supported
        function checkLineSupport(p1, p2, poly) {
            let dist, i = 1;
            if ((dist = p1.distTo2D(p2)) >= maxBridge) {
                let slope = p1.slopeTo(p2).factor(1/dist),
                    segs = Math.floor(dist / maxBridge) + 1,
                    seglen = dist / segs;
                while (i < segs) {
                    checkPointSupport(p1.projectOnSlope(slope, i++ * seglen));
                }
            }
            if (poly) checkPointSupport(p2);
        }

        let supports = [];

        // generate support polys from unsupported points
        if (slice.down) (function() {
            // check trace line support needs
            traces.forEach(function(trace) {
                trace.forEachSegment(function(p1, p2) { checkLineSupport(p1, p2, true) });
            });

            // add offset solids to supports (or fill depending)
            fill.forEachPair(function(p1,p2) { checkLineSupport(p1, p2, false) });

            // skip the rest if no points or supports
            if (!(points.length || supports.length)) return;

            let pillars = [];

            // for each point, create a bounding rectangle
            points.forEach(function(point) {
                pillars.push(BASE.newPolygon().centerRectangle(point, size/2, size/2));
            });

            // merge pillars and replace with convex hull of outer points (aka smoothing)
            pillars = POLY.union(pillars, null, true).forEach(function(pillar) {
                supports.push(BASE.newPolygon().createConvexHull(pillar.points));
            });
        })();

        if (supports.length === 0) {
            return;
        }

        // then union supports
        if (supports.length > 10) {
            supports = await KIRI.minions.union(supports);
        } else {
            supports = POLY.union(supports, null, true);
        }

        // clip to top polys
        supports = POLY.trimTo(supports, shadow);

        let depth = 0;
        while (down && supports.length > 0) {
            down.supports = down.supports || [];

            let trimmed = [], culled = [];

            // clip supports to shell offsets
            POLY.subtract(supports, down.topSimples(), trimmed, null, slice.z, min, {
                prof: opt.prof,
                wasm: false
            });

            // set depth hint on support polys for infill density
            trimmed.forEach(function(trim) {
                // if (trim.area() < 0.1) return;
                culled.push(trim.setZ(down.z));
            });

            // exit when no more support polys exist
            if (culled.length === 0) break;

            // new bridge polys for next pass (skip first layer below)
            if (depth >= gap) {
                down.supports.appendAll(culled);
            }

            supports = culled;
            down = down.down;
            depth++;
        }
    }

    /**
     * @param {number} linewidth
     * @param {number} angle
     * @param {number} density
     * @param {number} offset
     */
    function doSupportFill(promises, slice, linewidth, density, minArea) {
        let supports = slice.supports,
            nsB = [],
            nsC = [],
            min = minArea || 0.1;

        if (!supports) return;

        // union supports
        supports = POLY.union(supports, undefined, true);

        // trim to clip offsets
        if (slice.offsets) {
            POLY.subtract(supports, slice.offsets, nsB, null, slice.z, min);
        }
        supports = nsB;

        // also trim to lower offsets, if they exist
        if (slice.down && slice.down.offsets) {
            POLY.subtract(nsB, slice.down.offsets, nsC, null, slice.z, min);
            supports = nsC;
        }

        if (supports) {
            fillSupportPolys(promises, supports, linewidth, density, slice.z);
        }

        // re-assign new supports back to slice
        slice.supports = supports;
    };

    function fillSupportPolys(promises, polys, linewidth, density, z) {
        // calculate fill density
        let spacing = linewidth * (1 / density);
        polys.forEach(function (poly) {
            // angle based on width/height ratio
            let angle = (poly.bounds.width() / poly.bounds.height() > 1) ? 90 : 0;
            // inset support poly for fill lines 33% of nozzle width
            let inset = POLY.offset([poly], -linewidth/3, {flat: true, z});
            // do the fill
            if (inset && inset.length > 0) {
                doFillArea(promises, inset, angle, spacing, poly.fill = []);
            }
            return true;
        });
    }

    /**
     *
     * @param {Slice} slice
     * @param {Polygon[]} polys
     * @param {number} count
     * @param {boolean} up
     * @param {boolean} first
     * @returns {*}
     */
    function projectSolid(slice, polys, count, up, first) {
        if (!slice || slice.isSolidLayer || count <= 0) {
            return;
        }
        let clones = polys.clone(true);
        if (first) {
            clones.forEach(function(p) {
                p.hintFillAngle();
            });
        }
        addSolidFills(slice, clones);
        if (count > 0) {
            if (up) projectSolid(slice.up, polys, count-1, true, false);
            else projectSolid(slice.down, polys, count-1, false, false);
        }
    }

    /**
     * given an array of arrays of points (lines), eliminate intersections
     * between groups, then return a unified array of shortest non-intersects.
     *
     * @returns {Point[]}
     */
    function cullIntersections() {
        function toLines(pts) {
            let lns = [];
            for (let i=0, il=pts.length; i<il; i += 2) {
                lns.push({a: pts[i], b: pts[i+1], l: pts[i].distTo2D(pts[i+1])});
            }
            return lns;
        }
        let aOa = [...arguments].filter(t => t);
        if (aOa.length < 1) return;
        let aa = toLines(aOa.shift());
        while (aOa.length) {
            let bb = toLines(aOa.shift());
            loop: for (let i=0, il=aa.length; i<il; i++) {
                let al = aa[i];
                if (al.del) {
                    continue;
                }
                for (let j=0, jl=bb.length; j<jl; j++) {
                    let bl = bb[j];
                    if (bl.del) {
                        continue;
                    }
                    if (UTIL.intersect(al.a, al.b, bl.a, bl.b, BASE.key.SEGINT)) {
                        if (al.l < bl.l) {
                            bl.del = true;
                        } else {
                            al.del = true;
                        }
                        continue;
                    }
                }
            }
            aa = aa.filter(l => !l.del).concat(bb.filter(l => !l.del));
        }
        let good = [];
        for (let i=0, il=aa.length; i<il; i++) {
            let al = aa[i];
            good.push(al.a);
            good.push(al.b);
        }
        return good.length > 2 ? good : [];
    }

    FDM.supports = function(settings, widget) {
        let isBelt = settings.device.bedBelt;
        let process = settings.process;
        let size = process.sliceSupportSize;
        let s4 = size / 4;
        let s2 = size * 0.45;
        let min = 0.01;
        let geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(widget.vertices, 3));
        let mat = new THREE.MeshBasicMaterial();
        let rad = (Math.PI / 180);
        let deg = (180 / Math.PI);
        let angle = rad * settings.process.sliceSupportAngle;
        let thresh = -Math.sin(angle);
        let dir = new THREE.Vector3(0,0,-1)
        let add = [];
        let mesh = new THREE.Mesh(geo, mat);
        let platform = new THREE.Mesh(
            new THREE.PlaneGeometry(1000,1000,1), mat
        );
        function pointIn(x, y, p1, p2, p3) {
            let det = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x)
            return det * ((p2.x - p1.x) * (y - p1.y) - (p2.y - p1.y) * (x - p1.x)) > 0 &&
                det * ((p3.x - p2.x) * (y - p2.y) - (p3.y - p2.y) * (x - p2.x)) > 0 &&
                det * ((p1.x - p3.x) * (y - p3.y) - (p1.y - p3.y) * (x - p3.x)) > 0
        }
        // first, last, distance
        function fld(arr, key) {
            let first = arr[0];
            let last = arr.last();
            let dist = last[key] - first[key];
            return { first, last, dist }
        }
        // sorted range distance from key
        function rdist(range, key) {
            return range.last[key] - range.first[key];
        }
        // test area
        function ta(p1, p2, p3) {
            let sortx = [p1,p2,p3].sort((a,b) => { return a.x - b.x });
            let sorty = [p1,p2,p3].sort((a,b) => { return a.y - b.y });
            let sortz = [p1,p2,p3].sort((a,b) => { return a.z - b.z });
            let xv = fld(sortx, 'x');
            let yv = fld(sorty, 'y');
            let xa = BASE.util.lerp(xv.first.x + s4, xv.last.x - s4, s2, true);
            let ya = BASE.util.lerp(yv.first.y + s4, yv.last.y - s4, s2, true);
            for (let x of xa) {
                for (let y of ya) {
                    if (pointIn(x, y, p1, p2, p3)) {
                        let z = BASE.util.zInPlane(p1, p2, p3, x, y);
                        tp(new THREE.Vector3(x, y, z));
                    }
                }
            }
        }
        // test poly
        function tP(poly, face) {
            let bounds = poly.bounds;
            let xa = BASE.util.lerp(bounds.minx + s4, bounds.maxx - s4, s2, true);
            let ya = BASE.util.lerp(bounds.miny + s4, bounds.maxy - s4, s2, true);
            for (let x of xa) {
                for (let y of ya) {
                    if (BASE.newPoint(x, y, 0).isInPolygon(poly)) {
                        let z = BASE.util.zInPlane(face[0], face[1], face[2], x, y);
                        tp(new THREE.Vector3(x, y, z));
                    }
                }
            }
        }
        // test point
        function tp(point) {
            if (point.added) {
                return;
            }
            // omit pillars close to existing pillars
            for (let added of add) {
                let p2 = new THREE.Vector2(point.x, point.y);
                let pm = new THREE.Vector2(added.mid.x, added.mid.y);
                if (Math.abs(point.z - added.from.z) < s2 && p2.distanceTo(pm) < s4) {
                    return;
                }
            }
            let ray = new THREE.Raycaster(point, dir);
            let int = ray.intersectObjects([ mesh, platform ], false);
            if (int && int.length && int[0].distance > 0.5) {
                let mid = new THREE.Vector3().add(point).add(int[0].point).divideScalar(2);
                add.push({from: point, to: int[0].point, mid});
                point.added = true;
            }
        }
        let filter = isBelt ? (norm) => {
            return norm.z <= thresh && norm.y < 0;
        } : (norm) => {
            return norm.z < thresh;
        };
        let { position } = geo.attributes;
        let { itemSize, count, array } = position;
        let v3cache = new Vector3Cache();
        let coplane = new Coplanars();
        for (let i = 0; i<count; i += 3) {
            let ip = i * itemSize;
            let a = v3cache.get(array[ip++], array[ip++], array[ip++]);
            let b = v3cache.get(array[ip++], array[ip++], array[ip++]);
            let c = v3cache.get(array[ip++], array[ip++], array[ip++]);
            let norm = THREE.computeFaceNormal(a,b,c);
            // limit to downward faces
            if (!filter(norm)) {
                continue;
            }
            // skip tiny faces
            let poly = BASE.newPolygon().addPoints([a,b,c].map(v => BASE.newPoint(v.x, v.y, v.z)));
            if (poly.area() < min && poly.perimeter() < size) {
                continue;
            }
            // skip faces on bed
            if (a.z + b.z + c.z < 0.01) {
                continue;
            }
            // match with other attached, coplanar faces
            coplane.put(a, b, c, norm.z);
        }
        let groups = coplane.group(true);
        // console.log({v3cache, coplane, groups});
        for (let group of Object.values(groups)) {
            for (let polys of group) {
                for (let poly of polys) {
                    if (poly.area() >= process.sliceSupportArea)
                    tP(poly, polys.face);
                }
            }
        }
        widget.supports = add;
        return add.length > 0;
    };

    class Vector3Cache {
        constructor() {
            this.cache = {};
        }

        get(x, y, z) {
            let key = [x.round(4),y.round(4),z.round(4)].join(',');
            let val = this.cache[key];
            if (!val) {
                val = new THREE.Vector3(x, y, z);
                this.cache[key] = val;
            }
            return val;
        }
    }

    class Coplanars {
        constructor() {
            this.cache = {};
        }

        put(a, b, c, norm) {
            let key = norm.round(7).toString();
            let arr = this.cache[key];
            if (!arr) {
                arr = [];
                this.cache[key] = arr;
            }
            arr.push([a,b,c]);
        }

        group(union) {
            let out = {};
            for (let norm in this.cache) {
                let arr = this.cache[norm];
                let groups = [];
                for (let face of arr) {
                    let match = undefined;
                    // see if face matches vertices in any group
                    outer: for (let group of groups) {
                        for (let el of group) {
                            if (
                                el.indexOf(face[0]) >= 0 ||
                                el.indexOf(face[1]) >= 0 ||
                                el.indexOf(face[2]) >= 0
                            ) {
                                match = group;
                                break outer;
                            }
                        }
                    }
                    if (match) {
                        match.push(face);
                    } else {
                        groups.push([face]);
                    }
                }
                if (union) {
                    // convert groups of faces to contiguous polygon groups
                    groups = groups.map(group => {
                        let parr = group.map(arr => {
                            return BASE.newPolygon()
                                .add(arr[0].x, arr[0].y, arr[0].z)
                                .add(arr[1].x, arr[1].y, arr[1].z)
                                .add(arr[2].x, arr[2].y, arr[2].z);
                        });
                        let union = POLY.union(parr, 0, true);
                        union.merged = parr.length;
                        union.face = group[0];
                        return union;
                    });
                }
                out[norm] = groups;
            }
            // console.log(out);
            return out;
        }
    }

})();
