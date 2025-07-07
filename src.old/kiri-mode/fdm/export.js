/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: kiri.utils
// dep: kiri-mode.fdm.driver
gapp.register("kiri-mode.fdm.export", [], (root, exports) => {

const { base, kiri } = root;
const { util, config } = base;
const { FDM } = kiri.driver;
const { getRangeParameters } = FDM;
const debug = false;

FDM.export = function(print, online, ondone, ondebug) {
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
        extused = Object.keys(print.extruders).map(v => parseInt(v)),
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
        blastz = 0,
        belt_add_y = (process.firstLayerYOffset || 0) - (belty || 0),
        oloops = process.outputLoops || 0,
        zhop = process.zHopDistance || 0, // range
        lineWidth = process.sliceLineWidth || 0,
        seekMMM = process.outputSeekrate * 60,
        retDist = process.outputRetractDist || 0, // range
        retSpeed = process.outputRetractSpeed * 60 || 1, // range
        retDwell = process.outputRetractDwell || 0, // range
        timeDwell = retDwell / 1000,
        arcDist = isBelt ? 0 : (process.arcTolerance || 0),
        arcMin = 1,
        arcRes = 20,
        arcDev = 0.5,
        arcMax = 40,
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
        lastType = undefined,
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
            model_labels: model_labels.sort().join(',')
        },
        pidx, path, out, speedMMM, emitMM, emitPerMM, lastp, laste, dist,
        lines = 0,
        bytes = 0,
        bcos = Math.cos(Math.PI / 4),
        icos = 1 / bcos,
        inloops = 0,
        arcQ = [],
        minz = { x: Infinity, y: Infinity, z: Infinity },
        // lenghts of each filament (by nozzle) consumed
        segments = [],
        extrudeMM = FDM.extrudeMM,
        extrudePerMM = FDM.extrudePerMM;

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
        // params = getRangeParameters(process, layer);
        zhop = params.zHopDistance || 0; // range
        retDist = params.outputRetractDist || 0; // range
        retSpeed = params.outputRetractSpeed * 60 || 1; // range
        retDwell = params.outputRetractDwell || 0; // range
        timeDwell = retDwell / 1000;
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
        append(`; Generated by Kiri:Moto ${kiri.version}`);
        append(`; ${new Date().toString()}`);
        appendSub("; Bed left:{left} right:{right} top:{top} bottom:{bottom}");
        append(`; Bed type: ${bedType}`);
        append(`; Target: ${filter[mode]}`);
        // inject thumbnail preview
        if (exportThumb && worker.snap) {
            let { width, height, url } = worker.snap;
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
        append("; --- startup ---");
    }

    // looking for ";; PREAMBLE <MODE>" comment
    let pre = 0;
    let gcpre = [];
    for (let line of device.gcodePre) {
        line = line.trim();
        if (line.indexOf(";; PREAMBLE") === 0) {
            if (line === ';; PREAMBLE OFF') pre = 1;
            else if (line === ';; PREAMBLE END') pre = 2;
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
        drainQ();
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

    function moveTo(newpos, rate, comment) {
        let o = [!rate && !newpos.e ? 'G0' : 'G1'];
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
            epos.z = blastz = pos.z * icos;
            epos.y = -pos.y + epos.z * bcos + belt_add_y;
            lout = epos;
        }
        if (emit.x) o.append(axis.X).append(epos.x.toFixed(decimals));
        if (emit.y) o.append(axis.Y).append(epos.y.toFixed(decimals));
        if (emit.z) o.append(axis.Z).append(epos.z.toFixed(decimals));
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
        if (layer > 0 || !isBelt) {
            moveTo({z:zpos}, seekMMM);
        }

        let cwidget;
        // iterate through layer outputs
        for (pidx=0; pidx<path.length; pidx++) {
            out = path[pidx];
            speedMMM = (out.speed || process.outputFeedrate) * 60; // range

            // hint to controller that we're working on a specific object
            // so that gcode between start/stop comments can be cancelled
            if (out.widget !== cwidget) {
                if (cwidget) {
                    append(`; end object id: ${cwidget.track.grid_id}`);
                    isBambu && append('M625');
                }
                if (out.widget) {
                    let off = model_labels.indexOf(out.widget.track.grid_id);
                    let b64 = encodeBitOffset(off);
                    append(`; start object id: ${out.widget.track.grid_id}`);
                    isBambu && append(`M624 ${b64}`);
                }
                cwidget = out.widget;
            }

            // emit comment on output type chage
            if (last && out.type !== last.type) {
                lastType = subst.feature = out.type;
                if (gcodeFeature && gcodeFeature.length) {
                    appendAllSub(gcodeFeature);
                } else {
                    append(`; feature ${out.type}`);
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
            if (!out.point) {
                dwell(out.speed);
                continue;
            }

            let x = out.point.x + offset_x,
                y = out.point.y + offset_y,
                z = out.point.z;

            // adjust for inversions and origin offsets
            if (process.outputInvertX) x = -x;
            if (process.outputInvertY) y = -y;
            if (offset) {
                x += offset.x;
                y += offset.y;
            }

            dist = lastp ? lastp.distTo2D(out.point) : 0;

            // re-engage post-retraction before new extrusion
            if (out.emit && retracted) {
                unretract();
            }

            // in belt mode, fan can change per segment (for base)
            if (isBelt) {
                setTempFanSpeed(out.fan);
                if (fanSpeed !== lastFanSpeed) {
                    appendAllSub(gcodeFan);
                    lastFanSpeed = fanSpeed;
                }
            }

            if (lastp && out.emit) {
                if (arcDist) {
                    let rec = {e:out.emit, x, y, z, dist, emitPerMM, speedMMM};
                    arcQ.push(rec);
                    let deem = false; // do arcQ[0] and rec have differing emit values?
                    let depm = false; // do arcQ[0] and rec have differing emit speeds?
                    let desp = false; // do arcQ[0] and rec have differing move speeds?
                    if (arcQ.length > 1) {
                        let el = arcQ.length;
                        deem = arcQ[0].e !== rec.e;
                        depm = arcQ[0].emitPerMM !== rec.emitPerMM;
                        desp = arcQ[0].speedMMM !== rec.speedMMM;
                    }
                    // ondebug({arcQ});
                    if (arcQ.length > 2) {
                        let el = arcQ.length;
                        let e1 = arcQ[0]; // first in arcQ
                        let e2 = arcQ[Math.floor(el/2)]; // mid in arcQ
                        let e3 = arcQ[el-1]; // last in arcQ
                        let e4 = arcQ[el-2]; // second last in arcQ
                        let e5 = arcQ[el-3]; // third last in arcQ
                        let cc = util.center2d(e1, e2, e3, 1); // find center
                        let lr = util.center2d(e3, e4, e5, 1); // find local radius
                        let dc = 0;

                        let radFault = false;
                        if (lr) {
                            let angle = 2 * Math.asin(dist/(2*lr.r));
                            radFault = Math.abs(angle) > Math.PI * 2 / arcRes; // enforce arcRes(olution)
                            // if (arcQ.center) {
                            //     arcQ.rSum = arcQ.center.reduce( function (t, v) { return t + v.r }, 0 );
                            //     let avg = arcQ.rSum / arcQ.center.length;
                            //     radFault = radFault || Math.abs(avg - lr.r) / avg > arcDev; // eliminate sharps and flats when local rad is out of arcDev(iation)
                            // }
                        } else {
                            radFault = true;
                        }

                        if (cc) {
                            if ([cc.x,cc.y,cc.z,cc.r].hasNaN()) {
                                console.log({cc, e1, e2, e3});
                            }
                            if (arcQ.length === 3) {
                                arcQ.center = [ cc ];
                                arcQ.xSum = cc.x;
                                arcQ.ySum = cc.y;
                                arcQ.rSum = cc.r;
                            } else {
                                // check center point delta
                                arcQ.xSum = arcQ.center.reduce( function (t, v) { return t + v.x }, 0 );
                                arcQ.ySum = arcQ.center.reduce( function (t, v) { return t + v.y }, 0 );
                                arcQ.rSum = arcQ.center.reduce( function (t, v) { return t + v.r }, 0 );
                                let dx = cc.x - arcQ.xSum / arcQ.center.length;
                                let dy = cc.y - arcQ.ySum / arcQ.center.length;
                                dc = Math.sqrt(dx * dx + dy * dy);
                            }

                            // if new point is off the arc
                            // if (deem || depm || desp || dc > arcDist || cc.r < arcMin || cc.r > arcMax || dist > cc.r) {
                            if (deem || depm || desp || dc * arcQ.center.length / arcQ.rSum > arcDist || dist > cc.r || cc.r > arcMax || radFault || !arcValid()) {
                                // let debug = [deem, depm, desp, dc * arcQ.center.length / arcQ.rSum > arcDist, dist > cc.r, cc.r > arcMax, radFault];
                                if (arcQ.length === 4) {
                                    // not enough points for an arc, drop first point and recalc center
                                    emitQrec(arcQ.shift());
                                    let tc = util.center2d(arcQ[0], arcQ[1], arcQ[2], 1);
                                    // the new center is invalid as well. drop the first point
                                    if (!tc) {
                                        emitQrec(arcQ.shift());
                                    } else {
                                        arcQ.center = [ tc ];
                                        let angle = 2 * Math.asin(arcQ[1].dist/(2*tc.r));
                                        if (Math.abs(angle) > Math.PI * 2 / arcRes) { // enforce arcRes on initial angle
                                            emitQrec(arcQ.shift());
                                        }
                                    }
                                } else {
                                    // enough to consider an arc, emit and start new arc
                                    let defer = arcQ.pop();
                                    drainQ();
                                    // re-add point that was off the last arc
                                    arcQ.push(defer);
                                }
                            } else {
                                // new point is on the arc
                                arcQ.center.push(cc);
                            }
                        } else {
                            // drainQ on invalid center
                            drainQ();
                        }
                    }
                } else {
                    // emitMM = emitPerMM * out.emit * dist;
                    emitMM = extrudeMM(dist, emitPerMM, out.emit);
                    moveTo({x:x, y:y, e:emitMM}, speedMMM);
                    emitted += emitMM;
                }
            } else {
                drainQ();
                moveTo({x:x, y:y}, seekMMM);
                // TODO disabling out of plane z moves until a better mechanism
                // can be built that doesn't rely on computed zpos from layer heights...
                // when making z moves (like polishing) allow slowdown vs fast seek
                // let moveSpeed = (lastp && lastp.z !== z) ? speedMMM : seekMMM;
                // moveTo({x:x, y:y, z:z}, moveSpeed);
            }

            // retract filament if point retract flag set
            if (out.retract) {
                drainQ();
                retract(zhop);
            }

            // update time and distance (should calc in moveTo() instead)
            if (dist && speedMMM) {
                time += (dist / speedMMM) * 60 * timeFactor;
            }
            // if (isNaN(time)) {
            //     console.log({ layer, path, dist, speedMMM, timeFactor });
            //     throw "NaN";
            // }
            distance += dist;
            subst.progress = progress = Math.round((distance / totaldistance) * 100);

            // emit tracked progress
            if (gcodeTrack && progress != lastProgress) {
                appendAllSub(gcodeTrack);
                lastProgress = progress;
            }

            lastp = out.point;
            laste = out.emit;
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
        drainQ();
    }

    function emitQrec(rec) {
        let {e, x, y, dist, emitPerMM, speedMMM} = rec;
        // emitMM = emitPerMM * e * dist;
        emitMM = extrudeMM(dist, emitPerMM, e);
        moveTo({x:x, y:y, e:emitMM}, speedMMM);
        emitted += emitMM;
    }

    function drainQ() {
        if (!arcDist) {
            return;
        }
        if (arcQ.length > 4) {
            // ondebug({arcQ});
            let vec1 = new THREE.Vector2(arcQ[1].x - arcQ[0].x, arcQ[1].y - arcQ[0].y);
            let vec2 = new THREE.Vector2(arcQ.center[0].x - arcQ[0].x, arcQ.center[0].y - arcQ[0].y);
            let gc = vec1.cross(vec2) < 0 ? 'G2' : 'G3';
            let from = arcQ[0];
            let to = arcQ.peek();
            arcQ.xSum = arcQ.center.reduce( function (t, v) { return t + v.x }, 0 );
            arcQ.ySum = arcQ.center.reduce( function (t, v) { return t + v.y }, 0 );
            arcQ.rSum = arcQ.center.reduce( function (t, v) { return t + v.r }, 0 );
            let cl = arcQ.center.length;
            let cc;

            let angle = util.thetaDiff(
                Math.atan2((from.y - arcQ.ySum / cl), (from.x - arcQ.xSum / cl)),
                Math.atan2((to.y - arcQ.ySum / cl), (to.x - arcQ.xSum / cl)),
                gc === "G2"
            );

            if (Math.abs(angle) <= 3 * Math.PI / 4) {
                cc = util.center2pr(from, to, arcQ.rSum / cl, gc === "G3");
            }

            if (!cc) {
                cc = {x:arcQ.xSum/cl, y:arcQ.ySum/cl, z:arcQ[0].z, r:arcQ.rSum/cl};
            }

            // first arc point
            emitQrec(from);
            // console.log(arcQ.slice(), arcQ.center);
            // console.log({first: from, last: arcQ.peek(), center: cc});
            // rest of arc to final point
            let dist = arcQ.slice(1).map(v => v.dist).reduce((a,v) => a+v);
            let emit = from.e;//arcQ.slice(1).map(v => v.e).reduce((a,v) => a+v);
            emit = (from.emitPerMM * emit * dist);
            outputLength += emit;
            emitted += emit;
            if (extrudeAbs) {
                emit = outputLength;
            }
            // XYR form
            // let pre = `${gc} X${to.x.toFixed(decimals)} Y${to.y.toFixed(decimals)} R${cc.r.toFixed(decimals)} E${emit.toFixed(decimals)}`;
            // XYIJ form
            let pre = `${gc} X${to.x.toFixed(decimals)} Y${to.y.toFixed(decimals)} I${(cc.x - pos.x).toFixed(decimals)} J${(cc.y - pos.y).toFixed(decimals)} E${emit.toFixed(decimals)}`;
            let add = pos.f !== from.speedMMM ? ` E${from.speedMMM}` : '';
            append(`${pre}${add} ; merged=${cl-1} len=${dist.toFixed(decimals)} cp=${cc.x.round(2)},${cc.y.round(2)}`);
            pos.x = to.x;
            pos.y = to.y;
            pos.z = to.z;
        } else {
            for (let rec of arcQ) {
                emitQrec(rec);
            }
        }
        arcQ.length = 0;
        arcQ.center = undefined;
    }

    // comprehensive arc validator
    function arcValid() {
        if (arcQ.length < 3) {
            return false;
        }

        let globalCenters = []; // see how a point first the curve within the context of the arc's end points.

        for (let i = 0; i < arcQ.length - 2; i++) {
            let cc = util.center2d(arcQ[0], arcQ[i+1], arcQ[arcQ.length - 1], 1);
            if (!cc) {
                return false;
            }
            globalCenters.push(cc);
        }

        let ac = { // average center
            x:globalCenters.reduce( (t,v) =>  t + v.x , 0) / (globalCenters.length),
            y:globalCenters.reduce( (t,v) =>  t + v.y , 0) / (globalCenters.length),
            z:globalCenters.reduce( (t,v) =>  t + v.z , 0) / (globalCenters.length),
            r:globalCenters.reduce( (t,v) =>  t + v.r , 0) / (globalCenters.length)
        };

        // make sure centers are within specified tolerance
        for (let cc of globalCenters) {
            let dc = Math.sqrt(Math.pow(cc.x - ac.x, 2) + Math.pow(cc.y - ac.y, 2));
            if (dc / ac.r > arcDist) {
                return false;
            }
        }

        // make sure radii are within specified tolerance
        for (let point of arcQ) {
            let rad = Math.sqrt(Math.pow(point.x - ac.x, 2) + Math.pow(point.y - ac.y, 2));
            if (Math.abs(rad - ac.r) > ac.r * arcDist) {
                return false;
            }
        }

        // enforce arcRes(olution)
        for (let i = 1; i < arcQ.length; i++) {
            let angle = 2 * Math.asin(arcQ[i].dist/(2*ac.r));
            if (Math.abs(angle) > Math.PI * 2 / arcRes) {
                return false;
            }
        }

        // check points in the context of neighbors
        for (let i = 0; i < arcQ.length - 2; i++) {
            let cc = util.center2d(arcQ[i], arcQ[i+1], arcQ[i+2], 1);
            if (!cc || Math.abs((cc.r - ac.r) / cc.r) > arcDev) {
                return false;
            }
        }

        return true;

    }

    if (inloops) {
        append(`M808`);
    }

    segments.push({emitted, tool});
    subst.material = util.round(emitted,2);
    subst.time = util.round(time,2);
    subst['print_time'] = subst.time;

    append("; --- shutdown ---");
    appendAllSub(device.gcodePost);
    append(`; --- filament used: ${subst.material} mm ---`);
    append(`; --- print time: ${time.toFixed(0)}s ---`);

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

});
