/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { base, config, util } from './base.js';
import { paths } from './paths.js';
import { ClipperLib } from '../ext/clip2.esm.js';
import { newBounds } from './bounds.js';
import { newPoint, pointFromClipper } from './point.js';
import { polygons as POLY } from './polygons.js';
import * as geo from './poly/geo.js';
import * as arcs from './poly/arcs.js';
import * as mesh from './poly/mesh.js';
import * as path from './poly/path.js';

const { Vector3 } = THREE;

let XAXIS = new Vector3(1,0,0),
    DEG2RAD = Math.PI / 180,
    Clipper = ClipperLib.Clipper,
    ClipType = ClipperLib.ClipType,
    PolyType = ClipperLib.PolyType,
    PolyFillType = ClipperLib.PolyFillType,
    CleanPolygon = Clipper.CleanPolygon,
    FillNonZero = PolyFillType.pftNonZero,
    FillEvenOdd = PolyFillType.pftEvenOdd,
    PathSubject = PolyType.ptSubject,
    PathClip = PolyType.ptClip,
    EndType = ClipperLib.EndType,
    JoinType = ClipperLib.JoinType,
    PolyTree = ClipperLib.PolyTree,
    ClipXOR = ClipType.ctXor,
    ClipDiff = ClipType.ctDifference,
    ClipUnion = ClipType.ctUnion,
    ClipIntersect = ClipType.ctIntersection,
    ClipperOffset = ClipperLib.ClipperOffset
    ;

let seqid = Math.round(Math.random() * 0xffffffff);

export class Polygon {
    constructor(points) {
        this.id = seqid++; // polygon unique id
        this.open = false;
        this.points = []; // ordered array of points
        this.depth = 0; // depth nested from top parent (density for support fill)
        if (points) {
            this.addPoints(points);
        }
    }

    get length() {
        return this.points.length;
    }

    get deepLength() {
        let len = this.length;
        if (this.inner) {
            for (let inner of this.inner) {
                len += inner.length;
            }
        }
        return len;
    }

    get bounds() {
        if (this._bounds) {
            return this._bounds;
        }
        let bounds = this._bounds = newBounds();
        for (let point of this.points) {
            bounds.update(point);
        }
        return bounds;
    }

    getBounds3D(bounds = new THREE.Box3()) {
        for (let point of this.points) {
            bounds.expandByPoint(point);
        }
        if (this.inner) {
            for (let i of this.inner) {
                i.getBounds3D(bounds);
            }
        }
        return bounds;
    }

    toPath2D(offset) {
        return paths.pointsToPath(this.points, offset, this.open);
    }

    toPath3D(offset, height, z) {
        return paths.pathTo3D(this.toPath2D(offset), height, z);
    }

    toString(verbose) {
        let l;
        if (this.inner && this.inner.length) {
            l = '/' + this.inner.map(i => i.toString(verbose)).join(',');
        } else {
            l = '';
        }
        if (verbose) {
            return `P[{${this.area().toFixed(2)}}[${this.points.length}](${this.points.map(p=>`${p.x},${p.y}`).join('|')})${l}]`;
        } else {
            return `P[${this.points.length,this.area().toFixed(2)}${l}]`;
        }
    }

    toArray() {
        let ov = this.open ? 1 : 0;
        return this.points.map((p, i) => i === 0 ? [ov, p.x, p.y, p.z] : [p.x, p.y, p.z]).flat();
    }

    fromArray(array) {
        this.open = array[0] === 1;
        for (let i = 1; i < array.length;) {
            this.add(array[i++], array[i++], array[i++]);
        }
        return this;
    }

    fromVectors(array) {
        return this.addVerts(array.map(v => [ ...v ]).flat());
    }

    toObject() {
        return {
            points: this.toArray(),
            inner: this.inner?.map(i => i.toArray())
        };
    }

    fromObject(obj) {
        this.fromArray(obj.points);
        this.inner = obj.inner?.map(a => newPolygon().fromArray(a))
        return this;
    }

    matches(poly) {
        let tarr = Array.isArray(poly) ? poly : poly.toArray();
        let parr = this.toArray();
        if (tarr.length === parr.length) {
            for (let i = 0; i < tarr.length; i++) {
                if (Math.abs(tarr[i] - parr[i]) > 0.0001) return false;
            }
            return true;
        }
        return false;
    }

    xray(deep) {
        const xray = {
            id: this.id,
            len: this.points.length,
            open: this.open,
            depth: this.depth,
            parent: this.parent ? true : false
        };
        if (this.inner) {
            xray.inner = deep ? this.inner.xray(deep) : this.inner;
        }
        return xray;
    }

    // return which plane (x,y,z) this polygon is coplanar with
    alignment() {
        if (this._aligned) return this._aligned;

        let diff = {
            x: false,
            y: false,
            z: false
        };
        let last = undefined;

        // flatten points into array for earcut()
        this.points.forEach(p => {
            if (last) {
                diff.x = diff.x || last.x !== p.x;
                diff.y = diff.y || last.y !== p.y;
                diff.z = diff.z || last.z !== p.z;
            }
            last = p;
        });

        return this._aligned =
            diff.x === false ? 'yz' :
            diff.y === false ? 'xz' : 'xy';
    }

    // ensure alignment with XY plane. mark if axes are swapped.
    ensureXY() {
        if (this._swapped) return this;
        switch (this.alignment()) {
            case 'xy':
                break;
            case 'yz':
                this.swap(true, false)._swapped = true;
                break;
            case 'xz':
                this.swap(false, true)._swapped = true;
                break;
            default:
                throw `invalid alignment`;
        }
        return this;
    }

    // restore to original planar alignment if swapped
    restoreXY() {
        if (!this._swapped) return this;
        switch (this.alignment()) {
            case 'xy':
                break;
            case 'yz':
                this.swap(true, false)._swapped = false;
                break;
            case 'xz':
                this.swap(false, true)._swapped = false;
                break;
        }
        return this;
    }

    earcut() {
        return mesh.earcut(this);
    }

    setInner(inner) {
        this.inner = inner;
        return this;
    }

    // generate a trace path around the inside of a polygon
    // including inner polys. return the noodle and the remainder
    // of the polygon with the noodle removed (for the next pass)
    // todo: relocate this code to post.js
    noodle(width) {
        return path.noodle(this, width);
    }

    // generate center crossing point cloud
    // only used for fdm thin-wall type 1 (fdm/post.js)
    // todo: relocate this code to post.js
    centers(step, z, min, max, opt = {}) {
        return path.centers(this, step, z, min, max, opt);
    }

    debur(dist) {
        return geo.debur(this, dist);
    }

    miter(debug) {
        return geo.miter(this, debug);
    }

    // only used in fdm/slice.js for enclosing supports
    createConvexHull(points) {
        return geo.createConvexHull(this, points);
    }

    stepsFromRoot() {
        let p = this.parent,
            steps = 0;
        while (p) {
            if (p.inner && p.inner.length > 1) steps++;
            p = p.parent;
        }
        return steps;
    }

    first() {
        return this.points[0];
    }

    last() {
        return this.points[this.length - 1];
    }

    flip(axis) {
        for (let p of this.points) {
            p[axis] = -p[axis];
        }
        for (let i of this.inner || []) {
            i.flip(axis);
        }
        return this;
    }

    swap(x, y) {
        this._bounds = undefined;
        if (x) {
            for (let p of this.points) {
                p.swapXZ();
            }
        } else if (y) {
            for (let p of this.points) {
                p.swapYZ();
            }
        }
        if (this.inner) {
            for (let inner of this.inner) {
                inner.swap(x, y);
            }
        }
        return this;
    }

    // return average of all point positions
    average() {
        let ap = newPoint(0, 0, 0, null);
        this.points.forEach(p => {
            ap.x += p.x;
            ap.y += p.y;
            ap.z += p.z;
        });
        ap.x /= this.points.length;
        ap.y /= this.points.length;
        ap.z /= this.points.length;
        return ap;
    }

    // TODO: review usage
    center(point) {
        return this.bounds.center(this.getZ());
    }

    /**
     * using perimeter length, find 3 equally spaced points to
     * return a more accruate center point.
     * @returns {Point} center of a polygon assuming it's a circle
     */
    calcCircleCenter() {
        return arcs.calcCircleCenter(this);
    }

    /**
     * iterate over poly points and find sequences of 5 or more points
     * with a common center point and collect as a midpoint/radius
     */
    findArcCenters(opt = {}) {
        return arcs.findArcCenters(this, opt);
    }

    /**
     * Detect and annotate arc sequences in polygon points.
     * When an arc is detected, the first point is annotated with arc metadata
     * and intermediate points remain in the array but should be skipped during emission.
     *
     * @param {Object} opts - detection options
     * @param {number} opts.tolerance - arc detection tolerance (default 0.1)
     * @param {number} opts.arcRes - arc resolution in radians (default 0.1)
     * @param {number} opts.minPoints - minimum points to consider an arc (default 4)
     * @returns {Polygon} this polygon with arc annotations
     */
    detectArcs(opts = {}) {
        return arcs.detectArcs(this, opts);
    }

    /**
     * add points forming a rectangle around a center point
     *
     * @param {Point} center
     * @param {number} width
     * @param {number} height
     */
    centerRectangle(center, width, height) {
        width /= 2;
        height /= 2;
        this.push(newPoint(center.x - width, center.y - height, center.z));
        this.push(newPoint(center.x + width, center.y - height, center.z));
        this.push(newPoint(center.x + width, center.y + height, center.z));
        this.push(newPoint(center.x - width, center.y + height, center.z));
        return this;
    }

    /**
     * create square spiral (used for purge blocks)
     */
    centerSpiral(center, lenx, leny, offset, count) {
        count *= 4;
        offset /= 2;
        let pos = {
                x: center.x - lenx / 2,
                y: center.y + leny / 2,
                z: center.z
            },
            dir = {
                x: 1,
                y: 0,
                i: 0
            },
            t;
        while (count-- > 0) {
            this.push(newPoint(pos.x, pos.y, pos.z));
            pos.x += dir.x * lenx;
            pos.y += dir.y * leny;
            switch (dir.i++) {
                case 0:
                    t = dir.x;
                    dir.x = dir.y;
                    dir.y = -t;
                    break;
                case 1:
                    t = dir.x;
                    dir.x = dir.y;
                    dir.y = t;
                    break;
                case 2:
                    t = dir.x;
                    dir.x = dir.y;
                    dir.y = -t;
                    break;
                case 3:
                    t = dir.x;
                    dir.x = dir.y;
                    dir.y = t;
                    break;
            }
            lenx -= offset / 2;
            leny -= offset / 2;
            dir.i = dir.i % 4;
        }
        return this;
    }

    /**
     * add points forming a circle around a center point
     */
    centerCircle(center, radius, points, clockwise) {
        let angle = 0,
            add = 360 / points;
        if (clockwise) add = -add;
        while (points-- > 0) {
            this.push(newPoint(
                util.round(Math.cos(angle * DEG2RAD) * radius, 7) + center.x,
                util.round(Math.sin(angle * DEG2RAD) * radius, 7) + center.y,
                center.z
            ));
            angle += add;
        }
        return this;
    }

    /**
     * move all poly points by some offset
     */
    move(offset, skipinner) {
        this._bounds = undefined;
        this.points = this.points.map(point => point.move(offset));
        if (!skipinner && this.inner) {
            for (let inner of this.inner) {
                inner.move(offset);
            }
        }
        return this;
    }

    /**
     * scale polygon around origin
     */
    scale(scale, round) {
        this.area2 = undefined;
        let x, y, z;
        if (typeof(scale) === 'number') {
            x = y = z = scale;
        } else {
            x = scale.x;
            y = scale.y;
            z = scale.z;
        }
        this._bounds = undefined;
        this.points.forEach(point => {
            if (round) {
                point.x = (point.x * x).round(round);
                point.y = (point.y * y).round(round);
                point.z = (point.z * z).round(round);
            } else {
                point.x = point.x * x;
                point.y = point.y * y;
                point.z = point.z * z;
            }
        });
        if (this.inner) {
            for (let inner of this.inner) {
                inner.scale(scale, round);
            }
        }
        return this;
    }

    rotate(degrees) {
        let rad = degrees * DEG2RAD;
        if (rad)
        this.points = this.points.map(p => {
            let [ x, y ] = base.util.rotate(p.x, p.y, rad);
            p.x = x;
            p.y = y;
            return p;
        });
        return this;
    }

    /**
     * hint fill angle hinting from longest segment
     * only used in fdm/slice.js for projected infill orientation
     */
    hintFillAngle() {
        let index = 0,
            points = this.points,
            length = points.length,
            prev,
            next,
            dist2,
            longest,
            mincir = config.hint_min_circ,
            minlen = config.hint_len_min,
            maxlen = config.hint_len_max || Infinity;

        while (index < length) {
            prev = points[index];
            next = points[++index % length];
            dist2 = prev.distToSq2D(next);
            if (dist2 >= minlen && dist2 <= maxlen && (!longest || dist2 > longest.len)) {
                longest = {
                    p1: prev,
                    p2: next,
                    len: dist2
                };
            }
        }

        if (longest && this.circularity() >= mincir) {
            this.fillang = longest.p1.slopeTo(longest.p2).normal();
        }

        return this.fillang;
    }

    /**
     * todo make more efficient
     *
     * @param {Boolean} deep
     * @param {String[]} fields to copy beyond class fields
     * @returns {Polygon}
     */
    clone(deep, fields) {
        let np = newPolygon().copyZ(this.getZ()),
            ln = this.length,
            i = 0;

        while (i < ln) np.push(this.points[i++]);

        fields && fields.forEach(field => np[field] = this[field]);
        this.fillang && (np.fillang = this.fillang);
        np.depth = this.depth;
        np.open = this.open;

        if (deep && this.inner) {
            np.inner = this.inner.clone(false, fields);
        }

        return np;
    }

    // special shallow for-render-or-read-only cloning
    cloneZ(z, deep = true) {
        let p = newPolygon();
        p.z = z;
        p.open = this.open;
        p.points = this.points;
        if (deep && this.inner) {
            p.inner = this.inner.map(p => p.cloneZ(z, false));
        }
        return p;
    }

    copyZ(z) {
        if (z !== undefined) {
            this.z = z;
        }
        return this;
    }

    setA(a) {
        for (let p of this.points) {
            p.setA(a);
        }
        if (this.inner) {
            for (let inner of this.inner) {
                inner.setA(a);
            }
        }
        return this;
    }

    /**
     * set all points' z value
     *
     * @param {number} z
     * @returns {Polygon} this
     */
    setZ(z) {
        let ar = this.points,
            ln = ar.length,
            i = 0;
        while (i < ln) ar[i++].z = z;
        this.z = z;
        if (this.inner) this.inner.forEach(c => c.setZ(z));
        return this;
    }

    /**
     * @returns {number} z value of first point
     */
    getZ(i) {
        return this.z !== undefined ? this.z : this.points[i || 0]?.z || 0;
    }

    minZ() {
        let minZ = Math.min(...this.points.map(p => p.z));
        if (this.inner) {
            for (let i of this.inner) {
                minZ = Math.min(minZ, i.minZ());
            }
        }
        return minZ;
    }

    maxZ() {
        let maxZ = Math.max(...this.points.map(p => p.z));
        if (this.inner) {
            for (let i of this.inner) {
                maxZ = Math.max(minZ, i.maxZ());
            }
        }
        return maxZ;
    }

    avgZ() {
        return [...this.points.map(p => p.z)].reduce((a,v) => a+v) / this.points.length;
    }

    /**
     * @param {*} z value target
     * @param {*} epsilon allowed Z variance
     * @returns {boolean} true if all points Z within epsilon of value
     */
    onZ(z, epsilon = 10e-4) {
        return Math.max(...this.points.map(p => Math.abs(z - p.z))) < epsilon;
    }

    /**
     */
    render(layer, color, recursive, open) {
        layer.poly(this, color, recursive, open);
    }

    renderSolid(layer, color) {
        layer.solid(this, color);
    }

    /**
     * add new point and return polygon reference for chaining
     */
    add(x, y, z) {
        this.push(newPoint(x, y, z));
        return this;
    }

    addObj(obj) {
        if (Array.isArray(obj)) {
            for (let o of obj) {
                this.addObj(o);
            }
            return this;
        }
        return this.add(obj.x, obj.y, obj.z);
    }

    /**
     * append array of points to polygon and return polygon
     */
    addPoints(points) {
        let poly = this,
            length = points.length,
            i = 0;
        while (i < length) {
            poly.push(points[i++]);
        }
        return this;
    }

    /**
     * @param {int[]} verts flat array of x,y,z vertices
     */
    addVerts(verts) {
        for (let i=0; i<verts.length; ) {
            this.add(
                verts[i++],
                verts[i++],
                verts[i++]
            );
        }
        return this;
    }

    /**
     * append point to polygon and return point
     */
    push(p) {
        this.area2 = undefined;
        // clone any point belonging to another polygon
        if (p.poly) p = p.clone();
        p.poly = this;
        this.points.push(p);
        return p;
    }

    /**
     * append point to polygon and return polygon
     */
    append(p) {
        this.push(p);
        return this;
    }

    /** close polygon */
    setClosed() {
        this.open = false;
        return this;
    }

    /** open polygon */
    setOpen() {
        this.open = true;
        return this;
    }

    setOpenValue(b) {
        this.open = b;
        return this;
    }

    isOpen() {
        return this.open;
    }

    isClosed() {
        return !this.open;
    }

    appearsClosed() {
        return this.first().isEqual(this.last());
    }

    closeIf(dist = 1) {
        let closeDist = this.first().distTo2D(this.last());
        if (closeDist < 0.001) {
            this.points.pop();
            return this.setClosed();
        } else if (closeDist <= dist) {
            return this.setClosed();
        } else {
            return this.setOpen();
        }
    }

    fixClosed() {
        if (this.appearsClosed()) {
            this.points.pop();
            this.open = false;
        }
        return this;
    }

    setClockwise() {
        if (!this.isClockwise()) this.reverse();
        return this;
    }

    setCounterClockwise() {
        if (this.isClockwise()) this.reverse();
        return this;
    }

    isClockwise() {
        return this.area(true) > 0;
    }

    showKey() {
        return [this.first().key, this.last().key, this.length].join('~~');
    }

    applyRotations() {
        for (let point of this.points) {
            if (point.a) {
                let p2 = new Vector3(point.x, point.y, point.z)
                    .applyAxisAngle(XAXIS, point.a * DEG2RAD);
                point.x = p2.x;
                point.y = p2.y;
                point.z = p2.z;
            }
        }
        return this;
    }

    /**
     * set this polygon's winding in alignment with the supplied polygon
     */
    alignWinding(poly, toLongest) {
        if (toLongest && this.length > poly.length) {
            poly.alignWinding(this, false);
        } else if (this.isClockwise() !== poly.isClockwise()) {
            this.reverse();
        }
        return this;
    }

    /**
     * set this polygon's winding in opposition to supplied polygon
     */
    opposeWinding(poly, toLongest) {
        if (toLongest && this.length > poly.length) {
            poly.opposeWinding(this, false);
        } else if (this.isClockwise() === poly.isClockwise()) {
            this.reverse();
        }
        return this;
    }

    /**
     * @returns {boolean} true if both polygons wind the same way
     */
    sameWindings(poly) {
        return this.isClockwise() === poly.isClockwise();
    }

    /**
     * reverse direction of polygon points.
     */
    reverse() {
        if (this.area2) {
            this.area2 = -this.area2;
        }
        this.points = this.points.reverse();
        return this;
    }

    /**
     * return true if this polygon is (likely) nested inside parent
     */
    isNested(parent) {
        if (parent.bounds.contains(this.bounds)) {
            return this.isInside(parent, config.precision_nested_sq);
        }
        return false;
    }

    forEachPoint(fn, close, start) {
        let index = start || 0,
            points = this.points,
            length = points.length,
            count = close ? length + 1 : length,
            offset = 0,
            pos;

        while (count-- > 0) {
            pos = index % length;
            if (fn(points[pos], pos, points, offset++)) return;
            index++;
        }
    }

    forEachSegment(fn, open, start) {
        let index = start || 0,
            points = this.points,
            length = points.length,
            count = open ? length - 1 : length,
            pos1, pos2;

        while (count-- > 0) {
            pos1 = index % length;
            pos2 = (index + 1) % length;
            if (fn(points[pos1], points[pos2], pos1, pos2)) return;
            index++;
        }
    }

    /**
     * given two endpoints of a line
     * find all intersections sorted by closest to lp1
     */
    intersections(lp1, lp2, deep) {
        return geo.intersections(this, lp1, lp2, deep);
    }

    // return true if any line segments on either poly crosses the other
    // this is a shallow test and does not inspect inners
    intersects(poly) {
        let p0 = this.points.slice(); p0.push(p0[0]);
        let p1 = poly.points.slice(); p1.push(p1[0]);
        for (let i=1; i<p0.length; i++) {
            let a = p0[i-1];
            let b = p0[i];
            for (let j=1; j<p1.length; j++) {
                let c = p1[j-1];
                let d = p1[j];
                if (util.intersect(a, b, c, d, base.key.SEGINT)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * using two points, split polygon into two open polygons
     * or return null if p1,p2 does not intersect or poly is open
     */
    bisect(p1, p2) {
        if (this.isOpen()) return null;

        let copy = this.clone().setClockwise();

        let int = copy.intersections(p1, p2);
        if (!int || int.length !== 2) return null;

        return [copy.emitSegment(int[0], int[1]), copy.emitSegment(int[1], int[0]).reverse()];
    }

    /**
     * emit new open poly between two intersection points of a clockwise poly.
     * used in cam tabs and fdm output perimeter traces on infill
     */
    emitSegment(i1, i2) {
        let poly = newPolygon(),
            start = i1.p2.pos,
            end = i2.p1.pos;
        // console.log({emitSeg: this, i1, i2, start, end});
        poly.setOpen();
        poly.push(i1);
        this.forEachPoint(function(p, pos) {
            poly.push(p);
            if (p === i2.p1) {
                // console.log('hit end point @', pos);
                return true;
            }
        }, true, start);
        poly.push(i2);
        // console.log({emit: poly});
        return poly;
    }

    /**
     * emit the shortest poly that connects two points on a closed CW poly
     * because traveling around the 'end point' may yield a shorter route.
     * if the poly is open, use emitSegment()
     */
    emitShortestSegment(i1, i2) {
        if (this.open) {
            return this.emitSegment(i1, i2);
        }
        let start = i1.p2.pos,
            end = i2.p1.pos,
            points = this.points,
            seg0 = new Polygon([ i1, ...points.slice(start, end + 1), i2 ]).setOpen(),
            seg1 = new Polygon([ i2, ...points.slice(end +1 ), ...points.slice(0, start), i1 ]).setOpen();
        return seg0.perimeter() < seg1.perimeter() ? seg0 : seg1;
    }

    /**
     * @param {Polygon} poly
     * @param {number} [tolerance]
     * @returns {boolean} any points inside OR on edge
     */
    hasPointsInside(poly, tolerance) {
        if (!poly.overlaps(this)) return false;

        let mid, exit = false;

        this.forEachSegment((prev, next) => {
            // check midpoint on long lines
            if (prev.distTo2D(next) > config.precision_midpoint_check_dist) {
                mid = prev.midPointTo(next);
                if (mid.inPolygon(poly) || mid.nearPolygon(poly, tolerance || config.precision_close_to_poly_sq)) {
                    return exit = true;
                }
            }
            if (next.inPolygon(poly) || next.nearPolygon(poly, tolerance || config.precision_close_to_poly_sq)) {
                return exit = true;
            }
        });

        return exit;
    }

    /**
     * returns true if any point on this polygon
     * is within radius of a point on the target
     */
    isNear(poly, radius, cache) {
        const midcheck = config.precision_midpoint_check_dist;
        const dist = radius || config.precision_close_to_poly_sq;
        let near = false;
        let mem = cache ? this.cacheNear = this.cacheNear || {} : undefined;

        if (mem && mem[poly.id] !== undefined) {
            return mem[poly.id];
        }

        this.forEachSegment((prev, next) => {
            // check midpoint on long lines
            if (prev.distToSq2D(next) > midcheck) {
                if (prev.midPointTo(next).nearPolygon(poly, dist)) {
                    return near = true; // stops iteration
                }
            }
            if (next.nearPolygon(poly, dist)) {
                return near = true; // stops iteration
            }
        });

        if (mem) {
            mem[poly.id] = near;
        }

        return near;
    }

    /**
     * TODO replace isNested() with isInside() ?
     *
     * @param {Polygon} poly
     * @param {number} [tolerance]
     * @returns {boolean} all points inside OR on edge
     */
    isInside(poly, tolerance) {
        // throw new Error("isInside");
        const neardist = tolerance || config.precision_close_to_poly_sq;
        if (!this.bounds.isNested(poly.bounds, neardist * 3)) {
            return false;
        }

        let mid,
            midcheck = config.precision_midpoint_check_dist,
            exit = true;

        this.forEachSegment((prev, next) => {
            // check midpoint on long lines (TODO: should be distToSq2D()?)
            if (prev.distTo2D(next) > midcheck) {
                mid = prev.midPointTo(next);
                if (!(mid.inPolygon(poly) || mid.nearPolygon(poly, neardist))) {
                    exit = false;
                    return true;
                }
            }
            if (!(next.inPolygon(poly) || next.nearPolygon(poly, neardist))) {
                exit = false;
                return true;
            }
        }, this.open);

        return exit;
    }

    /**
     * @param {Polygon} poly
     * @param {number} [tolerance]
     * @returns {boolean} all points inside poly AND not inside children
     */
    // PRO.contains = function(poly, tolerance) {
    //     return (poly && poly.isInside(this, tolerance) && poly.isOutsideAll(this.inner, tolerance));
    // };

    containedBySet(polys) {
        if (!polys) return false;
        for (let i = 0; i < polys.length; i++) {
            if (polys[i].contains(this)) return true;
        }
        return false;
    }

    addInner(child) {
        child.parent = this;
        if (this.inner) {
            this.inner.push(child);
        } else {
            this.inner = [child];
        }
        return this;
    }

    /**
     * @returns {number} number of inner polygons
     */
    innerCount() {
        return this.inner ? this.inner.length : 0;
    }

    /**
     * @returns {boolean} if has 1 or more inner polygons
     */
    hasInner() {
        return this.inner && this.inner.length > 0;
    }

    /**
     * remove all inner polygons
     */
    clearInner() {
        this.inner = null;
        return this;
    }

    // used in geo/slicer.js to free memory
    freeParentRefs() {
        if (this.inner && this.inner.length > 0) {
            for (let inner of this.inner) {
                inner.freeParentRefs();
                delete inner.parent;
            }
        }
        for (let p of this.points) {
            delete p.poly;
        }
    }

    // possibly ununsed
    newUndeleted() {
        let poly = newPolygon();
        this.forEachPoint(p => {
            if (!p.del) poly.push(p);
        });
        return poly;
    }

    /**
     * http://www.ehow.com/how_5138742_calculate-circularity.html
     * @returns {number} 0.0 - 1.0 from flat to perfectly circular
     */
    circularity() {
        try {
            return (4 * Math.PI * this.area()) / util.sqr(this.perimeter());
        } catch (e) {
            console.log(this.perimeter(), e);
            return 0;
        }
    }

    circularityDeep() {
        return (4 * Math.PI * this.areaDeep()) / util.sqr(this.perimeter());
    }

    /**
     * @returns {number} perimeter length (sum of all segment lengths)
     */
    perimeter() {
        if (this.perim) {
            return this.perim;
        }

        let len = 0.0;

        this.forEachSegment((prev, next) => {
            len += Math.sqrt(prev.distToSq2D(next));
        }, this.open);

        return this.perim = len;
    }

    perimeterDeep() {
        let len = this.perimeter();
        if (this.inner) this.inner.forEach(p => {
            len += p.perimeter()
        });
        return len;
    }

    /**
     * calculate and return the area enclosed by the polygon.
     * if raw is true, return a signed area equal to 2x the
     * enclosed area which also indicates winding direction.
     *
     * @param {boolean} [raw]
     * @returns {number} area
     */
    area(raw) {
        if (this.length < 3) {
            return 0;
        }
        if (this.area2 === undefined) {
            this.area2 = 0.0;
            for (let p = this.points, pl = p.length, pi = 0, p1, p2; pi < pl; pi++) {
                p1 = p[pi];
                p2 = p[(pi + 1) % pl];
                this.area2 += (p2.x - p1.x) * (p2.y + p1.y);
            }
        }
        return raw ? this.area2 : Math.abs(this.area2 / 2);
    }

    /**
     * return the area of a polygon with the area of all
     * inner polygons subtracted
     *
     * @returns {number} area
     */
    areaDeep() {
        if (!this.inner) {
            return this.area();
        }
        let i, c = this.inner,
            a = this.area();
        for (i = 0; i < c.length; i++) {
            a -= c[i].area();
        }
        return a;
    }

    /**
     * @param {Polygon} poly
     * @returns {boolean}
     */
    overlaps(poly) {
        return this.bounds.overlaps(poly.bounds, config.precision_merge);
    }

    /**
     * create poly from coordinate Array (aka dump)
     *
     * @param {number[]} arr
     * @param {number} [z]
     */
    fromXYArray(arr, z) {
        let i = 0;
        while (i < arr.length) {
            this.add(arr[i++], arr[i++], z || 0);
        }
        return this;
    }

    /**
     * shortcut to de-rez poly
     */
    simple() {
        return this.clean(true, undefined, Math.min(config.clipper / 10, config.clipperClean * 5));
    }

    /**
     * simplify and merge collinear. only works for single
     * non-nested polygons. used primarily in slicer/connectLines.
     */
    clean(deep, parent, merge = config.clipperClean) {
        let clean = CleanPolygon(this.toClipper()[0], merge),
            poly = fromClipperPath(clean, this.getZ());
        if (poly.length === 0) return this;
        if (deep && this.inner) {
            poly.inner = this.inner.map(inr => inr.clean(false, poly, merge));
        }
        poly.parent = parent || this.parent;
        poly.area2 = this.area2;
        poly.open = this.open;
        if (this.open) {
            // when open, ensure first point on new poly matches old
            let start = this.points[0];
            let points = poly.points;
            let length = points.length;
            let mi, min = Infinity;
            for (let i = 0; i < length; i++) {
                let d = points[i].distTo2D(start);
                if (d < min) {
                    min = d;
                    mi = i;
                }
            }
            // mi > 0 means first point didn't match
            if (mi) {
                let nupoints = [];
                for (let i = mi; i < length; i++) {
                    nupoints.push(points[i]);
                }
                for (let i = 0; i < mi; i++) {
                    nupoints.push(points[i]);
                }
                poly.points = nupoints;
            }
        }
        return poly;
    }

    toClipper(inout) {
        let poly = this,
            out = inout || [];
        out.push(poly.points.map(p => p.toClipper()));
        if (poly.inner) {
            for (let inner of poly.inner) {
                inner.toClipper(out);
            }
        }
        return out;
    }

    /**
     * return offset polygon(s) from original using distance.  may result in
     * more than one new polygon if trace is self-intersecting or null if new
     * polygon is too small or offset is otherwise not possible due to geometry.
     *
     * @param {number} offset positive = inset, negative = outset
     * @param {Polygon[]} [output]
     * @returns {?Polygon[]} returns output array provided as input or new array if not provided
     */
    offset(offset, output) {
        return POLY.expand([this], -offset, this.getZ(), output);
    }

    /**
     * ofsetting an open line uses a different procedure and options
     *
     * @param {number} distance
     * @param {'square'|'round'|'miter'} type
     * @returns {Polygon[]}
     */
    offset_open(distance, type = 'miter', miterLimit = 2) {
        if (this.isOpen()) {
            let coff = new ClipperOffset(),
                dudd = (coff.MiterLimit = miterLimit),
                tree = new PolyTree(),
                entt = {
                    'square' : EndType.etOpenSquare,
                    'round' : EndType.etOpenRound,
                    'miter' : EndType.etOpenSquare
                }[type] || EndType.etOpenSquare,
                jntt = {
                    'square': JoinType.jtSquare,
                    'round': JoinType.jtRound,
                    'miter': JoinType.jtMiter
                }[type] || JoinType.jtMiter;
                coff.AddPaths(this.toClipper(), jntt, entt);
                coff.Execute(tree, distance * config.clipper);
            return POLY.fromClipperTree(tree, this.getZ(), null, null, 0);
        } else {
            return this.offset(distance);
        }
    }

    /**
     * todo need something more clever for polygons that overlap with
     * todo differing resolutions (like circles)
     *
     * @param {Polygon} poly
     * @param {boolean} [recurse]
     * @param {number} [precision]
     * @returns {boolean} true if polygons are, essentially, the same
     */
    isEquivalent(poly, recurse, precision) {
        return geo.isEquivalent(this, poly, recurse, precision);
    }

    /**
     * find the point of this polygon closest to
     * the provided point. assist generating optimal
     * print paths.
     *
     * @param {Point} target
     * @return {Object} {distance, point, index: point_index}
     */
    findClosestPointTo(target) {
        let dist,
            index,
            closest,
            mindist = Infinity;

        if (this.open) {
            let d0 = target.distTo2D(this.first());
            let d1 = target.distTo2D(this.last());
            mindist = Math.min(d0, d1);
            closest = d0 < d1 ? this.first() : this.last();
            index = d0 < d1 ? 0 : this.points.length - 1;
        } else {
            this.forEachPoint((point, pos) => {
                dist = Math.sqrt(point.distToSq2D(target));
                if (dist < mindist) {
                    index = pos;
                    mindist = dist;
                    closest = point;
                }
            });
        }

        return {
            distance: mindist,
            point: closest,
            index: index,
            poly: this
        };
    }

    /**
     * @param {Polygon[]} out
     * @param {[]} deep recurse and track recursion
     * @param {boolean} crush remove inner array after flatten
     * @returns {Polygon[]}
     */
    flattenTo(out, deep, crush) {
        out.push(this);
        if (deep) {
            if (deep.contains(this)) {
                console.log('flat recursion @', this);
                return;
            }
            deep.push(this);
        }
        if (this.inner) {
            for (let p of this.inner) {
                p.flattenTo(out, deep, crush);
            }
        }
        if (crush) {
            this.inner = undefined;
        }
        return out;
    }

    // possibly unused
    shortestSegmentLength() {
        let len = Infinity;
        this.forEachSegment((p1, p2) => {
            len = Math.min(len, p1.distTo2D(p2));
        });
        return len;
    }

    /**
     * @param {Polygon} poly clipping mask
     * @returns {?Polygon[]}
     */
    diff(poly) {
        let clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper(),
            fillang = this.fillang
                && this.area() > poly.area()
                ? this.fillang : poly.fillang;

        clip.AddPaths(sp1, PathSubject, true);
        clip.AddPaths(sp2, PathClip, true);

        if (clip.Execute(ClipDiff, tree, FillEvenOdd, FillEvenOdd)) {
            poly = POLY.fromClipperTree(tree, poly.getZ());
            poly.forEach(p => p.fillang = fillang);
            return poly;
        } else {
            return null;
        }
    }

    /**
     * @param {Polygon} poly poly to xor against this one
     * @returns {?Polygon[]}
     */
    xor(poly) {
        let fillang = this.fillang && this.area() > poly.area() ? this.fillang : poly.fillang,
            clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper();

        clip.AddPaths(sp1, PathSubject, true);
        clip.AddPaths(sp2, PathClip, true);

        if (clip.Execute(ClipXOR, tree, FillNonZero, FillNonZero)) {
            poly = POLY.fromClipperTree(tree, poly.getZ());
            poly.forEach(p => p.fillang = fillang);
            return poly;
        } else {
            return null;
        }
    }

    /**
     * @param {Polygon} poly clipping mask
     * @returns {?Polygon[]}
     */
    mask(poly, nullOnEquiv, minarea) {
        let clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper(),
            fillang = this.fillang
                && this.area() > poly.area()
                ? this.fillang : poly.fillang;

        clip.AddPaths(sp1, PathSubject, true);
        clip.AddPaths(sp2, PathClip, true);

        if (clip.Execute(ClipIntersect, tree, FillEvenOdd, FillEvenOdd)) {
            poly = POLY.fromClipperTree(tree, this.getZ(), undefined, undefined, minarea);
            poly.forEach(p => {
                p.fillang = fillang;
            })
            if (nullOnEquiv && poly.length === 1 && poly[0].isEquivalent(this)) {
                return null;
            }
            return poly;
        } else {
            return null;
        }
    }

    // cut poly using array of closed polygons. used primarily in cnc
    // to cut perimeters using tabs resulting in open poly lines.
    cut(polys, inter) {
        let target = this;

        if (!target.open) {
            target = this.clone(true).setOpen();
            target.push(target.first());
            if (target.inner) {
                target.inner.forEach(ip => {
                    ip.setOpen();
                    ip.push(ip.first());
                });
            }
        }

        let clip = new Clipper(),
            tree = new PolyTree(),
            type = inter ? ClipIntersect : ClipDiff,
            sp1 = target.toClipper(),
            sp2 = POLY.toClipper(polys);

        clip.AddPaths(sp1, PathSubject, false);
        clip.AddPaths(sp2, PathClip, true);

        if (clip.Execute(type, tree, FillEvenOdd, FillEvenOdd)) {
            let cuts = POLY.fromClipperTree(tree, target.getZ(), null, null, 0);
            cuts.forEach(no => {
                // heal open but really closed polygons because cutting
                // has to open the poly to perform the cut. but the result
                // may have been no intersection leaving an open poly
                if (no.open && no.first().distTo2D(no.last()) < 0.001) {
                    no.open = false;
                    no.points.pop();
                }
                no.depth = this.depth;
            });
            return cuts;
        } else {
            return null;
        }
    }

    // find the intersection of two polygons
    intersect(poly, min) {
        if (!this.overlaps(poly)) return null;

        if (this.isInside(poly)) {
            return [this];
        }

        let clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper(),
            minarea = min >= 0 ? min : 0.1;

        clip.AddPaths(sp1, PathSubject, true);
        clip.AddPaths(sp2, PathClip, true);

        if (clip.Execute(ClipIntersect, tree, FillNonZero, FillNonZero)) {
            let inter = POLY
                .fromClipperTreeUnion(tree, poly.getZ(), minarea)
                // .filter(p => p.isEquivalent(this) || p.isInside(this))
                .filter(p => p.isInside(this));
            return inter;
        }

        return null;
    }

    areaDiff(poly) {
        let a1 = this.area(),
            a2 = poly.area();
        return (a1 > a2) ? a2 / a1 : a1 / a2;
    }

    // does not work with nested polys
    simplify(opt = {}) {
        let z = this.getZ();

        // use expand / deflate technique instead
        if (opt.pump) {
            let p2 = POLY.offset([this], opt.pump, { z });
            if (p2) {
                p2 = POLY.offset(p2, -opt.pump, { z });
                return p2;
            }
            return null;
        }

        let clip = this.toClipper(),
            res = Clipper.SimplifyPolygons(clip, FillNonZero);

        if (!(res && res.length)) {
            return null;
        }

        return res.map(array => {
            let poly = newPolygon();
            for (let pt of array) {
                poly.push(pointFromClipper(pt, z));
            }
            return poly;
        });
    }

    unionMatch(polys) {
        return polys.filter(poly => poly.isEquivalent(this)).length;
    }

    /**
     * return logical OR of two polygons' enclosed areas
     *
     * @param {Polygon} poly
     * @returns {?Polygon} intersected polygon, null if no intersection, or all when indicated
     */
    union(poly, min, all) {
        if (!this.overlaps(poly)) return null;

        let clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper(),
            fillang = this.fillang
                && this.area() >= poly.area()
                ? this.fillang : poly.fillang;

        clip.AddPaths(sp1, PathSubject, true);
        clip.AddPaths(sp2, PathClip, true);

        if (clip.Execute(ClipUnion, tree, FillEvenOdd, FillEvenOdd)) {
            let union = POLY.fromClipperTreeUnion(tree, poly.getZ(), min ?? 0);
            let length = union.length;
            if (all) {
                return length === 2 ? null : union;
            } else if (length === 1) {
                union = union[0];
                union.fillang = fillang;
                return union;
            } else {
                console.trace({
                    check_union_call_path: union,
                    this: this,
                    poly
                });
            }
        }

        return null;
    }

    // annotate instance with other field data (see clone())
    annotate(obj = {}) {
        Object.assign(this, obj);
        return this;
    }

    // turn 2d polygon into a 2.5D ribbon extruded in Z
    ribbonZ(z = 1, zadd = 0, rev) {
        return mesh.ribbonZ(this, z, zadd, rev);
    }

    // for turning a poly with an inner offset into a
    // 3d mesh if and only if the inner has the same
    // circularity and <= num points
    // primarily used to make chamfers in mesh:tool
    // todo: relocate
    ribbonMesh(swap) {
        return mesh.ribbonMesh(this, swap);
    }

    // extrude poly (with inner voids) into 3d mesh
    // todo: zadd broken when poly Z is not 0
    extrude(z = 1, opt = {}) {
        return mesh.extrude(this, z, opt);
    }

    // split long straight lines into segments no longer than `max`
    // and return a new polygon. optionally `mark` points with their
    // derived segment start point (hinting for thin walls), `wrap`
    // the poly first point by appending to the end (adaptive walls),
    // or stopping segmentation at `maxoff`
    segment(max = 1, mark = false, wrap = false, maxoff = Infinity) {
        return path.segment(this, max, mark, wrap, maxoff);
    }

    // only used by cam/op-pocket.js
    // for any poly points closer than `dist`, replace them with their midpoint
    midpoints(dist = 0.01) {
        return path.midpoints(this, dist);
    }

    // walk points noting z deltas and smoothing z sawtooth patterns
    // used to smooth low-rez surface contouring
    refine(passes = 0) {
        return geo.refine(this, passes);
    }

    addDogbones(dist, reverse) {
        return path.addDogbones(this, dist, reverse);
    }
}

export function slopeDiff(s1, s2) {
    const n1 = s1.angle;
    const n2 = s2.angle;
    let diff = n2 - n1;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return Math.abs(diff);
}

export function fromClipperPath(path, z) {
    let poly = newPolygon(),
        i = 0,
        l = path.length;
    while (i < l) {
        // poly.push(newPoint(null,null,z,null,path[i++]));
        poly.push(pointFromClipper(path[i++], z));
    }
    return poly;
}

export function newPolygon(points) {
    return new Polygon(points);
}
