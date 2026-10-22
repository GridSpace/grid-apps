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
            // 1. Explicit operation Z Top override (op.ov_topz) if specified by user (overrides 'fromTop' completely)
            // 2. Stock top (settings.stock.z) if 'fromTop' is checked and stock top is higher than hole Z
            // 3. Default: Part top (widget.track.top) if fromTop is unchecked and higher than hole Z, or hole Z
            let stockZ = settings.stock?.z;
            let partTop = widget?.track?.top;
            let zTop = drill.z;

            if (op.ov_topz) {
                // Absolute Z Top height override specified by user
                zTop = op.ov_topz;
            } else if (op.fromTop && stockZ && stockZ > drill.z) {
                // Start from stock top when fromTop is selected
                zTop = stockZ;
            } else if (partTop !== undefined && partTop > drill.z) {
                // Start from part top when fromTop is deselected
                zTop = partTop;
            }

            // Extend plunge depth if starting above the hole's surface Z so plunge reaches target hole bottom
            let depth = (zTop > drill.z) ? (drill.depth + (zTop - drill.z)) : drill.depth;

            if (op.mark) {
                // replace depth with single down peck
                depth = op.down;
            }

            // Calculate normal target Z bottom (zTop minus depth, including thru allowance if applicable)
            let targetZBottom = zTop - depth;
            if (op.thru > 0 && !op.mark) {
                targetZBottom -= op.thru;
            }

            // Operation Z Bottom override (op.ov_botz) acts as a floor limit (drill goes no lower than ov_botz)
            if (op.ov_botz !== undefined && op.ov_botz !== 0) {
                drill.zBottom = Math.max(op.ov_botz, targetZBottom);
            } else {
                drill.zBottom = targetZBottom;
            }

            // Honor global process zBottom limit when set
            if (zBottom) drill.zBottom = Math.max(zBottom, drill.zBottom);

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
