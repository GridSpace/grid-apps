/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { Tool } from '../core/tool.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { newSlice } from '../../../core/slice.js';
import { newPoint } from '../../../../geo/point.js';

class OpDrill extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { color, settings, addSlices, widget, updateToolDiams, zBottom } = state;
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

            // Determine starting Z top height:
            // - If 'fromTop' (from stock top) is enabled: start at stock top (settings.stock.z)
            // - If 'fromTop' is disabled: start at part top (widget.track.top)
            let stockZ = settings.stock?.z;
            let partTop = widget?.track?.top;
            let zTop = drill.z;

            if (op.fromTop && stockZ && stockZ > drill.z) {
                // Start from stock top when fromTop is selected
                zTop = stockZ;
            } else if (!op.fromTop && partTop !== undefined && partTop > drill.z) {
                // Start from part top when fromTop is deselected
                zTop = partTop;
            }

            // Extend plunge depth if starting above the hole's surface Z so plunge reaches target hole bottom
            let depth = (zTop > drill.z) ? (drill.depth + (zTop - drill.z)) : drill.depth;

            if (op.mark) {
                // replace depth with single down peck
                depth = op.down;
            }

            drill.zBottom = zTop - depth;

            // honor zBottom when set
            if (zBottom) drill.zBottom = Math.max(zBottom, drill.zBottom);

            // for thru holes, follow z thru when set
            if (op.thru > 0 && !op.mark) {
                drill.zBottom -= op.thru;
            }

            const poly = newPolygon()
            poly.points.push(newPoint(drill.x, drill.y, zTop))
            poly.points.push(newPoint(drill.x, drill.y, drill.zBottom))

            slice.camTrace = { tool: op.tool, rate: op.feed, plunge: op.rate };
            slice.camLines = [poly];
            slice.travelBounds = newPolygon().centerCircle(drill, drillToolDiam, 10);
            slice.output()
                .setLayer(state.layername, { face: color, line: color })
                .addPolys(slice.camLines);

            addSlices(slice);
            sliceOut.push(slice);
        });
    }

    prepare(ops, progress) {
        let { op, sliceOut } = this;
        let { setTool, setSpindle, setDrill, emitDrills, setTravelBoundary } = ops;

        if (sliceOut.length === 0) return;

        setTool(op.tool, undefined, op.rate);
        setDrill(op.down, op.lift, op.dwell);
        setTravelBoundary(sliceOut.map(slice => slice.travelBounds));
        emitDrills(sliceOut.map(slice => slice.camLines).flat());
    }
}

export { OpDrill };
