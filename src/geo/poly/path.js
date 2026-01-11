/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { util } from '../base.js';
import { newPoint } from '../point.js';
import { newPolygon } from '../polygon.js';
import { newSlopeFromAngle } from '../slope.js';
import { polygons as POLY } from '../polygons.js';

/**
 * Toolpath and CNC utility functions for polygons.
 * These utilities handle path generation, segmentation, and CNC-specific operations.
 */

/**
 * Generate a trace path around the inside of a polygon including inner polys.
 * Returns the noodle and the remainder of the polygon with the noodle removed.
 * TODO: relocate this code to fdm/post.js
 *
 * @param {Polygon} poly - polygon to trace
 * @param {number} width - trace width
 * @returns {Object} { noodle: Polygon[], remain: Polygon[] }
 */
export function noodle(poly, width) {
    let clone = poly.clone(true);
    let ins = clone.offset(width) ?? [];
    let remain = ins.clone(true);
    let nood = POLY.nest(POLY.flatten([ clone, ...ins ], [], true));
    return { noodle: nood, remain };
}

/**
 * Generate center crossing point cloud for thin wall filling.
 * Only used for fdm thin-wall type 1 (fdm/post.js).
 * TODO: relocate this code to fdm/post.js
 *
 * @param {Polygon} poly - polygon to analyze
 * @param {number} step - step size for sampling
 * @param {number} z - Z height
 * @param {number} min - minimum distance threshold
 * @param {number} max - maximum distance threshold
 * @param {Object} opt - options
 * @param {boolean} opt.lines - return lines instead of points (default false)
 * @param {number} opt.mindist - minimum distance for point joining (default step * 1.5)
 * @returns {Polygon[]|Point[]} array of polygons or points
 */
export function centers(poly, step, z, min, max, opt = {}) {
    let cloud = [],
        bounds = poly.bounds,
        lines = opt.lines || false,
        stepoff = step / 2,
        set = [poly.points];

    if (poly.inner) {
        for (let inner of poly.inner) {
            set.push(inner.points);
        }
    }

    for (let y of util.lerp(bounds.miny + stepoff, bounds.maxy - stepoff, step, true)) {
        let ints = [];
        for (let points of set) {
            let length = points.length;
            for (let i = 0; i < length; i++) {
                let p1 = points[i % length];
                let p2 = points[(i + 1) % length];
                if (
                    (p1.y <= y && p2.y > y) ||
                    (p1.y > y && p2.y <= y)
                ) ints.push([p1, p2]);
            }
        }
        let cntr = [];
        if (ints.length && ints.length % 2 === 0) {
            for (let int of ints) {
                let [p1, p2] = int;
                if (p2.y < p1.y) {
                    let tp = p1;
                    p1 = p2;
                    p2 = tp;
                }
                let minx = Math.min(p1.x, p2.x);
                let maxx = Math.max(p1.x, p2.x);
                let miny = Math.min(p1.y, p2.y);
                let maxy = Math.max(p1.y, p2.y);
                let dx = p2.x - p1.x;
                let dy = maxy - miny;
                let pct = (y - miny) / dy;
                let xpo = p1.x + pct * dx;
                cntr.push(xpo);
            }
        }
        cntr.sort((a, b) => {
            return b - a;
        });
        let lp, eo = 0;
        for (let x of cntr) {
            let p = newPoint(x, y, z);
            if (eo++ % 2) {
                let d = lp.distTo2D(p);
                if (d >= min && d <= max) {
                    if (lines) {
                        cloud.push(lp);
                        cloud.push(p);
                    } else {
                        cloud.push(newPoint(
                            (lp.x + p.x) / 2, y, z
                        ));
                    }
                }
            } else {
                lp = p;
            }
        }
    }

    for (let x of util.lerp(bounds.minx + stepoff, bounds.maxx - stepoff, step, true)) {
        let ints = [];
        for (let points of set) {
            let length = points.length;
            for (let i = 0; i < length; i++) {
                let p1 = points[i % length];
                let p2 = points[(i + 1) % length];
                if (
                    (p1.x <= x && p2.x > x) ||
                    (p1.x > x && p2.x <= x)
                ) ints.push([p1, p2]);
            }
        }
        let cntr = [];
        if (ints.length && ints.length % 2 === 0) {
            for (let int of ints) {
                let [p1, p2] = int;
                if (p2.x < p1.x) {
                    let tp = p1;
                    p1 = p2;
                    p2 = tp;
                }
                let minx = Math.min(p1.x, p2.x);
                let maxx = Math.max(p1.x, p2.x);
                let miny = Math.min(p1.y, p2.y);
                let maxy = Math.max(p1.y, p2.y);
                let dx = maxx - minx;
                let dy = p2.y - p1.y;
                let pct = (x - minx) / dx;
                let ypo = p1.y + pct * dy;
                cntr.push(ypo);
            }
        }
        cntr.sort((a, b) => {
            return b - a;
        });
        let lp, eo = 0;
        for (let y of cntr) {
            let p = newPoint(x, y, z);
            if (eo++ % 2) {
                let d = lp.distTo2D(p);
                if (d >= min && d <= max) {
                    if (lines) {
                        cloud.push(lp);
                        cloud.push(p);
                    } else {
                        cloud.push(newPoint(
                            x, (lp.y + p.y) / 2, z
                        ));
                    }
                }
            } else {
                lp = p;
            }
        }
    }

    if (lines) {
        return cloud;
    }

    let mindist = opt.mindist || step * 1.5;

    function build(polyPoints) {
        let lastp = polyPoints.last();
        let minp;
        let mind = Infinity;
        for (let point of cloud) {
            let dist = point.distTo2D(lastp);
            if (dist < mindist && dist < mind) {
                mind = dist;
                minp = point;
            }
        }
        if (minp) {
            cloud = cloud.filter(p => p !== minp);
            polyPoints.push(minp);
            return true;
        }
        return false;
    }

    // join points into polys
    let polys = [];
    let polyPoints = [];
    while (cloud.length) {
        if (polyPoints.length === 0) {
            polyPoints = [cloud.shift()];
            polys.push(polyPoints);
            continue;
        }
        if (build(polyPoints)) {
            continue;
        }
        if (!polyPoints.flip) {
            polyPoints.reverse();
            polyPoints.flip = true;
            continue;
        }
        if (polyPoints.length) {
            polyPoints = [];
        } else {
            throw "whoop there it is";
        }
    }

    return polys
        .filter(polyPoints => polyPoints.length > 1)
        .map(polyPoints => {
            let np = newPolygon().setOpen();
            for (let p of polyPoints) {
                np.push(p);
            }
            if (np.last().distTo2D(np.first()) <= max) {
                np.setClosed();
            }
            np = np.clean();
            return np;
        });
}

/**
 * Split long straight lines into segments no longer than `max`.
 * Returns a new polygon. Optionally `mark` points with their derived
 * segment start point (hinting for thin walls), `wrap` the poly first
 * point by appending to the end (adaptive walls), or stop segmentation at `maxoff`.
 *
 * @param {Polygon} poly - polygon to segment
 * @param {number} max - maximum segment length (default 1)
 * @param {boolean} mark - mark points with segment start (default false)
 * @param {boolean} wrap - wrap first point to end (default false)
 * @param {number} maxoff - maximum offset for segmentation (default Infinity)
 * @returns {Polygon} new segmented polygon
 */
export function segment(poly, max = 1, mark = false, wrap = false, maxoff = Infinity) {
    const newp = [];
    const points = poly.points;
    const length = points.length;
    const l0 = poly.open ? length - 1 : length;
    for (let i=0, p=points, l1=length, l2=l1+1; i<l0; i++) {
        const p1 = p[i];
        const p2 = p[(i + 1) % l1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dl = Math.sqrt(dx * dx + dy * dy);
        newp.push(p1);
        if (mark) p1.segment = p1;
        // if segment shorter than max (delta) or
        // maxoff is exhausted (only segmenting up to some length)
        // then skip sub-segmenting the current segment
        if (dl < max || maxoff < 0) {
            continue;
        }
        maxoff -= dl;
        const div = dl / max;
        const fit = div | 0;
        const add = fit - 1;
        const ix = dx / fit;
        const iy = dy / fit;
        let ox = p1.x + ix;
        let oy = p1.y + iy;
        for (let i=0; i<add; i++) {
            newp.push(newPoint(ox, oy, (p1.z + p2.z) / 2));
            ox += ix;
            oy += iy;
            // mark new point with first point of originating segment
            if (mark) newp.peek().segment = p1;
        }
    }
    if (newp.length > length) {
        if (wrap) {
            newp.push(newp[0]);
        }
        return newPolygon().addPoints(newp.map(p => p.clone(['segment']))).setOpenValue(poly.open);
    }
    return poly;
}

/**
 * For any poly points closer than `dist`, replace them with their midpoint.
 * Only used by cam/op-pocket.js.
 *
 * @param {Polygon} poly - polygon to process
 * @param {number} dist - distance threshold (default 0.01)
 * @returns {Polygon} new polygon with midpoints or original if no changes
 */
export function midpoints(poly, dist = 0.01) {
    const newp = [];
    const points = poly.points;
    const length = points.length;
    const l0 = poly.open ? length - 1 : length;
    let mod = 0;
    for (let i=0, p=points; i<l0; i++) {
        const p1 = p[i];
        const p2 = p[(i + 1) % length];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const ln = Math.sqrt(dx * dx + dy * dy);
        if (ln < dist) {
            newp.push(p1.midPointTo(p2));
            mod++;
        } else {
            newp.push(p1);
        }
    }
    if (mod) {
        return newPolygon().addPoints(newp.map(p => p.clone())).setOpenValue(poly.open);
    }
    return poly;
}

/**
 * Add dogbone joints for CNC operations at sharp interior corners.
 * Mutates the polygon in place. Recursively processes inner polygons.
 *
 * @param {Polygon} poly - polygon to modify (mutated)
 * @param {number} dist - dogbone distance/size
 * @param {boolean} reverse - reverse winding direction
 * @returns {Polygon} the mutated polygon
 */
export function addDogbones(poly, dist, reverse) {
    let open = poly.open;
    let isCW = poly.isClockwise();
    if (reverse || poly.parent) isCW = !isCW;
    let oldpts = poly.points.slice();
    let lastpt = oldpts[oldpts.length - 1];
    let lastsl = lastpt.slopeTo(oldpts[0]).toUnit();
    let length = oldpts.length + (open ? 0 : 1);
    let newpts = [];
    for (let i = 0; i < length; i++) {
        let nextpt = oldpts[i % oldpts.length];
        let nextsl = lastpt.slopeTo(nextpt).toUnit();
        let adiff = lastsl.angleDiff(nextsl, true);
        let bdiff = ((adiff < 0 ? (180 - adiff) : (180 + adiff)) / 2) + 180;
        if (!open || (i > 1 && i < length)) {
            if (isCW && adiff > 45) {
                let newa = newSlopeFromAngle(lastsl.angle + bdiff);
                newpts.push(lastpt.projectOnSlope(newa, dist));
                newpts.push(lastpt.clone());
            } else if (!isCW && adiff < -45) {
                let newa = newSlopeFromAngle(lastsl.angle - bdiff);
                newpts.push(lastpt.projectOnSlope(newa, dist));
                newpts.push(lastpt.clone());
            }
        }
        lastsl = nextsl;
        lastpt = nextpt;
        if (i < oldpts.length) {
            newpts.push(nextpt);
        }
    }
    poly.points = newpts;
    if (poly.inner) {
        poly.inner.forEach(inner => addDogbones(inner, dist, true));
    }
    return poly;
}
