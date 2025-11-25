/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { arcToPath } from '../../geo/paths.js';
import { consts } from './consts.js';
import { newPoint } from '../../geo/point.js';
import { util } from '../../geo/base.js';

const { numOrDefault } = util;
const { beltfact } = consts;

const XAXIS = new THREE.Vector3(1,0,0);
const DEG2RAD = Math.PI / 180;

class Print {
    constructor(settings, widgets, id) {
        this.id = id || new Date().getTime().toString(36);
        this.settings = settings;
        this.widgets = widgets;
        this.lastPoint = null;
        this.lastPoly = null;
        this.lastEmit = null;
        this.lastOut = null;
        this.lastPos = null;
        this.tools = {};
        // set to 1 to enable flow rate analysis (console)
        this.debugE = settings ? (settings.controller.devel ? 1 : 0) : 0;
    }

    setType(type) {
        this.nextType = type;
    }

    // allows for gcode object id annotations enabling
    // discrete object cancellation during print (bambu)
    setWidget(widget) {
        this.widget = widget;
    }

    /**
     * addOutput - add a new point to the output gcode array
     * @param  {any[]} array  - the output gcode array
     * @param  {Point} point  - the new point
     * @param  {number} emit   - the extrusion value
     * @param  {number} speed  - the feed rate
     * @param  {string} tool  - the tool id
     * @param  {"lerp"|string} opts.type  - the output type
     * @param  {Point} opts.center  - the center of the arc
     * @param  {Point[]} opts.arcPoints  - point based approximation of arc used for rendering
     * @param  {unknown} opts.retract  - the retraction value used for FDM
     * @return {Output}       - the new output object
     */
    addOutput(array, point, emit, speed, tool, opts) {
        const { type, retract, center, arcPoints} = opts ?? {};
        let { lastPoint, lastEmit, lastOut } = this;
        let arc = emit == 2 || emit == 3;
        // drop duplicates (usually intruced by FDM bisections)
        if (lastPoint && point && !arc && type !== 'lerp') {
            // nested due to uglify confusing browser
            const { x, y, z, a } = lastPoint;
            if (point.x == x && point.y == y && point.z == z && point.a == z && lastEmit == emit) {
                return lastOut;
            }
        }
        // if (emit && emit < 1) console.log(emit);
        this.lastPoint = point;
        this.lastEmit = emit;
        this.lastOut = lastOut = new Output(point, emit, speed, tool, {
            type: type ?? this.nextType,
            center,
            arcPoints,
        });
        if (tool !== undefined) {
            this.tools[tool] = true;
        }
        lastOut.retract = retract;
        lastOut.widget = this.widget;
        array.push(lastOut);
        // console.log("addOutput Called", structuredClone({lastOut,array}))
        this.nextType = undefined;
        return lastOut;
    }

    addPrintPoints(input, output) {
        if (this.startPoint && input.length > 0) {
            this.lastPoint = this.startPoint;
        }
        output.appendAll(input);
    }

    /**
     * Prints a polygon to a given output array, possibly with a given extrude factor,
     * and starting from a given point. The last point is returned.
     * used for FDM and laser
     * @param {Polygon} poly - the polygon to print
     * @param {Point} startPoint - the point to start printing from
     * @param {Array} output - the array to print to
     * @param {Object} [options] - optional parameters
     * @param {boolean} [options.ccw] - set the polygon to be counter-clockwise
     * @param {boolean} [options.scarf] - scarf seam permitted
     * @param {number} [options.extrude] - extrude factor for the polygon
     * @param {number} [options.rate] - print speed in mm/s
     * @param {number} [options.coast] - distance to coast at the end of the polygon
     * @param {number} [options.simple] - if true, use the first point of the polygon
     * @param {number} [options.open] - if true, don't close the polygon
     * @param {number} [options.tool] - the tool to use
     * @param {function} [options.onfirst] - called with the first point of the polygon
     * @param {function} [options.onfirstout] - called with the first output point
     * @returns {Point} the last point of the polygon
     */
    polyPrintPath(poly, startPoint, output, options = {}) {
        if (options.ccw) {
            poly.setCounterClockwise();
        } else {
            poly.setClockwise();
        }

        const scope = this;
        const { settings } = scope;
        const { process } = settings;

        let shellMult = numOrDefault(options.extrude, process.outputShellMult),
            printSpeed = options.rate || process.outputFeedrate,
            moveSpeed = process.outputSeekrate,
            minSpeed = process.outputMinSpeed,
            nozzleSize = options.nozzleSize,
            coastDist = options.coast || 0,
            closest = options.simple ? poly.first() : poly.findClosestPointTo(startPoint),
            perimeter = poly.perimeter(),
            close = !options.open,
            scarf = !poly.open ? (options.scarf ?? 0) : false,
            tool = options.tool,
            zmax = options.zmax,
            last = startPoint,
            first = true;

        // if short, use calculated print speed based on sliding scale
        if (perimeter < process.outputShortPoly) {
            printSpeed = minSpeed + (printSpeed - minSpeed) * (perimeter / process.outputShortPoly);
        }

        // if not starting at first point in poly, rotate to move start to index = 0
        let pp = poly.points;
        if (closest.index > 0) {
            let cio = pp.indexOf(closest.point);
            pp = poly.points = [ ...pp.slice(cio), ...pp.slice(0, cio) ];
        }

        // scarf sanity checks
        if (scarf) {
            // cancel scarf for thin wall polys
            if (pp.filter(p => p.skip || p.moved).length) {
                scarf = 0;
            } else {
                // cancel scarf if any point.z differs
                let z0 = pp[0].z;
                let zd = 0;
                for (let p of pp) zd += Math.abs(p.z - z0);
                if (zd) scarf = 0;
            }
            // console.log({ scarf });
        }

        // when creating scarf seams, segment poly up to seam length
        // create array of step up points at start of poly with increasing z
        // and increasing shellMult and then append the same points on the back
        // end of the poly with fixed z and decreasing shellMult
        if (scarf) {
            let epz = Math.max(...poly.points.map(p => p.z));
            let spz = startPoint.z;
            poly = poly.segment(options.nozzleSize ?? 0.4, false, false, scarf * 2);
            pp = poly.points;
            let lp, sp = [];
            for (let p of pp) {
                let d = lp?.distTo2D(p) ?? 0;
                sp.push(lp = p);
                scarf -= d;
                if (scarf <= 0) break;
            }
            let fcs = 1.0; // flow compensation seam
            let fco = (1 / sp.length) * 0.0; // flow compensation offset (- half step)
            let zd = (epz - spz) / sp.length;
            let zi = 1;
            for (let p of sp) {
                p.z -= zd * (sp.length - zi);
                p.moved = (((zi++) / sp.length) * fcs) - 1 - fco;
            }
            let esp = sp.map(p => p.clone()); // ending scarf points
            for (let p of esp) {
                p.z = epz;
                p.moved = (((--zi) / esp.length) * fcs) - 1 - fco;
            }
            pp.push(...esp);
            scarf = true;
        }

        // scarf manages its own close point
        if (close && !scarf) {
            pp.push(pp[0]);
        }

        let lpo;
        for (let point of pp) {
            if (point.skip && lpo?.skip) {
                scope.addOutput(output, point, 0, moveSpeed, tool);
            } else if (first) {
                // if (point.skip) console.log({ skip: point });
                if (options.onfirst) {
                    options.onfirst(point, output);
                }
                // move to first output point on poly
                let out = scope.addOutput(output, point, 0, moveSpeed, tool);
                if (options.onfirstout) {
                    options.onfirstout(out);
                }
                first = false;
            } else {
                let seglen = last.distTo2D(point);
                // cancel coast when using scarf seam
                if (!scarf && coastDist && shellMult && perimeter - seglen <= coastDist) {
                    let delta = perimeter - coastDist;
                    let offset = seglen - delta;
                    let offPoint = last.offsetPointFrom(point, offset)
                    scope.addOutput(output, offPoint, shellMult, printSpeed, tool);
                    shellMult = 0;
                }
                perimeter -= seglen;
                // increase mult by % of point moved relative to nozzle radius
                let multOut = shellMult + (point.moved ?? 0);
                // to increase shellMult when point.inc set for collapsed points
                scope.addOutput(output, point, multOut, printSpeed, tool);
            }
            last = lpo = point;
        }

        this.lastPoly = poly;

        return output.last().point;
    }

    constReplace(str, consts, start, pad, short) {
        function tryeval(str) {
            try {
                return eval(`{ ${str} }`)
            } catch (e) {
                console.log({ eval_error: e, str });
                return str;
            }
        }
        let cs = str.indexOf("{", start || 0),
            ce = str.indexOf("}", cs),
            tok, nutok, nustr;
        if (cs >=0 && ce > cs) {
            tok = str.substring(cs+1,ce);
            let eva = [];
            for (let [k,v] of Object.entries(consts)) {
                switch (typeof v) {
                    case 'object':
                        eva.push(`let ${k} = ${JSON.stringify(v)};`);
                        break;
                    case 'number':
                    case 'boolean':
                        eva.push(`let ${k} = ${v};`);
                        break;
                    default:
                        if (v === undefined) v = '';
                        eva.push(`let ${k} = "${v.replace(/\"/g,"\\\"")}";`);
                        break;
                }
            }
            eva.push(`function range(a,b) { return (a + (layer / layers) * (b-a)).round(4) }`);
            eva.push(`try {( ${tok} )} catch (e) {console.log(e);0}`);
            let evl = tryeval(eva.join(''));
            nutok = evl;
            if (pad === 666) {
                return evl;
            }
            if (pad) {
                nutok = nutok.toString();
                let oldln = ce-cs+1;
                let tokln = nutok.length;
                if (tokln < oldln) {
                    short = (short || 1) + (oldln - tokln);
                }
            }
            nustr = str.replace("{"+tok+"}",nutok);
            return this.constReplace(nustr, consts, ce+1+(nustr.length-str.length), pad, short);
        } else {
            // insert compensating spaces for accumulated replace string shortages
            if (short) {
                let si = str.indexOf(';');
                if (si > 0) {
                    str = str.replace(';', ';'.padStart(short,' '));
                }
            }
            return str;
        }
    }

    parseSVG(code, offset) {
        let scope = this,
            svg = new DOMParser().parseFromString(code, 'text/xml'),
            lines = [...svg.getElementsByTagName('polyline')],
            output = scope.output = [],
            bounds = scope.bounds = {
                max: { x:-Infinity, y:-Infinity, z:-Infinity},
                min: { x:Infinity, y:Infinity, z:Infinity}
            };
        lines.forEach(line => {
            let seq = [];
            let points = [...line.points];
            points.forEach(point => {
                if (offset) {
                    point.x += offset.x;
                    point.y += offset.y;
                }
                if (point.x) bounds.min.x = Math.min(bounds.min.x, point.x);
                if (point.x) bounds.max.x = Math.max(bounds.max.x, point.x);
                if (point.y) bounds.min.y = Math.min(bounds.min.y, point.y);
                if (point.y) bounds.max.y = Math.max(bounds.max.y, point.y);
                if (point.z) bounds.min.z = Math.min(bounds.min.z, point.z);
                if (point.z) bounds.max.z = Math.max(bounds.max.z, point.z);
                const { x, y, z } = point; // SVGPoint is not serializable
                scope.addOutput(seq, { x, y, z }, seq.length > 0);
            });
            output.push(seq);
        });
        scope.imported = code;
        scope.lines = lines.length;
        scope.bytes = code.length;
        return scope.output;
    };

    parseGCode(gcode, offset, progress, done, opts = {}) {
        const fdm = opts.fdm;
        const cam = opts.cam;
        const belt = opts.belt;
        const lines = gcode
            .toUpperCase()
            .replaceAll("X", " X")
            .replaceAll("Y", " Y")
            .replaceAll("Z", " Z")
            .replaceAll("A", " A")
            .replaceAll("E", " E")
            .replaceAll("F", " F")
            .replaceAll("G", " G")
            .replaceAll("I", " I")
            .replaceAll("J", " J")
            .replaceAll("  ", " ")
            .split("\n");

        const scope = this,
            // morph = false,
            morph = true,
            bounds = scope.bounds = {
                max: { x:-Infinity, y:-Infinity, z:-Infinity},
                min: { x:Infinity, y:Infinity, z:Infinity}
            },
            pos = {
                X: 0.0,
                Y: 0.0,
                Z: 0.0,
                A: 0.0,
                F: 0.0,
                E: 0.0
            },
            off = {
                x: offset ? offset.x || 0 : 0,
                y: offset ? offset.y || 0 : 0,
                z: offset ? offset.z || 0 : 0
            },
            xoff = {
                x: 0,
                y: 0,
                z: 0
            };

        let dz = 0,
            abs = true,
            absE = true,
            defh = 0,
            height = 0,
            factor = 1,
            tool = 0,
            time = 0,
            minf = Infinity,
            maxf = 0,
            seq = [],
            autolayer = true,
            newlayer = false,
            hasmoved = false,
            lastG = 'G1';

        const output = scope.output = [ seq ];
        const beltaxis = { X: "X", Y: "Z", Z: "Y", E: "E", F: "F" };

        function LOG() {
            console.log(...[...arguments].map(o => Object.clone(o)));
        }

        /**
         * @function processLine
         * @description parses a line of g-code into individual axis movements
         * @param {string[]} line - the line of g-code as an array of strings,
         *                          each representing a single axis movement
         * @param {Object} axes - an object to store the axis values
         * @returns {Object} an object containing the current and previous points
         */
        function processLine(line, axes) {
            const prevPoint = newPoint(
                factor * pos.X ,
                factor * pos.Y ,
                factor * pos.Z + dz
            )
            .add(xoff)
            .add(off);

            // apply origin offset
            // for (let layer of output) {
            //     for (let rec of layer) {
            //         let point = rec.point;
            //         point.x += off.X;
            //         point.y += off.Y;
            //         point.z += off.Z;
            //     }
            // }

            const point = prevPoint.clone()

            line.forEach(tok => {
                let axis = tok.charAt(0).toUpperCase();
                if (morph && belt) {
                    axis = beltaxis[axis];
                }
                // console.log("position updated",structuredClone(pos))

                let val = parseFloat(tok.substring(1));
                axes[axis] = val;
                // if( axis == 'I' || axis == "J") return
                if (abs) {
                    pos[axis] = val;
                    if (axis == "X") point.x = factor * pos.X + xoff.x + off.x
                    else if (axis == "Y") point.y = factor * pos.Y + xoff.y + off.y
                    else if (axis == "Z") point.z = factor * pos.Z + xoff.z + off.z + dz
                } else {
                    // mov[axis] = val;
                    pos[axis] += val;
                }
                // console.log("position updated",structuredClone(pos))
            });

            let center;
            if(axes.I !== undefined && axes.J !== undefined) {
                center = newPoint(
                    factor* axes.I+ xoff.x,
                    factor* axes.J+ xoff.y,
                    0,
                );
            }else if(axes.R !== undefined) {
                center = newPoint(
                    factor* Math.cos(axes.R * DEG2RAD),
                    factor* Math.sin(axes.R * DEG2RAD),
                    0,
                );
            }
            if(center){
                center = center.add(prevPoint);
                center.setZ((prevPoint.z+point.z)/2+dz);
            }
            return {
                center,
                point,
                prevPoint
            };
        }

        function outputPoint(point,lastP,emit,{center,arcPoints,retract}) {
            // non-move in a new plane means burp out
            // the old sequence and start a new one
            if (newlayer || (autolayer && seq.z != point.z)) {
                newlayer = false;
                let dz = point.z - seq.z;
                let nh = dz > 0 ? dz : defh;
                seq = [];
                seq.height = height = nh;
                if (fdm) dz = -height / 2;
                output.push(seq);
            }

            if (!hasmoved) {
                seq.height = seq.z = pos.Z;
                hasmoved = true;
            }

            // debug extrusion rate
            const lastPos = scope.lastPos;
            if (scope.debugE && fdm && lastPos && pos.E) {
                // extruder move
                let dE = (absE ? pos.E - scope.lastPosE : pos.E);
                // distance moved in XY
                let dV = point.distTo2D(lastP);
                // debug print time
                time += (dV * pos.F) / 1000;
                // filament per mm
                let dR = (dE / dV);
                if (dV > 2 && dE > 0.001) {
                    let lab = (absE ? 'aA' : 'rR')[scope.debugE++ % 2];
                    console.log(lab, height.toFixed(2), dV.toFixed(2), dE.toFixed(3), dR.toFixed(4), pos.F.toFixed(0));
                }
            }
            // add point to current sequence
            scope.addOutput(seq, point, emit, pos.F, tool,{retract,arcPoints});
            scope.lastPos = Object.assign({}, pos);
            scope.lastPosE = pos.E;
        }

        /**
         * Handles G2 and G3 arcs, which are circular arcs.
         * @param {boolean} g2 - Whether this is a G2 or G3 arc. G2 is a clockwise arc, G3 is a counter-clockwise arc.
         * @param {string[]} line - The line of the g-code file that contains the G2 or G3 command.
         * @param {number} index - The line number of the g-code file that contains the G2 or G3 command.
         */
        function G2G3(g2, line, index) {
            const axes = {};
            const {point, prevPoint, center} = processLine(line,axes);

            // console.log(structuredClone({point,prevPoint,center}));

            let arcPoints = arcToPath( prevPoint, point, 64,{ clockwise:g2,center}) ?? []
            let emit = g2 ? 2 : 3;

            // console.log("clone point",structuredClone({point,prevPoint,center,arcPoints,emit}));
            // console.log("pointer point",{point,prevPoint,center,arcPoints,emit});

            outputPoint(point,prevPoint,emit,{center,arcPoints});
            // scope.addOutput(seq, point, emit, pos.F, tool,{center,arcPoints});
        }

        function G0G1(g0, line) {
            const mov = {};
            const axes = {};

            lastG = g0 ? 'G0' : 'G1';
            const {point, prevPoint} = processLine(line,axes);

            if (morph && belt) {
                point.y -= point.z * beltfact;
                point.z *= beltfact;
            }

            if (pos.A) {
                let ip = new THREE.Vector3(pos.X, pos.Y, pos.Z)
                    .applyAxisAngle(XAXIS, -pos.A * DEG2RAD);
                point.x = ip.x;
                point.y = ip.y;
                point.z = ip.z;
            }

            const retract = (fdm && pos.E < 0) || undefined;
            const moving = g0 || (fdm && (pos.E <= 0 || !(axes.X || axes.Y || axes.Z)));

            if (!moving && point.x) bounds.min.x = Math.min(bounds.min.x, point.x);
            if (!moving && point.x) bounds.max.x = Math.max(bounds.max.x, point.x);
            if (!moving && point.y) bounds.min.y = Math.min(bounds.min.y, point.y);
            if (!moving && point.y) bounds.max.y = Math.max(bounds.max.y, point.y);
            if (!moving && point.z) bounds.min.z = Math.min(bounds.min.z, point.z);
            if (!moving && point.z) bounds.max.z = Math.max(bounds.max.z, point.z);

            // update max speed
            if (pos.F) minf = Math.min(minf, pos.F);
            maxf = Math.max(maxf, pos.F);

            // always add moves to the current sequence
            if (moving) {
                // console.log("move",structuredClone(point))
                scope.addOutput(seq, point, 0, pos.F, tool,{retract})
                scope.lastPos = Object.assign({}, pos);
                return;
            }
            if (seq.z === undefined) {
                seq.z = point.z;
            }
            if (fdm && height === 0) {
                seq.height = defh = height = pos.Z;
            }

            outputPoint(point,prevPoint,1,{retract})
        }

        const linemod = cam ? Math.ceil(lines.length / 2500) : 0;

        lines.forEach((line, idx) => {
            if (linemod && idx % linemod === 0) {
                newlayer = true;
                autolayer = false;
            }
            if (line.indexOf(';LAYER:') === 0) {
                newlayer = true;
                autolayer = false;
            }
            if (line.indexOf('- LAYER ') > 0) {
                seq.height = defh;
                const hd = line.replace('(','').replace(')','').split(' ');
                defh = parseFloat(hd[4]);
                if (fdm) dz = -defh / 2;
                newlayer = true;
                autolayer = false;
            }
            // if (["X","Y","Z"].indexOf(line.charAt(0)) >= 0) {
            //     line = `G0${line}`;
            // }
            line = line.trim().split(";")[0].split(" ").filter(v => v);
            if (!line.length) return;
            const c0 = line[0].charAt(0);
            let cmd = ["X","Y","Z"].indexOf(c0) >= 0 ? lastG : line.shift();
            if (!cmd) return;
            if (cmd.charAt(0) === 'T') {
                let ext = scope.settings.device.extruders;
                let pos = parseInt(cmd.charAt(1));
                if (ext && ext[pos]) {
                    xoff.X = -ext[pos].extOffsetX;
                    xoff.Y = -ext[pos].extOffsetY;
                }
            }

            pos.E = 0.0;
            switch (cmd) {
                case 'M82':
                    absE = true;
                    break;
                case 'M83':
                    absE = false;
                    break;
                case 'G20':
                    factor = 25.4;
                    break;
                case 'G21':
                    factor = 1;
                    break;
                case 'G90':
                    // absolute positioning
                    abs = true;
                    break;
                case 'G91':
                    // relative positioning
                    abs = false;
                    break;
                case 'G92':
                    line.forEach(tok => {
                        pos[tok.charAt(0)] = parseFloat(tok.substring(1));
                    });
                    break;
                case 'G10':
                    if (seq && seq.length) {
                        seq.last().retract = true;
                    }
                    break;
                case 'G11':
                    break;
                case 'G0':
                    G0G1(1, line);
                    break;
                case 'G1':
                    G0G1(0, line);
                    break;
                case 'G2':
                    // turn arc into a series of points
                    G2G3(true, line, idx)
                    break;
                case 'G3':
                    // turn arc into a series of points
                    G2G3(false, line, idx);
                    break;
                case 'M6':
                    tool = parseInt(line[0].substring(1));
                    break;
            }
        });
        scope.imported = gcode;
        scope.lines = lines.length;
        scope.bytes = gcode.length;
        scope.minSpeed = Math.floor(minf / 60);
        scope.maxSpeed = Math.floor(maxf / 60);
        scope.belt = belt;

        if (scope.debugE) {
            console.log({
                bounds,
                minf,
                maxf,
                print_time: time.round(2),
                output: scope.output
            });
        }

        done({ output: scope.output });
    }
}

class Output {
    /**
     * Construct a new output element.
     * 
     * in cam, emit is the G code number (G0, G1, G2, G3)
     *
     * @param {Point} point point to emit, with x, y, and z properties
     * @param {number} emit emit (feed for printers, power for lasers, cut for cam)
     * @param {number} speed speed in mm/min
     * @param {number} tool tool id
     * @param {Object} options options object
     * @param {string} [options.type] type of point
     * @param {Point} [options.center] the center of the arc
     * @param {Point[]} [options.arcPoints] point based approximation of arc
     */
    constructor(point, emit, speed, tool, options) {

        const { type, center, arcPoints } = (options ?? {});
        //speed, tool, type, center, arcPoints
        this.point = point; 
        this.emit = Number(emit); //convert bools into 0/1
        this.speed = speed;
        this.tool = tool;
        this.type = type;
        this.center = center;
        this.arcPoints = arcPoints;
        // this.where = new Error().stack.split("\n");
    }

    clone(z) {
        let o = new Output(
            this.point.clone(),
            this.emit,
            this.speed,
            this.tool,
            this.type
        );
        if (z !== undefined) {
            o.point.setZ(z);
        }
        return o;
    }

    set_retract() {
        this.retract = true;
        return this;
    }
}

function newPrint(settings, widgets, id) {
    return new Print(settings, widgets, id);
};

export {
    Print,
    newPrint
};
