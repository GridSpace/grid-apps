/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { newPoint } from '../../../../geo/point.js';
import {
    checkOverUnderOn,
    makeZLine,
    removeDuplicateLines,
    intersectPoints
} from '../../../../geo/slicer.js';

/** Slicer used in Topo3 and Topo4 to find contour lines */
export class Slicer {

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
        for (let i = 0; i < len;) {
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
        for (let i = 0; i < len;) {
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
        for (let i = 0; i < points.length;) {
            p1 = points[i++];
            p2 = points[i++];
            p3 = points[i++];
            let where = { under: [], over: [], on: [] };
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
                    console.log({ msg: "invalid ips", line: line, where: where });
                }
            }
        }

        if (lines.length == 0 && options.noEmpty) {
            return;
        }

        return removeDuplicateLines(lines);
    }

}
