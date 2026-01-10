/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { util, config, key } from './base.js';
import { newLine } from './line.js';
import { newSlope } from './slope.js';

const { Vector3 } = THREE;

/**
 * Represents a 3D point with x, y, z coordinates
 * Also supports optional 'a' property for rotary axis operations
 * @class
 */
class Point {
    /**
     * Create a new point
     * @param {number} [x=0] - X coordinate
     * @param {number} [y=0] - Y coordinate
     * @param {number} [z=0] - Z coordinate
     * @param {string} [key] - Optional cached key for comparison
     */
    constructor(x = 0, y = 0, z = 0, key) {
        this.x = x;
        this.y = y;
        this.z = z;
        if (key) {
            this._key = key;
        }
    }

    /**
     * Get unique string key for this point based on coordinates
     * Cached for performance in point comparison and hashing
     * @returns {string} Unique identifier string
     */
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

    /**
     * Convert point to Clipper library format (scaled integers)
     * @returns {{X: number, Y: number}} Clipper point object
     */
    toClipper() {
        return {
            X: (this.x * config.clipper) | 0,
            Y: (this.y * config.clipper) | 0
        };
    }

    /**
     * Convert point to array format
     * @returns {number[]} [x, y, z] array
     */
    toArray() {
        return [ this.x, this.y, this.z ];
    }

    /**
     * Convert to Three.js Vector3 object
     * @returns {THREE.Vector3} Three.js vector
     */
    toVector3() {
        return new Vector3(this.x, this.y, this.z);
    }

    /**
     * Set all coordinates and invalidate cached key
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} z - Z coordinate
     * @returns {Point} This point (for chaining)
     */
    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        delete this._key;
        return this;
    }

    /**
     * Set X coordinate
     * @param {number} x - X coordinate
     * @returns {Point} This point (for chaining)
     */
    setX(x) {
        this.x = x;
        return this;
    }

    /**
     * Set Y coordinate
     * @param {number} y - Y coordinate
     * @returns {Point} This point (for chaining)
     */
    setY(y) {
        this.y = y;
        return this;
    }

    /**
     * Set Z coordinate
     * @param {number} z - Z coordinate
     * @returns {Point} This point (for chaining)
     */
    setZ(z) {
        this.z = z;
        return this;
    }

    /**
     * Set A (rotary axis) coordinate for 4-axis machining
     * @param {number} a - A axis angle in degrees
     * @returns {Point} This point (for chaining)
     */
    setA(a) {
        this.a = a;
        return this;
    }

    /**
     * Swap X and Y coordinates in place
     * @returns {Point} This point (for chaining)
     */
    swapXY() {
        let p = this,
            t = p.x;
        p.x = p.y;
        p.y = t;
        return this;
    }

    /**
     * Swap X and Z coordinates in place
     * @returns {Point} This point (for chaining)
     */
    swapXZ() {
        let p = this,
            t = p.x;
        p.x = p.z;
        p.z = t;
        return this;
    }

    /**
     * Swap Y and Z coordinates in place
     * @returns {Point} This point (for chaining)
     */
    swapYZ() {
        let p = this,
            t = p.y;
        p.y = p.z;
        p.z = t;
        return this;
    }

    /**
     * Scale coordinates by specified factors
     * @param {number} [x=1] - X scale factor
     * @param {number} [y=1] - Y scale factor
     * @param {number} [z=1] - Z scale factor
     * @returns {Point} This point (for chaining)
     */
    scale(x = 1, y = 1, z = 1) {
        this.x *= x;
        this.y *= y;
        this.z *= z;
        return this;
    }

    /**
     * Create new point with rounded coordinates
     * @param {number} [precision] - Number of decimal places
     * @returns {Point} New rounded point
     */
    round(precision) {
        return newPoint(
            this.x.round(precision),
            this.y.round(precision),
            this.z.round(precision));
    }

    /**
     * Associate a facet (triangle) with this point for mesh operations
     * @param {Object} facet - Triangle/facet object
     * @returns {Point} This point (for chaining)
     */
    addFacet(facet) {
        if (!this.group) this.group = [];
        this.group.push(facet);
        return this;
    }

    /**
     * Invalidate cached key, forcing recalculation on next access
     * Call after modifying x, y, or z coordinates
     */
    rekey() {
        this._key = undefined;
    }

    /**
     * Get string representation of point (same as key)
     * @returns {string} String representation
     */
    toString() {
        return this.key;
    }

    /**
     * Create deep copy of this point
     * @param {string[]} [keys] - Optional property names to copy to cloned point
     * @returns {Point} New point with same coordinates
     */
    clone(keys) {
        let p = newPoint(this.x, this.y, this.z, this._key);
        if (this.a !== undefined) {
            p.a = this.a;
        }
        if (keys) {
            for (let key of keys) {
                p[key] = this[key];
            }
        }
        return p;
    }

    /**
     * Annotate instance with additional field data (see clone())
     * @param {Object} [obj={}] - Object with properties to add to this point
     * @returns {Point} This point (for chaining)
     */
    annotate(obj = {}) {
        Object.assign(this, obj);
        return this;
    }

    /**
     * Create slope object from this point to another
     * @param {Point} p - Target point
     * @returns {Slope} Slope object representing direction
     */
    slopeTo(p) {
        return newSlope(this, p);
    }

    /**
     * Create line segment from this point to another
     * @param {Point} p - Endpoint
     * @param {string} [k] - Optional key for line
     * @returns {Line} Line segment
     */
    lineTo(p, k) {
        return newLine(this, p, k);
    }

    /**
     * Check if point is near another within specified distance
     * @param {Point} p - Point to compare
     * @param {number} dist - Distance threshold
     * @returns {boolean} True if within distance in both x and y
     */
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

    /**
     * Calculate 3D distance from this point to infinite line defined by two points
     * Uses cross product method for true 3D distance
     * @param {Point} lp1 - First point defining the line
     * @param {Point} lp2 - Second point defining the line
     * @returns {number} Perpendicular distance to line
     */
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
     * Alternative distance-to-line calculation used exclusively in new fill code
     * NOTE: Output does not agree with distToLine(). This is the only method that works
     * for fill, but using it as global replacement breaks support offset clipping.
     * Both need investigation to formulate a single unified line normal distance function.
     * @param {Point} p1 - First point of line segment
     * @param {Point} p2 - Second point of line segment
     * @returns {number} Distance to line
     */
    distToLineNew(p1, p2) {
        return p2l(this, p1, p2);
    }

    /**
     * Return square of distance to line segment connecting points p1, p2
     * Distance calculated on perpendicular (normal) to line
     * Handles endpoints: if perpendicular falls outside segment, returns distance to nearest endpoint
     * @param {Point} p1 - First point of line segment
     * @param {Point} p2 - Second point of line segment
     * @returns {number} Squared distance to line segment
     */
    distToLineSq(p1, p2) {
        let p = this,
            d = util.distSq(p1, p2);

        let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / d;

        if (t < 0) return util.distSq(p, p1);
        if (t > 1) return util.distSq(p, p2);

        return util.distSqv2(p.x, p.y, p1.x + t * (p2.x - p1.x), p1.y + t * (p2.y - p1.y));
    }

    /**
     * Check if point is within squared distance to line segment with optimized early exit
     * Uses bounding box check for fast rejection before calculating actual distance
     * @param {Point} p1 - First point of line segment
     * @param {Point} p2 - Second point of line segment
     * @param {number} dist2 - Squared distance threshold
     * @returns {boolean} True if within squared distance
     */
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

    /**
     * Calculate midpoint between this point and another in 2D (preserves this.z)
     * @param {Point} p2 - Target point
     * @returns {Point} New midpoint with averaged x,y and this.z
     */
    midPointTo(p2) {
        return newPoint((this.x + p2.x) / 2, (this.y + p2.y) / 2, this.z);
    }

    /**
     * Calculate midpoint between this point and another in 3D
     * @param {Point} p2 - Target point
     * @returns {Point} New midpoint with averaged x,y,z
     */
    midPointTo3D(p2) {
        return newPoint(
            (this.x + p2.x) / 2,
            (this.y + p2.y) / 2,
            (this.z + p2.z) / 2
        );
    }

    /**
     * Project point along slope by multiplier (non-scale corrected version of follow())
     * @param {Slope} slope - Direction slope
     * @param {number} mult - Distance multiplier
     * @returns {Point} New projected point
     */
    projectOnSlope(slope, mult) {
        return newPoint(
            this.x + slope.dx * mult,
            this.y + slope.dy * mult,
            this.z);
    }

    /**
     * Follow direction toward target point by scaled distance
     * @param {Point} point - Target point
     * @param {number} mult - Distance multiplier
     * @returns {Point} New point along line to target
     */
    followTo(point, mult) {
        return this.follow(this.slopeTo(point), mult);
    }

    /**
     * Return point along line from this to p2, offset backward by distance
     * Positive distances move closer to this point (back toward source)
     * @param {Point} p2 - Target point
     * @param {number} dist - Offset distance (positive = toward this point)
     * @returns {Point} Offset point
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
     * Return point along line from this to p2, offset forward by distance
     * Positive distances move farther from this point (toward p2 and beyond)
     * @param {Point} p2 - Target point
     * @param {number} dist - Offset distance (positive = away from this point)
     * @returns {Point} Offset point
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

    /**
     * Create offset line segment perpendicular to line from this to p2
     * Returns line shifted by offset distance perpendicular to original direction
     * Stores original points in np1.op and np2.op properties
     * @param {Point} p2 - Line endpoint
     * @param {number} offset - Perpendicular offset distance
     * @returns {Line} Offset line segment
     */
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
        return newLine(np1, np2, key.NONE);
    }

    /**
     * Create new point offset by specified amounts in each dimension
     * @param {number} x - X offset
     * @param {number} y - Y offset
     * @param {number} z - Z offset
     * @returns {Point} New offset point
     */
    offset(x, y, z) {
        return newPoint(this.x + x, this.y + y, this.z + z);
    }

    /**
     * Check if point is inside polygon using ray casting algorithm
     * Does not check children/holes - use isInPolygon() for full polygon test
     * @param {Polygon} poly - Polygon to test
     * @returns {boolean} True if inside polygon boundary
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
     * Check if point is inside polygon but not inside any of its holes
     * Handles arrays of polygons and considers points near edges as inside
     * @param {Polygon|Polygon[]} poly - Polygon(s) to test
     * @returns {boolean} True if inside outer polygon but not in holes
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
     * Stricter version of isInPolygon - does not consider near-edge points as inside
     * Point must be truly inside outer polygon and not in any holes
     * @param {Polygon|Polygon[]} poly - Polygon(s) to test
     * @returns {boolean} True if strictly inside polygon
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
     * Check if point is near any edge of polygon within squared distance threshold
     * @param {Polygon} poly - Polygon to test
     * @param {number} dist2 - Squared distance threshold
     * @param {boolean} [inner] - If true, also process inner polygons (holes)
     * @returns {boolean} True if within distance of any edge
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
     * Check if point will not be trimmed in later offset operations
     * Used in offset path generation to filter points
     * @param {Polygon} poly - Polygon boundary
     * @param {number} offset - Offset distance (positive=outward, negative=inward)
     * @param {number} mindist2 - Minimum squared distance from edge
     * @returns {boolean} True if point is safe from trimming
     */
    insideOffset(poly, offset, mindist2) {
        return this.inPolygon(poly) === (offset > 0) && !this.nearPolygon(poly, mindist2);
    }

    /**
     * Create new point following given slope for given distance (scale-corrected)
     * Same as projectOnSlope() but normalizes slope to unit vector first
     * @param {Slope} slope - Direction slope
     * @param {number} distance - Distance to travel
     * @returns {Point} New point along slope
     */
    follow(slope, distance) {
        let ls = distance / Math.sqrt(slope.dx * slope.dx + slope.dy * slope.dy);
        return newPoint(this.x + slope.dx * ls, this.y + slope.dy * ls, this.z);
    }

    /**
     * Calculate intersection point on plane at height z between this point and p
     * Used for slicing operations - finds where line crosses Z plane
     * @param {Point} p - Second point
     * @param {number} z - Z height of intersection plane
     * @returns {Point} Intersection point at height z
     */
    intersectZ(p, z) {
        let dx = p.x - this.x,
            dy = p.y - this.y,
            dz = p.z - this.z,
            pct = 1 - ((p.z - z) / dz);
        return newPoint(this.x + dx * pct, this.y + dy * pct, this.z + dz * pct);
    }

    /**
     * Test exact equality in 2D (x and y coordinates only)
     * @param {Point} p - Point to compare
     * @returns {boolean} True if x and y are exactly equal
     */
    isEqual2D(p) {
        return this === p || (this.x === p.x && this.y === p.y);
    }

    /**
     * Check if points are close enough to be considered equivalent in 2D
     * Uses precision_merge_sq threshold for tolerance
     * @param {Point} p - Point to compare
     * @returns {boolean} True if within merge threshold
     */
    isMergable2D(p) {
        return this.isEqual2D(p) || (this.distToSq2D(p) < config.precision_merge_sq);
    }

    /**
     * Test exact equality in 3D (x, y, and z coordinates)
     * @param {Point} p - Point to compare
     * @returns {boolean} True if all coordinates are exactly equal
     */
    isEqual(p) {
        return this === p || (this.x === p.x && this.y === p.y && this.z === p.z);
    }

    /**
     * Check if points are close enough to be considered equivalent in 3D
     * Uses precision_merge_sq threshold for tolerance
     * @param {Point} p - Point to compare
     * @returns {boolean} True if within merge threshold
     */
    isMergable3D(p) {
        return this.isEqual(p) || (this.distToSq3D(p) < config.precision_merge_sq);
    }

    /**
     * Check if point is inside 2D bounding box centered on p
     * @param {Point} p - Center point
     * @param {number} dist - Half-width of box (distance from center to edge)
     * @returns {boolean} True if inside box
     */
    isInBox(p, dist) {
        return Math.abs(this.x - p.x) < dist && Math.abs(this.y - p.y) < dist;
    }

    /**
     * Calculate minimum distance from point to any segment of polygon
     * Early exit optimization: stops searching if distance falls below threshold
     * @param {Polygon} poly - Polygon with segments to measure
     * @param {number} [threshold] - Stop searching if distance drops below this value
     * @returns {number} Minimum distance to any polygon segment
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
     * Calculate minimum distance from point to any vertex of polygon
     * Early exit optimization: stops searching if distance falls below threshold
     * @param {Polygon} poly - Polygon with vertices to measure
     * @param {number} [threshold] - Stop searching if distance drops below this value
     * @returns {number} Minimum distance to any polygon vertex
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
     * Find nearest point from array within maximum distance
     * Skips this point and deleted points (p.del flag)
     * @param {Point[]} points - Array of candidate points
     * @param {number} max - Maximum squared distance to consider
     * @returns {Point|null} Nearest point within max distance, or null if none found
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
     * Calculate average squared distance to cloud of points
     * Excludes this point from calculation
     * @param {Point[]} points - Point cloud
     * @returns {number} Average squared distance
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
     * Calculate Euclidean distance to point in 2D
     * @param {Point} p - Target point
     * @returns {number} Distance
     */
    distTo2D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Calculate squared distance to point in 2D
     * Faster than distTo2D() - use when only comparing distances
     * @param {Point} p - Target point
     * @returns {number} Squared distance
     */
    distToSq2D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y;
        return dx * dx + dy * dy;
    }

    /**
     * Calculate Euclidean distance to point in 3D
     * @param {Point} p - Target point
     * @returns {number} Distance
     */
    distTo3D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y,
            dz = this.z - p.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate squared distance to point in 3D
     * Faster than distTo3D() - use when only comparing distances
     * @param {Point} p - Target point
     * @returns {number} Squared distance
     */
    distToSq3D(p) {
        let dx = this.x - p.x,
            dy = this.y - p.y,
            dz = this.z - p.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Check if point is inside triangle using barycentric coordinate test
     * @param {Point} a - Triangle vertex A
     * @param {Point} b - Triangle vertex B
     * @param {Point} c - Triangle vertex C
     * @returns {boolean} True if inside triangle
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
     * Check if point lies on line segment within precision threshold
     * Uses perpendicular distance test with precision_point_on_line tolerance
     * @param {Point} p1 - Line start point
     * @param {Point} p2 - Line end point
     * @returns {boolean} True if on line within tolerance
     */
    onLine(p1, p2) {
        return this.distToLine(p1, p2) < config.precision_point_on_line;
    }

    /**
     * Create new point by adding delta vector
     * @param {Point} delta - Vector to add
     * @returns {Point} New point (this + delta)
     */
    add(delta) {
        return newPoint(this.x + delta.x, this.y + delta.y, this.z + delta.z);
    }

    /**
     * Create new point by subtracting delta vector
     * @param {Point} delta - Vector to subtract
     * @returns {Point} New point (this - delta)
     */
    sub(delta) {
        return newPoint(this.x - delta.x, this.y - delta.y, this.z - delta.z);
    }

    /**
     * Move this point by delta vector (mutates in place)
     * @param {Point} delta - Vector to add
     * @returns {Point} This point (for chaining)
     */
    move(delta) {
        this.x += delta.x;
        this.y += delta.y;
        this.z += delta.z;
        return this;
    }

    /**
     * Rotate point in XY plane around origin (mutates in place)
     * @param {number} angle - Rotation angle in radians
     */
    rotate(angle) {
        const { x, y } = this;
        this.x = x * Math.cos(angle) - y * Math.sin(angle);
        this.y = y * Math.cos(angle) + x * Math.sin(angle);
        return this;
    }
}

/**
 * Calculate dot product of two 2D vectors
 * @private
 * @param {Object} u - First vector with x,y properties
 * @param {Object} v - Second vector with x,y properties
 * @returns {number} Dot product u·v
 */
function dot(u, v) {
    return u.x * v.x + u.y * v.y;
}

/**
 * Calculate magnitude (length) of 2D vector
 * @private
 * @param {Object} v - Vector with x,y properties
 * @returns {number} Vector magnitude
 */
function norm(v) {
    return Math.sqrt(dot(v, v));
}

/**
 * Calculate Euclidean distance between two 2D vectors
 * @private
 * @param {Object} u - First vector with x,y properties
 * @param {Object} v - Second vector with x,y properties
 * @returns {number} Distance
 */
function d(u, v) {
    return norm({
        x: u.x - v.x,
        y: u.y - v.y
    });
}

/**
 * Calculate distance from point to line (used by distToLineNew)
 * Projects point onto infinite line and returns distance to projection
 * @private
 * @param {Point} p - Point to measure from
 * @param {Point} l1 - First point defining line
 * @param {Point} l2 - Second point defining line
 * @returns {number} Perpendicular distance from point to line
 */
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

/**
 * Create a new Point instance
 * @param {number} [x=0] - X coordinate
 * @param {number} [y=0] - Y coordinate
 * @param {number} [z=0] - Z coordinate
 * @param {string} [key] - Optional cached key for comparison
 * @returns {Point} New point instance
 */
function newPoint(x, y, z, key) {
    return new Point(x, y, z, key);
}

/**
 * Convert Clipper library point to Point instance
 * @param {Object} cp - Clipper point with X,Y integer properties (scaled by config.clipper)
 * @param {number} z - Z coordinate for resulting point
 * @returns {Point} New point with coordinates scaled back from Clipper format
 */
function pointFromClipper(cp, z) {
    return newPoint(cp.X / config.clipper, cp.Y / config.clipper, z);
}

 export {
    Point,
    newPoint,
    pointFromClipper
};
