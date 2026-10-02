/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { OpArea } from './op-area.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { polygons as POLY } from '../../../../geo/polygons.js';

class OpRough extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    // todo: cutThruBypass

    async slice(progress) {
        let { op, state } = this;
        let { newSlicer, shadow, stock, tool, widget } = state;

        let cutOutside = !op.inside;
        let shadowBase = shadow.base;

        if (op.down <= 0) {
            throw `invalid step down "${op.down}"`;
        }

        if (op.all) {
            shadowBase = [ newPolygon().centerRectangle(stock.center, stock.x, stock.y) ];
        }

        let areas = POLY.flatten(shadowBase.map(p => p.clone(true)));
        let ops_list = this.ops_list = [ ];

        ops_list.push(new OpArea(state, {
            rename: op.rename ?? "rough",
            spindle: op.spindle,
            direction: op.direction,
            tool: op.tool,
            rate: op.rate,
            plunge: op.plunge,
            clearing: op.clear,
            mode: 'clear',
            over: op.step,
            down: op.down,
            expand: 0,
            smooth: 0,
            outline: true,
            omitthru: op.omitthru,
            leave_xy: op.leave,
            leave_z: op.leavez,
            ov_botz: op.ov_botz,
            ov_topz: op.ov_topz,
            rotated: true,
            // when true, implicitly limit area clearing to part boundary when inside only (op.inside) is checked
            limitPart: op.inside || op.limitPart,
            areas: { [widget.id]: areas.map(p => p.toArray()) },
            surfaces: {}
        }));

        if (op.flats) {
            // Detect z-heights where flat horizontal faces exist on the model
            let slicer = newSlicer({ zflatup: true });
            let flatZs = Object.entries(slicer.zFlat)
                .filter(row => row[1] > 1)
                .map(row => parseFloat(row[0]))
                .sort((a,b) => b-a);

            if (flatZs.length) {
                let flatOff = 0.01;
                // Slice model just above (+flatOff) and below (-flatOff) detected flat Z heights
                let slicesAbove = await slicer.slice(flatZs.map(z => z + flatOff), { flatoff: 0 });
                let slicesBelow = await slicer.slice(flatZs.map(z => z - flatOff), { flatoff: 0 });

                // Map slice output records by target Z height string representation
                let aboveMap = new Map();
                for (let s of slicesAbove) {
                    aboveMap.set(s.z.toFixed(2), s.tops || []);
                }
                let belowMap = new Map();
                for (let s of slicesBelow) {
                    belowMap.set(s.z.toFixed(2), s.tops || []);
                }

                for (let z of flatZs) {
                    let zAboveKey = (z + flatOff).toFixed(2);
                    let zBelowKey = (z - flatOff).toFixed(2);
                    let topsAbove = aboveMap.get(zAboveKey) || [];
                    let topsBelow = belowMap.get(zBelowKey) || [];

                    // If slicing below flat height yields no geometry (e.g. lowest Z pocket at the bottom of the part),
                    // fall back to using the part shadow at height z as the base area below the flat height.
                    if (!topsBelow.length) {
                        topsBelow = await state.shadowAt(z);
                        if (!topsBelow || !topsBelow.length) {
                            topsBelow = shadowBase;
                        }
                    }

                    // Extract flat face areas at Z height: region present below flat height but absent above
                    // Preserve nested polygon topology (topsBelow, topsAbove) so Clipper subtracts solid regions
                    let flatAreas = [];
                    POLY.subtract(topsBelow, topsAbove, flatAreas, null, z, 0.01);
                    flatAreas = POLY.flatten(flatAreas).filter(p => p && p.area() > 0.01);

                    // Clear only the detected flat face pocket regions for this Z height
                    if (flatAreas.length) {
                        POLY.setZ(flatAreas, z);
                        ops_list.push(new OpArea(state, {
                            rename: op.rename ?? "flats",
                            spindle: op.spindle,
                            direction: op.direction,
                            tool: op.tool,
                            rate: op.rate,
                            plunge: op.plunge,
                            clearing: op.clear,
                            mode: 'clear',
                            over: op.step,
                            down: op.down,
                            expand: 0,
                            smooth: 0,
                            outline: true,
                            omitthru: op.omitthru,
                            leave_xy: op.leave,
                            leave_z: op.leavez,
                            ov_botz: op.ov_botz,
                            ov_topz: op.ov_topz,
                            rotated: true,
                            // when true, implicitly limit flats area clearing to part boundary when inside only (op.inside) is checked
                            limitPart: op.inside || op.limitPart,
                            areas: { [widget.id]: flatAreas.map(p => p.toArray()) },
                            surfaces: {},
                            flats: [ z ],
                            flatOff
                        }));
                    }
                }
            }
        }

        // outside only if we're not clearing all of stock
        if (cutOutside && !op.all) {
            // Cutout trace operation requires area expanded by tool radius (plus leave offset if set)
            let cutoutAreas = POLY.flatten(POLY.expand(shadowBase, tool.fluteDiameter() / 2 - 0.001 + (op.leave ?? 0)));
            ops_list.push(new OpArea(state, {
                rename: op.rename ?? "cutout",
                spindle: op.spindle,
                direction: op.direction === 'climb' ? 'conventional' : 'climb',
                tool: op.tool,
                rate: op.rate,
                plunge: op.plunge,
                mode: 'trace',
                tr_type: 'none',
                down: op.down,
                expand: 0,
                smooth: 1,
                outline: !op.omitthru,
                ov_botz: op.ov_botz,
                ov_topz: op.ov_topz,
                rotated: true,
                areas: { [widget.id]: cutoutAreas.map(p => p.toArray()) },
                surfaces: {},
                thru: true
            }));
        }

        let len = ops_list.length;
        let per = 1 / len;
        let bas = 0;
        for (let op of ops_list) {
            await op.slice(pct => progress(bas + pct * per));
            bas += per;
        }
    }

    async prepare(ops, progress) {
        let { ops_list } = this;
        let { setChangeOp } = ops;
        let len = ops_list.length;
        let per = 1 / len;
        let bas = 0;
        for (let op of ops_list) {
            await op.prepare(ops, pct => progress(bas + pct * per));
            bas += per;
            setChangeOp();
        }
    }
}

export { OpRough };
