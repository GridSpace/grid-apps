/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.base.Point) return;

    const BASE = self.base,
        UTIL = BASE.util,
        CONF = BASE.config,
        KEYS = BASE.key,
        ROUND = UTIL.round;

    class Point {
        constructor(x,y,z,key) {
            this.x = x;
            this.y = y;
            this.z = z || 0;
            if (key) {
                this._key = key;
            }
        }

        get key() {
            if (this._key) {
                return this._key;
            }
            return this._key = [
                this.x.round(6),
                this.y.round(6),
                this.z.round(6)
            ].toString();
        }
    }

    const PRO = Point.prototype;

    BASE.Point = Point;

    BASE.newPoint = newPoint;

    BASE.pointFromClipper = function(cp, z) {
        return newPoint(cp.X / CONF.clipper, cp.Y / CONF.clipper, z);
    };

    /** ******************************************************************
     * Point Prototype Functions
     ******************************************************************* */

    PRO.toClipper = function() {
        return {
            X: this.x * CONF.clipper,
            Y: this.y * CONF.clipper
        };
    }

    PRO.setZ = function(z) {
        this.z = z;
        return this;
    }

    PRO.swapXZ = function() {
        let p = this,
            t = p.x;
        p.x = p.z;
        p.z = t;
    };

    PRO.swapYZ = function() {
        let p = this,
            t = p.y;
        p.y = p.z;
        p.z = t;
    };

    PRO.round = function(precision) {
        return newPoint(
            this.x.round(precision),
            this.y.round(precision),
            this.z.round(precision));
    };

    PRO.addFacet = function(facet) {
        if (!this.group) this.group = [];
        this.group.push(facet);
        return this;
    };

    PRO.rekey = function() {
        this._key = undefined;
    };

    PRO.toString = function() {
        return this.key;
    };

    /**
     * @returns {Point}
     */
    PRO.clone = function() {
        return newPoint(this.x, this.y, this.z, this._key);
    };

    /**
     * @param {Point} p
     * @returns {Slope}
     */
    PRO.slopeTo = function(p) {
        return BASE.newSlope(this, p);
    };

    /**
     *
     * @param {Point} p
     * @param {String} [k]
     * @returns {Line}
     */
    PRO.lineTo = function(p, k) {
        return BASE.newLine(this, p, k);
    };

    /**
     * @param {Point} p
     * @param {number} [dist]
     * @returns {boolean}
     */
    PRO.isNear = function(p, dist) {
        return UTIL.isCloseTo(this.x, p.x, dist) && UTIL.isCloseTo(this.y, p.y, dist);
    };

    /**
     * return distance to line connecting points p1, p2
     * distance is calculated on the perpendicular (normal) to line
     *
     * @param {Point} p1
     * @param {Point} p2
     * @returns {number}
     */
    PRO.distToLine = function(p1, p2) {
        // return p2l(this, p1, p2);
        return Math.sqrt(this.distToLineSq(p1, p2));
    };

    /**
     * used exclusively in new fill code. output does not agree with
     * old distToLine, but is the only method that seems to work for
     * fill. using new distToLine as a global replacement breaks support
     * offset clipping. both need to be investigated and a single line
     * normal distance needs to be formulated to replace both functions.
     */
    PRO.distToLineNew = function(p1, p2) {
        return p2l(this, p1, p2);
        // return Math.sqrt(this.distToLineSq(p1, p2));
    };

    /**
     * return square of distance to line connecting points p1, p2
     * distance is calculated on the perpendicular (normal) to line
     *
     * @param {Point} p1
     * @param {Point} p2
     * @returns {number}
     */
    PRO.distToLineSq = function(p1, p2) {
        let p = this,
            d = UTIL.distSq(p1, p2);

        let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / d;

        if (t < 0) return UTIL.distSq(p, p1);
        if (t > 1) return UTIL.distSq(p, p2);

        return UTIL.distSqv2(p.x, p.y, p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y));
    };

    // ---( begin fix distToLine )---

    function dot(u, v) {
        return u.x * v.x + u.y * v.y;
    }

    function norm(v) {
        return Math.sqrt(dot(v,v));
    }

    function d(u, v) {
        return norm({x: u.x - v.x, y: u.y - v.y});
    }

    function p2l(p, l1, l2) {
        let v = {x: l2.x - l1.x, y: l2.y - l1.y};
        let w = {x: p.x - l1.x, y: p.y - l1.y};
        let c1 = dot(w, v);
        let c2 = dot(v, v);
        let b = c1 / c2;
        if (isNaN(b)) {
            // console.log('nan', {p, l1, l2, v, w, c1, c2});
            b = 0;
        }
        let pb = {x: l1.x + b * v.x, y: l1.y + b * v.y};
        return d(p, pb);
    }

    // ---( end fix distToLine )---

    /**
     *
     * @param {Point} p1
     * @param {Point} p2
     * @param {number} dist2
     * @returns {boolean}
     */
    PRO.withinDist2 = function(p1, p2, dist2) {
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
    };

    /**
     * @param {Point} p2
     * @returns {Point}
     */
    PRO.midPointTo = function(p2) {
        return newPoint((this.x + p2.x)/2, (this.y + p2.y)/2, this.z);
    };

    /**
     * @param {Point} p2
     * @returns {Point}
     */
    PRO.midPointTo3D = function(p2) {
        return newPoint(
            (this.x + p2.x)/2,
            (this.y + p2.y)/2,
            (this.z + p2.z)/2
        );
    };

    /**
     * non-scale corrected version of follow()
     *
     * @param slope
     * @param mult
     * @returns {Point}
     */
    PRO.projectOnSlope = function(slope, mult) {
        return newPoint(
            this.x + slope.dx * mult,
            this.y + slope.dy * mult,
            this.z);
    };

    PRO.followTo = function(point, mult) {
        return this.follow(this.slopeTo(point), mult);
    };

    /**
     * return a point along the line this from point to p2 offset
     * by a distance.  positive distances are closer to this point.
     *
     * @param p2
     * @param dist
     */
    PRO.offsetPointFrom = function(p2, dist) {
        let p1 = this,
            dx = p2.x - p1.x,
            dy = p2.y - p1.y,
            ls = dist / Math.sqrt(dx * dx + dy * dy),
            ox = dx * ls,
            oy = dy * ls;
        return newPoint(p2.x - ox, p2.y - oy, p2.z, KEYS.NONE);
    };

    /**
     * return a point along the line this from point to p2 offset
     * by a distance.  positive distances are farther from this point.
     *
     * @param p2
     * @param dist
     */
    PRO.offsetPointTo = function(p2, dist) {
        let p1 = this,
            dx = p2.x - p1.x,
            dy = p2.y - p1.y;

        if (dx === 0 && dy === 0) return this;

        let ls = dist / Math.sqrt(dx * dx + dy * dy),
            ox = dx * ls,
            oy = dy * ls;

        return newPoint(p1.x + ox, p1.y + oy, p2.z, KEYS.NONE);
    };

    /**
     * @param {Point} p2
     * @param {number} offset
     * @returns {Line}
     */
    PRO.offsetLineTo = function(p2, offset) {
        let p1 = this,
            dx = p2.x - p1.x,
            dy = p2.y - p1.y,
            ls = offset / Math.sqrt(dx * dx + dy * dy),
            ox = dx * ls,
            oy = dy * ls,
            np1 = newPoint(p1.x - oy, p1.y + ox, p1.z, KEYS.NONE),
            np2 = newPoint(p2.x - oy, p2.y + ox, p2.z, KEYS.NONE);
        np1.op = p1;
        np2.op = p2;
        return BASE.newLine(np1, np2, KEYS.NONE);
    };

    PRO.offset = function(x, y, z) {
        return newPoint(this.x + x, this.y + y, this.z + z);
    };

    /**
     * checks if a point is inside of a polygon
     * does not check children/holes
     *
     * @param {Polygon} poly
     * @returns {boolean}
     */
    PRO.inPolygon = function(poly) {
        if (!poly.bounds.containsXY(this.x, this.y)) return false;

        let p = poly.points, pl = p.length, p1, p2, i, inside = false;

        for (i=0; i<pl; i++) {
            p1 = p[i];
            p2 = p[(i+1)%pl];
            if ((p1.y >= this.y) != (p2.y >= this.y) &&
                (this.x <= (p2.x - p1.x) * (this.y - p1.y) / (p2.y - p1.y) + p1.x))
            {
                inside = !inside;
            }
        }

        return inside;
    };

    /**
     * returns true if the point is inside of a polygon but
     * not inside any of it's children
     *
     * @param {Polygon | Polygon[]} poly
     * @return {boolean} true if inside outer but not inner
     */
    PRO.isInPolygon = function(poly) {
        let point = this, i;
        if (Array.isArray(poly)) {
            for (i=0; i<poly.length; i++) {
                if (point.isInPolygon(poly[i])) return true;
            }
            return false;
        }
        let holes = poly.inner;
        if (point.inPolygon(poly) || point.nearPolygon(poly, CONF.precision_merge_sq)) {
            for (i=0; holes && i < holes.length; i++) {
                if (point.inPolygon(holes[i]) && !point.nearPolygon(holes[i], CONF.precision_merge_sq)) return false;
            }
            return true;
        }
        return false;
    };

    /**
    * returns true if the point is inside of a polygon but
    * not inside any of it's children
     *
     * @param {Polygon | Polygon[]} poly
     * @return {boolean} true if inside outer but not inner
     */
    PRO.isInPolygonOnly = function(poly) {
        let point = this, i;
        if (Array.isArray(poly)) {
            for (i=0; i<poly.length; i++) {
                if (point.isInPolygonOnly(poly[i])) {
                    return true;
                }
            }
            return false;
        }
        let holes = poly.inner;
        if (point.inPolygon(poly)) {
            for (i=0; holes && i < holes.length; i++) {
                if (point.inPolygon(holes[i])) return false;
            }
            return true;
        }
        return false;
    };

    /**
     * checks if point is near polygon edge.  distance is squared.
     *
     * @param {Polygon} poly
     * @param {number} dist2
     * @param {boolean} [inner] process inner polygons
     * @returns {boolean}
     */
    PRO.nearPolygon = function(poly, dist2, inner) {
        // throw new Error("nearPolygon");
        for (let i=0, p=poly.points, pl=p.length ; i<pl; i++) {
            if (this.withinDist2(p[i], p[(i+1)%pl], dist2)) {
                return true;
            }
        }
        if (inner && poly.inner) {
            for (let i=0; i<poly.inner.length; i++) {
                if (this.nearPolygon(poly.inner[i], dist2)) return true;
            }
        }
        return false;
    };

    /**
     * returns true if point will not be trimmed later
     *
     * @param {Polygon} poly
     * @param {number} offset
     * @param {number} mindist2
     * @returns {boolean}
     */
    PRO.insideOffset = function(poly, offset, mindist2) {
        return this.inPolygon(poly) === (offset > 0) && !this.nearPolygon(poly, mindist2);
    };

    /**
     * returns a new point following given slope for given distance
     * same as projectOnSlope() but scaled
     *
     * @param {Slope} slope
     * @param {number} distance
     * @returns {Point}
     */
    PRO.follow = function(slope, distance) {
        let ls = distance / Math.sqrt(slope.dx * slope.dx + slope.dy * slope.dy);
        return newPoint(this.x + slope.dx * ls, this.y + slope.dy * ls, this.z);
    };

    /**
     * for point, return z-plane intersecting point on line to next point
     *
     * @param {Point} p
     * @param {number} z
     * @returns {Point}
     */
    PRO.intersectZ = function(p, z) {
        let dx = p.x - this.x,
            dy = p.y - this.y,
            dz = p.z - this.z,
            pct = 1 - ((p.z - z) / dz);
        return newPoint(this.x + dx * pct, this.y + dy * pct, this.z + dz * pct);
    };

    /**
     * @param {Point} p
     * @returns {boolean}
     */
    PRO.isEqual2D = function(p) {
        return this === p || (this.x === p.x && this.y === p.y);
    };

    /**
     * returns true if points are close enough to be considered equivalent
     *
     * @param {Point} p
     * @returns {boolean}
     */
    PRO.isMergable2D = function(p) {
        return this.isEqual2D(p) || (this.distToSq2D(p) < CONF.precision_merge_sq);
    };

    /**
     * compares 3D point
     *
     * @param {Point} p
     * @returns {boolean}
     */
    PRO.isEqual = function(p) {
        return this === p || (this.x === p.x && this.y === p.y && this.z === p.z);
    };

    PRO.isEqual2D = function(p) {
        return this === p || (this.x === p.x && this.y === p.y);
    };

    /**
     * returns true if points are close enough to be considered equivalent
     *
     * @param {Point} p
     * @returns {boolean}
     */
    PRO.isMergable3D = function(p) {
        return this.isEqual(p) || (this.distToSq3D(p) < CONF.precision_merge_sq);
    };

    /**
     * return true if point is inside 2D square size dist*2 around p
     *
     * @param {Point} p
     * @param {number} dist
     * @returns {boolean}
     */
    PRO.isInBox = function(p, dist) {
        return Math.abs(this.x - p.x) < dist && Math.abs(this.y - p.y) < dist;
    };

    /**
     * return min distance from point to a polygon
     * stops searching if any point is closer than threshold
     *
     * @param {Polygon} poly
     * @param {number} [threshold] stop looking if under threshold
     */
    PRO.distToPolySegments = function(poly, threshold) {
        let point = this,
            mindist = Infinity;
        poly.forEachSegment(function(p1, p2) {
            const nextdist = Math.min(mindist, point.distToLine(p1, p2));
            mindist = Math.min(nextdist, mindist);
            // returning true terminates forEachSegment()
            if (mindist <= threshold) return true;
        });
        return mindist;
    };

    /**
     * @param {Polygon} poly
     * @param {number} [threshold] stop looking if under threshold
     */
    PRO.distToPolyPoints = function(poly, threshold) {
        let point = this, mindist = Infinity;
        poly.forEachPoint(function(pp) {
            mindist = Math.min(mindist, point.distTo2D(pp));
            if (mindist < threshold) return true;
        });
        return mindist;
    };

    /**
     * @param {Point[]} points
     * @param {number} max
     * @returns {Point} nearest point (less than max) from array to this point
     */
    PRO.nearestTo = function(points, max) {
        if (!max) throw "missing max";
        let mind = Infinity,
            minp = null,
            i, p, d;
        for (i=0; i<points.length; i++) {
            p = points[i];
            if (p === this || p.del) continue;
            d = this.distToSq2D(p);
            if (d < max && d < mind) {
                mind = d;
                minp = p;
            }
        }
        return minp;
    };

    /**
     * @param {Point[]} points
     * @return {number} average square dist to cloud of points
     */
    PRO.averageDistTo = function(points) {
        let sum = 0.0, count = 0, i;
        for (i = 0; i < points.length; i++) {
            if (points[i] != this) {
                sum += this.distToSq2D(points[i]);
                count++;
            }
        }
        return sum / count;
    };

    /**
     * dist to point in 2D
     *
     * @param {Point} p
     * @returns {number}
     */
    PRO.distTo2D = function(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y;
        return Math.sqrt(dx * dx + dy * dy);
    };

    /**
     * square of distance in 2D
     *
     * @param {Point} p
     * @returns {number}
     */
    PRO.distToSq2D = function(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y;
        return dx * dx + dy * dy;
    };

    PRO.distTo3D = function(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y,
            dz = this.z - p.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    /**
     * square of distance in 3D
     *
     * @param {Point} p
     * @returns {number}
     */
    PRO.distToSq3D = function(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y,
            dz = this.z - p.z;
        return dx * dx + dy * dy + dz * dz;
    };

    /**
     * returns true if point is inside triangle described by three points
     *
     * @param {Point} a
     * @param {Point} b
     * @param {Point} c
     * @returns {boolean}
     */
    PRO.inTriangle = function(a, b, c) {
        let as_x = this.x - a.x,
            as_y = this.y - a.y,
            s_ab = (b.x - a.x) * as_y - (b.y - a.y) * as_x > 0;
        if ((c.x - a.x) * as_y - (c.y - a.y) * as_x > 0 == s_ab) return false;
        if ((c.x - b.x) * (this.y - b.y) - (c.y - b.y) * (this.x - b.x) > 0 != s_ab) return false;
        return true;
    };

    /**
     * returns true if point is on a line described by two points.
     * test sum of distances p1->this + this->p2 ~= p1->p2 whens
     * slopes from p1->this same as this->p2
     *
     * @param {Point} p1
     * @param {Point} p2
     * @returns {boolean}
     */
    PRO.onLine = function(p1, p2) {
        return this.distToLine(p1, p2) < CONF.precision_point_on_line;
    };

    /**
     *
     * @param {THREE.Vector3} delta
     * @return {Point} new offset point
     */
    PRO.add = function(delta) {
        return newPoint(this.x + delta.x, this.y + delta.y, this.z + delta.z);
    };

    /**
     *
     * @param {THREE.Vector3} delta
     * @return {Point} new offset point
     */
    PRO.sub = function(delta) {
        return newPoint(this.x - delta.x, this.y - delta.y, this.z - delta.z);
    };

    /**
     *
     * @param {THREE.Vector3} delta
     */
    PRO.move = function(delta) {
        this.x += delta.x;
        this.y += delta.y;
        this.z += delta.z;
        return this;
    };

    /** ******************************************************************
     * Connect to base and Helpers
     ******************************************************************* */

    /**
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {String} [key]
     * @returns {Point}
     */
    function newPoint(x, y, z, key) {
        return new Point(x, y, z, key);
    }

})();
