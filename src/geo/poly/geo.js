/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { base, config, util } from '../base.js';
import { calc_normal, calc_vertex } from '../paths.js';
import { newPolygon, slopeDiff } from '../polygon.js';

/**
 * Geometric utility functions for polygons.
 * These are extracted from the Polygon class to improve modularity.
 * All functions take a polygon as the first parameter.
 */

/**
 * Remove points that are closer than `dist` to the previous point.
 * Returns a new polygon with filtered points, or null if result would have < 2 points.
 *
 * @param {Polygon} poly - source polygon
 * @param {number} dist - minimum distance between points (defaults to precision_merge)
 * @returns {Polygon|null} new filtered polygon or null
 */
export function debur(poly, dist) {
    if (poly.length < 2) {
        return null;
    }
    const pa = poly.points,
        pln = pa.length,
        open = poly.open,
        newp = newPolygon().copyZ(poly.getZ()),
        min = dist || base.config.precision_merge;
    let lo;
    newp.push(lo = pa[0]);
    for (let i = 1; i < pln; i++) {
        if (lo.distTo2D(pa[i]) >= min) {
            newp.push(lo = pa[i]);
        }
    }
    newp.open = open;
    newp.parent = poly.parent;
    if (newp.length < 2) {
        return null;
    }
    return newp;
}

/**
 * Calculate miter joins for polygon points where angle exceeds 90 degrees.
 * Returns either the original polygon or a new one with miter adjustments.
 *
 * @param {Polygon} poly - source polygon
 * @param {boolean} debug - debug flag
 * @returns {Polygon} polygon with miters applied
 */
export function miter(poly, debug) {
    if (poly.length < 3) return poly;

    const slo = [],
        pa = poly.points,
        pln = pa.length,
        open = poly.open;
    let last;
    for (let i = 1; i < pln; i++) {
        slo.push(pa[i - 1].slopeTo(last = pa[i]));
    }
    if (!open) {
        slo.push(last.slopeTo(pa[0]));
    }

    const ang = new Array(pln).fill(0);
    let redo = false;
    const aln = open ? pln - 1 : pln;
    for (let i = 1; i < aln; i++) {
        ang[i] = slopeDiff(slo[i - 1], slo[i]);
        redo |= ang[i] > 90;
    }
    if (!open) {
        ang[0] = slopeDiff(slo[pln - 1], slo[0]);
        redo |= ang[pln - 1] > 90;
        redo |= ang[0] > 90;
    }
    if (redo) {
        const newp = newPolygon().copyZ(poly.z);
        newp.open = open;
        for (let i = 0; i < pln; i++) {
            const p = pa[(i + pln) % pln];
            const d = ang[(i + pln) % pln];
            if (d > 179) {
                const s = slo[(i + pln) % pln];
                const pp = pa[(i + pln - 1) % pln];
                const ps = slo[(i + pln - 1) % pln];
                newp.push(p.follow(p.slopeTo(pp).normal(), 0.001));
                newp.push(p.follow(s.clone().normal().invert(), 0.001));
            } else if (d > 90) {
                const s = slo[(i + pln) % pln];
                const pp = pa[(i + pln - 1) % pln];
                const ps = slo[(i + pln - 1) % pln];
                newp.push(p.follow(p.slopeTo(pp), 0.001));
                newp.push(p.follow(s, 0.001));
            } else {
                p.parent = newp;
                newp.push(p);
            }
        }
        return newp;
    }
    return poly;
}

/**
 * Create convex hull from points and add to polygon (mutates polygon).
 * Only used in fdm/slice.js for enclosing supports.
 *
 * @param {Polygon} poly - target polygon (will be mutated)
 * @param {Point[]} points - points to form convex hull
 * @returns {Polygon} the mutated polygon
 */
export function createConvexHull(poly, points) {
    function removeMiddle(a, b, c) {
        let cross = (a.x - b.x) * (c.y - b.y) - (a.y - b.y) * (c.x - b.x);
        let dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
        return cross < 0 || cross == 0 && dot <= 0;
    }

    points.sort(function(a, b) {
        return a.x != b.x ? a.x - b.x : a.y - b.y;
    });

    let n = points.length;
    let hull = [];

    for (let i = 0; i < 2 * n; i++) {
        let j = i < n ? i : 2 * n - 1 - i;
        while (hull.length >= 2 && removeMiddle(hull[hull.length - 2], hull[hull.length - 1], points[j]))
            hull.pop();
        hull.push(points[j]);
    }

    hull.pop();
    poly.addPoints(hull);

    return poly;
}

/**
 * Find all intersections of a line segment with polygon edges.
 * Results are sorted by distance from lp1.
 *
 * @param {Polygon} poly - polygon to test
 * @param {Point} lp1 - line segment start
 * @param {Point} lp2 - line segment end
 * @param {boolean} deep - recurse into inner polygons
 * @returns {Point[]} array of intersection points
 */
export function intersections(poly, lp1, lp2, deep) {
    let list = [];
    poly.forEachSegment(function(pp1, pp2, ip1, ip2) {
        let int = util.intersect(lp1, lp2, pp1, pp2, base.key.SEGINT, false);
        if (int) {
            list.push(int);
            pp1.pos = ip1;
            pp2.pos = ip2;
        }
    });
    if (deep && poly.inner) {
        poly.inner.forEach(p => {
            let ints = intersections(p, lp1, lp2);
            if (ints) list.appendAll(ints);
        });
    }
    list.sort(function(p1, p2) {
        return util.distSq(lp1, p1) - util.distSq(lp1, p2);
    });
    return list;
}

/**
 * Walk points noting z deltas and smoothing z sawtooth patterns.
 * Used to smooth low-rez surface contouring (mutates polygon).
 *
 * @param {Polygon} poly - polygon to smooth (mutated)
 * @param {number} passes - number of smoothing passes
 * @returns {Polygon} the mutated polygon
 */
export function refine(poly, passes = 0) {
    for (let j = 0; j < passes; j++) {
        let points = poly.points,
            length = points.length,
            sn = [], // segment normals
            vn = []; // vertex normals
        for (let i = 0; i < length; i++) {
            let p1 = points[i];
            let p2 = points[(i + 1) % length];
            sn.push(calc_normal(p1, p2));
        }
        for (let i = 0; i < length; i++) {
            let n1 = sn[(i + length - 1) % length];
            let n2 = sn[i];
            let vi = calc_vertex(n1, n2, 1);
            vn.push(vi);
            let vl = Math.abs(1 - vi.vl).round(2);
            // vl should be close to zero on smooth / continuous curves
            // factoring out hard turns, we smooth the z using the weighted
            // z values of the points before and after the current point
            if (vl === 0) {
                let p0 = points[(i + length - 1) % length];
                let p1 = points[i];
                let p2 = points[(i + 1) % length];
                p1.z = (p0.z + p2.z + p1.z) / 3;
            }
        }
    }
    return poly;
}

/**
 * Test if two polygons are essentially equivalent in shape and position.
 * Checks area, bounds, circularity, and point-to-segment distances.
 *
 * @param {Polygon} poly1 - first polygon
 * @param {Polygon} poly2 - second polygon
 * @param {boolean} recurse - also check inner polygons
 * @param {number} precision - tolerance for comparisons
 * @returns {boolean} true if polygons are equivalent
 */
export function isEquivalent(poly1, poly2, recurse, precision) {
    let area1 = Math.abs(poly1.area());
    let area2 = Math.abs(poly2.area());
    if (util.isCloseTo(area1, area2, precision || config.precision_poly_area) &&
        poly1.bounds.equals(poly2.bounds, precision || config.precision_poly_bounds)) {
        // use circularity near 1 to eliminate the extensive check below
        let c1 = poly1.circularity(),
            c2 = poly2.circularity();
        if (Math.abs(c1 - c2) < config.precision_circularity && ((1 - c1) < config.precision_circularity)) {
            return true;
        }

        if (recurse) {
            let i, ai = poly1.inner,
                bi = poly2.inner;
            if (ai !== bi) {
                if (ai === null || bi === null || ai.length != bi.length) {
                    return false;
                }
                for (i = 0; i < ai.length; i++) {
                    if (!isEquivalent(ai[i], bi[i])) {
                        return false;
                    }
                }
            }
        }

        let exit = true,
            pointok,
            dist,
            min;

        poly1.forEachPoint(i2p => {
            pointok = false;
            poly2.forEachSegment((i1p1, i1p2) => {
                // if point is close to poly, terminate search, go to next point
                if ((dist = i2p.distToLine(i1p1, i1p2)) < config.precision_poly_merge) {
                    return pointok = true;
                }
                // otherwise track min and keep searching
                min = Math.min(min, dist);
            });
            // fail poly if one point is bad
            if (!pointok) {
                exit = false;
                // terminate search
                return true;
            }
        });
        return exit;

    }

    return false;
}
