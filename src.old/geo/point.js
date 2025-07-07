/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
gapp.register("geo.point", [], (root, exports) => {

const { base } = root;
const { util, config, key } = base;
const { round } = util;

class Point {
    constructor(x = 0, y = 0, z = 0, key) {
        this.x = x;
        this.y = y;
        this.z = z;
        if (key) {
            this._key = key;
        }
    }

    get key() {
        if (this._key) {
            return this._key;
        }
        return this._key = [
            ((this.x * 100000) | 0),
            ((this.y * 100000) | 0),
            ((this.z * 100000) | 0)
        ].join('');
    }

    toClipper() {
        return {
            X: this.x * config.clipper,
            Y: this.y * config.clipper
        };
    }

    toArray() {
        return [ this.x, this.y, this.z ];
    }

    toVector3() {
        return new THREE.Vector3(this.x, this.y, this.z);
    }

    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        delete this._key;
        return this;
    }

    setX(x) {
        this.x = x;
        return this;
    }

    setY(y) {
        this.y = y;
        return this;
    }

    setZ(z) {
        this.z = z;
        return this;
    }

    setA(a) {
        this.a = a;
        return this;
    }

    swapXZ() {
        let p = this,
            t = p.x;
        p.x = p.z;
        p.z = t;
        return this;
    }

    swapYZ() {
        let p = this,
            t = p.y;
        p.y = p.z;
        p.z = t;
        return this;
    }

    scale(x = 1, y = 1, z = 1) {
        this.x *= x;
        this.y *= y;
        this.z *= z;
        return this;
    }

    round(precision) {
        return newPoint(
            this.x.round(precision),
            this.y.round(precision),
            this.z.round(precision));
    }

    addFacet(facet) {
        if (!this.group) this.group = [];
        this.group.push(facet);
        return this;
    }

    rekey() {
        this._key = undefined;
    }

    toString() {
        return this.key;
    }

    clone() {
        let p = newPoint(this.x, this.y, this.z, this._key);
        if (this.a !== undefined) {
            p.a = this.a;
        }
        return p;
    }

    slopeTo(p) {
        return base.newSlope(this, p);
    }

    lineTo(p, k) {
        return base.newLine(this, p, k);
    }

    isNear(p, dist) {
        return util.isCloseTo(this.x, p.x, dist) && util.isCloseTo(this.y, p.y, dist);
    }

    /**
     * return distance to line connecting points p1, p2
     * distance is calculated on the perpendicular (normal) to line
     *
     * @param {Point} p1
     * @param {Point} p2
     * @returns {number}
     */
    distToLine(p1, p2) {
        return Math.sqrt(this.distToLineSq(p1, p2));
    }

    distToLine3D(lp1, lp2) {
        // Convert points to vectors
        const p0 = [this.x, this.y, this.z];
        const p1 = [lp1.x, lp1.y, lp1.z];
        const p2 = [lp2.x, lp2.y, lp2.z];

        // Calculate the direction vector of the line
        const lineDir = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];

        // Calculate the vector from p1 to the point
        const p1ToP = [p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]];

        // Calculate the cross product of lineDir and p1ToP
        const crossProd = [
            lineDir[1] * p1ToP[2] - lineDir[2] * p1ToP[1],
            lineDir[2] * p1ToP[0] - lineDir[0] * p1ToP[2],
            lineDir[0] * p1ToP[1] - lineDir[1] * p1ToP[0]
        ];

        // Calculate the magnitude of the cross product
        const crossProdMag = Math.sqrt(crossProd[0] ** 2 + crossProd[1] ** 2 + crossProd[2] ** 2);

        // Calculate the magnitude of the direction vector of the line
        const lineDirMag = Math.sqrt(lineDir[0] ** 2 + lineDir[1] ** 2 + lineDir[2] ** 2);

        // Distance from point to line is the magnitude of the cross product divided by the magnitude of the direction vector
        const distance = crossProdMag / lineDirMag;

        return distance;
    }

    /**
     * used exclusively in new fill code. output does not agree with
     * old distToLine, but is the only method that seems to work for
     * fill. using new distToLine as a global replacement breaks support
     * offset clipping. both need to be investigated and a single line
     * normal distance needs to be formulated to replace both functions.
     */
    distToLineNew(p1, p2) {
        return p2l(this, p1, p2);
    }

    /**
     * return square of distance to line connecting points p1, p2
     * distance is calculated on the perpendicular (normal) to line
     */
    distToLineSq(p1, p2) {
        let p = this,
            d = util.distSq(p1, p2);

        let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / d;

        if (t < 0) return util.distSq(p, p1);
        if (t > 1) return util.distSq(p, p2);

        return util.distSqv2(p.x, p.y, p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y));
    }

    withinDist2(p1, p2, dist2) {
        let ll2 = p1.distToSq2D(p2),
            dp1 = this.distToSq2D(p1),
            dp2 = this.distToSq2D(p2);
        // if the line segment described is less than dist2
        // then add dist2 to ll2. if this point is not closer
        // than newll2 to either point, then it can't be closer
        // to the described segment than dist2
        if (ll2 < dist2) {
            ll2 += dist2;
            if (dp1 > ll2 && dp2 > ll2) return false;
        }
        // if point is farther from each point that the distance
        // between the points and that distance is greater than dist2
        // then it's not possible for the point to be closer than
        // dist2 to the described line segment.
        if (dp1 > ll2 && dp2 > ll2) return false;
        return this.distToLineSq(p1, p2) < dist2;
    }

    midPointTo(p2) {
        return newPoint((this.x + p2.x) / 2, (this.y + p2.y) / 2, this.z);
    }

    midPointTo3D(p2) {
        return newPoint(
            (this.x + p2.x) / 2,
            (this.y + p2.y) / 2,
            (this.z + p2.z) / 2
        );
    }

    /**
     * non-scale corrected version of follow()
     */
    projectOnSlope(slope, mult) {
        return newPoint(
            this.x + slope.dx * mult,
            this.y + slope.dy * mult,
            this.z);
    }

    followTo(point, mult) {
        return this.follow(this.slopeTo(point), mult);
    }

    /**
     * return a point along the line this from point to p2 offset
     * by a distance.  positive distances are closer to this point.
     */
    offsetPointFrom(p2, dist) {
        let p1 = this,
            dx = p2.x - p1.x,
            dy = p2.y - p1.y,
            ls = dist / Math.sqrt(dx * dx + dy * dy),
            ox = dx * ls,
            oy = dy * ls;
        return newPoint(p2.x - ox, p2.y - oy, p2.z, key.NONE);
    }

    /**
     * return a point along the line this from point to p2 offset
     * by a distance.  positive distances are farther from this point.
     */
    offsetPointTo(p2, dist) {
        let p1 = this,
            dx = p2.x - p1.x,
            dy = p2.y - p1.y;

        if (dx === 0 && dy === 0) return this;

        let ls = dist / Math.sqrt(dx * dx + dy * dy),
            ox = dx * ls,
            oy = dy * ls;

        return newPoint(p1.x + ox, p1.y + oy, p2.z, key.NONE);
    }

    offsetLineTo(p2, offset) {
        let p1 = this,
            dx = p2.x - p1.x,
            dy = p2.y - p1.y,
            ls = offset / Math.sqrt(dx * dx + dy * dy),
            ox = dx * ls,
            oy = dy * ls,
            np1 = newPoint(p1.x - oy, p1.y + ox, p1.z, key.NONE),
            np2 = newPoint(p2.x - oy, p2.y + ox, p2.z, key.NONE);
        np1.op = p1;
        np2.op = p2;
        return base.newLine(np1, np2, key.NONE);
    }

    offset(x, y, z) {
        return newPoint(this.x + x, this.y + y, this.z + z);
    }

    /**
     * checks if a point is inside of a polygon
     * does not check children/holes
     */
    inPolygon(poly) {
        if (!poly.bounds.containsXY(this.x, this.y)) return false;

        let p = poly.points,
            pl = p.length,
            p1, p2, i, inside = false;

        for (i = 0; i < pl; i++) {
            p1 = p[i];
            p2 = p[(i + 1) % pl];
            if ((p1.y >= this.y) != (p2.y >= this.y) &&
                (this.x <= (p2.x - p1.x) * (this.y - p1.y) / (p2.y - p1.y) + p1.x)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * returns true if the point is inside of a polygon but
     * not inside any of it's children
     */
    isInPolygon(poly) {
        let point = this,
            i;
        if (Array.isArray(poly)) {
            for (i = 0; i < poly.length; i++) {
                if (point.isInPolygon(poly[i])) return true;
            }
            return false;
        }
        let holes = poly.inner;
        if (point.inPolygon(poly) || point.nearPolygon(poly, config.precision_merge_sq)) {
            for (i = 0; holes && i < holes.length; i++) {
                if (point.inPolygon(holes[i]) && !point.nearPolygon(holes[i], config.precision_merge_sq)) return false;
            }
            return true;
        }
        return false;
    }

    /**
     * returns true if the point is inside of a polygon but
     * not inside any of it's children
     */
    isInPolygonOnly(poly) {
        let point = this,
            i;
        if (Array.isArray(poly)) {
            for (i = 0; i < poly.length; i++) {
                if (point.isInPolygonOnly(poly[i])) {
                    return true;
                }
            }
            return false;
        }
        let holes = poly.inner;
        if (point.inPolygon(poly)) {
            for (i = 0; holes && i < holes.length; i++) {
                if (point.inPolygon(holes[i])) return false;
            }
            return true;
        }
        return false;
    }

    /**
     * checks if point is near polygon edge.  distance is squared.
     * @param {boolean} [inner] process inner polygons
     */
    nearPolygon(poly, dist2, inner) {
        // throw new Error("nearPolygon");
        for (let i = 0, p = poly.points, pl = p.length; i < pl; i++) {
            if (this.withinDist2(p[i], p[(i + 1) % pl], dist2)) {
                return true;
            }
        }
        if (inner && poly.inner) {
            for (let i = 0; i < poly.inner.length; i++) {
                if (this.nearPolygon(poly.inner[i], dist2)) return true;
            }
        }
        return false;
    }

    /**
     * returns true if point will not be trimmed later
     */
    insideOffset(poly, offset, mindist2) {
        return this.inPolygon(poly) === (offset > 0) && !this.nearPolygon(poly, mindist2);
    }

    /**
     * returns a new point following given slope for given distance
     * same as projectOnSlope() but scaled
     */
    follow(slope, distance) {
        let ls = distance / Math.sqrt(slope.dx * slope.dx + slope.dy * slope.dy);
        return newPoint(this.x + slope.dx * ls, this.y + slope.dy * ls, this.z);
    }

    /**
     * for point, return intersecting point on z to next point if points
     * are on either size of z
     */
    intersectZ(p, z) {
        let dx = p.x - this.x,
            dy = p.y - this.y,
            dz = p.z - this.z,
            pct = 1 - ((p.z - z) / dz);
        return newPoint(this.x + dx * pct, this.y + dy * pct, this.z + dz * pct);
    }

    isEqual2D(p) {
        return this === p || (this.x === p.x && this.y === p.y);
    }

    /**
     * returns true if points are close enough to be considered equivalent
     */
    isMergable2D(p) {
        return this.isEqual2D(p) || (this.distToSq2D(p) < config.precision_merge_sq);
    }

    /**
     * compares 3D point
     */
    isEqual(p) {
        return this === p || (this.x === p.x && this.y === p.y && this.z === p.z);
    }

    isEqual2D(p) {
        return this === p || (this.x === p.x && this.y === p.y);
    }

    /**
     * returns true if points are close enough to be considered equivalent
     */
    isMergable3D(p) {
        return this.isEqual(p) || (this.distToSq3D(p) < config.precision_merge_sq);
    }

    /**
     * return true if point is inside 2D square size dist*2 around p
     */
    isInBox(p, dist) {
        return Math.abs(this.x - p.x) < dist && Math.abs(this.y - p.y) < dist;
    }

    /**
     * return min distance from point to a polygon
     * stops searching if any point is closer than threshold
     *
     * @param {Polygon} poly
     * @param {number} [threshold] stop looking if under threshold
     */
    distToPolySegments(poly, threshold) {
        let point = this,
            mindist = Infinity;
        poly.forEachSegment(function(p1, p2) {
            const nextdist = Math.min(mindist, point.distToLine(p1, p2));
            mindist = Math.min(nextdist, mindist);
            // returning true terminates forEachSegment()
            if (mindist <= threshold) return true;
        });
        return mindist;
    }

    /**
     * @param {Polygon} poly
     * @param {number} [threshold] stop looking if under threshold
     */
    distToPolyPoints(poly, threshold) {
        let point = this,
            mindist = Infinity;
        poly.forEachPoint(function(pp) {
            mindist = Math.min(mindist, point.distTo2D(pp));
            if (mindist < threshold) return true;
        });
        return mindist;
    }

    /**
     * @returns {Point} nearest point (less than max) from array to this point
     */
    nearestTo(points, max) {
        if (!max) throw "missing max";
        let mind = Infinity,
            minp = null,
            i, p, d;
        for (i = 0; i < points.length; i++) {
            p = points[i];
            if (p === this || p.del) continue;
            d = this.distToSq2D(p);
            if (d < max && d < mind) {
                mind = d;
                minp = p;
            }
        }
        return minp;
    }

    /**
     * @param {Point[]} points
     * @return {number} average square dist to cloud of points
     */
    averageDistTo(points) {
        let sum = 0.0,
            count = 0,
            i;
        for (i = 0; i < points.length; i++) {
            if (points[i] != this) {
                sum += this.distToSq2D(points[i]);
                count++;
            }
        }
        return sum / count;
    }

    /**
     * dist to point in 2D
     */
    distTo2D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * square of distance in 2D
     */
    distToSq2D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y;
        return dx * dx + dy * dy;
    }

    distTo3D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y,
            dz = this.z - p.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * square of distance in 3D
     */
    distToSq3D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y,
            dz = this.z - p.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * returns true if point is inside triangle described by three points
     */
    inTriangle(a, b, c) {
        let as_x = this.x - a.x,
            as_y = this.y - a.y,
            s_ab = (b.x - a.x) * as_y - (b.y - a.y) * as_x > 0;
        if ((c.x - a.x) * as_y - (c.y - a.y) * as_x > 0 == s_ab) return false;
        if ((c.x - b.x) * (this.y - b.y) - (c.y - b.y) * (this.x - b.x) > 0 != s_ab) return false;
        return true;
    }

    /**
     * returns true if point is on a line described by two points.
     * test sum of distances p1->this + this->p2 ~= p1->p2 whens
     * slopes from p1->this same as this->p2
     */
    onLine(p1, p2) {
        return this.distToLine(p1, p2) < config.precision_point_on_line;
    }

    add(delta) {
        return newPoint(this.x + delta.x, this.y + delta.y, this.z + delta.z);
    }

    sub(delta) {
        return newPoint(this.x - delta.x, this.y - delta.y, this.z - delta.z);
    }

    move(delta) {
        this.x += delta.x;
        this.y += delta.y;
        this.z += delta.z;
        return this;
    }

    // radians rotatition in XY around origin
    rotate(angle) {
        const { x, y } = this;
        this.x = x * Math.cos(angle) - y * Math.sin(angle);
        this.y = y * Math.cos(angle) + x * Math.sin(angle);
    }
}

function dot(u, v) {
    return u.x * v.x + u.y * v.y;
}

function norm(v) {
    return Math.sqrt(dot(v, v));
}

function d(u, v) {
    return norm({
        x: u.x - v.x,
        y: u.y - v.y
    });
}

function p2l(p, l1, l2) {
    let v = {
        x: l2.x - l1.x,
        y: l2.y - l1.y
    };
    let w = {
        x: p.x - l1.x,
        y: p.y - l1.y
    };
    let c1 = dot(w, v);
    let c2 = dot(v, v);
    let b = c1 / c2;
    if (isNaN(b)) {
        // console.log('nan', {p, l1, l2, v, w, c1, c2});
        b = 0;
    }
    let pb = {
        x: l1.x + b * v.x,
        y: l1.y + b * v.y
    };
    return d(p, pb);
}

function newPoint(x, y, z, key) {
    return new Point(x, y, z, key);
}

function pointFromClipper(cp, z) {
    return newPoint(cp.X / config.clipper, cp.Y / config.clipper, z);
}

gapp.overlay(base, {
    Point,
    newPoint,
    pointFromClipper
});

});
