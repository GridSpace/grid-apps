/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/**
 * Slicing engine used by CAM
 */
// dep: kiri.slice
// dep: moto.broker
gapp.register("kiri-mode.cam.slicer", [], (root, exports) => {

const { base, kiri, moto } = root;
const { config, util, polygons, newOrderedLine, newPoint, newLine } = base;
const { sliceConnect, sliceDedup } = base;
const { newSlice } = kiri;

const POLY = polygons;
const timing = false;

const begin = function() {
    if (timing) console.time(...arguments);
};

const end = function() {
    if (timing) console.timeEnd(...arguments);
};

class Slicer {
    constructor(widget, options = { zlist: true, zline: true, lines: false }) {
        this.options = {};
        this.setOptions(options);
        if (widget) {
            this.setPoints(widget.getGeoVertices({ unroll: true, translate: true }));
            this.computeFeatures();
        }
    }

    get threaded() {
        return this.options.threaded;
    }

    // zList = generate list of z vertices
    // zline = generate list of z vertices with coplanar lines
    // trace = find z coplanar trace lines
    // flatoff = amount to offset z when slicing on detected flats
    // each = call for each slice generated from an interval
    setOptions(options) {
        Object.assign(this.options, options || {});
        return this.options;
    }

    setPoints(points) {
        this.bounds = null;
        this.points = points;
        this.zFlat = {}; // accumulated flat area at z height
        this.zLine = {}; // count of z coplanar lines
        this.zList = {}; // count of z values for auto slicing
        return this;
    }

    // gather z-index stats
    // these are used for auto-slicing in laser
    // and to flats detection in CAM mode
    computeFeatures(options) {
        begin('compute features');

        const opt = this.setOptions(options);
        const bounds = this.bounds = new THREE.Box3();
        const points = this.points;
        const zFlat = this.zFlat;
        const zLine = this.zLine;
        const zList = this.zList;

        function countZ(z) {
            z = z.round(5);
            zList[z] = (zList[z] || 0) + 1;
        }

        let p1 = newPoint(0,0,0),
            p2 = newPoint(0,0,0),
            p3 = newPoint(0,0,0);

        // for (let i = 0, il = points.length; i < il; i++) {
        //     points[i] = points[i].round(5);
        // }

        for (let i = 0, il = points.length; i < il; ) {
            p1.set(points[i++], points[i++], points[i++]);
            p2.set(points[i++], points[i++], points[i++]);
            p3.set(points[i++], points[i++], points[i++]);
            // update bounds
            bounds.expandByPoint(p1);
            bounds.expandByPoint(p2);
            bounds.expandByPoint(p3);
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
                    area = Math.abs(util.area2(p1,p2,p3)) / 2;
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

        end('compute features');
        // console.log({ bounds, zFlat, zLine, zList });

        return this;
    }

    // slice through points at given Z and return polygons
    async slice(zs, options) {
        const opt = this.setOptions(options);

        if (!Array.isArray(zs)) {
            throw "slice zs parameter must be ab array";
        }

        // sort Z and offset when on a flat
        const flatoff = util.numOrDefault(opt.flatoff, 0.01);
        zs = zs.sort((a,b) => a-b).map(z => {
            if (!flatoff) {
                return z;
            }
            const znorm = z.toFixed(5);
            return this.zFlat[znorm] ? z + flatoff : z;
        });

        // compute buckets from z slice list
        const { points } = this;
        const plen = points.length;
        const zlen = zs.length;
        const ppz = plen / zlen;
        const count = 25;//Math.ceil(ppz / 10000);
        const step = Math.ceil(zlen / count);
        const buckets = [];

        // console.log({ points, zs, count, step });

        for (let c = 0, b = 0; c < count; c++) {
            if (b >= zlen) break;
            buckets.push({
                zs: zs.slice(b, b + step),
                index: []
            });
            b += step;
        }

        let p1 = newPoint(0,0,0),
            p2 = newPoint(0,0,0),
            p3 = newPoint(0,0,0),
            ep = 0.001;

        begin("create buckets");
        for (let i = 0, il = points.length; i < il; ) {
            p1.set(points[i++], points[i++], points[i++]);
            p2.set(points[i++], points[i++], points[i++]);
            p3.set(points[i++], points[i++], points[i++]);
            let zmin = Math.min(p1.z, p2.z, p3.z);
            let zmax = Math.max(p1.z, p2.z, p3.z);
            for (let bucket of buckets) {
                const { zs, index } = bucket;
                const min = Math.min(...zs);
                const max = Math.max(...zs);
                if (zmin < min && zmax < min) {
                    if (Math.abs(zmin - min) > ep && Math.abs(zmax - min) > ep) {
                        continue;
                    }
                }
                if (zmin > max && zmax > max) {
                    if (Math.abs(zmin - max) > ep && Math.abs(zmax - max) > ep) {
                        continue;
                    }
                }
                index.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
            }
        }
        end("create buckets");

        // console.log({ zs, zlen, count, step, buckets, flatoff });

        begin("slicing");
        const { minions } = kiri;
        const threaded = minions && minions.running;
        const sliceFn = (threaded ? this.sliceBucketMinion : this.sliceBucket).bind(this);
        const track = { count: 0, total: zs.length };

        if (threaded) minions.broadcast("cam_slice_init", {});

        const promises = []
        for (let bucket of buckets) {
            promises.push(sliceFn(bucket, { ...opt, minZ: this.bounds.min.z }, slice => {
                track.count++;
                if (opt.progress) {
                    opt.progress(track.count, track.total);
                }
                // console.log({ oneach: slice, ...track });
            }));
        }
        const data = (await Promise.all(promises)).flat();

        data.sort((a,b) => b.z - a.z).forEach((rec, i) => {
            rec.tops = rec.polys;
            rec.slice = newSlice(rec.z).addTops(rec.tops);
            if (opt.each) {
                opt.each(rec, i, data.length);
            }
        });

        if (threaded) minions.broadcast("cam_slice_cleanup");
        end("slicing");

        return data;
    }

    async sliceBucketMinion(bucket, opt, oneach) {
        const { decode, decodePointArray } = kiri.codec;
        const slices = (await new Promise(resolve => {
            kiri.minions.queue({
                cmd: "cam_slice",
                opt: Object.clone(opt),
                bucket,
            }, resolve);
        })).slices;
        for (let slice of slices) {
            slice.polys = decode(slice.polys);
            if (slice.lines) {
                slice.lines = decodePointArray(slice.lines)
                    .group(2)
                    .map(arr => {
                        return newLine(arr[0], arr[1])
                    });
            }
            oneach(slice);
        }
        // console.log(bucket, slices);
        return slices;
    }

    async sliceBucket(bucket, opt, oneach) {
        const { zs, index } = bucket;
        const slices = [];
        for (let z of zs) {
            const slice = this.sliceZ(z, index, opt);
            if (slice) {
                slices.push(slice);
            }
            oneach(slice);
        }
        return slices;
    }

    sliceZ(z, indices, opt) {
        let links = opt.links !== false,
            dedup = opt.dedup !== false,
            edges = opt.edges || false,
            over = opt.over || z <= opt.minZ,
            debug = opt.debug,
            phash = {},
            lines = [];

        // const { points } = this,
        const points = indices,
            p1 = newPoint(0,0,0),
            p2 = newPoint(0,0,0),
            p3 = newPoint(0,0,0);

        for (let index = 0; index < points.length; ) {
            p1.set(points[index++], points[index++], points[index++]);
            p2.set(points[index++], points[index++], points[index++]);
            p3.set(points[index++], points[index++], points[index++]);

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
                    line.push(where.on[0].clone());
                }
                if (line.length === 2) {
                    lines.push(makeZLine(phash, line[0], line[1]));
                } else {
                    console.log({msg: "invalid ips", line: line, where: where});
                }
            }
        }

        if (dedup) {
            // console.log({ z, dedup: lines, points });
            lines = sliceDedup(lines, debug);
        }

        return lines.length ? { z,
            lines: opt.lines !== false ? lines : undefined,
            polys: links ? POLY.nest(sliceConnect(lines, opt, debug)) : undefined
        } : null;
    }

    interval(step, options) {
        let opt = options || {},
            bounds = this.bounds,
            boff = opt.boff || opt.off || 0, // bottom offset
            toff = opt.toff || opt.off || 0, // top offset
            zmin = opt.min !== undefined ? opt.min : bounds.min.z + boff,
            zmax = (opt.max || bounds.max.z) - toff,
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

        // filter duplicate values
        array = array.map(v => v.round(5)).filter((e,i,a) => i < 1 || a[i-1] !== a[i]);

        // return array.map(v => Math.abs(parseFloat(v.toFixed(5))));
        return array.map(v => parseFloat(v.toFixed(5)));
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
    p1 = getCachedPoint(phash, p1.clone());
    p2 = getCachedPoint(phash, p2.clone());
    let line = newOrderedLine(p1,p2);
    line.coplanar = coplanar || false;
    line.edge = edge || false;
    return line;
}

Slicer.checkOverUnderOn = checkOverUnderOn;
Slicer.intersectPoints = intersectPoints;

kiri.cam_slicer = Slicer;

moto.broker.subscribe("minion.started", msg => {
    const { funcs, cache, reply, log } = msg;

    funcs.cam_slice_init = () => {
        cache.slicer = new Slicer();
    };

    funcs.cam_slice_cleanup = () => {
        delete cache.slicer;
    };

    funcs.cam_slice = (data, seq) => {
        const { bucket, opt } = data;
        const { encode, encodePointArray } = kiri.codec;
        // log({ slice: bucket, opt });
        cache.slicer.sliceBucket(bucket, opt, slice => {
            // console.log({ slice });
        }).then(data => {
            data.forEach(rec => {
                rec.polys = encode(rec.polys);
                if (rec.lines) {
                    const points = rec.lines.map(l => [l.p1, l.p2]).flat();
                    rec.lines = encodePointArray(points);
                }
            });
            reply({ seq, slices: data });
        });
    };
});

});
