/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

/*
 * uses `layers.js` to convert paths (usually preview) into primordial geometries.
 * the input is based on an array (layers) of arrays containing `Output` objects
 */

// dep: geo.base
// dep: geo.point
// dep: geo.polygon
gapp.register("kiri.render", [], (root, exports) => {

const { base, kiri } = root;
const { config, util, newPolygon } = base;
const hsV = 0.9;
const XAXIS = new THREE.Vector3(1,0,0);
const DEG2RAD = Math.PI / 180;

exports({
    path,
    is_dark,
    rate_to_color
});

function is_cam() {
    return root.worker.print.settings.mode === 'CAM';
}

function is_dark() {
    return root.worker.print.settings.controller.dark ? true : false;
};

function rate_to_color(rate, max) {
    if (is_cam()) {
        return is_dark() ?
            darkColorFunctionCAM(rate/max, 1, hsV) :
            lightColorFunctionCAM(rate/max, 1, hsV);
    } else {
        return is_dark() ?
            darkColorFunction(rate/max, 1, hsV) :
            lightColorFunction(rate/max, 1, hsV);
    }
};

async function path(levels, update, opts = {}) {
    levels = levels.filter(level => level.length);
    if (levels.length === 0) {
        self.worker.print.maxSpeed = 0;
        return [];
    }

    const dark = is_dark();
    const tools = opts.tools || {};
    const flat = opts.flat;
    const thin = opts.thin && !flat;
    const ckspeed = opts.speed !== false;
    const headColor = 0x888888;
    const moveColor = opts.move >= 0 ? opts.move : (dark ? 0x666666 : 0xaaaaaa);
    const printColor = opts.print >= 0 ? opts.print : 0x777700;
    const arrowAll = true;
    const arrowSize = arrowAll ? 0.2 : 0.4;
    const layers = [];
    const toolMode = opts.toolMode;
    const lineWidth = opts.lineWidth;

    const moveOpt = {
        face: moveColor,
        line: flat ? 1 : moveColor,
        opacity: flat ? 0.5 : 1
    };
    const printOpt = {
        // fat: thin ? 1.5 : 0,
        face: printColor,
        line: flat ? 1 : printColor,
        opacity: flat ? 0.5 : 1
    };

    let minspd = Infinity;
    let maxspd = opts.maxspeed || 0;
    let maxtool = [];

    for (let level of levels) {
        for (let o of level) {
            if (o.speed) {
                minspd = Math.min(minspd, o.speed);
                maxspd = Math.max(maxspd, o.speed);
            }
            if (toolMode && o.tool !== undefined) {
                if (maxtool.indexOf(o.tool) < 0) {
                    maxtool.push(o.tool);
                }
            }
        }
    }

    // const maxspd = levels.map(level => {
    //     return level.map(o => o.speed || 0).reduce((a, v) => Math.max(a,v));
    // }).reduce((a, v) => Math.max(a, v)) + 1;

    // for reporting
    self.worker.print.minSpeed = minspd;
    self.worker.print.maxSpeed = maxspd;
    self.worker.print.thinColor = thin;
    self.worker.print.flatColor = flat;

    let lastTool = null;
    let lastEnd = null;
    let lastOut = null;
    let lastOutPoint = null;
    let current = null;
    let currentLaser = null;
    let retracted = false;
    let retractz = 0;

    function color(point) {
        if (toolMode) {
            return rate_to_color(maxtool.indexOf(point.tool), maxtool.length);
        } else {
            return rate_to_color(point.speed, maxspd);
        }
    }

    levels.forEach((level, index) => {
        const prints = {};
        const moves = [];
        const heads = [];
        const changes = [];
        const retracts = [];
        const engages = [];
        const lasers = [];
        const sparks = [];
        const output = new kiri.Layers();
        layers.push(output);

        const pushPrint = (toolid, poly) => {
            toolid = toolid || 0;
            const array = prints[toolid] = prints[toolid] || [];
            const tool = tools[toolid] || {};
            array.width = (lineWidth || tool.extNozzle || 1) / 2;
            array.push(poly);
            emits++;
        };

        let height = level.height / 2;
        let width = 1;
        let emits = 0;

        level.forEach(out => {
            // skip cam gcode records
            if (out.gcode) {
                return;
            }
            if (retracted && out.emit) {
                retracted = false;
                engages.push(lastOutPoint);
            }
            let outPoint = out.point;
            // rotate 4th axis indexed points
            // todo -- add spark lines
            if (outPoint && outPoint.a !== undefined) {
                let { point } = out;
                // calculate rotated point
                let p2 = new THREE.Vector3(point.x, point.y, point.z)
                    .applyAxisAngle(XAXIS, point.a * DEG2RAD);
                // reconstruct point point for display without A axis
                outPoint = base.newPoint(p2.x, p2.y, p2.z);
                // let sp = base.newPoint(outPoint.x * 1.1, outPoint.y * 1.1, outPoint.z * 1.1);
                // sparks.push(outPoint, sp);
            }
            if (out.tool !== lastTool) {
                lastTool = out.tool;
                changes.push(outPoint);
            }
            if (out.retract) {
                retracts.push(outPoint);
                retracted = true;
                retractz++;
            }
            if (!outPoint) {
                // in cam mode, these are drilling or dwell ops
                return;
            }

            if (lastOut) {
                if (arrowAll || lastOut.emit !== out.emit) {
                    heads.push({p1: lastOutPoint, p2: outPoint});
                }
                const op = outPoint, lp = lastOutPoint;
                // const moved = Math.max(
                //     Math.abs(op.x - lp.x),
                //     Math.abs(op.y - lp.y),
                //     Math.abs(op.z - lp.z));
                // if (moved < 0.0001) return;
                if (out.emit) {
                    if (!lastOut.emit || (ckspeed && out.speed !== lastOut.speed) || lastEnd) {
                        current = newPolygon().setOpen();
                        current.push(lastOutPoint);
                        current.color = color(out);
                        pushPrint(out.tool, current);
                    }
                    current.push(outPoint);
                } else {
                    if (lastOut.emit || lastEnd) {
                        current = newPolygon().setOpen();
                        current.push(lastOutPoint);
                        moves.push(current);
                    }
                    current.push(outPoint);
                }
                if (out.type === 'laser') {
                    current.isLaser = true;
                    if (out.emit) {
                        if (!lastOut.emit || out.emit !== lastOut.emit) {
                            // off to on or different power
                            currentLaser = newPolygon().setOpen();
                            currentLaser.push(lastOutPoint);
                            currentLaser.color = rate_to_color(out.emit, 1);
                            lasers.push(currentLaser);
                        }
                        currentLaser.push(outPoint);
                    }
                }
                lastEnd = null;
            } else {
                current = newPolygon().setOpen();
                current.push(outPoint);
                if (out.emit) {
                    current.color = color(out);
                    pushPrint(out.tool, current);
                } else {
                    moves.push(current);
                }
            }
            lastOut = out;
            lastOutPoint = outPoint;
        });

        if (!lastOut) {
            // laser levels alone
            return;
        }

        lastEnd = lastOut;

        // all moves with an emit at the very end (common in contouring)
        if (lastOut.emit && !emits) {
            pushPrint(lastOut.tool, current)
        }

        if (lasers.length) {
            for (let poly of lasers)
            output
                .setLayer('power', { line: 0x000055, face: 0x0000ff, opacity: 0.5 }, true)
                .addPolys([ poly ], { thin: true, z: opts.z, color: poly.color });
        }

        if (changes.length) {
            output
                .setLayer('tool', { line: 0x000055, face: 0x0000ff, opacity: 0.5 }, true)
                .addAreas(changes.map(point => {
                    return newPolygon().centerCircle(point, 0.2, 4).setZ(point.z + 0.03);
                }), { outline: true });
        }

        if (retracts.length) {
            output
                .setLayer('retract', { line: 0x550000, face: 0xff0000, opacity: 0.5 }, true)
                .addAreas(retracts.map(point => {
                    return newPolygon().centerCircle(point, 0.2, 5).setZ(point.z + 0.01);
                }), { outline: true });
        }

        if (engages.length) {
            output
                .setLayer('engage', { line: 0x005500, face: 0x00ff00, opacity: 0.5 }, true)
                .addAreas(engages.map(point => {
                    return newPolygon().centerCircle(point, 0.2, 7).setZ(point.z + 0.02);
                }), { outline: true });
        }

        if (thin && sparks.length) {
            let line = dark ? 0xffffff : 0x112233;
            output
                .setLayer('sparks', { face: headColor, line, opacity: 0.75 }, true)
                .addLines(sparks, { thin: true });
        }

        if (thin && heads.length) {
            let line = dark ? 0xffffff : 0x112233;
            output
                .setLayer('arrows', { face: headColor, line, opacity: 0.75 }, true)
                .addAreas(heads.map(points => {
                    const {p1, p2} = points;
                    const slope = p2.slopeTo(p1);
                    const s1 = base.newSlopeFromAngle(slope.angle + 20);
                    const s2 = base.newSlopeFromAngle(slope.angle - 20);
                    const p3 = points.p2.projectOnSlope(s1, arrowSize);
                    const p4 = points.p2.projectOnSlope(s2, arrowSize);
                    return newPolygon().addPoints([p2,p3,p4]).setZ(p2.z + 0.01);
                }), { thin: true, outline: true });
        }

        // always add moves
        output
            .setLayer(opts.other || 'move', moveOpt, opts.moves !== true)
            .addPolys(moves, { thin: true, z: opts.z });

        // force level when present
        let pz = level.z ? level.z - height : opts.z;
        for (let array of Object.values(prints)) {
            for (let poly of array) {
                if (flat && poly.appearsClosed()) {
                    poly.setClosed();
                    poly.points.pop();
                }
                let action = poly.isLaser ? 'speed' : opts.action || 'print';
                output
                    .setLayer(action, printOpt)
                    .addPolys([ poly ],
                        thin ? { thin, z: opts.z, color: poly.color } :
                        flat ? {
                            flat, z: pz, color: poly.color,
                            outline: true, offset: array.width, open: poly.open  } :
                        {
                            offset: array.width, height, z: pz,
                            color: { face: poly.color, line: poly.color }
                        })
            }
        }

        update(index / levels.length, output);
    });

    return layers;
}

const colorFunctions = {
    simple: hsv2rgb.bind({ seg: 3, fn: color4 }),
    light: hsv2rgb.bind({ seg: 4, fn: color4light }),
    light2: hsv2rgb.bind({ seg: 4, fn: color4light2 }),
    light_cam: hsv2rgb.bind({ seg: 2, fn: color4light }),
    dark: hsv2rgb.bind({ seg: 4, fn: color4dark }),
    dark_cam: hsv2rgb.bind({ seg: 2, fn: color4dark })
};

let lightColorFunction = colorFunctions.light2;
let darkColorFunction = colorFunctions.dark;
let lightColorFunctionCAM = colorFunctions.light_cam;
let darkColorFunctionCAM = colorFunctions.dark_cam;

// hsv values all = 0 to 1
function hsv2rgb(h, s, v) {
    const div = this.seg;
    const ss = 1 / div;
    const seg = Math.floor(h / ss);
    const rem = h - (seg * ss);
    const inc = (rem / ss);
    const dec = (1 - inc);
    const rgb = {r: 0, g: 0, b: 0};
    this.fn(rgb, inc, seg);
    rgb.r = ((rgb.r * 255 * v) & 0xff) << 16;
    rgb.g = ((rgb.g * 255 * v) & 0xff) << 8;
    rgb.b = ((rgb.b * 255 * v) & 0xff);
    return rgb.r | rgb.g | rgb.b;
}

function color5(rgb, inc, seg) {
    const dec = 1 - inc;
    switch (seg) {
        case 0:
            rgb.r = 1;
            rgb.g = inc;
            rgb.b = 0;
            break;
        case 1:
            rgb.r = dec;
            rgb.g = 1;
            rgb.b = 0;
            break;
        case 2:
            rgb.r = 0;
            rgb.g = dec;
            rgb.b = inc;
            break;
        case 3:
            rgb.r = inc;
            rgb.g = 0;
            rgb.b = 1;
            break;
        case 4:
            rgb.r = dec;
            rgb.g = 0;
            rgb.b = dec;
            break;
    }
}

function color4light(rgb, inc, seg) {
    const dec = 1 - inc;
    switch (seg) {
        case 0:
            rgb.r = 0.8;
            rgb.g = inc * 0.75;
            rgb.b = 0;
            break;
        case 1:
            rgb.r = dec * 0.8;
            rgb.g = 0.75;
            rgb.b = 0;
            break;
        case 2:
            rgb.r = 0;
            rgb.g = dec * 0.75;
            rgb.b = inc;
            break;
        case 3:
            rgb.r = inc * 0.75;
            rgb.g = 0;
            rgb.b = 1;
            break;
        case 4:
            rgb.r = 0.85;
            rgb.g = 0;
            rgb.b = 1;
            break;
    }
}

function color4light2(rgb, inc, seg) {
    const dec = 1 - inc;
    switch (seg) {
        case 0:
            rgb.r = 0.9;
            rgb.g = inc * 0.9;
            rgb.b = 0;
            break;
        case 1:
            rgb.r = dec * 0.9;
            rgb.g = 0.8;
            rgb.b = 0;
            break;
        case 2:
            rgb.r = 0;
            rgb.g = dec * 0.8;
            rgb.b = inc;
            break;
        case 3:
            rgb.r = inc * 0.9;
            rgb.g = 0;
            rgb.b = 1;
            break;
        case 4:
            rgb.r = 0.9;
            rgb.g = 0;
            rgb.b = 1;
            break;
    }
}

function color4dark(rgb, inc, seg) {
    const dec = 1 - inc;
    switch (seg) {
        case 0:
            rgb.r = 1;
            rgb.g = inc;
            rgb.b = 0;
            break;
        case 1:
            rgb.r = dec;
            rgb.g = 1;
            rgb.b = 0;
            break;
        case 2:
            rgb.r = 0;
            rgb.g = dec * 0.85 + 0.25;
            rgb.b = inc;
            break;
        case 3:
            rgb.r = inc * 0.85;
            rgb.g = 0.25;
            rgb.b = 1;
            break;
        case 4:
            rgb.r = 0.85;
            rgb.g = 0.25;
            rgb.b = 1;
            break;
    }
}

function color4(rgb, inc, seg) {
    const dec = 1 - inc;
    switch (seg) {
        case 0:
            rgb.r = 0;
            rgb.g = inc;
            rgb.b = 1;
            break;
        case 1:
            rgb.r = inc;
            rgb.g = 1;
            rgb.b = 0;
            break;
        case 2:
            rgb.r = 1;
            rgb.g = dec;
            rgb.b = 0;
            break;
        case 3:
            rgb.r = dec;
            rgb.g = 0;
            rgb.b = 0;
            break;
    }
}

});
