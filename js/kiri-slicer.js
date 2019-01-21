/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_slicer = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.slicer) return;

    var slicer = self.kiri.slicer = {
        slice: slice,
        sliceWidget: sliceWidget
    };

    var KIRI = self.kiri,
        BASE = self.base,
        CONF = BASE.config,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        time = UTIL.time,
        newSlice = KIRI.newSlice,
        newOrderedLine = BASE.newOrderedLine;

    /**
     * Convenience method. Gets a Widget's points and calls slice()
     *
     * @param {Widget} widget
     * @param {Object} options
     * @param {Function} ondone callback when slicing complete
     * @param {Function} onupdate callback on incremental updates
     */
    function sliceWidget(widget, options, ondone, onupdate) {
        slice(widget.getPoints(), widget.getBoundingBox(), options, ondone, onupdate);
    }

    /**
     * Given an array of points as triples, a bounding box and a set of
     * slicing controls, emit an array of Slice objects to the ondone()
     * function. onupdate() will be called with two parameters (% completion
     * and an optional message) so that the UI can report progress to the user.
     *
     * @param {Array} points vertex array
     * @param {Bounds} bounds bounding box for points
     * @param {Object} options slicing parameters
     * @param {Function} ondone callback when slicing done
     * @param {Function} onupdate callback to report slicing progress
     */
    function slice(points, bounds, options, ondone, onupdate) {
        var topoMode = options.topo,
            ox = 0,
            oy = 0;

        // handle rotating meshes for CAM finishing.
        // slicer expects things just so, so we alter
        // geometry to satisfy
        if (options.swapX || options.swapY) {
            points = points.slice();

            var btmp = new THREE.Box3(),
                pref = {},
                cached;

            btmp.setFromPoints(points);
            if (options.swapX) ox = -btmp.max.x;
            if (options.swapY) oy = -btmp.max.y;

            // array re-uses points so we need
            // to be careful not to alter a point
            // more than once
            for (var p, index=0; index<points.length; index++) {
                p = points[index];
                cached = pref[p.key];
                // skip points already altered
                if (cached) {
                    points[index] = cached;
                    continue;
                }
                cached = p.clone();
                if (options.swapX) cached.swapXZ();
                else if (options.swapY) cached.swapYZ();
                cached.rekey();
                pref[p.key] = cached;
                points[index] = cached;
            }

            // update temp bounds from new points
            btmp.setFromPoints(points);
            for (var p, index=0; index<points.length; index++) {
                p = points[index];
                if (p.mod === 1) continue;
                p.mod = 1;
                p.z -= btmp.min.z;
            }

            // update temp bounds from points with altered Z
            btmp.setFromPoints(points);
            bounds = btmp;
        }

        var zMin = options.zmin || Math.floor(bounds.min.z),
            zMax = options.zmax || Math.ceil(bounds.max.z),
            zInc = options.height,
            zIncMin = options.minHeight,
            zIncFirst = options.firstHeight || zInc,
            zOff = true ? zInc / 2 : 0,
            zHeights = [],      // heights for zIndexes in adaptive mode
            zIndexes = [],      // auto-detected z slicing offsets (laser/cam)
            zOrdered = [],      // ordered list of Z vertices
            zList = {},         // list of z indices for auto slicing (laser)
            zFlat = {},         // area of z offset flat areas (cam)
            zScale,             // bucket span in z units
            timeStart = time(),
            slices = [],
            zSum = 0.0,
            buckets = [],
            i, j = 0, k, p1, p2, p3, px,
            CPRO = KIRI.driver.CAM.process;

        function countZ(z) {
            z = UTIL.round(z,5);
            zList[z] = (zList[z] || 0) + 1;
        }

        // gather z-index stats
        // these are used for auto-slicing in laser
        // and to flats detection in CAM mode
        for (i = 0; i < points.length;) {
            p1 = points[i++];
            p2 = points[i++];
            p3 = points[i++];
            zSum += (Math.abs(p1.z - p2.z) + Math.abs(p2.z - p3.z) + Math.abs(p3.z - p1.z));
            // laser auto-detect z slice points
            if (zInc === 0 || zIncMin) {
                countZ(p1.z);
                countZ(p2.z);
                countZ(p3.z);
            }
            // auto-detect flats for cam faces and to avoid slicing directly on flats
            if (p1.z === p2.z && p2.z === p3.z && p1.z > bounds.min.z) {
                var zkey = p1.z.toFixed(5),
                    area = Math.abs(UTIL.area2(p1,p2,p3)) / 2;
                if (!zFlat[zkey]) {
                    zFlat[zkey] = area;
                } else {
                    zFlat[zkey] += area;
                }
            }
        }

        /** bucket polygons into z-bounded groups */
        var bucketCount = Math.max(1, Math.ceil(zMax / (zSum / points.length)) - 1);

        zScale = 1 / (zMax / bucketCount);

        if (bucketCount > 1) {
            // create empty buckets
            for (i = 0; i < bucketCount + 1; i++) buckets.push([]);

            // copy triples into all matching z-buckets
            for (i = 0; i < points.length;) {
                p1 = points[i++];
                p2 = points[i++];
                p3 = points[i++];
                var zm = Math.min(p1.z, p2.z, p3.z),
                    zM = Math.max(p1.z, p2.z, p3.z),
                    bm = Math.floor(zm * zScale),
                    bM = Math.ceil(zM * zScale);
                for (j = bm; j < bM; j++) {
                    buckets[j].push(p1);
                    buckets[j].push(p2);
                    buckets[j].push(p3);
                }
            }
        }

        // we need Z ordered list for laser auto or adaptive fdm slicing
        if (zInc === 0 || zIncMin) {
            for (var key in zList) {
                if (!zList.hasOwnProperty(key)) continue;
                zOrdered.push(parseFloat(key));
            }
            zOrdered.sort(function(a,b) { return a - b});
        }

        // use Z indices in auto slice mode for laser
        if (zInc === 0) {
            // find unique z-index offsets for slicing
            var zl = zOrdered
            for (i = 0; i < zl.length - 1; i++) {
                zIndexes.push((zl[i] + zl[i+1]) / 2);
            }
        } else if (options.cam) {
            // re-divide slice height so that top and
            // bottom slices fall exactly on those faces
            zInc = (zMax - zMin) / (Math.floor(zMax / zInc) + 1);
            for (i = zMin; i < zMax; i += zInc) {
                zIndexes.push(i);
            }
            for (key in zFlat) {
                // todo make threshold for flat detection configurable
                if (!zFlat.hasOwnProperty(key) || zFlat[key] < 10) continue;
                if (!zIndexes.contains(key) && key >= zMin) zIndexes.push(parseFloat(key));
            }
            // sort top down
            zIndexes.sort(function(a,b) {
                return b-a;
            });
        } else if (zIncMin) {
            // FDM adaptive slicing
            var zPos = zMin + zIncFirst,
                zOI = 0,
                zDelta,
                zDivMin,
                zDivMax,
                zStep,
                nextZ;

            // first slice is fixed
            zHeights.push(zIncFirst);
            zIndexes.push(zIncFirst / 2);

            while (zPos < zMax && zOI < zOrdered.length) {
                nextZ = zOrdered[zOI++];
                if (zPos >= nextZ) continue;
                zDelta = nextZ - zPos;
                if (zDelta < zIncMin) continue;

                zDivMin = Math.floor(zDelta / zIncMin);
                zDivMax = Math.floor(zDelta / zInc);

                if (zDivMax && zDivMax < zDivMin) {
                    if (zDelta % zInc > 0.01) zDivMax++;
                    zStep = zDelta / zDivMax;
                } else {
                    zStep = zDelta;
                }

                while (zPos < nextZ) {
                    zHeights.push(zStep);
                    zIndexes.push(zPos + zStep / 2);
                    zPos += zStep;
                }
            }
        } else {
            // FDM fixed slicing
            if (options.firstHeight) {
                zIndexes.push(options.firstHeight / 2);
                zHeights.push(options.firstHeight);
                zMin = options.firstHeight;
            }
            for (i = zMin + zOff; i < zMax; i += zInc) {
                zIndexes.push(i);
                zHeights.push(zInc);
            }
        }

        // create a Slice for each z offset in the zIndexes array
        for (var i = 0; i < zIndexes.length; i++) {
            // slice next layer and add to slices[] array
            sliceZ(zIndexes[i], zHeights[i]);
            onupdate(i / zIndexes.length);
        }

        // for cam, mark top and bottom as mandatory (hasFlats)
        if (options.cam && slices.length > 0) {
            slices[0].hasFlats = true;
            slices[slices.length-1].hasFlats = true;
        }

        // connect slices into linked list for island/bridge projections
        for (i=1; i<slices.length; i++) {
            slices[i-1].up = slices[i];
            slices[i].down = slices[i-1];
        }

        slices.slice_time = time() - timeStart;

        // pass Slices array back to ondone function
        ondone(slices);

        /** ***** SLICING FUNCTIONS ***** */

        /**
         * given a point, append to the correct
         * 'where' objec tarray (on, over or under)
         *
         * @param {Point} p
         * @param {number} z offset
         * @param {Obejct} where
         */
        function checkUnderOverOn(p, z, where) {
            var delta = p.z - z;
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
            var ip = [];
            for (var i = 0; i < over.length; i++) {
                for (var j = 0; j < under.length; j++) {
                    ip.push(over[i].intersectZ(under[j], z));
                }
            }
            return ip;
        }

        /**
         * Ensure points are unique with a cache/key algorithm
         */
        function getCachedPoint(phash, p) {
            var cached = phash[p.key];
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
            var line = newOrderedLine(p1,p2);
            line.coplanar = coplanar || false;
            line.edge = edge || false;
            return line;
        }

        /**
         * process a single z-slice on a single mesh and
         * add to slices array
         *
         * @param {number} z
         * @param {number} [height] optional real height (fdm)
         */
        function sliceZ(z, height) {
            var phash = {},
                lines = [],
                onflat = zFlat[z.toFixed(5)] > 0,
                slice = newSlice(z, options.view ? options.view.newGroup() : null),
                bucket = bucketCount == 1 ? points : buckets[Math.floor(z * zScale)];

            if (!bucket) return;

            if (onflat) {
                // annotate slices with cam flats for finishing waterlines
                if (options.cam) slice.hasFlats = true;
                z += 0.001;
            }

            // iterate over matching buckets for this z offset
            for (var i = 0; i < bucket.length;) {
                p1 = bucket[i++];
                p2 = bucket[i++];
                p3 = bucket[i++];
                var where = {under: [], over: [], on: []};
                checkUnderOverOn(p1, z, where);
                checkUnderOverOn(p2, z, where);
                checkUnderOverOn(p3, z, where);
                if (where.under.length === 3 || where.over.length === 3) {
                    // does not intersect
                } else if (where.on.length === 2) {
                    // one side of triangle is on the Z plane
                    lines.push(makeZLine(phash, where.on[0], where.on[1], false, true));
                } else if (where.on.length === 3) {
                    // triangle is coplanar with Z
                    //lines.push(makeZLine(phash, where.on[0], where.on[1], true));
                    //lines.push(makeZLine(phash, where.on[1], where.on[2], true));
                    //lines.push(makeZLine(phash, where.on[2], where.on[0], true));
                } else if (where.under.length === 0 || where.over.length === 0) {
                    // does not intersect (but one point is on the plane)
                } else {
                    // compute two point intersections and construct line
                    var line = intersectPoints(where.over, where.under, z);
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

            // allow empty slices in CAM swap mode (for topos w/ gaps)
            if (lines.length == 0 && !(options.swapX || options.swapY)) return;

            slice.height = height;
            slice.index = slices.length;
            slice.lines = removeDuplicateLines(lines);

            // for topo slices, we just need the raw lines
            if (!topoMode) {
                slice.groups = connectLines(slice.lines, slices.length);
                POLY.nest(slice.groups).forEach(function(top) { slice.addTop(top) });
            }

            // fixup un-rotates polygons for CAM
            if (options.swapX || options.swapY) {
                var move = {x:ox, y:oy, z:0};
                slice.camMode = options.swapX ? CPRO.FINISH_X : CPRO.FINISH_Y;
                if (topoMode) {
                    var lines = slice.lines, llen = lines.length, idx, line;
                    // shared points causing problems
                    for (idx=0; idx<llen; idx++) { line = lines[idx];
                        line.p1 = line.p1.clone();
                        line.p2 = line.p2.clone();
                    }
                    for (idx=0; idx<llen; idx++) { line = lines[idx];
                        if (options.swapX) {
                            line.p1.swapXZ();
                            line.p2.swapXZ();
                        } else {
                            line.p1.swapYZ();
                            line.p2.swapYZ();
                        }
                        line.p1.move(move);
                        line.p2.move(move);
                    }
                } else {
                    slice.tops.forEach(function(top) {
                        top.poly.swap(options.swapX, options.swapY);
                        top.poly.move(move);
                        top.poly.inner = null;
                    });
                    drape(slice, options.swapX, options.swapY);
                }
            }

            slices.push(slice);
        }
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
    function connectLines(input, index) {
        // map points to all other points they're connected to
        var DBUG = BASE.debug,
            CONF = BASE.config,
            pmap = {},
            points = [],
            output = [],
            connect = [],
            search = 1,
            nextMod = 1,
            bridge = CONF.bridgeLineGapDistance,
            p1, p2;

        function cachedPoint(p) {
            var cp = pmap[p.key];
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
            var idx, len = path.length;
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
            var stack = [ ];
            if (paths.length > 10000) {
                DBUG.log("excessive path options @ "+paths.length+" #"+input.length);
                return;
            }
            for (;;) {
                stack.push(point);

                var last = point,
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

            for (var i=0; i<stack.length; i++) stack[i].del = false;
            // stack.forEach(function(p) { p.del = false });
        }

        // emit a polygon if it can be cleaned and still have 2 or more points
        function emit(poly) {
            poly = poly.clean();
            if (poly.length > 2) output.push(poly.clean());
            // if (poly.length > 2) output.push(poly);
        }

        // given an array of paths, emit longest to shortest
        // eliminating points from the paths as they are emitted
        // shorter paths any point eliminated are eliminated as candidates.
        function emitLongestAsPolygon(paths) {
            var longest = null,
                emitted = 0,
                closed = 0,
                open = 0;

            paths.forEach(function(path, index) {
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
                    if (path.length < 3) return;
                    var len = path.length, i;
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

        // create point map, unique point list and point group arrays
        input.forEach(function(line) {
            p1 = cachedPoint(line.p1.round(7));
            p2 = cachedPoint(line.p2.round(7));
            addConnected(p1,p2);
            addConnected(p2,p1);
        });

        // first trace paths starting at dangling endpoinds (bad polygon soup)
        points.forEach(function(point) {
            // must not have been used and be a dangling end
            if (point.pos === 0 && point.group.length === 1) {
                var path = [],
                    paths = [];
                findPathsMinRecurse(point, path, paths);
                if (paths.length > 0) emitLongestAsPolygon(paths);
            }
        });

        // for each point, find longest path back to self
        points.forEach(function(point) {
            // must not have been used or be at a split
            if (point.pos === 0 && point.group.length === 2) {
                var path = [],
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
        for (var i=0; i<connect.length; i++) {

            var array = connect[i],
                last = array[array.length-1],
                tmp, dist, j;

            if (!bridge) {
                emit(BASE.newPolygon().addPoints(array).setOpen());
                continue;
            }

            if (array.delete) continue;

            loop: for (var merged=0;;) {
                var closest = { dist:Infinity };
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
                    emit(BASE.newPolygon().addPoints(array));
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
    function removeDuplicateLines(lines) {
        var output = [],
            tmplines = [],
            points = [],
            pmap = {};

        function cachePoint(p) {
            var cp = pmap[p.key];
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
            var l1 = point.group[0],
                l2 = point.group[1];
            if (l1.isCollinear(l2)) {
                l1.del = true;
                l2.del = true;
                // find new endpoints that are not shared point
                var p1 = l1.p1 != point ? l1.p1 : l1.p2,
                    p2 = l2.p1 != point ? l2.p1 : l2.p2,
                    newline = base.newOrderedLine(p1,p2);
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

})();
