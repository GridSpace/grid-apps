/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// WORKER BACK END ANIMATION CODE for 3D (indexed)

import { CSG } from '../../geo/csg.js';

let nextMeshID = 1;
let stock, center, rez;
let path, pathIndex, tool, tools, last;

let stockZ;
let stockIndexMsg = false;
let stockSlices;
let stockIndex;
let startTime;

let toolID = -1;
let toolMesh;
let toolRadius;
let toolUpdateMsg;

let animateClear = false;
let animating = false;
let moveDist = 0;
let renderDist = 0;
let renderDone = false;
let renderPause = 10;
let renderSteps = 0;
let renderSpeed = 0;
let indexCount = 0;
let updates = 0;

export function init(worker) {
    const { dispatch } = worker;

    dispatch.animate_setup2 = function (data, send) {
        const { settings } = data;
        const { process } = settings;
        const print = worker.current.print;
        const density = parseInt(settings.controller.animesh) * 1000;
        const isIndexed = process.camStockIndexed;

        pathIndex = 0;
        path = print.output.flat();
        tools = settings.tools;
        stock = settings.stock;
        rez = 1 / Math.sqrt(density / (stock.x * stock.y));

        tool = null;
        last = null;
        animating = false;
        animateClear = false;
        stockIndex = 0;
        indexCount = 0;
        startTime = 0;
        updates = 0;
        stockZ = isIndexed ? 0 : stock.z;

        stockSlices = [];
        const { x, y, z } = stock;
        const sliceCount = parseInt(settings.controller.animesh || 2000) / 100;
        const sliceWidth = stock.x / sliceCount;
        for (let i = 0; i < sliceCount; i++) {
            let xmin = -(x / 2) + (i * sliceWidth) + sliceWidth / 2;
            let slice = new Stock(sliceWidth, y, z).translate(xmin, 0, 0);
            stockSlices.push(slice);
            slice.updateMesh([]);
            slice.send(send);
            // send({ mesh_move: { id: slice.id, pos: { x:0, y:0, z: stock.z/2} } });
        }

        send.done();
    };

    dispatch.animate2 = function (data, send) {
        renderPause = data.pause || renderPause;
        renderSpeed = data.speed || 0;
        if (animating) {
            return send.done();
        }
        renderSteps = data.steps || 1;
        renderDone = false;
        animating = renderSpeed > 0;
        startTime = startTime || Date.now();
        renderPath(send);
    };

    dispatch.animate_cleanup2 = function (data, send) {
        if (animating) {
            animateClear = true;
        }
    };
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
        console.log('animation completed in ', ((Date.now() - startTime) / 1000).round(2));
        animating = false;
        renderPath(send);
        return;
    }
    pathIndex++;
    // console.log(next.point.z);

    if (next.tool && (!tool || tool.getID() !== next.tool.getID())) {
        // on real tool change, go to safe Z first
        if (tool && last.point) {
            let pos = last.point = {
                x: last.point.x,
                y: last.point.y,
                z: stock.z
            };
            toolMove(pos);
            send.data(toolUpdateMsg);
        }
        toolUpdate(next.tool.getID(), send);
    }

    const id = toolID;
    const rezstep = rez * 2;
    if (last) {
        const lp = last.point, np = next.point;
        last = next;
        // dwell ops have no point
        if (!np || !lp) {
            return renderPath(send);
        }
        let dx = np.x - lp.x,
            dy = np.y - lp.y,
            dz = np.z - lp.z,
            da = Math.abs((np.a || 0) - (lp.a || 0)),
            dr = (da / 360) * (2 * Math.PI * Math.max(np.z, lp.z)),
            dist = Math.sqrt(dx * dx + dy * dy + dz * dz + dr * dr);

        moveDist += dist;

        // skip moves that are less than grid resolution
        if (moveDist < rezstep) {
            // console.log('skip', moveDist, rezstep, next);
            renderPath(send);
            return;
        }

        const md = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), dr);
        const st = Math.ceil(md / rezstep);
        const mx = dx / st, my = dy / st, mz = dz / st;
        // const sd = Math.sqrt(mx*mx + my*my + mz*mz + dr*dr);
        const sd = Math.sqrt(mx * mx + my * my + Math.min(1, mz * mz) + dr * dr);
        const moves = [];
        for (let i = 0, x = lp.x, y = lp.y, z = lp.z; i < st; i++) {
            moves.push({ x, y, z, a: lp.a, md: sd, dx, dy, dz });
            x += mx;
            y += my;
            z += mz;
        }
        moveDist = 0;
        moves.push({ ...next.point, md: sd });
        renderMoves(id, moves, send);
    } else {
        last = next;
        if (tool) {
            toolMove(next.point);
        }
        renderPath(send);
    }
}

function renderMoves(id, moves, send, seed = 0) {
    for (let index = seed; index < moves.length; index++) {
        const pos = moves[index];
        if (!pos) {
            throw `no pos @ ${index} of ${moves.length}`;
        }
        const { dx, dy, dz } = pos;
        toolMove(pos);
        // console.log('renderMoves', {id, moves, seed});
        let subs = 0;
        if (dx || dy || dz < 0)
            for (let slice of stockSlices) {
                if (slice.bounds.intersectsBox(toolMesh.bounds)) {
                    slice.subtractTool(toolMesh);
                    subs++;
                }
            }
        // console.log({ index, subs });
        renderDist += pos.md;
        // pause renderer at specified offsets
        if (renderSpeed && renderDist >= renderSpeed) {
            renderDist = 0;
            renderUpdate(send);
            setTimeout(() => {
                renderMoves(id, moves, send, index + 1);
            }, renderPause);
            return;
        }
    }
    renderPath(send);
}

// send latest tool position and progress bar
function renderUpdate(send) {
    const updated = []
    for (let slice of stockSlices) {
        slice.updateMesh(updated);
    }
    for (let slice of updated) {
        slice.send(send);
    }
    if (toolUpdateMsg) {
        send.data(toolUpdateMsg);
    }
    if (stockIndexMsg) {
        send.data({ stock_index: stockIndex });
        for (let slice of stockSlices) {
            send.data({ mesh_index: { id: slice.id, index: -stockIndex } });
        }
        stockIndexMsg = false;
    }
    send.data({ progress: pathIndex / path.length });
    updates++;
}

// move tool mesh animation space, update client
function toolMove(pos) {
    toolUpdateMsg = { mesh_move: { id: toolID, pos: { x: pos.x, y: pos.y, z: pos.z } } };
    if (toolMesh.mesh) {
        toolMesh.mesh.delete();
    }
    toolMesh.mesh = toolMesh.root.translate(pos.x, pos.y, pos.z);
    if (pos.a !== undefined) {
        let tmp = toolMesh.mesh.rotate([pos.a, 0, 0]);
        toolMesh.mesh.delete();
        toolMesh.mesh = tmp;
        if (pos.a !== stockIndex) {
            stockIndexMsg = true;
            stockIndex = pos.a;
        }
    }
    toolMesh.bounds = CSG.toBox3(toolMesh.mesh);
}

// delete old tool mesh, generate tool mesh, send to client
function toolUpdate(toolid, send) {
    if (tool) {
        send.data({ mesh_del: toolID });
    }
    tool = new CAM.Tool({ tools }, toolid);
    const Instance = CSG.Instance();
    const slen = tool.shaftLength() || 15;
    const srad = tool.shaftDiameter() / 2;
    const flen = tool.fluteLength() || 15;
    const frad = toolRadius = tool.fluteDiameter() / 2;
    const tlen = slen + flen; // total tool length
    let { cylinder, sphere } = Instance.Manifold;
    let mesh;
    if (tool.isBallMill()) {
        mesh = cylinder(tlen - frad * 2, frad, frad, 20, true)
            .add(sphere(frad, 20).translate(0, 0, -(tlen - frad * 2) / 2))
            .add(cylinder(slen, srad, srad, 20, true).translate(0, 0, flen / 2));
    } else if (tool.isTaperMill()) {
        const trad = Math.max(tool.tipDiameter() / 2, 0.001);
        mesh = cylinder(slen, srad, srad, 20, true).translate(0, 0, slen / 2)
            .add(cylinder(flen, trad, frad, 20, true).translate(0, 0, -flen / 2));
    } else {
        mesh = cylinder(tlen, frad, frad, 20, true)
            .add(cylinder(slen, srad, srad, 20, true).translate(0, 0, flen / 2));
    }
    mesh = mesh.translate(0, 0, (tlen - stockZ) / 2);
    const raw = mesh.getMesh();
    const vertex = raw.vertProperties;
    const index = raw.triVerts;
    toolMesh = { root: mesh, index, vertex, bounds: CSG.toBox3(mesh) };
    send.data({ mesh_add: { id: --toolID, ind: index, pos: vertex } });
}

class Stock {
    constructor(x, y, z) {
        this.id = nextMeshID++;
        this.vbuf = undefined;
        this.ibuf = undefined;
        this.ilen = 0;
        this.sends = 0;
        this.newbuf = true;
        this.subtracts = 0;
        this.mesh = CSG.Instance().Manifold.cube([x, y, z], true);
    }

    send(send) {
        const newbuf = this.newbuf;
        const action = this.sends++ === 0 ? 'mesh_add' : 'mesh_update';
        send.data({
            [action]: {
                id: this.id,
                ind: newbuf ? this.ibuf : undefined,
                pos: newbuf ? this.vbuf : undefined,
                ilen: this.ilen,
                plen: this.plen
            }
        });
        this.newbuf = false;
        this.sends++;
        // console.log({ send: this.id, newbuf, action });
    }

    translate(x, y, z) {
        // console.log({ translate: this.id, x, y, z });
        const oldmesh = this.mesh;
        this.mesh = this.mesh.translate(x, y, z);
        this.bounds = CSG.toBox3(this.mesh);
        oldmesh.delete();
        return this;
    }

    updateMesh(updates) {
        if (this.sends > 0 && this.subtracts === 0) {
            return;
        }
        const subs = this.subtracts;
        this.subtracts = 0;
        let start = Date.now();
        let mesh = this.mesh.getMesh();
        this.sharedVertexBuffer(mesh.numVert * 3);
        this.sharedIndexBuffer(mesh.numTri * 3);
        this.vbuf.set(mesh.vertProperties);
        this.ibuf.set(mesh.triVerts);
        let sub = Date.now();
        updates.push(this);
        if (false) console.log({
            update: this.id,
            time: sub - start,
            subs,
            mssub: ((sub - start) / subs).round(3)
        });
    }

    subtractTool(toolMesh) {
        const oldmesh = this.mesh;
        this.mesh = this.mesh.subtract(toolMesh.mesh);
        oldmesh.delete();
        this.subtracts++;
    }

    sharedVertexBuffer(size) {
        const old = this.vbuf;
        this.plen = size;
        if (old && old.length >= size) {
            // console.log({svb: this.id, reuse: size, old: old.length});
            return old;
        }
        // let buf = new Float32Array(new SharedArrayBuffer(size * 4));
        let buf = new Float32Array(new SharedArrayBuffer(size * 4 + 1024 * 1024));
        // console.log({new_svb: this.id, size, buf});
        this.newbuf = true;
        return this.vbuf = buf;
    }

    sharedIndexBuffer(size) {
        const old = this.ibuf;
        this.ilen = size;
        if (old && old.length >= size) {
            // console.log({sib: this.id, reuse: size, old: old.length});
            return old;
        }
        // let buf = new Uint32Array(new SharedArrayBuffer(size * 4));
        let buf = new Uint32Array(new SharedArrayBuffer(size * 4 + 1024 * 1024));
        // console.log({new_sib: this.id, size, buf});
        this.newbuf = true;
        return this.ibuf = buf;
    }
}
