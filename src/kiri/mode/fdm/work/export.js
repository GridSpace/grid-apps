/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { base, util } from '../../../../geo/base.js';
import { getRangeParameters } from '../core/params.js';
import { FDM } from './init-work.js';
import { version } from '../../../../moto/license.js';

const { config } = base;
const debug = false;

export function fdm_export(print, online, ondone, ondebug) {
    const { widgets, settings, belty, tools, firstTool } = print;
    const { bounds, controller, device, process, filter, mode } = settings;
    const { extruders, fwRetract } = device;
    const { bedWidth, bedDepth, bedRound, bedBelt, maxHeight } = device;
    const { gcodeFan, gcodeLayer, gcodeTrack, gcodePause, gcodeFeature, gcodeChange } = device;

    let model_labels = [];
    for (let widget of widgets) {
        model_labels.push(widget.track.grid_id);
    }

    let layers = print.output,
        extras = device.extras || {},
        isBambu = extras.bbl,
        { extrudeAbs } = device,
        { exportThumb } = controller,
        { extrudeMM, extrudePerMM } = FDM,
        { outputInvertX, outputInvertY } = process,
        timeFactor = (device.gcodeTime || 1) * 1.5,
        decimals = config.gcode_decimals || 4,
        zMoveMax = device.deviceZMax || 0,
        isBelt = bedBelt,
        bedType = isBelt ? "belt" : "fixed",
        time = 0,
        layer = 0,
        layerno = 0,
        pause = [],
        output = [],
        outputLength = 0, // absolute extruder position
        lastProgress = 0,
        progress = 0,
        distance = 0,
        emitted = 0,
        retracted = 0,
        axis = { X:' X', Y:' Y', Z:' Z', E:' E'},
        pos = { x:0, y:0, z:0, f:0 },
        lout = { x:0, y:0, z:0 },
        last = null,
        zpos = 0,
        bmax = 0,
        belt_add_y = (process.firstLayerYOffset || 0) - (belty || 0),
        oloops = process.outputLoops || 0,
        zhop = process.zHopDistance || 0, // range
        lineWidth = process.sliceLineWidth || 0,
        seekMMM = process.outputSeekrate * 60,
        retDist = process.outputRetractDist || 0, // range
        retSpeed = process.outputRetractSpeed * 60 || 1, // range
        retDwell = process.outputRetractDwell || 0, // range
        scarfZ = process.outputScarfLength ? true : false,
        originCenter = device.originCenter || bedRound,
        offset = originCenter ? {
            x: 0,
            y: 0,
            z: 0
        } : {
            x: bedWidth/2,
            y: isBelt ? 0 : bedDepth/2,
            z: 0
        },
        tool = firstTool || 0,
        extruder = extruders[tool],
        offset_x = extruder.extOffsetX,
        offset_y = extruder.extOffsetY,
        extrudeSet = false,
        nozzleTemp = process.firstLayerNozzleTemp || process.outputTemp,
        bedTemp = process.firstLayerBedTemp || process.outputBedTemp,
        fanSpeedSave = undefined,
        fanSpeedBase = 0,
        fanSpeed = 0,
        lastNozzleTemp = nozzleTemp,
        lastBedTemp = bedTemp,
        lastFanSpeed = fanSpeed,
        subst = {
            minx: bounds.min.x + offset.x,
            maxx: bounds.max.x + offset.x,
            miny: bounds.min.y + offset.y,
            maxy: bounds.max.y + offset.y,
            travel_speed: seekMMM,
            retract_speed: retSpeed,
            retract_distance: retDist,
            temp: nozzleTemp,
            temp_bed: bedTemp,
            bed_temp: bedTemp,
            fan_speed_base: fanSpeedBase,
            fan_speed: fanSpeed,
            speed: fanSpeed, // legacy
            top: offset.y ? bedDepth : bedDepth/2,
            left: offset.x ? 0 : -bedWidth/2,
            right: offset.x ? bedWidth : bedWidth/2,
            bottom: offset.y ? 0 : -bedDepth/2,
            z_max: maxHeight,
            layers: layers.length,
            progress: 0,
            nozzle: tool,
            tool: tool,
            oid: '',
            oname: '',
            model_labels: model_labels.sort().join(','),
            total_time: Math.ceil(print.total_time / 60),
            remain_time: Math.ceil(print.total_time / 60),
        },
        pidx, path, out, speedMMM, emitMM, emitPerMM, lastp, laste, dist,
        lines = 0,
        bytes = 0,
        bcos = Math.cos(Math.PI / 4),
        icos = 1 / bcos,
        inloops = 0,
        minz = { x: Infinity, y: Infinity, z: Infinity },
        // lenghts of each filament (by nozzle) consumed
        segments = [];

    // build tool use list for this job
    let tools_used = Object.keys(tools);
    for (let tool of tools_used) {
        subst[`tool_used_${tool}`] = true;
    }
    subst.tool_count = tools_used.length;

    // encodes an array offset as a single "on" bit in an
    // 8 byte array, then converts the array to base64 which
    // is what Bambu's M624 uses to flag an object as currently
    // being printed. the array is presented at the top of the
    // gcode as a comment: "; model label id: {model_labels}"
    function encodeBitOffset(index) {
        let bytes = new Uint8Array(8);
        let byteIndex = Math.floor(index / 8);
        let bitPosition = index % 8;
        bytes[byteIndex] |= (1 << bitPosition);
        return btoa(String.fromCharCode(...bytes));
    }

    function setTempFanSpeed(tempSpeed) {
        if (tempSpeed > 0) {
            fanSpeedSave = fanSpeedSave >= 0 ? fanSpeedSave : fanSpeed;
            fanSpeed = tempSpeed;
            subst.fan_speed = fanSpeed;
            subst.fan_speed_base = tempSpeed;
        } else {
            fanSpeed = fanSpeedSave >= 0 ? fanSpeedSave : fanSpeed
            fanSpeedSave = undefined;
            subst.fan_speed = fanSpeed;
            subst.fan_speed_base = fanSpeedBase;
        }
    }

    // smallish band-aid. refactor above to remove redundancy
    function updateParams(layer, params) {
        if (!params) params = getRangeParameters(process, layer);
        zhop = params.zHopDistance || 0; // range
        retDist = params.outputRetractDist || 0; // range
        retSpeed = params.outputRetractSpeed * 60 || 1; // range
        retDwell = params.outputRetractDwell || 0; // range
        nozzleTemp = layer === 0 ?
            params.firstLayerNozzleTemp || params.outputTemp :
            params.outputTemp || params.firstLayerNozzleTemp;
        bedTemp = layer === 0 ?
            params.firstLayerBedTemp || params.outputBedTemp :
            params.outputBedTemp || params.firstLayerBedTemp;
        fanSpeedBase = params.firstLayerFanSpeed || 0;
        fanSpeed = layer >= (params.outputFanLayer ?? 1) ?
            params.outputFanSpeed || 0 : fanSpeedBase;
        Object.assign(subst, {
            temp_bed: bedTemp,
            bed_temp: bedTemp,
            fan_speed: fanSpeed,
            fan_speed_base: fanSpeedBase,
            speed: fanSpeed, // legacy
            retract_speed: retSpeed,
            retract_distance: retDist,
            temp: params.outputTemp, // range
            temp_bed: params.outputBedTemp, // range
            bed_temp: params.outputBedTemp, // range
        });
    }

    let rloops = [];
    if (oloops > 0) {
        // if oloops set, loop entire part
        rloops.push({
            start: layers[0].slice.index,
            end: Infinity,
            iter: oloops - 1
        });
    } else if (oloops < 0) {
        // if oloops negative, loop entire part to infinity
        rloops.push({
            start: layers[0].slice.index,
            end: Infinity,
            iter: 0
        });
    }
    if (process.ranges) {
        // collect loops from ranges and synth range array
        for (let range of process.ranges) {
            if (range.fields.outputLoops) {
                rloops.push({
                    start: range.lo,
                    end: range.hi,
                    iter: range.fields.outputLoops - 1
                });
            }
        }
    }
    let loops = isBelt && rloops.length ? rloops : undefined;

    function append(line) {
        if (line) {
            lines++;
            bytes += line.length;
            output.append(line);
        }
        // batch gcode output to free memory in worker
        // consider alternate transfer schemes like indexeddb
        // since this transfers the burden to the main thread
        if (!line || output.length > 1000) {
            online(output.join("\n"));
            output = [];
        }
    };

    function appendSubPad(line, pad) {
        appendSub(line, true);
    }

    let subon = true;
    let ifhit = false;

    // eval() based var substitution (from print)
    // with logic flow IF / ELIF / ELSE / END
    // IF / IF is valid but will not nest
    function appendSub(line, pad) {
        if (line.indexOf(';; DEFINE ') === 0) {
            // ignore var declarations
        } else if (line.indexOf(';; IF ') === 0) {
            line = line.substring(6).trim();
            let evil = print.constReplace(line, subst, 0, 666);
            subon = evil;
            ifhit = subon;
        } else if (line.indexOf(';; ELIF ') === 0) {
            line = line.substring(6).trim();
            let evil = print.constReplace(line, subst, 0, 666);
            subon = !subon && evil;
            ifhit = ifhit || subon;
        } else if (line.indexOf(';; ELSE') === 0) {
            subon = !ifhit && !subon;
        } else if (line.indexOf(';; END') === 0) {
            subon = true;
            ifhit = false;
        } else if (subon) {
            append(print.constReplace(line, subst, 0, pad));
        }
    }

    function appendAll(arr) {
        if (!arr) return;
        if (!Array.isArray(arr)) arr = [ arr ];
        arr.forEach(function(line) { append(line) });
    }

    function appendAllSub(arr, pad) {
        if (!arr || arr.length === 0) return;
        if (!Array.isArray(arr)) arr = [ arr ];
        arr.forEach(function(line) { appendSub(line, pad) });
    }

    function appendTok() {
        let arg = [...arguments].map(v => {
            return typeof(v) === 'object' ? JSON.stringify(v) : v;
        });
        append(arg.join(''));
    }

    function preamble() {
        append(`; Generated by Kiri:Moto ${version}`);
        append(`; ${new Date().toString()}`);
        appendSub("; Bed left:{left} right:{right} top:{top} bottom:{bottom}");
        append(`; Bed type: ${bedType}`);
        append(`; Target: ${filter[mode]}`);
        // inject thumbnail preview
        let { current } = self.kiri_worker ?? {};
        if (exportThumb && current?.snap) {
            let { width, height, url } = current.snap;
            let data = url.substring(url.indexOf(',') + 1);
            append(`; thumbnail begin ${width} ${height} ${data.length}`);
            for (let i=0; i<data.length; i += 78) {
                append(`; ${data.substring(i, i + 78)}`);
            }
            append('; thumbnail end');
        }
        append("; --- process ---");
        for (let pk in process) {
            appendTok("; ", pk, " = ", process[pk]);
        }
        if (pre < 3) append("; --- startup ---");
    }

    // looking for ";; PREAMBLE <MODE>" comment
    let pre = 0;
    let gcpre = [];
    for (let line of device.gcodePre) {
        line = line.trim();
        if (line.indexOf(";; PREAMBLE") === 0) {
            if (line === ';; PREAMBLE OFF') pre = 1;
            else if (line === ';; PREAMBLE END') pre = 2;
            else if (line === ';; PREAMBLE POST') pre = 3;
            else gcpre.push(pre = 123);
        } else if (line.indexOf(";; AXISMAP ") === 0) {
            let axmap = JSON.parse(line.substring(11).trim());
            for (let key in axmap) {
                axis[key] = ` ${axmap[key]}`;
            }
        } else {
            gcpre.push(line);
        }
    }

    if (pre === 0) preamble();

    let t0 = false;
    let t1 = false;
    for (let line of gcpre) {
        if (line === pre) {
            preamble();
            continue;
        }
        if (line.indexOf('T0') === 0) t0 = true; else
        if (line.indexOf('T1') === 0) t1 = true; else
        if (line.indexOf('M82') === 0) {
            extrudeAbs = true;
            extrudeSet = true;
        } else
        if (line.indexOf('M83') === 0) {
            extrudeAbs = false;
            extrudeSet = true;
        } else
        if (line.indexOf('G90') === 0 && !extrudeSet) extrudeAbs = true; else
        if (line.indexOf('G91') === 0 && !extrudeSet) extrudeAbs = false; else
        if (line.indexOf('G92') === 0) {
            line.split(";")[0].split(' ').forEach(function (tok) {
                let val = parseFloat(tok.substring(1) || 0) || 0;
                switch (tok[0]) {
                    case 'X': pos.x = val; break;
                    case 'Y': pos.y = val; break;
                    case 'Z': pos.z = val; break;
                    case 'E': outputLength = val; break;
                }
            });
        }
        if (line.indexOf('E') > 0) {
            line.split(";")[0].split(' ').forEach(function (tok) {
                // use max E position from gcode-preamble
                if (tok[0] == 'E') {
                    if (extrudeAbs) {
                        outputLength = Math.max(outputLength, parseFloat(tok.substring(1)) || 0);
                        emitted = outputLength;
                    } else {
                        emitted += parseFloat(tok.substring(1) || 0);
                    }
                }
            });
        }
        appendSubPad(line);
    }

    if (pre === 2) preamble();

    function dwell(ms) {
        time += ms/1000;
        // break up dwell times over 4s because of
        // limitations in some firmwares
        while (ms > 0) {
            let wait = Math.min(4000, ms);
            append(`G4 P${wait}`);
            ms -= wait;
            if (ms) {
                append('G1');
            }
        }
    }

    function retract(zhop) {
        if (retracted) {
            // console.log({double_retract: zhop});
            return;
        }
        retracted = retDist;
        if (fwRetract) {
            append('G10');
        } else {
            moveTo({e:-retracted}, retSpeed, `e-retract ${retDist}`);
        }
        if (zhop) moveTo({z:zpos + zhop}, seekMMM, "z-hop start");
        time += (retDist / retSpeed) * 60 * 2; // retraction time
    }

    function unretract() {
        if (!retracted) {
            return;
        }
        // console.log({engage:zhop});
        // when enabled, resume previous Z
        if (zhop && pos.z != zpos) moveTo({z:zpos}, seekMMM, "z-hop end");
        // re-engage retracted filament
        if (fwRetract) {
            append('G11');
        } else {
            moveTo({e:retracted}, retSpeed, `e-engage ${retracted}`);
        }
        retracted = 0;
        // optional dwell after re-engaging filament to allow pressure to build
        if (retDwell) dwell(retDwell);
        time += (retDist / retSpeed) * 60 * 2; // retraction time
    }

    let taxis = new THREE.Vector3( 1, 0, 0 );
    let tcent = new THREE.Vector2( 0, 0 );
    let angle = -Math.PI / 4;
    let savePos = pos;

    function pushPos(newpos, rate, comment) {
        savePos = Object.clone(pos);
        moveTo({
            x: newpos.x + offset.x,
            y: newpos.y + offset.y,
            z: newpos.z + offset.z
        }, rate, comment);
    }

    function popPos(rate, comment) {
        moveTo(savePos, rate, comment);
    }

    function moveTo(newpos, rate, comment, arc) {
        let o = arc ? 
            [arc.clockwise ? 'G2' : 'G3'] :
            [!rate && !newpos.e ? 'G0' : 'G1'];
        let emit = { x: false, y: false, z: false };
        if (typeof newpos.x === 'number' && newpos.x !== pos.x) {
            pos.x = newpos.x;
            emit.x = true;
        }
        if (typeof newpos.y === 'number' && newpos.y !== pos.y) {
            pos.y = newpos.y;
            emit.y = true;
            if (isBelt) emit.z = true;
        }
        if (typeof newpos.z === 'number' && newpos.z !== pos.z) {
            pos.z = newpos.z;
            emit.z = true;
            if (isBelt) emit.y = true;
        }
        let epos = isBelt ? { x: pos.x, y: pos.y, z: pos.z } : pos;
        if (isBelt) {
            let zheight = path ? path.height || 0 : 0;
            epos.x = originCenter ? -pos.x : device.bedWidth - pos.x;
            epos.z = pos.z * icos;
            epos.y = -pos.y + epos.z * bcos + belt_add_y;
            lout = epos;
        }
        if (emit.x) o.append(axis.X).append(epos.x.toFixed(decimals));
        if (emit.y) o.append(axis.Y).append(epos.y.toFixed(decimals));
        if (emit.z) o.append(axis.Z).append(epos.z.toFixed(decimals));
        if (arc) {
            let { x, y } = arc.center;
            o.push(' I', x.toFixed(decimals));
            o.push(' J', y.toFixed(decimals));
        }
        if (debug) {
            if (emit.x) minz.x = Math.min(minz.x, epos.x);
            if (emit.y) minz.y = Math.min(minz.y, epos.y);
            if (emit.z) minz.z = Math.min(minz.z, epos.z);
        }
        if (typeof newpos.e === 'number') {
            outputLength += newpos.e;
            if (extrudeAbs) {
                // for cumulative (absolute) extruder positions
                o.append(axis.E).append(outputLength.toFixed(decimals));
            } else {
                o.append(axis.E).append(newpos.e.toFixed(decimals));
            }
        }
        if (zMoveMax && emit.z) {
            rate = Math.min(zMoveMax, rate) * 60;
        }
        if (rate && rate != pos.f) {
            o.append(" F").append(Math.round(rate));
            pos.f = rate
        }
        if (comment) {
            o.append(` ; ${comment}`);
        }
        if (o.length === 1) {
            // console.trace({no_move: o, out, newpos, pos, lastp, emit});
            return;
        }
        let line = o.join('');
        if (last == line) {
            // console.log({dup:line});
            return;
        }
        last = line;
        subst.pos_x = epos.x.round(decimals);
        subst.pos_y = epos.y.round(decimals);
        subst.pos_z = epos.z.round(decimals);
        append(line);
    }

    // calc total distance traveled by head as proxy for progress
    let allout = [];
    let totaldistance = 0;
    layers.forEach(function(outs) {
        allout.appendAll(outs);
    });
    allout.forEachPair(function (o1, o2) {
        totaldistance += o1.point.distTo2D(o2.point);
    }, 1);

    // retract before first move
    retract();

    subst.remain_time = Math.ceil(print.total_time / 60);
    while (layer < layers.length) {
        path = layers[layer];
        layerno = path.slice.index;
        // range overrides
        if (path.layer >= 0) {
            updateParams(path.layer, path.params);
        }

        emitPerMM = extrudePerMM(
            lineWidth || extruder.extNozzle,
            extruder.extFilament,
            path.layer === 0 ?
                (process.firstSliceHeight || process.sliceHeight) : path.height);

        zpos = path.z || zpos;
        bmax = Math.max(bmax, pos.z * icos);
        subst.z = subst.Z = zpos.round(3);
        subst.e = subst.E = outputLength;
        subst.layer = layer;
        subst.height = path.height;

        if (isBelt) {
            pos.z = zpos;
        }

        if (gcodePause && pause.indexOf(layer) >= 0) {
            appendAllSub(gcodePause)
        }

        let endloop = 0;
        if (loops) {
            for (let loop of loops) {
                if (layerno === loop.start && !loop.started) {
                    loop.started = true;
                    append(`M808 L${loop.iter}`);
                    if (extrudeAbs) {
                        append(`G92 Z${lout.z.round(decimals)} E${outputLength.round(decimals)}`);
                    } else {
                        append(`G92 Z${lout.z.round(decimals)}`);
                    }
                    inloops++;
                }
                if (layerno === loop.end && !loop.ended) {
                    loop.ended = true;
                    endloop++;
                    inloops--;
                }
            }
        }

        if (gcodeLayer && gcodeLayer.length) {
            appendAllSub(gcodeLayer);
        } else {
            append(`;; --- layer ${layer} (${subst.height.toFixed(3)} @ ${subst.z.round(3)}) ---`);
        }

        // layer temp and fan overrides at layer changes
        if (fanSpeed !== lastFanSpeed) {
            appendAllSub(gcodeFan);
            lastFanSpeed = fanSpeed;
        }
        if (bedTemp !== lastBedTemp) {
            append(`M140 S${bedTemp} T0`);
            lastBedTemp = bedTemp;
        }
        if (nozzleTemp !== lastNozzleTemp) {
            if (t0) append(`M104 S${nozzleTemp} T0`);
            if (t1) append(`M104 S${nozzleTemp} T1`);
            if (!(t0 || t1)) append(`M104 S${nozzleTemp} T${tool}`);
            lastNozzleTemp = nozzleTemp;
        }

        // move Z to layer height
        if (layer === 0 || ((layer > 0 || !isBelt) && !scarfZ)) {
            moveTo({z:zpos}, seekMMM);
        }

        let cwidget;
        // iterate through layer outputs
        for (pidx=0; pidx<path.length; pidx++) {
            out = path[pidx];

            let { center, emit, point, speed, type, widget } = out;

            speedMMM = (speed || process.outputFeedrate) * 60; // range
            if (!isBelt) {
                fanSpeed = out.fan ?? fanSpeed;
            }

            // hint to controller that we're working on a specific object
            // so that gcode between start/stop comments can be cancelled
            if (widget !== cwidget) {
                if (cwidget) {
                    append(`; end object id: ${cwidget.track.grid_id}`);
                    isBambu && append('M625');
                }
                if (widget) {
                    let off = model_labels.indexOf(widget.track.grid_id);
                    let b64 = encodeBitOffset(off);
                    append(`; start object id: ${widget.track.grid_id}`);
                    isBambu && append(`M624 ${b64}`);
                    subst.oid = widget.track.grid_id;
                    subst.oname = widget.meta.file;
                }
                cwidget = widget;
            }

            // emit comment on output type chage
            if (last && type !== last.type) {
                subst.feature = type;
                if (gcodeFeature && gcodeFeature.length) {
                    appendAllSub(gcodeFeature);
                } else {
                    append(`; feature ${type}`);
                }
            }

            // look for extruder change, run scripts, recalc emit factor
            if (out.tool !== undefined && out.tool != tool) {
                segments.push({emitted, tool});
                subst.last_tool = tool;
                tool = out.tool;
                subst.nozzle = subst.tool = tool;
                extruder = extruders[tool];
                offset_x = extruder.extOffsetX;
                offset_y = extruder.extOffsetY;
                emitPerMM = extrudePerMM(
                    lineWidth || extruder.extNozzle,
                    extruder.extFilament,
                    path.layer === 0 ?
                        (process.firstSliceHeight || process.sliceHeight) : path.height);
                appendAllSub(gcodeChange ?? [ "T{tool}" ]);
            }

            // if no point in output, it's a dwell command
            if (!point) {
                dwell(out.speed);
                continue;
            }

            // translate point to workspace coordinates
            let x = point.x + offset_x + offset.x,
                y = point.y + offset_y + offset.y,
                z = point.z;

            // adjust for inversions and origin offsets
            if (outputInvertX) x = -x;
            if (outputInvertY) y = -y;

            // G2,G3 arcs
            if (center) {
                if (outputInvertX) center.x = -center.x;
                if (outputInvertY) center.y = -center.y;
                emitMM = extrudeMM(out.distance, emitPerMM, emit);
                moveTo({ x, y, e: emitMM }, speedMMM, 'arc', {
                    clockwise: out.clockwise,
                    center
                });
                emitted += emitMM;
                continue;
            } else if (emit === -1) {
                // drop display only
                continue;
            }

            // distance to last point for accumulation and emit calc
            dist = lastp ? lastp.distTo2D(point) : 0;

            // re-engage post-retraction before new extrusion
            if (emit && retracted) {
                unretract();
            }

            // in belt mode, fan can change per segment (for base)
            if (isBelt) {
                setTempFanSpeed(out.fan);
            }

            // run fan speed macro when value changes
            if (fanSpeed !== lastFanSpeed) {
                appendAllSub(gcodeFan);
                lastFanSpeed = fanSpeed;
            }

            if (lastp && emit) {
                // emitMM = emitPerMM * emit * dist;
                emitMM = extrudeMM(dist, emitPerMM, emit);
                if (scarfZ) {
                    moveTo({x, y, z:z + path.height/2, e:emitMM}, speedMMM);
                } else {
                    moveTo({x, y, e:emitMM}, speedMMM);
                }
                emitted += emitMM;
            } else {
                if (scarfZ) {
                    moveTo({x, y, z:z + path.height/2}, speedMMM);
                } else {
                    moveTo({x, y}, seekMMM);
                }
                // TODO disabling out of plane z moves until a better mechanism
                // can be built that doesn't rely on computed zpos from layer heights...
                // when making z moves (like polishing) allow slowdown vs fast seek
                // let moveSpeed = (lastp && lastp.z !== z) ? speedMMM : seekMMM;
                // moveTo({x:x, y:y, z:z}, moveSpeed);
            }

            // retract filament if point retract flag set
            if (out.retract) {
                retract(zhop);
            }

            // update time and distance (should calc in moveTo() instead)
            if (dist && speedMMM) {
                time += (dist / speedMMM) * 60 * timeFactor;
            }

            // accumulate distance traveled and update macro var
            distance += dist;
            subst.progress = progress = Math.round((distance / totaldistance) * 100);

            // emit tracked progress
            if (gcodeTrack && progress != lastProgress) {
                appendAllSub(gcodeTrack);
                lastProgress = progress;
            }

            lastp = point;
            laste = emit;
        }
        layer++;
        if (cwidget) {
            append(`; end object id: ${cwidget.track.grid_id}`);
            isBambu && append('M625');
            cwidget = undefined;
        }

        // end open loop when detected
        while (endloop-- > 0) {
            append(`M808`);
        }

        print.total_time -= path.print_time;
        subst.remain_time = Math.ceil(print.total_time / 60);
    }

    if (inloops) {
        append(`M808`);
    }

    segments.push({emitted, tool});
    subst.material = util.round(emitted,2);
    subst.time = util.round(time,2);
    subst['print_time'] = subst.time;

    // append("; --- shutdown ---");
    appendAllSub(device.gcodePost);
    append(`; --- filament used: ${subst.material} mm ---`);
    append(`; --- print time: ${time.toFixed(0)}s ---`);

    if (pre === 3) preamble();

    // force emit of buffer
    append();
    // console.log({segments, emitted, outputLength});
    print.distance = emitted;
    print.lines = lines;
    print.bytes = bytes + lines - 1;
    print.time = time;
    print.labels = model_labels;

    if (debug) {
        console.log('segments', segments);
        console.log('minz', minz);
    }
};
