/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { OpArea } from './op-area.js';
import { polygons as POLY } from '../../../geo/polygons.js';
import { newPolygon } from '../../../geo/polygon.js';

class OpOutline extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    // todo: wide cutout, dogbones

    async slice(progress) {
        let { op, state } = this;
        let { dogbones, down, inside, omitthru, outside, ov_botz, ov_topz } = op;
        let { plunge, rate, rename, revbones, spindle, tool } = op;
        let { shadow, widget } = state;

        let shadow_base = shadow.base;
        if (!(shadow_base && shadow_base.length)) {
            throw 'missing shadow base';
        }

        let ops_list = this.ops_list = [ ];

        if (outside) {
            let areas = POLY.flatten(POLY.expand(shadow.base, state.tool.fluteDiameter() / 2 - 0.001));
            ops_list.push(new OpArea(state, {
                areas: { [widget.id]: areas.map(p => p.toArray()) },
                dogbones,
                down,
                expand: 0,
                mode: 'trace',
                outline: omitthru,
                ov_botz,
                ov_topz,
                plunge,
                rate,
                rename: rename ?? "outline",
                revbones,
                smooth: 0,
                spindle,
                surfaces: {},
                tool,
                tr_type: 'none',
            }));
        } else {
            let areas = shadow.base.clone(true);
            ops_list.push(new OpArea(state, {
                areas: { [widget.id]: areas.map(p => p.toArray()) },
                dogbones,
                down,
                edgeonly: true,
                expand: 0,
                mode: 'clear',
                ov_botz,
                ov_topz,
                plunge,
                rate,
                rename: rename ?? "outline",
                revbones,
                smooth: 0,
                spindle,
                surfaces: {},
                tool,
            }));
            if (!inside) {
                // add outline
            }
        }

        for (let op of this.ops_list) {
            await op.slice(progress);
        }
    }

    async prepare(ops, progress) {
        for (let op of this.ops_list) {
            await op.prepare(ops, progress);
        }
    }
}

export { OpOutline };
