/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_base_polygon = exports;

(function() {

    if (!self.base) self.base = {};
    if (self.base.Polygon) return;

    var BASE = self.base,
        CONF = BASE.config,
        UTIL = BASE.util,
        DBUG = BASE.debug,
        KEYS = BASE.key,
        SQRT = Math.sqrt,
        POLY = function() { return BASE.polygons },
        ABS = Math.abs,
        MIN = Math.min,
        MAX = Math.max,
        PI = Math.PI,
        DEG2RAD = PI / 180,
        Bounds = BASE.Bounds,
        newPoint = BASE.newPoint,
        PRO = Polygon.prototype,
        nest_test_slope = BASE.newSlope(newPoint(0,0,0,KEYS.NONE), newPoint(1,0,0,KEYS.NONE)),
        min_area_mult = 2.0,
        seqid = 1;

    BASE.Polygon = Polygon;
    BASE.newPolygon = newPolygon;

    /** ******************************************************************
     * Constructors
     ******************************************************************* */

    /**
     * @param {Points[]} [points] to seed poly
     * @constructor
     */
    function Polygon(points) {
        this.id = seqid++; // polygon unique id
        this.open = false;
        this.length = 0; // number of points
        this.points = []; // ordered array of points
        this.area2 = 0.0; // computed as 2x area (sign = direction)
        this.bounds = new Bounds();
        this.inner = null; // array of enclosed polygons (if any)
        this.parent = null; // enclosing parent polygon
        this.depth = 0; // depth nested from top parent (density for support fill)
        this.delete = false; // for culling during tracing
        this.fillang = null; // hinted fill angle
        this.fills = null; // fill lines (only used by supports currently)
        if (points) this.addPoints(points);
    }

    /** ******************************************************************
     * Polygon Filter/Chain Functions
     ******************************************************************* */

    Polygon.filterTooSmall = function(p) {
        return p.length < 3 ? null : p;
    };

    Polygon.filterTooSkinny = function(p) {
        return (p.circularityDeep() * p.areaDeep()) < 0.25 ? null : p;
    };

    Polygon.filterArea = function(area) {
        return function(p) {
            return p.area() >= area ? p : null;
        };
    };

    Polygon.filterDeleted = function(p) {
        return p.delete ? null : p;
    };

    Polygon.filterInside = function(pin) {
        return function(p) {
            return pin.contains(p);
        }
    };

    Polygon.filterCollect = function(out) {
        return function(p) {
            out.push(p);
            return p;
        }
    };

    Polygon.filterEvolve = function(p) {
        return p.evolve();
    };

    Polygon.filterChain = function(filters) {
        return function() {
            var f = filters;
            return function(p) {
                var len = f.length,
                    idx = 0;
                while (idx < len && (p = f[idx++](p)))
                    ;
                return p;
            }
        }();
    };

    /** ******************************************************************
     * Polygon Prototype Functions
     ******************************************************************* */

    PRO.createConvexHull = function(points) {
        function removeMiddle(a, b, c) {
            var cross = (a.x - b.x) * (c.y - b.y) - (a.y - b.y) * (c.x - b.x);
            var dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
            return cross < 0 || cross == 0 && dot <= 0;
        }

        points.sort(function (a, b) {
            return a.x != b.x ? a.x - b.x : a.y - b.y;
        });

        var n = points.length;
        var hull = [];

        for (var i = 0; i < 2 * n; i++) {
            var j = i < n ? i : 2 * n - 1 - i;
            while (hull.length >= 2 && removeMiddle(hull[hull.length - 2], hull[hull.length - 1], points[j]))
                hull.pop();
            hull.push(points[j]);
        }

        hull.pop();

        this.addPoints(hull);
        return this;
    };

    PRO.stepsFromRoot = function() {
        var p = this.parent, steps = 0;
        while (p) {
            if (p.inner && p.inner.length > 1) steps++;
            p = p.parent;
        }
        return steps;
    };

    PRO.first = function() {
        return this.points[0];
    };

    PRO.last = function() {
        return this.points[this.length-1];
    };

    PRO.swap = function(x,y) {
        var poly = this,
            points = poly.points,
            length = points.length;
        poly.bounds = new Bounds();
        for (var i=0; i<length; i++) {
            p = points[i];
            if (x) p.swapXZ();
            else if (y) p.swapYZ();
            poly.bounds.update(p);
        }
        if (poly.inner) poly.inner.forEach(function(i) {
            i.swap(x,y);
        });
        return this;
    }

    /**
     * @param {boolean} [point] return just the center point
     * @returns {Polygon|Point} a new polygon centered on x=0, y=0, z=0
     */
    PRO.center = function(point) {
        var ap = newPoint(0,0,0,null), np = newPolygon(), pa = this.points;
        pa.forEach(function(p) {
            ap.x += p.x;
            ap.y += p.y;
            ap.z += p.z;
        });
        ap.x /= pa.length;
        ap.y /= pa.length;
        ap.z /= pa.length;
        if (point) return ap;
        pa.forEach(function(p) {
            np.push(newPoint(
                p.x - ap.x,
                p.y - ap.y,
                p.z - ap.z
            ));
        });
        return np;
    };

    /**
     * @returns {Point} center of a polygon assuming it's a circle
     */
    PRO.circleCenter = function() {
        var points = this.points,
            length = points.length,
            incr = Math.floor(length / 3),
            A = points[0],
            B = points[incr],
            C = points[incr * 2],
            yDelta_a = B.y - A.y,
            xDelta_a = B.x - A.x,
            yDelta_b = C.y - B.y,
            xDelta_b = C.x - B.x,
            aSlope = yDelta_a / xDelta_a,
            bSlope = yDelta_b / xDelta_b,
            center = newPoint(0, 0, 0, null);

        center.x = (aSlope * bSlope * (A.y - C.y) + bSlope * (A.x + B.x) - aSlope * (B.x+C.x) )/(2* (bSlope-aSlope) );
        center.y = -1 * (center.x - (A.x+B.x) / 2) / aSlope +  (A.y + B.y) / 2;
        center.z = A.z;

        return center;
    };

    /**
     * add points forming a rectangle around a center point
     *
     * @param {Point} center
     * @param {number} width
     * @param {number} height
     */
    PRO.centerRectangle = function(center, width, height) {
        width /= 2;
        height /= 2;
        this.push(newPoint(center.x - width, center.y - height, center.z));
        this.push(newPoint(center.x + width, center.y - height, center.z));
        this.push(newPoint(center.x + width, center.y + height, center.z));
        this.push(newPoint(center.x - width, center.y + height, center.z));
        return this;
    };

    /**
     * add points forming a circle around a center point
     *
     * @param {Point} center
     * @param {number} radius
     * @param {number} points
     * @param {boolean} clockwise
     */
    PRO.centerCircle = function(center, radius, points, clockwise) {
        var angle = 0, add = 360 / points;
        if (clockwise) add = -add;
        while (points-- > 0) {
            this.push(newPoint(
                UTIL.round(Math.cos(angle * DEG2RAD) * radius, 7) + center.x,
                UTIL.round(Math.sin(angle * DEG2RAD) * radius, 7) + center.y,
                center.z
            ));
            angle += add;
        }
        return this;
    };

    /**
     * offset all points
     * @param {THREE.Vector3} offset
     * @returns {Polygon}
     */
    PRO.move = function(offset) {
        var scope = this,
            bounds = scope.bounds = new Bounds();
        scope.points.forEach(function(p) {
            p.move(offset);
            bounds.update(p);
        });
        if (scope.inner) scope.inner.forEach(function(p) { p.move(offset) });
        return scope;
    };

    PRO.scale = function(scale, round) {
        var scope = this,
            bounds = scope.bounds = new Bounds();
        scope.points.forEach(function(p) {
            p.x *= scale;
            p.y *= scale;
            p.z *= scale;
            if (round) {
                p.x = UTIL.round(p.x, round);
                p.y = UTIL.round(p.y, round);
                p.z = UTIL.round(p.z, round);
            }
            bounds.update(p);
        });
        if (scope.inner) scope.inner.forEach(function(i) { i.scale(scale,round) });
    };

    /**
     * hint fill angle hinting from longest segment
     */
    PRO.hintFillAngle = function() {
        var index = 0,
            points = this.points,
            length = points.length,
            prev,
            next,
            dist2,
            longest,
            mincir = CONF.hint_min_circ,
            minlen = CONF.hint_len_min,
            maxlen = CONF.hint_len_max || Infinity;

        while (index < length) {
            prev = points[index];
            next = points[++index % length];
            dist2 = prev.distToSq2D(next);
            if (dist2 >= minlen && dist2 <= maxlen && (!longest || dist2 > longest.len)) {
                longest = {p1:prev, p2:next, len:dist2};
            }
        }

        if (longest && this.circularity() >= mincir) {
            this.fillang = longest.p1.slopeTo(longest.p2).normal();
        }

        return this.fillang;
    };

    /**
     * todo make more efficient
     *
     * @param {Boolean} deep
     * @returns {Polygon}
     */
    PRO.clone = function(deep) {
        var np = newPolygon(),
            ln = this.length,
            i = 0;

        while (i < ln) np.push(this.points[i++]);

        np.fillang = this.fillang;
        np.depth = this.depth;
        np.open = this.open;

        if (deep && this.inner) {
            np.inner = this.inner.clone();
        }

        return np;
    };

    /**
     * set all points' z value
     *
     * @param {number} z
     * @returns {Polygon} this
     */
    PRO.setZ = function(z) {
        var ar = this.points,
            ln = ar.length,
            i = 0;
        while (i < ln) ar[i++].z = z;
        if (this.inner) this.inner.forEach(function(c) {c.setZ(z)});
        return this;
    };

    /**
     * @returns {number} z value of first point
     */
    PRO.getZ = function() {
        return this.points[0].z;
    };

    /**
     *
     * @param {Layer} layer
     * @param {number} color
     * @param {boolean} [recursive]
     * @param {boolean} [open]
     */
    PRO.render = function(layer, color, recursive, open) {
        layer.poly(this, color, recursive, open);
    };

    /**
     * add new point and return polygon reference for chaining
     *
     * @param {number} x
     * @param {number} y
     * @param {number} [z]
     * @returns {Polygon}
     */
    PRO.add = function(x,y,z) {
        this.push(newPoint(x,y,z));
        return this;
    };

    /**
     * append array of points to polygon and return polygon
     *
     * @param {Point[]} points
     * @returns {Polygon}
     */
    PRO.addPoints = function(points) {
        var poly = this,
            length = points.length,
            i = 0;
        while (i < length) {
            poly.push(points[i++]);
        }
        return this;
    };

    /**
     * append point to polygon and return point
     *
     * @param {Point} p
     * @returns {Point}
     */
    PRO.push = function(p) {
        // clone any point belonging to another polygon
        if (p.poly) p = p.clone();
        p.poly = this;
        this.length++;
        this.points.push(p);
        this.bounds.update(p);
        return p;
    };

    /**
     * append point to polygon and return polygon
     *
     * @param {Point} p
     * @returns {Polygon}
     */
    PRO.append = function(p) {
        this.push(p);
        return this;
    };

    /** close polygon */
    PRO.setClosed = function() {
        this.open = false;
        return this;
    };

    /** open polygon */
    PRO.setOpen = function() {
        this.open = true;
        return this;
    };

    PRO.isOpen = function() {
        return this.open;
    };

    PRO.isClosed = function() {
        return !this.open;
    };

    PRO.setClockwise = function() {
        if (!this.isClockwise()) this.reverse();
        return this;
    };

    PRO.setCounterClockwise = function() {
        if (this.isClockwise()) this.reverse();
        return this;
    };

    PRO.isClockwise = function() {
        return this.area(true) > 0;
    };

    PRO.showKey = function() {
        return [this.first().key,this.last().key,this.length].join('~~');
    };

    /**
     * set this polygon's winding in alignment with the supplied polygon
     *
     * @param {Polygon} poly
     * @param [boolean] toLongest
     * @returns {Polygon} self
     */
    PRO.alignWinding = function(poly, toLongest) {
        if (toLongest && this.length > poly.length) {
            poly.alignWinding(this, false);
        } else if (this.isClockwise() !== poly.isClockwise()) {
            this.reverse();
        }
    };

    /**
     * set this polygon's winding in opposition to supplied polygon
     *
     * @param {Polygon} poly
     * @param [boolean] toLongest
     * @returns {Polygon} self
     */
    PRO.opposeWinding = function(poly, toLongest) {
        if (toLongest && this.length > poly.length) {
            poly.opposeWinding(this, false);
        } else if (this.isClockwise() === poly.isClockwise()) {
            this.reverse();
        }
    };

    /**
     * reverse direction of polygon points.
     * @returns {Polygon} self
     */
    PRO.reverse = function() {
        this.area2 = -this.area2;
        this.points = this.points.reverse();
        return this;
    };

    /**
     * return true if this polygon is (likely) nested inside parent
     *
     * @param {Polygon} parent
     * @returns {boolean}
     */
    PRO.isNested = function(parent) {
        if (parent.bounds.contains(this.bounds)) {
            //var int = POLY().rayIntersect(this.bounds.leftMost, nest_test_slope, [parent], false);
            //return int.length % 2 === 1 || this.isInside(parent, CONF.precision_nested_sq);
            return this.isInside(parent, CONF.precision_nested_sq);
        }
        return false;
    };

    PRO.forEachPointEaseDown = function(fn, fromPoint) {
        var index = this.findClosestPointTo(fromPoint).index,
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

        while (true) {
            next = points[index % length];
            if (last && next.z < fromZ) {
                var deltaZ = fromZ - next.z;
                dist2next = last.distTo2D(next);
                if (dist2next > deltaZ * 2) {
                    // too long: synth intermediate
                    fn(last.followTo(next, deltaZ).setZ(next.z), offset++);
                } else if (dist2next >= deltaZ) {
                    // ease down on this segment
                } else {
                    // too short: clone n move z
                    next = next.clone().setZ(fromZ - dist2next/2);
                }
                fromZ = next.z;
            } else if (offset === 0 && next.z < fromZ) {
                next = next.clone().setZ(fromZ);
            }
            last = next;
            fn(next, offset++);
            if ((index % length) === touch) break;
            if (touch < 0 && next.z <= targetZ) touch = (index % length);
            index++;
        }

        return last;
    };

    PRO.forEachPoint = function(fn, close, start) {
        var index = start || 0,
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
    };

    PRO.forEachSegment = function(fn, open, start) {
        var index = start || 0,
            points = this.points,
            length = points.length,
            count = open ? length - 1 : length,
            pos1, pos2;

        while (count-- > 0) {
            pos1 = index % length;
            pos2 = (index+1) % length;
            if (fn(points[pos1], points[pos2], pos1, pos2)) return;
            index++;
        }
    };

    /**
     * returns intersections sorted by closest to lp1
     */
    PRO.intersections = function(lp1, lp2) {
        var list = [];
        this.forEachSegment(function(pp1, pp2, ip1, ip2) {
            var int = UTIL.intersect(lp1, lp2, pp1, pp2, BASE.key.SEGINT, false);
            if (int) {
                list.push(int);
                pp1.pos = ip1;
                pp2.pos = ip2;
            }
        });
        list.sort(function(p1, p2) {
            return UTIL.distSq(lp1, p1) - UTIL.distSq(lp1, p2);
        });
        return list;
    };

    /**
     * using two points, split polygon into two open polygons
     * or return null if p1,p2 does not intersect or poly is open
     */
    PRO.bisect = function(p1, p2) {
        if (this.isOpen()) return null;

        var copy = this.clone().setClockwise();

        var int = copy.intersections(p1, p2);
        if (!int || int.length !== 2) return  null;

        return [ copy.emitSegment(int[0], int[1]), copy.emitSegment(int[1], int[0]).reverse() ];
    };

    /**
     * emit new open poly between two intersection points of a clockwise poly.
     * used in cam tabs and fdm output perimeter traces on infill
     */
    PRO.emitSegment = function(i1, i2) {
        var poly = newPolygon(),
            start = i1.p2.pos,
            end = i2.p1.pos;
        poly.setOpen();
        poly.push(i1);
        this.forEachPoint(function(p, pos) {
            poly.push(p);
            if (p === i2.p1) return true;
        }, true, start);
        poly.push(i2);
        return poly;
    };

    /**
     * @param {Polygon} poly
     * @param {number} [tolerance]
     * @returns {boolean} any points inside OR on edge
     */
    PRO.hasPointsInside = function(poly, tolerance) {
        if (!poly.overlaps(this)) return false;

        var mid, exit = false;

        this.forEachSegment(function(prev, next) {
            // check midpoint on long lines
            if (prev.distTo2D(next) > CONF.precision_midpoint_check_dist) {
                mid = prev.midPointTo(next);
                if (mid.inPolygon(poly) || mid.nearPolygon(poly, tolerance || CONF.precision_close_to_poly_sq)) {
                    return exit = true;
                }
            }
            if (next.inPolygon(poly) || next.nearPolygon(poly, tolerance || CONF.precision_close_to_poly_sq)) {
                return exit = true;
            }
        });

        return exit;
    };

    /**
     * TODO replace isNested() with isInside() ?
     *
     * @param {Polygon} poly
     * @param {number} [tolerance]
     * @returns {boolean} all points inside OR on edge
     */
    PRO.isInside = function(poly, tolerance) {
        // throw new Error("isInside");
        if (!(
            // poly.overlaps(this) &&
            this.bounds.isNested(poly.bounds)
        )) return false;

        var mid,
            midcheck,
            exit = true;

        this.forEachSegment(function(prev, next) {
            // check midpoint on long lines
            if (prev.distTo2D(next) > CONF.precision_midpoint_check_dist) {
                mid = prev.midPointTo(next);
                if (!(mid.inPolygon(poly) || mid.nearPolygon(poly, tolerance || CONF.precision_close_to_poly_sq))) {
                    exit = false;
                    return true;
                }
            }
            if (!(next.inPolygon(poly) || next.nearPolygon(poly, tolerance || CONF.precision_close_to_poly_sq))) {
                exit = false;
                return true;
            }
        });

        return exit;
    };

    /**
     * @param {Polygon} poly
     * @param {number} [tolerance]
     * @returns {boolean} all points inside poly AND not inside children
     */
    PRO.contains = function(poly, tolerance) {
        return (poly && poly.isInside(this, tolerance) && poly.isOutsideAll(this.inner, tolerance));
    };

    /**
     *
     * @param polys
     * @returns {boolean}
     */
    PRO.containedBySet = function(polys) {
        if (!polys) return false;
        for (var i=0; i<polys.length; i++) {
            if (polys[i].contains(this)) return true;
        }
        return false;
    };

    /**
     * @param {Polygon} child
     * @returns {Polygon} self
     */
    PRO.addInner = function(child) {
        child.parent = this;
        if (this.inner) {
            this.inner.push(child);
        } else {
            this.inner = [child];
        }
        return this;
    };

    /**
     * @returns {number} number of inner polygons
     */
    PRO.innerCount = function() {
        return this.inner ? this.inner.length : 0;
    };

    /**
     * @returns {boolean} if has 1 or more inner polygons
     */
    PRO.hasInner = function() {
        return this.inner && this.inner.length > 0;
    };

    /**
     * remove all inner polygons
     * @returns {Polygon} self
     */
    PRO.clearInner = function() {
        this.inner = null;
        return this;
    };

    PRO.newUndeleted = function() {
        var poly = newPolygon();
        this.forEachPoint(function(p) {
            if (!p.del) poly.push(p);
        });
        return poly;
    };

    /**
     * http://www.ehow.com/how_5138742_calculate-circularity.html
     * @returns {number} 0.0 - 1.0 from flat to perfectly circular
     */
    PRO.circularity = function() {
        return (4 * PI * this.area()) / UTIL.sqr(this.perimeter());
    };

    PRO.circularityDeep = function() {
        return (4 * PI * this.areaDeep()) / UTIL.sqr(this.perimeter());
    };

    /**
     * @returns {number} perimeter length (sum of all segment lengths)
     */
    PRO.perimeter = function() {
        var len = 0.0;

        this.forEachSegment(function(prev,next) {
            len += SQRT(prev.distToSq2D(next));
        }, this.open);

        return len;
    };

    PRO.perimeterDeep = function() {
        var len = this.perimeter();
        if (this.inner) this.inner.forEach(function(p) { len += p.perimeter() });
        return len;
    };

    /**
     * calculate and return the area enclosed by the polygon.
     * if raw is true, return a signed area equal to 2x the
     * enclosed area which also indicates winding direction.
     *
     * @param {boolean} [raw]
     * @returns {number} area
     */
    PRO.area = function(raw) {
        if (this.length < 3) return 0;
        if (this.area2 === 0.0) {
            for (var p=this.points,pl=p.length,pi=0,p1,p2; pi<pl; pi++) {
                p1 = p[pi];
                p2 = p[(pi+1)%pl];
                this.area2 += (p2.x - p1.x) * (p2.y + p1.y);
            }
        }
        return raw ? this.area2 : ABS(this.area2/2);
    };

    /**
     * return the area of a polygon with the area of all
     * inner polygons subtracted
     *
     * @returns {number} area
     */
    PRO.areaDeep = function() {
        if (!this.inner) return this.area();
        var i, c = this.inner, a = this.area();
        for (i=0; i<c.length; i++) {
            a -= c[i].area();
        }
        return a;
    };

    /**
     * @param {Polygon} poly
     * @returns {boolean}
     */
    PRO.overlaps = function(poly) {
        return this.bounds.overlaps(poly.bounds, CONF.precision_merge);
    };

    /**
     * create poly from coordinate Array (aka dump)
     *
     * @param {number[]} arr
     * @param {number} [z]
     */
    PRO.fromXYArray = function(arr,z) {
        var i = 0;
        while (i < arr.length) {
            this.add(arr[i++], arr[i++], z || 0);
        }
        return this;
    };

    function fromClipperPath(path,z) {
        var poly = newPolygon(), i = 0, l = path.length;
        while (i < l) poly.push(newPoint(null,null,z,null,path[i++]));
        return poly;
    };

    /**
     * simplify and merge collinear. only works for single
     * non-nested polygons.  used primarily in slicer/connectLines.
     */
    PRO.clean = function() {
        var clib = self.ClipperLib,
            clip = clib.Clipper,
            clean = clip.CleanPolygon(this.toClipper()[0], CONF.clipperClean),
            poly = fromClipperPath(clean, this.getZ());
        return poly;
    };

    PRO.toClipper = function(inout,debug) {
        var poly = this,
            cur = [],
            out = inout || [];
        if (debug) {
            var d = [],
                points = poly.points,
                len = points.length,
                i = 0,
                p;
            while (i < len) {
                p = points[i++];
                d.push({X:p.x, Y:p.y});
            }
            // poly.points.forEach(function(p) { d.push({X:p.x, Y:p.y}) });
            out.push(d);
        } else {
            out.push(poly.points);
        }
        if (poly.inner) {
            poly.inner.forEach(function(p) {
                p.toClipper(out, debug);
            });
        }
        return out;
    };

    /**
     * todo for debugging
     */
    PRO.dump = function(msg,prec) {
        var scope = this,
            txt = [JSON.stringify({
                len:scope.length,
                area:scope.areaDeep(),
                perim:scope.perimeterDeep(),
                circ:scope.circularityDeep(),
                inner:(scope.inner ? scope.inner.length : 0),
                cw:scope.isClockwise(),
                open:scope.isOpen(),
                id:scope.id
            })],
            out = [], i = 0, p;
        while (i<scope.points.length) {
            p = scope.points[i++];
            out.appendAll([UTIL.round(p.x,prec||5), UTIL.round(p.y,prec||5)]);
        }
        txt.push('['+out.join(',')+']');
        DBUG.log((msg ? msg : '')+txt.join('\n'));
        if (scope.inner) {
            scope.inner.forEach(function(p) { p.dump("-- ",prec) });
        }
    };

    /**
     * return offset polygon(s) from original using distance.  may result in
     * more than one new polygon if trace is self-intersecting or null if new
     * polygon is too small or offset is otherwise not possible due to geometry.
     *
     * @param {number} offset positive = inset, negative = outset
     * @param {Polygon[]} [output]
     * @returns {?Polygon[]} returns output array provided as input or new array if not provided
     */
    PRO.offset = function(offset, output) {
        return POLY().expand([this], -offset, this.getZ(), output);
    };

    /**
     * todo need something more clever for polygons that overlap with
     * todo differing resolutions (like circles)
     *
     * @param {Polygon} poly
     * @param {boolean} [recurse]
     * @param {number} [precision]
     * @returns {boolean} true if polygons are, essentially, the same
     */
    PRO.isEquivalent = function(poly, recurse, precision) {
        // throw new Error("isEquivalent");
        if (UTIL.isCloseTo(this.area(), poly.area(), precision || CONF.precision_poly_area) &&
            this.bounds.equals(poly.bounds, precision || CONF.precision_poly_bounds))
        {
            // use circularity near 1 to eliminate the extensive check below
            var c1 = this.circularity(),
                c2 = poly.circularity();
            if (ABS(c1-c2) < CONF.precision_circularity && ((1-c1) < CONF.precision_circularity)) {
                return true;
            }

            if (recurse) {
                var i, ai = this.inner, bi = poly.inner;
                if (ai !== bi) {
                    if (ai === null || bi === null || ai.length != bi.length) return false;
                    for (i=0; i < ai.length; i++) {
                        if (!ai[i].isEquivalent(bi[i])) return false;
                    }
                }
            }

            var exit = true,
                pointok,
                dist,
                min;

            this.forEachPoint(function(i2p) {
                pointok = false;
                poly.forEachSegment(function(i1p1, i1p2) {
                    // if point is close to poly, terminate search, go to next point
                    if ((dist = i2p.distToLine(i1p1, i1p2)) < CONF.precision_poly_merge) return pointok = true;
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
    };

    /**
     * find the point of this polygon closest to
     * the provided point. assist generating optimal
     * print paths.
     *
     * @param {Point} target
     * @return {Object} {point:point, distance:distance}
     */
    PRO.findClosestPointTo = function(target) {
        var dist,
            index,
            closest,
            mindist = Infinity;

        this.forEachPoint(function(point, pos) {
            dist = SQRT(point.distToSq2D(target));
            if (dist < mindist) {
                index = pos;
                mindist = dist;
                closest = point;
            }
        });

        return {point:closest, distance:mindist, index:index};
    };

    /**
     * @param {Polygon[]} out
     * @returns {Polygon[]}
     */
    PRO.flattenTo = function(out) {
        out.push(this);
        if (this.inner) out.appendAll(this.inner);
        return out;
    };

    PRO.shortestSegmentLength = function() {
        var len = Infinity;
        this.forEachSegment(function(p1, p2) {
            len = Math.min(len, p1.distTo2D(p2));
        });
        return len;
    };

    /**
     * @param {Polygon} poly clipping mask
     * @returns {?Polygon[]}
     */
    PRO.diff = function(poly) {
        var fillang = this.fillang && this.area() > poly.area() ? this.fillang : poly.fillang,
            clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper();

        clip.AddPaths(sp1, ptyp.ptSubject, true);
        clip.AddPaths(sp2, ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctDifference, ctre, cfil.pftEvenOdd, cfil.pftEvenOdd)) {
            poly = POLY().fromClipperTree(ctre, poly.getZ());
            poly.forEach(function(p) {
                p.fillang = fillang;
            })
            return poly;
        } else {
            return null;
        }
    };

    /**
     * @param {Polygon} poly clipping mask
     * @returns {?Polygon[]}
     */
    PRO.mask = function(poly) {
        var fillang = this.fillang && this.area() > poly.area() ? this.fillang : poly.fillang,
            clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper();

        clip.AddPaths(sp1, ptyp.ptSubject, true);
        clip.AddPaths(sp2, ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctIntersection, ctre, cfil.pftEvenOdd, cfil.pftEvenOdd)) {
            poly = POLY().fromClipperTree(ctre, poly.getZ());
            poly.forEach(function(p) {
                p.fillang = fillang;
            })
            return poly;
        } else {
            return null;
        }
    };

    /**
     * return logical OR of two polygons' enclosed areas
     *
     * @param {Polygon} poly
     * @returns {?Polygon} intersected polygon or null if no intersection
     */
    PRO.union = function(poly) {
        if (!this.overlaps(poly)) return null;

        var fillang = this.fillang && this.area() > poly.area() ? this.fillang : poly.fillang,
            clib = self.ClipperLib,
            ctyp = clib.ClipType,
            ptyp = clib.PolyType,
            cfil = clib.PolyFillType,
            clip = new clib.Clipper(),
            ctre = new clib.PolyTree(),
            sp1 = this.toClipper(),
            sp2 = poly.toClipper();

        clip.AddPaths(sp1, ptyp.ptSubject, true);
        clip.AddPaths(sp2, ptyp.ptClip, true);

        if (clip.Execute(ctyp.ctUnion, ctre, cfil.pftEvenOdd, cfil.pftEvenOdd)) {
            poly = POLY().fromClipperTree(ctre, poly.getZ());
            if (poly.length === 1) {
                poly = poly[0];
                poly.fillang = fillang;
                return poly;
            }
        }

        return null;
     };

    /**
     * rotate such that first and last points are the points
     * furthest apart and lowest when there is a tie breaker
     */
    PRO.spread = function() {
        var poly = this,
            points = poly.points,
            plen = points.length,
            i, pp, np, p, mdelta, newmax, max, shift, maxd;

        max = {d:0};
        maxd = 0;
        // find two most distance points
        for (i=0; i<plen; i++) {
            pp = points[i % plen];
            np = points[(i+1) % plen];
            p = ABS(pp.x - np.x) + ABS(pp.y - np.y);
            mdelta = ABS(p - max.d);
            newmax = p > maxd;
            maxd = MAX(maxd,p);
            // select lowest points (corner case = square)
            if (newmax || (mdelta < 0.001 && max.p1 && MIN(pp.z,np.z) < MIN(max.p1.z, max.p2.z))) {
                max = {p1:pp, p2:np, i:(i+1)%plen, d:p};
            }
        }

        if (max.i > 0) {
            // shift array to start at "leftmost" Point
            shift = points.slice(max.i);
            shift.appendAll(points.slice(0,max.i));
            return newPolygon(shift);
        }

        return poly;
    }

    /** ******************************************************************
     * Connect to base and Helpers
     ******************************************************************* */

    function newPolygon(points) {
        return new Polygon(points);
    }

})();
