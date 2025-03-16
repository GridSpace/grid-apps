/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.polygons
// dep: kiri-mode.cam.driver
gapp.register("kiri-mode.cam.export", (root, exports) => {

const { base, kiri } = root;
const { polygons, util } = base;
const { driver } = kiri;
const { CAM } = driver;

const POLY = polygons;
const PRO = CAM.process;

/**
 * @returns {Array} gcode lines
 */
CAM.export = function(print, online) {
    const widget = print.widgets[0];
    if (!widget) return;

    const { settings } = print;
    const { device, tools } = settings;

    let i,
        time = 0,
        lines = 0,
        bytes = 0,
        opnum = 0,
        factor = 1,
        output = [],
        spindle = 0,
        newSpindle = 0,
        toolChanges = 0,
        spindleMax = device.spindleMax,
        origin = settings.origin || { x: 0, y: 0, z: 0 },
        space = device.gcodeSpace ? ' ' : '',
        isRML = device.gcodeFExt?.toLowerCase() === 'rml',
        stripComments = device.gcodeStrip || false,
        cmdToolChange = device.gcodeChange || [ "M6 T{tool}" ],
        cmdSpindle = device.gcodeSpindle || [ "M3 S{speed}" ],
        cmdDwell = device.gcodeDwell || [ "G4 P{time}" ],
        axis = { X: 'X', Y: 'Y', Z: 'Z', A: 'A', F: 'F'},
        dev = settings.device,
        spro = settings.process,
        maxZd = spro.camFastFeedZ,
        maxXYd = spro.camFastFeed,
        decimals = base.config.gcode_decimals || 3,
        pos = { x:null, y:null, z:null, a:undefined, f:null, t:null, emit:null },
        line,
        cidx,
        mode,
        point,
        points = 0,
        lastGn = '',
        rewrite_comments = false,
        compact_output = false,
        lasering = false,
        laserOp,
        stock = settings.stock || { },
        ztOff = stock.z - widget.track.top,
        bounds = widget.getBoundingBox(),
        zmax = stock.z,
        runbox = {
            max: { x:-Infinity, y:-Infinity, z:-Infinity},
            min: { x:Infinity, y:Infinity, z:Infinity}
        },
        offset = {
            x: -origin.x,
            y:  origin.y,
            z:  spro.camOriginTop ? origin.z - zmax : origin.z
        },
        scale = {
            x: 1,
            y: 1,
            z: 1
        },
        consts = {
            box: runbox,
            tool: 0,
            tool_name: "unknown",
            top: (offset ? dev.bedDepth : dev.bedDepth/2),
            left: (offset ? 0 : -dev.bedWidth/2),
            right: (offset ? dev.bedWidth : dev.bedWidth/2),
            bottom: (offset ? 0 : -dev.bedDepth/2),
            time_sec: 0,
            time_ms: 0,
            time: 0
        };

    function section(section) {
        append();
        online({ section });
    }

    function append(line) {
        if (line) {
            lines++;
            bytes += line.length;
            if (rewrite_comments) {
                const spos = line.indexOf(';');
                if (spos >= 0) {
                    const left = line.substring(0, spos);
                    const right = '(' + line.substring(spos)
                        .replace(/; /g,'')
                        .replace(/;/g,'') + ')';
                    line = [ left, right ].join('');
                }
            }
            output.append(line);
        }
        if (!line || output.length > 1000) {
            online(output.join("\r\n"));
            output = [];
        }
    }

    function filterEmit(array, consts) {
        if (!array) {
            return;
        }
        if (typeof(array) === 'string') {
            array = array.split('\n');
        }
        for (i=0; i<array.length; i++) {
            line = print.constReplace(array[i], consts);
            if (!isRML && stripComments && (cidx = line.indexOf(";")) >= 0) {
                line = line.substring(0, cidx).trim();
                if (line.length === 0) continue;
            }
            if (line.indexOf('G20') === 0) {
                factor = 1/25.4;
                consts.top = (offset ? dev.bedDepth : dev.bedDepth/2) * factor;
                consts.left = (offset ? 0 : -dev.bedWidth/2) * factor;
                consts.right = (offset ? dev.bedWidth : dev.bedWidth/2) * factor;
                consts.bottom = (offset ? 0 : -dev.bedDepth/2) * factor;
            } else if (line.indexOf('G21') === 0) {
                factor = 1;
            }
            append(line);
        }
    }

    function add0(val, opt) {
        let s = val.toString(),
            d = s.indexOf(".");
        if (d < 0 && decimals > 0) {
            return opt ? s : s + '.0';
        } else {
            return val.toFixed(decimals);
        }
    }

    function moveTo(out, opt = {}) {
        let laser = out.type === 'laser';
        let newpos = out.point;

        // no point == dwell
        // out.speed = time to dwell in ms
        if (!newpos) {
            time += out.speed / 60;
            consts.time_sec = out.speed / 1000;
            consts.time_ms = out.speed;
            consts.time = consts.time_sec;
            filterEmit(cmdDwell, consts);
            return;
        }

        newpos.x = util.round(newpos.x, decimals);
        newpos.y = util.round(newpos.y, decimals);
        newpos.z = util.round(newpos.z, decimals);

        // on tool change
        let changeTool = !(out.tool && pos.t) || out.tool.getID() !== pos.t.getID();
        if (changeTool) {
            pos.t = out.tool;
            consts.tool = pos.t.getNumber();
            consts.tool_name = pos.t.getName();
            if (!laserOp && (spro.camToolInit || toolChanges > 0)) {
                filterEmit(cmdToolChange, { ...consts, spindle: newSpindle } );
            }
            toolChanges++;
        }

        // on spindle change (deferred from layer transition so it's post-toolchange)
        if (spindleMax && newSpindle && (changeTool || newSpindle !== spindle || opt.newOp)) {
            spindle = newSpindle;
            if (!laserOp) {
                if (spindle > 0) {
                    let speed = Math.abs(spindle);
                    filterEmit(cmdSpindle, { speed, spindle: speed, rpm: speed });
                } else {
                    append("M4");
                }
            }
        }

        // enforce XY origin at start of print
        if (points === 0 || changeTool) {
            pos.x = pos.y = pos.z = 0;
        }

        // split first move to X,Y then Z for that new location
        // safety to prevent tool crashing
        if (points === 0 || changeTool) {
            points++;
            if (spro.camFirstZMax) {
                moveTo({
                    // speed: Infinity,
                    tool: out.tool,
                    point: { x: pos.x, y: pos.y, z: newpos.z, a: newpos.a }
                }, {
                    dx: 0, dy: 0, dz: 1, time: 0
                });
                moveTo({
                    // speed: Infinity,
                    tool: out.tool,
                    point: { x: newpos.x, y: newpos.y, z: newpos.z, a: pos.a }
                }, {
                    dx: 1, dy: 1, dz: 0, time: 0
                });
            } else {
                moveTo({
                    // speed: Infinity,
                    tool: out.tool,
                    point: { x: newpos.x, y: newpos.y, z: pos.z, a: pos.a }
                }, {
                    dx: 1, dy: 1, dz: 0, time: 0
                });
                moveTo({
                    // speed: Infinity,
                    tool: out.tool,
                    point: { x: newpos.x, y: newpos.y, z: newpos.z, a: newpos.a }
                }, {
                    dx: 0, dy: 0, dz: 1, time: 0
                });
            }
            points--;
            return;
        }

        let speed = out.speed,
            gn = speed ? 'G1' : 'G0',
            nl = (compact_output && lastGn === gn) ? [] : [gn],
            dx = opt.dx || newpos.x - pos.x,
            dy = opt.dy || newpos.y - pos.y,
            dz = opt.dz || newpos.z - pos.z,
            da = newpos.a != pos.a,
            maxf = dz ? maxZd : maxXYd,
            feed = Math.min(speed || maxf, maxf),
            dist = Math.sqrt(dx * dx + dy * dy + dz * dz),
            newFeed = feed && feed !== pos.f;

        // drop dup points (all deltas are 0)
        if (!(dx || dy || dz || da)) {
            return;
        }

        lastGn = gn;

        if (dx || newpos.x !== pos.x) {
            pos.x = newpos.x;
            runbox.min.x = Math.min(runbox.min.x, pos.x);
            runbox.max.x = Math.max(runbox.max.x, pos.x);
            nl.append(space).append(axis.X).append(add0(consts.pos_x =  pos.x * factor));
        }
        if (dy || newpos.y !== pos.y) {
            pos.y = newpos.y;
            runbox.min.y = Math.min(runbox.min.y, pos.y);
            runbox.max.y = Math.max(runbox.max.y, pos.y);
            nl.append(space).append(axis.Y).append(add0(consts.pos_y = pos.y * factor));
        }
        if (dz || newpos.z !== pos.z) {
            pos.z = newpos.z;
            runbox.min.z = Math.min(runbox.min.z, pos.z);
            runbox.max.z = Math.max(runbox.max.z, pos.z);
            nl.append(space).append(axis.Z).append(add0(consts.pos_z = pos.z * factor));
        }
        if (da) {
            pos.a = newpos.a;
            nl.append(space).append(axis.A).append(add0(consts.pos_a = pos.a * -factor));
        }
        if (newFeed) {
            pos.f = feed;
            nl.append(space).append(axis.F).append(add0(consts.feed = feed * factor, true));
        }

        // temp hack to support RML1 dialect from a file extensions trigger
        if (isRML) {
            if (speed) {
                if (newFeed) {
                    append(`VS${feed};`);
                }
                nl = [ axis.Z, add0(pos.x * factor), ",", add0(pos.y * factor), ",", add0(pos.z * factor), ";" ];
            } else {
                nl = [ "PU", add0(pos.x * factor), ",", add0(pos.y * factor), ";" ];
            }
        }

        if (!lasering && laser) {
            // enable laser
            filterEmit(laserOp.on, consts);
        }

        // if (laser && pos.emit !== out.emit) {
        if (laser) {
            nl.append(space).append(`S${add0(out.emit)}`);
        }

        if (laser) {
            pos.emit = out.emit;
        }

        if (lasering && !laser) {
            // disable laser
            filterEmit(laserOp.off, consts);
        }

        // update lasering state
        lasering = laser;

        // update time calculation
        time += opt.time >= 0 ? opt.time : (dist / (pos.f || 1000)) * 60;
        consts.time = Math.round(time);
        // if (comment && !stripComments) {
        //     nl.append(" ; ").append(comment);
        //     nl.append(" ; ").append(points);
        // }
        append(nl.join(''));
        points++;
    }

    // look for SCALE header directive
    let gcodePre = [];
    for (let line of device.gcodePre) {
        if (line.indexOf(';; SCALE ') === 0) {
            try {
                let map = JSON.parse(line.substring(9));
                if (map.X) scale.x = map.X;
                if (map.Y) scale.y = map.Y;
                if (map.Z) scale.z = map.Z;
                if (map.A) scale.a = map.A;
                if (map.DEC !== undefined) decimals = parseInt(map.DEC);
                console.log('export scaling applied', map);
            } catch (e) {
                console.log('malformed scale directive', line);
            }
        } else if (line.indexOf(';; REWRITE-COMMENTS-PARENS') === 0) {
            rewrite_comments = true;
        } else if (line.indexOf(';; DECIMALS') === 0) {
            decimals = parseInt(line.split('=')[1].trim() || 3) || 3;
        } else if (line.indexOf(';; COMPACT-OUTPUT') === 0) {
            compact_output = true;
            stripComments = true;
            space = '';
        } else if (line.indexOf(";; AXISMAP ") === 0) {
            let axmap = JSON.parse(line.substring(11).trim());
            for (let key in axmap) {
                axis[key] = axmap[key];
            }
        } else {
            gcodePre.push(line);
        }
    }

    section('header');
    if (!stripComments) {
        append(`; Generated by Kiri:Moto ${kiri.version}`);
        append(`; ${new Date().toString()}`);
        filterEmit(["; Bed left:{left} right:{right} top:{top} bottom:{bottom}"], consts);
        append(`; Stock X:${stock.x.round(2)} Y:${stock.y.round(2)} Z:${stock.z.round(2)}`);
        append(`; Target: ${settings.filter[settings.mode]}`);
        append("; --- process ---");
        for (let pk in spro) {
            if (pk !== "ops" && pk !== "op2") {
                append("; " + pk + " = " + spro[pk]);
            }
        }
    }

    // collect tool info to add to header
    let toolz = {}, ctool;
    const isOffset = offset && (offset.x || offset.y);
    // remap points as necessary for origins, offsets, inversions
    print.output.forEach(layer => {
        if (!Array.isArray(layer)) {
            return;
        }
        layer.forEach(out => {
            if (out.gcode || out.type === 'lerp') {
                return;
            }
            if (out.tool && out.tool !== ctool) {
                ctool = out.tool;
                toolz[out.tool] = ctool;
            }
            point = out.point;
            if (!point || point.mod) return;
            // ensure not point is modified twice
            point.mod = 1;
            if (isOffset) {
                point.x += offset.x;
                point.y += offset.y;
            }
            if (scale) {
                point.x *= scale.x;
                point.y *= scale.y;
                point.z *= scale.z;
            }
            if (point.a && scale.a) {
                point.a *= scale.a;
            }
            if (spro.outputInvertX) point.x = -point.x;
            if (spro.outputInvertY) point.y = -point.y;
            if (spro.camOriginTop) point.z = point.z - zmax;
        });
    });

    if (!stripComments) {
        // emit tools used in comments
        append("; --- tools ---");
        Object.keys(toolz).sort().forEach(tn => {
            let { number, flute_diam, flute_len, metric } = toolz[tn].tool;
            append(`; tool#=${number} flute=${flute_diam} len=${flute_len} unit=${metric ? 'metric' : 'imperial'}`);
        });
    }
    // emit gcode preamble
    filterEmit(gcodePre, consts);

    // emit all points in layer/point order
    for (let layerout of print.output) {
        const newmode = layerout.mode;
        if (newmode) {
            if (newmode.type === 'laser on') {
                laserOp = newmode;
            } else if (newmode.type === 'laser off') {
                laserOp = undefined;
                // force tool change in case laser tool matches next tool
                pos.t = undefined;
            }
        }
        const firstOut = layerout[0];
        const newOp = newmode && !newmode.silent && mode !== newmode;
        if (newOp) {
            if (mode && !stripComments) {
                append("; ending " + mode.type + " op after " + Math.round(time) + " seconds");
            }
            mode = newmode;
            if (mode) {
                section(`op-${opnum++}-${mode.type}`);
            }
            if (!stripComments && mode) {
                append("; starting " + mode.type + " op");
            }
        }
        newSpindle = layerout.spindle;
        // iterate over layer output records
        layerout.forEach((out, ind) => {
            if (out.type === 'lerp') {
                // suppress display only lerp points
                return;
            }
            if (out.gcode && Array.isArray(out.gcode)) {
                filterEmit(out.gcode, consts);
            } else {
                moveTo(out, { newOp: ind === 0 ? newOp : false });
            }
        });
        if (lasering && laserOp) {
            // disable laser
            filterEmit(laserOp.off, consts);
            lasering = false;
        }
    }

    if (mode && !stripComments) {
        append("; ending " + mode.type + " op after " + Math.round(time) + " seconds");
    }

    // emit gcode post
    section('footer');
    filterEmit(device.gcodePost, consts);

    // flush buffered gcode
    append();

    print.time = time;
    print.lines = lines;
    print.bytes = bytes + lines - 1;
    print.bounds = runbox;
};

});
