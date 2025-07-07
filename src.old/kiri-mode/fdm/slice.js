/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.slicer
// dep: geo.polygons
// dep: kiri.utils
// dep: kiri.consts
// dep: kiri-mode.fdm.driver
// dep: kiri-mode.fdm.post
// use: kiri-mode.fdm.fill
// use: ext.clip2
// use: add.three
gapp.register("kiri-mode.fdm.slice", [], (root, exports) => {

const { base, kiri, noop } = root;
const { consts, driver, fill, fill_fixed, newSlice, utils } = kiri;
const { config, polygons, util, newPoint } = base;
const { fillArea } = polygons;
const { FDM } = driver;
const { doTopShells, getRangeParameters } = FDM;

const POLY = polygons,
    tracker = util.pwait,
    lopacity = 0.6,
    opacity = 1,
    fat = 1.5,
    COLOR = {
        anchor: { check: 0x999933, face: 0x999933, line: 0x999933, opacity, lopacity, fat },
        fill: { check: 0x00bb77, face: 0x00bb77, line: 0x00bb77, opacity, lopacity, fat },
        gaps: { check: 0xaa3366, face: 0xaa3366, line: 0xaa3366, opacity, lopacity, fat },
        infill: { check: 0x3322bb, face: 0x3322bb, line: 0x3322bb, opacity, lopacity, fat },
        inset: { line: 0xaaaaaa, check: 0xaaaaaa, face: 0 },
        shell: { check: 0x0077bb, face: 0x0077bb, line: 0x0077bb, opacity, lopacity, fat },
        support: { check: 0xaa5533, face: 0xaa5533, line: 0xaa5533, opacity, lopacity, fat },
        part: { line: 0x333333, check: 0x333333 },
        thin: { check: 0xbb8800, face: 0xbb8800, line: 0xbb8800, opacity, lopacity, fat },
    },
    COLOR_DARK = Object.assign({}, COLOR, {
        fill: { check: 0x008855, face: 0x008855, line: 0x008855, opacity, lopacity, fat },
        infill: { check: 0x3322bb, face: 0x3322bb, line: 0x3322bb, opacity, lopacity, fat },
        inset: { line: 0x555555, check: 0x555555 },
        part: { line: 0x777777, check: 0x777777, face: 0  },
        thin: { check: 0xbb8800, face: 0xbb8800, line: 0xbb8800, opacity, lopacity, fat },
    }),
    PROTO = Object.clone(COLOR),
    profile = false,
    profileStart = profile ? console.profile : noop,
    profileEnd = profile ? console.profileEnd : noop,
    debug = false;

let isThin = false, // force line rendering
    isFlat = false, // force flat rendering
    offset = 0;     // poly line generation offsets

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

FDM.sliceAll = function(settings, onupdate) {
    // future home of brim and anchor generation
    let widgets = Object.values(kiri.worker.cache)
        .filter(w => !w.meta.disabled)
        .sort((a,b) => {
            return a.slices[0].z - b.slices[0].z
        });
    // assign grid_id which can be embedded in gcode and
    // used by the controller to cancel objects during print
    let { bounds } = settings;
    for (let widget of widgets) {
        let { pos, box } = widget.track;
        // calculate top/left coordinate for widget
        // relative to bounding box for all widgets
        let tl = {
            x: Math.round((pos.x - box.w/2 - bounds.min.x) / 10) + 1,
            y: Math.round((pos.y - box.h/2 - bounds.min.y) / 10) + 1
        };
        widget.track.grid_id = tl.x * 100 + tl.y;
    }
    // count extruders used
    let ext = [];
    for (let w of widgets) {
        if (w.anno && w.anno.extruder >= 0) {
            let e = w.anno.extruder;
            if (ext.indexOf(e) < 0) {
                ext.push(e);
            }
        }
    }
    // sort widgets by first slice Z
    widgets.sort((a,b) => {
        return a.slices[0].z - b.slices[0].z;
    });
    // give first widget a pass since it should have the anchor
    widgets.shift();
    // remove anchor slices from other widgets (only with multi-material)
    if (ext.length > 1) {
        for (let w of widgets) {
            w.slices = w.slices.filter(s => s.index >= 0);
        }
    }
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
    let render = settings.render !== false,
        { process, device, controller } = settings,
        isBelt = device.bedBelt,
        isBrick = controller.devel && process.sliceZInterleave,
        isSynth = widget.track.synth,
        isSupport = widget.track.support,
        useAssembly = controller.assembly,
        isConcurrent = controller.threaded && kiri.minions.concurrent,
        topLayers = process.sliceTopLayers || 0,
        bottomLayers = process.sliceBottomLayers || 0,
        vaseMode = process.sliceFillType === 'vase' && !isSynth,
        metadata = widget.anno,
        maxtruder = Math.max(0, device.extruders.length - 1),
        extruder = Math.min(maxtruder, parseInt(isSynth ? process.sliceSupportNozzle : metadata.extruder || 0)),
        sliceHeight = process.sliceHeight,
        sliceHeightBase = (isBelt ? sliceHeight : process.firstSliceHeight) || sliceHeight,
        lineWidth = process.sliceLineWidth || device.extruders[extruder].extNozzle,
        fillOffsetMult = 1.0 - bound(process.sliceFillOverlap, 0, 0.8),
        shellOffset = lineWidth,
        fillSpacing = lineWidth,
        fillOffset = lineWidth * fillOffsetMult,
        clipOffset = process.sliceSupportOffset,
        sliceFillAngle = process.sliceFillAngle,
        supportDensity = process.sliceSupportDensity;

    // override globals used by vopt()
    isFlat = controller.lineType === "flat";
    isThin = !isFlat && controller.lineType === "line";
    offset = lineWidth / 2;

    // allow overriding support fill auto angle algorithm
    // also causes support fill to be aligned on start boundaries
    // best with angles that are a multiple of 90 degrees
    if (process.sliceSupportFill >= 0) {
        // yes, an ugly hack to allow it to pass through old code paths
        process.sliceSupportFill += 1000;
    }

    if (isFlat) {
        Object.values(COLOR).forEach(color => {
            color.flat = true;
            color.line = 1
            color.opacity = 1;
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
    if (!(lineWidth >= 0.01 && lineWidth < 100)) {
        return ondone("invalid nozzle size");
    }

    const sliceMinHeight = process.sliceAdaptive && process.sliceMinHeight > 0 ?
        Math.min(process.sliceMinHeight, sliceHeight) : 0;

    if (sliceHeightBase <= 0) {
        console.log("invalid first layer height < slice height");
        console.log("reverting to min valid slice height");
        sliceHeightBase = sliceMinHeight || sliceHeight;
    }

    let bounds = widget.getBoundingBox();
    let points = widget.getPoints();
    let indices = [];
    let heights = [];
    let healed = false;

    // handle z cutting (floor method) and base flattening
    let zPress = isBelt ? process.firstLayerFlatten || 0 : 0;
    let zCut = widget.track.zcut || 0;
    let { belt } = widget;
    if (zCut || zPress) {
        for (let p of points) {
            if (!p._z) {
                p._z = p.z;
                if (zPress) {
                    if (isBelt) {
                        let zd = (belt.slope * p.z) - p.y;
                        if (zd > 0 && zd <= zPress) {
                            p.y += zd * belt.cosf;
                            p.z -= zd * belt.sinf;
                        }
                    } else {
                        if (p.z <= zPress) p.z = 0;
                    }
                }
                if (zCut && !isBelt) {
                    p.z -= zCut;
                }
            }
        }
    }

    base.slice(points, {
        debug: process.xray,
        xray: process.xray,
        zMin: bounds.min.z,
        zMax: bounds.max.z - zCut,
        // support/synth usually has overlapping boxes
        union: controller.healMesh || isSynth,
        indices: process.indices || process.xray,
        useAssembly,
        post: 'FDM',
        post_args: {
            shellOffset,
            fillOffset,
            clipOffset,
            lineWidth,
            vaseMode,
            isSynth,
            process,
        },
        // z index generator
        zGen(zopt) {
            if (process.xray) {
                return zopt.zIndexes;
            }
            let { zMin, zMax } = zopt;
            let h1 = sliceHeight;
            let h0 = sliceHeightBase || h1;
            let hm = sliceMinHeight || 0;
            let h = h0;
            let z = h0;
            let zi = indices; // indices
            let zh = heights; // heights
            if (hm) {
                // adaptive increments based on z indices (var map to legacy code)
                let zIncFirst = h0;
                let zInc = h1;
                let zIncMin = hm;
                let zHeights = heights;
                let zIndexes = indices;
                let zOrdered = Object.values(zopt.zIndexes).map(v => parseFloat(v));
                // console.log('adaptive slicing', zIncMin, ':', zInc, 'from', zMin, 'to', zMax);
                let zPos = zIncFirst,
                    zOI = 0,
                    zDelta,
                    zDivMin,
                    zDivMax,
                    zStep,
                    nextZ,
                    lzp = zPos;
                // adaptive slice height
                // first slice/height is fixed from base
                zHeights.push(zIncFirst);
                zIndexes.push(zIncFirst);
                // console.log({zIncFirst, zOrdered})
                while (zPos < zMax && zOI < zOrdered.length) {
                    nextZ = zOrdered[zOI++];
                    if (zPos >= nextZ) {
                        // console.log('skip',{zPos},'>=',{nextZ});
                        continue;
                    }
                    zDelta = nextZ - zPos;
                    if (zDelta < zIncMin) {
                        // console.log('skip',{zDelta},'<',{zIncMin});
                        continue;
                    }
                    zDivMin = Math.floor(zDelta / zIncMin);
                    zDivMax = Math.floor(zDelta / zInc);
                    if (zDivMax && zDivMax <= zDivMin) {
                        if (zDelta % zInc > 0.01) zDivMax++;
                        zStep = zDelta / zDivMax;
                        // console.log(`--- zDivMax <= zDivMin ---`, zStep, zDelta % zInc)
                    } else {
                        zStep = zDelta;
                    }
                    // console.log({nextZ, zPos, zDelta, zStep, zDivMin, zDivMax})
                    while (zPos < nextZ) {
                        zHeights.push(zStep);
                        zIndexes.push(zPos + zStep);
                        zPos += zStep;
                        // console.log({D: zPos - lzp, zPos})
                        // lzp = zPos;
                    }
                }
                // console.log({zIndexes, zHeights});
            } else {
                // simple based + fixed increment
                while (true) {
                    // reduce slice position by half layer height
                    let realz = (z - (h / 2)).round(3);
                    if (realz > zMax) {
                        break;
                    }
                    zh.push(h);
                    zi.push(realz);
                    h = h1;
                    z += h;
                }
            }
            return zi;
        },
        // slicer function (worker local or minion distributed)
        slicer(z, points, opts) {
            // opts.debug = opts.debug || isSynth;
            return (isConcurrent ? kiri.minions.sliceZ : base.sliceZ)(z, points, opts);
        },
        onupdate(update) {
            return onupdate(0.0 + update * 0.5)
        }
    }).then((output) => {
        // post process slices and re-incorporate missing meta-data
        return output.slices.map(data => {
            let { z, clip, lines, groups, changes } = data;
            if (!data.tops) return null;
            let slice = newSlice(z).addTops(data.tops);
            slice.index = indices.indexOf(z);
            slice.height = heights[slice.index];
            slice.clips = clip;
            // do not warn on merging supports
            if (changes && !isSynth) {
                healed = true;
                slice.changes = changes;
                if (self.debug) {
                    console.log('slice healed', slice.index, slice.z, changes);
                }
            }
            if (process.xray) {
                slice.index = process.xrayi.shift();
                slice.lines = lines;
                slice.groups = groups;
                slice.xray = process.xray;
            }
            return slice;
        }).filter(s => s);
    }).then(slices => {
        return onSliceDone(slices);
    }).then(ondone);

    // shadow used to clip supports in non-belt mode
    async function doShadow(slices) {
        if (widget.shadow) {
            return;
        }
        let root = widget.group[0];
        if (root.shadow) {
            widget.shadow = root.shadow;
            return;
        }
        // console.log({ doShadow: widget, slices });
        // create shadow for clipping supports
        let alltops = widget.group
            .filter(w => !w.track.synth) // no supports in shadow
            .map(w => w.slices).flat()
            .map(s => s.tops).flat().map(t => t.simple);
        let shadow = isConcurrent ?
            await kiri.minions.union(alltops, 0.1) :
            POLY.union(alltops, 0.1, true);
        // expand shadow when requested (support clipping)
        if (process.sliceSupportExtra) {
            shadow = POLY.offset(shadow, process.sliceSupportExtra);
        }
        widget.shadow = root.shadow = POLY.setZ(shadow, 0);
        // slices[0].output()
        //     .setLayer('shadow', { line: 0xff0000, check: 0xff0000 })
        //     .addPolys(shadow);
    }

    async function onSliceDone(slices) {
        // alert non-manifold parts
        if (healed) {
            onupdate(null, null, "part may not be manifold");
        }

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

        // connect slices into linked list for island/bridge projections
        for (let i=1; i<slices.length; i++) {
            slices[i-1].up = slices[i];
            slices[i].down = slices[i-1];
        }

        widget.slices = slices;

        if (!slices || slices.length === 0) {
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

        // for synth support widgets, clip/offset to other widgets in group
        if (isSynth) {
            for (let slice of slices) {
                let gap = sliceHeight * process.sliceSupportGap;
                // clip tops to other widgets in group
                let tops = slice.topPolys();
                for (let peer of widget.group) {
                    // skip self
                    if (peer === widget || !peer.slices) {
                        continue;
                    }
                    for (let pslice of peer.slices) {
                        if (Math.abs(Math.abs(pslice.z - slice.z) - gap) > 0.1) {
                            continue;
                        }
                        let clipto = pslice.clips;
                        if (pslice.supportOutline) {
                            // merge support outlines into slice clips which
                            // should only happen when automatic and manual
                            // supports are used together
                            clipto.appendAll(pslice.supportOutline);
                        }
                        let ntops = [];
                        POLY.subtract(tops, clipto, ntops, null, slice.z, 0);
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
                doShells(slice, 1, shellOffset / 2);
            }
        }

        // calculate % complete and call onupdate()
        function doupdate(index, from, to, msg) {
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
        config.hint_len_max = util.sqr(process.sliceBridgeMax);

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
            let isBottom = slice.index < bottomLayers;
            let isTop = topLayers && slice.index > slices.length - topLayers - 1;
            let isDense = range.sliceFillSparse > 0.995;
            let isSolid = (isBottom || ((isTop || isDense) && !vaseMode)) && !isSynth;
            let solidWidth = isSolid ? range.sliceFillWidth || 1 : 0;
            if (solidWidth) {
                let fillSpace = fillSpacing * spaceMult * solidWidth;
                doSolidLayerFill(slice, fillSpace, sliceFillAngle);
            }
            sliceFillAngle = (sliceFillAngle + 90.0) % 360;
        }, "solid layers");

        // add lead in anchor when specified in belt mode (but not for synths)
        if (isBelt && !isSynth) {
            let { cosf, slope } = widget.belt;
            // find adjusted zero point from slices
            let smin = Infinity;
            for (let slice of slices) {
                let miny = Infinity;
                for (let poly of slice.topPolys()) {
                    let y = poly.bounds.maxy;
                    let z = slice.z;
                    // at 45 degrees, 1mm in Z is 1mm in Y
                    let by = (slope * z) - y;
                    if (by < miny) miny = by;
                    if (by < smin) smin = by;
                }
                // mark slices with tops touching belt
                slice.belt = { miny, touch: miny.round(3) < sliceHeightBase };
            }
            // find max width of first 5 layers for brim additions
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
                // find first slice touching belt for start of anchor
                if (!start && slice.belt.touch) {
                    start = slice;
                }
            }
            // ensure we start against a layer with shells
            while (start && start.up && start.topShells().length === 0) {
                start = start.up;
            }
            // if a brim applies, add that width to anchor
            let brim = getRangeParameters(process, 0).firstLayerBrim || 0;
            if (brim) {
                minx -= brim;
                maxx += brim;
            }
            // array of added top.fill_sparse arrays
            let adds = [];
            let step = sliceHeight;
            let anchorlen = (process.beltAnchor || process.firstLayerBeltLead) * cosf;
            while (anchorlen && start && anchorlen >= sliceHeight) {
                let addto = start.down;
                if (!addto) {
                    addto = newSlice(start.z - step);
                    addto.extruder = extruder;
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
                let y = (slope * z) - smin - (lineWidth / 2);
                let splat = base.newPolygon().add(minx, y, z).add(maxx, y, z).setOpen();
                let snew = addto.addTop(splat).fill_sparse = [ splat ];
                adds.push(snew);
                start = addto;
                anchorlen -= (step * slope);
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
                    // add up/over/down to anchor line (close = down)
                    // which completes the bump perimeter
                    poly.push(poly.last().add({x:0, y, z:0}));
                    poly.push(poly.first().add({x:0, y, z:0}));
                    poly.setClosed();
                    if (count > 2 && maxx - minx > 10) {
                        // add vertical hatch lines insibe bump shell
                        let mp = (maxx + minx) / 2;
                        let dx = (maxx - minx - 2);
                        dx = (Math.floor(dx / 3) * 3) / 2;
                        let fy = first.y;
                        let fz = first.z;
                        let n2 = lineWidth / 2;
                        for (let x = mp - dx; x <= mp + dx ; x += 3) {
                            add.push( base.newPolygon().add(x, fy - n2, fz).add(x, fy + y + n2, fz).setOpen() );
                        }
                    }
                }
            }
            // experimental emboss text on a flat underside of an object
            // in belt mode only
            if (process.pooch && self.OffscreenCanvas) {
                const { length, width, height, text } = process.pooch;
                let firstZ, firstI, lastZ, lastI, minX = 0, maxX = 0, maxY = 0;
                // locate suitable flat spot
                for (let slice of slices) {
                    let { belt } = slice;
                    if (!belt.touch) {
                        continue;
                    }
                    let index = slice.index;
                    let z = slice.z;
                    outer: for (let poly of slice.topPolys()) {
                        for (let i=0, p=poly.points, l=p.length; i<l; i++) {
                            let p0 = p[i];
                            let p1 = p[(i + 1) % l];
                            let p0y = z - p0.y;
                            let p1y = z - p1.y;
                            let i_ok = lastI ? index - lastI === 1 : true
                            let y_ok = p0y > 0 && p0y < 3 && Math.abs(p0y - p1y) < 0.01;
                            let x_ok = Math.abs(width - Math.abs(p1.x - p0.x)) < 1
                            if (y_ok && x_ok) {
                                if (i_ok) {
                                    firstZ = firstZ || z;
                                    firstI = firstI || index;
                                    lastZ = z;
                                    lastI = index;
                                    minX = Math.min(p0.x, p1.x);
                                    maxX = Math.max(p0.x, p1.x);
                                    maxY = p0y;
                                    break outer;
                                } else {
                                    firstZ = lastI = 0;
                                }
                            }
                        }
                    }
                }
                let dy = Math.abs(height - maxY * (1 / Math.sqrt(2)));
                let dz = Math.abs(length - ((lastZ - firstZ) * Math.sqrt(2)));
                if (dy < 0.1 && dz < 1) {
                    // console.log('FOUND', { firstI, lastI, minX, maxX, maxY });
                    let span = lastI - firstI - 2; // x = down the belt
                    let tall = width * 2;
                    let can = new self.OffscreenCanvas(span, tall);
                    let ctx = can.getContext("2d");
                    ctx.scale(1.2, 1);
                    ctx.font = '24px sans-serif';
                    // ctx.fillStyle = 'black';
                    ctx.textBaseline = "bottom";
                    ctx.fillText(text, 1, tall - 1);
                    let img = ctx.getImageData(0, 0, span, tall).data.buffer;
                    let rgb = new Uint32Array(img);
                    // console.log({ img, rgb, p: rgb.filter(v => v) });
                    for (let x=0; x<span; x++) {
                        let str = '';
                        let maxp = 0;
                        let lines = [];
                        let start, end;
                        for (let y=tall-1; y>=0; y--) {
                            let pix = rgb[y * span + x];
                            pix = (
                                ((pix >> 24) & 0xff) +
                                ((pix >> 16) & 0xff) +
                                ((pix >>  8) & 0xff)
                            ) / 3;
                            str += pix > 30 ? '*' : '-';
                            maxp = Math.max(maxp, pix);
                            if (pix > 30) {
                                if (start >= 0) {
                                    end = tall - y;
                                } else {
                                    start = tall - y;
                                }
                            } else {
                                if (start >= 0 && end > start) {
                                    lines.push({ start, end });
                                }
                                start = end = undefined;
                            }
                        }
                        console.log((x).toString().padStart(2,0),str,maxp | 0,lines);
                        if (lines.length) {
                            let slice = slices[firstI + x + 1];
                            let supps = slice.supports = slice.supports || [];
                            let z = slice.z;
                            let y = z - smin - (lineWidth / 2);
                            for (let line of lines) {
                                supps.push(base.newPolygon()
                                    .add(minX + line.start / 2, y, z)
                                    .add(minX + line.end / 2, y, z)
                                    .setOpen()
                                );
                            }
                        }
                    }
                }
            }
        }

        // calculations only relevant when solid layers are used
        // layer boolean diffs need to be computed to find flat areas to fill
        // and overhangs that need to be supported. these are stored in flats
        // and bridges, projected up/down, and merged into an array of solids
        if (!vaseMode && !isSynth) {
            profileStart("delta");
            forSlices(0.2, 0.34, slice => {
                let params = slice.params || process;
                let solidMinArea = params.sliceSolidMinArea;
                let sliceFillGrow = params.sliceFillGrow;
                doDiff(slice, { min: solidMinArea, grow: sliceFillGrow });
            }, "layer deltas");
            profileEnd();
            profileStart("delta-project");
            forSlices(0.34, 0.35, slice => {
                let params = slice.params || process;
                topLayers = params.sliceTopLayers || 0;
                bottomLayers = params.sliceBottomLayers || 0;
                if (topLayers) projectFlats(slice, topLayers);
                if (bottomLayers) projectBridges(slice, bottomLayers);
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
                let solidMinArea = params.sliceSolidMinArea;
                doSolidsFill(slice, fillSpace, sliceFillAngle, solidMinArea, promises);
                sliceFillAngle = (sliceFillAngle + 90.0) % 360;
            }, "fill solids");
            // very last layer (top) is set to finish solid rate
            slices.last().finishSolids = true
            if (promises) {
                await tracker(promises, (i, t) => {
                    trackupdate(i / t, 0.4, 0.5);
                });
            }
            profileEnd();
        }

        // for "real" objects, fill the remaining voids with sparse fill
        // sparse layers only present when non-vase mose and sparse % > 0
        if (!isSynth && !vaseMode) {
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
                    cache: params._range !== true && lastType === newType,
                    promises
                });
                lastType = newType;
            }, "infill");
            if (promises) {
                await tracker(promises, (i, t) => {
                    trackupdate(i / t, 0.55, 0.7);
                });
            }
            // back-fill slices marked for infill cloning
            for (let slice of slices) {
                if (slice._clone_sparse) {
                    let tops = slice.tops;
                    let down = slice.down.tops;
                    for (let i=0; i<tops.length; i++) {
                        tops[i].fill_sparse = down[i].fill_sparse.map(p => p.cloneZ(slice.z));
                    }
                }
            }
        } else if (isSynth && isSupport) {
            // convert synth support widgets into support structure
            let outline = process.sliceSupportOutline || false;
            let promises = isConcurrent ? [] : undefined;
            let resolve = [];
            forSlices(0.5, promises ? 0.6 : 0.7, slice => {
                let params = slice.params || process;
                let density = params.sliceSupportDensity;
                let supports = slice.topShells();
                slice.supports = supports;
                slice.tops = undefined; // remove outline leave only supports
                let polys = [];
                if (density) {
                    if (!outline) {
                        POLY.expand(supports, lineWidth, slice.z, polys);
                    } else {
                        POLY.expand(supports, -lineWidth/4, slice.z, polys);
                    }
                }
                fillSupportPolys({
                    promises, polys, lineWidth, density, z: slice.z, isBelt,
                    angle: process.sliceSupportFill
                });
                resolve.push({ slice, polys });
            }, "infill");
            if (promises) {
                await tracker(promises, (i, t) => {
                    trackupdate(i / t, 0.6, 0.7);
                });
            }
            for (let rec of resolve) {
                let { slice, polys } = rec;
                rec.supports = polys;
            }
        }

        // auto support generation
        if (!isBelt && !isSynth && supportDensity && process.sliceSupportEnable) {
            doShadow(slices);
            profileStart("support");
            let promises = [];
            forSlices(0.7, 0.75, slice => {
                promises.push(doSupport(slice, process, widget.shadow, { }));
            }, "support");
            await tracker(promises, (i, t) => {
                trackupdate(i / t, 0.75, 0.8);
            });
            profileEnd();
        }

        // fill all supports (auto and manual)
        // if (!isBelt && supportDensity) {
        if (supportDensity) {
            profileStart("support-fill");
            let promises = false && isConcurrent ? [] : undefined;
            forSlices(0.8, promises ? 0.88 : 0.9, slice => {
                let params = slice.params || process;
                let density = params.sliceSupportDensity;
                doSupportFill({
                    promises, slice, lineWidth, density,
                    minArea: process.sliceSupportArea, isBelt,
                    angle: process.sliceSupportFill,
                    outline: process.sliceSupportOutline !== false
                });
            }, "support");
            if (promises) {
                await tracker(promises, (i, t) => {
                    trackupdate(i / t, 0.88, 0.9);
                });
            }
            profileEnd();
        }

        if (isBrick) {
            let indices = slices.map(s => s.index);
            let first = indices[1];
            let last = indices[indices.length - 2];
            let nu = [];
            for (let slice of slices) {
                if (slice.index < first || slice.index > last) {
                    continue;
                }
                let nuSlice = slice.clone();
                nuSlice.z -= slice.height / 2;
                if (slice.index === first) {
                    nuSlice.z = slice.z - slice.height / 4;
                    nuSlice.height = slice.height / 2;
                } else {
                    nuSlice.height = slice.height;
                }
                nu.push(nuSlice);
                let ti = 0;
                for (let top of slice.tops || []) {
                    let nuTop = nuSlice.tops[ti++];
                    nuTop.shells = [];
                    top.shells = top.shells.filter((s,i) => {
                        if (i % 2 === 0) {
                            return true;
                        } else {
                            nuTop.shells.push(s);
                            return false;
                        }
                    });
                }
                if (slice.index === last) {
                    let cap = nuSlice.clone();
                    cap.z += (slice.height * 0.75);
                    cap.height = (slice.height / 2);
                    nu.push(cap);
                    cap.tops?.forEach((top, i) => {
                        top.shells = nuSlice.tops[i].shells.clone();
                    });
                }
            }
            slices.appendAll(nu);
            slices.sort((a,b) => a.z - b.z);
            slices.forEach((s,i) => s.index = i);
        }

        // render if not explicitly disabled
        if (render) {
            forSlices(0.9, 1.0, slice => {
                let params = slice.params || process;
                doRender(slice, isSynth, params, {
                    dark: controller.dark,
                    devel: controller.devel
                });
            }, "render");
        }

        if (isBelt) {
            let bounds = base.newBounds();
            let slice = slices[0];
            if (slice.tops) {
                for (let top of slice.tops) {
                    bounds.merge(top.poly.bounds);
                }
            } else if (slice.supports) {
                for (let poly of slice.supports) {
                    bounds.merge(poly);
                }
            }
            widget.belt.miny = -bounds.miny;
            widget.belt.midy = (bounds.miny + bounds.maxy) / 2;
        }
    }

}

function connect_lines(lines, maxd = Infinity) {
    const newlines = [];
    let op2;
    let eo = 0;
    for (let i=0; i<lines.length; i += 2) {
        let p1 = lines[i];
        let p2 = lines[i+1];
        // swap p1 / p2 dir every other line
        if (eo++ % 2 === 1) {
            let t = p1;
            p1 = p2;
            p2 = t;
        }
        // connect short distances between ends
        if (op2 && p1.distTo2D(op2) <= maxd) {
            let op1 = p1.clone();
            newlines.push(op2);
            newlines.push(op1);
        }
        newlines.push(p1);
        newlines.push(p2);
        op2 = p2.clone();
    }
    let idx = 0;
    for (let p of newlines) {
        p.index = (idx++ / 2) | 0;
    }
    return newlines;
}

function bound(v,min,max) {
    return Math.max(min,Math.min(max,v));
}

function doRender(slice, isSynth, params, opt = {}) {
    const { dark, devel } = opt;
    const Color = dark ? COLOR_DARK : COLOR;
    const output = slice.output();
    const height = slice.height / 2;
    const solidWidth = params.sliceFillWidth || 1;

    if (slice.tops) // missing for supports
    slice.tops.forEach(top => {
        if (isThin) output
            .setLayer('part', Color.part)
            .addPolys([top.poly]);

        output
            .setLayer(isSynth ? "support" : "shells", isSynth ? Color.support : Color.shell)
            .addPolys(top.shells || [], vopt({ offset, height, clean: true }));

        output
            .setLayer("solid fill", isSynth ? Color.support : Color.fill)
            .addLines(top.fill_lines || [], vopt({ offset: offset * solidWidth, height, z:slice.z }));

        if (!(slice.belt && slice.belt.anchor)) output
            .setLayer("sparse fill", Color.infill)
            .addPolys(top.fill_sparse || [], vopt({ offset, height, outline: true, trace:true }))

        if (slice.belt && slice.belt.anchor) output
            .setLayer("anchor", Color.anchor)
            .addPolys(top.fill_sparse || [], vopt({ offset, height, outline: true, trace:true }))

        if (top.thin_fill) output
            .setLayer("thin fill", Color.thin)
            .addLines(top.thin_fill, vopt({ offset, height }));

        if (top.gaps && devel) output
            .setLayer("gaps", Color.gaps)
            .addPolys(top.gaps, vopt({ offset, height, thin: true }));

        if (isThin && devel && top.fill_off && top.fill_off.length) {
            slice.output()
                .setLayer('fill inset', Color.inset)
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

    if (slice.supports && params.sliceSupportOutline) output
        .setLayer("support", Color.support)
        .addPolys(slice.supports, vopt({ offset, height }));

    if (slice.supports) slice.supports.forEach(poly => {
        if (poly.fill) output
            .setLayer("support", Color.support)
            .addLines(poly.fill, vopt({ offset, height }));
    });

    if (slice.xray) {
        const color = [ 0xff0000, 0x00aa00, 0x0000ff, 0xaaaa00, 0xff00ff, 0x0 ];
        if (slice.lines) {
            slice.lines.forEach((line, i) => {
                const group = i % 5;
                slice.output().setLayer(`l${group}`, color[group]).addLine(line.p1, line.p2);
            });
        }
        if (slice.groups)
        POLY.nest(slice.groups).forEach((poly, i) => {
            const group = i % 5;
            slice.addTop(poly);
            // slice.output().setLayer(`g${i}`, 0x888888).addPoly(poly);
            slice.output().setLayer(`g${i}`, color[group]).addPoly(poly);
        });
    }

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

/**
 * Create an entirely solid layer by filling all top polygons
 * with an alternating pattern.
 *
 * @param {number} linewidth
 * @param {number} angle
 * @param {number} density
 */
 function doSolidLayerFill(slice, spacing, angle) {
    if (slice.xray) {
        return;
    }

    if (slice.tops.length === 0 || typeof(angle) != 'number') {
        slice.isSolidLayer = false;
        return;
    }

    slice.tops.forEach(function(top) {
        if (!top.fill_off) return; // missing for inner brick layers
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
    if (slice.xray || options.type === 'none') {
        return;
    }

    let process = options.process,
        spacing = options.spacing,  // spacing space between fill lines
        density = options.density,  // density of infill 0.0 - 1.0
        bounds = options.bounds,    // bounding box of widget
        height = options.height,    // z layer height
        cache = !(options.cache === false),
        type = options.type || 'hex';

    if (slice.tops.length === 0 || density === 0.0 || slice.isSolidLayer || slice.index < 0) {
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
    if (type && fill[type]) {
        fill[type](target);
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

    let skippable = cache && fill_fixed[type] ? true : false;
    let miss = false;
    // if the layer below has the same fingerprint,
    // we may be able to clone the infill instead of regenerating it
    if (skippable && slice.fingerprintSame(down)) {
        // the fill fingerprint can slightly different because of solid projections
        if (down._fill_finger && POLY.fingerprintCompare(slice._fill_finger, down._fill_finger)) {
            for (let i=0; i<tops.length; i++) {
                // the layer below may not have infill computed if it's solid
                if (!down.tops[i].fill_sparse) {
                    miss = true;
                }
            }
            // mark for infill cloning if nothing is missing
            if (!miss) {
                slice._clone_sparse = true;
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
        options.promises.push(kiri.minions.clip(slice, polys, lines));
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
function doDiff(slice, options = {}) {
    const { sla, fakedown, grow, min } = options;
    if ((slice.index <= 0 && !fakedown) || slice.xray) {
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

    let newBridges = [];
    let newFlats = [];

    POLY.subtract(topInner, downInner, newBridges, newFlats, slice.z, min, {
        wasm: true
    });

    newBridges = newBridges.filter(p => p.areaDeep() >= min);
    newFlats = newFlats.filter(p => p.areaDeep() >= min);

    if (grow > 0 && newBridges.length) {
        newBridges = POLY.offset(newBridges, grow);
    }
    if (grow > 0 && newFlats.length) {
        newFlats = POLY.offset(newFlats, grow);
    }

    bridges.appendAll(newBridges);
    flats.appendAll(newFlats);
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
function projectFlats(slice, count, expand) {
    if (!slice.down || !slice.flats) return;
    // these flats are marked for finishing print speed
    if (slice.flats.length) slice.finishSolids = true;
    if (slice && slice.flats && slice.flats.length) {
        const flats = expand ? POLY.expand(slice.flats, expand) : slice.flats;
        projectSolid(slice, flats, count, false, true);
    }
};

/**
 * project top bridges up
 */
function projectBridges(slice, count) {
    if (!slice.up || !slice.bridges) return;
    // these flats are marked for finishing print speed
    if (slice.bridges.length) slice.finishSolids = true;
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

    if (slice.isSolidLayer || slice.xray) {
        return;
    }

    let unioned = POLY.union(solids, undefined, true, { wasm: true }).flat(),
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
    let make_solid_layer = false;
    let tops_area = tops.length ? tops.map(top => top.poly.areaDeep()).reduce((a,i) => a+i) : 0;
    for (let solid of solids) {
        for (let top of tops) {
            let stop = [];
            if (top.poly.overlaps(solid)) {
                if (!solid.parent || solid.parent.area() > top.poly.area()) {
                    if (solid.areaDeep() < minarea) {
                        // console.log({i:slice.index,cull_solid:solid,area:solid.areaDeep()});
                        continue;
                    }
                    solid.parent = top.poly;
                    top.solids.push(solid);
                    stop.push(solid);
                }
            }
            // problematic for organic shapes with lots of big and small tops
            // the small tops tend to trigger entire layer fills. for now just
            // trip full solid layer if a single top area diff > 50%
            if (false && stop.length) {
                let top_area = top.poly.areaDeep();
                let stop_area = stop.map(p => p.areaDeep()).reduce((a,v) => a + v);
                // if the solid area > 50% of the top area, make entire layer solid
                if (stop_area / tops_area > 0.5) {
                    make_solid_layer = true;
                }
            }
        }
    }
    // if 50% of top is filled with solids, trigger layer conversion to solid
    // in future, this should be limited to a specific top, not entire layer
    if (make_solid_layer) {
        for (let top of tops) {
            top.solids = [];
        }
        doSolidLayerFill(slice, spacing, angle);
        return;
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
            // top.fill_lines_norm = {angle:angle,spacing:spacing};
        }
        if (angfill.length > 0) {
            top.fill_lines_ang = {spacing:spacing,list:[],poly:[]};
            for (let af of angfill) {
                doFillArea(fillQ, [af], af.fillang.angle + 45, spacing, newfill);
                // top.fill_lines_ang.list.push(af.fillang.angle + 45);
                // top.fill_lines_ang.poly.push(af.clone());
            }
        }
    }
}

function doFillArea(fillQ, polys, angle, spacing, output, minLen, maxLen) {
    if (fillQ) {
        fillQ.push(kiri.minions.fill(polys, angle, spacing, output, minLen, maxLen));
    } else {
        POLY.fillArea(polys, angle, spacing, output, minLen, maxLen);
    }
}

/**
 * calculate external overhangs requiring support
 */
async function doSupport(slice, proc, shadow, opt = {}) {
    let maxBridge = proc.sliceSupportSpan || 5,
        minArea = proc.supportMinArea || 0.1,
        pillarSize = proc.sliceSupportSize,
        offset = proc.sliceSupportOffset || 0,
        gap = proc.sliceSupportGap,
        size = (pillarSize || 1),
        tops = slice.topPolys(),
        trimTo = tops;

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
            down_traces = down_traces.map(p => p.clean(true, undefined, config.clipper / 10));
        }
    }

    // DEBUG code
    let SDBG = false;
    let cks = SDBG ? [] : undefined;
    let pip = SDBG ? [] : undefined;
    let pcl = SDBG ? [] : undefined;

    // check if point is supported by layer below
    function checkPointSupport(point) {
        if (SDBG) cks.push(point); // DEBUG
        // skip points close to other support points
        for (let i=0; i<points.length; i++) {
            if (point.distTo2D(points[i]) < size/4) return;
        }
        let supported = point.isInPolygonOnly(down_tops);
        if (SDBG && supported) pip.push(point); // DEBUG
        let dist = false; // DEBUG
        if (!supported) down_traces.forEach(function(trace) {
            trace.forEachSegment(function(p1, p2) {
                if (point.distToLine(p1, p2) < offset) {
                    dist = true;
                    return supported = true;
                }
            });
            return supported;
        });
        if (SDBG && dist) pcl.push(point); // DEBUG
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
            pillars.push(base.newPolygon().centerRectangle(point, size/2, size/2));
        });

        supports.appendAll(POLY.union(pillars, null, true, { wasm: false }));
        // merge pillars and replace with convex hull of outer points (aka smoothing)
        pillars = POLY.union(pillars, null, true, { wasm: false }).forEach(function(pillar) {
            supports.push(base.newPolygon().createConvexHull(pillar.points));
        });
    })();

    // DEBUG code
    if (SDBG && down_traces) slice.output()
        .setLayer('cks', { line: 0xee5533, check: 0xee5533 })
        .addPolys(cks.map(p => base.newPolygon().centerRectangle(p, 0.25, 0.25)))
        .setLayer('pip', { line: 0xdd4422, check: 0xdd4422 })
        .addPolys(pip.map(p => base.newPolygon().centerRectangle(p, 0.4, 0.4)))
        .setLayer('pcl', { line: 0xcc3311, check: 0xcc3311 })
        .addPolys(pcl.map(p => base.newPolygon().centerRectangle(p, 0.3, 0.3)))
        .setLayer('pts', { line: 0xdd33dd, check: 0xdd33dd })
        .addPolys(points.map(p => base.newPolygon().centerRectangle(p, 0.8, 0.8)))
        .setLayer('dtr', { line: 0x0, check: 0x0 })
        .addPolys(POLY.setZ(down_traces.clone(true),slice.z));
        ;

    if (supports.length === 0) {
        return;
    }

    // then union supports
    if (supports.length > 10) {
        supports = await kiri.minions.union(supports);
    } else {
        supports = POLY.union(supports, null, true, { wasm: false });
    }

    // clip to top polys
    supports = POLY.trimTo(supports, shadow);

    let depth = 0;
    while (down && supports.length > 0) {
        down.supports = down.supports || [];

        let trimmed = [], culled = [];

        // culled = supports;
        // clip supports to shell offsets
        POLY.subtract(supports, down.topSimples(), trimmed, null, slice.z, minArea, { wasm: false });

        // set depth hint on support polys for infill density
        trimmed.forEach(function(trim) {
            if (trim.area() < minArea) return;
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

function doSupportFill(args) {
    const { promises, slice, lineWidth, density, minArea, isBelt, angle, outline } = args;
    let supports = slice.supports,
        nsB = [],
        nsC = [],
        min = minArea || 0.1;

    if (!supports) return;

    // union supports
    supports = POLY.setZ(POLY.union(supports, undefined, true, { wasm: false }), slice.z);

    // clip supports to slice clip offset (or shell if none)
    POLY.subtract(supports, slice.clips, nsB, null, slice.z, min, { wasm: false });
    supports = nsB;

    // also trim to lower offsets, if they exist
    if (slice.down && slice.down.clips) {
        POLY.subtract(nsB, slice.down.clips, nsC, null, slice.z, min, { wasm: false });
        supports = nsC;
    }

    if (supports) {
        fillSupportPolys({
            promises, polys: supports, lineWidth, density, z: slice.z, isBelt, angle, outline
        });
    }

    // re-assign new supports back to slice
    slice.supportOutline = supports;
    slice.supports = supports;
};

function fillSupportPolys(args) {
    const { promises, polys, lineWidth, density, z, isBelt, angle, outline } = args;
    // calculate fill density
    let spacing = lineWidth * (1 / density);
    polys.forEach(function (poly) {
        // calculate angle based on width/height ratio
        let auto = isBelt || (poly.bounds.width() / poly.bounds.height() > 1) ? 1090 : 1000;
        // inset support poly for fill lines 33% of nozzle width
        let inset = POLY.offset([poly], -lineWidth/3, {flat: true, z, wasm: true});
        // do the fill
        if (inset && inset.length > 0) {
            doFillArea(promises, inset, angle || auto, spacing, poly.fill = []);
            if (!outline && poly.fill.length) {
                poly.fill = connect_lines(poly.fill, spacing * 2);
            }
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
    if (!slice || count <= 0) {
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

FDM.supports = function(settings, widget) {
    let isBelt = settings.device.bedBelt;
    let process = settings.process;
    let size = process.sliceSupportSize;
    let s9 = size / 9;
    let s4 = size / 4;
    let s2 = size * 0.45;
    let min = 0.01;
    let geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(widget.vertices, 3));
    let rad = (Math.PI / 180);
    let deg = (180 / Math.PI);
    let angle = rad * settings.process.sliceSupportAngle;
    let thresh = -Math.sin(angle);
    let dir = new THREE.Vector3(0,0,-1)
    let add = [];
    let mat = new THREE.MeshBasicMaterial();
    let mesh = new THREE.Mesh(geo, mat);
    let platform = new THREE.Mesh(
        new THREE.PlaneGeometry(10000,10000,1), mat
    );
    const now = Date.now();
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
    function tf(a, b, c) {
        let dab = a.distanceTo(b);
        let dbc = b.distanceTo(c);
        let dca = c.distanceTo(a);
        let max = Math.max(dab, dbc, dca);
        if (max < size) {
            let min = Math.min(dab, dbc, dca);
            if (min < s9 && Math.random() < 0.5) {
                return;
            }
            // test midpoint of tri face
            return tp(new THREE.Vector3().add(a).add(b).add(c).divideScalar(3));
        }
        if (dab === max) {
            let mp = new THREE.Vector3().add(a).add(b).divideScalar(2);
            tf(mp, b, c);
            tf(a, mp, c);
        } else if (dbc === max) {
            let mp = new THREE.Vector3().add(b).add(c).divideScalar(2);
            tf(a, mp, c);
            tf(a, b, mp);
        } else {
            let mp = new THREE.Vector3().add(c).add(a).divideScalar(2);
            tf(a, b, mp);
            tf(mp, b, c);
        }
    }

    let filter = isBelt ? (norm) => {
        return norm.z <= thresh && norm.y < 0;
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
        // skip faces on bed
        if (Math.max(a.z, b.z, c.z) < 0.1) {
            continue;
        }
        // triangulate larger polys and test centers
        tf(a,b,c);
    }
    console.log(`support generated in ${Date.now() - now} ms`);
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
                        return base.newPolygon()
                            .add(arr[0].x, arr[0].y, arr[0].z)
                            .add(arr[1].x, arr[1].y, arr[1].z)
                            .add(arr[2].x, arr[2].y, arr[2].z);
                    });
                    let union = parr.length === 1 ? parr :
                        POLY.union(parr, 0, true, {wasm:false});
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

});
