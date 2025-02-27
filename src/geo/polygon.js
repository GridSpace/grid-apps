/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.paths
// dep: ext.clip2
// dep: ext.earcut
// dep: geo.point
// dep: geo.bounds
// dep: geo.polygons
gapp.register("geo.polygon", [], (root, exports) => {

const { base } = root;
const { config, util, polygons, newBounds, newPoint } = base;

const POLY = polygons,
    XAXIS = new THREE.Vector3(1,0,0),
    DEG2RAD = Math.PI / 180,
    ClipperLib = self.ClipperLib,
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

class Polygon {
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

    toPath2D(offset) {
        return base.paths.pointsToPath(this.points, offset, this.open);
    }

    toPath3D(offset, height, z) {
        return base.paths.pathTo3D(this.toPath2D(offset), height, z);
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
        // gather all points into a single array including inner polys
        // keeping track of array offset indices for inners
        let out = [];
        let holes = [];

        // flatten points into array for earcut()
        this.points.forEach(p => {
            out.push(p.x, p.y, p.z);
        });

        // add hole offsets for inner polygons
        if (this.inner) {
            this.inner.forEach(p => {
                holes.push(out.length / 3);
                p.points.forEach(p => {
                    out.push(p.x, p.y, p.z);
                })
            });
        }

        // perform earcut()
        let cut = self.earcut(out, holes, 3);
        let ret = [];

        // preserve swaps in new polys
        for (let i = 0; i < cut.length; i += 3) {
            let p = new Polygon();
            p._aligned = this._aligned;
            p._swapped = this._swapped;
            for (let j = 0; j < 3; j++) {
                let n = cut[i + j] * 3;
                p.add(out[n], out[n + 1], out[n + 2]);
            }
            ret.push(p);
        }

        return ret;
    }

    setInner(inner) {
        this.inner = inner;
        return this;
    }

    // generate a trace path around the inside of a polygon
    // including inner polys. return the noodle and the remainder
    // of the polygon with the noodle removed (for the next pass)
    noodle(width) {
        // inset outer polygon
        let inner = this.inner;
        let inset = this.clone().offset(width);
        let noodot = [ this.clone().setInner(inset) ];
        let noodin = [];
        // subtract inners from the inset
        if (inner) {
            noodot = POLY.subtract(noodot, inner, []);
            // for each inner, offset and subtract noodle + itself
            let nood = [];
            for (let innie of inner) {
                let inexp = innie.clone().offset(-width);
                let intrm = POLY.trimTo(inexp, [ this ]);
                let inood = POLY.subtract(intrm, [ ...noodot, innie ], []);
                nood.push(...inood);
            }
            noodin = POLY.union(nood, 0, true);
        }
        // unify inner noodles and outer noodle
        let noodle = POLY.union([ ...noodot, ...noodin ], 0, true);
        // subtract noodle from poly for next noodle calc
        let remain = POLY.subtract([ this ], noodle, []);
        return { noodle, remain };
    }

    // generate center crossing point cloud
    centers(step, z, min, max, opt = {}) {
        let cloud = [],
            bounds = this.bounds,
            lines = opt.lines || false,
            stepoff = step / 2,
            set = [this.points];

        if (this.inner) {
            for (let inner of this.inner) {
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

        function build(poly) {
            let lastp = poly.last();
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
                poly.push(minp);
                return true;
            }
            return false;
        }

        // join points into polys
        let polys = [];
        let poly = [];
        while (cloud.length) {
            if (poly.length === 0) {
                poly = [cloud.shift()];
                polys.push(poly);
                continue;
            }
            if (build(poly)) {
                continue;
            }
            if (!poly.flip) {
                poly.reverse();
                poly.flip = true;
                continue;
            }
            if (poly.length) {
                poly = [];
            } else {
                throw "whoop there it is";
            }
        }

        return polys
            .filter(poly => poly.length > 1)
            .map(poly => {
                let np = base.newPolygon().setOpen();
                for (let p of poly) {
                    np.push(p);
                }
                if (np.last().distTo2D(np.first()) <= max) {
                    np.setClosed();
                }
                np = np.clean();
                return np;
            });
    }

    debur(dist) {
        if (this.len < 2) {
            return null;
        }
        const pa = this.points,
            pln = pa.length,
            open = this.open,
            newp = newPolygon().copyZ(this.z),
            min = dist || base.config.precision_merge;
        let lo;
        newp.push(lo = pa[0]);
        for (let i = 1; i < pln; i++) {
            if (lo.distTo2D(pa[i]) >= min) {
                newp.push(lo = pa[i]);
            }
        }
        newp.open = open;
        newp.parent = this.parent;
        if (newp.length < 2) {
            return null;
        }
        return newp;
    }

    miter(debug) {
        if (this.length < 3) return this;

        const slo = [],
            pa = this.points,
            pln = pa.length,
            open = this.open;
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
            // ang[pln-1] = slopeDiff(slo[pln-2], slo[pln-1]);
            ang[0] = slopeDiff(slo[pln - 1], slo[0]);
            redo |= ang[pln - 1] > 90;
            redo |= ang[0] > 90;
        }
        if (redo) {
            const newp = newPolygon().copyZ(this.z);
            // newp.debug = this.debug = true;
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
        return this;
    }

    createConvexHull(points) {
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
        this.addPoints(hull);

        return this;
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
        let pe = this.perimeter(),
            pe1 = pe / 3, // point 2
            pe2 = pe1 * 2, // point 3
            p = this.points,
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
            } else if (ap.length === 2 && td >= pe2) {
                ap.push(np);
                break;
            }
            lp = np;
        }
        let center = util.center2d(...ap);
        return newPoint(center.x, center.y, p[0].z, null);
    }

    /**
     * iterate over poly points and find sequences of 5 or more points
     * with a common center point and collect as a midpoint/radius
     */
    findArcCenters(opt = {}) {
        if (this.length < 6) return [];
        let tolerance = opt.tolerance || 1e-2,
            inside = opt.inside ?? true,
            seq = this.points.slice(),
            util = base.util;
        if (this.isClosed()) seq.appendAll(seq.slice(0,5));
        let recs = [], // accumulated arc points
            cand = []; // candidate center array
        for (let pos=3; pos<seq.length; pos++) {
            let next = util.circleCenter(...seq.slice(pos-3, pos));
            let prev = cand.peek();
            if (inside && !newPoint(next.x,next.y).inPolygon(this)) {
                // require point be inside current polygon
                next = null;
            }
            // console.log({ pos, next, prev, cand });
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
            // const dist = util.dist2D(next,prev);
            // console.log({ dist: dist.round(6) });
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
                let p2 = new THREE.Vector3(point.x, point.y, point.z)
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

    /**
     * Ease down along the polygonal path.
     *
     * 1. Travel from fromPoint to closest point on polygon, to rampZ above that that point,
     * 2. ease-down starts, following the polygonal path, decreasing Z at a fixed slope until target Z is hit,
     * 3. then the rest of the path is completed and repeated at target Z until touchdown point is reached.
     * 4. this function should probably move to CAM prepare since it's only called from there
     */
    forEachPointEaseDown(fn, fromPoint, degrees = 45) {
        let index = this.findClosestPointTo(fromPoint).index,
            fromZ = fromPoint.z,
            offset = 0,
            points = this.points,
            length = points.length,
            touch = -1, // first point to touch target z
            targetZ = points[0].z,
            dist2next,
            last,
            next,
            done;

        // Slope for computations.
        const slope = Math.tan((degrees * Math.PI) / 180);
        // Z height above polygon Z from which to start the ease-down.
        // Machine will travel from "fromPoint" to "nearest point x, y, z' => with z' = point z + rampZ",
        // then start the ease down along path.
        const rampZ = 2.0;
        while (true) {
            next = points[index % length];
            if (last && next.z < fromZ) {
                // When "in Ease-Down" (ie. while target Z not yet reached) - follow path while slowly decreasing Z.
                let deltaZ = fromZ - next.z;
                dist2next = last.distTo2D(next);
                let deltaZFullMove = dist2next * slope;

                if (deltaZFullMove > deltaZ) {
                    // Too long: easing along full path would overshoot depth, synth intermediate point at target Z.
                    //
                    // XXX: please check my super basic trig - this should follow from `last` to `next` up until the
                    //      intersect at the target Z distance.
                    fn(last.followTo(next, dist2next * deltaZ / deltaZFullMove).setZ(next.z), offset++);
                } else {
                    // Ok: execute full move at desired slope.
                    next = next.clone().setZ(fromZ - deltaZFullMove);
                }

                fromZ = next.z;
            } else if (offset === 0 && next.z < fromZ) {
                // First point, move to rampZ height above next.
                let deltaZ = fromZ - next.z;
                fromZ = next.z + Math.min(deltaZ, rampZ)
                next = next.clone().setZ(fromZ);
            }
            last = next;
            fn(next, offset++);
            if ((index % length) === touch) {
                break;
            }
            if (touch < 0 && next.z <= targetZ) {
                // Save touch-down index so as to be able to "complete" the full cut at target Z,
                // i.e. keep following the path loop until the touch down point is reached again.
                touch = ((index + length) % length);
            }
            index++;
        }

        return last;
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
     * returns intersections sorted by closest to lp1
     */
    intersections(lp1, lp2, deep) {
        let list = [];
        this.forEachSegment(function(pp1, pp2, ip1, ip2) {
            let int = util.intersect(lp1, lp2, pp1, pp2, base.key.SEGINT, false);
            if (int) {
                list.push(int);
                // console.log('pp1.pos',pp1.pos,'to',ip1);
                // console.log('pp2.pos',pp2.pos,'to',ip2);
                pp1.pos = ip1;
                pp2.pos = ip2;
            }
        });
        list.sort(function(p1, p2) {
            return util.distSq(lp1, p1) - util.distSq(lp1, p2);
        });
        if (deep && this.inner) {
            this.inner.forEach(p => {
                let ints = p.intersections(lp1, lp2);
                if (ints) list.appendAll(ints);
            });
        }
        return list;
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
        return (4 * Math.PI * this.area()) / util.sqr(this.perimeter());
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
        // throw new Error("isEquivalent");
        let area1 = Math.abs(this.area());
        let area2 = Math.abs(poly.area());
        if (util.isCloseTo(area1, area2, precision || config.precision_poly_area) &&
            this.bounds.equals(poly.bounds, precision || config.precision_poly_bounds)) {
            // use circularity near 1 to eliminate the extensive check below
            let c1 = this.circularity(),
                c2 = poly.circularity();
            if (Math.abs(c1 - c2) < config.precision_circularity && ((1 - c1) < config.precision_circularity)) {
                return true;
            }

            if (recurse) {
                let i, ai = this.inner,
                    bi = poly.inner;
                if (ai !== bi) {
                    if (ai === null || bi === null || ai.length != bi.length) {
                        return false;
                    }
                    for (i = 0; i < ai.length; i++) {
                        if (!ai[i].isEquivalent(bi[i])) {
                            return false;
                        }
                    }
                }
            }

            let exit = true,
                pointok,
                dist,
                min;

            this.forEachPoint(i2p => {
                pointok = false;
                poly.forEachSegment((i1p1, i1p2) => {
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

        this.forEachPoint((point, pos) => {
            dist = Math.sqrt(point.distToSq2D(target));
            if (dist < mindist) {
                index = pos;
                mindist = dist;
                closest = point;
            }
        });

        return {
            point: closest,
            distance: mindist,
            index: index
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
        let fillang = this.fillang && this.area() > poly.area() ? this.fillang : poly.fillang,
            clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper();

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
        let fillang = this.fillang && this.area() > poly.area() ? this.fillang : poly.fillang,
            clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper();
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
            let p2 = POLY.offset([this], opt.pump, {
                z
            });
            if (p2) {
                p2 = POLY.offset(p2, -opt.pump, {
                    z
                });
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
                poly.push(base.pointFromClipper(pt, z));
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

        let fillang = this.fillang && this.area() > poly.area() ? this.fillang : poly.fillang,
            clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper(),
            minarea = min ?? 0.1;

        clip.AddPaths(sp1, PathSubject, true);
        clip.AddPaths(sp2, PathClip, true);

        if (clip.Execute(ClipUnion, tree, FillEvenOdd, FillEvenOdd)) {
            let union = POLY.fromClipperTreeUnion(tree, poly.getZ(), minarea);
            if (all) {
                if (union.length === 2) {
                    return null;
                    // if (this.unionMatch(union) || poly.unionMatch(union)) {
                    //     return null;
                    // }
                }
                return union;
            }
            if (union.length === 1) {
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

    annotate(obj = {}) {
        Object.assign(this, obj);
        return this;
    }

    // turn 2d polygon into a 2.5D ribbon extruded in Z
    ribbonZ(z = 1, zadd = 0, rev) {
        let poly = this.clone().setClockwise();
        let faces = [];
        let points = poly.points;
        let length = points.length;
        if (rev) {
            points = points.slice().reverse();
        }
        for (let i=0; i<length; i++) {
            let p0 = points[i];
            let p1 = points[(i + 1) % length];
            faces.push(p0.x, p0.y, p0.z + zadd);
            faces.push(p1.x, p1.y, p1.z + z + zadd);
            faces.push(p1.x, p1.y, p0.z + zadd);
            faces.push(p0.x, p0.y, p0.z + zadd);
            faces.push(p0.x, p0.y, p0.z + z + zadd);
            faces.push(p1.x, p1.y, p1.z + z + zadd);
        }
        return faces;
    }

    // for turning a poly with an inner offset into a
    // 3d mesh if and only if the inner has the same
    // circularity and <= num points
    // primarily used to make chamfers
    ribbonMesh(swap) {
        if (!(this.inner && this.inner.length === 1)) {
            return undefined;
        }
        let outer = this.clone().setClockwise();
        let inner = this.inner[0].clone().setClockwise();
        let c0 = outer.circularity();
        let c1 = inner.circularity();
        let n0 = outer.points.length;
        let n1 = inner.points.length;
        let p0 = outer.points.slice();
        let p1 = inner.points.slice();
        let min = { d: Infinity, i:0, j:0 };
        // find the closests two points inner/outer
        for (let i=0; i<p0.length; i++) {
            for (let j=0; j<p1.length; j++) {
                let d = p0[i].distTo2D(p1[j]);
                if (d < min.d) {
                    min = { d, i, j };
                }
            }
        }
        // slide the arrays until the closest points are aligned at index = 0
        p0 = p0.slice(min.i).concat(p0.slice(0, min.i)); p0.push(p0[0]);
        p1 = p1.slice(min.j).concat(p1.slice(0, min.j)); p1.push(p1[0]);
        // walk both arrays moving to the next poly + point that forms
        // the shortest line segment between the two points (inner / outer)
        let faces = [];
        let pi0 = 0;
        let pi1 = 0;
        let pp0 = p0[pi0];
        let pp1 = p1[pi1];
        for (;;) {
            let pn0 = p0[pi0 + 1];
            let pn1 = p1[pi1 + 1];
            if ((!pn0 && pn1) || (pn1 && pp0.distTo2D(pn1) < pp1.distTo2D(pn0))) {
                // emit and increment bottom
                faces.push(pp0.x, pp0.y, pp0.z);
                if (swap) {
                    faces.push(pp1.x, pp1.y, pp1.z);
                    faces.push(pn1.x, pn1.y, pn1.z);
                } else {
                    faces.push(pn1.x, pn1.y, pn1.z);
                    faces.push(pp1.x, pp1.y, pp1.z);
                }
                pi1++;
                pp1 = p1[pi1];
            } else if (pn0) {
                // emit and increment top
                faces.push(pp0.x, pp0.y, pp0.z);
                if (swap) {
                    faces.push(pp1.x, pp1.y, pp1.z);
                    faces.push(pn0.x, pn0.y, pn0.z);
                } else {
                    faces.push(pn0.x, pn0.y, pn0.z);
                    faces.push(pp1.x, pp1.y, pp1.z);
                }
                pi0++;
                pp0 = p0[pi0];
            } else {
                break;
            }
        }
        return faces;
    }

    // extrude poly (with inner voids) into 3d mesh
    extrude(z = 1, opt = {}) {
        let earcut = this.earcut(); // array of 3-point polygons

        // return just the 2D face when no Z depth specified
        // used primarily by mesh.sketch render()
        if (z === 0) {
            return earcut.map(face => face.points.map(p => [ p.x, p.y, p.z ])).flat().flat();
        }

        let inv = z < 0;

        if (inv) {
            z = -z;
        }

        let chamfer = opt.chamfer || 0;
        let chamfer_top = opt.chamfer_top || chamfer;
        let chamfer_bottom = opt.chamfer_bottom || chamfer;

        if (inv) {
            let tmp = chamfer_top;
            chamfer_top = chamfer_bottom;
            chamfer_bottom = tmp;
        }

        let zadd = (typeof opt === 'number' ? opt : opt.zadd || 0); // z bottom
        let obj = []; // flat output vertex array (float-x,float-y,float-z,...)
        let top_face = earcut;
        let bottom_face = earcut;
        let z_top = z + zadd;
        let z_bottom = zadd;
        let z_side_top = z;
        let z_side_bottom = z_bottom;

        // chamfer bottom only on negative chamfer
        if (chamfer < 0) {
            chamfer_top = 0;
            chamfer_bottom = -chamfer;
        }

        // create chamfers (when defined)
        if (chamfer_top) {
            let inset = this.offset(chamfer_top);
            if (inset.length === 1) {
                inset[0].setZ(z_top);
                top_face = inset[0].earcut();
                z_side_top -= chamfer_top;
                let renest = POLY.renest([this.clone(true).setZ(z_side_top), inset[0]]);
                for (let rnpoly of renest) {
                    obj.appendAll(rnpoly.ribbonMesh(true));
                }
            }
        }

        if (chamfer_bottom) {
            let inset = this.offset(chamfer_bottom);
            if (inset.length === 1) {
                inset[0].setZ(0);
                bottom_face = inset[0].earcut();
                z_side_top -= chamfer_top || chamfer_bottom;
                z_side_bottom += chamfer_bottom;
                let renest = POLY.renest([this.clone(true).setZ(z_side_bottom), inset[0]]);
                for (let rnpoly of renest) {
                    obj.appendAll(rnpoly.ribbonMesh(false));
                }
            }
        }

        for (let poly of top_face) {
            for (let point of poly.points) {
                obj.push(point.x, point.y, z_top);
            }
        }

        // bottom face (reversed to reverse normals)
        for (let poly of bottom_face) {
            for (let point of poly.points.reverse()) {
                obj.push(point.x, point.y, z_bottom);
            }
        }

        // outside wall
        let rib = z - chamfer_top - chamfer_bottom;
        obj.appendAll(this.ribbonZ(rib, z_side_bottom));
        for (let inner of this.inner || []) {
            // inside wall(s)
            obj.appendAll(inner.ribbonZ(rib, z_side_bottom, true));
        }

        if (inv) {
            for (let i=2; i<obj.length; i+=3) {
                obj[i] -= z;
            }
        }

        return obj;
    }

    // split long straight lines into segments no longer than max
    // and return a new polygon
    segment(max = 1) {
        const newp = [];
        const points = this.points;
        const length = points.length;
        const l0 = this.open ? length - 1 : length;
        for (let i=0, p=points, l1=length, l2=l1+1; i<l0; i++) {
            const p1 = p[i];
            const p2 = p[(i + 1) % l1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dl = Math.sqrt(dx * dx + dy * dy);
            newp.push(p1);
            if (dl < max) {
                continue;
            }
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
            }
        }
        if (newp.length > length) {
            return newPolygon().addPoints(newp.map(p => p.clone())).setOpenValue(this.open);
        }
        return this;
    }

    midpoints(dist = 0.01) {
        const newp = [];
        const points = this.points;
        const length = points.length;
        const l0 = this.open ? length - 1 : length;
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
            return newPolygon().addPoints(newp.map(p => p.clone())).setOpenValue(this.open);
        }
        return this;
    }

}

// use Slope.angleDiff() then re-test path mitering / rendering
function slopeDiff(s1, s2) {
    const n1 = s1.angle;
    const n2 = s2.angle;
    let diff = n2 - n1;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return Math.abs(diff);
}

function fromClipperPath(path, z) {
    let poly = newPolygon(),
        i = 0,
        l = path.length;
    while (i < l) {
        // poly.push(newPoint(null,null,z,null,path[i++]));
        poly.push(base.pointFromClipper(path[i++], z));
    }
    return poly;
}

function newPolygon(points) {
    return new Polygon(points);
}

Polygon.fromArray = function(array) {
    return newPolygon().fromArray(array);
};

gapp.overlay(base, {
    Polygon,
    newPolygon
});

});
