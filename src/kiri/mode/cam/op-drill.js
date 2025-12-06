/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from './op.js';
import { Tool } from './tool.js';
import { newPolygon } from '../../../geo/polygon.js';
import { newSlice } from '../../core/slice.js';
import { newPoint } from '../../../geo/point.js';

class OpDrill extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { settings, addSlices, widget, updateToolDiams } = state;
        let { color } = state;
        let { drills } = op

        let drillTool = new Tool(settings, op.tool),
            drillToolDiam = drillTool.fluteDiameter(),
            sliceOut = this.sliceOut = [];

        const allDrills = drills[widget.id] ?? []
        if (allDrills.length === 0) return;

        updateToolDiams(drillToolDiam);

        // drill points to use center (average of all points) of the polygon
        allDrills.forEach((drill) => {
            if (!drill.selected) {
                return
            }

            let slice = newSlice(0);
            if (op.mark) {
                // replace depth with single down peck
                drill.depth = op.down
            }

            drill.zBottom = drill.z - drill.depth;
            // for thru holes, follow z thru when set
            if ((op.thru > 0)) {
                drill.zBottom -= op.thru;
            }

            const poly = newPolygon()
            poly.points.push(newPoint(drill.x, drill.y, drill.z))
            poly.points.push(newPoint(drill.x, drill.y, drill.zBottom))

            slice.camTrace = { tool: op.tool, rate: op.feed, plunge: op.rate };
            slice.camLines = [poly];
            slice.output()
                .setLayer(state.layername, { face: color, line: color })
                .addPolys(slice.camLines);

            addSlices(slice);
            sliceOut.push(slice);
        });
    }

    prepare(ops, progress) {
        let { op, sliceOut } = this;
        let { setTool, setSpindle, setDrill, emitDrills } = ops;

        if (sliceOut.length === 0) return;

        setTool(op.tool, undefined, op.rate);
        setDrill(op.down, op.lift, op.dwell);
        emitDrills(sliceOut.map(slice => slice.camLines).flat());
    }
}

export { OpDrill };
