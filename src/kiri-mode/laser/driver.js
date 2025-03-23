/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.polygons
// dep: geo.point
// dep: kiri.slice
// use: kiri.pack
// use: kiri.render
gapp.register("kiri-mode.laser.driver", [], (root, exports) => {

const { base, kiri } = root;
const { driver, newSlice } = kiri;
const { polygons, newPoint } = base;

const POLY = polygons;
const TYPE = {
    LASER: 0,
    DRAG: 1,
    WJET: 2,
    WEDM: 3
};

driver.LASER = {
    TYPE,
    type: TYPE.LASER,
    name: 'Laser',
    init,
    slice,
    prepare,
    export: exportLaser,
    exportGCode,
    exportSVG,
    exportDXF,
};

function init(kiri, api, current) {
    api.event.on("settings.saved", settings => {
        let ui = kiri.api.ui;
    });
}

function polyLabel(poly, label) {
    console.log('label', label);
}

function sliceEmitObjects(print, slice, groups, opt = { }) {
    let process = print.settings.process,
        { ctOutMark, ctOutStack, ctOutGroup, ctOutShaper, outputLaserLabel } = process,
        grouped = ctOutMark || ctOutGroup,
        label = false && outputLaserLabel,
        simple = opt.simple || false,
        emit = { in: [], out: [], mark: [] },
        lastEmit = opt.lastEmit,
        zcolor = print.settings.process.ctOutZColor;

    function polyOut(poly, group, type, indexed) {
        if (!poly) {
            return;
        }
        if (Array.isArray(poly)) {
            poly.forEach((pi, index) => {
                polyOut(pi, group, type, indexed ? index : undefined);
            });
        } else {
            let pathOpt = zcolor ? {extrude: slice.z, rate: slice.z} : {extrude: 1, rate: 1};
            if (type === "mark") {
                pathOpt.rate = 0.001;
                pathOpt.extrude = 2;
            } else if (label && type === "out") {
                let lbl = index !== undefined ? `${slice.index}-${index}` : `${slice.index}`;
                polyLabel(poly, lbl);
            }
            if (simple) {
                pathOpt.simple = true;
            }
            if (poly.open) {
                pathOpt.open = true;
            }
            emit[type].push(poly);
            print.PPP(poly, group, pathOpt);
            // when stacking (top down widget slices), if the last layer is fully contained
            // by the current layer, then it is "marked" onto the current layer in a different color
            if (ctOutMark && type === "out" && lastEmit) {
                for (let out of lastEmit.out) {
                    if (out.isInside(poly)) {
                        polyOut(out, group, "mark");
                    }
                }
            }
        }
    }

    if (grouped) {
        let group = [];
        let outer = slice.offset;
        let inner = outer.map(poly => poly.inner || []).flat();
        // preserve slice thickness in group
        group.thick = slice.thick;
        // cut inside before outside
        polyOut(inner, group, "in", outer.length > 1);
        polyOut(outer, group, "out", outer.length > 1);
        groups.push(group);
    } else {
        for (let top of slice.offset) {
            let group = [];
            group.thick = slice.thick;
            polyOut([ top ], group, "in");
            polyOut(top.inner || [], group, "out");
            groups.push(group);
        }
    }

    return emit;
};

// convert arc into line segments
function arc(center, rad, s1, s2, out) {
    let a1 = s1.angle;
    let step = 5;
    let diff = s1.angleDiff(s2, true);
    let ticks = Math.abs(Math.floor(diff / step));
    let dir = Math.sign(diff);
    let off = (diff % step) / 2;
    if (off == 0) {
        ticks++;
    } else {
        out.push( center.projectOnSlope(s1, rad) );
    }
    while (ticks-- > 0) {
        out.push( center.projectOnSlope(base.newSlopeFromAngle(a1 + off), rad) );
        a1 += step * dir;
    }
    out.push( center.projectOnSlope(s2, rad) );
}

// start to the "left" of the first point
function addKnifeRadii(poly, tipoff) {
    poly.setClockwise();
    let oldpts = poly.points.slice();
    // find leftpoint and make that the first point
    let start = oldpts[0];
    let startI = 0;
    for (let i=1; i<oldpts.length; i++) {
        let pt = oldpts[i];
        if (pt.x < start.x || pt.y > start.y) {
            start = pt;
            startI = i;
        }
    }
    if (startI > 0) {
        oldpts = oldpts.slice(startI,oldpts.length).appendAll(oldpts.slice(0,startI));
    }

    let lastpt = oldpts[0].clone().move({x:-tipoff,y:0,z:0});
    let lastsl = lastpt.slopeTo(oldpts[0]).toUnit();
    let newpts = [ lastpt, lastpt = oldpts[0].clone() ];
    let tmp;
    for (let i=1; i<oldpts.length + 1; i++) {
        let nextpt = oldpts[i % oldpts.length];
        let nextsl = lastpt.slopeTo(nextpt).toUnit();
        if (lastsl.angleDiff(nextsl) >= 10) {
            if (lastpt.distTo2D(nextpt) >= tipoff) {
                arc(lastpt, tipoff, lastsl, nextsl, newpts);
            } else {
                // todo handle short segments
                // newpts.push(lastpt.projectOnSlope(lastsl, tipoff) );
                // newpts.push( lastpt.projectOnSlope(nextsl, tipoff) );
            }
        }
        newpts.push(nextpt);
        lastsl = nextsl;
        lastpt = nextpt;
    }
    newpts.push( tmp = lastpt.projectOnSlope(lastsl, tipoff) );
    newpts.push( tmp.clone().move({x:tipoff, y:0, z: 0}) );
    poly.open = true;
    poly.points = newpts;
}

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
    let offset = proc.ctSliceKerf || 0;
    let color = settings.controller.dark ? 0xbbbbbb : 0;

    if (proc.ctSliceHeight < 0) {
        return ondone("invalid slice height");
    }

    let { ctSliceSingle, ctSliceHeight, ctSliceHeightMin, ctOmitInner } = proc;
    let bounds = widget.getBoundingBox();
    let points = widget.getPoints();
    let indices = [];

    base.slice(points, {
        zMin: bounds.min.z,
        zMax: bounds.max.z,
        zGen(zopt) {
            let { zMin, zMax, zIndexes } = zopt;
            if (ctSliceSingle) {
                indices = [ ctSliceHeight ];
            } else if (ctSliceHeight) {
                for (let z = zMin + ctSliceHeight / 2; z < zMax; z += ctSliceHeight) {
                    indices.push(z);
                }
                indices;
            } else {
                for (let i = 1; i < zIndexes.length; i++) {
                    indices.push((zIndexes[i-1] + zIndexes[i]) / 2);
                }
                // discard layers too
                if (ctSliceHeightMin) {
                    let last;
                    indices = indices.filter(v => {
                        let ok = true;
                        if (last !== undefined && Math.abs(v - last) < ctSliceHeightMin) {
                            ok = false;
                        } else {
                            last = v;
                        }
                        return ok;
                    });
                }
            }
            return indices;
        },
        onupdate(v) {
            onupdate(v);
        }
    }).then(output => {
        // ensure slice order is high Z to low Z for stacking
        widget.slices = output.slices.map(data => {
            let { z, lines, groups } = data;
            let tops = POLY.nest(groups);
            // for WireEDM, we commonly omit inner polys because we can't
            // navigate to cut them separately unlike laser, water, drag
            if (ctOmitInner) tops.forEach(top => delete top.inner);
            let slice = newSlice(z).addTops(tops);
            slice.index = indices.indexOf(z);
            // create top offsets (even if 0)
            let offsets = slice.offset = offset ?
                POLY.offset(tops, offset, {z: slice.z, miter: 2 / offset}) : tops;
            slice.output().setLayer("object", { line: 0x888800 }).addPolys(tops);
            slice.output().setLayer("cut", { line: color }).addPolys(offsets);
            return slice;
        }).sort((a,b) => b.z - a.z);
        ondone();
    });
};

/**
 * DRIVER PRINT CONTRACT
 *
 * @param {Object} print state object
 * @param {Function} update incremental callback
 */
async function prepare(widgets, settings, update) {
    let device = settings.device,
        process = settings.process,
        print = self.worker.print = kiri.newPrint(settings, widgets),
        isWire = self.worker.mode === 'WEDM',
        knifeOn = self.worker.mode === 'DRAG',
        output = print.output = [],
        totalSlices = 0,
        slices = 0,
        maxZ = 0,
        { bedWidth, bedDepth } = device,
        { ctOutLayer, ctOutTileSpacing } = process,
        { ctOriginCenter, ctOriginBounds } = process,
        { ctOriginOffX, ctOriginOffY } = process,
        { ctOutStack, ctOutMerged, ctOutKnifeTip, ctOutShaper } = process;

    // shim to adapt older code -- should be refactored
    // let pppo = [];
    let pppg = [];
    let tile = [];
    let tiles = [];
    print.PPP = function(poly, group, options) {
        if (!pppg.contains(group)){
            pppg.push(group);
            tiles.push(tile = []);
            tile.num = tiles.length;
        }
        // pppo.push({ poly, group, options });
        tile.push({ poly, group, options });
    };

    // filter ignored widgets
    widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);

    // find max layers (for updates) and Z (for shaper)
    for (let widget of widgets) {
        totalSlices += widget.slices.length;
        maxZ = Math.max(maxZ, widget.bounds.max.z);
    }

    // emit objects from each slice into output array
    let layers = [];
    for (let widget of widgets) {
        if (ctOutStack) {
            // 3d stack output, no merging or layout
            for (let slice of widget.slices) {
                let group = [];
                let polys = [];
                for (let poly of slice.offset) {
                    if (poly.inner) {
                        polys.push(...poly.inner);
                    }
                    polys.push(poly);
                }
                for (let poly of polys) {
                    print.PPP(poly, group, {
                        extrude: 1,
                        rate: 1,
                    });
                }
            }
        } else if (ctOutMerged) {
            // slice stack merging, no layout
            // there are no inner vs outer polys
            // merged polys "increase" their color / weight
            let merged = [];
            for (let slice of widget.slices) {
                let polys = [];
                slice.offset.clone(true).forEach(p => p.flattenTo(polys));
                for (let poly of polys) {
                    let match = false;
                    for (let i=0; i<merged.length; i++) {
                        let mp = merged[i];
                        if (poly.isEquivalent(mp)) {
                            // increase weight
                            match = true;
                            mp.depth++;
                        }
                    }
                    if (!match) {
                        poly.depth = 1;
                        merged.push(poly);
                    }
                }
                update((slices++ / totalSlices) * 0.5, "prepare");
            }
            let gather = [];
            for (let poly of merged) {
                if (knifeOn) {
                    addKnifeRadii(poly, ctOutKnifeTip);
                }
                print.PPP(poly, gather, {
                    extrude: poly.depth,
                    rate: poly.depth * 10
                })
            }
            layers.push(gather);
        } else {
            // output a layer for each slice
            if (knifeOn) {
                for (let slice of widget.slices) {
                    for (let poly of slice.offset) {
                        addKnifeRadii(poly, ctOutKnifeTip);
                        if (poly.inner) poly.inner.forEach(ip => {
                            addKnifeRadii(ip, ctOutKnifeTip);
                        });
                    }
                }
            }
            let lastEmit;
            for (let slice of widget.slices.reverse()) {
                lastEmit = sliceEmitObjects(print, slice, layers, {simple: knifeOn, lastEmit});
                update((slices++ / totalSlices) * 0.5, "prepare");
            }
        }
    }

    // for tile layout packing
    let dw = device.bedWidth / 2,
        dh = device.bedDepth / 2,
        sort = !ctOutLayer,
        spacing = ctOutTileSpacing;

    // compute tile bounds
    for (let tile of tiles) {
        let bounds = base.newBounds();
        tile.forEach(rec => bounds.merge(rec.poly.bounds));
        tile.w = bounds.width();
        tile.h = bounds.height();
        tile.bounds = bounds;
    }

    // pack tiles
    let tp = new kiri.Pack(dw, dh, spacing, { invy:isWire, simple: !sort }).pack(tiles, packer => {
        return packer.rescale(1.1, 1.1);
    });

    // reposition tiles into their packed locations (unless 3d stack)
    if (!ctOutStack)
    for (let tile of tiles) {
        let { fit, bounds } = tile;
        for (let { poly } of tile) {
            poly.setZ(0);
            poly.move({
                x: fit.x - (tp.max.w / 2) - bounds.minx,
                y: fit.y - (tp.max.h / 2) - bounds.miny,
                z: 0}, true);
        }
        tile.bounds = base.newBounds();
        for (let { poly } of tile) {
            tile.bounds.merge(poly.bounds);
        }
    }

    // set starting point based on origin type
    let currentPos =
        ctOriginCenter ? newPoint(0,0,0) :
        ctOriginBounds ? newPoint(
            - tp.max.w/2 - (ctOriginOffX || 0),
            - tp.max.h/2 - (ctOriginOffY || 0), 0
        ) :
        newPoint(-dw, -dh, 0);

    // output tiles starting with closest to origin
    let remain = tiles.slice();
    while (remain.length) {
        let closest = ctOutStack ?
            { dist: 0, tile: remain[0] } :
            { dist: Infinity };
        for (let tile of remain) {
            for (let { poly } of tile) {
                for (let p of poly.points) {
                    let pd = currentPos.distTo2D(p);
                    if (pd < closest.dist) {
                        closest.dist = pd;
                        closest.tile = tile;
                    }
                }
            }
        }
        if (!closest.tile) throw "no closest found";
        for (let { poly, group, options } of closest.tile) {
            currentPos = print.polyPrintPath(poly, currentPos, group, options);
            if (!output.contains(group)) {
                output.push(group);
            }
        }
        remain.remove(closest.tile);
    }

    // clone output points to prevent double offsetting during export
    for (let layer of output) {
        for (let rec of layer) {
            rec.point = rec.point.clone();
        }
    }

    return kiri.render.path(output, (progress, layer) => {
        if (ctOutShaper) {
            for (let layer of output) {
                for (let out of layer) {
                    out.point.zi = maxZ - out.point.z;
                }
            }
        }
        update(0.5 + progress * 0.5, "render", layer);
    }, { thin: true, z: ctOutStack ? undefined : 0, action: "cut", moves: process.knifeOn });
};

function exportLaser(print, online, ondone) {
    ondone(print.output);
}

/**
 *
 */
function exportElements(settings, output, onpre, onpoly, onpost, onpoint, onlayer) {
    let { process, device } = settings,
        { bedWidth, bedDepth } = device,
        { ctOriginCenter, ctOriginBounds } = process,
        { outputInvertX, outputInvertY } = process,
        { ctOriginOffX, ctOriginOffY } = process,
        { ctOutPower, ctOutSpeed, maxZ } = process,
        last,
        point,
        poly = [],
        off = ctOriginBounds ? {x:ctOriginOffX||0, y:ctOriginOffY||0} : {x:0, y:0},
        min = {x:0, y:0},
        max = {x:0, y:0},
        size = {w:0, h:0};

    // compute bounds for entire output
    output.forEach(layer => {
        layer.forEach(out => {
            point = out.point;
            if (outputInvertX) point.x = -point.x;
            if (outputInvertY) point.y = -point.y;
            min.x = Math.min(min.x, point.x);
            max.x = Math.max(max.x, point.x);
            min.y = Math.min(min.y, point.y);
            max.y = Math.max(max.y, point.y);
        });
    });
    size.w = max.x - min.x;
    size.h = max.y - min.y;

    let bounds = base.newBounds();
    if (ctOriginCenter) {
        // place origin at geometric center of all points
        // regardless of workspace size
        for (let layer of output) {
            for (let out of layer) {
                point = out.point;
                point.x = point.x - min.x - size.w / 2 + off.x;
                point.y = point.y - min.y - size.h / 2 + off.y;
                bounds.update(point);
            }
        }
        max.x = max.x - min.x + off.x;
        max.y = max.y - min.y + off.y;
        min.x = 0;
        min.y = 0;
    } else if (ctOriginBounds) {
        // place origin at min x,y of all points
        for (let layer of output) {
            for (let out of layer) {
                point = out.point;
                point.x = point.x - min.x + off.x;
                point.y = point.y - min.y + off.y;
                bounds.update(point);
            }
        }
        max.x = max.x - min.x + off.x;
        max.y = max.y - min.y + off.y;
        min.x = 0;
        min.y = 0;
    } else {
        // place origin at min x,y taking into account
        // each layer's relative position
        let w = bedWidth;
        let h = bedDepth;
        for (let layer of output) {
            for (let out of layer) {
                point = out.point;
                point.x += w / 2 + off.x;
                point.y += h / 2 + off.y;
                bounds.update(point);
            }
        }
        max.x = w + off.x;
        max.y = h + off.y;
        min.x = 0;
        min.y = 0;
    }

    onpre(min, max, ctOutPower, ctOutSpeed);

    // output each layer with moves between them
    output.forEach((layer, index) => {
        let thick = 0;
        let color = 0;
        layer.forEach((out, li) => {
            thick = out.thick;
            point = out.point;
            if (onlayer) {
                onlayer(index, point.z, out.thick, output.length);
            }
            if (out.emit) {
                color = out.emit;
                if (last && poly.length === 0) {
                    poly.push(onpoint(last));
                }
                poly.push(onpoint(point));
            } else if (poly.length > 0) {
                onpoly(poly, color, thick);
                poly = [];
            }
            last = point;
        });
        if (poly.length > 0) {
            onpoly(poly, color, thick);
            poly = [];
        }
    });

    onpost();
};

/**
 *
 */
function exportGCode(settings, data) {
    let lines = [], dx = 0, dy = 0, z = 0, feedrate;
    let dev = settings.device;
    let proc = settings.process;
    let space = dev.gcodeSpace ? ' ' : '';
    let max_power = dev.laserMaxPower || 255;
    let power = max_power;
    let cut_on = dev.gcodeLaserOn || dev.gcodeWaterOn || dev.gcodeKnifeDn || [];
    let cut_off = dev.gcodeLaserOff || dev.gcodeWaterOff || dev.gcodeKnifeUp || [];
    let knifeOn = proc.knifeOn;
    let knifeDepth = proc.ctOutKnifeDepth;
    let passes = knifeOn ? proc.ctOutKnifePasses : 1;

    exportElements(
        settings,
        data,
        function(min, max, pct, speed) {
            let width = (max.x - min.x),
                height = (max.y - min.y);

            dx = min.x;
            dy = min.y;
            feedrate = `${space}F${speed}`;
            power = (max_power * (pct / 100)).toFixed(3);

            (dev.gcodePre || []).forEach(line => {
                lines.push(line);
            });
        },
        function(poly, color, thick) {
            if (knifeOn) {
                lines.push(`; start new poly id=${poly.id} len=${poly.length}`);
            }
            for (let i=1; i<passes + 1; i++) {
                poly.forEach(function(point, index) {
                    if (index === 0) {
                        if (knifeOn) {
                            // lift
                            lines.appendAll(['; drag-knife lift', `G0${space}Z5`]);
                        }
                        lines.push(`G0${space}${point}`);
                        if (knifeOn) {
                            // drop
                            lines.appendAll(['; drag-knife down', `G0${space}Z${-i * knifeDepth}`]);
                        }
                    } else if (index === 1) {
                        cut_on.forEach(line => {
                            line = line.replace('{power}', power);
                            line = line.replace('{color}', color);
                            line = line.replace('{thick}', thick);
                            line = line.replace('{z}', z);
                            lines.push(line);
                        });
                        lines.push(`G1${space}${point}${feedrate}`);
                    } else {
                        lines.push(`G1${space}${point}`);
                    }
                });
                cut_off.forEach(line => {
                    lines.push(line);
                });
            }
            if (knifeOn) {
                lines.appendAll([`G0${space}Z5`]);
            }
        },
        function() {
            (dev.gcodePost || []).forEach(line => {
                lines.push(line);
            });
        },
        function(point) {
            z = point.z;
            return `X${(point.x - dx).toFixed(3)}${space}Y${(point.y - dy).toFixed(3)}`;
        },
        function(layer, z, thick, layers) {
            // ununsed
        }
    );

    return lines.join('\n');
};

/**
 *
 */
function exportSVG(settings, data, cut_color) {
    let { process } = settings;
    let { ctOutInches, ctOutStack, ctOutShaper } = process;
    let swidth = "0.1mm";
    let zcolor = process.ctOutZColor ? 1 : 0;
    let lines = [], dx = 0, dy = 0, my, z = 0;
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
        settings,
        data,
        function(min, max) {
            let width = (max.x - min.x),
                height = (max.y - min.y);
            dx = min.x;
            dy = min.y;
            my = max.y;
            lines.push('<?xml version="1.0" standalone="no"?>');
            lines.push('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">');
            let svg = ['<svg xmlns="http://www.w3.org/2000/svg"'];
            if (ctOutShaper) {
                svg.push('xmlns:shaper="http://www.shapertools.com/namespaces/shaper"');
            }
            if (ctOutInches) {
                width = (width / 25.4).round(2);
                height = (height / 25.4).round(2);
                svg.push(`width="${width}in" height="${height}in" viewBox="0 0 ${width} ${height}"`);
            } else {
                svg.push(`width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"`);
            }
            lines.push(svg.join(' ') + ' version="1.1">');
        },
        function(poly, color, thick) {
            let cout = zcolor || colors[((color-1) % colors.length)];
            if (ctOutStack) {
                let def = ["path"];
                if (z !== undefined && ctOutShaper) {
                    if (ctOutInches) {
                        def.push(`shaper:cutDepth="${(z / 25.4).toFixed(2)}in"`);
                    } else {
                        def.push(`shaper:cutDepth="${(z).toFixed(2)}mm"`);
                    }
                    def.push(`shaper:cutType="online"`);
                    // def.push(`shaper:cutOffset="0in"`);
                    // def.push(`shaper:toolDia="0in"`);
                } else if (z !== undefined) {
                    def.push(`z="${z}"`);
                }
                let path = poly.map((xy, i) => i > 0 ? `L${xy}` : `M${xy}`);
                let std = ctOutShaper ? '' : `fill="none" stroke="${cout}" stroke-width="${swidth}" `;
                lines.push(`<${def.join(' ')} d="${path.join(' ')}" ${std}/>`);
            } else {
                let def = ["polyline"];
                if (z !== undefined) def.push(`z="${z}"`);
                if (thick !== undefined) def.push(`h="${thick}"`);
                lines.push(`<${def.join(' ')} points="${poly.join(' ')}" fill="none" stroke="${cout}" stroke-width="${swidth}" />`);
            }
        },
        function() {
            lines.push("</svg>");
        },
        function(point) {
            z = ctOutStack ? (point.zi ?? point.z) : undefined;
            let px = point.x - dx;
            let py = my - point.y - dy;
            // convert to imperial for stacked
            if (ctOutInches) {
                px /= 25.4;
                py /= 25.4;
            }
            return base.util.round(px, 3) + "," + base.util.round(py, 3);
        },
        function(layer, z, thick, layers) {
            if (zcolor) {
                zcolor = Math.round(((layer + 1) / layers) * 0xffffff).toString(16);
                zcolor = `#${zcolor.padStart(6,0)}`;
            }
        }
    );

    return lines.join('\n');
};

/**
 *
 */
function exportDXF(settings, data) {
    let lines = [];

    exportElements(
        settings,
        data,
        function(min, max) {
            lines.appendAll([
                "  0",
                "SECTION",
                "  2",
                "HEADER",
                "  0",
                "ENDSEC",
                "  0",
                "SECTION",
                "  2",
                "TABLES",
                "  0",
                "ENDSEC",
                "  0",
                "SECTION",
                "  2",
                "BLOCKS",
                "  0",
                "ENDSEC",
                "  0",
                "SECTION",
                "  2",
                "ENTITIES",
            ]);
        },
        function(poly) {
            lines.appendAll([
                "  0",
                "POLYLINE",
                "  8",
                "0",
                "  66",
                "1",
                "  70",
                "1",
            ]);

            poly.forEach(point => {
                lines.appendAll([
                    '  0',
                    'VERTEX',
                    '  8',
                    '0',
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
                'SECTION',
                '  2',
                'OBJECTS',
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

});
