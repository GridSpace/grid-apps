/** Copyright Stewart Allen -- All Rights Reserved */

"use strict";

const testing = false;

// dep: ext.manifold
gapp.register("add.manifold", [], (root, exports) => {
    Module.onRuntimeInitialized = () => {
        Module.setup();

        if (testing) {
            // let c = Module.cube([1,1,1], true);
            let c = Module.sphere(10, 100);
            let l = 1000;
            let cm = c.getMesh();
            let md = c.getMeshDirect();
            console.log({ c, cm, md });

            console.time('getMesh');
            for (let i=0; i<l; i++) c.getMesh();
            console.timeEnd('getMesh');

            console.time(`getMeshDirect`);
            for (let i=0; i<l; i++) c.getMeshDirect({ mode: 0 });
            console.timeEnd(`getMeshDirect`);

            console.time(`getMeshDirect`);
            for (let i=0; i<l; i++) c.getMeshDirect({ mode: 1 });
            console.timeEnd(`getMeshDirect`);

            console.time(`getMeshDirect`);
            for (let i=0; i<l; i++) c.getMeshDirect({ mode: 2 });
            console.timeEnd(`getMeshDirect`);
        }
    };

    function indexVertices(pos) {
        mesh.log(`indexing ${pos.length/3} vertices`);
        let ipos = 0;
        const index = [];
        const vertices = [];
        const cache = {};
        const temp = { x: 0, y: 0, z: 0 };
        for (let i=0, length = pos.length; i<length; ) {
            temp.x = pos[i++];
            temp.y = pos[i++];
            temp.z = pos[i++];
            let key = [
                ((temp.x * 100000) | 0),
                ((temp.y * 100000) | 0),
                ((temp.z * 100000) | 0)
            ].join('');
            let ip = cache[key];
            if (ip >= 0) {
                index.push(ip);
            } else {
                index.push(ipos);
                cache[key] = (ipos++);
                vertices.push(temp.x, temp.y, temp.z);
            }
        }
        return { index, vertices };
    }

    function pos2mesh(pos) {
        const { index, vertices } = indexVertices(pos);
        const mesh = {
            vertPos: new Module.Vector_vec3(),
            triVerts: new Module.Vector_ivec3(),
            vertNormal: new Module.Vector_vec3(),
            halfedgeTangent: new Module.Vector_vec4()
        };
        for (let i = 0, l = vertices.length; i < l; ) {
            mesh.vertPos.push_back({
                x: vertices[i++],
                y: vertices[i++],
                z: vertices[i++]
            });
        }
        for (let i = 0, l = index.length; i < l; ) {
            mesh.triVerts.push_back([ index[i++], index[i++], index[i++] ]);
        }
        return mesh;
    }

    function mesh2pos(mesh) {
        const { vertPos, triVerts } = mesh;
        const vertices = new Float32Array(triVerts.length * 9);
        for (let i = 0, t = 0, l = triVerts.length; t < l; t++) {
            let tri = triVerts[t];
            let vert = vertPos[tri[0]]; // X
            vertices[i++] = vert[0];
            vertices[i++] = vert[1];
            vertices[i++] = vert[2];
            vert = vertPos[tri[1]]; // Y
            vertices[i++] = vert[0];
            vertices[i++] = vert[1];
            vertices[i++] = vert[2];
            vert = vertPos[tri[2]]; // Z
            vertices[i++] = vert[0];
            vertices[i++] = vert[1];
            vertices[i++] = vert[2];
        }
        return vertices;
    }

    exports({
        indexVertices,
        pos2mesh,
        mesh2pos
    });

});
