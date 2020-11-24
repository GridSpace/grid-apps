/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

kiri.loader.push(function() {

    let KIRI = self.kiri,
        CAM = KIRI.driver.CAM,
        API, WORLD,
        meshes = {};

    if (KIRI.client)
    CAM.animate_clear = function(api) {
        WORLD = (API = api).const.SPACE.platform.world;
        $('layer-animate').innerHTML = '';
        Object.keys(meshes).forEach(id => deleteMesh(id));
    }

    if (KIRI.client)
    CAM.animate = function(api) {
        WORLD = (API = api).const.SPACE.platform.world;
        KIRI.client.animate_setup(API.conf.get(), data => {
            checkMeshCommands(data);
            const UC = API.uc;
            const layer = $('layer-animate');
            layer.innerHTML = '';
            UC.setGroup(layer);
            UC.newRow([
                UC.newButton(null,play,{icon:'<i class="fas fa-play-circle"></i>'}),
                UC.newButton(null,pause,{icon:'<i class="fas fa-pause-circle"></i>'})
            ]);
        });
    };

    function checkMeshCommands(data) {
        if (!data) {
            return;
        }
        if (data.mesh_add) {
            const { id, ind, pos } = data.mesh_add;
            addMesh(id, ind, pos);
        }
        if (data.mesh_del) {
            deleteMesh(data.mesh_del);
        }
        if (data.mesh_move) {
            const { id, pos } = data.mesh_move;
            const mesh = meshes[id];
            mesh.position.x = pos.x;
            mesh.position.y = pos.y;
            mesh.position.z = pos.z;
        }
    }

    function addMesh(id, ind, pos) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setIndex(new THREE.BufferAttribute(new Uint16Array(ind), 1));
        const mat = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: 0.75,
            color: 0
        });
        const mesh = new THREE.LineSegments(geo, mat);
        WORLD.add(mesh);
        meshes[id] = mesh;
    }

    function updateMesh(id) {

    }

    function deleteMesh(id) {
        WORLD.remove(meshes[id]);
        delete meshes[id];
    }

    function play() {
        KIRI.client.animate({speed: 1}, handleGridUpdate);
    }

    function pause() {
        KIRI.client.animate({speed: 0}, handleGridUpdate);
    }

    function handleGridUpdate(data) {
        checkMeshCommands(data);
    }

    if (KIRI.client)
    KIRI.client.animate_setup = function(settings, ondone) {
        send("animate_setup", {settings}, ondone);
    };

    if (KIRI.client)
    KIRI.client.animate = function(data, ondone) {
        send("animate", data, ondone);
    };

    let path, pathIndex, grid, tool, tools, rez;

    if (KIRI.worker)
    KIRI.worker.animate_setup = function(data, send) {
        const { settings } = data;

        rez = 0.5;
        tools = settings.tools;
        path = current.print.output.flat();
        pathIndex = 0;

        const stock = settings.stock;
        // const center = stock.center;
        const step = rez;
        const stepsX = Math.floor(stock.x / step) + 1;
        const stepsY = Math.floor(stock.y / step) + 1;
        const { pos, ind } = createGrid(stepsX, stepsY, stock, step);

        send.done({ mesh_add: { id: 0, pos, ind } });
    };

    function createGrid(stepsX, stepsY, size, step) {
        const gridPoints = stepsX * stepsY;
        const pos = grid = new Float32Array(gridPoints * 3);
        const ind = [];
        const ox = size.x / 2;
        const oy = size.y / 2;

        // initialize grid points
        for (let x=0, ai=0; x<stepsX; x++) {
            for (let y=0; y<stepsY; y++) {
                pos[ai++] = x * step - ox;
                pos[ai++] = y * step - oy;
                pos[ai++] = size.z;
                if (y > 0) ind.appendAll([
                    (stepsY * x) + (y - 1),
                    (stepsY * x) + (y    )
                ]);
                if (x > 0) ind.appendAll([
                    (stepsY * (x - 1)) + y,
                    (stepsY * (x    )) + y
                ]);
            }
        }

        return { pos, ind };
    }

    if (KIRI.worker)
    KIRI.worker.animate = function(data, send) {
        if (data.speed) {
            let next = path[pathIndex++];
            if (next.tool && (!tool || tool.getNumber() !== next.tool)) {
                updateTool(next.tool, send);
            }
            send.data({ mesh_move: { id: tool.getID(), pos: next.point }});
        }
        send.done();
    };

    function updateTool(toolnum, send) {
        if (tool) {
            send.data({ mesh_del: tool.getID() });
        }
        tool = new CAM.Tool({ tools }, undefined, toolnum);
        tool.generateProfile(rez);
        const flen = tool.fluteLength() || 30;
        // const frad = tool.fluteDiameter() / 2;
        const prof = tool.profile;
        const { size, pix } = tool.profileDim;
        const { pos, ind } = createGrid(pix, pix, {x:size, y:size, z:flen}, rez);
        const mid = Math.floor(pix/2);
        // deform mesh to fit tool profile
        for (let i=0, il=prof.length; i < il; ) {
            const dx = mid + prof[i++];
            const dy = mid + prof[i++];
            const dz = prof[i++];
            pos[(dx * pix + dy) * 3 + 2] = -dz;
        }
        send.data({ mesh_add: { id:tool.getID(), pos, ind }});
    }

});
