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

        if (op.omitthru && state.shadow && state.shadow.holes && state.shadow.holes.length) {
            shadowBase = omitMatching(shadowBase, state.shadow.holes);
        }

        if (op.down <= 0) {
            throw `invalid step down "${op.down}"`;
        }

        if (op.all) {
            shadowBase = [ newPolygon().centerRectangle(stock.center, stock.x, stock.y) ];
        }

        let areas = POLY.flatten(POLY.expand(shadowBase, tool.fluteDiameter() / 2 - 0.001));
        let ops_list = this.ops_list = [ ];

        ops_list.push(new OpArea(state, {
            rename: op.rename ?? "rough",
            spindle: op.spindle,
            direction: op.direction,
            tool: op.tool,
            rate: op.rate,
            plunge: op.plunge,
            mode: 'clear',
            over: op.step,
            down: op.down,
            expand: 0,
            smooth: 0,
            outline: true,
            omitthru: op.omitthru,
            sr_type: op.sr_type || 'concentric',
            leave_xy: op.leave,
            leave_z: op.leavez,
            ov_botz: op.ov_botz,
            ov_topz: op.ov_topz,
            rotated: true,
            areas: { [widget.id]: areas.map(p => p.toArray()) },
            surfaces: {}
        }));

        if (op.flats) {
            let slicer = newSlicer({ zflatup: true });
            ops_list.push(new OpArea(state, {
                rename: op.rename ?? "flats",
                spindle: op.spindle,
                direction: op.direction,
                tool: op.tool,
                rate: op.rate,
                plunge: op.plunge,
                mode: 'clear',
                over: op.step,
                down: op.down,
                expand: 0,
                smooth: 0,
                outline: true,
                omitthru: op.omitthru,
                sr_type: op.sr_type || 'concentric',
                leave_xy: op.leave,
                leave_z: op.leavez,
                ov_botz: op.ov_botz,
                ov_topz: op.ov_topz,
                rotated: true,
                areas: { [widget.id]: areas.map(p => p.toArray()) },
                surfaces: {},
                flats: Object.keys(slicer.zFlat).map(v => parseFloat(v)).sort((a,b) => b-a),
                flatOff: 0.01
            }));
        }

        // outside only if we're not clearing all of stock
        if (cutOutside && !op.all) {
            if (op.leave) {
                // recompute area with offset when provided
                areas = POLY.flatten(POLY.expand(shadowBase, tool.fluteDiameter() / 2 - 0.001 + op.leave));
            }
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
                areas: { [widget.id]: areas.map(p => p.toArray()) },
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

function omitMatching(target, matches) {
    target = target.clone(true);
    for (let poly of target.filter(p => p.inner)) {
        poly.inner = poly.inner.filter(inner => {
            let innerCenter = inner.bounds.center();
            for (let ho of matches) {
                if (inner.isEquivalent(ho, false, 0.2)) {
                    return false;
                }
                let hoArea = Math.abs(ho.area());
                let innerArea = Math.abs(inner.area());
                if (hoArea > 0.001 && Math.abs(hoArea - innerArea) / hoArea < 0.2) {
                    if (innerCenter.isInPolygon(ho)) {
                        return false;
                    }
                }
            }
            return true;
        });
    }
    return target;
}

export { OpRough };
