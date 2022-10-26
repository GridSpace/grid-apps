/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.csg
// dep: kiri-mode.cam.driver
gapp.register("kiri-mode.cam.animate2", [], (root) => {

const { kiri } = root;
const { driver } = kiri;
const { CAM } = driver;

let meshes = {},
    unitScale = 1,
    progress,
    speedValues = [ 1, 2, 4, 8, 32 ],
    speedPauses = [ 30, 20, 10, 5, 0 ],
    speedNames = [ "1x", "2x", "4x", "8x", "!!" ],
    speedMax = speedValues.length - 1,
    speedIndex = 0,
    speedLabel,
    speed,
    color = 0,
    pauseButton,
    playButton;

// ---( CLIENT FUNCTIONS )---

kiri.load(() => {
    if (!kiri.client) {
        return;
    }

    const { moto } = root;
    const { space } = moto;
    const { api } = kiri;

    function animate_clear(api) {
        moto.space.platform.showGridBelow(true);
        kiri.client.animate_cleanup();
        $('layer-animate').innerHTML = '';
        $('layer-toolpos').innerHTML = '';
        Object.keys(meshes).forEach(id => deleteMesh(id));
    }

    function animate(api, delay) {
        let alert = api.alerts.show("building animation");
        kiri.client.animate_setup(api.conf.get(), data => {
            checkMeshCommands(data);
            if (!(data && data.mesh_add)) {
                return;
            }
            const UC = api.uc;
            const layer = $('layer-animate');
            layer.innerHTML = '';
            UC.setGroup(layer);
            UC.newRow([
                UC.newButton(null,replay,{icon:'<i class="fas fa-fast-backward"></i>',title:"restart"}),
                playButton = UC.newButton(null,play,{icon:'<i class="fas fa-play"></i>',title:"play"}),
                pauseButton = UC.newButton(null,pause,{icon:'<i class="fas fa-pause"></i>',title:"pause"}),
                UC.newButton(null,step,{icon:'<i class="fas fa-step-forward"></i>',title:"single step"}),
                UC.newButton(null,fast,{icon:'<i class="fas fa-forward"></i>',title:"toggle speed"}),
                speedLabel = UC.newLabel("speed", {class:"speed"}),
                progress = UC.newLabel('0%', {class:"progress"})
            ]);
            updateSpeed();
            setTimeout(step, delay || 0);
            const toolpos = $('layer-toolpos');
            toolpos.innerHTML = '';
            UC.setGroup(toolpos);
            playButton.style.display = '';
            pauseButton.style.display = 'none';
            api.event.emit('animate', 'CAM');
            api.alerts.hide(alert);
            moto.space.platform.showGridBelow(false);
            $('render-hide').onclick();
        });
    }

    gapp.overlay(kiri.client, {
        animate(data, ondone) {
            kiri.client.send("animate", data, ondone);
        },

        animate_setup(settings, ondone) {
            color = settings.controller.dark ? 0x888888 : 0;
            unitScale = settings.controller.units === 'in' ? 1/25.4 : 1;
            kiri.client.send("animate_setup", {settings}, ondone);
        },

        animate_cleanup(data, ondone) {
            kiri.client.send("animate_cleanup", data, ondone);
        }
    });

    gapp.overlay(CAM, {
        animate,
        animate_clear
    });

    function meshAdd(id, ind, pos) {
        const geo = new THREE.BufferGeometry();
        // these arrive as shared array buffers
        // pos = new Float32Array(pos);
        // ind = new Uint32Array(ind);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(new THREE.BufferAttribute(ind, 1));
        const mat = new THREE.MeshMatcapMaterial({
            flatShading: true,
            transparent: true,
            opacity: 0.9,
            color: 0x888888,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        space.world.add(mesh);
        meshes[id] = mesh;
    }

    function meshUpdate(id, ind, pos) {
        const mesh = meshes[id];
        if (!mesh) {
            return; // animate cancelled
        }
console.log({update: id, ind, pos});
        const geo = mesh.geometry;
        if (ind) geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        if (pos) geo.setIndex(new THREE.BufferAttribute(ind, 1));
        geo.attributes.position.needsUpdate = true;
        geo.index.needsUpdate = true;
        space.update();
    }

    function deleteMesh(id) {
        space.world.remove(meshes[id]);
        delete meshes[id];
    }

    function step() {
        updateSpeed();
        kiri.client.animate({speed, steps: 1}, handleGridUpdate);
    }

    function play(opts) {
        const { steps } = opts;
        updateSpeed();
        if (steps !== 1) {
            playButton.style.display = 'none';
            pauseButton.style.display = '';
            $('render-hide').onclick();
        }
        kiri.client.animate({
            speed,
            steps: steps || Infinity,
            pause: speedPauses[speedIndex]
        }, handleGridUpdate);
    }

    function fast(opts) {
        const { steps } = opts;
        updateSpeed(1);
        playButton.style.display = 'none';
        pauseButton.style.display = '';
        $('render-hide').onclick();
        kiri.client.animate({
            speed,
            steps: steps || Infinity,
            pause: speedPauses[speedIndex]
        }, handleGridUpdate);
    }

    function pause() {
        playButton.style.display = '';
        pauseButton.style.display = 'none';
        kiri.client.animate({speed: 0}, handleGridUpdate);
    }

    function handleGridUpdate(data) {
        checkMeshCommands(data);
        if (data && data.progress) {
            progress.innerText = (data.progress * 100).toFixed(1) + '%'
        }
    }

    function updateSpeed(inc = 0) {
        if (inc === Infinity) {
            speedIndex = speedMax;
        } else if (inc > 0) {
            speedIndex = (speedIndex + inc) % speedValues.length;
        }
        speed = speedValues[speedIndex];
        speedLabel.innerText = speedNames[speedIndex];
    }

    function replay() {
        CAM.animate_clear(api);
        setTimeout(() => {
            CAM.animate(api, 50);
        }, 250);
    }

    function checkMeshCommands(data) {
        if (!data) {
            return;
        }
        if (data.mesh_add) {
            const { id, ind, pos } = data.mesh_add;
            meshAdd(id, ind, pos);
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
                space.update();
            }
        }
        if (data.mesh_update) {
            meshUpdate(data.id, data.ind, data.pos);
        }
    }

});

// ---( WORKER FUNCTIONS )---

kiri.load(() => {
    if (!kiri.worker) {
        return;
    }

    let stock, center, rez;
    let path, pathIndex, tool, tools, last, toolID = 1;
    let toolMesh, stockMesh;

    kiri.worker.animate_setup = function(data, send) {
        const { settings } = data;
        const { process } = settings;
        const print = worker.print;
        const density = parseInt(settings.controller.animesh) * 1000;

        unitScale = settings.controller.units === 'in' ? 1/25.4 : 1;
        pathIndex = 0;
        path = print.output.flat();
        tools = settings.tools;
        stock = settings.stock;
        rez = 1/Math.sqrt(density/(stock.x * stock.y));

        stockMesh = createStock(stock.x, stock.y, stock.z);
        const offset = {
            x: process.outputOriginCenter ? 0 : stock.x / 2,
            y: process.outputOriginCenter ? 0 : stock.y / 2,
            z: process.camOriginTop ? -stock.z : 0
        }

        tool = null;
        last = null;
        animating = false;
        animateClear = false;

        center = Object.assign({}, stock.center);
        center.z -= stock.z / 2;

        // shared array buffers are not transferrable
        send.data({ mesh_add: { id: 0, ind: stockMesh.index, pos: stockMesh.vertex } }, [ ]);
        send.data({ mesh_move: { id: 0, pos: center } });
        send.done();
    };

    kiri.worker.animate = function(data, send) {
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

    kiri.worker.animate_cleanup = function(data, send) {
        if (animating) {
            animateClear = true;
        }
    };

    function createStock(x, y, z) {
        const mesh = Module.cube([x,y,z], true).translate(0, 0, z/2);
        const { vertex, index } = mesh.getMesh({ normal: () => undefined });
        return { mesh, vertex, index };
    }

    function updateStock(rec) {
        const mesh = rec.mesh;
        const { index, vertex } = mesh.getMesh({ normal: () => undefined });
        rec.index = index;
        rec.vertex = vertex;
        return rec;
    }

    let animateClear = false;
    let animating = false;
    let renderDist = 0;
    let renderDone = false;
    let renderPause = 10;
    let renderSteps = 0;
    let renderSpeed = 0;
    let toolUpdate;

    // send latest tool position and progress bar
    function renderUpdate(send) {
        if (toolUpdate) {
            send.data(toolUpdate);
        }
        const { index, vertex } = updateStock(stockMesh);
        send.data({
            progress: pathIndex / path.length,
            id: 0,
            ind: index,
            pos: vertex,
            mesh_update: 1
        });
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

        if (next.tool >= 0 && (!tool || tool.getNumber() !== next.tool)) {
            // on real tool change, go to safe Z first
            if (tool && last.point) {
                let pos = last.point = {
                    x: last.point.x,
                    y: last.point.y,
                    z: stock.z
                };
                toolMove(pos);
                send.data(toolUpdate);
                // send.data({ mesh_move: { toolID, pos }});
            }
            updateTool(next.tool, send);
        }

        const id = toolID;
        const rezstep = 1;//rez;
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
                toolMove(next.point);
            }
            renderPath(send);
        }
    }

    function toolMove(pos) {
        const lpos = tool.pos || { x:0, y:0, z:0 };
        tool.pos = pos;
        toolUpdate = { mesh_move: { id: toolID, pos }};
        const delta = [ pos.x - lpos.x, pos.y - lpos.y, pos.z - lpos.z ];
        const oldmesh = toolMesh.mesh;
        toolMesh.mesh = toolMesh.mesh.translate(pos.x - lpos.x, pos.y - lpos.y, pos.z - lpos.z);
        oldmesh.delete();
    }

    function renderMoves(id, moves, send, seed = 0) {
        for (let index = seed; index<moves.length; index++) {
            const pos = moves[index];
            if (!pos) {
                throw `no pos @ ${index} of ${moves.length}`;
            }
            toolMove(pos);
            const oldmesh = stockMesh.mesh;
            stockMesh.mesh = stockMesh.mesh.subtract(toolMesh.mesh);
            oldmesh.delete();
            // pause renderer at specified offsets
            if (renderSpeed && renderDist >= renderSpeed) {
                renderDist = 0;
                renderUpdate(send);
                setTimeout(() => {
                    renderMoves(id, moves, send, index);
                }, renderPause);
                return;
            }
        }
        renderPath(send);
    }

    // generate tool mesh and send to client
    function updateTool(toolnum, send) {
        if (tool) {
            send.data({ mesh_del: toolID });
        }
        tool = new CAM.Tool({ tools }, undefined, toolnum);
        const flen = tool.fluteLength() || 15;
        const slen = tool.shaftLength() || 15;
        const frad = tool.fluteDiameter() / 2;
        const mesh = Module.cylinder(flen + slen, frad, frad, 20, true).translate(0, 0, (flen + slen)/2);
        const { vertex, index } = mesh.getMesh({ normal: () => undefined });
        toolMesh = { mesh, index, vertex };
        send.data({ mesh_add: { id:++toolID, ind: index, pos: vertex }});
    }

});

});
