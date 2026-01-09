/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { base, util } from '../base.js';
import { newPoint } from '../point.js';

/**
 * Arc detection utility functions for polygons.
 * These utilities detect and annotate circular arc sequences in polygon points.
 */

/**
 * Calculate the center point of a circle defined by three points.
 * Using perimeter length, finds 3 equally spaced points to compute circle center.
 *
 * @param {Polygon} poly - polygon assumed to be roughly circular
 * @returns {Point} center point of the circle
 */
export function calcCircleCenter(poly) {
    let pe = poly.perimeter(),
        pe1 = pe / 3, // point 2
        pe2 = pe1 * 2, // point 3
        p = poly.points,
        l = p.length,
        i = 1,
        td = 0,
        lp = p[0], // first point
        ap = [ lp ]; // array of 3 points
    while (i < l) {
        let np = p[i++];
        let d = lp.distTo2D(np);
        td += d;
        if (ap.length === 1 && td >= pe1) {
            ap.push(np);
        } else if (ap.length === 2 && (td >= pe2 || i >= l)) {
            ap.push(np);
            break;
        }
        lp = np;
    }
    let center = util.center2d(...ap);
    return newPoint(center.x, center.y, p[0].z, null);
}

/**
 * Iterate over polygon points and find sequences of 5 or more points
 * with a common center point and collect as midpoint/radius.
 *
 * @param {Polygon} poly - polygon to analyze
 * @param {Object} opt - options
 * @param {number} opt.tolerance - center matching tolerance (default 1e-2)
 * @param {boolean} opt.inside - require centers be inside polygon (default true)
 * @returns {Array} array of arc center records
 */
export function findArcCenters(poly, opt = {}) {
    if (poly.length < 6) return [];
    let tolerance = opt.tolerance || 1e-2,
        inside = opt.inside ?? true,
        seq = poly.points.slice(),
        util = base.util;
    if (poly.isClosed()) seq.appendAll(seq.slice(0,5));
    let recs = [], // accumulated arc points
        cand = []; // candidate center array
    for (let pos=3; pos<seq.length; pos++) {
        let next = util.circleCenter(...seq.slice(pos-3, pos));
        let prev = cand.peek();
        if (inside && !newPoint(next.x,next.y).inPolygon(poly)) {
            // require point be inside current polygon
            next = null;
        }
        if (next && !prev) {
            // seed candidate list
            cand.push(next);
            continue;
        }
        if (!next) {
            // next is a bust, reset candidate list
            cand.length = 0;
            continue;
        }
        if (util.dist2D(next,prev) < tolerance) {
            // add new candidate
            cand.push(next);
            continue;
        } else if (cand.length >= 3) {
            // emit record on 5 points
            recs.push(cand.peek());
        }
        // reset candidate array
        cand = [ next ];
    }
    if (cand.length >= 3) {
        recs.push(cand.peek());
    }
    // filter dups
    recs.sort((a,b) => {
        return util.dist2D(a,b);
    });
    recs = recs.filter((r,i) => {
        if (i > 0) {
            return util.dist2D(r, recs[i-1]) < tolerance*10 ? null : r;
        } else {
            return r;
        }
    });
    return recs;
}

/**
 * Detect and annotate arc sequences in polygon points.
 * When an arc is detected, the first point is annotated with arc metadata
 * and intermediate points remain in the array but should be skipped during emission.
 *
 * @param {Polygon} poly - polygon to analyze (will be mutated with arc annotations)
 * @param {Object} opts - detection options
 * @param {number} opts.tolerance - arc detection tolerance (default 0.1)
 * @param {number} opts.arcRes - arc resolution in degrees (default 1)
 * @param {number} opts.minPoints - minimum points to consider an arc (default 4)
 * @returns {Polygon} this polygon with arc annotations
 */
export function detectArcs(poly, opts = {}) {
    const {
        tolerance = 0.1,
        arcRes = 1,
        minPoints = 4
    } = opts;

    const points = poly.points;
    const length = points.length;
    const arcResRadians = arcRes * (Math.PI / 180);

    if (length < minPoints) {
        return poly;
    }

    // Clear any existing arc annotations
    for (let p of points) {
        delete p.arc;
    }

    let i = 0;
    // Process all points except we can't start an arc at the last point
    // because we need at least minPoints to form an arc
    while (i < length - minPoints + 1) {
        // Try to detect arc starting at position i
        const arcData = detectArcAt(poly, i, points, length, tolerance, arcResRadians, minPoints);

        if (arcData) {
            // Annotate the starting point
            points[i].arc = arcData;
            // Skip past the arc points
            i += arcData.skip + 1; // +1 to move to point after arc end
        } else {
            i++;
        }
    }

    return poly;
}

/**
 * Try to detect an arc starting at the given index.
 * Uses a greedy approach: grow the arc as long as possible, then validate.
 *
 * @private
 * @param {Polygon} poly - polygon being analyzed
 * @param {number} startIdx - starting index
 * @param {Point[]} points - polygon points
 * @param {number} length - points length
 * @param {number} tolerance - detection tolerance
 * @param {number} arcRes - arc resolution
 * @param {number} minPoints - minimum points for arc
 * @returns {Object|null} arc data or null if no arc detected
 */
function detectArcAt(poly, startIdx, points, length, tolerance, arcRes, minPoints) {
    // Greedy approach: collect as many points as possible that might form an arc
    let candidates = [];

    for (let idx = startIdx; idx < length; idx++) {
        const p1 = points[idx];

        // Last point - add and done
        if (idx >= length - 1) {
            candidates.push(p1);
            break;
        }

        const p2 = points[idx + 1];

        // Skip duplicate points
        if (p1.distTo2D(p2) < 0.001) {
            break;
        }

        candidates.push(p1);

        // Stop if we've collected enough to test
        if (candidates.length >= minPoints) {
            // Try to validate the arc with current candidates
            const arcData = validateArc(poly, candidates, tolerance, arcRes, minPoints);

            if (!arcData) {
                // Current set doesn't form valid arc, back up one point
                candidates.pop();
                break;
            }
        }
    }

    // Final validation with all collected candidates
    return validateArc(poly, candidates, tolerance, arcRes, minPoints);
}

/**
 * Validate if a set of points forms a valid arc.
 *
 * @private
 * @param {Polygon} poly - polygon being analyzed
 * @param {Point[]} arcPoints - candidate arc points
 * @param {number} tolerance - detection tolerance
 * @param {number} arcRes - arc resolution
 * @param {number} minPoints - minimum points for arc
 * @returns {Object|null} arc data or null if invalid
 */
function validateArc(poly, arcPoints, tolerance, arcRes, minPoints) {
    if (arcPoints.length < minPoints) {
        return null;
    }

    // Calculate center using well-distributed points
    const center = findBestCenter(arcPoints, tolerance);
    if (!center) {
        return null;
    }

    // Check if all points lie on the circle within tolerance
    let maxRadiusError = 0;
    let sumRadiusError = 0;

    for (let i = 0; i < arcPoints.length; i++) {
        const p = arcPoints[i];
        const radius = Math.hypot(p.x - center.x, p.y - center.y);
        const radiusError = Math.abs(radius - center.r);

        maxRadiusError = Math.max(maxRadiusError, radiusError);
        sumRadiusError += radiusError;

        // Hard limit on any single point
        if (radiusError > tolerance * 2) {
            return null;
        }
    }

    // Check average error is reasonable
    const avgRadiusError = sumRadiusError / arcPoints.length;
    if (avgRadiusError > tolerance) {
        return null;
    }

    // Check angular resolution (don't want points too far apart)
    for (let i = 0; i < arcPoints.length - 1; i++) {
        const curr = arcPoints[i];
        const next = arcPoints[i + 1];
        const dist = curr.distTo2D(next);
        const radius = Math.hypot(curr.x - center.x, curr.y - center.y);

        if (radius > 0) {
            const angle = 2 * Math.asin(Math.min(1, dist / (2 * radius)));
            if (Math.abs(angle) > arcRes) {
                return null;
            }
        }
    }

    // Determine arc direction
    const p0 = arcPoints[0];
    const p1 = arcPoints[Math.min(1, arcPoints.length - 1)];
    const vec1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const vec2 = { x: center.x - p0.x, y: center.y - p0.y };
    const cross = vec1.x * vec2.y - vec1.y * vec2.x;
    const clockwise = cross < 0;

    return {
        center: newPoint(center.x, center.y, p0.z),
        clockwise,
        skip: arcPoints.length - 1
    };
}

/**
 * Find the best-fit center for a set of arc points.
 *
 * @private
 * @param {Point[]} arcPoints - candidate arc points
 * @param {number} tolerance - detection tolerance
 * @returns {Object|null} center with x, y, r properties or null
 */
function findBestCenter(arcPoints, tolerance) {
    const len = arcPoints.length;

    // Use 3 well-spaced points for initial center calculation
    let idx1 = 0;
    let idx2 = Math.floor(len / 2);
    let idx3 = len - 1;

    // If first and last are very close (near-circle), use different points
    if (arcPoints[idx1].distTo2D(arcPoints[idx3]) < tolerance * 2) {
        idx1 = Math.floor(len * 0.25);
        idx2 = Math.floor(len * 0.5);
        idx3 = Math.floor(len * 0.75);
    }

    const center = util.center2d(
        arcPoints[idx1],
        arcPoints[idx2],
        arcPoints[idx3],
        1
    );

    if (!center || center.hasNaN?.() || !isFinite(center.r)) {
        return null;
    }

    return center;
}
