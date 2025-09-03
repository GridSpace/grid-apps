/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../../geo/polygon.js';
import { newSlice } from '../../core/slice.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { util as base_util } from '../../../geo/base.js';
import { poly2polyEmit } from '../../../geo/paths.js';
import { newPoint } from '../../../geo/point.js';

class OpTrace extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        const debug = false;
        let { op, state } = this;
        let { tool, rate, down, plunge, offset, offover, thru } = op;
        let { ov_conv } = op;
        let { settings, widget, addSlices, zThru, tabs, workarea } = state;
        let { updateToolDiams, cutTabs, cutPolys, healPolys, color, shadowAt } = state;
        let { process, stock } = settings;
        let { camStockClipTo } = process;
        if (state.isIndexed) {
            throw 'trace op not supported with indexed stock';
        }
        // generate tracing offsets from chosen features
        let zTop = workarea.top_z;
        let zBottom = workarea.bottom_z;
        let sliceOut = this.sliceOut = [];
        let areas = op.areas[widget.id] || [];
        let camTool = new Tool(settings, tool);
        let toolDiam = camTool.fluteDiameter();
        let toolOver = toolDiam * op.step;
        let traceOffset = camTool.traceOffset()
        let cutdir = ov_conv;
        let polys = [];
        let reContour = false;
        let canRecontour = offset !== 'none' && down === 0;
        let stockRect = stock.center && stock.x && stock.y ?
            newPolygon().centerRectangle({x:0,y:0}, stock.x, stock.y) : undefined;
        updateToolDiams(toolDiam);

        if (tabs) {
            tabs.forEach(tab => {
                tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
            });
        }
        for (let arr of areas) {
            let poly = newPolygon().fromArray(arr);
            POLY.setWinding([ poly ], cutdir, false);
            polys.push(poly);
            let zs = poly.points.map(p => p.z);
            let min = Math.min(...zs);
            let max = Math.max(...zs);
            if (max - min > 0.0001 && canRecontour) {
                reContour = true;
            }
        }
        if (false) newSliceOut(0).output()
            .setLayer("polys", {line: 0xaaaa00}, false)
            .addPolys(polys);
        function newSliceOut(z) {
            let slice = newSlice(z);
            addSlices(slice);
            sliceOut.push(slice);
            return slice;
        }
        function minZ(z) {
            return zBottom ? Math.max(zBottom, z - thru) : z - thru;
        }
        function followZ(poly) {
            if (op.dogbone) {
                addDogbones(poly, toolDiam / 5, !op.revbone);
            }
            let z = poly.getZ();
            let slice = newSliceOut(z);
            slice.camTrace = { tool, rate, plunge };
            if (tabs) {
                slice.camLines = cutTabs(tabs, [poly], z);
            } else {
                slice.camLines = [ poly ];
            }
            if (camStockClipTo && stockRect) {
                slice.camLines = cutPolys([stockRect], slice.camLines, z, true);
            }
            if (reContour) {
                state.contourPolys(widget, slice.camLines);
            }
            POLY.setWinding(slice.camLines, cutdir, false);
            slice.output()
                .setLayer("trace follow", {line: color}, false)
                .addPolys(slice.camLines)
        }
        function clearZnew(polys, z, down) {
            if (down) {
                // adjust step down to a value <= down that
                // ends on the lowest z specified
                let diff = zTop - z;
                down = diff / Math.ceil(diff / down);
            }
            let zs = down ? base_util.lerp(zTop, z, down) : [ z ];
            let zpro = 0, zinc = 1 / (polys.length * zs.length);
            for (let poly of polys) {
                // newPocket();
                for (let z of zs) {
                    let clip = [], shadow;
                    shadow = shadowAt(z);
                    // for cases where the shadow IS the poly like
                    // with lettering without a bounding frame, clip
                    // will fail and we need to restore the matching poly
                    let subshadow = true;
                    for (let spo of shadow) {
                        if (poly.isInside(spo, 0.01)) {
                            subshadow = false;
                            clip = [ poly ];
                            break;
                        }
                    }
                    if (subshadow) {
                        POLY.subtract([ poly ], shadow, clip, undefined, undefined, 0);
                    }
                    if (op.outline) {
                        POLY.clearInner(clip);
                    }
                    if (clip.length === 0) {
                        continue;
                    }
                    let count = 999;
                    let slice = newSliceOut(z);
                    slice.camTrace = { tool, rate, plunge };
                    if (toolDiam) {
                        const offs = [ -toolDiam / 2, -toolOver ];
                        POLY.offset(clip, offs, {
                            count, outs: slice.camLines = [], flat:true, z, minArea: 0
                        });
                    } else {
                        // when engraving with a 0 width tip
                        slice.camLines = clip;
                    }
                    if (tabs) {
                        slice.camLines = cutTabs(tabs, POLY.flatten(slice.camLines, null, true), z);
                    } else {
                        slice.camLines = POLY.flatten(slice.camLines, null, true);
                    }
                    POLY.setWinding(slice.camLines, cutdir, false);
                    if (debug && shadow) slice.output()
                        .setLayer("trace shadow", {line: 0xff8811}, false)
                        .addPolys(shadow)
                    if (debug) slice.output()
                        .setLayer("trace poly", {line: 0x1188ff}, false)
                        .addPolys([ poly ])
                    slice.output()
                        .setLayer("trace", {line: color}, false)
                        .addPolys(slice.camLines)
                    progress(zpro, "trace");
                    zpro += zinc;
                    addSlices(slice);
                }
            }
        }
        function similar(v1, v2, epsilon = 0.01) {
            return Math.abs(v1-v2) <= epsilon;
        }
        function centerPoly(p1, p2) {
            // follow poly with most points
            if (p2.length > p1.length) {
                let t = p1;
                p1 = p2;
                p2 = t;
            }
            let np = newPolygon().setOpen(true);
            for (let p of p1.points) {
                let q = p2.findClosestPointTo(p);
                np.push(p.midPointTo3D(q.point));
            }
            return np;
        }
        function centerPolys(polys) {
            // select open polys and sort by length
            let ptst = polys.filter(p => p.isOpen()).sort((a,b) => b.perimeter() - a.perimeter());
            if (ptst.length < 2) {
                return polys;
            }
            let pt = newPoint(0,0,0);
            // ensure polys are ordered with start point closest to 0,0
            ptst.forEach(p => {
                if (p.last().distTo2D(pt) < p.first().distTo2D(pt)) {
                    p.reverse();
                }
            });
            let pout = polys.filter(p => p.isClosed());
            outer: for (let i=0,l=ptst.length; i<l-1; i++) {
                let p0 = ptst[i];
                if (!p0) continue;
                for (let j=i+1; j<l; j++) {
                    let p1 = ptst[j];
                    if (!p1) continue;
                    if (
                        similar(p0.perimeter(), p1.perimeter(), 0.1) &&
                        similar(p0.first().distTo2D(p1.first()), toolDiam) &&
                        similar(p0.last().distTo2D(p1.last()), toolDiam)
                    ) {
                        pout.push(centerPoly(p0, p1));
                        ptst[i] = undefined;
                        ptst[j] = undefined;
                        continue outer;
                    }
                }
            }
            pout.appendAll(ptst.filter(p => p));
            return pout;
        }
        // connect selected segments if open and touching
        polys = healPolys(polys);
        // find center line for open polys spaced by tool diameter
        polys = centerPolys(polys);
        switch (op.mode) {
            case "follow":
                let routed = [];
                poly2polyEmit(polys, newPoint(0,0,0), (poly, index, count, spoint) => {
                    routed.push(poly);
                });
                let output = [];
                for (let poly of POLY.nest(routed)) {
                    let offdist = offset !== 'none' ? offover : 0;
                    if (!offdist)
                    switch (offset) {
                        case "outside": offdist = traceOffset; break;
                        case "inside": offdist = -traceOffset; break;
                    } else if (offset === "inside") {
                        offdist = -offdist;
                    }
                    if (offdist) {
                        let pnew = POLY.offset([poly], offdist, { minArea: 0, open: true });
                        if (pnew) {
                            poly = POLY.setZ(pnew, poly.getZ());
                        } else {
                            continue;
                        }
                    } else {
                        poly = [ poly ];
                    }
                    for (let pi of POLY.flatten(poly, [], true))
                    if (down) {
                        let zto = minZ(pi.getZ());
                        if (zThru && similar(zto,0)) {
                            zto -= zThru;
                        }
                        for (let z of base_util.lerp(zTop, zto, down)) {
                            output.push(pi.clone().setZ(z));
                        }
                    } else {
                        if (thru) {
                            pi.setZ(pi.getZ() - thru);
                        }
                        output.push(pi);
                    }
                    if (!down && op.merge) {
                        let nest = POLY.nest(output);
                        let union = POLY.union(nest, 0, true);
                        output = POLY.flatten(union, [], true);
                    }
                }
                for (let poly of output) {
                    followZ(poly);
                }
                break;
            case "clear":
                const zbo = widget.track.top - widget.track.box.d;
                let zmap = {};
                polys = POLY.nest(polys);
                for (let poly of polys) {
                    let z = minZ(poly.minZ());
                    if (offover) {
                        let pnew = POLY.offset([poly], -offover, { minArea: 0, open: true });
                        if (pnew) {
                            poly = POLY.setZ(pnew, poly.getZ());
                        } else {
                            continue;
                        }
                    } else {
                        poly = [ poly ];
                    }
                    (zmap[z] = zmap[z] || []).appendAll(poly);
                }
                for (let [zv, polys] of Object.entries(zmap)) {
                    clearZnew(polys, parseFloat(zv), down);
                }
        }
    }

    prepare(ops, progress) {
        let { op, state } = this;
        let { settings } = state;
        let { setTool, setSpindle } = ops;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);
        for (let slice of this.sliceOut) {
            ops.emitTrace(slice);
        }
    }
}

export { OpTrace };
