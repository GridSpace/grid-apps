/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// WORKER BACK END ANIMATION CODE for 2D

import { Tool } from './tool.js';

const asPoints = false;
const asLines = false;

let stock, center, grid, gridX, gridY, rez;
let path, pathIndex, tool, tools, last, toolID = 1;

export function init(worker) {
    const { dispatch } = worker;

    dispatch.animate_setup = function(data, send) {
        const { settings } = data;
        const { process } = settings;
        const print = worker.current.print;
        const density = parseInt(settings.controller.animesh) * 1000;

        pathIndex = 0;
        path = print.output.flat();
        tools = settings.tools;
        stock = settings.stock;
        rez = 1/Math.sqrt(density/(stock.x * stock.y));

        // destructure arcs into path points
        path = path.map(o =>
            o.arcPoints ? [ ...o.arcPoints.map(point => ({ ...o, point })), o ] : [ o ]
        ).flat();

        const step = rez;
        const stepsX = Math.floor(stock.x / step);
        const stepsY = Math.floor(stock.y / step);
        const { pos, ind, sab } = createGrid(stepsX, stepsY, stock, step, true);
        const offset = {
            x: process.camOriginCenter ? 0 : stock.x / 2,
            y: process.camOriginCenter ? 0 : stock.y / 2,
            z: process.camOriginTop ? -stock.z : 0
        }

        grid = pos;
        gridX = stepsX;
        gridY = stepsY;

        tool = null;
        last = null;
        animating = false;
        animateClear = false;

        center = Object.assign({}, stock.center);
        center.z -= stock.z / 2;

        send.data({ mesh_add: { id: 0, ind, offset, sab } }, [ ]); // sab not transferrable
        send.data({ mesh_move: { id: 0, pos: center } });
        send.done();
    };

    dispatch.animate = function(data, send) {
        renderPause = data.pause || renderPause;
        renderSpeed = data.speed || 0;
        if (animating) {
            return send.done();
        }
        renderSteps = data.steps || 1;
        renderDone = false;
        animating = renderSpeed > 0;
        renderPath(send);
    };

    dispatch.animate_cleanup = function(data, send) {
        if (animating) {
            animateClear = true;
        }
    };
}

function createGrid(stepsX, stepsY, size, step, stock) {
    const gridPoints = stepsX * stepsY;
    const sab = new SharedArrayBuffer(gridPoints * 3 * 4)
    const pos = new Float32Array(sab);
    const ind = [];
    const ox = size.x / 2;
    const oy = size.y / 2;
    let ex = stepsX - 1;
    let ey = stepsY - 1;

    // initialize grid points
    for (let x=0, ai=0; x<stepsX; x++) {
        for (let y=0; y<stepsY; y++) {
            let px = pos[ai++] = x * step - ox + step / 2;
            let py = pos[ai++] = y * step - oy + step / 2;
            pos[ai++] = stock && (x * y === 0 || x === ex || y === ey) ? 0 : size.z;
            if (asPoints) {
                continue;
            }
            if (asLines) {
                if (y > 0) ind.appendAll([
                    (stepsY * x) + (y - 1),
                    (stepsY * x) + (y    )
                ]);
                if (x > 0) ind.appendAll([
                    (stepsY * (x - 1)) + y,
                    (stepsY * (x    )) + y
                ]);
            } else {
                if (x > 0 && y > 0) {
                    let v0 = stepsY * (x - 1) + y - 1;
                    let v1 = stepsY * (x - 0) + y - 1;
                    let v2 = stepsY * (x - 0) + y;
                    let v3 = stepsY * (x - 1) + y;
                    ind.appendAll([
                        v0, v1, v2, v0, v2, v3
                    ]);
                }
            }
        }
    }

    return { pos, ind, sab };
}

let animateClear = false;
let animating = false;
let renderDist = 0;
let renderDone = false;
let renderPause = 10;
let renderSteps = 0;
let renderSpeed = 0;
let skipMove = null;
let toolUpdate;
let depth = 0;

// send latest tool position and progress bar
function renderUpdate(send) {
    if (toolUpdate) {
        send.data(toolUpdate);
    }
    send.data({ progress: pathIndex / path.length, id: 0, mesh_update: 1 });
}

function renderPath(send) {
    if (renderDone) {
        return;
    }

    if (renderSteps-- === 0) {
        animating = false;
        renderPath(send);
        return;
    }

    if (animating === false || animateClear || renderSpeed === 0) {
        renderUpdate(send);
        renderDone = true;
        animating = false;
        animateClear = false;
        send.done();
        return;
    }

    let next = path[pathIndex];
    while (next && next.type === 'laser') {
        last = next;
        next = path[++pathIndex];
    }

    if (!next) {
        animating = false;
        renderPath(send);
        return;
    }
    pathIndex++;

    const firstTool = !tool && next.tool;
    const toolChange = !firstTool && (tool.getID() !== next.tool.getID());
    if (firstTool || toolChange) {
        // on real tool change, go to safe Z first
        if (tool && last.point) {
            let pos = last.point = {
                x: last.point.x,
                y: last.point.y,
                z: stock.z
            };
            send.data({ mesh_move: { toolID, pos }});
        }
        updateTool(next.tool, send);
    }

    const id = toolID;
    const rezstep = rez;
    if (last) {
        const lp = last.point, np = next.point;
        last = next;
        // dwell ops have no point
        if (!np || !lp) {
            return renderPath(send);
        }
        const dx = np.x - lp.x, dy = np.y - lp.y, dz = np.z - lp.z;
        const dist = Math.sqrt(dx*dx  + dy*dy + dz*dz);
        renderDist += dist;

        // skip moves that are less than grid resolution
        if (renderDist < rezstep) {
            renderPath(send);
            return;
        }

        const md = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
        const st = Math.ceil(md / rezstep);
        const mx = dx / st, my = dy / st, mz = dz / st;
        const moves = [];
        for (let i=0, x=lp.x, y=lp.y, z=lp.z; i<st; i++) {
            moves.push({x,y,z});
            x += mx;
            y += my;
            z += mz;
        }
        moves.push(next.point);
        renderMoves(id, moves, send);
    } else {
        last = next;
        if (tool) {
            tool.pos = next.point;
            toolUpdate = { mesh_move: { id, pos: next.point }};
        }
        renderPath(send);
    }
}

function renderMoves(id, moves, send, seed = 0) {
    for (let index = seed; index<moves.length; index++) {
        const pos = moves[index];
        if (!pos) {
            throw `no pos @ ${index} of ${moves.length}`;
        }
        tool.pos = pos;
        deformMesh(pos, send);
        toolUpdate = { mesh_move: { id, pos }};
        // pause renderer at specified offsets
        if ((renderSpeed && renderDist >= renderSpeed) || (depth > 600)) {
            renderDist = depth = 0;
            renderUpdate(send);
            setTimeout(() => {
                renderMoves(id, moves, send, index);
            }, renderPause);
            return;
        }
    }
    depth++;
    renderPath(send);
}

// update stock mesh to reflect tool tip geometry at given XYZ position
function deformMesh(pos, send) {
    const prof = tool.profile;
    const { size, pix } = tool.profileDim;
    const mid = Math.floor(pix / 2);
    const rx = Math.floor((pos.x + stock.x / 2 - size / 2 - center.x) / rez);
    const ry = Math.floor((pos.y + stock.y / 2 - size / 2 - center.y) / rez);
    let upos = 0;
    // deform mesh to lowest point on tool profile
    for (let i=0, il=prof.length; i < il; ) {
        const dx = mid + prof[i++];
        const dy = mid + prof[i++];
        const dz = prof[i++];
        const gx = rx + dx;
        const gy = ry + dy;

        if (gx < 0|| gy < 0 || gx > gridX-1 || gy > gridY-1) {
            continue;
        }

        const gi = gx * gridY + gy;
        const iz = gi * 3 + 2;
        const cz = grid[iz];
        const tz = tool.pos.z - dz;
        if (tz < cz) {
            upos++;
            grid[iz] = tz;
        }
    }
}

function updateTool(toolobj, send) {
    if (tool) {
        send.data({ mesh_del: toolID });
    }
    tool = new Tool({ tools }, toolobj.getID());
    tool.generateProfile(rez);
    const flen = tool.fluteLength() || 15;
    const slen = tool.shaftLength() || 15;
    // const frad = tool.fluteDiameter() / 2;
    const prof = tool.profile;
    const { size, pix } = tool.profileDim;
    const { pos, ind, sab } = createGrid(pix, pix, {x:size, y:size, z:flen+slen}, rez);
    const mid = Math.floor(pix/2);
    // deform mesh to fit tool profile
    for (let i=0, il=prof.length; i < il; ) {
        const dx = mid + prof[i++];
        const dy = mid + prof[i++];
        const dz = prof[i++];
        pos[(dx * pix + dy) * 3 + 2] = -dz;
    }
    send.data({ mesh_add: { id:++toolID, ind, sab }});
}
