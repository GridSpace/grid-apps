/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.point
// use: ext.clip2
// use: geo.slope
// use: geo.polygon
gapp.register("geo.polygons", [], (root, exports) => {

const { base } = root;
const { util, paths, config, newPoint } = base;
const { sqr, numOrDefault } = util;

const DEG2RAD = Math.PI / 180,
    SQRT = Math.sqrt,
    SQR = util.sqr,
    ABS = Math.abs;

const ClipperLib = self.ClipperLib,
    Clipper = ClipperLib.Clipper,
    ClipType = ClipperLib.ClipType,
    PolyType = ClipperLib.PolyType,
    PolyFillType = ClipperLib.PolyFillType,
    CleanPolygon = Clipper.CleanPolygon,
    CleanPolygons = Clipper.CleanPolygons,
    SimplifyPolygons = Clipper.SimplifyPolygons,
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

const POLYS = base.polygons = {
    clearInner,
    rayIntersect,
    alignWindings,
    setWinding,
    fillArea,
    subtract,
    flatten,
    offset,
    trimTo,
    expand,
    points,
    length,
    renest,
    route,
    union,
    inset,
    outer,
    inner,
    nest,
    diff,
    xor,
    setZ,
    filter,
    toClipper,
    fromClipperNode,
    fromClipperTree,
    fromClipperTreeUnion,
    cleanClipperTree,
    fingerprintCompare,
    fingerprint
};

function outer(polys) {
    for (let p of polys) {
        p.inner = undefined;
    }
    return polys;
}

function inner(polys) {
    const ret = [];
    for (let p of polys) {
        if (p.inner) {
            ret.push(p.inner);
        }
    }
    return ret;
}

function length(polys) {
    let length = 0;
    for (let p of polys) {
        length += p.deepLength;
    }
    return length;
}

function setZ(polys, z) {
    for (let poly of polys) {
        poly.setZ(z);
    }
    return polys;
}

function clearInner(polys) {
    for (let p of polys) {
        p.clearInner();
    }
}

function toClipper(polys = []) {
    let out = [];
    for (let poly of polys) {
        poly.toClipper(out);
    }
    return out;
}

function fromClipperNode(tnode, z) {
    let poly = base.newPolygon();
    for (let point of tnode.m_polygon) {
        poly.push(base.pointFromClipper(point, z));
    }
    poly.open = tnode.IsOpen;
    return poly;
};

function fromClipperTree(tnode, z, tops, parent, minarea) {
    let poly,
        polys = tops || [],
        min = numOrDefault(minarea, 0.1);

    for (let child of tnode.m_Childs) {
        poly = fromClipperNode(child, z);
        // throw out all tiny polygons
        if (!poly.open && poly.area() < min) {
            continue;
        }
        if (parent) {
            parent.addInner(poly);
        } else {
            polys.push(poly);
        }
        if (child.m_Childs) {
            fromClipperTree(child, z, polys, parent ? null : poly, minarea);
        }
    }

    return polys;
};

function fromClipperTreeUnion(tnode, z, minarea, tops, parent) {
    let polys = tops || [], poly;

    for (let child of tnode.m_Childs) {
        poly = fromClipperNode(child, z);
        if (!poly.open && minarea && poly.area() < minarea) {
            continue;
        }
        if (parent) {
            parent.addInner(poly);
        } else {
            polys.push(poly);
        }
        if (child.m_Childs) {
            fromClipperTreeUnion(child, z, minarea, polys, parent ? null : poly);
        }
    }

    return polys;
};

function cleanClipperTree(tree) {
    if (tree.m_Childs)
    for (let child of tree.m_Childs) {
        child.m_polygon = CleanPolygon(child.m_polygon, config.clipperClean);
        cleanClipperTree(child.m_Childs);
    }

    return tree;
};

function filter(array, output, fn) {
    for (let poly of array) {
        poly = fn(poly);
        if (poly) {
            if (Array.isArray(poly)) {
                output.appendAll(poly);
            } else {
                output.push(poly);
            }
        }
    }
    return output;
}

function points(polys) {
    return polys.length ? polys.map(p => p.deepLength).reduce((a,v) => a+v) : 0;
}

/**
 * redo nesting of polygons that might already have inners
 */
function renest(polygons, deep) {
    return nest(flatten(polygons, [], true), deep);
}

/**
 * todo use clipper polytree?
 *
 * use bounding boxes and sliceIntersection
 * to determine parent/child nesting. returns a
 * array of trees.
 *
 * @param {Polygon[]} polygon soup
 * @param {boolean} deep allow nesting beyond 2 levels
 * @param {boolean} opentop prevent open polygons from having inners
 * @returns {Polygon[]} top level parent polygons
 */
function nest(polygons, deep, opentop) {
    if (!polygons) {
        return polygons;
    }
    // sort groups by size
    polygons.sort(function (a, b) {
        return a.area() - b.area();
    });
    let i, poly;
    // clear parent/child links if they exist
    for (i = 0; i < polygons.length; i++) {
        poly = polygons[i];
        poly.parent = null;
        poly.inner = null;
    }
    // nest groups if fully contained by a parent
    for (i = 0; i < polygons.length - 1; i++) {
        poly = polygons[i];
        // find the smallest suitable parent
        for (let j = i + 1; j < polygons.length; j++) {
            let parent = polygons[j];
            // prevent open polys from having inners
            if (opentop && parent.isOpen()) {
                continue;
            }
            if (poly.isNested(parent)) {
                parent.addInner(poly);
                break;
            }
        }
    }
    // tops have an even # depth
    let tops = [],
        p;
    // assign a depth level to each group
    for (i = 0; i < polygons.length; i++) {
        p = polygons[i];
        poly = p;
        poly.depth = 0;
        while (p.parent) {
            poly.depth++;
            p = p.parent;
        }
        if (deep) {
            if (poly.depth === 0) tops.push(poly);
        } else {
            if (poly.depth % 2 === 0) {
                tops.push(poly);
            } else {
                poly.inner = null;
            }
        }
    }
    return tops;
}

/**
 * sets windings for parents one way
 * and children in opposition
 *
 * @param {Polygon[]} array
 * @param {boolean} CW
 * @param {boolean} [recurse]
 */
function setWinding(array, CW, recurse) {
    if (!array) return;
    let poly, i = 0;
    while (i < array.length) {
        poly = array[i++];
        if (poly.isClockwise() !== CW) poly.reverse();
        if (recurse && poly.inner) setWinding(poly.inner, !CW, false);
    }
    return array;
}

/**
 * ensure all polygons have the same winding direction.
 * try to use reversals that touch the fewest nodes.
 *
 * @param {Polygon[]} polys
 * @return {boolean} true if aligned clockwise
 */
function alignWindings(polys) {
    let len = polys.length,
        fwd = 0,
        pts = 0,
        i = 0,
        setCW,
        poly;
    while (i < len) {
        poly = polys[i++];
        pts += poly.length;
        if (poly.isClockwise()) fwd += poly.length;
    }
    i = 0;
    setCW = fwd > (pts/2);
    while (i < len) {
        poly = polys[i++];
        if (poly.isClockwise() != setCW) poly.reverse();
    }
    return setCW;
}

function setContains(setA, poly) {
    for (let i=0; i<setA.length; i++) {
        if (setA[i].contains(poly)) return true;
    }
    return false;
}

function flatten(polys, to, crush) {
    to = to || [];
    for (let poly of polys) {
        poly.flattenTo(to);
        if (crush) poly.inner = null;
    }
    return to;
}

/**
 * Diff two sets of polygons and return A-B, B-A.
 * no polygons in a given set can overlap ... only between sets
 *
 * @param {Polygon[]} setA
 * @param {Polygon[]} setB
 * @param {Polygon[]} outA
 * @param {Polygon[]} outB
 * @param {number} [z]
 * @param {number} [minArea]
 * @returns {Polygon[]} out
 */
function subtract(setA, setB, outA, outB, z, minArea, opt = {}) {
    let min = numOrDefault(minArea, 0.1),
        out = [];

    function filter(from, to = []) {
        from.forEach(function(poly) {
            if (poly.area() >= min) {
                to.push(poly);
                out.push(poly);
            }
        });
        return to;
    }

    if (opt.prof) {
        if (setA.length === 0 || setB.length === 0) {
            console.log('sub_zero', {setA, setB});
        }
        opt.prof.pin = (opt.prof.pin || 0) + points(setA) + points(setB);
        opt.prof.call = (opt.prof.call || 0) + 1;
    }

    // wasm diff currently doesn't seem to be any faster
    if (false && opt.wasm && geo.wasm) {
        let oA = outA ? [] : undefined;
        let oB = outB ? [] : undefined;
        geo.wasm.js.diff(setA, setB, z, oA, oB);
        if (oA) {
            outA.appendAll(filter(oA));
        }
        if (oB) {
            outB.appendAll(filter(oB));
        }
    } else {
        let clip = new Clipper(),
            tree = new PolyTree(),
            sp1 = toClipper(setA),
            sp2 = toClipper(setB);

        // more expensive? worth it?
        clip.StrictlySimple = true;
        if (outA) {
            clip.AddPaths(sp1, PathSubject, true);
            clip.AddPaths(sp2, PathClip, true);
            if (clip.Execute(ClipDiff, tree, FillEvenOdd, FillEvenOdd)) {
                cleanClipperTree(tree);
                filter(fromClipperTree(tree, z, null, null, min), outA);
            }
        }
        if (outB) {
            if (outA) {
                tree.Clear();
                clip.Clear();
            }
            clip.AddPaths(sp2, PathSubject, true);
            clip.AddPaths(sp1, PathClip, true);
            if (clip.Execute(ClipDiff, tree, FillEvenOdd, FillEvenOdd)) {
                cleanClipperTree(tree);
                filter(fromClipperTree(tree, z, null, null, min), outB);
            }
        }
    }

    if (opt.prof) {
        opt.prof.pout = (opt.prof.pout || 0) + points(out);
    }

    return out;
}

/**
 * Slice.doProjectedFills()
 * Print.init w/ brims
 *
 * clipper is natively less efficient at merging many polygons. this iterative
 * approach skips attempting to merge polys lacking overlapping bounding boxes
 * and can quickly check if the attempt to union two polys outputs the same
 * two input polys. the latter bit is the key to greater speed.
 *
 * @param {Polygon[]} polys
 * @returns {Polygon[]}
 */
 function union(polys, minarea, all, opt = {}) {
     if (polys.length < 2) return polys;
     let lpre = length(polys);

     if (opt.wasm && geo.wasm) {
         let min = minarea ?? 0.01;
         // let deepLength = polys.map(p => p.deepLength).reduce((a,v) => a+v);
         // if (deepLength < 15000)
         try {
             let out = geo.wasm.js.union(polys, polys[0].getZ()).filter(p => p.area() > min);
             opt.changes = length(out) - lpre;
             return out;
         } catch (e) {
             console.log({union_fail: polys, minarea, all});
         }
     }

     let out = polys.slice(), i, j, union, uset = [], a, b;

     outer: for (i=0; i<out.length; i++) {
         if (!out[i]) continue;
         for (j=i+1; j<out.length; j++) {
             if (!out[j]) continue;
             union = out[i].union(out[j], minarea, all);
             if (union && union.length) {
                 if (opt.onmerge) {
                     a = out[i];
                     b = out[j];
                 }
                 out[i] = null;
                 out[j] = null;
                 if (all) {
                     out.appendAll(union);
                 } else {
                     out.push(union);
                 }
                 if (opt.onmerge) {
                     opt.onmerge(a, b, union);
                 }
                 continue outer;
             }
         }
     }

     for (i=0; i<out.length; i++) {
         if (out[i]) uset.push(out[i]);
     }

     opt.changes = length(uset) - lpre;
     return uset;
 }

/**
 * @param {Polygon} poly clipping mask
 * @returns {?Polygon[]}
 */
function diff(setA, setB, z) {
    let clip = new Clipper(),
        tree = new PolyTree(),
        sp1 = toClipper(setA),
        sp2 = toClipper(setB);

    clip.AddPaths(sp1, PathSubject, true);
    clip.AddPaths(sp2, PathClip, true);

    if (clip.Execute(ClipDiff, tree, FillEvenOdd, FillEvenOdd)) {
        return fromClipperTree(tree, z);
    } else {
        return null;
    }
}

/**
 * @param {Polygon} poly clipping mask
 * @returns {?Polygon[]}
 */
 function xor(set, z) {
    z = z || set[0].getZ();
    outer: for (;;) {
        // sort largest to smallest area
        set.sort((a,b) => b.area() - a.area());
        for (let i=0; i<set.length; i++) {
            let p0 = set[i];
            for (let j=i+1; j<set.length; j++) {
                let p1 = set[j];
                // if polys overlap, xor and check result
                // if output differs from input, update set
                // and start from scratch
                if (p1.overlaps(p0) && p1.intersects(p0)) {
                    let xor = p0.xor(p1);
                    if (xor.length === 2) {
                        let same0 = Math.abs(p0.area() - xor[0].area()) + Math.abs(p1.area() - xor[1].area()) < 0.01;
                        let same1 = Math.abs(p1.area() - xor[0].area()) + Math.abs(p0.area() - xor[1].area()) < 0.01;
                        if (same0 || same1) {
                            continue;
                        }
                    }
                    // console.log({ p0, p1, xor, i, j });
                    set[i] = null;
                    set[j] = null;
                    set = set.filter(o => o);
                    set.appendAll(xor);
                    continue outer;
                }
            }
        }
        // exit when no change to set occur
        break;
    }
    return set;
}

/**
 * Slice.doProjectedFills()
 *
 * @param {Polygon[]} setA target set
 * @param {Polygon[]} setB mask set
 * @returns {Polygon[]}
 */
function trimTo(setA, setB) {
    // handle null/empty slices
    if (setA === setB || setA === null || setB === null) return null;

    let out = [], tmp;
    util.doCombinations(setA, setB, {}, function(a, b) {
        if (tmp = a.mask(b)) {
            out.appendAll(tmp);
        }
    });

    return out;
}

function sumCirc(polys) {
    let sum = 0.0;
    polys.forEach(function(poly) {
        sum += poly.circularityDeep();
    });
    return sum;
}

/**
 * @param {Polygon[]} polys
 * @param {number} distance offset
 * @param {number} [z] defaults to 0
 * @param {Polygon[]} [out] optional collector
 * @param {number} [count] offset passes (0 == until no space left)
 * @param {number} [distance2] after first offset pass
 * @param {Function} [collector] receives output of each pass
 * @returns {Polygon[]} last offset
 */
function expand(polys, distance, z, out, count, distance2, collector, min) {
    return offset(polys, [distance, distance2 || distance], {
        z, outs: out, call: collector, minArea: min, count, flat: true
    });
}

/**
 * offset an array of polygons by distance with options to recurse
 * and return resulting gaps from offsets for thin wall detection in
 * in FDM mode and uncleared areas in CAM mode.
 */
function offset(polys, dist, opts = {}) {
    let open = opts.open ? polys.filter(p => p.open) : [];
    if (open.length) {
        open = open.map(p => paths.pointsToPath(p.points, dist, true));
        open = open.map(p => base.newPolygon().setOpen().addPoints(p.right));
    }

    // do not use clipper to offset open lines
    polys = polys.filter(p => !p.open);

    // cause inner / outer polys to be reversed from each other
    alignWindings(polys);
    for (let poly of polys) {
        if (poly.inner) {
            setWinding(poly.inner, !poly.isClockwise());
        }
    }

    let orig = polys,
        count = numOrDefault(opts.count, 1),
        depth = numOrDefault(opts.depth, 0),
        clean = opts.clean !== false,
        simple = opts.simple !== false,
        fill = numOrDefault(opts.fill, FillNonZero),
        join = numOrDefault(opts.join, JoinType.jtMiter),
        type = numOrDefault(opts.type, EndType.etClosedPolygon),
        // if dist is array with values, shift out next offset
        offs = Array.isArray(dist) ? (dist.length > 1 ? dist.shift() : dist[0]) : dist,
        mina = numOrDefault(opts.minArea, 0.1),
        zed = opts.z || 0;

    if (opts.wasm && geo.wasm) {
        try {
            polys = geo.wasm.js.offset(polys, offs, zed, clean ? config.clipperClean : 0, simple ? 1 : 0);
            if (open.length) polys.appendAll(open);
        } catch (e) {
            console.log('wasm error', e.message || e);
            opts.wasm = false;
            return offset(polys, dist, opts);
        }
    } else {
        let coff = new ClipperOffset(opts.miter, opts.arc),
            tree = new PolyTree();

            // setup offset
        for (let poly of polys) {
            // convert to clipper format
            poly = poly.toClipper();
            if (clean) poly = CleanPolygons(poly, config.clipperClean);
            if (simple) poly = SimplifyPolygons(poly, fill);
            coff.AddPaths(poly, join, type);
        }
        // perform offset
        coff.Execute(tree, offs * config.clipper);
        // convert back from clipper output format
        polys = fromClipperTree(tree, zed, null, null, mina);
    }


    // if specified, perform offset gap analysis
    if (opts.gaps && polys.length) {
        let oneg = offset(polys, -offs, {
            fill: opts.fill, join: opts.join, type: opts.type, z: opts.z, minArea: mina
        });
        let suba = [];
        let diff = subtract(orig, oneg, suba, null, zed);
        opts.gaps.append(suba, opts.flat);
    }

    // if offset fails, consider last polygons as gap areas
    if (opts.gaps && !polys.length) {
        opts.gaps.append(orig, opts.flat);
    }

    // if specified, perform up to *count* successive offsets
    if (polys.length) {
        // ensure opts has offset accumulator array
        opts.outs = opts.outs || [];
        // store polys in accumulator
        opts.outs.append(polys, opts.flat);
        // callback for expand() compatibility
        if (opts.call) {
            opts.call(polys, count, depth);
        }
        // check for more offsets
        if (count > 1) {
            // decrement count, increment depth
            opts.count = count - 1;
            opts.depth = depth + 1;
            // call next offset
            offset(polys, dist, opts);
        }
    }

    let rez = opts.flat ? opts.outs : polys;
    if (open.length) rez.appendAll(open);
    return rez;
}

/**
 * progressive insetting that does inset + outset to debur as well
 * as performing subtractive analysis between initial layer shell (ref)
 * and last offset (cmp) to produce gap candidates (for thinfill)
 */
function inset(polys, dist, count, z, wasm) {
    let total = count;
    let layers = [];
    let ref = polys;
    let depth = 0;
    while (count-- > 0 && ref && ref.length) {
        let off = offset(ref, -dist, {z, wasm});
        let mid = offset(off, dist / 2, {z, wasm});
        let cmp = offset(off, dist, {z, wasm});
        let gap = [];
        let aref = ref.map(p => p.areaDeep()).reduce((a,p) => a +p);
        let cref = cmp.length ? cmp.map(p => p.areaDeep()).reduce((a,p) => a + p) : 0;
        // threshold subtraction to area deltas > 0.1 % to filter out false
        // positives where inset/outset are identical floating point error
        if (Math.abs(aref - cref) >  1 - (Math.abs(aref / cref) / 1000)) {
            subtract(ref, cmp, gap, null, z);
        }
        layers.push({idx: total-count, off, mid, gap});
        // fixup depth cues
        for (let m of mid) {
            m.depth = depth++;
            if (m.inner) {
                for (let mi of m.inner) {
                    mi.depth = m.depth;
                }
            }
        }
        ref = off;
    }
    return layers;
}

/**
 * todo use clipper opne poly clipping?
 *
 * @param {Polygon[]} polys
 * @param {number} angle (-90 to 90)
 * @param {number} spacing
 * @param {Polygon[]} [output]
 * @param {number} [minLen]
 * @param {number} [maxLen]
 * @returns {Point[]} supplied output or new array
 */
function fillArea(polys, angle, spacing, output, minLen, maxLen) {
    if (polys.length === 0) return;

    let i = 1,
        p0 = polys[0],
        zpos = p0.getZ(),
        bounds = p0.bounds.clone(),
        align = false,
        raySlope;

    // testing force to 90
    if (angle >= 1000) {
        align = true;
        angle -= 1000;
    }

    // ensure angle is in the -90:90 range
    angle = angle % 180;
    while (angle < -90) angle += 180;
    while (angle > 90) angle -= 180;

    // X,Y ray slope derived from angle
    raySlope = base.newSlope(0,0,
        Math.cos(angle * DEG2RAD) * spacing,
        Math.sin(angle * DEG2RAD) * spacing
    );

    // compute union of top boundaries
    while (i < polys.length) {
        bounds.merge(polys[i++].bounds);
    }

    // align start/end to multiples of spacing
    // only works with 0 and 90 degree angles :/
    if (align) {
        let mxo = bounds.minx / spacing;
        let myo = bounds.miny / spacing;
        mxo = mxo - (mxo | 0) + (mxo < 0 ? 1 : 0);
        myo = myo - (myo | 0) + (myo < 0 ? 1 : 0);
        bounds.minx -= mxo * spacing;
        bounds.miny -= myo * spacing;
        let Mxo = bounds.maxx / spacing;
        let Myo = bounds.maxy / spacing;
        Mxo = Mxo - (Mxo | 0) + (Mxo < 0 ? 1 : 0);
        Myo = Myo - (Myo | 0) + (Myo < 0 ? 1 : 0);
        bounds.maxx = bounds.maxx - Mxo * spacing + spacing;
        bounds.maxy = bounds.maxy - Myo * spacing + spacing;
    }

    // ray stepping is an axis from the line perpendicular to the ray
    let rayint = output || [],
        stepX = -raySlope.dy,
        stepY = raySlope.dx,
        iterX = ABS(ABS(stepX) > 0 ? bounds.width() / stepX : 0),
        iterY = ABS(ABS(stepY) > 0 ? bounds.height() / stepY : 0),
        dist = SQRT(SQR(iterX * stepX) + SQR(iterY * stepY)),
        step = SQRT(SQR(stepX) + SQR(stepY)),
        steps = dist / step,
        start = angle < 0 ? { x:bounds.minx, y:bounds.miny, z:zpos } : { x:bounds.maxx, y:bounds.miny, z:zpos },
        clip = new Clipper(),
        tree = new PolyTree(),
        minlen = base.config.clipper * (minLen || 0),
        maxlen = base.config.clipper * (maxLen || 0),
        lines = [];

    // store origin as start/affinity point for fill
    rayint.origin = newPoint(start.x, start.y, start.z);

    for (i = 0; i < steps; i++) {
        lines.push([
            {
                X: (start.x - raySlope.dx * 1000) * config.clipper,
                Y: (start.y - raySlope.dy * 1000) * config.clipper
            },{
                X: (start.x + raySlope.dx * 1000) * config.clipper,
                Y: (start.y + raySlope.dy * 1000) * config.clipper
            }
        ]);
        start.x += stepX;
        start.y += stepY;
    }

    clip.AddPaths(lines, PathSubject, false);
    clip.AddPaths(toClipper(polys), PathClip, true);

    lines = [];

    if (clip.Execute(ClipIntersect, tree, FillNonZero, FillEvenOdd)) {
        for (let poly of tree.m_AllPolys) {
            if (minlen || maxlen) {
                let plen = ClipperLib.JS.PerimeterOfPath(poly.m_polygon, false, 1);
                if (minlen && plen < minlen) continue;
                if (maxlen && plen > maxlen) continue;
            }
            let p1 = base.pointFromClipper(poly.m_polygon[0], zpos);
            let p2 = base.pointFromClipper(poly.m_polygon[1], zpos);
            let od = rayint.origin.distToLineNew(p1,p2) / spacing;
            lines.push([p1, p2, od]);
        }
    }

    lines.sort(function(a,b) {
        return a[2] - b[2];
    })

    for (let line of lines) {
        let dist = Math.round(line[2]);
        line[0].index = dist;
        line[1].index = dist;
        rayint.push(line[0]);
        rayint.push(line[1]);
    }

    return rayint;
}

/**
 * tracing a ray through a slice's polygons, find and return
 * a sorted list of all intersecting points.
 *
 * @param {Point} start
 * @param {Slope} slope
 * @param {Polygon[]} polygons
 * @param {boolean} [for_fill]
 * @returns {Point[]}
 */
function rayIntersect(start, slope, polygons, for_fill) {
    let i = 0,
        flat = [],
        points = [],
        conf = base.config,
        merge_dist = for_fill ? conf.precision_fill_merge : conf.precision_merge;
    // todo use new flatten() function above
    polygons.forEach(function(p) {
        p.flattenTo(flat);
    });
    polygons = flat;
    while (i < polygons.length) {
        let polygon = polygons[i++],
            pp = polygon.points,
            pl = pp.length;;
        for (let j = 0; j < pl; j++) {
            let j2 = (j + 1) % pl,
                ip = util.intersectRayLine(start, slope, pp[j], pp[j2]);
            if (ip) {
                // add group object to point for cull detection
                ip.group = polygon;
                // add point to point list
                points.push(ip);
                // if point is near a group endpoint, add position marker for culling
                if (ip.isNear(pp[j], merge_dist)) {
                    ip.pos = j;
                    ip.mod = pl;
                } else if (ip.isNear(pp[j2], merge_dist)) {
                    ip.pos = j2;
                    ip.mod = pl;
                }
            }
        }
    }
    if (points.length > 0) {
        let del = false;
        // sort on distance from ray origin
        points.sort(function (p1, p2) {
            // handle passing through line-common end points
            if (!(p1.del || p2.del) && p1.isNear(p2, merge_dist)) {
                let line = [];
                if (!p1.isNear(p1.p1, merge_dist)) line.push(p1.p1);
                if (!p1.isNear(p1.p2, merge_dist)) line.push(p1.p2);
                if (!p2.isNear(p2.p1, merge_dist)) line.push(p2.p1);
                if (!p2.isNear(p2.p2, merge_dist)) line.push(p2.p2);
                /**
                 * when true, points are coincident on collinear lines but
                 * not passing through endpoints on each. kill them. this case
                 * was added later. see below for what else can happen.
                 */
                if (line.length < 2) {
                    console.log("sliceInt: line common ep fail: "+line.length);
                } else
                if (line.length > 2) {
                    p1.del = true;
                    p2.del = true;
                } else
                /**
                 * when a ray intersects two equal points, they are either inside or outside.
                 * to determine which, we create a line from the two points connected to them
                 * and test intersect the ray with that line. if it intersects, the points are
                 * inside and we keep one of them. otherwise, they are outside and we drop both.
                 */
                if (!util.intersectRayLine(start, slope, line[0], line[1])) {
                    del = true;
                    p1.del = true;
                    p2.del = true;
                } else {
                    del = true;
                    p1.del = true;
                }
            }
            return p1.dist - p2.dist; // sort on 'a' dist from ray origin
        });
        /**
         * cull invalid lines between groups on same/different levels depending
         * ok = same level (even), same group
         * ok = same level (odd), diff group
         * ok = diff level (even-odd)
         */
        if (for_fill) {
            let p1, p2;
            i = 0;
            pl = points.length;
            while (i < pl) {
                p1 = points[i++];
                while (p1 && p1.del && i < pl) p1 = points[i++];
                p2 = points[i++];
                while (p2 && p2.del && i < pl) p2 = points[i++];
                if (p1 && p2 && p1.group && p1.group) {
                    let p1g = p1.group,
                        p2g = p2.group,
                        even = (p1g.depth % 2 === 0), // point is on an even depth group
                        same = (p1g === p2g); // points intersect same group
                    if (p1g.depth === p2g.depth) {
                        // TODO this works sometimes and not others
                        //if ((even && !same) || (same && !even)) {
                        //    p1.del = true;
                        //    p2.del = true;
                        //    del = true;
                        //}
                        // check cull co-linear with group edge
                        if (same && p1.mod && p2.mod) {
                            let diff = ABS(p1.pos - p2.pos);
                            if (diff === 1 || diff === p1.mod - 1) {
                                p1.del = true;
                                p2.del = true;
                                del = true;
                            }
                        }
                    }
                }
            }
        }
        // handle deletions, if found
        if (del) {
            let np = [];
            for (i = 0; i < points.length; i++) {
                let p = points[i];
                if (!p.del) {
                    np.push(p);
                }
            }
            points = np;
        }
    }
    return points;
}

function pd(a,b) {
    return a > b ? Math.abs(1-b/a) : Math.abs(1-a/b);
}

function fingerprint(polys) {
    let recs = flatten(polys).map(p => {
        return {
            l: p.length,
            a: p.area(),
            p: p.perimeter(),
            c: p.circularity(),
            b: p.bounds
        }
    });
    recs.sort((a,b) => {
        if (pd(a.a, b.a) > 0.005) {
            return b.a - a.a;
        }
        if (pd(a.p, b.p) > 0.005) {
            return b.p - a.p;
        }
        if (pd(a.c, b.c) > 0.02) {
            return b.c - a.c;
        }
        if (Math.abs(a.b.minx - b.b.minx) > 0.1) {
            return b.b.minx - a.b.minx;
        }
        return b.b.miny - a.b.miny;
    })
    return recs;
}

// compare fingerprint arrays
function fingerprintCompare(a, b) {
    // true if array is the same object
    if (a === b) {
        return true;
    }
    // fail on missing array
    if (!a || !b) {
        return false;
    }
    // require identical length arrays
    if (a.length !== b.length) {
        return false;
    }
    for (let i=0; i<a.length; i++) {
        let ra = a[i];
        let rb = b[i];
        // test poly area
        if (Math.abs(ra.a - rb.a) > 1) {
            return false;
        }
        // test circularity
        if (pd(ra.c, rb.c) > 0.02) {
            return false;
        }
        // test perimeter
        if (pd(ra.p, rb.p) > 0.005) {
            return false;
        }
        // test bounds
        if (ra.b.delta(rb.b) > 0.1) {
            return false;
        }
        // test poly point count
        if (a.length < 20 && pd(ra.l, rb.l) > 0.05) {
            return false;
        }
    }
    return true;
}

// plan a route through an array of polygon center points
// starting with the polygon center closest to "start"
function route(polys, start) {
    let centers = [];
    let first, minDist = Infinity;
    for (let poly of polys) {
        let center = poly.average();
        let rec = {poly, center, used: false};
        let dist = center.distTo2D(start);
        if (dist < minDist) {
            first = rec;
            minDist = dist;
        }
        centers.push(rec);
    }
    first.used = true;
    let routed = [ first ];
    for (;;) {
        let closest;
        let minDist = Infinity;
        for (let rec of centers) {
            if (!rec.used) {
                let dist = rec.center.distTo2D(first.center);
                if (dist < minDist) {
                    minDist = dist;
                    closest = rec;
                }
            }
        }
        if (!closest) {
            break;
        } else {
            closest.used = true;
            routed.push(first = closest);
        }
    }
    return routed.map(r => r.poly);
}

});
