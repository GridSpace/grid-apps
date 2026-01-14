/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { layerProcessTop } from './post.js';
import { fill, fill_fixed } from './fill.js';
import { generateBeltAnchor, embossBeltPooch, finalizeBeltBounds } from './belt.js';
import { getRangeParameters } from '../core/params.js';
import { newPoint } from '../../../../geo/point.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { newSlice } from '../../../core/slice.js';
import { polygons as POLY } from '../../../../geo/polygons.js';
import { slice, sliceZ } from '../../../../geo/slicer.js';
import { util } from '../../../../geo/base.js';

const CONSTANTS = {
    // Support fill
    SUPPORT_FILL_LEGACY_OFFSET: 1000,  // hack to allow old code path detection (line 158)
    SUPPORT_AUTO_ANGLE_WIDE: 1090,     // auto-angle for wide support polygons (90°)
    SUPPORT_AUTO_ANGLE_TALL: 1000,     // auto-angle for tall support polygons (0°)
    SUPPORT_INSET_RATIO: 1/3,          // inset support fill by 33% of line width
    SUPPORT_CONNECT_DISTANCE_MULT: 2,  // connect fill lines within 2x spacing

    // Minimum areas and thresholds
    MIN_POLY_AREA: 0.1,                // minimum polygon area in mm²
    DENSE_INFILL_THRESHOLD: 0.995,     // 99.5% infill triggers solid layer
    SOLID_LAYER_COVERAGE_THRESHOLD: 0.5, // 50% solid coverage triggers full layer

    // Adaptive slicing
    ADAPTIVE_SLICE_TOLERANCE: 0.01,    // threshold for adaptive layer height adjustments

    // Belt mode
    BELT_PRECISION_ROUNDING: 3,        // decimal places for belt touch detection
    BELT_PEEK_LAYERS: 5,               // layers to check for brim width calculation
    BELT_ANCHOR_BUMP_SPACING_MULT: 2,  // anchor bump spacing multiplier
    BELT_MIN_WIDTH_FOR_HATCH: 10,      // minimum width in mm for hatch lines in bumps
    BELT_HATCH_SPACING: 3,             // hatch line spacing in mm for bumps

    // Pooch (belt text embossing)
    POOCH_Y_RANGE_MIN: 0,              // minimum Y offset for pooch detection
    POOCH_Y_RANGE_MAX: 3,              // maximum Y offset for pooch detection
    POOCH_FLATNESS_TOLERANCE: 0.01,    // flatness tolerance for pooch surface
    POOCH_WIDTH_TOLERANCE: 1,          // width matching tolerance in mm
    POOCH_DY_TOLERANCE: 0.1,           // height delta tolerance
    POOCH_DZ_TOLERANCE: 1,             // length delta tolerance
    POOCH_TEXT_SCALE_X: 1.2,           // text horizontal scale factor
    POOCH_TEXT_SCALE_Y: 1,             // text vertical scale factor
    POOCH_FONT_SIZE: 24,               // font size in pixels
    POOCH_PIXEL_THRESHOLD: 30,         // brightness threshold for pixel detection

    // Angled fill
    ANGLED_FILL_ROTATION: 45,          // rotation offset for angled fills
};

/**
 * @typedef {Object} SliceParams
 * @property {number} sliceHeight - Layer height in mm
 * @property {number} sliceLineWidth - Extrusion width in mm
 * @property {number} sliceTopLayers - Number of solid top layers
 * @property {number} sliceBottomLayers - Number of solid bottom layers
 * @property {number} sliceFillSparse - Infill density (0.0-1.0)
 * @property {string} sliceFillType - Infill pattern: 'hex', 'grid', 'gyroid', 'triangle', etc.
 * @property {number} sliceFillAngle - Base infill angle in degrees
 * @property {number} sliceFillWidth - Solid fill line width multiplier
 * @property {number} sliceFillGrow - Fill boundary expansion in mm
 * @property {number} sliceFillOverlap - Fill overlap with shells (0.0-0.8)
 * @property {number} sliceSolidMinArea - Minimum area in mm² for solid regions
 * @property {number} sliceSolidMinThick - Miminum "thickness" ratio for culling thin solids
 * @property {number} sliceSupportDensity - Support fill density (0.0-1.0)
 * @property {number} sliceSupportFill - Support fill angle (or auto if >= 1000)
 * @property {number} sliceSupportGap - Gap between support and part in mm
 * @property {boolean} sliceSupportOutline - Include support perimeter
 * @property {number} sliceSupportOffset - Support clip offset in mm
 * @property {number} sliceAdaptive - Enable adaptive layer heights
 * @property {number} sliceMinHeight - Minimum adaptive layer height in mm
 * @property {number} firstSliceHeight - First layer height in mm
 * @property {number} firstLayerBrim - Brim width in mm
 * @property {number} beltAnchor - Belt anchor length in mm
 * @property {number} firstLayerBeltLead - Belt lead-in length in mm
 * @property {number} firstLayerBeltBump - Belt anchor bump height in mm
 * @property {number} firstLayerFlatten - Belt base flattening height in mm
 */

/**
 * @typedef {Object} RenderContext
 * @property {boolean} isThin - Force thin line rendering
 * @property {boolean} isFlat - Force flat polygon rendering
 * @property {number} offset - Line generation offset (typically lineWidth/2)
 */

/**
 * @typedef {Object} FillOptions
 * @property {Object} settings - Global settings object
 * @property {SliceParams} process - Process parameters
 * @property {Object} device - Device configuration
 * @property {number} lineWidth - Extrusion width in mm
 * @property {number} spacing - Fill line spacing in mm
 * @property {number} density - Fill density (0.0-1.0)
 * @property {Object} bounds - Widget bounding box
 * @property {number} height - Layer height in mm
 * @property {string} type - Fill pattern type
 * @property {boolean} cache - Enable fill caching
 * @property {Promise[]} [promises] - Array for async operations
 */

/**
 * @typedef {Object} SupportFillOptions
 * @property {Slice} slice - Slice to process
 * @property {number} lineWidth - Extrusion width in mm
 * @property {number} density - Support density (0.0-1.0)
 * @property {number} minArea - Minimum polygon area in mm²
 * @property {boolean} isBelt - Belt printer mode
 * @property {number} [angle] - Fill angle in degrees (auto if >= 1000)
 * @property {boolean} outline - Include support outline
 * @property {number} [gap] - Gap from part surfaces in mm
 * @property {Promise[]} [promises] - Array for async operations
 */

/**
 * @typedef {Object} BeltData
 * @property {number} slope - Belt angle slope factor
 * @property {number} cosf - Cosine of belt angle
 * @property {number} sinf - Sine of belt angle
 * @property {number} miny - Minimum Y coordinate
 * @property {number} midy - Middle Y coordinate
 * @property {boolean} [touch] - Whether slice touches belt
 * @property {boolean} [anchor] - Whether slice is part of anchor
 */

let tracker = util.pwait,
    lopacity = 0.6,
    opacity = 1,
    fat = 1.5,
    COLOR = {
        anchor: { check: 0x999933, face: 0x999933, line: 0x999933, opacity, lopacity, fat },
        fill: { check: 0x005588, face: 0x005588, line: 0x005588, opacity, lopacity, fat },
        gaps: { check: 0xaa3366, face: 0xaa3366, line: 0xaa3366, opacity, lopacity, fat },
        infill: { check: 0x3322bb, face: 0x3322bb, line: 0x3322bb, opacity, lopacity, fat },
        inset: { line: 0xaaaaaa, check: 0xaaaaaa, face: 0 },
        shell: { check: 0x0077bb, face: 0x0077bb, line: 0x0077bb, opacity, lopacity, fat },
        support: { check: 0xbbbb00, face: 0xbbbb00, line: 0xbbbb00, opacity, lopacity, fat },
        part: { line: 0x333333, check: 0x333333 },
        thin: { check: 0xbb8800, face: 0xbb8800, line: 0xbb8800, opacity, lopacity, fat },
    },
    COLOR_DARK = Object.assign({}, COLOR, {
        fill: { check: 0x005588, face: 0x005588, line: 0x005588, opacity, lopacity, fat },
        infill: { check: 0x3322bb, face: 0x3322bb, line: 0x3322bb, opacity, lopacity, fat },
        inset: { line: 0x555555, check: 0x555555 },
        part: { line: 0x777777, check: 0x777777, face: 0  },
        thin: { check: 0xbb8800, face: 0xbb8800, line: 0xbb8800, opacity, lopacity, fat },
    }),
    noop = () => {},
    PROTO = Object.clone(COLOR),
    profile = false,
    profileStart = profile ? console.profile : noop,
    profileEnd = profile ? console.profileEnd : noop,
    debug = false;

/**
 * Apply visualization options based on render context
 * 
 * @param {Object} opt - Base options
 * @param {RenderContext} ctx - Render context
 * @returns {Object|null} Modified options or null
 */
function vopt(opt, ctx) {
    if (opt) {
        if (ctx.isFlat) {
            opt.flat = true;
            opt.outline = true;
            return opt;
        }
        if (ctx.isThin) return null;
    }
    return opt;
}

/**
 * return percentage values broken into ranges
 *
 * @param {number} plo 0.0-1.0 percentage value
 * @param {number} phi  0.0-1.0 high percentage value
 * @param {Array} pcts [{ lo, hi }, ...]
 */
function divide(plo, phi, pcts) {
    let sum = 0;
    let lo = plo;
    let rval = pcts.map(pct => {
        sum += pct;
        let diff = (phi - plo) * pct;
        let rval = { lo, hi: lo + diff };
        lo += diff;
        return rval;
    });
    if (Math.abs(1 - sum) > 0.001) {
        console.log('SUM FAIL', { rval, sum });
    }
    return rval;
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
export function sliceOne(settings, widget, onupdate, ondone) {
    let render = settings.render !== false,
        { minions } = self.kiri_worker,
        { process, device, controller } = settings,
        { devel, assembly, threaded } = controller,
        isBelt = device.bedBelt,
        isBrick = devel && process.sliceZInterleave,
        useAssembly = assembly,
        isConcurrent = threaded && minions.concurrent && !process.xray,
        topLayers = process.sliceTopLayers || 0,
        bottomLayers = process.sliceBottomLayers || 0,
        vaseMode = process.sliceFillType === 'vase',
        metadata = widget.anno,
        maxtruder = Math.max(0, device.extruders.length - 1),
        extruder = Math.min(maxtruder, parseInt(metadata.extruder || 0)),
        sliceHeight = process.sliceHeight,
        sliceHeightBase = (isBelt ? sliceHeight : process.firstSliceHeight) || sliceHeight,
        lineWidth = process.sliceLineWidth || device.extruders[extruder].extNozzle,
        fillOffsetMult = 1.0 - bound(process.sliceFillOverlap, 0, 0.8),
        shellOffset = lineWidth,
        fillSpacing = lineWidth,
        fillOffset = lineWidth * fillOffsetMult,
        clipOffset = process.sliceSupportOffset + lineWidth / 2,
        sliceFillAngle = process.sliceFillAngle,
        supportDensity = process.sliceSupportDensity,
        { sliceCompInner, sliceCompOuter } = process;

    // create render context for visualization
    /** @type {RenderContext} */
    const renderContext = {
        isFlat: controller.lineType === "flat",
        isThin: controller.lineType === "line",
        offset: lineWidth / 2
    };
    renderContext.isThin = !renderContext.isFlat && renderContext.isThin;

    // allow overriding support fill auto angle algorithm
    // also causes support fill to be aligned on start boundaries
    // best with angles that are a multiple of 90 degrees
    if (process.sliceSupportFill >= 0) {
        // yes, an ugly hack to allow it to pass through old code paths
        process.sliceSupportFill += CONSTANTS.SUPPORT_FILL_LEGACY_OFFSET;
    }

    if (renderContext.isFlat) {
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
    let slices; // set by decodeSlices()

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

    // create Slice objects for specified list of Z heights
    // zGen() produces the list (or empty for slicer auto-detected)
    slice(points, {
        strict: true,
        debug: process.xray,
        xray: process.xray,
        zMin: bounds.min.z,
        zMax: bounds.max.z - zCut,
        union: controller.healMesh,
        indices: process.indices || process.xray,
        useAssembly,
        post: 'FDM',
        post_args: {
            compInner: sliceCompInner,
            compOuter: sliceCompOuter,
            shellOffset,
            fillOffset, // distance: top inset for sparse/solid infill
            clipOffset, // distance: create simpler clip offset for supports
            lineWidth,
            vaseMode,
            process,
        },
        zGen,
        // slicer function (worker local or minion distributed)
        slicer(z, points, opts) {
            return (isConcurrent ? minions.sliceZ : sliceZ)(z, points, opts);
        },
        onupdate(update) {
            return onupdate(0.0 + update * 0.5)
        }
    })
    .then(decodeSlices)
    .then(processSlices)
    .then(ondone);

    // z index generator (bottom up)
    function zGen(zopt) {
        if (process.xray) {
            return zopt.zIndexes;
        }
        let { zMin, zMax } = zopt;
        let h1 = sliceHeight;
        let h0 = Math.abs(zMin) < 0.0001 ? (sliceHeightBase || h1) : h1;
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
                    if (zDelta % zInc > CONSTANTS.ADAPTIVE_SLICE_TOLERANCE) zDivMax++;
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
    }

    // turn slicer raw output into Slice objects
    // z index order should be bottom up at this point
    async function decodeSlices(output) {
        // post process slices and re-incorporate missing meta-data
        slices = output.slices.map(data => {
            let { z, clip, lines, groups, changes } = data;
            if (!data.tops) return null;
            let slice = newSlice(z).addTops(data.tops, { minArea: CONSTANTS.MIN_POLY_AREA });
            slice.index = indices.indexOf(z);
            slice.height = heights[slice.index];
            slice.clips = clip;
            // do not warn on merging supports
            if (changes) {
                healed = true;
                slice.changes = changes;
                if (devel) {
                    console.log('slice healed', slice.index, slice.z, changes);
                }
            }
            if (process.xray) {
                slice.index = process.xray.shift();
                slice.lines = lines;
                slice.groups = groups;
                slice.xray = slice.index;
            }
            return slice;
        }).filter(s => s);
    }

    // slicing is the first 50% of the update "time"
    function trackupdate(pct, from, to, msg) {
        // console.log(from.round(2), to.round(2), msg);
        onupdate(0.5 + (from + (pct * (to - from))) * 0.5, msg);
    }

    // calculate % complete and call onupdate()
    function doupdate(index, from, to, msg) {
        trackupdate(index / slices.length, from, to, msg);
    }

    // for each slice, perform a function and call doupdate()
    function forSlices(from, to, fn, msg) {
        slices.forEach(slice => {
            fn(slice);
            doupdate(slice.index, from, to, msg)
        });
    }

    /**
     * Process automatic and manual shadow-based support generation
     */
    async function processSupports(plo, phi) {
        if (process.sliceSupportType === 'disabled') {
            return;
        }

        let div = divide(plo, phi, [ 0.5, 0.5 ]);
        let stack = slices.slice();
        let indices = stack.map(s => s.z);
        let zAngNorm = Math.sin(process.sliceSupportAngle * Math.PI / 180);
        let manual = process.sliceSupportType === 'manual';

        // sort bottom up so shadows do not accumulate
        // since that is done later and clipped to slice.clips
        stack.sort((a,b) => a.z - b.z);

        // automatic supports
        if (!manual) {
            // find where shadow areas begin (async)
            await widget.computeShadowStack(indices, progress => {
                trackupdate(progress, div[0].lo, div[0].hi, "shadow");
            }, zAngNorm, sliceHeight);

            // assign to slices (sync)
            for (let slice of stack) {
                slice.shadow = await widget.shadowAt(slice.z, true);
                if (!(slice.up && slice.shadow?.length)) continue;
                // trim shadow to part overhangs
                let top = slice.up.topPolys();
                let bot = slice.topPolys();
                let bridge = [];
                POLY.subtract(top, bot, bridge, undefined, slice.z, 0, { wasm: true });
                slice.shadow = POLY.trimTo(slice.shadow, bridge, { minArea: 0 });
            }
        }

        // process manual supports if they exist
        let { paint } = widget.anno;
        let { belt } = widget;

        // apply belt transformations, if needed
        if (manual && belt && paint?.length) {
            let { anchor, angle, dy, slope } = belt;
            // make a copy we can modify
            paint = structuredClone(paint);
            for (let rec of paint) {
                let { point } = rec;
                // convert yz plane to xy plane to re-use point utility function
                let np = newPoint(point.y + dy, point.z, 0).rotate(angle * (Math.PI/180));
                point.y = np.x;
                point.z = np.y;
                if (anchor) {
                    point.y += anchor.len;
                    point.z += anchor.len;
                }
            }
        }

        // convert paint points to circles on matching slices
        if (manual && paint?.length) {
            let hpi = Math.PI/2;
            for (let slice of stack) {
                if (!slice.up) {
                    continue;
                }
                let polys = [];
                for (let rec of paint) {
                    let { point, radius } = rec;
                    let dz = Math.abs(slice.z - point.z);
                    if (dz < radius) {
                        // scale radius by distance from point.z
                        radius = (Math.acos(dz/radius) / hpi) * radius;
                        polys.push(newPolygon().centerCircle(point, radius, 10));
                    }
                }
                // trim polys to part overhangs
                let top = slice.up.topPolys();
                let bot = slice.topPolys();
                let bridge = [];
                let propose = POLY.setZ(POLY.union(polys, 0, true), slice.z);
                POLY.subtract(top, bot, bridge, undefined, slice.z, 0, { wasm: true });
                propose = POLY.trimTo(propose, bridge, { minArea: 0 });
                slice.shadow = propose;
                // if (devel) slice.output().setLayer("over", 0x8844aa).addPolys(bridge);
            }
        }

        // 1. accumulate / union shadow coverage top down
        // 2. trim to area outside slice.clips
        let minArea = lineWidth * lineWidth;
        let shadowSum;
        let length = stack.length;
        let count = 0;

        // convert shadows to trees, when specified
        if (process.sliceSupportTree) {
            // console.log('TREE OUTPUT');
        }

        // perform accumulation top down
        for (let slice of stack.reverse()) {
            let shadow = slice.shadow ?? [];
            if (devel) slice.output().setLayer("shadow", 0xff0000).addPolys(shadow);
            if (process.sliceSupportExtra) {
                shadow = POLY.offset(shadow, process.sliceSupportExtra);
            }
            // shadows accumulate down
            if (shadowSum) {
                shadow = POLY.union([...shadow, ...shadowSum], minArea, true);
            }
            // subtract slice top areas (widget boundaries) from shadow projection
            if (true) {
                let rem  = [];
                let clips = [ slice.topPolys() ].filter(v => v).flat();
                clips = POLY.union(clips, minArea, true);
                POLY.subtract(shadow, clips, rem, null, slice.z, minArea, { wasm: false });
                shadow = rem;
            }
            // pump shadow to clean to clean it up
            if (true) {
                let bump = lineWidth * 2;
                shadow = POLY.offset(shadow,  bump, { z: slice.z });
                shadow = POLY.offset(shadow, -bump, { z: slice.z });
            }
            shadowSum = shadow;
            // if belt, clip shadow to belt angle projection along platform
            if (belt) {
                let boundsx = bounds.dim.x * 1.1;
                let boundsy = bounds.dim.y * 1.1;
                let skewy = slice.z * belt.slope;
                let clip = newPolygon()
                    .centerRectangle(newPoint(0, 0, slice.z), boundsx, boundsy)
                    .move({ x: 0, y: -boundsy / 2 + skewy, z: 0 });
                shadow = POLY.trimTo(shadow, [ clip ]);
                // if (devel) slice.output().setLayer("belt clip", 0xffff00).addPolys([ clip ]);
            }
            slice.supports = shadow;
            // if (devel) slice.output().setLayer("shadow", 0xff0000).addPolys(shadow);
            trackupdate((++count/length), div[1].lo, div[1].hi, "support");
        }

        // trim using support part offset value
        let gaps = process.sliceSupportGap;
        for (let slice of stack.reverse()) {
            let clips = [
                slice.clips,
                gaps ? slice.up?.clips : undefined,
                gaps ? slice.down?.clips : undefined
            ].filter(v => v).flat();
            if (clips.length) {
                let rem  = [];
                clips = POLY.union(clips, minArea, true);
                POLY.subtract(slice.supports, clips, rem, null, slice.z, minArea, { wasm: false });
                slice.supports = rem;
            }
        }
    }

    /**
     * Process top and bottom layers or any other
     * layers detected and marked for solid fill
     */
    async function processSolidLayers(plo, phi) {
        forSlices(plo, phi, slice => {
            let range = slice.params;
            let isBottom = slice.index < bottomLayers;
            let isTop = topLayers && slice.index > slices.length - topLayers - 1;
            let isDense = range.sliceFillSparse > CONSTANTS.DENSE_INFILL_THRESHOLD;
            let isSolid = (isBottom || ((isTop || isDense) && !vaseMode));
            let solidWidth = isSolid ? range.sliceFillWidth || 1 : 0;
            if (solidWidth) {
                let fillSpace = fillSpacing * solidWidth;
                layerMakeSolid({ slice, spacing: fillSpace, angle: sliceFillAngle });
            }
            if (slice.index === slices.length - 1) {
                slice.isFlatsLayer = true;
            }
            sliceFillAngle = (sliceFillAngle + 90.0) % 360;
        }, "solid layers");
    }

    /**
     * Process layer diffs and project solid areas
     */
    async function processLayerDiffs(plo, phi) {
        let div = divide(plo, phi, [ 0.9, 0.05, 0.05 ]);
        // boolean diff layers to detect bridges and flats
        profileStart("delta");
        forSlices(div[0].lo, div[1].hi, slice => {
            let params = slice.params || process;
            let solidMinArea = params.sliceSolidMinArea;
            let sliceMinThick = params.sliceSolidMinThick;
            let sliceFillGrow = params.sliceFillGrow;
            layerDiff(slice, { area: solidMinArea, grow: sliceFillGrow, thick: sliceMinThick });
        }, "layer deltas");
        profileEnd();
        // project bridges and flats up and down into part
        profileStart("delta-project");
        forSlices(div[1].lo, div[1].hi, slice => {
            let params = slice.params || process;
            topLayers = params.sliceTopLayers || 0;
            bottomLayers = params.sliceBottomLayers || 0;
            if (topLayers) projectFlats(slice, topLayers);
            if (bottomLayers) projectBridges(slice, bottomLayers);
            if (slice.flats) POLY.setZ(slice.flats, slice.z);
        }, "layer deltas");
        profileEnd();
        // union solid areas
        profileStart("solid-union");
        forSlices(div[2].lo, div[2].hi, slice => {
            if (slice.solids) {
                slice.solids = POLY.union(slice.solids, 0, true);
            }
        });
        profileEnd();
    }

    /**
     * Process solid fill patterns
     */
    async function processSolidFills(plo, phi) {
        profileStart("solid-fill")
        let promises = isConcurrent ? [] : undefined;
        let div = divide(plo, phi, promises ? [ 0.8, 0.2 ] : [ 1 ]);
        forSlices(div[0].lo, div[0].hi, slice => {
            let params = slice.params || process;
            let solidWidth = params.sliceFillWidth || 1;
            let fillSpace = fillSpacing * solidWidth;
            let solidMinArea = params.sliceSolidMinArea;
            layerFillSolids({ slice, spacing: fillSpace, angle: sliceFillAngle, minArea: solidMinArea, promises });
            sliceFillAngle = (sliceFillAngle + 90.0) % 360;
        }, "fill solids");
        // very last layer (top) is set to finish solid rate
        slices.last().finishSolids = true
        if (promises) {
            await tracker(promises, (i, t) => {
                trackupdate(i / t, div[1].lo, div[1].hi);
            });
        }
        profileEnd();
    }

    /**
     * Process sparse infill patterns
     */
    async function processSparseInfill(plo, phi) {
        let lastType;
        let promises = isConcurrent ? [] : undefined;
        let div = divide(plo, phi, promises ? [ 0.8, 0.2 ] : [ 1 ]);
        forSlices(div[0].lo, div[0].hi, slice => {
            let params = slice.params || process;
            if (!params.sliceFillSparse) {
                return;
            }
            let newType = params.sliceFillType;
            layerSparseFill(slice, {
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
                trackupdate(i / t, div[1].lo, div[1].hi);
            });
        }
        // filter out tiny fill points less than nozzle diameter
        // if (false)
        for (let slice of slices) {
            for (let top of slice.tops) {
                if (top.fill_sparse)
                top.fill_sparse = top.fill_sparse.filter(p => p.perimeter() >= lineWidth);
            }
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
    }

    /**
     * Process support structure fills
     */
    async function processSupportFills(plo, phi) {
        profileStart("support-fill");
        let promises = false && isConcurrent ? [] : undefined;
        let div = divide(plo, phi, promises ? [ 0.8, 0.2 ] : [ 1 ]);
        forSlices(div[0].lo, div[0].hi, slice => {
            let params = slice.params || process;
            let density = params.sliceSupportDensity;
            layerSupportFill({
                angle: process.sliceSupportFill,
                density,
                isBelt,
                lineWidth,
                outline: process.sliceSupportOutline !== false,
                promises,
                slice,
            });
        }, "support fill");
        if (promises) {
            await tracker(promises, (i, t) => {
                trackupdate(i / t, div[1].lo, div[1].hi);
            });
        }
        profileEnd();
    }

    /**
     * Process brick/interleave mode slicing
     */
    async function processBrickMode() {
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

    async function renderSlices(plo, phi) {
        forSlices(plo, phi, slice => {
            let params = slice.params || process;
            layerRender(slice, params, {
                dark: controller.dark,
                devel: controller.devel,
                renderContext
            });
        }, "render");
    }

    async function processSlices() {
        // alert non-manifold parts
        if (healed) {
            onupdate(null, null, "part may not be manifold");
        }

        // reverse slices to perform these ops top-down
        // remove all empty slices above part but leave below
        // for multi-part (multi-extruder) setups where the void is ok
        let found = false;
        slices = slices.reverse().filter(slice => {
            if (slice.tops.length) {
                return found = true;
            } else {
                return found;
            }
        }).reverse();

        // inject one empty slice at the top so that
        // top layer flats are detected properly
        slices.push(newSlice(slices.peek().index + 1));

        // attach slices to widget since the
        // variable will not be replaced after this
        widget.slices = slices;

        // exit if no slices detected with tops
        if (!slices || slices.length === 0) {
            return;
        }

        // connect slices into linked list for island/bridge projections
        for (let i=1; i<slices.length; i++) {
            slices[i-1].up = slices[i];
            slices[i].down = slices[i-1];
        }

        // attach range params to each slice
        // should slice.index be recalculated after filtering?
        for (let slice of slices) {
            slice.params = getRangeParameters(process, slice.index);
        }

        // reset solids, support projections, and other annotations
        for (let slice of slices) {
            slice.extruder = extruder;
            slice.solids = [];
            slice.widget = widget;
        }

        // process solid layers (top/bottom)
        await processSolidLayers(0.10, 0.20);

        // add lead in anchor when specified in belt mode (but not for synths)
        if (isBelt) {
            // generate belt anchor
            generateBeltAnchor({
                slices,
                widget,
                process,
                lineWidth,
                sliceHeight,
                sliceHeightBase,
                extruder
            });

            // calculate smin for pooch text embossing
            let smin = Infinity;
            for (let slice of slices) {
                if (slice.belt && slice.belt.miny < smin) {
                    smin = slice.belt.miny;
                }
            }

            // experimental emboss text on flat underside
            embossBeltPooch({
                slices,
                widget,
                process,
                lineWidth,
                smin
            });
        }

        // calculations only relevant when solid layers are used
        // layer boolean diffs need to be computed to find flat areas to fill
        // and overhangs that need to be supported. these are stored in flats
        // and bridges, projected up/down, and merged into an array of solids
        // for "real" objects, fill the remaining voids with sparse fill
        // sparse layers only present when non-vase mode and sparse % > 0
        if (!vaseMode) {
            await processLayerDiffs(0.2, 0.4);
            // support generation using either
            // enclosed shadow or manual painted supports
            await processSupports(0.4, 0.5);
            await processSolidFills(0.5, 0.6);
            await processSparseInfill(0.6, 0.8);
        }

        // fill all supports (auto and manual)
        if (supportDensity) {
            await processSupportFills(0.8, 0.84);
        }

        // brick/interleave mode processing
        if (isBrick) {
            await processBrickMode(0.84, 0.85);
        }

        // render if not explicitly disabled
        if (render) {
            await renderSlices(0.85, 1.0);
        }

        if (isBelt) {
            finalizeBeltBounds({ slices, widget });
        }
    }
}

// replace with tip2tipEmit?
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

/**
 * Render slice visualization for preview
 * @param {Slice} slice - Slice to render
 * @param {SliceParams} params - Slice parameters
 * @param {Object} opt - Render options
 * @param {boolean} opt.dark - Use dark color scheme
 * @param {boolean} opt.devel - Enable development visualization
 * @param {RenderContext} opt.renderContext - Rendering context
 */
function layerRender(slice, params, opt = {}) {
    const { dark, devel, renderContext: ctx } = opt;
    const { offset, isThin, isFlat } = ctx;

    const Color = dark ? COLOR_DARK : COLOR;
    const output = slice.output();
    const height = slice.height / 2;
    const solidWidth = params.sliceFillWidth || 1;

    if (slice.tops?.length)
    for (let top of slice.tops) {
        if (isThin) output
            .setLayer('part', Color.part)
            .addPolys([top.poly]);

        if (top.shells?.length) output
            .setLayer("shells", Color.shell)
            .addPolys(top.shells || [], vopt({ offset, height, clean: true }, ctx));

        if (isThin && top.thin_wall?.length) output
            .setLayer("walls", Color.thin)
            .addPolys(top.thin_wall.map(a => a.map(p => newPolygon().centerCircle(p, p.r, 12).setZ(slice.z))).flat(), vopt({ offset, height }, ctx));

        if (!isThin && top.thin_wall?.length) output
            .setLayer("walls", Color.thin)
            .addPolys(top.thin_wall.map(a =>
                    a.length === 1 ?
                    newPolygon().centerCircle(a[0], a[0].r/2, 12) :
                    newPolygon(a.map(p => newPoint(p.x, p.y)))
                        .setZ(slice.z)
                        .closeIf(height)
                ), vopt({ offset, height }, ctx));

        if (top.fill_lines?.length) output
            .setLayer("solid fill", Color.fill)
            .addLines(top.fill_lines || [], vopt({ offset: offset * solidWidth, height, z:slice.z }, ctx));

        if (!(slice.belt?.anchor)) output
            .setLayer("sparse fill", Color.infill)
            .addPolys(top.fill_sparse || [], vopt({ offset, height, outline: true, trace:true }, ctx))

        if (slice.belt?.anchor) output
            .setLayer("anchor", Color.anchor)
            .addPolys(top.fill_sparse || [], vopt({ offset, height, outline: true, trace:true }, ctx))

        if (top.thin_fill?.length) output
            .setLayer("thin fill", Color.thin)
            .addLines(top.thin_fill, vopt({ offset, height }, ctx));

        if (top.gaps?.length && devel) output
            .setLayer("gaps", Color.gaps)
            .addPolys(top.gaps, vopt({ offset, height, thin: true }, ctx));

        if (isThin && devel && top.fill_off?.length) {
            slice.output()
                .setLayer('fill inset', Color.inset)
                .addPolys(top.fill_off)
                .setLayer('last', { face: 0, line: 0x008888, check: 0x008888 })
                .addPolys(top.last);
        }
    }

    if (isThin && devel) {
        if (slice.solids?.length) output
            .setLayer("solids", { face: 0xbbbb00, check: 0xbbbb00 })
            .addAreas(slice.solids);

        if (slice.bridges?.length) output
            .setLayer("bridges", { face: 0x00cccc, line: 0x00cccc, check: 0x00cccc })
            .addAreas(slice.bridges);

        if (slice.flats?.length) output
            .setLayer("flats", { face: 0xaa00aa, line: 0xaa00aa, check: 0xaa00aa })
            .addAreas(slice.flats);
    }

    if (slice.supports && params.sliceSupportOutline) output
        .setLayer("support", Color.support)
        .addPolys(slice.supports, vopt({ offset, height }, ctx));

    if (slice.supports) slice.supports.forEach(poly => {
        if (poly.fill) output
            .setLayer("support", Color.support)
            .addLines(poly.fill, vopt({ offset, height }, ctx));
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

/**
 * DRIVER SLICE CONTRACT
 * 
 * global slice operation run after all individual widget slice() complete
 */
export function slicePost(settings, onupdate) {
    // future home of brim and anchor generation
    let widgets = Object.values(self.kiri_worker.cache)
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

    // remove anchor slices from other widgets (only with multi-material)
    if (ext.length > 1) {
        // give first widget a pass since it should have the anchor
        for (let w of widgets.slice(1)) {
            w.slices = w.slices.filter(s => s.index >= 0);
        }
    }
}

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
export function layerProcessTops(slice, count, offset1, offsetN, fillOffset, opt = {}) {
    for (let top of slice.tops) {
        layerProcessTop(slice.z, top, count, offset1, offsetN, fillOffset, opt);
    }
}

/**
 * Create an entirely solid layer by filling all top polygons
 * with an alternating pattern.
 *
 * @param {Object} args - Options object
 * @param {Slice} args.slice - Slice to fill
 * @param {number} args.spacing - Fill line spacing in mm
 * @param {number} args.angle - Fill angle in degrees
 */
function layerMakeSolid({ slice, spacing, angle }) {
    if (slice.xray) {
        return;
    }

    if (slice.tops.length === 0 || typeof(angle) != 'number') {
        slice.isSolidLayer = false;
        return;
    }

    slice.tops.forEach(function(top) {
        if (!top.fill_off) return; // missing for inner brick layers
        let lines = POLY.fillArea(top.fill_off, angle, spacing, null);
        top.fill_lines.appendAll(lines);
    });

    slice.isSolidLayer = true;
};

/**
 * Take output from pluggable sparse infill algorithm and clip to
 * the bounds of the top polygons and their inner solid areas.
 */
function layerSparseFill(slice, options = {}) {
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
        options.promises.push(self.kiri_worker.minions.clip(slice, polys, lines));
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
export function layerDiff(slice, options = {}) {
    const { sla, grow, area, thick } = options;

    if (slice.index < 0 || slice.xray) {
        return;
    }

    let boundary = !(slice.up && slice.down),
        top = slice,
        down = slice.down || newSlice(-1),
        topInner = sla ? top.topPolys() : top.topInners(),
        downInner = sla ? down.topPolys() : down.topInners(),
        bridges = top.bridges = [],
        flats = down.flats = [];

    // skip diffing layers that are identical
    if (!boundary && slice.fingerprintSame(down)) {
        top.bridges = bridges;
        down.flats = flats;
        // console.log(slice.z, 'layer fingerprint match');
        return;
    }

    let newBridges = [];
    let newFlats = [];

    POLY.subtract(topInner, downInner, newBridges, newFlats, slice.z, area, {
        wasm: true
    });

    // console.log(slice.z, { newBridges, newFlats });
    newBridges = newBridges.filter(p => p.areaDeep() >= area && p.thickness(true) >= thick);
    newFlats = newFlats.filter(p => p.areaDeep() >= area && p.thickness(true) >= thick);

    if (grow > 0 && newBridges.length) {
        newBridges = POLY.offset(newBridges, grow, { z: slice.z });
    }
    if (grow > 0 && newFlats.length) {
        newFlats = POLY.offset(newFlats, grow, { z: slice.z });
    }

    bridges.appendAll(newBridges);
    flats.appendAll(newFlats);
}

/**
 * Fill projected solid areas and store line data
 * 
 * @param {Object} args - Options object
 * @param {Slice} args.slice - Slice to process
 * @param {number} args.spacing - Fill line spacing in mm
 * @param {number} args.angle - Fill angle in degrees
 * @param {number} [args.minArea] - Minimum polygon area in mm² (default: 1)
 * @param {Promise[]} [args.promises] - Array for async operations
 * @return {boolean} true if filled, false if not
 */
function layerFillSolids({ slice, spacing, angle, minArea, promises: fillQ }) {
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
                // if the solid area > threshold of the top area, make entire layer solid
                if (stop_area / tops_area > CONSTANTS.SOLID_LAYER_COVERAGE_THRESHOLD) {
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
        layerMakeSolid({ slice, spacing, angle });
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
            areaFill({ promises: fillQ, polys: tofill, angle, spacing, output: newfill });
        }
        if (angfill.length > 0) {
            top.fill_lines_ang = {spacing:spacing,list:[],poly:[]};
            for (let af of angfill) {
                areaFill({
                    promises: fillQ,
                    polys: [af],
                    angle: af.fillang.angle + CONSTANTS.ANGLED_FILL_ROTATION,
                    spacing,
                    output: newfill
                });
            }
        }
    }
}

/**
 * Fill area with line pattern
 * 
 * @param {Object} args - Options object
 * @param {Promise[]} [args.promises] - Array for async operations
 * @param {Polygon[]} args.polys - Polygons to fill
 * @param {number} args.angle - Fill angle in degrees
 * @param {number} args.spacing - Fill line spacing in mm
 * @param {Array} args.output - Output array for fill lines
 * @param {number} [args.minLen] - Minimum line length
 * @param {number} [args.maxLen] - Maximum line length
 */
function areaFill({ promises: fillQ, polys, angle, spacing, output, minLen, maxLen }) {
    if (fillQ) {
        fillQ.push(self.kiri_worker.minions.fill(polys, angle, spacing, output, minLen, maxLen));
    } else {
        POLY.fillArea(polys, angle, spacing, output, minLen, maxLen);
    }
}

/**
 * Generate support structure fill patterns for a slice
 *
 * @param {SupportFillOptions} args - Configuration object
 * @param {Promise[]} [args.promises] - Array for async fill operations (concurrent mode)
 * @param {Slice} args.slice - Current slice to process
 * @param {number} args.lineWidth - Extrusion width in mm (typically nozzle diameter)
 * @param {number} args.density - Fill density from 0.0 (0%) to 1.0 (100%)
 *                                 Typical support density is 0.10-0.25 (10-25%)
 * @param {boolean} args.isBelt - True for belt printer mode (affects auto-angle calculation)
 * @param {number} [args.angle] - Fill angle in degrees. Special values:
 *                                 - undefined/null: Auto-calculate based on polygon shape
 *                                 - >= 1000: Auto-calculate (1000=0° for tall, 1090=90° for wide)
 *                                 - 0-360: Use specified angle
 * @param {boolean} args.outline - Include support perimeter outline in output
 *                                  If false, only interior fill lines are generated
 *
 * @modifies {Slice} slice.supports - Updated with filled support polygons (array of Polygon)
 *                                     Each polygon has a .fill property with fill lines
 *
 * @see supportPolyFill - Called internally to generate fill patterns
 * @see CONSTANTS.SUPPORT_INSET_RATIO - Inset ratio (1/3 of line width)
 * @see CONSTANTS.SUPPORT_AUTO_ANGLE_WIDE - Auto angle for wide polygons (1090 = 90°)
 * @see CONSTANTS.SUPPORT_AUTO_ANGLE_TALL - Auto angle for tall polygons (1000 = 0°)
 * @see CONSTANTS.SUPPORT_CONNECT_DISTANCE_MULT - Distance multiplier for line connection (2x)
 */
function layerSupportFill({ promises, slice, lineWidth, density, isBelt, angle, outline, gap }) {
    let polys = slice.supports;
    if (polys) {
        supportPolyFill({
            angle,
            density,
            isBelt,
            lineWidth,
            outline,
            polys,
            promises,
            z: slice.z
        });
    }
}

/**
 * Generate fill patterns for individual support polygons
 *
 * This is an internal helper function called by doSupportFill() that processes each support
 * polygon individually to generate the hatching fill patterns. It handles:
 * - Automatic fill angle calculation based on polygon aspect ratio
 * - Intelligent inset to prevent perimeter over-extrusion
 * - Optional line connection to reduce travel moves when no outline is needed
 *
 * @param {Object} args - Configuration object
 * @param {Promise[]} [args.promises] - Array for async fill operations (concurrent mode)
 *                                       Pass same array through all calls for parallelism
 * @param {Polygon[]} args.polys - Array of support polygons to fill
 *                                  Must have valid .bounds property for aspect ratio calculation
 * @param {number} args.lineWidth - Extrusion width in mm (typically 0.4mm for 0.4mm nozzle)
 * @param {number} args.density - Fill density from 0.0 (0%) to 1.0 (100%)
 *                                 Typical support values: 0.10-0.25 (10-25%)
 *                                 Higher density = stronger support but harder to remove
 * @param {number} args.z - Current Z height in mm (for polygon operations)
 * @param {boolean} args.isBelt - True for belt printer mode
 *                                 Forces use of SUPPORT_AUTO_ANGLE_WIDE (1090/90°)
 * @param {number} [args.angle] - Fill angle in degrees. Special values:
 *                                 - undefined/null: Auto-calculate based on polygon aspect ratio
 *                                 - >= 1000: Auto-calculate (1000=0° for tall, 1090=90° for wide)
 *                                 - 0-360: Use specified angle
 * @param {boolean} args.outline - Controls line connection behavior:
 *                                  - true: Keep individual fill lines (for support with perimeter)
 *                                  - false: Connect nearby lines to reduce travel moves
 *
 * @modifies {Polygon} Each poly in polys array gets a new .fill property containing:
 *                     - Array of Polygon objects representing fill lines
 *                     - Lines are either individual segments (outline=true) or
 *                       connected paths (outline=false) for travel reduction
 * 
 * @see layerSupportFill - Parent function that calls this after clipping/union
 * @see areaFill - Lower-level function that generates the actual scan lines
 * @see connect_lines - Utility that connects nearby line segments
 * @see CONSTANTS.SUPPORT_AUTO_ANGLE_WIDE - Auto angle for wide polygons (1090 = 90°)
 * @see CONSTANTS.SUPPORT_AUTO_ANGLE_TALL - Auto angle for tall polygons (1000 = 0°)
 * @see CONSTANTS.SUPPORT_INSET_RATIO - Inset ratio for fill area (1/3)
 * @see CONSTANTS.SUPPORT_CONNECT_DISTANCE_MULT - Distance multiplier for line connection (2x)
 */
function supportPolyFill({ promises, polys, lineWidth, density, z, isBelt, angle, outline }) {
    // calculate fill density
    let spacing = lineWidth * (1 / density);
    for (let poly of polys) {
        // calculate angle based on width/height ratio
        let auto = isBelt || (poly.bounds.width() / poly.bounds.height() > 1) ?
            CONSTANTS.SUPPORT_AUTO_ANGLE_WIDE :
            CONSTANTS.SUPPORT_AUTO_ANGLE_TALL;
        // inset support poly for fill lines
        let inset = POLY.offset([poly], -lineWidth * CONSTANTS.SUPPORT_INSET_RATIO, {flat: true, z, wasm: true});
        // do the fill
        if (inset && inset.length > 0) {
            areaFill({
                angle: angle || auto,
                output: poly.fill = [],
                polys: inset,
                promises,
                spacing
            });
            if (!outline && poly.fill.length) {
                poly.fill = connect_lines(poly.fill, spacing * CONSTANTS.SUPPORT_CONNECT_DISTANCE_MULT);
            }
        }
    }
}

/**
 * Project solid areas up or down through slices
 * 
 * @param {Object} args - Options object
 * @param {Slice} args.slice - Current slice
 * @param {Polygon[]} args.polys - Polygons to project
 * @param {number} args.count - Number of layers to project
 * @param {boolean} args.up - Project upward (true) or downward (false)
 * @param {boolean} args.first - First projection (hint fill angles)
 */
function projectSolid({ slice, polys, count, up, first }) {
    if (slice && !up && count === 1) {
        slice.isBridgeLayer = true;
    }

    if (!slice || count <= 0) {
        return;
    }

    let clones = polys.clone(true);
    if (first) {
        for (let clone of clones) {
            clone.hintFillAngle();
        }
    }

    if (slice.solids) {
        slice.solids.appendAll(clones);
    } else if (clones && clones.length) {
        console.log({no_solids_in: slice, for: clones})
    }

    if (count > 0) {
        projectSolid({
            count: count - 1,
            first: false,
            polys,
            slice: up ? slice.up : slice.down,
            up
        });
    }
}

/**
 * project bottom flats down into part
 */
export function projectFlats(slice, count, expand) {
    if (!slice.down || !slice.flats) return;
    // these flats are marked for finishing print speed
    if (slice.flats?.length) {
        slice.finishSolids = true;
        slice.isFlatsLayer = true;
        const polys = expand ? POLY.expand(slice.flats, expand) : slice.flats;
        projectSolid({ slice, polys, count, up: false, first: true });
    }
}

/**
 * project top bridges up into part
 */
export function projectBridges(slice, count, expand) {
    if (!slice.up || !slice.bridges) return;
    // these bridges are marked for finishing print speed
    if (slice.bridges?.length) {
        slice.finishSolids = true;
        slice.isBridgeLayer = true;
        const polys = expand ? POLY.expand(slice.bridges, expand) : slice.bridges;
        projectSolid({ slice, polys, count, up: true, first: true });
    }
}
