/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.LASER) return;

    const KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        DBUG = BASE.debug,
        LASER = KIRI.driver.LASER = {
            slice,
            sliceRender,
            printSetup,
            printRender,
            exportGCode,
            exportSVG,
            exportDXF
        },
        SLICER = KIRI.slicer,
        newPoint = BASE.newPoint;

    /**
     * DRIVER SLICE CONTRACT
     *
     * @param {Object} settings
     * @param {Widget} Widget
     * @param {Function} onupdate (called with % complete and optional message)
     * @param {Function} ondone (called when complete with an array of Slice objects)
     */
    function slice(settings, widget, onupdate, ondone) {
        let proc = settings.process;

        if (proc.laserSliceHeight < 0) {
            return ondone("invalid slice height");
        }

        SLICER.sliceWidget(widget, {
            height: proc.laserSliceHeight, single: proc.laserSliceSingle
        }, function(slices) {
            widget.slices = slices;
            slices.forEach(function(slice, index) {
                slice.doShells(1, -proc.laserOffset);
                onupdate(0.80 + (index/slices.length) * 0.20);
            });
            ondone();
        }, function(update) {
            onupdate(0.0 + update * 0.80)
        });
    };

    function sliceRender(widget) {
        return KIRI.driver.CAM.sliceRender(widget);
    }

    function sliceEmitObjects(print, slice, groups) {
        let start = newPoint(0,0,0);
        let process = print.settings.process;
        let grouped = process.outputLaserGroup;
        let group = [];

        function laserOut(poly, group) {
            if (!poly) {
                return;
            }
            if (Array.isArray(poly)) {
                poly.forEach(function(pi) {
                    laserOut(pi, group);
                });
            } else {
                print.polyPrintPath(poly, start, group, {extrude: 1});
            }
        }

        slice.tops.forEach(function(top) {
            laserOut(top.traces, group);
            laserOut(top.innerTraces(), group);
            if (!grouped) {
                groups.push(group);
                group = [];
            }
        });

        if (grouped) {
            groups.push(group);
        }
    };

    /**
     * DRIVER PRINT CONTRACT
     *
     * @param {Object} print state object
     * @param {Function} update incremental callback
     */
    function printSetup(print, update) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            output = print.output,
            totalSlices = 0,
            slices = 0;

        // find max layers (for updates)
        widgets.forEach(function(widget) {
            totalSlices += widget.slices.length;
        });

        // emit objects from each slice into output array
        widgets.forEach(function(widget) {
            // slice stack merging
            if (process.outputLaserMerged) {
                let merged = [];
                widget.slices.forEach(function(slice) {
                    let polys = [];
                    slice.gatherTopPolys([]).forEach(p => p.flattenTo(polys));
                    polys.forEach(p => {
                        let match = false;
                        for (let i=0; i<merged.length; i++) {
                            let mp = merged[i];
                            if (p.isEquivalent(mp)) {
                                // increase weight
                                match = true;
                                mp.depth++;
                            }
                        }
                        if (!match) {
                            p.depth = 1;
                            merged.push(p);
                        }
                    });
                    update(slices++ / totalSlices);
                });
                let start = newPoint(0,0,0);
                let gather = [];
                merged.forEach(poly => {
                    print.polyPrintPath(poly, start, gather, {
                        extrude: poly.depth,
                        rate: poly.depth * 10
                    });
                });
                output.push(gather);
            } else {
                widget.slices.forEach(function(slice) {
                    sliceEmitObjects(print, slice, output);
                    update(slices++ / totalSlices);
                });
            }
        });

        // compute tile width / height
        output.forEach(function(layerout) {
            let min = {w:Infinity, h:Infinity}, max = {w:-Infinity, h:-Infinity}, p;
            layerout.forEach(function(out) {
                p = out.point;
                out.point = p.clone(); // b/c first/last point are often shared
                min.w = Math.min(min.w, p.x);
                max.w = Math.max(max.w, p.x);
                min.h = Math.min(min.h, p.y);
                max.h = Math.max(max.h, p.y);
            });
            layerout.w = max.w - min.w;
            layerout.h = max.h - min.h;
            // shift objects to top/left of w/h bounds
            layerout.forEach(function(out) {
                p = out.point;
                p.x -= min.w;
                p.y -= min.h;
            });
        });

        // do object layout packing
        let i, m, e,
            MOTO = self.moto,
            mp = [device.bedWidth, device.bedDepth],
            ms = [mp[0] / 2, mp[1] / 2],
            mi = mp[0] > mp[1] ? [(mp[0] / mp[1]) * 10, 10] : [10, (mp[1] / mp[1]) * 10],
            // sort objects by size
            c = output.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h) }),
            p = new MOTO.Pack(ms[0], ms[1], process.outputTileSpacing).fit(c);

        // test different ratios until packed
        while (!p.packed) {
            ms[0] += mi[0];
            ms[1] += mi[1];
            p = new MOTO.Pack(ms[0], ms[1], process.outputTileSpacing).fit(c);
        }

        for (i = 0; i < c.length; i++) {
            m = c[i];
            m.fit.x += m.w + p.pad;
            m.fit.y += m.h + p.pad;
            m.forEach(function(o, i) {
                // because first point emitted twice (begin/end)
                e = o.point;
                e.x += p.max.w / 2 - m.fit.x;
                e.y += p.max.h / 2 - m.fit.y;
                e.z = 0;
            });
        }
    };

    /**
     *
     */
    function exportElements(print, onpre, onpoly, onpost, onpoint) {

        let process = print.settings.process,
            output = print.output,
            last,
            point,
            poly = [],
            min = {x:0, y:0},
            max = {x:0, y:0};

        output.forEach(function(layer) {
            layer.forEach(function(out) {
                point = out.point;
                if (process.outputInvertX) point.x = -point.x;
                if (process.outputInvertY) point.y = -point.y;
                point.x *= process.outputTileScaling;
                point.y *= process.outputTileScaling;
                min.x = Math.min(min.x, point.x);
                max.x = Math.max(max.x, point.x);
                min.y = Math.min(min.y, point.y);
                max.y = Math.max(max.y, point.y);
            });
        });

        if (!process.outputOriginCenter) {
            // normalize against origin lower left
            output.forEach(function(layer) {
                layer.forEach(function(out) {
                    point = out.point;
                    point.x -= min.x;
                    point.y -= min.y;
                });
            });
            max.x = max.x - min.x;
            max.y = max.y - min.y;
            min.x = 0;
            min.y = 0;
        } else {
            // normalize against center of build area
            let w = print.settings.device.bedWidth;
            let h = print.settings.device.bedDepth;
            output.forEach(function(layer) {
                layer.forEach(function(out) {
                    point = out.point;
                    point.x += w/2;
                    point.y += h/2;
                });
            });
            max.x = w;
            max.y = h;
            min.x = 0;
            min.y = 0;
        }

        onpre(min, max, process.outputLaserPower, process.outputLaserSpeed);

        output.forEach(function(layer) {
            let color = 0;
            layer.forEach(function(out) {
                point = out.point;
                if (out.emit) {
                    color = out.emit;
                    if (last && poly.length === 0) {
                        poly.push(onpoint(last));
                    }
                    poly.push(onpoint(point));
                } else if (poly.length > 0) {
                    onpoly(poly, color);
                    poly = [];
                }
                last = point;
            });
            if (poly.length > 0) {
                onpoly(poly, color);
                poly = [];
            }
        });

        onpost();
    };

    /**
     *
     */
    function exportGCode(print) {
        let lines = [], dx = 0, dy = 0, feedrate;
        let dev = print.settings.device;
        let space = dev.gcodeSpace ? ' ' : '';
        let power = 255;
        let laser_on = dev.gcodeLaserOn || [];
        let laser_off = dev.gcodeLaserOff || [];

        exportElements(
            print,
            function(min, max, power, speed) {
                let width = (max.x - min.x),
                    height = (max.y - min.y);

                dx = min.x;
                dy = min.y;
                feedrate = `${space}F${speed}`;
                power = (256 * (power / 100)).toFixed(3);

                (dev.gcodePre || []).forEach(line => {
                    lines.push(line);
                });
            },
            function(poly, color) {
                poly.forEach(function(point, index) {
                    if (index === 0) {
                        lines.push(`G0${space}${point}`);
                    } else if (index === 1) {
                        laser_on.forEach(line => {
                            lines.push(line.replace('{power}', power));
                        });
                        lines.push(`G1${space}${point}${feedrate}`);
                    } else {
                        lines.push(`G1${space}${point}`);
                    }
                });
                laser_off.forEach(line => {
                    lines.push(line);
                });
            },
            function() {
                (dev.gcodePost || []).forEach(line => {
                    lines.push(line);
                });
            },
            function(point) {
                return `X${(point.x - dx).toFixed(3)}${space}Y${(point.y - dy).toFixed(3)}`;
            }
        );

        return lines.join('\n');
    };

    /**
     *
     */
    function exportSVG(print, cut_color) {
        let lines = [], dx = 0, dy = 0, my;
        let colors = [
            "black",
            "purple",
            "blue",
            "red",
            "orange",
            "yellow",
            "green",
            "brown",
            "gray"
        ];

        exportElements(
            print,
            function(min, max) {
                let width = (max.x - min.x),
                    height = (max.y - min.y);
                dx = min.x;
                dy = min.y;
                my = max.y;
                lines.push('<?xml version="1.0" standalone="no"?>');
                lines.push('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">');
                lines.push(`<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" version="1.1">`);
            },
            function(poly, color) {
                let cout = colors[((color-1) % colors.length)];
                lines.push(`<polyline points="${poly.join(' ')}" fill="none" stroke="${cout}" stroke-width="0.1mm" />`);
            },
            function() {
                lines.push("</svg>");
            },
            function(point) {
                return UTIL.round(point.x - dx, 3) + "," + UTIL.round(my - point.y - dy, 3);
            }
        );

        return lines.join('\n');
    };

    /**
     *
     */
    function exportDXF(print) {
        let lines = [];

        exportElements(
            print,
            function(min, max) {
                lines.appendAll([
                    '  0',
                    'SECTION',
                    '  2',
                    'HEADER',
                    '  9',
                    '$ACADVER',
                    '1',
                    'AC1014',
                    '  0',
                    'ENDSEC',
                    '  0',
                    'SECTION',
                    '  2',
                    'ENTITIES',
                ]);
            },
            function(poly) {
                lines.appendAll([
                    '  0',
                    'LWPOLYLINE',
                    '100', // subgroup required
                    'AcDbPolyline',
                    ' 90', // poly vertices
                    poly.length,
                    ' 70', // open
                    '0',
                    ' 43', // constant width line
                    '0.0'
                ]);

                poly.forEach(function(point) {
                    lines.appendAll([
                        ' 10',
                        point.x,
                        ' 20',
                        point.y
                    ]);
                });

                lines.appendAll([
                    '  0',
                    'SEQEND',
                ]);
            },
            function() {
                lines.appendAll([
                    '  0',
                    'ENDSEC',
                    '  0',
                    'EOF',
                ]);
            },
            function(point) {
                return {x:point.x,y:point.y};
            }
        );

        return lines.join('\n');
    };

    function printRender(print) {
        return KIRI.driver.FDM.printRender(print, {aslines: true, nomoves: true});
    }

})();
