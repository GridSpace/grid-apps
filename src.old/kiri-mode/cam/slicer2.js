/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/**
 * Slicing engine used by CAM Topo
 */
gapp.register("kiri-mode.cam.slicer2", [], (root, exports) => {

const { base, kiri } = root;
const { config, newOrderedLine, newPoint } = base;

class Slicer {

    static intersectPoints = intersectPoints;
    static checkOverUnderOn = checkOverUnderOn;
    static removeDuplicateLines = removeDuplicateLines;

    constructor(index = 0) {
        this.min = Infinity;
        this.max = -Infinity;
        this.index = index;
    }

    // position is a non-indexed 3js geometry position attribute array
    // create Point array from optionally filtered Z range
    setFromArray(position, options = {}) {
        const min = options.min || -Infinity;
        const max = options.max || Infinity;
        const len = position.length;
        const pts = this.points = [];
        for (let i=0; i<len; ) {
            const x0 = position[i++];
            const y0 = position[i++];
            const z0 = position[i++];
            const x1 = position[i++];
            const y1 = position[i++];
            const z1 = position[i++];
            const x2 = position[i++];
            const y2 = position[i++];
            const z2 = position[i++];
            const minz = Math.min(z0, z1, z2);
            const maxz = Math.max(z0, z1, z2);
            if (maxz < min || minz > max) {
                continue;
            }
            pts.push(
                newPoint(x0, y0, z0),
                newPoint(x1, y1, z1),
                newPoint(x2, y2, z2)
            );
            this.min = options.min || Math.min(this.min, minz);
            this.max = options.max || Math.max(this.max, maxz);
        }
        return this;
    }

    setFromPoints(points, options = {}) {
        const pts = this.points = [];
        const len = points.length;
        const min = options.min || -Infinity;
        const max = options.max || Infinity;
        for (let i=0; i<len; ) {
            const p0 = points[i++];
            const p1 = points[i++];
            const p2 = points[i++];
            const minz = Math.min(p0.z, p1.z, p2.z);
            const maxz = Math.max(p0.z, p1.z, p2.z);
            if (maxz < min || minz > max) {
                continue;
            }
            pts.push(p0, p1, p2);
            this.min = options.min || Math.min(this.min, minz);
            this.max = options.max || Math.max(this.max, maxz);
        }
        return this;
    }

    slice(interval = 1) {
        const ret = [];
        for (let z = this.min; z < this.max; z += interval) {
            ret.push({ z, index: this.index++, lines: this.sliceZ(z) });
        }
        return ret;
    }

    sliceZ(z, options = {}) {
        const points = this.points;
        const zMin = this.min;
        const zMax = this.max;
        const phash = {};
        const lines = [];

        let { under, over, both } = options;
        let p1, p2, p3;

        // default to 'over' selection with 2 points on a line
        if (!under && !both) over = true;

        // iterate over matching buckets for this z offset
        for (let i = 0; i < points.length; ) {
            p1 = points[i++];
            p2 = points[i++];
            p3 = points[i++];
            let where = {under: [], over: [], on: []};
            checkOverUnderOn(p1, z, where);
            checkOverUnderOn(p2, z, where);
            checkOverUnderOn(p3, z, where);
            if (where.under.length === 3 || where.over.length === 3) {
                // does not intersect (all 3 above or below)
            } else if (where.on.length === 2) {
                // one side of triangle is on the Z plane and 3rd is below
                // drop lines with 3rd above because that leads to ambiguities
                // with complex nested polygons on flat surface
                let add2 = both ||
                    (over && (where.over.length === 1 || z === zMax)) ||
                    (under && (where.under.length === 1 || z === zMin));
                if (add2) {
                    lines.push(makeZLine(phash, where.on[0], where.on[1], false, true));
                }
            } else if (where.on.length === 3) {
                // triangle is coplanar with Z
                // we drop these because this face is attached to 3 others
                // that will satisfy the if above (line) with 2 points
            } else if (where.under.length === 0 || where.over.length === 0) {
                // does not intersect but one point is on the slice Z plane
            } else {
                // compute two point intersections and construct line
                let line = intersectPoints(where.over, where.under, z);
                if (line.length < 2 && where.on.length === 1) {
                    line.push(where.on[0]);
                }
                if (line.length === 2) {
                    lines.push(makeZLine(phash, line[0], line[1]));
                } else {
                    console.log({msg: "invalid ips", line: line, where: where});
                }
            }
        }

        if (lines.length == 0 && options.noEmpty) {
            return;
        }

        return removeDuplicateLines(lines);
    }

}

/**
 * given a point, append to the correct
 * 'where' objec tarray (on, over or under)
 *
 * @param {Point} p
 * @param {number} z offset
 * @param {Obejct} where
 */
function checkOverUnderOn(p, z, where) {
    let delta = p.z - z;
    if (Math.abs(delta) < config.precision_slice_z) { // on
        where.on.push(p);
    } else if (delta < 0) { // under
        where.under.push(p);
    } else { // over
        where.over.push(p);
    }
}

/**
 * Given a point over and under a z offset, calculate
 * and return the intersection point on that z plane
 *
 * @param {Point} over
 * @param {Point} under
 * @param {number} z offset
 * @returns {Point} intersection point
 */
function intersectPoints(over, under, z) {
    let ip = [];
    for (let i = 0; i < over.length; i++) {
        for (let j = 0; j < under.length; j++) {
            ip.push(over[i].intersectZ(under[j], z));
        }
    }
    return ip;
}

/**
 * Ensure points are unique with a cache/key algorithm
 */
function getCachedPoint(phash, p) {
    let cached = phash[p.key];
    if (!cached) {
        phash[p.key] = p;
        return p;
    }
    return cached;
}

/**
 * Given two points and hints about their edges,
 * return a new Line object with points sorted
 * lexicographically by key.  This allows for future
 * line de-duplication and joins.
 *
 * @param {Object} phash
 * @param {Point} p1
 * @param {Point} p2
 * @param {boolean} [coplanar]
 * @param {boolean} [edge]
 * @returns {Line}
 */
function makeZLine(phash, p1, p2, coplanar, edge) {
    p1 = getCachedPoint(phash, p1);
    p2 = getCachedPoint(phash, p2);
    let line = newOrderedLine(p1,p2);
    line.coplanar = coplanar || false;
    line.edge = edge || false;
    return line;
}

/**
 * eliminate duplicate lines and interior-only lines (coplanar)
 *
 * lines are sorted using lexicographic point keys such that
 * they are comparable even if their points are reversed. hinting
 * for deletion, co-planar and suspect shared edge is detectable at
 * this time.
 *
 * @param {Line[]} lines
 * @returns {Line[]}
 */
function removeDuplicateLines(lines, debug) {
    let output = [],
        tmplines = [],
        points = [],
        pmap = {};

    function cachePoint(p) {
        let cp = pmap[p.key];
        if (cp) return cp;
        points.push(p);
        pmap[p.key] = p;
        return p;
    }

    function addLinesToPoint(point, line) {
        cachePoint(point);
        if (!point.group) point.group = [ line ];
        else point.group.push(line);
    }

    // mark duplicates for deletion preserving edges
    lines.sort(function (l1, l2) {
        if (l1.key === l2.key) {
            l1.del = !l1.edge;
            l2.del = !l2.edge;
            if (debug && (l1.del || l2.del)) {
                console.log('dup', l1, l2);
            }
            return 0;
        }
        return l1.key < l2.key ? -1 : 1;
    });

    // associate points with their lines, cull deleted
    lines.forEach(function(line) {
        if (!line.del) {
            tmplines.push(line);
            addLinesToPoint(line.p1, line);
            addLinesToPoint(line.p2, line);
        }
    });

    // merge collinear lines
    points.forEach(function(point) {
        if (point.group.length != 2) return;
        let l1 = point.group[0],
            l2 = point.group[1];
        if (l1.isCollinear(l2)) {
            l1.del = true;
            l2.del = true;
            // find new endpoints that are not shared point
            let p1 = l1.p1 != point ? l1.p1 : l1.p2,
                p2 = l2.p1 != point ? l2.p1 : l2.p2,
                newline = base.newOrderedLine(p1,p2);
            // remove deleted lines from associated points
            p1.group.remove(l1);
            p1.group.remove(l2);
            p2.group.remove(l1);
            p2.group.remove(l2);
            // associate new line with points
            p1.group.push(newline);
            p2.group.push(newline);
            // add new line to lines array
            newline.edge = l1.edge || l2.edge;
            tmplines.push(newline);
        }
    });

    // mark duplicates for deletion
    // but preserve one if it's an edge
    tmplines.sort(function (l1, l2) {
        if (l1.key === l2.key) {
            l1.del = true;
            l2.del = !l2.edge;
            return 0;
        }
        return l1.key < l2.key ? -1 : 1;
    });

    // create new line array culling deleted
    tmplines.forEach(function(line) {
        if (!line.del) {
            output.push(line);
            line.p1.group = null;
            line.p2.group = null;
        }
    });

    return output;
}

kiri.topo_slicer = Slicer;

});
