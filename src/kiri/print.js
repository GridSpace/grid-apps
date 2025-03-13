/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.point
// dep: geo.polygon
// dep: geo.paths
// dep: kiri.consts
gapp.register("kiri.print", [], (root, evets) => {

const { base, kiri } = self;
const { paths, util, newPoint } = base;
const { numOrDefault } = util;
const { beltfact } = kiri.consts;
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

    addOutput(array, point, emit, speed, tool, type) {
        let { lastPoint, lastEmit, lastOut } = this;
        // drop duplicates (usually intruced by FDM bisections)
        if (lastPoint && point && type !== 'lerp') {
            // nested due to uglify confusing browser
            const { x, y, z } = lastPoint;
            if (point.x == x && point.y == y && point.z == z && lastEmit == emit) {
                return lastOut;
            }
        }
        // if (emit && emit < 1) console.log(emit);
        this.lastPoint = point;
        this.lastEmit = emit;
        this.lastOut = lastOut = new Output(point, emit, speed, tool, type || this.nextType);
        if (tool !== undefined) {
            this.tools[tool] = true;
        }
        lastOut.widget = this.widget;
        array.push(lastOut);
        this.nextType = undefined;
        return lastOut;
    }

    addPrintPoints(input, output, startPoint, tool) {
        if (this.startPoint && input.length > 0) {
            this.lastPoint = this.startPoint;
            // TODO: revisit seek to origin as the first move
            // addOutput(output, startPoint, 0, undefined, tool);
        }
        output.appendAll(input);
    }

    // fdm & laser
    polyPrintPath(poly, startPoint, output, options = {}) {
        if (options.ccw) {
            poly.setCounterClockwise();
        } else {
            poly.setClockwise();
        }

        const scope = this;
        const { settings } = scope;
        const { process } = settings;

        let shortDist = process.outputShortDistance,
            shellMult = numOrDefault(options.extrude, process.outputShellMult),
            printSpeed = options.rate || process.outputFeedrate,
            moveSpeed = process.outputSeekrate,
            minSpeed = process.outputMinSpeed,
            coastDist = options.coast || 0,
            closest = options.simple ? poly.first() : poly.findClosestPointTo(startPoint),
            perimeter = poly.perimeter(),
            close = !options.open,
            tool = options.tool,
            last = startPoint,
            first = true;

        // if short, use calculated print speed based on sliding scale
        if (perimeter < process.outputShortPoly) {
            printSpeed = minSpeed + (printSpeed - minSpeed) * (perimeter / process.outputShortPoly);
        }

        poly.forEachPoint((point, pos, points, count) => {
            if (first) {
                if (options.onfirst) {
                    options.onfirst(point);
                }
                // move to first output point on poly
                let out = scope.addOutput(output, point, 0, moveSpeed, tool);
                if (options.onfirstout) {
                    options.onfirstout(out);
                }
                first = false;
            } else {
                let seglen = last.distTo2D(point);
                if (coastDist && shellMult && perimeter - seglen <= coastDist) {
                    let delta = perimeter - coastDist;
                    let offset = seglen - delta;
                    let offPoint = last.offsetPointFrom(point, offset)
                    scope.addOutput(output, offPoint, shellMult, printSpeed, tool);
                    shellMult = 0;
                }
                perimeter -= seglen;
                scope.addOutput(output, point, shellMult, printSpeed, tool);
            }
            last = point;
        }, close, closest.index);

        this.lastPoly = poly;

        return output.last().point;
    }

    constReplace(str, consts, start, pad, short) {
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
            let scr = eva.join('');
            let evl = eval(`{ ${scr} }`);
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
                X: offset ? offset.x || 0 : 0,
                Y: offset ? offset.y || 0 : 0,
                Z: offset ? offset.z || 0 : 0
            },
            xoff = {
                X: 0,
                Y: 0,
                Z: 0
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
            arcdivs = Math.PI / 24,
            hasmoved = false,
            lastG = 'G1';

        const output = scope.output = [ seq ];
        const beltaxis = { X: "X", Y: "Z", Z: "Y", E: "E", F: "F" };

        function LOG() {
            console.log(...[...arguments].map(o => Object.clone(o)));
        }

        function G2G3(g2, line, index) {
            const rec = {};

            line.forEach(tok => {
                rec[tok.charAt(0)] = parseFloat(tok.substring(1));
            });

            let center = { x:0, y:0, r:0 };

            if (rec.X === undefined && rec.X === rec.Y) {
                // bambu generates loop z or wipe loop arcs in place
                // console.log({ skip_empty_arc: rec });
                return;
            }
            // G0G1(false, [`X${rec.X}`, `Y${rec.Y}`, `E1`]);return;

            if (rec.I !== undefined && rec.J !== undefined) {
                center.x = pos.X + rec.I;
                center.y = pos.Y + rec.J;
                center.r = Math.sqrt(rec.I*rec.I + rec.J*rec.J);
            } else if (rec.R !== undefined) {
                let pd = { x: rec.X - pos.X, y: rec.Y - pos.Y };
                let dst = Math.sqrt(pd.x * pd.x + pd.y * pd.y) / 2;
                let pr2;
                if (Math.abs(dst - rec.R) < 0.001) {
                    // center point radius
                    pr2 = { x: (rec.X + pos.X) / 2, y: (rec.Y + pos.Y) / 2};
                } else {
                    // triangulate
                    pr2 = base.util.center2pr({
                        x: pos.X,
                        y: pos.Y
                    }, {
                        x: rec.X,
                        y: rec.Y
                    }, rec.R, g2);
                }
                center.x = pr2.x;
                center.y = pr2.y;
                center.r = rec.R;
            } else {
                console.log({malfomed_arc: line});
            }

            // line angles
            let a1 = Math.atan2(center.y - pos.Y, center.x - pos.X) + Math.PI;
            let a2 = Math.atan2(center.y - rec.Y, center.x - rec.X) + Math.PI;
            let ad = base.util.thetaDiff(a1, a2, g2);
            let steps = Math.max(Math.floor(Math.abs(ad) / arcdivs), 3);
            let step = (Math.abs(ad) > 0.001 ? ad : Math.PI * 2) / steps;
            let rot = a1 + step;

            let da = Math.abs(a1 - a2);
            let dx = pos.X - rec.X;
            let dy = pos.Y - rec.Y;
            let dd = Math.sqrt(dx * dx + dy * dy);

            // LOG({index, da, dd, first: pos, last: rec, center, a1, a2, ad, step, steps, rot, line});
            // G0G1(false, [`X${center.x}`, `Y${center.y}`, `E1`]);

            // under 1 degree arc and 5mm, convert to straight line
            if (da < 0.005 && dd < 5) {
                G0G1(false, [`X${rec.X}`, `Y${rec.Y}`, `E1`]);
                return;
            }

            let pc = { X: pos.X, Y: pos.Y };
            for (let i=0; i<=steps-2; i++) {
                let np = {
                    X: center.x + Math.cos(rot) * center.r,
                    Y: center.y + Math.sin(rot) * center.r
                };
                rot += step;
                G0G1(false, [`X${np.X}`, `Y${np.Y}`, `E1`]);
            }

            G0G1(false, [`X${rec.X}`, `Y${rec.Y}`, `E1`]);

            pos.X = rec.X;
            pos.Y = rec.Y;
        }

        function G0G1(g0, line) {
            const mov = {};
            const axes = {};

            lastG = g0 ? 'G0' : 'G1';

            line.forEach(tok => {
                let axis = tok.charAt(0);
                if (morph && belt) {
                    axis = beltaxis[axis];
                }
                let val = parseFloat(tok.substring(1));
                axes[axis] = val;
                if (abs) {
                    pos[axis] = val;
                } else {
                    mov[axis] = val;
                    pos[axis] += val;
                }
            });

            const point = newPoint(
                factor * pos.X + xoff.X,
                factor * pos.Y + xoff.Y,
                factor * pos.Z + xoff.Z + dz
            );

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
                scope.addOutput(seq, point, false, pos.F, tool).retract = retract;
                scope.lastPos = Object.assign({}, pos);
                return;
            }

            if (seq.Z === undefined) {
                seq.Z = pos.Z;
            }

            if (fdm && height === 0) {
                seq.height = defh = height = pos.Z;
            }

            // non-move in a new plane means burp out
            // the old sequence and start a new one
            if (newlayer || (autolayer && seq.Z != pos.Z)) {
                newlayer = false;
                let dz = pos.Z - seq.Z;
                let nh = dz > 0 ? dz : defh;
                seq = [];
                seq.height = height = nh;
                if (fdm) dz = -height / 2;
                output.push(seq);
            }

            if (!hasmoved && !moving) {
                seq.height = seq.Z = pos.Z;
                hasmoved = true;
            }

            // debug extrusion rate
            const lastPos = scope.lastPos;
            if (scope.debugE && fdm && lastPos && pos.E) {
                // extruder move
                let dE = (absE ? pos.E - scope.lastPosE : pos.E);
                // distance moved in XY
                let dV = Math.sqrt(
                    (Math.pow(pos.X - lastPos.X, 2)) +
                    (Math.pow(pos.Y - lastPos.Y, 2))
                );
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
            scope.addOutput(seq, point, true, pos.F, tool).retract = retract;
            scope.lastPos = Object.assign({}, pos);
            scope.lastPosE = pos.E;
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
                    G0G1(true, line);
                    break;
                case 'G1':
                    G0G1(false, line);
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

        // apply origin offset
        for (let layer of output) {
            for (let rec of layer) {
                let point = rec.point;
                point.x += off.X;
                point.y += off.Y;
                point.z += off.Z;
            }
        }

        scope.imported = gcode;
        scope.lines = lines.length;
        scope.bytes = gcode.length;
        scope.minSpeed = Math.floor(minf / 60);
        scope.maxSpeed = Math.floor(maxf / 60);
        scope.belt = belt;

        if (scope.debugE) {
            console.log({ bounds, print_time: time.round(2) });
        }

        done({ output: scope.output });
    }
}

class Output {
    constructor(point, emit, speed, tool, type) {
        this.point = point; // point to emit
        this.emit = emit; // emit (feed for printers, power for lasers, cut for cam)
        this.speed = speed;
        this.tool = tool;
        this.type = type;
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

gapp.overlay(kiri, {
    Print,
    newPrint
});

});
