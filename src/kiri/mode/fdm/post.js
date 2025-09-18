/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import '../../../ext/jspoly.js';
import { base } from '../../../geo/base.js';
import { newPolygon, Polygon } from '../../../geo/polygon.js';
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
    // offsetN usually = extrusion width (nozzle diameter)
    let { z, top, count, offsetN, last, gaps } = params;

    // produce trace from outside of poly inward no more than max inset
    let { noodle, remain } = top.poly.noodle(offsetN * count);

    top.gaps = remain;

    let mergeChains = false;
    let simplifyChain = false;
    let shortenAtNexus = false;
    let shortenEdgeSpur = false;
    let intersectChains = true;

    let showNoodle = false;
    let showExtrusion = true;
    let showExtrudeInset = false;
    let showInsetPoints = false;
    let showChainRawPoints = false;
    let showChainInterpPoints = true;
    let showChainIntersect = false;
    let showNuMedLine = false;
    let showMedLine = false;
    let showMedPoints = false;
    let showMedNormals = false;
    let showMedRadii = false;
    let showNexuses = false;

    let thin = top.thin_fill = [];
    let shells = top.shells;
    let sparse = top.fill_sparse = [];
    let scale = 1000;
    let midR = offsetN * 0.5;  // nominal extrusion width
    let minR = midR * 0.75; // smallest interior fill or single wall width
    let maxR = midR * 1.5; // max double wall extrusion width
    let maxF = midR * 2; // max interior extrusion width
    let minSpur = offsetN * 1;

    let inset;
    let dstep = minR / 4;
    top.gaps = remain;

    if (true) {
        let dtotl = 0;
        inset = POLY.offset(noodle, -dstep, {
            join: ClipperLib.JoinType.jtRound,
            arc: (1/dstep) * 4
        });
        while (inset && inset.length) {
            dtotl += dstep;
            let ps = POLY.flatten(inset);
            for (let poly of ps) {
                for (let p of poly.segment(minR).points) {
                    let d = dtotl * 0+0.05;
                    // let z = dtotl * 10;
                    if (showInsetPoints)
                    shells.append( newPolygon().centerCircle(p, d, 10).setZ(z) );
                }
            }
            POLY.setZ(inset, z);
            shells.appendAll(inset);
            if (true || dtotl >= maxR) {
                break;
            }
            inset = POLY.expand(inset, -dstep);
        }
    }

    // shells.appendAll(noodle);
    // return { last, gaps };

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

    let chains = [];

    // for each standalone noodle, construct medial axis
    // map medial axis points into de-duplicated segments
    // which will be re-connected into chains
    for (let poly of noodle) {
        // scale the polygon (including inners) so the medial axis code works properly
        poly = poly.clone(true).scale({ x:scale, y:scale, z:scale });
        let out = poly.points.map(p => ({ x: p.x|0, y: p.y|0 }));
        let inr = (poly.inner ?? []).map(p => p.points.map(p => ({ x: p.x|0, y: p.y|0 })));
        // construct medial axis lines. this appears to produce duplicate
        // reverse segments in a subset of cases
        let ma = JSPoly.construct_medial_axis(out, inr);
        // dedup the points so we can track them uniquely (for chain intersections)
        for (let { point0, point1 } of ma) {
            pointsToLine(point0, point1);
        }
    }

    // connect segments into chains
    for (let seg of lineMap.values()) {
        let { p0, p1 } = seg;
        let len = seg.len = pointDist(p0, p1);
        // filter out lines where both points' radii are under the
        // minR threshold. shorten and fixup lines where minR falls
        // somewhere along the gradient between ends.
        if (shortenEdgeSpur)
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
                // both points eliminated
                pointMap.delete(p0.key);
                pointMap.delete(p1.key);
                lineMap.delete(seg.key);
                continue;
            }
        }
        // for each line segment either add it to a chain or start a new chain
        let add;
        for (let chain of chains) {
            if (p0.count === 2 && p0 === chain[0]) {
                // prefix chain with p1
                chain.splice(0,0,p1);
                add = true;
            } else if (p0.count === 2 && p0 === chain.peek()) {
                // append chain with p1
                chain.push(p1);
                add = true;
            } else if (p1.count === 2 && p1 === chain[0]) {
                // prefix chain with p0
                chain.splice(0,0,p0);
                add = true;
            } else if (p1.count === 2 && p1 === chain.peek()) {
                // append chain with p0
                chain.push(p0);
                add = true;
            }
            if (add) {
                chain.total += len;
                break;
            }
        }
        if (!add) {
            chains.push([ p0, p1 ]);
            chains.peek().total = len;
        }
    }

    // todo: merge chains at next of 3 or more preferencing
    // merging longer chains. then shorten remaining nexus chain
    // intersections by minR

    // render inset "noodle"
    if (showNoodle) {
        shells.appendAll(noodle);
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
            // let divs = (cr / midR) | 0;
            // return new Array(divs).fill(cr / divs);
        }
    }

    // filter chains that are too short from consideration
    chains = chains.filter(c => c.total >= minR);
    chains.sort((c1,c2) => c2.total - c1.total);

    function merge1chain() {
        let clen = chains.length;
        for (let i=0; i<clen; i++) {
            let ci = chains[i];
            if (!ci) continue;
            for (let j=i+1; j<clen; j++) {
                let cj = chains[j];
                if (!cj) continue;
                if (ci[0] === cj[0]) {
                    ci.reverse().appendAll(cj)
                    ci.total += cj.total;
                    cj.merged = true;
                    chains[j] = undefined;
                    return true;
                } else if (ci.peek() === cj.peek()) {
                    ci.appendAll(cj.reverse());
                    ci.total += cj.total;
                    cj.merged = true;
                    chains[j] = undefined;
                    return true;
                } else if (ci.peek() === cj[0]) {
                    ci.appendAll(cj);
                    ci.total += cj.total;
                    cj.merged = true;
                    chains[j] = undefined;
                    return true;
                } else if (ci[0] === cj.peek()) {
                    cj.appendAll(ci);
                    cj.total += ci.total;
                    ci.merged = true;
                    chains[i] = undefined;
                    return true;
                }
            }
        }
        return false;
    }

    // map chains to nexus via endpoints
    let nexus = {};
    function addEp(point, chain) {
        let key = point.key;
        let rec = nexus[key];
        if (!rec) rec = nexus[key] = { point, chains: [] };
        if (rec.chains.indexOf(chain) < 0) rec.chains.push(chain);
    }
    // since chains are sorted longest to shortest,
    // they will appear in the nexus record longest to shortest
    for (let chain of chains) {
        addEp(chain[0], chain);
        addEp(chain.peek(), chain);
    }

    // connect chains end to end following nexus branches that result
    // in the longest final merged chain (open or closed)
    // map chain endpoints to nexus points
    while (mergeChains && merge1chain()) ;

    // filter out null chains that were merged into other chains
    chains = chains.filter(chain => chain);

    // filter dup points from connecting ends
    chains = chains.map(chain => chain.filter((v, i) => i === 0 || v !== chain[i - 1]));

    // mark closed chains
    // todo use exact point match by eliminating slice above
    // then later removing repeated points in the resulting chain from merges
    if (mergeChains)
    for (let chain of chains) {
        chain.closed = (chain[0] === chain.peek());
        if (chain.closed) chain.pop();
    }

    // shorten chain length by minR distance by popping or moving points
    function shorten(chain) {
        for (let rem=0, i=chain.length-1; i>=1 && rem < minR; i--) {
            let c1 = chain[i];
            let c2 = chain[i-1];
            let d = pointDist(c1,c2);
            if (rem + d <= minR) {
                chain.pop();
                rem += d;
            } else {
                let diff = minR - rem;
                // move c1 toward c2
                let pct = diff / d;
                let dx = c1.x - c2.x;
                let dy = c1.y - c2.y;
                chain[i] = {
                    x: c1.x - dx * pct,
                    y: c1.y - dy * pct,
                    r: c1.r
                };
                rem = 0;
                break;
            }
        }
    }

    // shorten chains terminating at nexus by midR
    if (shortenAtNexus)
    for (let rec of Object.values(nexus)) {
        let { point } = rec;
        rec.shorts = 0;
        if (rec.chains.length < 3) continue;
        for (let chain of chains.filter(c => !c.closed)) {
            if (pointDist(chain[0], point) < minR) {
                chain.reverse();
                shorten(chain);
                chain.reverse();
                rec.shorts++;
            } else if (chain.peek() === point) {
                shorten(chain);
                rec.shorts++;
            }
        }
    }

    if (showNexuses)
    for (let rec of Object.values(nexus)) {
        let { point } = rec;
        shells.push(newPolygon().centerCircle(point, 0.2, 6 - rec.shorts));
    }

    // Keep endpoints; drop interior points closer than R from the last kept point.
    function dropClosePoints(chain, R) {
        if (!chain || chain.length <= 2 || R <= 0) {
            return chain;
        }
        let last = chain[0];
        let out = [ last ];
        let R2 = R * R;
        for (let i = 1; i < chain.length - 1; i++) {
            let dx = chain[i].x - last.x,
                dy = chain[i].y - last.y;
            if (dx * dx + dy * dy >= R2) {
                out.push(chain[i]);
                last = chain[i];
            }
        }
        out.push(chain[chain.length - 1]);
        return out;
    }

    // drop chain points < minR apart
    if (simplifyChain) {
        chains = chains.map(chain => dropClosePoints(chain, minR));
    }

    function renderPointNormal(pt, ndx, ndy) {
        if (showMedNormals) {
            let xo = ndx * pt.r;
            let yo = ndy * pt.r;
            thin.push(new Point(pt.x + yo, pt.y - xo));
            thin.push(new Point(pt.x - yo, pt.y + xo));
        }
        if (showMedRadii) {
            const Sx = pt.x + ndy * pt.r;
            const Sy = pt.y - ndx * pt.r;
            const pop = div(pt.r);
            let acc = 0;
            for (let r of pop) {
                const t = acc + r;
                const px = Sx + -ndy * t;
                const py = Sy + ndx * t;
                shells.push(newPolygon().centerCircle({x:px, y:py}, r, 10));
                acc += r * 2;
            }
        }
}

    // gather point offsets into shells
    let zi = z;
    let nuchains = [];
    for (let chain of chains) {
        let nuchain = [];
        nuchains.push(nuchain);
        // zi += 0.1;
        if (showChainRawPoints)
        for (let pt of chain) {
            shells.push(newPolygon().centerCircle(pt, pt.r ?? 0.1, 10));
        }
        // draw medial axis chain
        let { closed, length } = chain;
        let term = closed ? length : length - 1;
        let segs = [];
        for (let i=0; i<term; i++) {
            let p0 = chain[i];
            let p1 = chain[(i+1) % length];
            let len = pointDist(p0, p1);
            // medial axis segment
            if (showMedLine) {
                thin.push(new Point(p0.x, p0.y, zi));
                thin.push(new Point(p1.x, p1.y, zi));
            }
            // compute medial axis segment normal
            let steps = Math.ceil(len / midR) + 1;
            let step = 1 / steps;
            let dr = (p1.r - p0.r);
            let dx = (p1.x - p0.x);
            let dy = (p1.y - p0.y);
            let ndx = dx / len;
            let ndy = dy / len;
            segs.push({ p0, p1, steps, step, dr, dx, dy, ndx, ndy });
        }

        // compute chain subdivisions
        let slen = segs.length;
        for (let si=0; si<slen; si++) {
            let seg = segs[si];
            let segp = segs[(si - 1 + slen) % slen];
            let { p0, p1, steps, step, dr, dx, dy, ndx, ndy } = seg;
            let first = si === 0;
            let last = si === slen - 1;
            let mid = !(first || last);
            if (first || mid) {
                nuchain.push(p0);
            }
            // for length 2, first and last segment are the same
            if (showMedPoints) {
                if (first) {
                    // todo: handle closed
                    shells.push(newPolygon().centerCircle(p0, p0.r/2, 10));
                }
                if (mid) {
                    // mid segments
                    shells.push(newPolygon().centerCircle(p0, p0.r/2, 10));
                }
                if (last) {
                    // todo: handle closed
                    shells.push(newPolygon().centerCircle(p0, p0.r/2, 10));
                    if (closed) {
                        console.log('closed');
                    } else {
                        shells.push(newPolygon().centerCircle(p1, p1.r/2, 10));
                    }
                }
            }
            {
                // todo: handle closed
                if (first) {
                    renderPointNormal(p0, ndx, ndy);
                }
                if (mid) {
                    renderPointNormal(p0, ((ndx + segp.ndx)/2), ((ndy + segp.ndy)/2));
                }
                if (last) {
                    renderPointNormal(p1, ndx, ndy);
                }
            }
            // interpolate across the length of the chain segment
            for (let indx = 1; indx < steps; indx++) {
                const inc = indx * step;
                const cr = p0.r + dr * inc;
                const cx = p0.x + dx * inc;
                const cy = p0.y + dy * inc;
                const xo = ndx * cr;
                const yo = ndy * cr;
                if (showChainInterpPoints) {
                    if (showMedPoints) {
                        shells.push(newPolygon().centerCircle({ x:cx, y:cy }, cr/2, 10));
                    }
                    renderPointNormal({ x:cx, y:cy, r:cr }, ndx, ndy);
                }
                nuchain.push({ x:cx, y:cy, r:cr });
            }
            if (last) {
                nuchain.push(p1);
            }
        }
        if (showNuMedLine) {
            for (let i=0; i<nuchain.length-1; i++) {
                let p0 = nuchain[i];
                let p1 = nuchain[i+1];
                thin.push(new Point(p0.x, p0.y, z));
                thin.push(new Point(p1.x, p1.y, z));
            }
        }
    }

    // project inset segment normals onto closest chain
    if (intersectChains) {
        let { intersect } = base.util;
        let { SEGINT } = base.key;
        inset = POLY.flatten(inset, []);
        for (let poly of inset) {
            let nupoly = new Polygon();
            poly.segment(minR).forEachSegment((p1, p2) => {
                let np1 = { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
                let len = pointDist(p1, p2);
                let dx = (p1.x - p2.x) / len;
                let dy = (p1.y - p2.y) / len;
                let np2 = { x: np1.x + dy * 10, y: np1.y - dx * 10 };
                let min = { dist: Infinity };
                for (let chain of nuchains) {
                    for (let i=0; i<chain.length-1; i++) {
                        let c1 = chain[i];
                        let c2 = chain[i+1];
                        let int = intersect(np1, np2, c1, c2, SEGINT);
                        if (int?.dist < min.dist && int?.dist < midR) {
                            min = int;
                        }
                    }
                }
                if (min.p1) {
                    let { p1, p2 } = min;
                    if (showChainIntersect) {
                        thin.push(new Point(np1.x, np1.y));
                        thin.push(new Point(min.x, min.y));
                    }
                    let mr = Math.min(p1.r, p2.r);
                    if (mr < minR) return;
                    let pop = div(mr);
                    let odd = (pop.length % 2 === 1);
                    let len = Math.ceil(pop.length / 2);
                    if (odd && p1.claimed) len--;
                    // implement first-to-intersect claim system
                    // for odd wall counts so that they're not emitted twice
                    // todo extend to all odd counts
                    if (len === 0) {
                        return;
                    }
                    if (pop.length === 1) {
                        nupoly.push(new Point(min.x, min.y));
                        // for single wall place it exactly on medial axis
                        if (showExtrusion)
                        shells.push(newPolygon().centerCircle({
                            x: min.x,
                            y: min.y
                        }, mr, 12));
                    } else {
                        let off = -dstep;
                        // otherwise use divisions
                        for (let i=0; i<1; i++) {
                            off += (pop[i] * (i ? 2 : 1));
                            if (showExtrusion)
                            shells.push(newPolygon().centerCircle({
                                x: np1.x + dy * off,
                                y: np1.y - dx * off
                            }, pop[0], 12));
                        }
                        off += dstep / 2;
                        nupoly.push(new Point(np1.x + dy * off * 2, np1.y - dx * off * 2));
                    }
                    p1.claimed = true;
                }
            });
            if (showExtrudeInset) {
                shells.push(...nupoly.clean().simplify());
            }
        }
    }

    POLY.setZ([...thin, ...shells], z);
    // POLY.setZ([...shells], z);

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
