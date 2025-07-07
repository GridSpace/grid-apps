/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// use: add.array
// use: add.class
gapp.register("geo.base", [], (root, exports) => {

const base = root.base = {};
const round_decimal_precision = 5;

function time() {
    return Date.now()
}

function lerp(from, to, maxInc, incFrom) {
    let dir = Math.sign(to - from);
    let delta = Math.abs(to - from);
    let steps = Math.floor(delta / maxInc);
    let rem = delta % maxInc;
    let per = delta / steps;
    if (rem) {
        steps++;
        per = delta / steps;
    }
    let out = incFrom ? [from] : [];
    while (steps-- > 0) {
        from += per * dir;
        out.push(from);
    }
    return out;
}

/** track an array of promises as they all complete */
async function pwait(promises, tracker) {
    let count = 0;
    if (tracker)
        for (let p of promises) {
            p.then(data => {
                tracker(count++, promises.length, data);
            });
        }
    await Promise.all(promises);
}

/** return a promise that resolves after a given time */
function ptimer(time) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, time);
    });
}

function numOrDefault(num, def) {
    return num !== undefined ? num : def;
}

/**
 * call function with all combinations of a1, a2
 * and passing in the supplied arg object.
 * used by polygons.trimTo() for trimming slice projected fills
 * @param {Array} a1
 * @param {Array} a2
 * @param {Object} arg
 * @param {Function} fn
 * @returns {Object}
 */
function doCombinations(a1, a2, arg, fn) {
    let i, j;
    for (i = 0; i < a1.length; i++) {
        for (j = (a1 === a2 ? i + 1 : 0); j < a2.length; j++) {
            fn(a1[i], a2[j], arg);
        }
    }
    return arg;
}

function isClockwise(p1, p2, p3) {
    return area2(p1, p2, p3) > 0;
}

function isCounterClockwise(p1, p2, p3) {
    return area2(p1, p2, p3) < 0;
}

function pac(p1, p2) {
    return (p2.x - p1.x) * (p2.y + p1.y);
}

/**
 * returns 2x area for a triangle with sign indicating handedness
 * @returns {number} negative for CCW progression, positive for CW progression
 */
function area2(p1, p2, p3) {
    return pac(p1, p2) + pac(p2, p3) + pac(p3, p1);
}

function isCloseTo(v1, v2, dist) {
    return Math.abs(v1 - v2) <= (dist || base.config.precision_merge);
}

function inCloseRange(val, min, max) {
    return (isCloseTo(val, min) || val >= min) && (isCloseTo(val, max) || val <= max);
}

/**
 * return square of value
 */
function sqr(v) {
    return v * v
}

// radians rotatition around origin
function rotate(x,y,radians) {
    return [
        x * Math.cos(radians) - y * Math.sin(radians),
        y * Math.cos(radians) + x * Math.sin(radians)
    ];
}

const deg2rad = (Math.PI / 180);
const rad2deg = (180 / Math.PI);

function toRadians(degrees) {
    return degrees * deg2rad;
}

function toDegrees(radians) {
    return radians * rad2deg;
}

/**
 * return distance between two points
 */
function dist2D(p1, p2) {
    return Math.sqrt(distSq(p1, p2));
}

/**
 * return distance squared between two points
 */
function distSq(p1, p2) {
    return sqr(p2.x - p1.x) + sqr(p2.y - p1.y)
}

/**
 * return distance squared between two points
 * enables faster Point.nearPolygon()
 */
function distSqv2(x1, y1, x2, y2) {
    return sqr(x2 - x1) + sqr(y2 - y1)
}

function offsetPrecision(offset, precision) {
    return Math.abs(offset) - precision;
}

function inRange(value, min, max) {
    let val = parseFloat(value);
    return val >= min && val <= max;
}

function round(v, zeros) {
    if (typeof v === 'object') {
        for (let [key,val] of Object.entries(v)) {
            if (typeof val === 'number') {
                v[key] = round(val, zeros);
            }
        }
        return v;
    }
    const prec = zeros !== undefined ? zeros : round_decimal_precision;
    if (prec === 0) return v | 0;
    let pow = Math.pow(10, prec);
    return Math.round(v * pow) / pow;
}

function clamp(val, low, hi) {
    return Math.max(low, Math.min(hi, val));
}

/**
 * used by {@link Polygon.trace} and {@link Polygon.intersect}
 */
function intersect(p1, p2, p3, p4, test, parallelok) {
    let keys = base.key,
        p1x = p1.x,
        p1y = p1.y,
        p2x = p2.x,
        p2y = p2.y,
        p3x = p3.x,
        p3y = p3.y,
        p4x = p4.x,
        p4y = p4.y,
        d1x = (p2x - p1x), // ad.x
        d1y = (p2y - p1y), // ad.y
        d2x = (p4x - p3x), // bd.x
        d2y = (p4y - p3y), // bd.y
        d = (d2y * d1x) - (d2x * d1y); // det

    //if (Math.abs(d) < 0.0000000001) {
    if (Math.abs(d) < 0.0001) {
        // lines are parallel or collinear
        return test && !parallelok ? null : keys.PARALLEL;
    }

    let a = p1y - p3y, // origin dy
        b = p1x - p3x, // origin dx
        n1 = (d2x * a) - (d2y * b),
        n2 = (d1x * a) - (d1y * b);

    a = n1 / d; // roughly distance from l1 origin to l2 intersection
    b = n2 / d; // roughly distance from l2 origin to l1 intersection

    let ia = a >= -0.0001 && a <= 1.0001,
        ib = b >= -0.0001 && b <= 1.0001,
        segint = (ia && ib),
        rayint = (a >= 0 && b >= 0);

    if (test === keys.SEGINT && !segint) return null;
    if (test === keys.RAYINT && !rayint) return null;

    let ip = base.newPoint(
        p1x + (a * d1x), // x
        p1y + (a * d1y), // y
        p3.z || p4.z, // z
        segint ? keys.SEGINT : rayint ? keys.RAYINT : keys.PROJECT
    );

    ip.dist = a;
    ip.p1 = p3;
    ip.p2 = p4;

    return ip;
}

/**
 * used by {@link rayIntersect} and {@link Polygon.trace}
 */
function intersectRayLine(ro, s1, p1, p2, infinite) {
    let keys = base.key,
        p1x = ro.x,
        p1y = ro.y,
        s1x = s1.dx,
        s1y = s1.dy,
        p3x = p1.x,
        p3y = p1.y,
        p4x = p2.x,
        p4y = p2.y,
        s2x = p4x - p3x,
        s2y = p4y - p3y,
        d = (s2y * s1x) - (s2x * s1y);

    let a = p1y - p3y,
        b = p1x - p3x,
        n1 = (s2x * a) - (s2y * b),
        n2 = (s1x * a) - (s1y * b);

    if (Math.abs(d) < 0.000000000001) {
        // lines are parallel or collinear
        return null;
    }

    a = n1 / d;
    b = n2 / d;

    if (infinite || (inCloseRange(b, 0, 1) && a >= 0)) {
        let ip = base.newPoint(
            p1x + (a * s1x),
            p1y + (a * s1y),
            p2.z || ro.z,
            keys.NONE
        );
        ip.dist = a;
        ip.p1 = p1;
        ip.p2 = p2;
        return ip;
    }
    return null;
}

/**
 * @param {Point} p1
 * @param {Point} p2
 * @param {Point} p3
 * @param {Point} p4
 * @returns {number}
 */
function determinant(p1, p2, p3, p4) {
    let d1x = (p2.x - p1.x),
        d1y = (p2.y - p1.y),
        d2x = (p4.x - p3.x),
        d2y = (p4.y - p3.y);

    return (d2y * d1x) - (d2x * d1y);
}

/**
 * Find Z of XY pair given plane defined by 3 points
 */
function zInPlane(p1, p2, p3, x, y) {
    let vec1 = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
    let vec2 = new THREE.Vector3(p3.x - p1.x, p3.y - p1.y, p3.z - p1.z);
    vec1.cross(vec2);

    if (vec1.z !== 0) {
        return ((vec1.x * (x - p1.x) + vec1.y * (y - p1.y)) / -vec1.z) + p1.z;
    }
}

/**
 * find circle center given 3 points in XY plane
 */
function circleCenter(A, B, C) {
    let denominator = 2 * determinant33([
        [A.x, A.y, 1],
        [B.x, B.y, 1],
        [C.x, C.y, 1]
    ]);
    let xmat = [
        [A.x * A.x + A.y * A.y, A.y, 1],
        [B.x * B.x + B.y * B.y, B.y, 1],
        [C.x * C.x + C.y * C.y, C.y, 1]
    ];
    let ymat = [
        [A.x, A.x * A.x + A.y * A.y, 1],
        [B.x, B.x * B.x + B.y * B.y, 1],
        [C.x, C.x * C.x + C.y * C.y, 1]
    ];

    let center = {
        x: determinant33(xmat) / denominator,
        y: determinant33(ymat) / denominator,
        z: A.z
    };

    if (denominator !== 0) {
        return center;
    }
}

/**
 * find the determinant of a 3x3 matrix array organized [row, col]
 */
function determinant33(mat33) {
    let cofactor00 = mat33[0][0] * (mat33[1][1] * mat33[2][2] - mat33[1][2] * mat33[2][1]);
    let cofactor01 = -mat33[0][1] * (mat33[1][0] * mat33[2][2] - mat33[1][2] * mat33[2][0]);
    let cofactor02 = mat33[0][2] * (mat33[1][0] * mat33[2][1] - mat33[1][1] * mat33[2][0]);
    return cofactor00 + cofactor01 + cofactor02;
}

/**
 * return circle center given three points
 * from https://stackoverflow.com/questions/4103405/what-is-the-algorithm-for-finding-the-center-of-a-circle-from-three-points
 */
function center2d(A, B, C, rad) {
    let center = circleCenter(A, B, C);
    if (center && rad) {
        let dx = center.x - A.x;
        let dy = center.y - A.y;
        center.r = Math.sqrt(dx * dx + dy * dy)
    }
    return center;
}

/**
 * return one of two possible circle centers given two points, a radius and clock direction
 * https://stackoverflow.com/questions/36211171/finding-center-of-a-circle-given-two-points-and-radius
 */
function center2pr(p1, p2, r, clockwise) {
    let x1 = p1.x,
        x2 = p2.x,
        y1 = p1.y,
        y2 = p2.y,
        q = Math.sqrt(Math.pow((x2 - x1), 2) + Math.pow((y2 - y1), 2)),
        y3 = (y1 + y2) / 2,
        x3 = (x1 + x2) / 2,
        basex = Math.sqrt(Math.pow(r, 2) - Math.pow((q / 2), 2)) * (y1 - y2) / q, //calculate once
        basey = Math.sqrt(Math.pow(r, 2) - Math.pow((q / 2), 2)) * (x2 - x1) / q, //calculate once
        centerx1 = x3 + basex, //center x of circle 1
        centery1 = y3 + basey, //center y of circle 1
        centerx2 = x3 - basex, //center x of circle 2
        centery2 = y3 - basey, //center y of circle 2
        dir = new THREE.Vector2(x2 - x1, y2 - y1),
        vec1 = new THREE.Vector2(centerx1 - x1, centery1 - y1),
        vec2 = new THREE.Vector2(centerx2 - x1, centery2 - x1);
    if (clockwise) {
        return dir.cross(vec1) > 0 ? {
            x: centerx1,
            y: centery1
        } : {
            x: centerx2,
            y: centery2
        };
    } else {
        return dir.cross(vec1) < 0 ? {
            x: centerx1,
            y: centery1
        } : {
            x: centerx2,
            y: centery2
        };
    }
}

// find angle difference between 0 and 2pi from n1 to n2 (signed depending on clock direction)
function thetaDiff(n1, n2, clockwise) {
    let diff = n2 - n1;
    if(typeof n1  != 'number' || typeof n2 != 'number') {
        throw ("n1 and n2 must be numbers");
        // this check is here because this causes an infinite loop when other value are provided
    }
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    if (clockwise && diff > 0) diff -= Math.PI * 2;
    if (!clockwise && diff < 0) diff += Math.PI * 2;
    return diff;
}

// order array of elements using next closest element comparator
// used for things like next-closest point walks (fdm thin fill)
// in future, replace poly2poly and similar with this
function orderClosest(array, fn, from) {
    if (!array.length) {
        return array;
    }
    let out = new Array(array.length);
    let outi = 0;
    let root = 0;
    if (!from) {
        from = array[root++];
        out[outi++] = from;
    }
    for (;;) {
        let best, best_i, best_dist = Infinity;
        for (let i = root; i < array.length; i++) {
            let el = array[i];
            if (!el) continue;
            let dist = fn(from, el);
            if (dist < best_dist) {
                best_dist = dist;
                best_i = i;
                best = el;
            }
        }
        if (!best) break;
        array[best_i] = undefined;
        from = out[outi++] = best;
    }
    return out;
}

// wrapper for earcut that handles higher order dimensions and finds the
// two with the greatest delta to pass to the earcut algorith, then returns
// an unwrapped array in the original dimensions
// at present, only used by load.obj.parse()
function triangulate(array, holes, dims, pos) {
    let narray;
    let info;
    if (dims === 2) {
        narray = array;
    } else {
        let min = new Array(dims).fill(Infinity);
        let max = new Array(dims).fill(-Infinity);
        for (let i = 0, l = array.length; i < l;) {
            for (let j = 0, av; j < dims; j++) {
                av = array[i++];
                min[j] = Math.min(min[j], av);
                max[j] = Math.max(max[j], av);
            }
        }
        let delta = new Array(dims);
        for (let i = 0; i < dims; i++) {
            delta[i] = max[i] - min[i];
        }
        let dmax = 0,
            d1, d2;
        for (let i = 0; i < dims; i++) {
            if (delta[i] > dmax) {
                dmax = delta[i];
                d1 = i;
            }
        }
        info = { d1, d2, dmax, delta: delta.slice() };
        delta[d1] = dmax = 0;
        for (let i = 0; i < dims; i++) {
            if (delta[i] > dmax) {
                dmax = delta[i];
                d2 = i;
            }
        }
        narray = new Array((array.length / dims) * 2);
        for (let i = 0, j = 0; i < array.length; i += dims) {
            narray[j++] = array[i + d1];
            narray[j++] = array[i + d2];
        }
    }
    let ec = earcut(narray, holes, 2);
    if (pos) {
        return ec;
    }
    let oa = new Array(ec.length * dims);
    for (let i = 0, e = 0, l = ec.length, ai; i < l; i++) {
        ai = ec[i] * dims;
        for (let j = 0; j < dims; j++) {
            oa[e++] = array[ai + j];
        }
    }
    if (oa.length === 0) {
        console.log('debug_triangulate', {array, oa, info});
    }
    return oa;
}

function flatten(arr) {
    return arr.reduce((acc, val) => Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val), [])
}

function comma(v) {
    if (!v) return v;
    let [lt, rt] = v.toString().split('.');
    lt = lt.toString().split('').reverse().map((v, i, a) => {
        return (i < a.length - 1 && i % 3 === 2) ? `,${v}` : v
    }).reverse().join('');
    return rt ? `${lt}.${rt}` : lt;
}

/** ******************************************************************
 * Connect to base
 ******************************************************************* */

base.key = {
    NONE: "",
    PROJECT: "project",
    SEGINT: "segint",
    RAYINT: "rayint",
    PARALLEL: "parallel"
};

base.config = {
    // size of gcode debug arrow head
    debug_arrow: 0.25,
    // default # of decimal places in generated gcode
    gcode_decimals: 4,
    // heal disjoint polygons in slicing (experimental)
    bridgeLineGapDistance: 0.05,
    bridgeLineGapDistanceMax: 25,
    // Bounds default margin nearTo
    // Polygon.offset mindist2 offset precision
    precision_offset: 0.05,
    // Polygon.isEquivalent area() isCloseTo
    precision_poly_area: 0.05,
    // Polygon.isEquivalent bounds() equals value
    precision_poly_bounds: 0.01,
    // Polygon.isEquivalent point distance to other poly line
    precision_poly_merge: 0.05,
    // Polygon.traceIntersects mindist2
    // Polygon.overlaps (bounds overlaps test precision)
    // Polygon.isEquivalent circularity (is circle if 1-this < merge)
    // Slope.isSame (vert/horiz w/in this value)
    // isCloseTo() default for dist
    // sliceIntersects point merge dist for non-fill
    precision_merge: 0.005,
    precision_slice_z: 0.0001,
    // Point.isInPolygon nearPolygon value
    // Point.isInPolygonNotNear nearPolygon value
    // Point.isMergable2D distToSq2D value
    // Point.isMergable3D distToSq2D value
    // Polygon.isInside nearPolygon value
    // Polygon.isOutside nearPolygon value
    precision_merge_sq: sqr(0.005),
    // Bound.isNested inflation value for potential parent
    precision_bounds: 0.0001,
    // Slope.isSame default precision
    precision_slope: 0.02,
    // Slope.isSame use to calculate precision
    precision_slope_merge: 0.25,
    // sliceIntersect point merge distance for fill
    precision_fill_merge: 0.001,
    // convertPoints point merge distance
    // other values break cube-s9 (wtf)
    precision_decimate: 0.05,
    // decimate test over this many points
    decimate_threshold: 500000,
    // Point.onLine precision distance (endpoints in Polygon.intersect)
    precision_point_on_line: 0.01,
    // Polygon.isEquivalent value for determining similar enough to test
    precision_circularity: 0.001,
    // polygon fill hinting (settings override)
    hint_len_min: sqr(3),
    hint_len_max: sqr(20),
    hint_min_circ: 0.15,
    // tolerances to determine if a point is near a masking polygon
    precision_mask_tolerance: 0.001,
    // Polygon isInside,isOutside tolerance (accounts for midpoint skew)
    precision_close_to_poly_sq: sqr(0.001),
    // how long a segment has to be to trigger a midpoint check (inner/outer)
    precision_midpoint_check_dist: 1,
    precision_nested_sq: sqr(0.01),
    // clipper multiplier
    clipper: 100000,
    // clipper poly clean
    clipperClean: 250
};

base.util = {
    sqr,
    lerp,
    time,
    clamp,
    comma,
    round,
    area2,
    pwait,
    ptimer,
    flatten,
    rotate,
    distSq,
    dist2D,
    distSqv2,
    center2d,
    center2pr,
    determinant,
    orderClosest,
    doCombinations,
    offsetPrecision,
    circleCenter,
    numOrDefault,
    toRadians,
    toDegrees,
    thetaDiff,
    intersect,
    inRange,
    isCloseTo,
    inCloseRange,
    isClockwise,
    isCounterClockwise,
    intersectRayLine,
    triangulate,
    zInPlane
};

});
