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

    /**
     * DRIVER SLICE RENDER CONTRACT
     *
     * @param {Object} widget to render
     * @param {number} mode to use to select colors
     */
    FDM.sliceRender = function(widget) {
        return KIRI.Layer.renderSetup().renderSlices(widget.slices);

        let slices = widget.slices;
        let settings = widget.settings;
        let extnum = widget.getExtruder(settings);
        let extarr = settings.device.extruders || [];
        let extinfo = extarr[extnum || 0];
        let extoff = (extinfo.extNozzle || 0.4) / 2;
        let thin = settings.controller.thinRender && settings.mode === 'FDM';

        if (!slices) return;

        // render outline
        slices.forEach(function(s) {
            let layers = s.layers;
            let tops = s.tops;
            let outline = layers.outline;
            let shells = layers.trace;
            let solids = layers.fill;
            let sparse = layers.sparse;
            let support = layers.support;
            let outsolid = layers.solid;
            let outbridge = layers.bridge;
            let outflat = layers.flat;

            outline.clear();
            shells.clear();
            solids.clear();
            sparse.clear();
            support.clear();
            outsolid.clear();
            outbridge.clear();
            outflat.clear();

            outline.setTransparent(true);
            shells.setTransparent(false);
            solids.setTransparent(false);
            sparse.setTransparent(false);
            support.setTransparent(false);
            outsolid.setTransparent(true);
            outbridge.setTransparent(true);
            outflat.setTransparent(true);

            tops.forEach(function(top) {
                // outline
                outline.poly(top.poly, 0xdddddd, true, false);
                outline.solid(top.poly, thin ? 0xdddddd : 0xcccccc);
                if (top.inner) outline.poly(top.inner, 0xdddddd, true);
                // if (top.thinner) outline.poly(top.thinner, 0x559999, true, null);

                // shells
                if (thin) {
                    shells.poly(top.traces, 0x77bbcc, true);
                } else {
                    shells.noodle(top.traces, extoff, 0x88aadd, 0x77bbcc);
                }
                if (top.polish) {
                    shells.poly(top.polish.x, 0x880000, true);
                    shells.poly(top.polish.y, 0x880000, true);
                }

                // solid fill
                if (thin) {
                    solids.lines(top.thin_fill, 0x77bbcc);
                    solids.lines(top.fill_lines, 0x77bbcc);
                } else {
                    solids.noodle_lines(top.thin_fill, extoff, 0x88aadd, 0x77bbcc, s.z);
                    solids.noodle_lines(top.fill_lines, extoff, 0x88aadd, 0x77bbcc, s.z);
                }

                // sparse fill
                if (top.fill_sparse) {
                    top.fill_sparse.forEach(function(poly) {
                        if (thin) {
                            // todo cull polys with single point before this
                            if (poly.length > 1) poly.render(sparse, 0x0, false, true);
                        } else {
                            sparse.noodle_open(poly, extoff, 0x88aadd, 0x77bbcc, s.z);
                        }
                    });
                }

                // support
                if (s.supports) {
                    if (thin) {
                        s.supports.forEach(function(poly) {
                            support.poly(poly, 0xffaadd, true);
                            support.lines(poly.fills, 0xffaadd);
                        });
                    } else {
                        support.noodle(s.supports, extoff, 0xeeaadd, 0x77bbcc);
                        s.supports.forEach(function(poly) {
                            support.noodle_lines(poly.fills, extoff, 0xeeaadd, 0x77bbcc, s.z);
                        });
                    }
                }
            });

            // solid outlines
            let trimmed = s.solids.trimmed;
            if (trimmed) trimmed.forEach(function(poly) {
                poly.setZ(s.z + 0.025);
                outsolid.poly(poly, 0x00cc00, true, false);
                outsolid.solid(poly, 0x00dd00);
            });

            // diff bridges
            if (s.bridges) s.bridges.forEach(function (poly) {
                poly.setZ(s.z + 0.05);
                outbridge.poly(poly, 0x0099ee, true, false);
                outbridge.solid(poly, 0x00aaff);
            });

            // diff flats
            if (s.flats) s.flats.forEach(function (poly) {
                poly.setZ(s.z + 0.05);
                outflat.poly(poly, 0xee0099, true, false);
                outflat.solid(poly, 0xff00aa);
            });

            outline.renderAll();
            shells.renderAll();
            solids.renderAll();
            sparse.renderAll();
            support.renderAll();
            outsolid.renderAll();
            outbridge.renderAll();
            outflat.renderAll();
        });
    }

    FDM.printRender = function(print, options) {
        let debug = KIRI.api.const.LOCAL;
        let scope = print, emits, last,
            moves, moving = true,
            opt = options || {},
            tools = opt.tools || [],
            showmoves = !opt.nomoves,
            maxspeed = 0;
        // find max speed
        scope.output.forEach(function(layerout) {
            layerout.forEach(function(out, index) {
                if (out.emit && out.speed) {
                    maxspeed = Math.max(maxspeed, out.speed);
                }
            });
        });
        if (maxspeed === 0) {
            maxspeed = 4000;
        }
        maxspeed *= 1.001;
        // render layered output
        scope.lines = 0;
        scope.output.forEach(function(layerout) {
            let move = [], print = [], cprint;
            layerout.forEach(function(out, index) {
                let point = toPoint(out.point);
                if (last) {
                    // drop short segments
                    // if (point.emit === last.emit && UTIL.distSq(last, point) < 0.001 && point.z === last.z) {
                    //     return;
                    // }
                    if (out.emit > 0) {
                        if (moving || !cprint) {
                            cprint = base.newPolygon().setOpen(true).append(last);
                            print.push({
                                poly: cprint,
                                speed: out.speed || maxspeed || 4000,
                                tool:tools[out.tool]
                            });
                        }
                        try {
                            cprint.append(point);
                        } catch (e) {
                            console.log(e, {cprint});
                        }
                        moving = false;
                    } else {
                        cprint = null;
                        move.push(last);
                        move.push(point);
                        moving = true;
                    }
                    // move direction arrow heads
                    if (debug && last.z == point.z) {
                        let rs = BASE.newSlope(
                            {x: point.x, y: point.y},
                            {x: last.x, y: last.y}
                        );
                        let ao1 = BASE.newSlopeFromAngle(rs.angle + 25);
                        let ao2 = BASE.newSlopeFromAngle(rs.angle - 25);
                        let sp = BASE.newPoint(point.x, point.y, point.z);
                        move.push(sp);
                        move.push(sp.projectOnSlope(ao1, BASE.config.debug_arrow));
                        move.push(sp);
                        move.push(sp.projectOnSlope(ao2, BASE.config.debug_arrow));
                    }
                }
                last = point;
            });
            emits = KIRI.newLayer(scope.group);
            if (showmoves) {
                moves = KIRI.newLayer(scope.group);
                moves.lines(move, opt.move_color || 0x888888);
            }
            emits.setTransparent(false);
            // emit printing shapes
            print.forEach(segment => {
                let {poly, speed, tool} = segment;
                let off = tool ? (tool.extNozzle || 0.4) / 2 : 0.2;
                let sint = Math.min(maxspeed, parseInt(speed));
                let rgb = scope.hsv2rgb({h:sint/maxspeed, s:1, v:1});
                let color = ((rgb.r * 0xff) << 16) |
                    ((rgb.g * 0xff) <<  8) |
                    ((rgb.b * 0xff) <<  0);
                if (opt.flat) {
                    poly = poly.clone().setZ(0);
                }
                if (opt.aslines) {
                    emits.poly(poly, opt.color || color, false, true);
                } else {
                    // first point may be from the layer below, so use second point
                    emits.noodle_open(poly, off - 0.02, color, 0x0, poly.getZ(1));
                }
            });
            emits.renderAll();
            if (showmoves) {
                moves.render();
                scope.movesView.push(moves);
            }
            scope.printView.push(emits);
            scope.lines += print.length;
        });
    }

    function toPoint(obj) {
        return base.newPoint(obj.x, obj.y, obj.z);
    }

})();
