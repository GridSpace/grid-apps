/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.csg
// dep: kiri-mode.cam.driver
gapp.register("kiri-mode.cam.animate2", [], (root) => {

const { kiri } = root;
const { driver } = kiri;
const { CAM } = driver;

// ---( CLIENT FUNCTIONS )---

kiri.load(() => {
    if (!kiri.client) {
        return;
    }

    let meshes = {},
        button = {},
        label = {},
        material,
        speedPauses = [ 0, 0, 0, 0, 0 ],
        speedValues = [ 1, 2, 4, 8, 32 ],
        speedNames = [ "1x", "2x", "4x", "8x", "!!" ],
        speedMax = speedValues.length - 1,
        speedIndex = 0,
        speed,
        origin,
        color = 0;

    const { moto } = root;
    const { space } = moto;
    const { api } = kiri;

    function animate_clear2(api) {
        let { anim } = api.ui;
        kiri.client.animate_cleanup2();
        Object.keys(meshes).forEach(id => deleteMesh(id));
        api.widgets.setAxisIndex(0);
        api.uc.setVisible(anim.laba, true);
        api.uc.setVisible(anim.vala, true);
        anim.vala.value = "0.0";
}

    function animate2(api, delay) {
        let alert = api.alerts.show("building animation");
        let settings = api.conf.get();
        kiri.client.animate_setup2(settings, data => {
            handleUpdate(data);
            if (data) {
                return;
            }

            let { anim } = api.ui;
            Object.assign(button, {
                replay: anim.replay,
                play: anim.play,
                step: anim.step,
                pause: anim.pause,
                speed: anim.speed,
                trans: anim.trans,
                model: anim.model,
                shade: anim.shade
            });
            Object.assign(label, {
                progress: anim.progress,
                speed: anim.labspd,
                x: anim.valx,
                y: anim.valy,
                z: anim.valz,
                a: anim.vala
            });

            updateSpeed(0);
            setTimeout(step, delay || 0);
            toggleTrans(undefined, false);
            origin = settings.origin;

            button.replay.onclick = replay;
            button.play.onclick = play;
            button.step.onclick = step;
            button.pause.onclick = pause;
            button.speed.onclick = fast;
            button.trans.onclick = toggleTrans;
            button.model.onclick = toggleModel;
            button.shade.onclick = toggleStock;
            button.play.style.display = '';
            button.pause.style.display = 'none';

            api.event.emit('animate', 'CAM');
            api.alerts.hide(alert);
        });
    }

    gapp.overlay(kiri.client, {
        animate2(data, ondone) {
            kiri.client.send("animate2", data, ondone);
        },

        animate_setup2(settings, ondone) {
            color = settings.controller.dark ? 0x888888 : 0;
            material = new THREE.MeshMatcapMaterial({
                flatShading: true,
                transparent: false,
                opacity: 0.9,
                color: 0x888888,
                side: THREE.DoubleSide
            });
            kiri.client.send("animate_setup2", {settings}, ondone);
        },

        animate_cleanup2(data, ondone) {
            kiri.client.send("animate_cleanup2", data, ondone);
        }
    });

    gapp.overlay(CAM, {
        animate2,
        animate_clear2
    });

    function meshAdd(id, ind, pos, ilen, plen) {
        const geo = new THREE.BufferGeometry();
        const pa = plen ? pos.subarray(0, plen * 3) : pos;
        const ia = ilen ? ind.subarray(0, ilen) : ind;
        geo.setAttribute('position', new THREE.BufferAttribute(pa, 3));
        geo.setIndex(new THREE.BufferAttribute(ia, 1));
        const mesh = new THREE.Mesh(geo, material);
        mesh.pos = pos;
        mesh.ind = ind;
        space.world.add(mesh);
        meshes[id] = mesh;
    }

    function meshUpdate(id, ind, pos, ilen, plen) {
        const mesh = meshes[id];
        if (!mesh) {
            return; // animate cancelled
        }
        const geo = mesh.geometry;
        mesh.pos = pos || mesh.pos;
        mesh.ind = ind || mesh.ind;
        geo.setAttribute('position', new THREE.BufferAttribute(mesh.pos.subarray(0, plen * 3), 3));
        geo.setIndex(new THREE.BufferAttribute(mesh.ind.subarray(0, ilen), 1));
        geo.attributes.position.needsUpdate = true;
        geo.index.needsUpdate = true;
        space.update();
    }

    function deleteMesh(id) {
        space.world.remove(meshes[id]);
        delete meshes[id];
    }

    function toggleModel(ev,bool) {
        api.local.toggle('cam.anim.model', bool);
        api.widgets.all().forEach(w => w.toggleVisibility(bool));
    }

    function toggleStock(ev,bool,set) {
        set !== false && api.local.toggle('cam.anim.stock', bool);
        return api.event.emit('cam.stock.toggle', bool ?? undefined);
    }

    function toggleTrans(ev,bool) {
        bool = api.local.toggle('cam.anim.trans', bool);
        material.transparent = bool;
        material.needsUpdate = true;
    }

    function step() {
        updateSpeed();
        kiri.client.animate2({speed, steps: 1}, handleUpdate);
    }

    function play(opts) {
        const { steps } = opts;
        updateSpeed();
        if (steps !== 1) {
            button.play.style.display = 'none';
            button.pause.style.display = '';
        }
        kiri.client.animate2({
            speed,
            steps: steps || Infinity,
            pause: speedPauses[speedIndex]
        }, handleUpdate);
    }

    function fast(opts) {
        const { steps } = opts;
        updateSpeed(1);
        button.play.style.display = 'none';
        button.pause.style.display = '';
        kiri.client.animate2({
            speed,
            steps: steps || Infinity,
            pause: speedPauses[speedIndex]
        }, handleUpdate);
    }

    function pause() {
        button.play.style.display = '';
        button.pause.style.display = 'none';
        kiri.client.animate2({speed: 0}, handleUpdate);
    }

    function handleUpdate(data) {
        if (!data) {
            return;
        }
        if (data.mesh_add) {
            const { id, ind, pos, ilen, plen } = data.mesh_add;
            meshAdd(id, ind, pos, ilen, plen);
            space.refresh();
        }
        if (data.mesh_del) {
            deleteMesh(data.mesh_del);
        }
        if (data.mesh_move) {
            const { id, pos } = data.mesh_move;
            const mesh = meshes[id];
            if (mesh) {
                mesh.position.x = pos.x;
                mesh.position.y = pos.y;
                mesh.position.z = pos.z;
                space.refresh();
            }
            label.x.value = (pos.x - origin.x).toFixed(2);
            label.y.value = (pos.y + origin.y).toFixed(2);
            label.z.value = (pos.z - origin.z).toFixed(2);
        }
        if (data.stock_index !== undefined) {
            api.widgets.setAxisIndex(data.stock_index);
            label.a.value = -data.stock_index.toFixed(1);
        }
        if (data.mesh_index) {
            const { id, index } = data.mesh_index;
            const mesh = meshes[id];
            if (mesh) {
                mesh.rotation.x = (Math.PI / 180) * index;
                space.refresh();
            }
        }
        if (data.mesh_update) {
            const { id, ind, pos, ilen, plen } = data.mesh_update;
            meshUpdate(id, ind, pos, ilen, plen);
        }
        if (data && data.progress) {
            label.progress.value = (data.progress * 100).toFixed(1);
        }
    }

    function updateSpeed(inc = 0) {
        if (inc === Infinity) {
            speedIndex = speedMax;
        } else if (inc > 0) {
            speedIndex = (speedIndex + inc) % speedValues.length;
        }
        api.local.set('cam.anim.speed', speedIndex);
        speed = speedValues[speedIndex];
        label.speed.value = speedNames[speedIndex];
    }

    function replay() {
        animate_clear2(api);
        setTimeout(() => {
            animate2(api, 50);
        }, 250);
    }
});

// ---( WORKER FUNCTIONS )---
const { CSG } = root.base;

let nextMeshID = 1;

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
        send.data({ [action]: {
            id: this.id,
            ind: newbuf ? this.ibuf : undefined,
            pos: newbuf ? this.vbuf : undefined,
            ilen: this.ilen,
            plen: this.plen
        } });
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

kiri.load(() => {
    if (!kiri.worker) {
        return;
    }

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

    kiri.worker.animate_setup2 = function(data, send) {
        const { settings } = data;
        const { process } = settings;
        const print = worker.print;
        const density = parseInt(settings.controller.animesh) * 1000;
        const isIndexed = process.camStockIndexed;

        pathIndex = 0;
        path = print.output.flat();
        tools = settings.tools;
        stock = settings.stock;
        rez = 1/Math.sqrt(density/(stock.x * stock.y));

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
        for (let i=0; i<sliceCount; i++) {
            let xmin = -(x/2) + (i * sliceWidth) + sliceWidth / 2;
            let slice = new Stock(sliceWidth, y, z).translate(xmin, 0, 0);
            stockSlices.push(slice);
            slice.updateMesh([]);
            slice.send(send);
            // send({ mesh_move: { id: slice.id, pos: { x:0, y:0, z: stock.z/2} } });
        }

        send.done();
    };

    kiri.worker.animate2 = function(data, send) {
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

    kiri.worker.animate_cleanup2 = function(data, send) {
        if (animating) {
            animateClear = true;
        }
    };

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
            console.log('animation completed in ', ((Date.now() - startTime)/1000).round(2));
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
                dist = Math.sqrt(dx*dx  + dy*dy + dz*dz + dr*dr);

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
            const sd = Math.sqrt(mx*mx + my*my + Math.min(1,mz*mz) + dr*dr);
            const moves = [];
            for (let i=0, x=lp.x, y=lp.y, z=lp.z; i<st; i++) {
                moves.push({x,y,z,a:lp.a,md:sd});
                x += mx;
                y += my;
                z += mz;
            }
            moveDist = 0;
            moves.push({...next.point, md:sd});
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
        for (let index = seed; index<moves.length; index++) {
            const pos = moves[index];
            if (!pos) {
                throw `no pos @ ${index} of ${moves.length}`;
            }
            toolMove(pos);
            // console.log('renderMoves', {id, moves, seed});
            let subs = 0;
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
            let tmp = toolMesh.mesh.rotate([ pos.a, 0, 0 ]);
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
                .add(sphere(frad, 20).translate(0, 0, -(tlen - frad * 2)/2))
                .add(cylinder(slen, srad, srad, 20, true).translate(0, 0, flen/2));
        } else if (tool.isTaperMill()) {
            const trad = Math.max(tool.tipDiameter() / 2, 0.001);
            mesh = cylinder(slen, srad, srad, 20, true).translate(0, 0, slen/2)
                .add(cylinder(flen, trad, frad, 20, true).translate(0, 0, -flen/2));
        } else {
            mesh = cylinder(tlen, frad, frad, 20, true)
                .add(cylinder(slen, srad, srad, 20, true).translate(0, 0, flen/2));
        }
        mesh = mesh.translate(0, 0, (tlen - stockZ) / 2);
        const raw = mesh.getMesh();
        const vertex = raw.vertProperties;
        const index = raw.triVerts;
        toolMesh = { root: mesh, index, vertex, bounds: CSG.toBox3(mesh) };
        send.data({ mesh_add: { id:--toolID, ind: index, pos: vertex }});
    }

});

});
