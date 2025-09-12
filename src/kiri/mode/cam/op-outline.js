/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../../geo/polygon.js';
import { newSlice } from '../../core/slice.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { util as base_util } from '../../../geo/base.js';
import { poly2polyEmit } from '../../../geo/paths.js';
import { newPoint } from '../../../geo/point.js';
import { addDogbones } from './slice.js';

class OpOutline extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, widget, slicer, addSlices, tshadow, thruHoles, unsafe, color } = state;
        let { updateToolDiams, tabs, cutTabs, cutPolys, workarea, zMax, shadowAt } = state;
        let { process, stock } = settings;

        if (op.down <= 0) {
            throw `invalid step down "${op.down}"`;
        }
        let toolDiam = this.toolDiam = new Tool(settings, op.tool).fluteDiameter();
        updateToolDiams(toolDiam);

        let shadow = [];
        let slices = [];
        let intopt = {
            off: 0.01,
            fit: true,
            down: true,
            min: Math.max(0, workarea.bottom_cut),
            max: workarea.top_z
        };
        let indices = slicer.interval(op.down, intopt);
        let trueShadow = process.camTrueShadow === true;
        let lastShadowZ;
        // shift out first (top-most) slice
        indices.shift();
        // add flats to shadow
        const flats = Object.keys(slicer.zFlat)
            .map(v => (parseFloat(v) - 0.01).round(5))
            .filter(v => v > 0 && indices.indexOf(v) < 0);
        indices = indices.appendAll(flats).sort((a,b) => b-a);
        let cnt = 0;
        let tot = 0;
        if (op.outside && !op.inside) {
            // console.log({outline_bypass: indices, down: op.down});
            indices.forEach((ind,i) => {
                if (flats.indexOf(ind) >= 0) {
                    // exclude flats
                    return;
                }
                let slice = newSlice(ind);
                slice.shadow = shadow.clone(true);
                slices.push(slice);
            });
        } else
        await slicer.slice(indices, { each: data => {
            shadow = unsafe ? data.tops : POLY.union(shadow.slice().appendAll(data.tops), 0.01, true);
            if (flats.indexOf(data.z) >= 0) {
                // exclude flats injected to complete shadow
                return;
            }
            data.shadow = trueShadow ? shadowAt(data.z, lastShadowZ) : shadow.clone(true);
            data.slice.shadow = data.shadow;
            // data.slice.tops[0].inner = data.shadow;
            // data.slice.tops[0].inner = POLY.setZ(tshadow.clone(true), data.z);
            slices.push(data.slice);
            // data.slice.xray();
            // onupdate(0.2 + (index/total) * 0.1, "outlines");
            progress(0.5 + 0.5 * (++cnt / tot));
            lastShadowZ = data.z;
        }, progress: (index, total) => {
            tot = total;
            progress((index / total) * 0.5);
        } });
        shadow = POLY.union(shadow.appendAll(state.shadow.base), 0.01, true);

        // start slices at top of stock when `clear top` enabled
        if (op.top) {
            let first = slices[0];
            let zlist = slices.map(s => s.z);
            for (let z of indices.filter(v => v >= zMax)) {
                if (zlist.contains(z)) {
                    continue;
                }
                let add = first.clone(true);
                add.tops.forEach(top => top.poly.setZ(add.z));
                add.shadow = first.shadow.clone(true);
                add.z = z;
                slices.splice(0,0,add);
            }
        }

        // z-thru depth is now handled by regular slicing using workarea.bottom_cut
        // No separate z-thru slices needed

        slices.forEach(slice => {
            let tops = slice.shadow;

            // outside only (use tshadow for entire cut)
            if (op.outside) {
                tops = tshadow;
            }

            if (op.omitthru) {
                // eliminate thru holes from shadow
                for (let hole of thruHoles) {
                    for (let top of tops) {
                        if (!top.inner) continue;
                        top.inner = top.inner.filter(innr => {
                            return !innr.isEquivalent(hole, false, 0.1);
                        });
                    }
                }
            }

            if (op.omitvoid) {
                for (let top of tops) {
                    delete top.inner;
                }
            }

            let offset = POLY.expand(tops, toolDiam / 2, slice.z);
            if (!(offset && offset.length)) {
                return;
            }

            // when pocket only, drop first outer poly
            // if it matches the shell and promote inner polys
            if (op.inside) {
                let shell = POLY.expand(tops.clone(), toolDiam / 2);
                offset = POLY.filter(offset, [], function(poly) {
                    if (poly.area() < 1) {
                        return null;
                    }
                    for (let sp=0; sp<shell.length; sp++) {
                        // eliminate shell only polys
                        if (poly.isEquivalent(shell[sp])) {
                            if (poly.inner) return poly.inner;
                            return null;
                        }
                    }
                    return poly;
                });
            } else {
                if (op.wide) {
                    let stepover = toolDiam * op.step;
                    let wideCuts = [] //accumulator for wide cuts
                    for (let c = (op.steps || 1); c > 0; c--){
                        offset.slice().forEach(op => {
                            // clone removes inners but the real solution is
                            // to limit expanded shells to through holes
                            let wideCut = POLY.expand([op.clone(true)], stepover*c, slice.z, [], 1);
                            wideCut.forEach(cut =>{ //set order of cuts when wide
                                cut.order = c
                                if(cut.inner) cut.inner.forEach(inn =>{ inn.order = c })
                            });
                            wideCuts.push(...wideCut)
                        });
                    }
                    offset.appendAll(wideCuts);
                }
            }

            if (op.dogbones && !op.wide) {
                addDogbones(offset, toolDiam / 5);
            }

            if (tabs) {
                tabs.forEach(tab => {
                    tab.off = POLY.expand([tab.poly], toolDiam / 2).flat();
                });
                offset = cutTabs(tabs, offset, slice.z);
            }

            if (process.camStockClipTo && stock.x && stock.y && stock.center) {
                let rect = newPolygon().centerRectangle({x:0,y:0}, stock.x, stock.y);
                offset = cutPolys([rect], offset, slice.z, true);
            }

            // offset.xout(`slice ${slice.z}`);
            slice.camLines = offset;
        });

        // when top expand fails above, it creates an empty slice
        slices = slices.filter(s => s.camLines);

        // project empty up and render
        for (let slice of slices) {
            if (false) slice.output()
                .setLayer("slice", {line: 0xaaaa00}, false)
                .addPolys(slice.topPolys())
            slice.output()
                .setLayer("outline", {face: color, line: color})
                .addPolys(slice.camLines);
        }

        addSlices(slices);
        this.sliceOut = slices;
    }

    prepare(ops, progress) {
        let { op, state, sliceOut } = this;
        let { setTool, setSpindle, setPrintPoint } = ops;
        let { polyEmit, depthOutlinePath } = ops;
        let { camOut, newLayer, printPoint } = ops;
        let { settings, widget } = state;
        let { process, controller } = settings;

        let easeDown = process.camEaseDown;
        let toolDiam = this.toolDiam;
        let cutdir = op.ov_conv;
        let depthFirst = process.camDepthFirst;
        let depthData = [];

        setTool(op.tool, op.rate, op.plunge);
        setSpindle(op.spindle);

        // printpoint becomes NaN in engine mode. not sure why but this fixes it
        if(Object.values(printPoint).some(v=>Number.isNaN(v))){
            printPoint = newPoint(0,0,0);
        }

        for (let slice of sliceOut) {
            let polys = [], t = [], c = [];
            let lines =POLY.flatten(slice.camLines)
            // console.log(lines);
            lines.forEach((poly)=> {
                poly.order = poly.order ?? 0;
                let child = poly.parent;
                if (depthFirst) { poly = poly.clone(); poly.parent = child ? 1 : 0 }
                if (child) c.push(poly); else t.push(poly);
                poly.layer = depthData.layer;
                polys.push(poly);
            });

            // set cut direction on outer polys
            POLY.setWinding(t, !cutdir);
            // set cut direction on inner polys
            POLY.setWinding(c, cutdir);

            if (depthFirst) {
                depthData.push(polys);
            } else {
                let orderSplit = {}
                polys.forEach(poly => {
                    if(poly.order in orderSplit) orderSplit[poly.order].push(poly);
                    else orderSplit[poly.order] = [poly];
                })
                Object.entries(orderSplit) //split the polys by order
                .sort((a,b) => -(a[0] - b[0] )) //sort by order (highest first)
                .forEach(([order, orderPolys]) => { // emit based on closest for each order
                    let polyLast;
                    // console.log({order, orderPolys});
                    printPoint = poly2polyEmit(orderPolys, printPoint, function(poly, index, count) {
                        polyLast = polyEmit(poly, index, count, polyLast);
                    }, {
                        swapdir: false,
                        weight: process.camInnerFirst
                    });
                })
                newLayer();
            }
        }

        if (depthFirst) {
            let flatLevels = depthData.map(level => {
                return POLY.flatten(level.clone(true), [], true).filter(p => !(p.depth = 0));
            }).filter(l => l.length > 0);
            if (flatLevels.length && flatLevels[0].length) {
                // start with the smallest polygon on the top
                printPoint = flatLevels[0]
                    .sort((a,b) => { return a.area() - b.area() })[0]
                    .average();
                // experimental start of ease down
                let ease = op.down && easeDown ? 0.001 : 0;
                printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, false, ease);
                printPoint = depthOutlinePath(printPoint, 0, flatLevels, toolDiam, polyEmit, true, ease);
            }
        }

        setPrintPoint(printPoint);
    }
}

export { OpOutline };
