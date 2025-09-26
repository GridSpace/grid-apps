/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../../../ext/jspoly.js';
import { base } from '../../../geo/base.js';
import { newPolygon, Polygon } from '../../../geo/polygon.js';
import { polygons as POLY, fillArea } from '../../../geo/polygons.js';
import { getRangeParameters } from './driver.js';
import { slicer } from '../../../geo/slicer.js';
import { Point } from '../../../geo/point.js';
import { Slope } from '../../../geo/slope.js';

slicer.slicePost.FDM = slicePost;

/**
 * may run in minion or worker context. do not create objects
 * that will not quickly encode in threaded mode. add to existing
 * data object. return is ignored.
 */
export function slicePost(data, options) {
    const { z, lines, groups } = data;
    const { useAssembly, post_args, zIndexes } = options;
    const { process, isSynth, vaseMode } = post_args;
    const { shellOffset, fillOffset, clipOffset } = post_args;
    data.tops = POLY.nest(groups);
    if (isSynth) {
        const process = post_args.process;
        if (process.sliceSupportGrow > 0) {
            // expand synth supports here so they can be clipped later
            data.tops  = POLY.expand(data.tops, process.sliceSupportGrow, data.z, []);
        }
        // do not shell synth widgets because
        // they will be clipped against peers later
        // which requires shelling post-clip
        // but we still need to generate tops
        delete data.groups;
        return;
    }
    const index = zIndexes.indexOf(z);
    const range = getRangeParameters(process, index);
    // calculate fractional shells
    let shellFrac = (range.sliceShells - (range.sliceShells | 0));
    let sliceShells = range.sliceShells | 0;
    if (shellFrac) {
        let v1 = shellFrac > 0.5 ? 1 - shellFrac : shellFrac;
        let v2 = 1 - v1;
        let parts = Math.round(v2/v1) + 1;
        let rem = index % parts;
        let trg = shellFrac > 0.5 ? 1 : parts - 1;
        sliceShells += rem >= trg ? 1 : 0;
    }
    const isFirst = index === 0;
    const height = process.sliceHeight;
    const spaceMult = isFirst ? process.firstLayerLineMult || 1 : 1;
    const count = isSynth ? 1 : sliceShells;
    const offset =  shellOffset * spaceMult;
    const fillOff = fillOffset * spaceMult;
    const thinType = isSynth ? undefined : process.sliceDetectThin;
    const nutops = [];
    // co-locate shell processing with top generation in slicer
    for (let top of data.tops) {
        nutops.push(doTopShells(z, top, count, offset/2, offset, fillOff, {
            thinType,
            vaseMode,
            useAssembly
        }));
    }
    data.clip = clipOffset ? POLY.offset(nutops.map(t => t.simple), clipOffset) : undefined;
    data.tops = nutops;
    delete data.groups;
};

function offset_default(params) {
    let { z, top, count, top_poly, offset1, offsetN, wasm, last, gaps, thin } = params;

    let first;

    // standard wall offsetting strategy
    POLY.offset(
        top_poly,
        [-offset1, -offsetN],
        {
            z,
            wasm,
            count,
            outs: top.shells,
            flat: true,
            call: (polys, onCount) => {
                first = first || polys;
                last = polys;
                // mark each poly with depth (offset #) starting at 0
                for (let p of polys) {
                    p.depth = count - onCount;
                    if (p.fill_off) p.fill_off.forEach(function(pi) {
                        // use negative offset for inners
                        pi.depth = -(count - onCount);
                    });
                    // mark inner depth to match parent
                    if (p.inner) {
                        for (let pi of p.inner) {
                            pi.depth = p.depth;
                        }
                    }
                }
            }
        }
    );

    if (!thin) {
        return { last, gaps };
    }

    const deltaBig = 160;
    const deltSmall = 20;

    // look for close points on adjacent segmented polys and merge
    let test_polys = first !== last ? [ ...first, ...last ] : last;
    let test_flats = POLY.flatten(test_polys ?? []);

    // pre-compute segment angles
    for (let poly of test_flats)
    poly.forEachSegment((p0, p1) => {
        p0.angle = new Slope(p0, p1);
    });

    // segment each poly to be tested
    let thin_test = test_flats.map(poly => {
        return {
            poly,
            points: poly.segment(offset1, true).points
        }
    });

    for (let pi=0, pil=thin_test.length; pi<pil; pi++) {
        for (let pj=pi; pj<pil; pj++) {
            let prec0 = thin_test[pi];
            let prec1 = thin_test[pj];
            let pp0 = prec0.points;
            let pp1 = prec1.points;
            let moved = false;
            for (let i=0; i<pp0.length; i++) {
                let p0 = pp0[i];
                if (p0.moved !== undefined) continue;
                for (let j=0; j<pp1.length; j++) {
                    let p1 = pp1[j];
                    if (p1.moved !== undefined) continue;
                    if (p0 === p1 || p0.segment === p1.segment) continue;
                    let dist = p0.distTo2D(p1);
                    if (dist < offset1) {
                        let diff = p0.segment.angle.angleDiff(p1.segment.angle,false);
                        if (p0.segment === p1.segment && diff < deltaBig) continue;
                        if (p0.segment !== p1.segment && diff > deltSmall && diff < deltaBig) continue;
                        // merge points marking point offset and skip
                        let mid = p0.midPointTo(p1);
                        let inc = p0.distTo2D(mid) / offset1;
                        moved = p0.moved = p1.moved = inc.round(4);
                        p1.skip = 1;
                        p0.x = p1.x = mid.x;
                        p0.y = p1.y = mid.y;
                    }
                }
            }
            if (moved) {
                prec0.moved = prec1.moved = true;
            }
        }
    }

    for (let rec of thin_test) {
        if (rec.moved) {
            let last_seg;
            // tag for codec extended point encoding
            rec.poly._epk = ["moved", "skip"];
            rec.poly.points = rec.points.filter((p,i) => {
                let keep = (last_seg !== p.segment || p.moved || p.skip);
                last_seg = p.segment;
                return keep;
            });
        }
    }

    return { last, gaps };
}

function thin_type_1(params) {
    let { z, top, count, top_poly, offsetN, last, gaps } = params;
    top.thin_fill = [];
    top.fill_sparse = [];

    let layers = POLY.inset(top_poly, offsetN, count, z, true);
    last = layers.last().mid;
    top.shells = layers.map(r => r.mid).flat();
    top.gaps = layers.map(r => r.gap).flat();

    let off = offsetN;
    let min = off * 0.75;
    let max = off * 4;

    for (let poly of layers.map(r => r.gap).flat()) {
        let centers = poly.centers(off/2, z, min, max, {lines:false});
        top.fill_sparse.appendAll(centers);
    }

    return { last, gaps };
}

function thin_type_2(params) {
    let { z, top, count, top_poly, offset1, offsetN, last, gaps, wasm } = params;

    top.gaps = gaps;
    top.thin_fill = [];
    let oso = {z, count, gaps: [], outs: [], minArea: 0.05, wasm};
    POLY.offset(top_poly, [-offset1, -offsetN], oso);

    oso.outs.forEach((polys, i) => {
        polys.forEach(p => {
            p.depth = i;
            if (p.fill_off) {
                p.fill_off.forEach(pi => pi.depth = i);
            }
            if (p.inner) {
                for (let pi of p.inner) {
                    pi.depth = p.depth;
                }
            }
            top.shells.push(p);
        });
        last = polys;
    });

    // slice.solids.trimmed = slice.solids.trimmed || [];
    oso.gaps.forEach((polys, i) => {
        let off = (i == 0 ? offset1 : offsetN);
        polys = POLY.offset(polys, -off * 0.8, {z, minArea: 0, wasm});
        top.thin_fill.appendAll(cullIntersections(
            fillArea(polys, 45, off/2, [], 0.01, off*2),
            fillArea(polys, 135, off/2, [], 0.01, off*2),
        ));
        gaps.push(...polys);
    });

    return { last, gaps };
}

function thin_type_3(params) {
    // offsetN usually = extrusion width (nozzle diameter)
    let { z, top, count, offsetN } = params;

    // produce trace from outside of poly inward no more than max inset
    let noodleWidth = offsetN * count;
    let { noodle, remain } = top.poly.noodle(noodleWidth);
    for (let n of POLY.flatten(noodle).sort((a,b) => a.depth - b.depth)) {
        n.shell = [1,-1][Math.floor(n.depth / 2)];
        // console.log('map', n.depth, n.shell, n.length, n.area().round(3));
    }

    // re-expand inner offset so fill offsets align properly with expectation
    remain = POLY.offset(remain, offsetN / 2);

    let debugNoodle = false;
    let debugRemain = false;
    let debugExtrusion = false;

    let shells = top.shells; // only used for debug
    let traces = top.thin_wall = [];

    let midR = offsetN * 0.5;  // nominal extrusion width
    let minR = midR * 0.75; // smallest interior fill or single wall width
    let maxR = midR * 1.5; // max double wall extrusion width
    let maxF = midR * 2; // max interior extrusion width

    let lines = [];
    let polys = [];

    // show inset "noodle"
    if (debugNoodle) polys.push(...noodle);

    outer: for (let i=0; i<count; i++) {
        let next = [];

        // process each top level noodle separately
        for (let n of noodle.sort((a,b) => b.area() - a.area()))
        trace_noodle(
            [ n ],
            noodleWidth,
            minR,
            i === 0 ? midR : midR * 1.25,
            i === 0 ? maxR : maxF,
        {
            shell: n.shell,
            lines,
            polys,
            remain: next,
            traces,
            brute: false,
            showChainIntersect: false
        });

        // show remaining noodle after single trace
        if (debugRemain) polys.push(...POLY.setZ(POLY.flatten(next), z));

        noodle = next;
    }

    // console.log({ lines, polys, trace });

    // show extrusion
    let zo = z + 0.1;
    if (debugExtrusion)
    for (let trace of traces)
    for (let point of trace) {
        polys.push(newPolygon().centerCircle(point, point.r, 12).setZ(zo = zo + 0.005));
    }

    if (!debugExtrusion)
    POLY.setZ([...lines, ...polys], z);

    if (lines.length) top.thin_fill = lines;
    if (polys.length) shells.push(...polys);

    // create shell depth annotation that will survive serialization
    top.thin_sort = traces.map(t => t.shell);

    // remove point.segment markers for codec encoding between minion and worker
    for (let trace of traces) {
        for (let pt of trace) {
            delete pt.s;
        }
    }

    // console.log({ traces: traces.map(t => [t.length, t.shell]) });
    // console.log({ this: (self.kiri_minion?.name ?? self.kiri_worker), traces, polys });
    return { traces, last: remain };
}

// trace a single extrusion line around the inside of the noodle poly
function trace_noodle(noodle, noodleWidth, minR, midR, maxR, opt = {}) {
    let {
        brute,
        showInset,
        showChainIntersect,
        minArea = midR * midR,
        shellStep = 1 / 100, // diameter step as % of nozzle
        lines = [],
        polys = [],
        remain = [],
        traces = [],
        shell = 0
    } = opt;

    // increment shell with direction (1=outside, -1=inside)
    let shellAdd = shell > 0 ? 1 : -1;
    let sstep = 1 / shellStep;
    let insets = [];
    let scale = 1000;
    let dstep = minR / 4;
    let dtotl = 0;

    let inset = POLY.offset(noodle, -dstep, {
        join: ClipperLib.JoinType.jtRound,
        arc: (1/dstep) * 4
    });

    while (inset && inset.length) {
        dtotl += dstep;
        for (let p of POLY.flatten(inset, [])) {
            p.dtotl = dtotl;
        }
        insets.push(inset);
        if (showInset) {
            polys.appendAll(inset);
        }
        if (!brute) {
            break;
        }
        inset = POLY.offset(inset, -dstep, {
            minArea: 0
        });
    }

    // project from first inset and find greated offset intersection.
    // this examples show how to brute force create a medial axis from
    // micro stepping insets. the same intersect technique used with
    // medial axis can be applied to this structure to produce an
    // equivalent output. not as computationally efficient, but much simpler.
    // if (brute) {
    //     let { intersectRayLine } = base.util;
    //     let tests = insets.slice(1);
    //     let source = POLY.flatten(insets[0], []);
    //     for (let poly of source) {
    //         // segment the smallest inset and test against all other insets
    //         poly.segment(minR).forEachSegment((p1, p2) => {
    //             let np1 = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
    //             let len = pointDist(p1, p2);
    //             let dx = (p1.x - p2.x) / len;
    //             let dy = (p1.y - p2.y) / len;
    //             let np2 = { x: np1.x + dy * 10, y: np1.y - dx * 10 };
    //             let max = { dtotl: poly.dtotl, dist: Infinity, maxd: Infinity };
    //             let term = false;
    //             outer: for (let test of tests) {
    //                 for (let tpoly of POLY.flatten(test, [])) {
    //                     tpoly.forEachSegment((tp1, tp2) => {
    //                         let int = intersectRayLine(np1, { dx: dy, dy: -dx }, tp1, tp2);
    //                         if (int && int.dist > int.p1.poly.dtotl) {
    //                             return;
    //                         }
    //                         if (int && int.dist <= max.maxd && int.p1.poly.dtotl > max.dtotl) {
    //                             max.dtotl = int.p1.poly.dtotl;
    //                             max.dist = int.dist;
    //                             max.int = int;
    //                         } else if (int && int.dist <= max.maxd && int.p1.poly.dtotl === max.dtotl && int.dist < max.dist) {
    //                             max.dtotl = int.p1.poly.dtotl;
    //                             max.dist = int.dist;
    //                             max.int = int;
    //                         }
    //                     });
    //                     if (term) {
    //                         break outer;
    //                     }
    //                 }
    //             }
    //             if (max.int) {
    //                 lines.push(new Point(np1.x, np1.y));
    //                 lines.push(new Point(max.int.x, max.int.y));
    //             }
    //         });
    //     }
    //     return { lines, polys };
    // }

    let pointMap = new Map();
    let lineMap = new Map();

    function pointDist(p0, p1) {
        return Math.hypot(p0.x-p1.x, p0.y-p1.y);
    }

    function point2key(point) {
        return `${(point.x*100)|0}|${(point.y*100)|0}`;
    }

    // convert point to deduplicated / unique point record
    function pointToRec(point) {
        let key = point2key(point);
        let rec = pointMap.get(key);
        if (!rec) {
            rec = {
                key,
                count: 0,
                x: point.x/scale,
                y: point.y/scale,
                r: point.radius/scale,
            };
            pointMap.set(key, rec);
        }
        return rec;
    }

    // convert line to unique line record. matches reversed and duplicate lines
    function pointsToLine(p0, p1) {
        p0 = pointToRec(p0);
        p1 = pointToRec(p1);
        let key = p0.key > p1.key ? `${p1.key}:${p0.key}` : `${p0.key}:${p1.key}`;
        let rec = lineMap.get(key);
        if (rec) {
            rec.count++;
        } else {
            rec = {
                p0,
                p1,
                key,
                count: 1,
            };
            p0.count++;
            p1.count++;
            lineMap.set(key, rec);
        }
        return rec;
    }

    // for each standalone noodle, construct medial axis
    // map medial axis points into de-duplicated segments
    for (let poly of noodle) {
        // scale the polygon (including inners) so the medial axis code works properly
        poly = poly.clone(true).scale({ x:scale, y:scale, z:scale });
        let out = poly.points.map(p => ({ x: p.x|0, y: p.y|0 }));
        let inr = (poly.inner ?? []).map(p => p.points.map(p => ({ x: p.x|0, y: p.y|0 })));
        // construct medial axis lines. this appears to produce duplicate
        // reverse segments in a subset of cases
        let ma = JSPoly.construct_medial_axis(out, inr);
        // dedup the points so we can track them uniquely
        for (let { point0, point1 } of ma) {
            pointsToLine(point0, point1);
        }
    }

    // divide a segment/redius into 1 or more equal subsegments
    function div(cr) {
        if (cr <= maxR) {
            return [ cr ];
        } else if (cr <= maxR * 2) {
            let rem = (cr - midR * 2);
            if (rem < minR) {
                return [ cr / 2, cr / 2 ];
            }
            return [ midR, rem, midR ];
        } else if (cr <= maxR * 3) {
            let rem = (cr - midR * 2);
            if (rem < minR) {
                return [ cr / 3, cr / 3, cr / 3 ];
            }
            return [ midR, rem, midR ];
        } else {
            return [ midR, cr - midR * 2, midR ];
        }
    }

    // medial axis segments for comparison
    let segs = [...lineMap.values()];

    // project inset segment normals onto closest medial segment
    // use this to find a radius which we divide into extrusion lanes
    if (!brute)
    for (let insetp of inset) {
        let { intersectRayLine } = base.util;
        let parent = new Polygon();
        let inner = [];
        for (let poly of insetp.flattenTo([])) {
            let nupoly = poly.parent ? new Polygon() : parent;
            if (poly.parent) {
                inner.push(nupoly);
            }
            let sadd = shellAdd > 0 ? (poly.parent ? shellAdd : 0) : (poly.parent ? 0 : shellAdd);
            let ltpo;
            let trace = [];
            trace.shell = shell + sadd;
            poly.segment(minR,  true).forEachSegment((p1, p2) => {
                let np1 = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
                let len = pointDist(p1, p2);
                let dx = (p1.x - p2.x) / len;
                let dy = (p1.y - p2.y) / len;
                let min = { dist: Infinity };
                for (let seg of segs) {
                    let { p0, p1 } = seg;
                    let int = intersectRayLine(np1, { dx: dy, dy: -dx }, p0, p1);
                    if (int?.dist < min.dist && int?.dist < noodleWidth) {
                        min = int;
                        min.seg = seg;
                    }
                }
                if (min.p1) {
                    let mp1 = min.seg;
                    if (showChainIntersect) {
                        lines.push(new Point(np1.x, np1.y));
                        lines.push(new Point(min.x, min.y));
                    }
                    let mr = min.dist + dstep;
                    if (mr < minR) {
                        nupoly.push(new Point(min.x, min.y));
                        return;
                    }
                    // use intersection off and divide into extrusion lanes
                    let pop = div(mr);
                    let odd = (pop.length % 2 === 1);
                    let len = Math.ceil(pop.length / 2);
                    // check if segment was claimed by a different originating segment
                    // for odd wall counts so that they're not emitted twice
                    // todo: failing for noodle width single wall on circular objects
                    // update claim system to eliminate overlapping close singles
                    // and/or extend segment definition to curve within angle deviation
                    // instead of strict point/point segments
                    if (odd && mp1.claimed && mp1.claimed !== p1.segment) len--;
                    if (len === 0) {
                        nupoly.push(new Point(min.x, min.y));
                        return;
                    }
                    let npo;
                    if (pop.length === 1) {
                        // let rad_step = ((pop[0] * sstep) | 0) / sstep;
                        // for single wall place it exactly on medial axis
                        nupoly.push(new Point(min.x, min.y));
                        npo = { x: min.x, y: min.y, r: mr, s: p1.segment };
                    } else {
                        // radius rounded to nearest step
                        let rad_step = ((pop[0] * sstep) | 0) / sstep;
                        // otherwise use first division
                        // compensate for minimal inset
                        let off = -dstep + rad_step;
                        npo = {
                            x: np1.x + dy * off,
                            y: np1.y - dx * off,
                            r: rad_step,
                            s: p1.segment
                        };
                        // trace inset by full diameter
                        nupoly.push(new Point(np1.x + dy * off * 2, np1.y - dx * off * 2));
                    }
                    let lpo = trace.peek();
                    // when outputting the same segment at the same radius
                    // it's safe to drop the last point since path output will connect them
                    if (trace.length > 1 && lpo.s === npo.s && lpo.r === npo.r) {
                        trace.pop();
                    }
                    trace.push(npo);
                    if (odd && !mp1.claimed) {
                        mp1.claimed = p1.segment;
                    }
                    // detect trace jump and start new trace
                    if (ltpo && pointDist(ltpo, trace.peek()) > maxR) {
                        // start new trace removing jump point
                        // and adding that to the new trace
                        traces.push(trace);
                        let nutrace = [ trace.pop() ];
                        nutrace.shell = trace.shell;
                        // close last trace if endpoints near enough
                        if (pointDist(ltpo, trace[0] <= maxR)) {
                            trace.push(trace[0]);
                        }
                        trace = nutrace;
                    }
                    // update last trace point out
                    ltpo = trace.peek();
                }
            });
            // repeat first point of trace (if close enough to be closed)
            if (trace[0] && pointDist(trace[0], trace.peek()) <= maxR) {
                trace.push(trace[0]);
            }
            if (trace.length) {
                traces.push(trace);
            }
        }

        // subtract inner extrusion offsets from parent extrusion offset
        // this can result in more top level polys and must be processed
        // iteratively.
        let setA = [ parent ];
        for (let setB of inner) {
            setA = POLY.subtract(setA, [ setB ], []);
        }

        // clean and re-nest the resulting polygon soup
        // subtraction cleans pre-subtract but not post and these
        // outlines can have sharp unprintable interiors
        let ret = POLY.nest(
            POLY.flatten(setA, [], true).map(p => {
                return p.clean().simplify();
            }).flat().map(p => {
                p.shell = shell + shellAdd;
                return p;
            })
        ).filter(p => p.area() >= minArea);

        remain.push(...ret);
    }

    return { lines, polys, remain, traces };
}

/**
 * may run in minion or worker context. performs shell offsetting
 * including thin wall detection when enabled
 */
export function doTopShells(z, top, count, offset1, offsetN, fillOffset, opt = {}) {
    // pretend we're a top object in minions
    if (!top.poly) {
        top = { poly: top };
    }

    // add simple (low rez poly) where less accuracy is OK
    top.simple = top.poly.simple();

    let wasm = opt.useAssembly;
    let top_poly = [ top.poly ];

    if (opt.vaseMode) {
        // remove top poly inners in vase mode
        top.poly = top.poly.clone(false);
    }

    top.shells = [];        // strategies output shells here
    top.fill_off = [];      // offset from innermost shell for infill
    top.fill_lines = [];    // fill lines inside fill_off

    let last = [],
        gaps = [];

    if (count) {
        // permit offset of 0 for laser and drag knife
        if (offset1 === 0 && count === 1) {
            last = top_poly.clone(true);
            top.shells = last;
        } else {
            // heal top open polygons if the ends are close (benchy tilt test)
            top_poly.forEach(p => { if (p.open) {
                let dist = p.first().distTo2D(p.last());
                if (dist < 1) p.open = false;
            } });
            let ret = { last, gaps };
            switch (opt.thinType) {
                case "legacy 1":
                    ret = thin_type_1({ z, top, count, top_poly, offsetN, fillOffset });
                    break;
                case "legacy 2":
                    ret = thin_type_2({ z, top, count, top_poly, offset1, offsetN, fillOffset, gaps, wasm });
                    break;
                case "adaptive":
                    ret = thin_type_3({ z, top, count, offsetN });
                    break;
                case "basic":
                default:
                    ret = offset_default({
                        z, top, count, top_poly, offset1, offsetN, wasm,
                        thin: opt.thinType === 'basic'
                    });
                    break;
            }
            last = ret.last ?? last;
            gaps = ret.gaps ?? gaps;
        }
    } else {
        // no shells, just infill, is permitted
        last = [top.poly];
    }

    // generate fill offset poly set from last offset to top.fill_off
    if (fillOffset && last.length > 0) {
        // if gaps present, remove that area from fill inset
        if (gaps.length) {
            let nulast = [];
            POLY.subtract(last, gaps, nulast, null, z);
            last = nulast;
        }
        last.forEach(function(inner) {
            POLY.offset([inner], -fillOffset, {outs: top.fill_off, flat: true, z});
        });
    }

    // for diffing
    top.last = last;
    // top.last_simple = last.map(p => p.clean(true, undefined, config.clipper / 10));

    return top;
}

/**
 * given an array of arrays of points (lines), eliminate intersections
 * between groups, then return a unified array of shortest non-intersects.
 */
function cullIntersections() {
    function toLines(pts) {
        let lns = [];
        for (let i=0, il=pts.length; i<il; i += 2) {
            lns.push({a: pts[i], b: pts[i+1], l: pts[i].distTo2D(pts[i+1])});
        }
        return lns;
    }
    let aOa = [...arguments].filter(t => t);
    if (aOa.length < 1) return;
    let aa = toLines(aOa.shift());
    while (aOa.length) {
        let bb = toLines(aOa.shift());
        loop: for (let i=0, il=aa.length; i<il; i++) {
            let al = aa[i];
            if (al.del) {
                continue;
            }
            for (let j=0, jl=bb.length; j<jl; j++) {
                let bl = bb[j];
                if (bl.del) {
                    continue;
                }
                if (base.util.intersect(al.a, al.b, bl.a, bl.b, base.key.SEGINT)) {
                    if (al.l < bl.l) {
                        bl.del = true;
                    } else {
                        al.del = true;
                    }
                    continue;
                }
            }
        }
        aa = aa.filter(l => !l.del).concat(bb.filter(l => !l.del));
    }
    let good = [];
    for (let i=0, il=aa.length; i<il; i++) {
        let al = aa[i];
        good.push(al.a);
        good.push(al.b);
    }
    return good.length > 2 ? good : [];
}
