/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        FDM = KIRI.driver.FDM;

    FDM.init = function(kiri, api) {
        api.event.on("settings.load", (settings) => {
            if (settings.mode !== 'FDM') return;
            settings.process.outputOriginCenter = (settings.device.originCenter || false);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.fdmSupport.marker.style.display = proc.sliceSupportEnable ? 'flex' : 'none';
            api.ui.fdmInfill.marker.style.display = proc.sliceFillSparse > 0 ? 'flex' : 'none';
            api.ui.fdmRaft.marker.style.display = proc.outputRaft ? 'flex' : 'none';
        });
    }

    // FDM.printRender = function(print, options) {
    //     let debug = KIRI.api.const.LOCAL;
    //     let scope = print, emits, last,
    //         moves, moving = true,
    //         opt = options || {},
    //         tools = opt.tools || [],
    //         showmoves = !opt.nomoves,
    //         maxspeed = 0;
    //     // find max speed
    //     scope.output.forEach(function(layerout) {
    //         layerout.forEach(function(out, index) {
    //             if (out.emit && out.speed) {
    //                 maxspeed = Math.max(maxspeed, out.speed);
    //             }
    //         });
    //     });
    //     if (maxspeed === 0) {
    //         maxspeed = 4000;
    //     }
    //     maxspeed *= 1.001;
    //     // render layered output
    //     scope.lines = 0;
    //     scope.output.forEach(function(layerout) {
    //         let move = [], print = [], cprint;
    //         layerout.forEach(function(out, index) {
    //             let point = toPoint(out.point);
    //             if (last) {
    //                 // drop short segments
    //                 // if (point.emit === last.emit && UTIL.distSq(last, point) < 0.001 && point.z === last.z) {
    //                 //     return;
    //                 // }
    //                 if (out.emit > 0) {
    //                     if (moving || !cprint) {
    //                         cprint = base.newPolygon().setOpen(true).append(last);
    //                         print.push({
    //                             poly: cprint,
    //                             speed: out.speed || maxspeed || 4000,
    //                             tool:tools[out.tool]
    //                         });
    //                     }
    //                     try {
    //                         cprint.append(point);
    //                     } catch (e) {
    //                         console.log(e, {cprint});
    //                     }
    //                     moving = false;
    //                 } else {
    //                     cprint = null;
    //                     move.push(last);
    //                     move.push(point);
    //                     moving = true;
    //                 }
    //                 // move direction arrow heads
    //                 if (debug && last.z == point.z) {
    //                     let rs = BASE.newSlope(
    //                         {x: point.x, y: point.y},
    //                         {x: last.x, y: last.y}
    //                     );
    //                     let ao1 = BASE.newSlopeFromAngle(rs.angle + 25);
    //                     let ao2 = BASE.newSlopeFromAngle(rs.angle - 25);
    //                     let sp = BASE.newPoint(point.x, point.y, point.z);
    //                     move.push(sp);
    //                     move.push(sp.projectOnSlope(ao1, BASE.config.debug_arrow));
    //                     move.push(sp);
    //                     move.push(sp.projectOnSlope(ao2, BASE.config.debug_arrow));
    //                 }
    //             }
    //             last = point;
    //         });
    //         emits = KIRI.newLayer(scope.group);
    //         if (showmoves) {
    //             moves = KIRI.newLayer(scope.group);
    //             moves.lines(move, opt.move_color || 0x888888);
    //         }
    //         emits.setTransparent(false);
    //         // emit printing shapes
    //         print.forEach(segment => {
    //             let {poly, speed, tool} = segment;
    //             let off = tool ? (tool.extNozzle || 0.4) / 2 : 0.2;
    //             let sint = Math.min(maxspeed, parseInt(speed));
    //             let rgb = scope.hsv2rgb({h:sint/maxspeed, s:1, v:1});
    //             let color = ((rgb.r * 0xff) << 16) |
    //                 ((rgb.g * 0xff) <<  8) |
    //                 ((rgb.b * 0xff) <<  0);
    //             if (opt.flat) {
    //                 poly = poly.clone().setZ(0);
    //             }
    //             if (opt.aslines) {
    //                 emits.poly(poly, opt.color || color, false, true);
    //             } else {
    //                 // first point may be from the layer below, so use second point
    //                 emits.noodle_open(poly, off - 0.02, color, 0x0, poly.getZ(1));
    //             }
    //         });
    //         emits.renderAll();
    //         if (showmoves) {
    //             moves.render();
    //             scope.movesView.push(moves);
    //         }
    //         scope.printView.push(emits);
    //         scope.lines += print.length;
    //     });
    // }
    //
    // function toPoint(obj) {
    //     return base.newPoint(obj.x, obj.y, obj.z);
    // }

})();
