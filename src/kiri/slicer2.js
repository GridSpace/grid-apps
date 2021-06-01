/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        CONF = BASE.config,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        newSlice = KIRI.newSlice,
        newOrderedLine = BASE.newOrderedLine;

    class Slicer {
        constructor(points, options) {
            this.options = {};
            if (points) {
                this.setPoints(points, options);
            }
        }

        // notopok = when genso set, allow empty top array
        // emptyok = allow empty slices
        // openok = allow open tops
        // swapX = swap X/Z
        // swapY = sawp Y/Z
        // zList = generate list of z vertices
        // zline = generate list of z vertices with coplanar lines
        // trace = find z coplanar trace lines
        // flatoff = amount to offset z when slicing on detected flats
        // genso = generate a slice object with tops
        // each = call for each slice generated from an interval
        setOptions(options) {
            Object.assign(this.options, options || {});
            return this.options;
        }

        setPoints(points, options) {
            this.bounds = null;
            this.points = this.swap(points, options);
            this.zFlat = {}; // accumulated flat area at z height
            this.zLine = {}; // count of z coplanar lines
            this.zList = {}; // count of z values for auto slicing
            this.zSum = 0;   // used in bucketing calculations
            return this
                .computeBounds()
                .computeFeatures()
                .computeBuckets();
        }

        computeBounds() {
            if (!this.bounds) {
                this.bounds = new THREE.Box3();
                this.bounds.setFromPoints(this.points);
            }
            return this;
        }

        // gather z-index stats
        // these are used for auto-slicing in laser
        // and to flats detection in CAM mode
        computeFeatures(options) {
            const opt = this.setOptions(options);
            const points = this.points;
            const bounds = this.bounds;
            const zFlat = this.zFlat;
            const zLine = this.zLine;
            const zList = this.zList;

            function countZ(z) {
                z = z.round(5);
                zList[z] = (zList[z] || 0) + 1;
            }

            for (let i = 0, il = points.length; i < il; ) {
                let p1 = points[i++];
                let p2 = points[i++];
                let p3 = points[i++];
                // used in bucket calculations
                this.zSum += (Math.abs(p1.z - p2.z) + Math.abs(p2.z - p3.z) + Math.abs(p3.z - p1.z));
                // count occurrences of z values for auto slicing
                if (opt.zlist) {
                    countZ(p1.z);
                    countZ(p2.z);
                    countZ(p3.z);
                }
                // use co-flat and co-line detection to adjust slice Z
                if (p1.z === p2.z && p2.z === p3.z) {
                    // detect zFlat faces to avoid slicing directly on them
                    let zkey = p1.z.toFixed(5),
                        area = Math.abs(UTIL.area2(p1,p2,p3)) / 2;
                    if (!zFlat[zkey]) {
                        zFlat[zkey] = area;
                    } else {
                        zFlat[zkey] += area;
                    }
                } else if (opt.zline) {
                    // detect zLine (curved region tops/bottoms)
                    // in cam used for ball and v mill tracing
                    if (p1.z === p2.z) {
                        let zkey = p1.z.toFixed(5);
                        let zval = zLine[zkey];
                        zLine[zkey] = (zval || 0) + 1;
                    }
                    if (p2.z === p3.z) {
                        let zkey = p2.z.toFixed(5);
                        let zval = zLine[zkey];
                        zLine[zkey] = (zval || 0) + 1;
                    }
                    if (p3.z === p1.z) {
                        let zkey = p3.z.toFixed(5);
                        let zval = zLine[zkey];
                        zLine[zkey] = (zval || 0) + 1;
                    }
                }
            }

            return this;
        }

        /**
         * bucket polygons into z-bounded groups (inside or crossing)
         * to reduce the search space in complex models
         */
        computeBuckets() {
            let zSum = this.zSum;
            let zMax = this.bounds.max.z;
            let points = this.points;
            let bucketCount = Math.max(1, Math.ceil(zMax / (zSum / points.length)) - 1);
            let zScale = this.zScale = 1 / (zMax / bucketCount);
            let buckets = this.buckets = [];

            if (bucketCount > 1) {
                // create empty buckets
                for (let i = 0; i <= bucketCount + 1; i++) {
                    buckets.push([]);
                }

                // copy triples into all matching z-buckets
                for (let i = 0, il = points.length; i < il; ) {
                    let p1 = points[i++],
                        p2 = points[i++],
                        p3 = points[i++],
                        zm = Math.min(p1.z, p2.z, p3.z),
                        zM = Math.max(p1.z, p2.z, p3.z),
                        bm = Math.floor(zm * zScale),
                        bM = Math.ceil(zM * zScale);
                    for (let j = bm; j <= bM; j++) {
                        buckets[j].push(p1);
                        buckets[j].push(p2);
                        buckets[j].push(p3);
                    }
                }
            }
            return this;
        }

        // slice through points at given Z and return polygons
        slice(z, options, index, total, mark) {
            const opt = this.setOptions(options);

            // if Z is supplied as an array, iterate and collect
            if (Array.isArray(z)) {
                const mark = UTIL.time();
                const rarr = [];
                z.forEach((zv,zi) => {
                    const data = this.slice(zv, opt, zi, z.length, mark);
                    if (data) {
                        rarr.push(data);
                    }
                });
                return rarr;
            }

            let znorm = z.toFixed(5),
                flatoff = UTIL.numOrDefault(opt.flatoff, 0.01),
                onflat = this.zFlat[znorm],
                edges = opt.edges || false,
                over = opt.over || false,
                phash = {},
                lines = [],
                zScale = this.zScale,
                buckets = this.buckets,
                bucket = buckets.length ? buckets[Math.floor(z * zScale)] : this.points;

            // compensate by moving z by "flatoff" on flats
            if (onflat) {
                z += flatoff;
            }

            if (!bucket) {
                console.log({no_bucket_for_z: z});
                return;
            }

            // iterate over matching buckets for this z offset
            for (let i = 0, il = bucket.length; i < il; ) {
                let p1 = bucket[i++];
                let p2 = bucket[i++];
                let p3 = bucket[i++];
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
                    if ((over && where.over.length === 1) || (!over && where.under.length === 1)) {
                        lines.push(makeZLine(phash, where.on[0], where.on[1], false, true));
                    }
                } else if (where.on.length === 3) {
                    // triangle is coplanar with Z
                    // we drop these because this face is attached to 3 others
                    // that will satisfy the if above (line) with 2 points
                } else if (where.under.length === 0 || where.over.length === 0) {
                    // does not intersect but one point is on the slice Z plane
                } else if (!edges) {
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

            let retn = { z };

            if (lines.length) {
                const debug = false;
                retn.lines = removeDuplicateLines(lines, debug);
                let polys = connectLines(retn.lines, opt, debug);
                retn.tops = POLY.nest(polys);

                if (opt.swapX || opt.swapY) {
                    this.unswap(opt.swapX, opt.swapY, retn.lines, retn.tops);
                }

                if (opt.genso) {
                    retn.slice = newSlice(z).addTops(retn.tops);
                    retn.slice.lines = retn.lines;
                    retn.slice.groups = retn.tops;
                }
            }

            const haslines = lines.length || opt.emptyok;
            const hastops = !opt.genso || opt.notopok || (retn.tops && retn.tops.length) || edges;

            if (opt.each && haslines && hastops) {
                opt.each(retn, index, total, UTIL.time() - mark);
            }

            return haslines && hastops ? retn : null;
        }

        swap(points, options) {
            const opt = this.setOptions(options);

            if (!(opt && (opt.swapX || opt.swapY))) {
                return points;
            }

            let btmp = new THREE.Box3(),
                pref = {},
                cached;

            points = points.slice();
            btmp.setFromPoints(points);
            if (opt.swapX) this.ox = -btmp.max.x;
            if (opt.swapY) this.oy = -btmp.max.y;

            // array re-uses points so we need
            // to be careful not to alter a point
            // more than once
            for (let p, index=0; index<points.length; index++) {
                p = points[index];
                cached = pref[p.key];
                // skip points already altered
                if (cached) {
                    points[index] = cached;
                    continue;
                }
                cached = p.clone();
                if (opt.swapX) cached.swapXZ();
                if (opt.swapY) cached.swapYZ();
                cached.rekey();
                pref[p.key] = cached;
                points[index] = cached;
            }

            // update temp bounds from new points
            btmp.setFromPoints(points);
            for (let p, index=0; index<points.length; index++) {
                p = points[index];
                if (p.mod === 1) continue;
                p.mod = 1;
                p.z -= btmp.min.z;
            }

            // update temp bounds from points with altered Z
            btmp.setFromPoints(points);
            this.bounds = btmp;

            return points;
        }

        unswap(swapX, swapY, lines, polys) {
            let move = {x: this.ox || 0, y: this.oy || 0, z: 0};

            // unswap lines
            let llen = lines.length,
                idx, line;

            // shared points causing problems
            for (idx=0; idx<llen; idx++) {
                line = lines[idx];
                line.p1 = line.p1.clone();
                line.p2 = line.p2.clone();
            }

            for (idx=0; idx<llen; idx++) {
                line = lines[idx];
                if (swapX) {
                    line.p1.swapXZ();
                    line.p2.swapXZ();
                }
                if (swapY) {
                    line.p1.swapYZ();
                    line.p2.swapYZ();
                }
                line.p1.move(move);
                line.p2.move(move);
            }

            polys.forEach(poly => {
                poly.swap(swapX, swapY);
                poly.move(move);
            });
        }

        interval(step, options) {
            let opt = options || {},
                bounds = this.bounds,
                boff = opt.boff || opt.off || 0, // bottom offset
                toff = opt.toff || opt.off || 0, // top offset
                zmin = (opt.min || this.bounds.min.z) + boff,
                zmax = (opt.max || this.bounds.max.z) - toff,
                steps = (zmax - zmin) / step,
                rem = steps % 1 != 0 ? 0 : 1,
                count = Math.floor(steps) + rem,
                array = [];

            if (opt.fit) {
                count++;
                step = (zmax - zmin) / count;
            }
            if (opt.down) {
                for (let i=0; i<count; i++) {
                    array.push(zmax);
                    zmax -= step;
                }
            } else {
                for (let i=0; i<count; i++) {
                    array.push(zmin);
                    zmin += step;
                }
            }

            if (opt.fit) {
                array.push(opt.down ? zmax : zmin);
            }

            if (opt.flats && opt.off) {
                let add = [];
                Object.keys(this.zFlat).forEach(z => {
                    z = parseFloat(z);
                    add.push(z + opt.off);
                    if (z > zmin) {
                        add.push(z - opt.off);
                    }
                });
                // add over and under all flats by 'off'
                array.appendAll(add).sort((a,b) => {
                    return opt.down ? b-a : a-b;
                });
            }

            return array.map(v => Math.abs(parseFloat(v.toFixed(5))));
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
        if (Math.abs(delta) < CONF.precision_slice_z) { // on
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
     * Given an array of input lines (line soup), find the path through
     * joining line ends that encompasses the greatest area without self
     * interesection.  Eliminate used points and repeat.  Unjoined lines
     * are permitted and handled after all other cases are handled.
     *
     * @param {Line[]} input
     * @param {number} [index]
     * @returns {Array}
     */
    function connectLines(input, opt = {}, debug) {
        // map points to all other points they're connected to
        let CONF = BASE.config,
            pmap = {},
            points = [],
            output = [],
            connect = [],
            search = 1,
            nextMod = 1,
            bridge = CONF.bridgeLineGapDistance,
            minPoly = opt.openok ? 2 : 3,
            p1, p2;

        function cachedPoint(p) {
            let cp = pmap[p.key];
            if (cp) return cp;
            points.push(p);
            pmap[p.key] = p;
            p.mod = nextMod++; // unique seq ID for points
            p.toString = function() { return this.mod }; // point array concat
            return p;
        }

        function addConnected(p1, p2) {
            if (!p1.group) p1.group = [ p2 ];
            else p1.group.push(p2);
        }

        function sliceAtTerm(path, term) {
            let idx, len = path.length;
            for (idx = 0; idx < len-1; idx++) {
                if (path[idx] === term) {
                    return path.slice(idx);
                }
            }
            return path;
        }

        /**
         * using minimal recursion, follow points through connected lines
         * to form candidate output paths.
         */
        function findPathsMinRecurse(point, path, paths, from) {
            let stack = [ ];
            if (paths.length > 100000) {
                console.log("excessive path options @ "+paths.length+" #"+input.length);
                return;
            }
            for (;;) {
                stack.push(point);

                let last = point,
                    links = point.group;

                path.push(point);
                // use del to mark traversed path
                point.del = true;
                // set so point isn't used in another polygon search
                point.pos = search++;
                // seed path with two points to prevent redundant opposing seeks
                if (path.length === 1) {
                    from = point;
                    point = links[0];
                    continue;
                }

                if (links.length > 2) {
                    // TODO optimize when > 2 and limit to left-most and right-most branches
                    // for now, pursue all possible branches
                    links.forEach(function(nextp) {
                        // do not backtrack
                        if (nextp === from) {
                            return;
                        }
                        if (nextp.del) {
                            paths.push(sliceAtTerm(path,nextp));
                        } else {
                            findPathsMinRecurse(nextp, path.slice(), paths, point);
                        }
                    });
                    break;
                } else {
                    point = links[0] === from ? links[1] : links[0];
                    from = last;
                    // hit an open end
                    if (!point) {
                        path.open = true;
                        paths.push(path);
                        break;
                    }
                    // hit a point previously in the path (or start)
                    if (point.del) {
                        paths.push(sliceAtTerm(path,point));
                        break;
                    }
                }
            }

            for (let i=0; i<stack.length; i++) stack[i].del = false;
            // stack.forEach(function(p) { p.del = false });
        }

        // emit a polygon if it can be cleaned and still have 2 or more points
        function emit(poly) {
            poly = poly.clean();
            if (poly.length === 2 && opt.openok) poly.setOpen();
            if (poly.length >= minPoly) output.push(poly);
        }

        // given an array of paths, emit longest to shortest
        // eliminating points from the paths as they are emitted
        // shorter paths any point eliminated are eliminated as candidates.
        function emitLongestAsPolygon(paths) {
            let longest = null,
                emitted = 0,
                closed = 0,
                open = 0;

            paths.forEach(function(path) {
                // use longest perimeter vs longest path?
                if (!longest || path.length > longest.length) longest = path;
                if (!path.open) closed++; else open++;
            });

            // it gets more complicated with multiple possible output paths
            if (closed > 1 && open === 0) {
                // add polygon to path (for area sorting)
                paths.forEach(function(path) { path.poly = BASE.newPolygon().addPoints(path) });

                // sort descending by area VS (length below -- better in most cases)
                // paths.sort(function(a,b) { return b.poly.area() - a.poly.area() });

                // sort descending by length
                paths.sort(function(a,b) { return b.poly.length - a.poly.length });

                // emit polygons largest to smallest
                // omit polygon if it intersects previously emitted (has del points)
                paths.forEach(function(path) {
                    if (path.length < minPoly) return;
                    let len = path.length, i;
                    for (i = 0; i < len; i++) if (path[i].del) return;
                    for (i = 0; i < len; i++) path[i].del = true;
                    emit(path.poly);
                    emitted++;
                });
            } else {
                if (longest.open) {
                    connect.push(longest);
                } else {
                    emit(BASE.newPolygon().addPoints(longest));
                }
            }
        }

        if (debug) console.log('map', input);

        // create point map, unique point list and point group arrays
        input.forEach(function(line) {
            p1 = cachedPoint(line.p1.round(5));
            p2 = cachedPoint(line.p2.round(5));
            addConnected(p1,p2);
            addConnected(p2,p1);
        });

        // first trace paths starting at dangling endpoinds (bad polygon soup)
        points.forEach(function(point) {
            // must not have been used and be a dangling end
            if (point.pos === 0 && point.group.length === 1) {
                let path = [],
                    paths = [];
                findPathsMinRecurse(point, path, paths);
                if (debug) console.log('dangle', {point, path, paths});
                if (paths.length > 0) emitLongestAsPolygon(paths);
            }
        });

        // for each point, find longest path back to self
        points.forEach(function(point) {
            // must not have been used or be at a split
            if (point.pos === 0 && point.group.length === 2) {
                let path = [],
                    paths = [];
                findPathsMinRecurse(point, path, paths);
                if (paths.length > 0) emitLongestAsPolygon(paths);
            }
        });

        // return true if points are deemed "close enough" close a polygon
        function close(p1,p2) {
            return p1.distToSq2D(p2) <= 0.01;
        }

        // reconnect dangling/open polygons to closest endpoint
        for (let i=0; i<connect.length; i++) {

            let array = connect[i],
                last = array[array.length-1],
                tmp, dist, j;

            if (!bridge) {
                if (opt.openok) {
                    emit(BASE.newPolygon().addPoints(array).setOpen());
                }
                continue;
            }

            if (array.delete) continue;

            loop: for (let merged=0;;) {
                let closest = { dist:Infinity };
                for (j=i+1; j<connect.length; j++) {
                    tmp = connect[j];
                    if (tmp.delete) continue;
                    dist = last.distToSq2D(tmp[0]);
                    if (dist < closest.dist && dist <= bridge) {
                        closest = {
                            dist: dist,
                            array: tmp
                        }
                    }
                    dist = last.distToSq2D(tmp[tmp.length-1]);
                    if (dist < closest.dist && dist <= bridge) {
                        closest = {
                            dist: dist,
                            array: tmp,
                            reverse: true
                        }
                    }
                }

                if (tmp = closest.array) {
                    if (closest.reverse) tmp.reverse();
                    tmp.delete = true;
                    array.appendAll(tmp);
                    last = array[array.length-1];
                    merged++;
                    // tail meets head (closed)
                    if (close(array[0], last)) {
                        emit(BASE.newPolygon().addPoints(array));
                        break loop;
                    }
                } else {
                    // no more closest polys (open set)
                    if (opt.openok) {
                        emit(BASE.newPolygon().addPoints(array).setOpen());
                    } else {
                        emit(BASE.newPolygon().addPoints(array));
                    }
                    break loop;
                }
            }
        }

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
                    newline = BASE.newOrderedLine(p1,p2);
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

    Slicer.checkOverUnderOn = checkOverUnderOn;
    Slicer.intersectPoints = intersectPoints;

    self.kiri.slicer2 = Slicer;

})();
