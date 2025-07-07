/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/**
 * basic slice and line connection. In future, replace kiri's fdm and cam slicers
 * with wrappers on this one.
 */
// dep: geo.base
// dep: geo.line
// dep: geo.point
// dep: geo.polygon
// dep: geo.polygons
gapp.register("geo.slicer", [], (root, exports) => {

const { base } = root;
const { config, util, polygons } = base
const { newOrderedLine, newPolygon, newPoint } = base;

const POLY = base.polygons;

function dval(v, dv) {
    return v !== undefined ? v : dv;
}

/**
 * Given an array of points as triples, a bounding box and a set of
 * slicing controls, emit an array of Slice objects to the ondone()
 * function. onupdate() will be called with two parameters (% completion
 * and an optional message) so that the UI can report progress to the user.
 *
 * @param {Point[]} points vertex array
 * @param {Object} options slicing parameters
 */
async function slice(points, options = {}) {
    let zMin = options.zMin || 0,
        zMax = options.zMax || 0,
        zInc = options.zInc || 0,
        zGen = options.zGen,    // optional z index generator function
        zIndexes = options.indices || [],
        minStep = options.minstep || 0,
        zFlat = {},             // map area of z index flat areas
        zList = {},             // fast map of z indexes
        zLine = [],             // map of line counts co-linear to z plane
        zScale,                 // bucket span in z units
        zSum = 0.0,             // sanity check that points enclose non-zere volume
        buckets = [],           // banded/grouped faces to speed up slice/search
        overlapMax = options.overlap || 0.75,
        bucketMax = options.bucketMax || 100,
        onupdate = options.onupdate || function() {},
        sliceFn = dval(options.slicer, sliceZ),
        { debug, flat, autoDim } = options,
        i, j, p1, p2, p3;

    if (!(points && points.length)) {
        throw "missing points array";
    }

    // convert threejs position array into points array
    if (flat) {
        let array = [];
        for (i=0, j=points.length; i<j; ) {
            array.push(newPoint(
                points[i++].round(3),
                points[i++].round(3),
                points[i++].round(3)
            ));
        }
        points = array;
    } else {
        // round points
        for (i = 0; i < points.length; i++) {
            points[i] = points[i].round(3);
        }

    }

    // gather z-index stats
    for (i = 0; i < points.length;) {
        p1 = points[i++];
        p2 = points[i++];
        p3 = points[i++];
        // used to calculate buckets (rough sum of z span)
        zSum += (Math.abs(p1.z - p2.z) + Math.abs(p2.z - p3.z) + Math.abs(p3.z - p1.z));
        // use co-flat and co-line detection to adjust slice Z
        if (p1.z === p2.z && p2.z === p3.z && p1.z >= zMin) {
            // detect faces co-planar with Z and sum the enclosed area
            let zkey = p1.z,
                area = Math.abs(util.area2(p1,p2,p3)) / 2;
            if (!zFlat[zkey]) {
                zFlat[zkey] = area;
            } else {
                zFlat[zkey] += area;
            }
            zLine[zkey] = (zLine[zkey] || 0) + 1;
        } else if (p1.z === p2.z) {
            zLine[p1.z] = (zLine[p1.z] || 0) + 1;
        } else if (p2.z === p3.z) {
            zLine[p2.z] = (zLine[p2.z] || 0) + 1;
        } else if (p3.z === p1.z) {
            zLine[p3.z] = (zLine[p3.z] || 0) + 1;
        }
        if (autoDim) {
            zMin = Math.min(zMin, p1.z, p2.z, p3.z);
            zMax = Math.max(zMax, p1.z, p2.z, p3.z);
        }
        zList[p1.z] = p1.z;
        zList[p2.z] = p2.z;
        zList[p3.z] = p3.z;
    }

    if (zInc) {
        for (i = zMin; i <= zMax; i += zInc) {
            zIndexes.push(i);
        }
    } else if (!zIndexes.length) {
        zIndexes = Object.values(zList).sort((a,b) => a - b);
        if (minStep > 0) {
            let lastOut;
            zIndexes = zIndexes.filter(v => {
                if (lastOut !== undefined && v - lastOut < minStep) {
                    return false;
                } else {
                    lastOut = v;
                    return true;
                }
            });
        }
    }

    // allow zGen to override or update zIndexes
    // FDM, CAM, Laser slicers will use this to align or interpolate layers
    if (zGen) {
        zIndexes = zGen({ zMin, zMax, zLine, zFlat, zIndexes, options });
    }

    // ensure bucket aligmnent
    zIndexes = zIndexes.map(v => v.round(3));

    /**
     * bucket polygons into z-bounded groups (inside or crossing)
     * to reduce the search space in complex models
     */
    let zSpan = zMax - zMin;
    let zSpanAvg = zSum / points.length;
    let bucketCount = options.bucket !== false ?
        Math.min(bucketMax, Math.max(1, Math.floor(zSpan / zSpanAvg))) : 1;

    zScale = 1 / (zMax / bucketCount);

    if (debug) {
        console.log({
            zMin, zMax, zIndexes, zScale, zSum, zSpanAvg,
            points, bucketCount,
            options, buckets
        });
    }

    /** short-circuit for microscopic and invalid objects */
    if (zSpan == 0 || zSum == 0 || points.length == 0) {
        return {};
    }

    // create empty buckets
    for (i = 0; i < bucketCount; i++) {
        buckets.push({ points: [], slices: [] });
    }

    if (bucketCount > 1) {
        let failAt = (points.length * overlapMax) | 0, bucket;
        // copy triples into all matching z-buckets
        outer: for (i = 0; i < points.length;) {
            p1 = points[i++];
            p2 = points[i++];
            p3 = points[i++];
            let zm = Math.max(0, Math.min(p1.z, p2.z, p3.z)),
                zM = Math.max(p1.z, p2.z, p3.z),
                bm = Math.floor(zm * zScale),
                bM = Math.min(Math.ceil(zM * zScale), bucketCount);
            // add point to all buckets in range
            for (j = bm; j < bM; j++) {
                bucket = buckets[j].points;
                bucket.push(p1);
                bucket.push(p2);
                bucket.push(p3);
                // fail if single bucket exceeds threshold
                if (bucket.length > failAt) {
                    if (debug) console.log({ bucketFail: bucket.length });
                    bucketCount = 1;
                    break outer;
                }
            }
        }
    }

    // fallback if we can't partition point space
    if (bucketCount === 1) {
        buckets = [{ points, slices: [] }];
    }

    // create buckets data structure
    for (let i = 0, l = zIndexes.length; i < l; i++) {
        let z = zIndexes[i],
            index = bucketCount <= 1 ? 0 :
            Math.min(Math.floor(z * zScale), bucketCount - 1),
            bucket = buckets[index];
        if (bucket) {
            bucket.slices.push(z);
        } else {
            console.log({ missing_bucket: z, index });
        }
        onupdate((i / zIndexes.length) * 0.1);
    }

    async function sliceBuckets() {
        let output = [];
        let count = 0;
        let opt = { ...options, zMin, zMax, zIndexes };
        let ps = [];

        for (let i = 0, l = buckets.length; i < l; i++) {
            let bucket = buckets[i];
            let { points, slices } = bucket;
            if (slices.length)
            ps.push(sliceFn(slices, points, {
                ...opt,
                each(rval) {
                    output.push(rval);
                    onupdate(0.1 + (count++ / zIndexes.length) * 0.9);
                }
            }));
        }

        // join all returned promises
        await Promise.all(ps);

        return output;
    }

    // create slices from each bucketed region
    let slices = sliceFn ? await sliceBuckets() : [];
    slices = slices.sort((a,b) => a.z - b.z);

    return { slices, points, zMin, zMax, zIndexes, zFlat };
}

/**
 * given a point, append to the correct
 * 'where' objec tarray (on, over or under)
 *
 * @param {Point} p
 * @param {number} z offset
 * @param {Obejct} where
 */
function checkUnderOverOn(p, z, where) {
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
 * process a single z-slice on a single mesh and
 * add to slices array
 *
 * @param {number} z
 */
async function sliceZ(z, points, options = {}) {
    if (Array.isArray(z)) {
        return Promise.all(z.map(z => sliceZ(z, points, options)));
    }

    let { zMin, zMax, under, over, both, each } = options,
        groupFn = dval(options.groupr, both ? null : sliceConnect),
        phash = {},
        lines = [],
        p1, p2, p3;

    // default to 'over' selection with 2 points on a line
    if (!under && !both) over = true;

    // iterate over matching buckets for this z offset
    for (let i = 0; i < points.length; ) {
        p1 = points[i++];
        p2 = points[i++];
        p3 = points[i++];
        let where = {under: [], over: [], on: []};
        checkUnderOverOn(p1, z, where);
        checkUnderOverOn(p2, z, where);
        checkUnderOverOn(p3, z, where);
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

    // de-dup and group lines
    lines = removeDuplicateLines(lines);

    let rval = { z, lines };
    if (groupFn) {
        let groups = groupFn(lines, z, options);
        if (options.xor) {
            groups = POLY.xor(groups);
        }
        if (options.union) {
            let points = groups.map(p => p.length);
            if (points.length > 1) points = points.reduce((a,b) => a + b);
            // simplistic healing of non-manifold meshes
            let opt = { x: 1 };
            let union = POLY.union(POLY.nest(groups), 0.1, true, opt);
            // fall back to xor'ing polygons that might overlap
            // when one does not cleanly contain the other and we lose lots of points
            // trigger when 2 polygons and we lose > 40% of points in the union
            let delta = opt.changes < 0 ? Math.abs(opt.changes / points) : 0; 
            if (groups.length === 2 && delta >= 0.4) {
                let xor = groups[0].xor(groups[1]);
                console.log({ points, pct: (opt.changes / points).round(3), xor: xor.length });
                if (xor.length) {
                    union = xor;
                }
            }
            // track total poly length changes to determine if healed
            rval.changes = opt.changes;
            groups = POLY.flatten(union, null, true);
        }
        rval.groups = groups;
    }

    // look for driver-specific slice post-processor
    if (options.post) {
        let fn = base.slicePost[options.post];
        if (fn) fn(rval, options);
    }

    // free objects to be re-claimed and reduce memory pressure
    if (false) {
        delete rval.groups
        delete rval.lines

        if (rval.tops)
        for (let top of rval.tops) {
            if (top.poly) {
                top.poly.freeParentRefs();
                top.simple.freeParentRefs();
                for (let shell of top.shells) shell.freeParentRefs();
                for (let fillo of top.fill_off) fillo.freeParentRefs();
                for (let last of top.last) last.freeParentRefs();
            } else {
                top.freeParentRefs();
            }
        }

        if (rval.clip) {
            for (let clip of rval.clip) clip.freeParentRefs();
            if (rval.clip.m_AllPolys) delete rval.clip.m_AllPolys
        }
    }

    if (each) each(rval);
    return rval;
}

/**
 * Given an array of input lines (line soup), find the path through
 * joining line ends that encompasses the greatest area without self
 * interesection.  Eliminate used points and repeat.  Unjoined lines
 * are permitted and handled after all other cases are handled.
 *
 * @param {Line[]} input
 * @param {number} [index]
 * @returns {Array}
 */
function sliceConnect(input, z, opt = {}) {
    let { debug, both } = opt;

    if (both) {
        if (debug) console.log('unable to connect lines sliced with "both" option');
        return [];
    }

    // map points to all other points they're connected to
    let pmap = {},
        points = [],
        output = [],
        connect = [],
        emitted = 0,
        forks = false,
        frays = false,
        bridge = config.bridgeLineGapDistance,
        bridgeMax = config.bridgeLineGapDistanceMax,
        p1, p2, gl;

    function cachedPoint(p) {
        let cp = pmap[p.key];
        if (cp) return cp;
        points.push(p);
        pmap[p.key] = p;
        return p;
    }

    function addConnected(p1, p2) {
        if (!p1.group) p1.group = [ p2 ];
        else p1.group.push(p2);
    }

    function perimeter(array) {
        if (!array.perimeter) {
            array.perimeter = newPolygon().addPoints(array).perimeter();
        }
        return array.perimeter;
    }

    /**
     * follow points through connected lines to form candidate output paths
     */
    function findNextPath(point, current, branches, depth = 1) {
        let path = [];
        if (current) {
            current.push(path);
        }

        for (;;) {
            // prevent point re-use
            point.del = true;
            // add point to path
            path.push(point);

            let links = point.group.filter(p => !p.del);

            // no need to recurse at the start
            if (links.length === 2 && depth === 1) {
                point = links[0];
                // if (debug) console.log({start_mid: point, depth});
                continue;
            }

            // if fork in the road, follow all paths to their end
            // and find the longest path
            let root = !current, nc;
            if (links.length > 1) {
                // if (debug) console.log('fork!', {links: links.length, depth, root});
                if (root) {
                    current = [ path ];
                    branches = [ ];
                }
                if (branches.length < 500)
                for (let p of links) {
                    branches.push(nc = current.slice());
                    let rpath = findNextPath(p, nc, branches, depth + 1);
                    // allow point re-use in other path searches
                    for (let p of rpath) p.del = false;
                }
                // flatten and sort in ascending perimeter
                let flat = branches.map(b => b.flat()).sort((a,b) => {
                    return perimeter(b) - perimeter(a);
                });
                let npath = flat[0];
                if (debug) console.log({
                    root,
                    branches: branches.slice(),
                    flat, path, npath
                });
                if (root) {
                    for (let p of npath) p.del = true;
                    return npath;
                } else {
                    return path;
                }
                // return root ? npath : path;
            } else {
                // choose next (unused) point
                point = links[0];
            }

            // hit an open end or branch
            if (!point || point.del) {
                return path;
            }
        }

        throw "invalid state";
    }

    // emit a polygon if it can be cleaned and still have 2 or more points
    function emit(poly) {
        emitted += poly.length;
        if (!opt.dirty) poly = poly.clean();
        if (poly.length > 2 || true) output.push(poly);
        if (debug) console.log('xray',poly);
    }

    // given an array of paths, emit longest to shortest
    // eliminating points from the paths as they are emitted
    // shorter paths any point eliminated are eliminated as candidates.
    function emitPath(path) {
        let closed = path[0].group.indexOf(path.peek()) >= 0;
        if (closed && path.length > 2) {
            if (debug) console.log({ closed: path.length, path });
            emit(newPolygon().addPoints(path));
        } else if (path.length > 1) {
            let gap = path[0].distTo2D(path.peek()).round(4);
            if (debug) console.log({ open: path.length, gap, path });
            connect.push(path);
        }
    }

    // create point map, unique point list and point group arrays
    input.forEach(function(line) {
        p1 = cachedPoint(line.p1);
        p2 = cachedPoint(line.p2);
        addConnected(p1,p2);
        addConnected(p2,p1);
    });

    // console.log({points, forks: points.filter(p => p.group.length !== 2)});
    // for each unused point, find the longest non-intersecting path

    for (let point of points) {
        gl = point.group.length;
        forks = forks || gl > 2;
        frays = frays || gl < 2;
    }
    if (debug && (forks || frays)) console.log({forks, frays});

    // process paths starting with forks
    if (forks) {
    if (debug) console.log('process forks');
    for (let point of points) {
        // must not have been used and be a dangling end
        if (!point.del && point.group.length > 2) {
            let path = findNextPath(point);
            if (path) emitPath(path);
        }
    } }

    // process paths with dangling endpoints
    if (frays) {
    if (debug) console.log('process frays');
    for (let point of points) {
        // must not have been used and be a dangling end
        if (!point.del && point.group.length === 1) {
            let path = findNextPath(point);
            if (path) emitPath(path);
        }
    } }

    // process normal paths
    if (debug) console.log('process mids');
    for (let point of points) {
        // must not have been used and be a dangling end
        if (!point.del) {
            let path = findNextPath(point);
            if (path) emitPath(path);
        }
    }

    if (debug) console.log({
        points,
        emitted,
        used: points.filter(p => p.del),
        free: points.filter(p => !p.del),
    });

    if (debug && connect.length) console.log({connect});
    if (debug) connect = connect.map(a => a.slice());

    // progressively connect open polygons within a bridge distance
    let iter = 1000;
    let mingap;
    if (true) do {
        mingap = Infinity;

        outer: for (let i=0; i<connect.length; i++) {
            if (!bridge) {
                emit(newPolygon().addPoints(root).setOpen());
                continue;
            }

            // rollup root with arrays after until no more ends match
            inner: while (true) {
                let root = connect[i];

                if (root.delete) break;

                let rfirst = root[0],
                    rlast = root.peek(),
                    dist = rfirst.distToSq2D(rlast),
                    closest = { dist };

                for (let j=i+1; j<connect.length; j++) {
                    let next = connect[j];

                    if (next.delete) continue;

                    let nfirst = next[0];
                    let nlast = next.peek();

                    // test last to next first
                    dist = rlast.distToSq2D(nfirst);
                    mingap = Math.min(mingap, dist);
                    if (dist < closest.dist && dist <= bridge) {
                        closest = { dist, next }
                    }

                    // test last to next last
                    dist = rlast.distToSq2D(nlast);
                    mingap = Math.min(mingap, dist);
                    if (dist < closest.dist && dist <= bridge) {
                        closest = { dist, next, reverse: next };
                    }

                    // test first to next first
                    dist = rfirst.distToSq2D(nfirst);
                    mingap = Math.min(mingap, dist);
                    if (dist < closest.dist && dist <= bridge) {
                        closest = { dist, next, reverse: root };
                    }

                    // test last to next last
                    dist = rfirst.distToSq2D(nlast);
                    mingap = Math.min(mingap, dist);
                    if (dist < closest.dist && dist <= bridge) {
                        closest = { dist, next, swap: j };
                    }
                }

                let { next, reverse, swap } = closest;

                if (next && closest.dist < bridge) {
                    if (debug) console.log({
                        rollup: root.slice(),
                        next: next.slice(),
                        reverse,
                        swap
                    });
                    if (reverse) {
                        reverse.reverse();
                    }
                    if (swap) {
                        next.appendAll(root);
                        connect[i] = next;
                        connect[swap] = root;
                        root.delete = true;
                        next.merged = true;
                    } else {
                        root.appendAll(next);
                        next.delete = true;
                        root.merged = true;
                    }
                } else {
                    break inner;
                }
            }
        }

        bridge = mingap < Infinity ? Math.max(mingap + 0.01, bridge + 0.1) : bridge + 0.1;
        if (debug) console.log({iter, bridge, mingap, bridgeMax});

    } while (iter-- > 0 && bridge && bridge < bridgeMax && mingap < bridgeMax);

    if (debug) console.log({ remain: connect.filter(c => !c.delete) });

    for (let array of connect) {
        if (array.delete) continue;

        if (debug) {
            let first = array[0];
            let last = array.peek();
            let dist = first.distToSq2D(last);
            console.log({
                dist: dist.round(4),
                merged: array.merged || false,
                array
            });
        }

        emit(newPolygon().addPoints(array));
    }

    if (debug) console.log({ emitted, output });
    if (debug && emitted < points.length) console.log({ leftovers:points.length - emitted });

    return output;
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
function removeDuplicateLines(lines) {
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
            return 0;
        }
        return l1.key < l2.key ? -1 : 1;
    });

    // associate points with their lines, cull deleted
    for (let line of lines) {
        if (!line.del) {
            tmplines.push(line);
            addLinesToPoint(line.p1, line);
            addLinesToPoint(line.p2, line);
        }
    }

    // merge collinear lines
    for (let point of points) {
        // only merge when point connects to exactly one other point
        if (point.group.length != 2) {
            continue;
        }
        let l1 = point.group[0],
            l2 = point.group[1];
        if (l1.isCollinear(l2)) {
            l1.del = true;
            l2.del = true;
            // find new endpoints that are not shared point
            let p1 = l1.p1 != point ? l1.p1 : l1.p2,
                p2 = l2.p1 != point ? l2.p1 : l2.p2,
                newline = newOrderedLine(p1,p2);
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
    }

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
    for (let line of tmplines) {
        if (!line.del) {
            output.push(line);
            line.p1.group = null;
            line.p2.group = null;
        }
    }

    return output;
}

gapp.overlay(base, {
    slice,
    sliceZ,
    slicePost: {},
    sliceDedup: removeDuplicateLines,
    sliceConnect
});

});
