/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../../../ext/jspoly.js';
import { base } from '../../../geo/base.js';
import { Line } from '../../../geo/line.js';
import { polygons as POLY, fillArea } from '../../../geo/polygons.js';
import { getRangeParameters } from './driver.js';
import { slicer } from '../../../geo/slicer.js';
import { Point } from '../../../geo/point.js';

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
    let { z, top, count, top_poly, offset1, offsetN, wasm, last, gaps } = params;
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
    let { z, top, count, offsetN, last, gaps } = params;
    top.thin_fill = [];
    top.fill_sparse = [];

    let { noodle, remain } = top.poly.noodle(offsetN * 2);
    top.shells = noodle;
    top.gaps = remain;

    let thin = top.thin_fill;
    let scale = 5000;
    let minR = offsetN / 2;
    let minSpur = offsetN * 3;

    let pointMap = new Map();
    let lineMap = new Map();

    function pointToRec(point) {
        let key = `${(point.x*100)|0}|${(point.y*100)|0}`;
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

    let chains = [];

    for (let poly of noodle) {
        poly = poly.clone(true).scale({ x:scale, y:scale, z:scale });
        let out = poly.points.map(p => ({ x: p.x|0, y: p.y|0 }));
        let inr = (poly.inner ?? []).map(p => p.points.map(p => ({ x: p.x|0, y: p.y|0 })));
        let ma = JSPoly.construct_medial_axis(out, inr);
        for (let { point0, point1 } of ma) {
            pointsToLine(point0, point1);
        }
        for (let seg of lineMap.values()) {
            let { p0, p1 } = seg;
            let len = seg.len = Math.hypot(p0.x-p1.x, p0.y-p1.y);
            if (p0.r < minR || p1.r < minR) {
                if (p0.r > minR && len > minSpur) {
                    // move p1 toward p0 until minR met
                    let pct = (minR - p1.r) / (p0.r - p1.r);
                    let dx = p1.x - p0.x;
                    let dy = p1.y - p0.y;
                    p1.x -= dx * pct;
                    p1.y -= dy * pct;
                    p1.r = minR;
                    pointMap.delete(p1.key);
                } else if (p1.r > minR && len > minSpur) {
                    // move p0 toward p1 until minR met
                    let pct = (minR - p0.r) / (p1.r - p0.r);
                    let dx = p0.x - p1.x;
                    let dy = p0.y - p1.y;
                    p0.x -= dx * pct;
                    p0.y -= dy * pct;
                    p0.r = minR;
                    pointMap.delete(p0.key);
                } else {
                    lineMap.delete(seg.key);
                    continue;
                }
            }
            // thin.push(new Point(p0.x, p0.y));
            // thin.push(new Point(p1.x, p1.y));
            let add;
            for (let chain of chains) {
                if (p0.count === 2 && p0 === chain[0]) {
                    chain.splice(0,0,p1);
                } else if (p0.count === 2 && p0 === chain.peek()) {
                    chain.push(p1);
                    add = true;
                } else if (p1.count === 2 && p1 === chain[0]) {
                    chain.splice(0,0,p0);
                    add = true;
                } else if (p1.count ===2 && p1 === chain.last) {
                    chain.push(p0);
                    add = true;
                }
                if (add) {
                    break;
                }
            }
            if (!add) {
                chains.push([ p0, p1 ]);
            }
        }
    }

    for (let chain of chains) {
        for (let i=0; i<chain.length-1; i++) {
            thin.push(new Point(chain[i].x, chain[i].y));
            thin.push(new Point(chain[i+1].x, chain[i+1].y));
        }
    }

    return { last, gaps };
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
                case "type 1":
                    ret = thin_type_1({ z, top, count, top_poly, offsetN, fillOffset });
                    break;
                case "type 2":
                    ret = thin_type_2({ z, top, count, top_poly, offset1, offsetN, fillOffset, gaps, wasm });
                    break;
                case "type 3":
                    ret = thin_type_3({ z, top, count, top_poly, offsetN });
                    fillOffset = 0;
                    break;
                default:
                    ret = offset_default({ z, top, count, top_poly, offset1, offsetN, wasm });
                    break;
            }
            last = ret.last || last;
            gaps = ret.gaps || gaps;
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
