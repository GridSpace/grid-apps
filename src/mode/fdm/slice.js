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
        debug = false;

    let isThin = false; // force line rendering
    let isFlat = false; // force flat rendering
    let offset = 0; // poly line generation offsets

    function vopt(opt) {
        if (opt) {
            if (isFlat) {
                opt.flat = true;
                opt.outline = true;
                return opt
            }
            if (isThin) return null;
        }
        return opt;
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
    FDM.slice = function(settings, widget, onupdate, ondone) {
        FDM.fixExtruders(settings);
        let render = settings.render !== false,
            ctrl = settings.controller,
            spro = settings.process,
            sdev = settings.device,
            isBelt = sdev.bedBelt,
            isSynth = widget.track.synth,
            update_start = Date.now(),
            minSolid = spro.sliceSolidMinArea,
            solidLayers = spro.sliceSolidLayers,
            vaseMode = spro.sliceFillType === 'vase' && !isSynth,
            doSolidLayers = solidLayers && !vaseMode && !isSynth,
            metadata = settings.widget[widget.id] || {},
            extruder = metadata.extruder || 0,
            sliceHeight = spro.sliceHeight,
            firstSliceHeight = isBelt ? sliceHeight : spro.firstSliceHeight,
            nozzleSize = sdev.extruders[extruder].extNozzle,
            lineWidth = nozzleSize,
            fillOffsetMult = 1.0 - bound(spro.sliceFillOverlap, 0, 0.8),
            firstWidthMult = spro.firstLayerShellMult || 1,
            shellOffset = lineWidth,
            fillSpacing = lineWidth,
            fillOffset = lineWidth * fillOffsetMult,
            sliceFillAngle = spro.sliceFillAngle,
            supportDensity = spro.sliceSupportDensity,
            view = widget.mesh && widget.mesh.newGroup ? widget.mesh.newGroup() : null,
            beltfact = Math.cos(Math.PI/4),
            invbfact = 1 / beltfact;

        isFlat = ctrl.lineType === "flat";
        isThin = !isFlat && ctrl.lineType === "line";
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

        if (firstSliceHeight === 0) {
            firstSliceHeight = sliceHeight;
        }

        const sliceMinHeight = spro.sliceAdaptive && spro.sliceMinHeight > 0 ?
            Math.min(spro.sliceMinHeight, sliceHeight) : 0;

        if (firstSliceHeight < sliceHeight) {
            DBUG.log("invalid first layer height < slice height");
            DBUG.log("reverting to min valid slice height");
            firstSliceHeight = sliceMinHeight || sliceHeight;
        }

        // const slicer = new KIRI.slicer2(widget.getPoints(), { });
        // const levels = slicer.interval(sliceHeight, {
        //     zlist: true,
        //     zline: true,
        //     boff: spro.firstSliceHeight || spro.sliceHeight
        // });
        // const slices = [];
        // let last;
        // slicer.slice(levels, { genso: true, each: (data, idx, tot, time) => {
        //     const slice = data.slice;
        //     if (last) {
        //         slice.down = last;
        //         last.up = slice;
        //     }
        //     last = slice;
        //     slice.index = idx;
        //     slice.height = spro.firstSliceHeight || spro.sliceHeight;
        //     slices.push(slice);
        //     onupdate((idx / tot) * 0.5);
        // } });
        // onSliceDone(slices);

        SLICER.sliceWidget(widget, {
            height: sliceHeight,
            minHeight: sliceMinHeight,
            firstHeight: firstSliceHeight,
            union: ctrl.healMesh,
            // debug: true,
            // xray: 3,
            // view: view
        }, onSliceDone, onSliceUpdate);

        function onSliceUpdate(update) {
            return onupdate(0.0 + update * 0.5);
        }

        function onSliceDone(slices) {
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
                    let gap = sliceHeight * (isBelt ? 0 : spro.sliceSupportGap);
                    // clip tops to other widgets in group
                    tops = slice.topPolys();
                    for (let peer of widget.group) {
                        // skip self
                        if (peer === widget) {
                            continue;
                        }
                        for (let pslice of peer.slices) {
                            if (Math.abs(Math.abs(pslice.z - slice.z) - gap) > 0.1) {
                                continue;
                            }
                            // offset pslice tops by spro.sliceSupportOffset
                            if (!pslice.synth_off) {
                                pslice.synth_off = POLY.offset(pslice.topPolys(), spro.sliceSupportOffset);
                            }
                            let ptops = pslice.synth_off;
                            let ntops = [];
                            POLY.subtract(tops, ptops, ntops, null, slice.z, 0);
                            tops = ntops;
                        }
                        // trim to group's shadow if not in belt mode
                        if (!isBelt) {
                            let group = widget.group[0];
                            if (!group.shadow) {
                                let gs = [];
                                for (let w of group) {
                                    if (w.shadow) {
                                        gs = POLY.union([w.shadow,...gs],null,0.1);
                                    }
                                }
                                group.shadow = gs;
                            }
                            tops = POLY.setZ(POLY.trimTo(tops, group.shadow), slice.z);
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
                onupdate(0.5 + (from + ((index/slices.length) * (to-from))) * 0.5, msg);
            }

            // for each slice, performe a function and call doupdate()
            function forSlices(from, to, fn, msg) {
                slices.forEach(slice => {
                    fn(slice);
                    doupdate(slice.index, from, to, msg)
                });
            }

            // do not hint polygin fill longer than a max span length
            CONF.hint_len_max = UTIL.sqr(spro.sliceBridgeMax);

            // reset for solids, support projections
            // and other annotations
            slices.forEach(slice => {
                slice.widget = widget;
                slice.extruder = extruder;
                slice.solids = [];
            });

            // create shadow for clipping supports
            let shadow = null;
            if (true || spro.sliceSupportEnable) {
                let alltops = slices.map(slice => slice.topPolys()).flat();
                shadow = POLY.union(alltops,null,0.1);
                if (spro.sliceSupportExtra) {
                    shadow = POLY.offset(shadow, spro.sliceSupportExtra);
                }
                widget.shadow = shadow;
                // slices[0].output()
                //     .setLayer('shadow', { line: 0xff0000, check: 0xff0000 })
                //     .addPolys(shadow);
            }

            // create shells and diff inner fillable areas
            forSlices(0.0, 0.2, slice => {
                let params = getRangeParameters(settings, slice.index);
                let shellFrac = (params.sliceShells - (params.sliceShells | 0));
                let sliceShells = params.sliceShells | 0;
                if (ctrl.danger && shellFrac) {
                    let v1 = shellFrac > 0.5 ? 1 - shellFrac : shellFrac;
                    let v2 = 1 - v1;
                    let parts = Math.round(v2/v1) + 1;
                    let rem = slice.index % parts;
                    let trg = shellFrac > 0.5 ? 1 : parts - 1;
                    sliceShells += rem >= trg ? 1 : 0;
                }
                let first = slice.index === 0;
                let isBottom = slice.index < spro.sliceBottomLayers;
                let isTop = slice.index > slices.length - spro.sliceTopLayers-1;
                let isDense = params.sliceFillSparse > 0.98;
                let solid = (isBottom || ((isTop || isDense) && !vaseMode)) && !isSynth;
                let solidWidth = params.sliceFillWidth || 1;
                let spaceMult = first ? spro.firstLayerLineMult || 1 : 1;
                let offset = shellOffset * spaceMult;
                let fillOff = fillOffset * spaceMult;
                let count = isSynth ? 1 : sliceShells;
                doShells(slice, count, offset, fillOff, {
                    vase: vaseMode,
                    thin: spro.detectThinWalls && !isSynth,
                    widget: widget,
                    danger: ctrl.danger
                });
                if (solid) {
                    let fillSpace = fillSpacing * spaceMult * solidWidth;
                    doSolidLayerFill(slice, fillSpace, sliceFillAngle);
                }
                sliceFillAngle += 90.0;
            }, "offsets");

            // add lead in when specified in belt mode
            if (!isSynth && isBelt) {
                let wb = widget.bounds;
                // find adjusted zero point from slices
                let smin = Infinity;
                for (let slice of slices) {
                    let miny = Infinity;
                    for (let poly of slice.topPolys()) {
                        let y = poly.bounds.maxy;
                        let z = slice.z;
                        let by = -y + z;
                        if (by < miny) miny = by;
                        if (by < smin) smin = by;
                    }
                    slice.belt = { miny, touch: false };
                }
                // mark slices with tops touching belt
                // also find max width of first 5 layers
                let start;
                let minx = Infinity, maxx = -Infinity;
                for (let slice of slices) {
                    if (slice.index < 5) {
                        for (let poly of slice.topPolys()) {
                            minx = Math.min(minx, poly.bounds.minx);
                            maxx = Math.max(maxx, poly.bounds.maxx);
                        }
                    }
                    if (Math.abs(slice.belt.miny - smin) < 0.001) {
                        slice.belt.touch = true;
                        if (!start) start = slice;
                    }
                }
                // console.log({smin: smin.round(4)});
                let offset = spro.firstLayerBeltLead * beltfact;
                // ensure we start against a layer with shells
                while (start.up && start.topShells().length === 0) {
                    start = start.up;
                }
                while (offset && start && offset >= sliceHeight) {
                    let addto = start.down;
                    if (!addto) {
                        addto = newSlice(start.z - sliceHeight);
                        addto.belt = { };
                        addto.height = start.height;
                        addto.up = start;
                        start.down = addto;
                        slices.splice(0,0,addto);
                    }
                    addto.index = -1;
                    addto.belt.anchor = true;
                    let z = addto.z;
                    let y = z - smin - (nozzleSize / 2);
                    // let splat = BASE.newPolygon().add(wb.min.x, y, z).add(wb.max.x, y, z).setOpen();
                    let splat = BASE.newPolygon().add(minx, y, z).add(maxx, y, z).setOpen();
                    addto.addTop(splat).fill_sparse = [ splat ];
                    start = addto;
                    offset -= sliceHeight;
                }
            }

            // calculations only relevant when solid layers are used
            if (doSolidLayers) {
                forSlices(0.2, 0.34, slice => {
                    if (slice.index > 0) doDiff(slice, minSolid);
                }, "diff");
                forSlices(0.34, 0.35, slice => {
                    projectFlats(slice, solidLayers);
                    projectBridges(slice, solidLayers);
                }, "solids");
                forSlices(0.35, 0.5, slice => {
                    let params = getRangeParameters(settings, slice.index);
                    let first = slice.index === 0;
                    let solidWidth = params.sliceFillWidth || 1;
                    let spaceMult = first ? params.firstLayerLineMult || 1 : 1;
                    let fillSpace = fillSpacing * spaceMult * solidWidth;
                    doSolidsFill(slice, fillSpace, sliceFillAngle, minSolid);
                    sliceFillAngle += 90.0;
                }, "solids");
            }

            // sparse layers only present when non-vase mose and sparse % > 0
            if (!isSynth) {
                let lastType;
                forSlices(0.5, 0.7, slice => {
                    let params = getRangeParameters(settings, slice.index);
                    if (vaseMode || !params.sliceFillSparse) {
                        return;
                    }
                    let newType = params.sliceFillType;
                    doSparseLayerFill(slice, {
                        settings: settings,
                        process: spro,
                        device: sdev,
                        lineWidth: lineWidth,
                        spacing: fillOffset,
                        density: params.sliceFillSparse,
                        bounds: widget.getBoundingBox(),
                        height: sliceHeight,
                        type: newType,
                        cache: params._range !== true && lastType === newType
                    });
                    lastType = newType;
                }, "infill");
            } else if (isSynth) {
                forSlices(0.5, 0.7, slice => {
                    let params = getRangeParameters(settings, slice.index);
                    let density = params.sliceSupportDensity;
                    if (density)
                    for (let top of slice.tops) {
                        let offset = [];
                        POLY.expand(top.shells, -nozzleSize/4, slice.z, offset);
                        fillSupportPolys(offset, lineWidth, density, slice.z);
                        top.fill_lines = offset.map(o => o.fill).flat().filter(v => v);
                    }
                }, "infill");
            }

            // auto support generation
            if (!isBelt && !isSynth && supportDensity && spro.sliceSupportEnable) {
                forSlices(0.7, 0.8, slice => {
                    doSupport(slice, spro, shadow);
                }, "support");
                forSlices(0.8, 0.9, slice => {
                    doSupportFill(slice, lineWidth, supportDensity, spro.sliceSupportArea);
                }, "support");
            }

            // render if not explicitly disabled
            if (render) {
                forSlices(0.9, 1.0, slice => {
                    let params = getRangeParameters(settings, slice.index);
                    doRender(slice, isSynth, params);
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

            // report slicing complete
            ondone();
        }

    }

    function bound(v,min,max) {
        return Math.max(min,Math.min(max,v));
    }

    function doRender(slice, isSynth, params) {
        const output = slice.output();
        const height = slice.height / 2;
        const solidWidth = params.sliceFillWidth || 1;

        slice.tops.forEach(top => {
            if (isThin) output
                .setLayer('slice', { line: 0x000066, check: 0x000066 })
                .addPolys(top.poly);

            if (top.shells) output
                .setLayer("shells", isSynth ? COLOR.support : COLOR.shell)
                .addPolys(top.shells, vopt({ offset, height }));

            if (top.gaps) output
                .setLayer("gaps", COLOR.gaps)
                .addPolys(top.gaps, vopt({ offset, height, thin: true }));

            if (isThin && debug) {
                slice.output()
                    .setLayer('offset', { face: 0, line: 0x888888 })
                    .addPolys(top.fill_off)
                    .setLayer('last', { face: 0, line: 0x008888 })
                    .addPolys(top.last);
            }

            if (top.fill_lines && top.fill_lines.length) output
                .setLayer("fill", isSynth ? COLOR.support : COLOR.fill)
                .addLines(top.fill_lines, vopt({ offset: offset * solidWidth, height }));

            if (top.fill_sparse) output
                .setLayer("infill", COLOR.infill)
                .addPolys(top.fill_sparse, vopt({ offset, height, outline: true }))

            if (top.thin_fill) output
                .setLayer("fill", COLOR.fill)
                .addLines(top.thin_fill, vopt({ offset, height }));
        });

        if (isThin && debug) {
            if (slice.solids) output
                .setLayer("solids", { face: 0x00dd00 })
                .addAreas(slice.solids);

            if (slice.bridges) output
                .setLayer("bridges", { face: 0x00aaaa, line: 0x00aaaa })
                .addAreas(slice.bridges);

            if (slice.flats) output
                .setLayer("flats", { face: 0xaa00aa, line: 0xaa00aa })
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

    // shared with SLA driver
    FDM.share = {
        doShells,
        doDiff,
        projectFlats,
        projectBridges,
        doSolidsFill
    };

    /**
     * Compute offset shell polygons. For FDM, the first offset is usually half
     * of the nozzle width.  Each subsequent offset is a full nozzle width.  User
     * parameters control tweaks to these numbers to allow for better shell bonding.
     * The last shell generated is a "fillOffset" shell.  Fill lines are clipped to
     * this polygon.  Adjusting fillOffset controls bonding of infill to the shells.
     *
     * @param {number} count
     * @param {number} offsetN
     * @param {number} fillOffset
     * @param {Obejct} options
     */
    function doShells(slice, count, offsetN, fillOffset, opt = {}) {
        let offset1 = offsetN / 2;
        let shellout = 0;

        slice.tops.forEach(function(top) {
            let top_poly = [ top.poly ];

            if (slice.index === 0) {
                // console.log({slice_top_0: top_poly, count});
                // segment polygon
            }

            if (opt.vase) {
                // remove top poly inners in vase mode
                top.poly = top.poly.clone(false);
            }

            top.shells = [];
            top.fill_off = [];
            top.fill_lines = [];

            let last = [],
                gaps = [],
                z = top.poly.getZ();

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
                    POLY.subtract(last, gaps, nulast, null, slice.z);
                    last = nulast;
                }
                last.forEach(function(inner) {
                    POLY.offset([inner], -fillOffset, {outs: top.fill_off, flat: true, z: slice.z});
                });
            }

            // for diffing
            top.last = last;

            shellout += top.shells.length;
        });
    };

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
    function doSparseLayerFill(slice, options) {
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
                // output functions
                emit: function(x,y) {
                    if (isNaN(x)) {
                        solids.push(x);
                    } else {
                        line.push(newPoint(x,y,slice.z));
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
        tops.forEach(function(top) {
            top.fill_sparse = top.fill_sparse || [];
            polys.appendAll(top.fill_off);
            polys.appendAll(top.solids);
        });

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
            tops.forEach(top => {
                if (!top.fill_off) return;
                let masks = top.fill_off.slice();
                if (top.solids) {
                    masks = POLY.subtract(masks, top.solids, [], null, slice.z);
                }
                let angl = process.sliceFillAngle * ((slice.index % 2) + 1);
                solids.forEach(solid => {
                    let inter = [],
                        fillable = [];
                    masks.forEach(mask => {
                        let p = solid.mask(mask);
                        if (p && p.length) inter.appendAll(p);
                    });
                    // offset fill area to accommodate trace
                    if (inter.length) {
                        POLY.expand(inter, -options.lineWidth/2, slice.z, fillable);
                    }
                    // fill intersected areas
                    if (inter.length) {
                        slice.isSparseFill = true;
                        inter.forEach(p => {
                            p.forEachSegment((p1, p2) => {
                                top.fill_lines.push(p1, p2);
                            });
                        });
                    }
                    if (fillable.length) {
                        let lines = POLY.fillArea(fillable, angl, options.lineWidth);
                        top.fill_lines.appendAll(lines);
                    }
                });
            });
        }

        // if only solids were added and no lines to clip
        if (!sparse_clip) {
            return;
        }

        clip.AddPaths(lines, ptyp.ptSubject, false);
        clip.AddPaths(POLY.toClipper(polys), ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftNonZero, cfil.pftEvenOdd)) {
            ctre.m_AllPolys.forEach(function(node) {
                poly = POLY.fromClipperNode(node, slice.z);
                tops.forEach(function(top) {
                    // use only polygons inside this top
                    if (poly.isInside(top.poly)) {
                        top.fill_sparse.push(poly);
                    }
                });
            });
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
    function doSolidsFill(slice, spacing, angle, minArea) {

        const render = slice.output();

        let minarea = minArea || 1,
            tops = slice.tops,
            solids = slice.solids;

        if (!(tops && solids)) {
            return;
        }

        let unioned = POLY.union(solids, undefined, true).flat(), // TODO verify
            isSLA = (spacing === undefined && angle === undefined);

        if (solids.length === 0) return false;
        if (unioned.length === 0) return false;

        let trims = [],
            inner = isSLA ? slice.topPolys() : slice.topFillOff();

        // trim each solid to the inner bounds
        unioned.forEach(function(p) {
            p.setZ(slice.z);
            inner.forEach(function(i) {
                let masks = p.mask(i);
                if (masks && masks.length > 0) {
                    trims.appendAll(masks);
                }
            });
        });

        // clear old solids and make array for new
        tops.forEach(top => { top.solids = [] });

        // replace solids with merged and trimmed solids
        slice.solids = solids = trims;

        // parent each solid polygon inside the smallest bounding top
        solids.forEach(function(solid) {
            tops.forEach(function(top) {
                if (top.poly.overlaps(solid)) {
                    if (!solid.parent || solid.parent.area() > top.poly.area()) {
                        if (solid.areaDeep() < minarea) {
                            // console.log({i:slice.index,cull_solid:solid,area:solid.areaDeep()});
                            return;
                        }
                        solid.parent = top.poly;
                        top.solids.push(solid);
                    }
                }
            });
        });

        // for SLA to bypass line infill
        if (isSLA) {
            return true;
        }

        // create empty filled line array for each top
        tops.forEach(function(top) {
            // synth belt anchor tops don't want fill
            if (!top.fill_lines) {
                return;
            }
            const tofill = [];
            const angfill = [];
            const newfill = [];
            // determine fill orientation from top
            solids.forEach(function(solid) {
                if (solid.parent === top.poly) {
                    if (solid.fillang) {
                        angfill.push(solid);
                    } else {
                        tofill.push(solid);
                    }
                }
            });
            if (tofill.length > 0) {
                fillArea(tofill, angle, spacing, newfill);
                top.fill_lines_norm = {angle:angle,spacing:spacing};
            }
            if (angfill.length > 0) {
                top.fill_lines_ang = {spacing:spacing,list:[],poly:[]};
                angfill.forEach(function(af) {
                    fillArea([af], af.fillang.angle + 45, spacing, newfill);
                    top.fill_lines_ang.list.push(af.fillang.angle + 45);
                    top.fill_lines_ang.poly.push(af.clone());
                });
            }
            top.fill_lines.appendAll(newfill);
        });

        return true;
    };

    /**
     * calculate external overhangs requiring support
     */
    function doSupport(slice, proc, shadow) {
        let maxBridge = proc.sliceSupportSpan || 5,
            minArea = proc.supportMinArea,
            pillarSize = proc.sliceSupportSize,
            offset = proc.sliceSupportOffset,
            gap = proc.sliceSupportGap,
            min = minArea || 0.01,
            size = (pillarSize || 1),
            mergeDist = size * 3, // pillar merge dist
            tops = slice.topPolys(),
            trimTo = tops;

        // create inner clip offset from tops
        POLY.expand(tops, offset, slice.z, slice.offsets = []);

        let traces = POLY.flatten(slice.topShells().clone(true)),
            fill = slice.topFill(),
            points = [],
            down = slice.down,
            down_tops = down ? down.topPolys() : null,
            down_traces = down ? POLY.flatten(down.topShells().clone(true)) : null;

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
        supports = POLY.union(supports, null, true);

        // clip to top polys
        supports = POLY.trimTo(supports, shadow);

        let depth = 0;
        while (down && supports.length > 0) {
            down.supports = down.supports || [];

            let trimmed = [], culled = [];

            // clip supports to shell offsets
            POLY.subtract(supports, down.topPolys(), trimmed, null, slice.z, min);

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
    function doSupportFill(slice, linewidth, density, minArea) {
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
            fillSupportPolys(supports, linewidth, density, slice.z);
        }

        // re-assign new supports back to slice
        slice.supports = supports;
    };

    function fillSupportPolys(polys, linewidth, density, z) {
        // calculate fill density
        let spacing = linewidth * (1 / density);
        polys.forEach(function (poly) {
            // angle based on width/height ratio
            let angle = (poly.bounds.width() / poly.bounds.height() > 1) ? 90 : 0;
            // inset support poly for fill lines 33% of nozzle width
            let inset = POLY.offset([poly], -linewidth/3, {flat: true, z});
            // do the fill
            if (inset && inset.length > 0) {
                fillArea(inset, angle, spacing, poly.fill = []);
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
        let min = process.sliceSupportArea || 1;
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
        function tl(p1, p2) {
            let dist = p1.distanceTo(p2);
            let mp = new THREE.Vector3().add(p1).add(p2).divideScalar(2);
            if (dist >= size * 3) {
                tp(p1);
                tp(p2);
                let itr = Math.floor(dist / size);
                let seg = p2.clone().sub(p1).divideScalar(itr);
                let pnt = p1.clone();
                while (itr-- > 0) {
                    pnt.add(seg);
                    tp(pnt.clone());
                }
            } else if (dist >= size * 2) {
                tp(p1);
                tp(p2);
                tp(mp);
            } else if (dist >= size) {
                tp(p1);
                tp(p2);
            }
        }
        function tp(point) {
            if (point.added) {
                return;
            }
            for (let added of add) {
                let p2 = new THREE.Vector2(point.x, point.y);
                let pm = new THREE.Vector2(added.mid.x, added.mid.y);
                if (p2.distanceTo(pm) < 1) {
                    return;
                }
            }
            let ray = new THREE.Raycaster(point, dir);
            let int = ray.intersectObjects([ mesh, platform ], false);
            if (int && int.length && int[0].distance > 0.01) {
                let mid = new THREE.Vector3().add(point).add(int[0].point).divideScalar(2);
                add.push({from: point, to: int[0].point, mid});
                point.added = true;
            }
        }
        let filter = isBelt ? (norm) => {
            return norm.z < thresh && norm.y < -0.001;
        } : (norm) => {
            return norm.z < thresh;
        };
        let { position } = geo.attributes;
        let { itemSize, count, array } = position;
        for (let i = 0; i<count; i += 3) {
            let ip = i * itemSize;
            let a = new THREE.Vector3(array[ip++], array[ip++], array[ip++]);
            let b = new THREE.Vector3(array[ip++], array[ip++], array[ip++]);
            let c = new THREE.Vector3(array[ip++], array[ip++], array[ip++]);
            let norm = THREE.computeFaceNormal(a,b,c);
            // limit to downward faces
            if (!filter(norm)) {
                continue;
            }
            // skip tiny faces
            let area = BASE.newPolygon().addPoints([a,b,c]).area();
            if (BASE.newPolygon().addPoints([a,b,c]).area() < min) {
                continue;
            }
            tp(new THREE.Vector3().add(a).add(b).add(c).divideScalar(3));
            tl(a,b);
            tl(b,c);
            tl(a,c);
        }
        widget.supports = add;
        return add.length > 0;
    };

})();
