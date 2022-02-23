/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.point
// dep: geo.polygon
gapp.register("kiri.render", [], (root, exports) => {

const { base, kiri } = root;
const { config, util, newPolygon } = base;

exports({
    path,
    is_dark,
    rate_to_color
});

function is_dark() {
    return root.worker.print.settings.controller.dark ? true : false;
};

function rate_to_color(rate, max) {
    return is_dark() ?
        darkColorFunction(rate/max, 1, 0.85) :
        currentColorFunction(rate/max, 1, 0.85);
};

function path(levels, update, opts = {}) {
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

    const moveOpt = {
        face: moveColor,
        line: flat ? 1 : moveColor,
        opacity: flat ? 0.5 : 1
    };
    const printOpt = {
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
    let current = null;
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
        const output = new kiri.Layers();
        layers.push(output);

        const pushPrint = (toolid, poly) => {
            toolid = toolid || 0;
            const array = prints[toolid] = prints[toolid] || [];
            const tool = tools[toolid] || {};
            array.width = (tool.extNozzle || 1) / 2;
            array.push(poly);
            emits++;
        };

        let height = level.height / 2;
        let width = 1;
        let emits = 0;

        level.forEach((out,oi) => {
            if (retracted && out.emit) {
                retracted = false;
                engages.push(lastOut.point);
            }
            if (out.tool !== lastTool) {
                lastTool = out.tool;
                changes.push(out.point);
            }
            if (out.retract) {
                retracts.push(out.point);
                retracted = true;
                retractz++;
            }
            if (!out.point) {
                // in cam mode, these are drilling or dwell ops
                return;
            }

            if (lastOut) {
                if (arrowAll || lastOut.emit !== out.emit) {
                    heads.push({p1: lastOut.point, p2: out.point});
                }
                const op = out.point, lp = lastOut.point;
                // const moved = Math.max(
                //     Math.abs(op.x - lp.x),
                //     Math.abs(op.y - lp.y),
                //     Math.abs(op.z - lp.z));
                // if (moved < 0.0001) return;
                if (out.emit) {
                    if (!lastOut.emit || (ckspeed && out.speed !== lastOut.speed) || lastEnd) {
                        current = newPolygon().setOpen();
                        current.push(lastOut.point);
                        current.color = color(out);
                        pushPrint(out.tool, current);
                    }
                    current.push(out.point);
                } else {
                    if (lastOut.emit || lastEnd) {
                        current = newPolygon().setOpen();
                        current.push(lastOut.point);
                        moves.push(current);
                    }
                    current.push(out.point);
                }
                lastEnd = null;
            } else {
                current = newPolygon().setOpen();
                current.push(out.point);
                if (out.emit) {
                    current.color = color(out);
                    pushPrint(out.tool, current);
                } else {
                    moves.push(current);
                }
            }
            lastOut = out;
        });
        // all moves with an emit at the very end (common in contouring)
        if (lastOut.emit && !emits) {
            pushPrint(lastOut.tool, current)
        }
        lastEnd = lastOut;
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
        if (heads.length) {
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
        output
            .setLayer(opts.other || 'move', moveOpt, opts.moves !== true)
            .addPolys(moves, { thin: true, z: opts.z });
        // force level when present
        let pz = level.z ? level.z - height : opts.z;
        Object.values(prints).forEach(array => {
            array.forEach(poly => {
                if (flat && poly.appearsClosed()) {
                    poly.setClosed();
                    poly.points.pop();
                }
                output
                .setLayer(opts.action || 'print', printOpt)
                .addPolys([ poly ],
                    thin ? { thin, z: opts.z, color: poly.color } :
                    flat ? {
                        flat, z: pz, color: poly.color,
                        outline: true, offset: array.width, open: poly.open  } :
                    {
                        offset: array.width, height, z: pz,
                        color: { face: poly.color, line: poly.color }
                    })
            });
        });

        update(index / levels.length, output);
    });
    // console.log({retractz});
    return layers;
}

const colorFunctions = {
    default: hsv2rgb.bind({ seg: 4, fn: color4d }),
    simple: hsv2rgb.bind({ seg: 3, fn: color4 }),
    dark: hsv2rgb.bind({ seg: 4, fn: color4d })
};

let currentColorFunction = colorFunctions.default;
let darkColorFunction = colorFunctions.dark;

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

function color4d(rgb, inc, seg) {
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
            rgb.r = inc * 0.85;
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
