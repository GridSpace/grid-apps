/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Belt printer specific functions for FDM slicing
 * Handles anchor generation, text embossing, and belt-specific bounds
 */

import { newPolygon } from '../../../../geo/polygon.js';
import { newBounds } from '../../../../geo/bounds.js';
import { newSlice } from '../../../core/slice.js';
import { getRangeParameters } from '../core/params.js';

// Import constants from slice.js
// These would ideally be shared, but for now we'll define locally
const BELT = {
    PRECISION_ROUNDING: 3,
    PEEK_LAYERS: 5,
    ANCHOR_BUMP_SPACING_MULT: 2,
    MIN_WIDTH_FOR_HATCH: 10,
    HATCH_SPACING: 3,
    POOCH_Y_RANGE_MIN: 0,
    POOCH_Y_RANGE_MAX: 3,
    POOCH_FLATNESS_TOLERANCE: 0.01,
    POOCH_WIDTH_TOLERANCE: 1,
    POOCH_DY_TOLERANCE: 0.1,
    POOCH_DZ_TOLERANCE: 1,
    POOCH_TEXT_SCALE_X: 1.2,
    POOCH_TEXT_SCALE_Y: 1,
    POOCH_FONT_SIZE: 24,
    POOCH_PIXEL_THRESHOLD: 30,
};

/**
 * Generate belt anchor for lead-in adhesion
 *
 * Creates a lead-in anchor section before the actual part begins printing.
 * The anchor helps adhesion on belt printers by providing a larger contact area.
 * Optionally adds "bumps" to the anchor for improved adhesion.
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.slices - Array of slices to process
 * @param {Object} options.widget - Widget being sliced
 * @param {Object} options.process - Process parameters
 * @param {number} options.lineWidth - Extrusion width in mm
 * @param {number} options.sliceHeight - Layer height in mm
 * @param {number} options.sliceHeightBase - First layer height in mm
 * @param {number} options.extruder - Extruder index
 * @returns {void} Modifies slices array in place
 */
export function generateBeltAnchor({ slices, widget, process, lineWidth, sliceHeight, sliceHeightBase, extruder }) {
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
        slice.belt = { miny, touch: miny.round(BELT.PRECISION_ROUNDING) < sliceHeightBase };
    }

    // find max width of first N layers for brim additions
    let start;
    let minx = Infinity, maxx = -Infinity;
    let peek = 0;
    for (let slice of slices) {
        if (slice.tops.length && peek++ < BELT.PEEK_LAYERS) {
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
        let splat = newPolygon().add(minx, y, z).add(maxx, y, z).setOpen();
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
            let y = count++ * -start.height * BELT.ANCHOR_BUMP_SPACING_MULT;
            if (-y > bump) {
                count--;
            }
            let first = poly.first();
            // add up/over/down to anchor line (close = down)
            // which completes the bump perimeter
            poly.push(poly.last().add({x:0, y, z:0}));
            poly.push(poly.first().add({x:0, y, z:0}));
            poly.setClosed();
            if (count > 2 && maxx - minx > BELT.MIN_WIDTH_FOR_HATCH) {
                // add vertical hatch lines inside bump shell
                let mp = (maxx + minx) / 2;
                let dx = (maxx - minx - 2);
                dx = (Math.floor(dx / BELT.HATCH_SPACING) * BELT.HATCH_SPACING) / 2;
                let fy = first.y;
                let fz = first.z;
                let n2 = lineWidth / 2;
                for (let x = mp - dx; x <= mp + dx ; x += BELT.HATCH_SPACING) {
                    add.push(newPolygon().add(x, fy - n2, fz).add(x, fy + y + n2, fz).setOpen() );
                }
            }
        }
    }
}

/**
 * Experimental: Emboss text on flat underside of belt-printed object
 *
 * Scans for flat underside surfaces and embosses specified text using
 * canvas rendering and pixel detection. The text is converted to support
 * patterns that create raised or recessed text on the bottom surface.
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.slices - Array of slices to process
 * @param {Object} options.widget - Widget being sliced
 * @param {Object} options.process - Process parameters
 * @param {number} options.lineWidth - Extrusion width in mm
 * @param {number} options.smin - Minimum belt Y offset
 * @returns {void} Modifies slice.supports arrays
 */
export function embossBeltPooch({ slices, widget, process, lineWidth, smin }) {
    if (!process.pooch || !self.OffscreenCanvas) {
        return;
    }

    const { length, width, height, text } = process.pooch;
    const { slope } = widget.belt;
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
                let y_ok = p0y > BELT.POOCH_Y_RANGE_MIN && p0y < BELT.POOCH_Y_RANGE_MAX &&
                          Math.abs(p0y - p1y) < BELT.POOCH_FLATNESS_TOLERANCE;
                let x_ok = Math.abs(width - Math.abs(p1.x - p0.x)) < BELT.POOCH_WIDTH_TOLERANCE
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
    if (dy < BELT.POOCH_DY_TOLERANCE && dz < BELT.POOCH_DZ_TOLERANCE) {
        // console.log('FOUND', { firstI, lastI, minX, maxX, maxY });
        let span = lastI - firstI - 2; // x = down the belt
        let tall = width * 2;
        let can = new self.OffscreenCanvas(span, tall);
        let ctx = can.getContext("2d");
        ctx.scale(BELT.POOCH_TEXT_SCALE_X, BELT.POOCH_TEXT_SCALE_Y);
        ctx.font = `${BELT.POOCH_FONT_SIZE}px sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.fillText(text, 1, tall - 1);
        let img = ctx.getImageData(0, 0, span, tall).data.buffer;
        let rgb = new Uint32Array(img);

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
                str += pix > BELT.POOCH_PIXEL_THRESHOLD ? '*' : '-';
                maxp = Math.max(maxp, pix);
                if (pix > BELT.POOCH_PIXEL_THRESHOLD) {
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
                    supps.push(newPolygon()
                        .add(minX + line.start / 2, y, z)
                        .add(minX + line.end / 2, y, z)
                        .setOpen()
                    );
                }
            }
        }
    }
}

/**
 * Finalize belt-specific bounds for widget tracking
 *
 * Calculates final Y-axis bounds for belt-printed parts,
 * used for positioning and collision detection.
 *
 * @param {Object} options - Configuration options
 * @param {Array} options.slices - Array of processed slices
 * @param {Object} options.widget - Widget being sliced
 * @returns {void} Modifies widget.belt properties
 */
export function finalizeBeltBounds({ slices, widget }) {
    let bounds = newBounds();
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
