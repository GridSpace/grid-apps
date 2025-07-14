/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../../geo/polygon.js';
import { newSlice } from '../../core/slice.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { util as base_util } from '../../../geo/base.js';
import { poly2polyEmit } from '../../../geo/paths.js';

class OpRough extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, slicer, addSlices, unsafe, color } = state;
        let { updateToolDiams, thruHoles, tabs, cutTabs, cutPolys } = state;
        let { ztOff, zMax, shadowAt, isIndexed} = state;
        let { workarea } = state;
        let { process, stock } = settings;

        if (op.down <= 0) {
            throw `invalid step down "${op.down}"`;
        }

        let roughIn = op.inside;
        let roughDown = op.down;
        let roughLeave = op.leave || 0;
        let roughLeaveZ = op.leavez || 0;
        let roughStock = op.all && isIndexed;
        let toolDiam = new Tool(settings, op.tool).fluteDiameter();
        let trueShadow = process.camTrueShadow === true;

        updateToolDiams(toolDiam);

        // clear the stock above the area to be roughed out
        if (workarea.top_z > workarea.top_part) {
            let shadow = state.shadow.base.clone();
            let step = toolDiam * op.step;
            let inset = roughStock ?
                POLY.offset([ newPolygon().centerRectangle(stock.center, stock.x, stock.y) ], step) :
                POLY.offset(shadow, roughIn ? step : step + roughLeave + toolDiam / 2);
            let facing = POLY.offset(inset, -step, { count: 999, flat: true });
            let zdiv = ztOff / roughDown;
            let zstep = (zdiv % 1 > 0) ? ztOff / (Math.floor(zdiv) + 1) : roughDown;
            if (ztOff === 0) {
                // compensate for lack of z top offset in this scenario
                ztOff = zstep;
            }
            let zsteps = Math.round(ztOff / zstep);
            let camFaces = this.camFaces = [];
            let zstart = zMax + ztOff - zstep;
            for (let z = zstart; zsteps > 0; zsteps--) {
                let slice = newSlice();
                slice.z = z;
                slice.camLines = POLY.setZ(facing.clone(true), slice.z + roughLeaveZ);
                slice.output()
                    .setLayer("face", {face: color, line: color})
                    .addPolys(slice.camLines);
                addSlices(slice);
                camFaces.push(slice);
                z -= zstep;
            }
        }

        // create roughing slices
        let flats = [];
        let shadow = [];
        let slices = [];
        let indices = slicer.interval(roughDown, {
            down: true, min: 0, fit: true, off: 0.01
        });

        // shift out first (top-most) slice
        indices.shift();

        // find flats and add to indices for slicing
        if (op.flats) {
            let flatArea = (Math.PI * (toolDiam/2) * (toolDiam/2)) / 2;
            let flats = Object.entries(slicer.zFlat)
                .filter(row => row[1] > flatArea)
                .map(row => row[0])
                .map(v => parseFloat(v).round(5))
                .filter(v => v >= workarea.bottom_z);
            flats.forEach(v => {
                if (!indices.contains(v)) {
                    indices.push(v);
                }
            });
            indices = indices.sort((a,b) => { return b - a });
            // if layer is not on a flat and next one is,
            // then move this layer up to mid-point to previous layer
            // this is not perfect. the best method is to interpolate
            // between flats so that each step is < step down. on todo list
            for (let i=1; i<indices.length-1; i++) {
                const prev = indices[i-1];
                const curr = indices[i];
                const next = indices[i+1];
                if (!flats.contains(curr) && flats.contains(next)) {
                    // console.log('move',curr,'up toward',prev,'b/c next',next,'is flat');
                    indices[i] = next + ((prev - next) / 2);
                }
            }
        } else {
            // add flats to shadow
            flats = Object.keys(slicer.zFlat)
                .map(v => (parseFloat(v) - 0.01).round(5))
                .filter(v => v > 0 && indices.indexOf(v) < 0);
            indices = indices.appendAll(flats).sort((a,b) => b-a);
        }

        indices = indices.filter(v => v >= workarea.bottom_z);
        // console.log('indices', ...indices, {zBottom});

        let cnt = 0;
        let tot = 0;
        await slicer.slice(indices, { each: data => {
            shadow = unsafe ? data.tops : POLY.union(shadow.slice().appendAll(data.tops), 0.01, true);
            if (flats.indexOf(data.z) >= 0) {
                // exclude flats injected to complete shadow
                return;
            }
            if (data.z > workarea.top_z) {
                return;
            }
            data.shadow = trueShadow ? shadowAt(data.z) : shadow.clone(true);
            data.slice.shadow = data.shadow;
            slices.push(data.slice);
            progress(0.25 + 0.25 * (++cnt / tot));
        }, progress: (index, total) => {
            tot = total;
            progress((index / total) * 0.25);
        } });

        if (trueShadow) {
            shadow = state.shadow.base.clone(true);
        } else {
            shadow = POLY.union(shadow.appendAll(state.shadow.base), 0.01, true);
        }

        // inset or eliminate thru holes from shadow
        shadow = POLY.flatten(shadow.clone(true), [], true);
        thruHoles.forEach(hole => {
            shadow = shadow.map(p => {
                if (p.isEquivalent(hole)) {
                    let po = POLY.offset([p], -(toolDiam / 2 + roughLeave + 0.05));
                    return po ? po[0] : undefined;
                } else {
                    return p;
                }
            }).filter(p => p);
        });
        shadow = POLY.nest(shadow);
        if (op.voids) {
            // eliminate voids from shadow when "clear voids" enables
            for (let s of shadow) s.inner = undefined;
        }

        // shell = shadow expanded by half tool diameter + leave stock
        const sadd = roughIn ? toolDiam / 2 : toolDiam / 2;
        const shell = roughStock ?
            POLY.offset([ newPolygon().centerRectangle(stock.center, stock.x, stock.y) ], sadd) :
            POLY.offset(shadow, sadd + roughLeave);

        slices.forEach((slice, index) => {
            let offset = [shell.clone(true),slice.shadow.clone(true)].flat();
            let flat = POLY.flatten(offset, [], true);
            let nest = POLY.setZ(POLY.nest(flat), slice.z);

            // inset offset array by 1/2 diameter then by tool overlap %
            offset = POLY.offset(nest, [-(toolDiam / 2 + roughLeave), -toolDiam * op.step], {
                minArea: Math.min(0.01, toolDiam * op.step / 4),
                z: slice.z,
                count: 999,
                flat: true,
                call: (polys, count, depth) => {
                    // used in depth-first path creation
                    polys.forEach(p => {
                        p.depth = depth;
                        if (p.inner) {
                            p.inner.forEach(p => p.depth = depth);
                        }
                    });
                }
            }) || [];

            // add outside pass if not inside only
            if (!roughIn && !roughStock) {
                const outside = POLY.offset(shadow.clone(), toolDiam / 2 + roughLeave, {z: slice.z});
                if (outside) {
                    outside.forEach(p => p.depth = -p.depth);
                    offset.appendAll(outside);
                }
            }

            if (tabs) {
                tabs.forEach(tab => {
                    tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
                });
                offset = cutTabs(tabs, offset, slice.z);
            }

            if (!offset) return;

            if (process.camStockClipTo && stock.x && stock.y && stock.center) {
                let rect = newPolygon().centerRectangle(stock.center, stock.x, stock.y);
                offset = cutPolys([rect], offset, slice.z, true);
            }

            // elimate double inset on inners
            offset.forEach(op => {
                if (op.inner) {
                    let pv1 = op.perimeter();
                    let newinner = [];
                    op.inner.forEach(oi => {
                        let pv2 = oi.perimeter();
                        let pct = pv1 > pv2 ? pv2/pv1 : pv1/pv2;
                        if (pct < 0.98) {
                            newinner.push(oi);
                        }
                    });
                    op.inner = newinner;
                }
            });

            slice.camLines = offset;
            if (roughLeaveZ) {
                // offset roughing in Z as well to minimize
                // tool marks on curved surfaces
                // const roughLeaveZ = 1 * Math.min(roughDown, roughLeave / 2);
                slice.camLines.forEach(p => {
                    p.setZ(p.getZ() + roughLeaveZ);
                });
            }
            if (false) slice.output()
                .setLayer("slice", {line: 0xaaaa00}, true)
                .addPolys(slice.topPolys())
                // .setLayer("top shadow", {line: 0x0000aa})
                // .addPolys(tshadow)
                // .setLayer("rough shadow", {line: 0x00aa00})
                // .addPolys(shadow)
                .setLayer("rough shell", {line: 0xaa0000})
                .addPolys(shell);
            progress(0.5 + 0.5 * (index / slices.length));
        });

        let last = slices[slices.length-1];

        if (workarea.bottom_z < 0)
        for (let zneg of base_util.lerp(0, -workarea.bottom_cut, op.down)) {
            if (!last) continue;
            let add = last.clone(true);
            add.z -= zneg;
            add.camLines = last.camLines.clone(true);
            add.camLines.forEach(p => p.setZ(add.z + roughLeaveZ));
            // add.tops.forEach(top => top.poly.setZ(add.z));
            // add.shadow = last.shadow.clone(true);
            slices.push(add);
        }

        slices.forEach(slice => {
            slice.output()
                .setLayer("roughing", {face: color, line: color})
                .addPolys(slice.camLines);
        });
        this.sliceOut = slices.filter(slice => slice.camLines);

        addSlices(this.sliceOut);
    }

    prepare(ops, progress) {
        let { op, state, sliceOut, camFaces } = this;
        let { setTool, setSpindle, setPrintPoint, sliceOutput, polyEmit } = ops;
        let { camOut, newLayer, printPoint } = ops;
        let { settings } = state;
        let { process } = settings;

        let easeDown = process.camEaseDown;
        let cutdir = op.ov_conv;
        let depthFirst = process.camDepthFirst && !state.isIndexed;
        let depthData = [];

        setTool(op.tool, op.rate, op.plunge);
        setSpindle(op.spindle);

        // output the clearing of stock above roughing
        for (let slice of (camFaces || [])) {
            const level = [];
            for (let poly of slice.camLines) {
                level.push(poly);
                if (poly.inner) {
                    poly.inner.forEach(function(inner) {
                        level.push(inner);
                    });
                }
            }
            // set winding specified in output
            POLY.setWinding(level, cutdir, false);
            poly2polyEmit(level, printPoint, (poly, index, count) => {
                printPoint = polyEmit(poly, index, count, printPoint);
            });
            newLayer();
        }

        // output the roughing passes
        setPrintPoint(printPoint);
        sliceOutput(sliceOut, {
            cutdir,
            depthFirst,
            easeDown: op.down && easeDown ? 0.001 : 0,
            progress: (n,m) => progress(n/m, "routing")
        });
    }
}

export { OpRough };
