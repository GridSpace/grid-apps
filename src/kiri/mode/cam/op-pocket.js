/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { generate as Topo } from './topo3.js';
import { newPolygon } from '../../../geo/polygon.js';
import { newSlice } from '../../core/slice.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { util as base_util } from '../../../geo/base.js';
import { calc_normal, calc_vertex } from '../../../geo/paths.js';
import { CAM } from './driver-be.js';

const DEG2RAG = Math.PI / 180;

class OpPocket extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        const pocket = this;
        let { op, state } = this;
        let { tool, rate, down, plunge, expand, contour, smooth, tolerance } = op;
        let { ov_botz, ov_conv } = op;
        let { settings, widget, addSlices, zBottom, tabs, color } = state;
        let { updateToolDiams, cutTabs, healPolys, shadowAt, workarea } = state;
        zBottom = ov_botz ? workarea.bottom_stock + ov_botz : zBottom;
        // generate tracing offsets from chosen features
        let sliceOut;
        let pockets = this.pockets = [];
        let camTool = new Tool(settings, tool);
        let toolDiam = camTool.fluteDiameter();
        let toolOver = toolDiam * op.step;
        let cutdir = ov_conv;
        let engrave = contour && op.engrave;
        let zTop = workarea.top_z;
        let devel = settings.controller.devel;
        let smoothVal = (smooth ?? 0) / 10;
        if (contour) {
            down = 0;
            this.contour = {
                axis: "-",
                inside: true,
                nogpu: true,
                step: toolOver,
                tolerance,
                tool,
            };
        }
        updateToolDiams(toolDiam);
        if (tabs) {
            tabs.forEach(tab => {
                tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
            });
        }
        function newPocket() {
            pockets.push(sliceOut = []);
        }
        function newSliceOut(z) {
            let slice = newSlice(z);
            sliceOut.push(slice);
            return slice;
        }
        async function clearZ(polys, z, down) {
            if (down) {
                // adjust step down to a value <= down that
                // ends on the lowest z specified
                let diff = zTop - z;
                down = diff / Math.ceil(diff / down);
            }
            let zs = down ? base_util.lerp(zTop, z, down) : [ z ];
            if (engrave) {
                toolDiam = toolOver;
            }
            if (contour) {
                expand = engrave ? 0 : expand;
            } else if (expand) {
                polys = POLY.offset(polys, expand);
            }
            let zpro = 0, zinc = 1 / (polys.length * zs.length);
            for (let poly of polys) {
                newPocket();
                for (let z of zs) {
                    let clip = [], shadow;
                    if (contour) {
                        if (smooth) {
                            clip = POLY.offset(POLY.offset([ poly ], smoothVal), -smoothVal);
                        } else {
                            clip = [ poly ];
                        }
                    } else {
                        shadow = shadowAt(z);
                        if (smooth) {
                            shadow = POLY.setZ(POLY.offset(POLY.offset(shadow, smoothVal), -smoothVal), z);
                        }
                        POLY.subtract([ poly ], shadow, clip, undefined, undefined, 0);
                        if (op.outline) {
                            POLY.clearInner(clip);
                        }
                    }
                    if (clip.length === 0) {
                        continue;
                    }
                    let slice = newSliceOut(z);
                    let count = engrave ? 1 : 999;
                    slice.camTrace = { tool, rate, plunge };
                    if (toolDiam) {
                        const offs = contour ?
                            [ expand || (-0.02), -toolOver ] :
                            [ -toolDiam / 2, -toolOver ];
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
                    if (contour) {
                        slice.camLines = await pocket.conform(slice.camLines, op.refine, engrave, pct => {
                            progress(0.9 + (zpro + zinc * pct) * 0.1, "conform");
                        });
                    }
                    slice.output()
                        .setLayer(state.layername, {line: color}, false)
                        .addPolys(slice.camLines)
                    if (devel && shadow) slice.output()
                        .setLayer("pocket shadow", {line: 0xff8811}, false)
                        .addPolys(shadow);
                    if (!contour) {
                        progress(zpro, "pocket");
                    }
                    zpro += zinc;
                    addSlices(slice);
                }
            }
        }
        let surfaces = op.surfaces[widget.id] || [];
        let vert = widget.getGeoVertices({ unroll: true, translate: true }).map(v => v.round(4));
        // let vert = widget.getVertices().array.map(v => v.round(4));
        let outline = [];
        let faces = CAM.surface_find(widget, surfaces, (op.follow || 5) * DEG2RAG);
        let zmin = Infinity;
        let j=0, k=faces.length;
        for (let face of faces) {
            let i = face * 9;
            outline.push(newPolygon()
                .add(vert[i++], vert[i++], zmin = Math.min(zmin, vert[i++]))
                .add(vert[i++], vert[i++], zmin = Math.min(zmin, vert[i++]))
                .add(vert[i++], vert[i++], zmin = Math.min(zmin, vert[i++]))
            );
        }
        zmin = Math.max(zBottom, zmin);
        outline = POLY.union(outline, 0.0001, true);
        outline = POLY.setWinding(outline, cutdir, false);
        outline = healPolys(outline);
        if (smooth) {
            outline = POLY.offset(POLY.offset(outline, smoothVal), -smoothVal);
        }
        if (outline.length) {
            // option to skip interior features (holes, pillars)
            if (op.outline) {
                POLY.clearInner(outline);
            }
            await clearZ(outline, zmin + 0.0001, down);
            if (devel && sliceOut?.length) sliceOut[0].output()
                .setLayer("pocket area", {line: 0x1188ff}, false)
                .addPolys(outline)
            progress(1, "pocket");
        }
    }

    // mold cam output lines to the surface of the topo offset by tool geometry
    async conform(camLines, refine, engrave, progress) {
        if (!this.topo) {
            console.log('deferred topo');
            this.topo = await Topo({
                // onupdate: (update, msg) => {
                onupdate: (index, total, msg) => {
                    progress((index / total) * 0.9, msg);
                },
                ondone: (slices) => {
                    // console.log({ contour: slices });
                },
                contour: this.contour,
                state: this.state
            });
        }
        const topo = this.topo;
        // re-segment polygon to a higher resolution
        const hirez = camLines.map(p => p.segment(topo.tolerance * 2));
        // walk points and offset from surface taking into account tool geometry
        let steps = hirez.length;
        let iter = 0;
        for (let poly of hirez) {
            for (let point of poly.points) {
                point.z = engrave ? topo.zAtXY(point.x, point.y) : topo.toolAtXY(point.x, point.y);
            }
            progress((iter++ / steps) * 0.8);
        }
        steps = steps * refine;
        iter = 0;
        // walk points noting z deltas and smoothing z sawtooth patterns
        for (let j=0; j<refine; j++) {
            for (let poly of hirez) {
                const points = poly.points, length = points.length;
                let sn = []; // segment normals
                for (let i=0; i<length; i++) {
                    let p1 = points[i];
                    let p2 = points[(i + 1) % length];
                    sn.push(calc_normal(p1, p2));
                }
                let vn = []; // vertex normals
                for (let i=0; i<length; i++) {
                    let n1 = sn[(i + length - 1) % length];
                    let n2 = sn[i];
                    let vi = calc_vertex(n1, n2, 1);
                    vn.push(vi);
                    let vl = Math.abs(1 - vi.vl).round(2);
                    // vl should be close to zero on smooth / continuous curves
                    // factoring out hard turns, we smooth the z using the weighted
                    // z values of the points before and after the current point
                    if (vl === 0) {
                        let p0 = points[(i + length - 1) % length];
                        let p1 = points[i];
                        let p2 = points[(i + 1) % length];
                        p1.z = (p0.z + p2.z + p1.z) / 3;
                    }
                }

                progress((iter++ / steps) * 0.2 + 0.8);
            }
        }
        // return hirez.map(p => p.midpoints(topo.tolerance * 8));
        return hirez;
    }

    prepare(ops, progress) {
        let { op, state, pockets } = this;
        let { getPrintPoint , pocket, setTool, setSpindle, setTolerance } = ops;
        let { process } = state.settings;

        setTool(op.tool, op.rate);
        setSpindle(op.spindle);

        if (this.topo) {
            setTolerance(this.topo.tolerance);
        }

        // eliminate empty pockets
        pockets = pockets.filter(p => p.length);

        // pockets is an [ array of an [ array of slices ] ]
        // each top level array is a pocket containing a [ z layer array of slices ]
        // follow each pocket to the next closest one from previous exit
        for (;;) {
            let printPoint = getPrintPoint();
            let min = {
                dist: Infinity,
                pocket: undefined
            };
            for (let pocket of pockets.filter(p => !p.used)) {
                let poly = pocket[0].camLines.slice().sort((a,b) => b.area() - a.area())[0];
                if (!poly) continue;
                let find = poly.findClosestPointTo(printPoint);
                if (find.distance < min.dist) {
                    min.pocket = pocket;
                    min.dist = find.distance;
                }
            }
            if (min.pocket) {
                min.pocket.used = true;
                pocket({
                    cutdir: op.ov_conv,
                    depthFirst: process.camDepthFirst && !state.isIndexed,
                    easeDown: op.down && process.easeDown ? op.down : 0,
                    progress: (n,m) => progress(n/m, "pocket"),
                    slices: min.pocket
                });
            } else {
                break;
            }
        }
    }
}

export { OpPocket };
