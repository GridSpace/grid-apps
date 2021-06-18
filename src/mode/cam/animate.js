/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

self.kiri.loader.push(function() {

    let KIRI = self.kiri,
        CAM = KIRI.driver.CAM,
        API, WORLD, SPACE,
        meshes = {},
        unitScale = 1,
        progress, toolPosX, toolPosY, toolPosZ,
        speedValues = [ 25, 12, 6, 3 ],
        speedNames = [ "1x", "2x", "4x", "8x" ],
        speedMax = speedValues.length - 1,
        speedIndex = 0,
        speedLabel,
        speed,
        pauseButton,
        playButton;

    // ---( CLIENT FUNCTIONS )---

    if (KIRI.client)
    CAM.animate_clear = function(api) {
        KIRI.client.animate_cleanup();
        SPACE = (API = api).const.SPACE;
        WORLD = SPACE.platform.world;
        $('layer-animate').innerHTML = '';
        $('layer-toolpos').innerHTML = '';
        Object.keys(meshes).forEach(id => deleteMesh(id));
    }

    if (KIRI.client)
    CAM.animate = function(api, delay) {
        SPACE = (API = api).const.SPACE;
        WORLD = SPACE.platform.world;
        KIRI.client.animate_setup(API.conf.get(), data => {
            checkMeshCommands(data);
            if (!(data && data.mesh_add)) {
                return;
            }
            const UC = API.uc;
            const layer = $('layer-animate');
            layer.innerHTML = '';
            UC.setGroup(layer);
            UC.newRow([
                UC.newButton(null,replay,{icon:'<i class="fas fa-fast-backward"></i>',title:"restart"}),
                playButton = UC.newButton(null,play,{icon:'<i class="fas fa-play"></i>',title:"play"}),
                pauseButton = UC.newButton(null,pause,{icon:'<i class="fas fa-pause"></i>',title:"pause"}),
                UC.newButton(null,step,{icon:'<i class="fas fa-step-forward"></i>',title:"single step"}),
                UC.newButton(null,fast,{icon:'<i class="fas fa-forward"></i>',title:"toggle speed"}),
                UC.newButton(null,skip,{icon:'<i class="fas fa-fast-forward"></i>',title:"skip forward without animation"}),
                speedLabel = UC.newLabel("speed")
            ]);
            updateSpeed();
            setTimeout(() => {
                play({steps: 1});
            }, delay || 0);
            const toolpos = $('layer-toolpos');
            toolpos.innerHTML = '';
            UC.setGroup(toolpos);
            progress = UC.newInput('%', {disabled: true, size: 5});
            toolPosX = UC.newInput('x', {disabled: true, size: 7});
            toolPosY = UC.newInput('y', {disabled: true, size: 7});
            toolPosZ = UC.newInput('z', {disabled: true, size: 7});
            playButton.style.display = '';
            pauseButton.style.display = 'none';
            API.event.emit('animate', 'CAM');
        });
    };

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
        CAM.animate_clear(API);
        setTimeout(() => {
            CAM.animate(API, 50);
        }, 250);
    }

    function checkMeshCommands(data) {
        if (!data) {
            return;
        }
        if (data.mesh_add) {
            const { id, ind, pos } = data.mesh_add;
            meshAdd(id, ind, pos);
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
                SPACE.update();
                if (id !== 0) {
                    toolPosX.value = (pos.x * unitScale).toFixed(2);
                    toolPosY.value = (pos.y * unitScale).toFixed(2);
                    toolPosZ.value = (pos.z * unitScale).toFixed(2);
                }
            }
        }
        if (data.mesh_update) {
            meshUpdates(data.id, data.mesh_update);
        }
    }

    function meshAdd(id, ind, pos) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(ind), 1));
        const mat = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: 0.75,
            color: 0
        });
        const mesh = new THREE.LineSegments(geo, mat);
        WORLD.add(mesh);
        meshes[id] = mesh;
    }

    function meshUpdates(id, updates) {
        const mesh = meshes[id];
        if (!mesh) {
            return; // animate cancelled
        }
        const mpos = mesh.geometry.attributes.position;
        for (let i=0, il=updates.length; i<il; ) {
            const pos = updates[i++];
            const val = updates[i++];
            mpos.array[pos] = val;
        }
        mpos.needsUpdate = true;
        SPACE.update();
    }

    function deleteMesh(id) {
        WORLD.remove(meshes[id]);
        delete meshes[id];
    }

    function step(opts) {
        const { steps } = opts;
        updateSpeed();
        KIRI.client.animate({speed, steps: 1}, handleGridUpdate);
    }

    function play(opts) {
        const { steps } = opts;
        updateSpeed();
        if (steps !== 1) {
            playButton.style.display = 'none';
            pauseButton.style.display = '';
        }
        KIRI.client.animate({speed, steps: steps || Infinity}, handleGridUpdate);
    }

    function fast(opts) {
        const { steps } = opts;
        updateSpeed(1);
        playButton.style.display = 'none';
        pauseButton.style.display = '';
        KIRI.client.animate({speed, steps: steps || Infinity}, handleGridUpdate);
    }

    function pause() {
        playButton.style.display = '';
        pauseButton.style.display = 'none';
        KIRI.client.animate({speed: 0}, handleGridUpdate);
    }

    function skip() {
        API.show.alert('fast fowarding without animation');
        playButton.style.display = 'none';
        pauseButton.style.display = '';
        updateSpeed(Infinity);
        KIRI.client.animate({speed, steps: Infinity, toend: true}, handleGridUpdate);
    }

    function handleGridUpdate(data) {
        checkMeshCommands(data);
        if (data && data.progress) {
            progress.value = (data.progress * 100).toFixed(1)
        }
    }

    if (KIRI.client)
    KIRI.client.animate_setup = function(settings, ondone) {
        unitScale = settings.controller.units === 'in' ? 1/25.4 : 1;
        KIRI.client.send("animate_setup", {settings}, ondone);
    };

    if (KIRI.client)
    KIRI.client.animate = function(data, ondone) {
        KIRI.client.send("animate", data, ondone);
    };

    if (KIRI.client)
    KIRI.client.animate_cleanup = function(data, ondone) {
        KIRI.client.send("animate_cleanup", data, ondone);
    };

    // ---( WORKER FUNCTIONS )---

    let stock, center, grid, gridX, gridY, rez;
    let path, pathIndex, tool, tools, last, toolID = 1;

    if (KIRI.worker)
    KIRI.worker.animate_setup = function(data, send) {
        const { settings } = data;
        const print = current.print;
        const density = parseInt(settings.controller.animesh) * 1000;

        pathIndex = 0;
        path = print.output.flat();
        tools = settings.tools;
        stock = settings.stock;

        rez = 1/Math.sqrt(density/(stock.x * stock.y));

        const step = rez;
        const stepsX = Math.floor(stock.x / step);
        const stepsY = Math.floor(stock.y / step);
        const { pos, ind } = createGrid(stepsX, stepsY, stock, step);

        grid = pos;
        gridX = stepsX;
        gridY = stepsY;

        tool = null;
        last = null;
        animating = false;
        animateClear = false;

        center = Object.assign({}, stock.center);
        center.z -= stock.z / 2;

        send.data({ mesh_add: { id: 0, pos, ind } });
        send.data({ mesh_move: { id: 0, pos: center } });
        send.done();
    };

    function createGrid(stepsX, stepsY, size, step) {
        const gridPoints = stepsX * stepsY;
        const pos = new Float32Array(gridPoints * 3);
        const ind = [];
        const ox = size.x / 2;
        const oy = size.y / 2;

        const b = { mx: 0, my: 0, Mx: 0, My: 0};

        // initialize grid points
        for (let x=0, ai=0; x<stepsX; x++) {
            for (let y=0; y<stepsY; y++) {
                let px = pos[ai++] = x * step - ox + step / 2;
                let py = pos[ai++] = y * step - oy + step / 2;
                pos[ai++] = size.z;
                if (y > 0) ind.appendAll([
                    (stepsY * x) + (y - 1),
                    (stepsY * x) + (y    )
                ]);
                if (x > 0) ind.appendAll([
                    (stepsY * (x - 1)) + y,
                    (stepsY * (x    )) + y
                ]);
                b.mx = Math.min(b.mx, px);
                b.my = Math.min(b.my, py);
                b.Mx = Math.max(b.Mx, px);
                b.My = Math.max(b.My, py);
            }
        }

        return { pos, ind };
    }

    if (KIRI.worker)
    KIRI.worker.animate = function(data, send) {
        if (data.speed >= 0) {
            renderSpeed = data.speed;
        }
        if (data.steps > 0) {
            stepsRemain = data.steps;
        }
        if (data.toend) {
            skipMode = !skipMode;
        } else {
            skipMode = false;
        }
        checkStash(send);
        if (animating) {
            return send.done();
        }
        renderPath(send);
    };

    if (KIRI.worker)
    KIRI.worker.animate_cleanup = function(data, send) {
        if (animating) {
            animateClear = true;
        }
    };

    let animateClear = false;
    let animating = false;
    let renderSpeed = 25;
    let stepsRemain = 0;
    let skipMode = false;
    let skipMove = null;
    let skipStash = [];

    function checkStash(send) {
        if (!skipMode && skipStash.length) {
            // merge & compress stash stack
            skipStash.forEach(mesh_update => {
                send.data({ id: 0, mesh_update }, [ mesh_update.buffer ]);
            });
            skipStash = [];
            send.data({ mesh_move: skipMove });
        }
    }

    function renderPath(send) {
        if (animateClear) {
            animateClear = false;
            animating = false;
            send.done();
            return;
        }
        if (stepsRemain <= 0 || renderSpeed === 0) {
            skipMode = false;
            checkStash(send);
            animating = false;
            send.done();
            return;
        }
        const next = path[pathIndex++];
        if (!next) {
            skipMode = false;
            checkStash(send);
            animating = false;
            stepsRemain = 0;
            send.done();
            return;
        }
        animating = true;
        stepsRemain--;
        if (next.tool >= 0 && (!tool || tool.getNumber() !== next.tool)) {
            // on real tool change, go to safe Z first
            if (tool) {
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
        if (last) {
            const lp = last.point, np = next.point;
            // dwell ops have no point
            if (!np) {
                setTimeout(() => { renderPath(send) }, 0);
                return;
            }
            const dx = np.x - lp.x, dy = np.y - lp.y, dz = np.z - lp.z;
            // skip moves that are closer than resolution
            if (Math.sqrt(dx*dx  +dy*dy + dz*dz) < rez) {
                setTimeout(() => { renderPath(send) }, 0);
                return;
            }

            const md = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
            const st = Math.ceil(md / rez);
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
            send.data({ progress: pathIndex / path.length });
        } else {
            tool.pos = next.point;
            send.data({ mesh_move: { id, pos: next.point }});
            setTimeout(() => { renderPath(send) }, 0);
        }
        last = next;
    }

    function renderMoves(id, moves, send) {
        let index = 0;
        function update() {
            if (animateClear) {
                return renderPath(send);
            }
            if (renderSpeed > 0 && index < moves.length) {
                const pos = moves[index++];
                if (!pos) throw `no pos @ ${index} of ${moves.length}`;
                tool.pos = pos;
                updateMesh(pos, send);
                if (skipMode) {
                    skipMove = { id, pos };
                } else {
                    send.data({ mesh_move: { id, pos } });
                }
            }
            let pauseTime = skipMode ? 0 : renderSpeed;
            if (index < moves.length) {
                setTimeout(update, pauseTime);
            } else {
                setTimeout(() => { renderPath(send) }, pauseTime);
            }
        }
        update(0);
    }

    function updateMesh(pos, send) {
        const prof = tool.profile;
        const { size, pix } = tool.profileDim;
        const mid = Math.floor(pix / 2);
        const update = new Float32Array(Math.round(prof.length * 0.8));
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
                update[upos++] = iz;
                update[upos++] = tz;
                grid[iz] = tz;
            }
        }
        if (upos > 0) {
            const mesh_update = update.slice(0,upos);
            if (skipMode) {
                skipStash.push(mesh_update);
            } else {
                send.data({ id: 0, mesh_update }, [ mesh_update.buffer ]);
            }
        }
    }

    function updateTool(toolnum, send) {
        if (tool) {
            send.data({ mesh_del: toolID });
        }
        tool = new CAM.Tool({ tools }, undefined, toolnum);
        tool.generateProfile(rez);
        const flen = tool.fluteLength() || 15;
        const slen = tool.shaftLength() || 15;
        // const frad = tool.fluteDiameter() / 2;
        const prof = tool.profile;
        const { size, pix } = tool.profileDim;
        const { pos, ind } = createGrid(pix, pix, {x:size, y:size, z:flen+slen}, rez);
        const mid = Math.floor(pix/2);
        // deform mesh to fit tool profile
        for (let i=0, il=prof.length; i < il; ) {
            const dx = mid + prof[i++];
            const dy = mid + prof[i++];
            const dz = prof[i++];
            pos[(dx * pix + dy) * 3 + 2] = -dz;
        }
        send.data({ mesh_add: { id:++toolID, pos, ind }});
    }

    // load renderer code in worker context only
    if (KIRI.worker && false)
    fetch('/wasm/kiri-ani.wasm')
        .then(response => response.arrayBuffer())
        .then(bytes => WebAssembly.instantiate(bytes, {
            env: {
                reportf: (a,b) => { console.log('[f]',a,b) },
                reporti: (a,b) => { console.log('[i]',a,b) }
            }
        }))
        .then(results => {
            let {module, instance} = results;
            let {exports} = instance;
            let heap = new Uint8Array(exports.memory.buffer);
            let wasm = self.wasm = {
                heap,
                memory: exports.memory,
                updateMesh: exports.updateMesh
            };
            // heap[0] = 5;
            // heap[100] = 6;
            // heap[200] = 8;
            // let rv = self.wasm.updateMesh(0, 0, 100, 200);
        });

});
