/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

// start worker pool (disabled for now with *0)
moto.client.start(`/code/mesh_pool?${gapp.version}`, moto.client.max() * 0);

// dep: ext.three
// dep: ext.three-bgu
gapp.finalize("mesh.work", [
    "moto.license", // dep: moto.license
    "moto.client",  // dep: moto.client
    "moto.worker",  // dep: moto.worker
    "mesh.tool",    // dep: mesh.tool
    "add.three",    // dep: add.three
]);

let { Matrix4, Vector3, BufferGeometry, BufferAttribute, computeFaceNormal } = THREE;

// compensation for space/world/platform rotation
let core_matrix = new Matrix4().makeRotationX(Math.PI / 2);

let { client, worker } = moto;
let cache = {};

function log(msg) {
    return worker.publish("mesh.log", msg);
}

function cacheUpdate(id, data) {
    Object.assign(cache[id], data);
}

// translate original mesh vertices into UI world view (PI/2 rotation on X)
function translate_encode(id, matrix) {
    let rec = cache[id];
    let mkey = matrix.map(v => v.round(6)).join('-');
    if (!rec || !rec.trans || rec.mkey !== mkey) {
        let geo = rec.geo.clone();
        let mat = core_matrix.clone().multiply(new Matrix4().fromArray(matrix));
        geo.applyMatrix4(mat);
        rec.mkey = mkey;
        rec.trans = geo.attributes.position.array
    }
    return rec.trans;
}

function analyze(id, opt = {}) {
    log(`${id} | indexing...`);
    let geo = cache[id].geo;
    let tool = new mesh.tool({
        vertices: geo.attributes.position.array,
        faces: geo.index ? geo.index.array : undefined,
        debug: false
    });
    log(`${id} | analyzing...`);
    tool.heal(opt);
    dbug.log(tool);
    return tool;
}

let model = {
    load(data) {
        let { vertices, indices, name, id } = data;
        let geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        if (indices) geo.setIndex(new BufferAttribute(indices, 1));
        cacheUpdate(id, { name, geo, xmatrix: core_matrix.clone(), trans: undefined });
    },

    // return new vertices in world coordinates
    duplicate(data) {
        let { id, matrix } = data;
        return translate_encode(id, matrix);
    },

    // merge several model vertices into a single array
    merge(recs) {
        let arrays = recs.map(rec => translate_encode(rec.id, rec.matrix));
        let length = arrays.map(a => a.length).reduce((v,a) => v + a);
        let data = new Float32Array(length);
        for (let i=0, l=arrays.length, p=0; i<l; ) {
            data.set(arrays[i], p);
            p += arrays[i++].length;
        }
        return data;
    },

    // used to generate a list for split snapping
    zlist(data) {
        let { id, matrix, round } = data;
        let zlist = {};
        let pos = translate_encode(id, matrix);
        for (let i=0, l=pos.length; i<l; ) {
            let v1 = new Vector3(pos[i++], pos[i++], pos[i++]);
            let z = v1.z.round(round || 2);
            zlist[z] = '';
        }
        return Object.keys(zlist);
    },

    // split a model along an axis at a given point
    // return two arrays of vertices for each resulting object
    split(data) {
        let { id, matrix, z } = data;
        let o1 = [];
        let o2 = [];
        let pos = translate_encode(id, matrix);
        let split = [];
        let on = [];
        let over = [];
        let under = [];
        function sort(v) {
            if (v.z < z) return under.push(v);
            if (v.z > z) return over.push(v);
            on.push(v);
        }
        function lerp(v1, v2) {
            let zd = Math.abs(v1.z - v2.z);
            let z1 = Math.abs(v1.z - z);
            return v1.clone().lerp(v2, z1/zd);
        }
        for (let i=0, l=pos.length; i<l; ) {
            let v1 = new Vector3(pos[i++], pos[i++], pos[i++]);
            let v2 = new Vector3(pos[i++], pos[i++], pos[i++]);
            let v3 = new Vector3(pos[i++], pos[i++], pos[i++]);
            sort(v1);
            sort(v2);
            sort(v3);
            let onl = on.length;
            let overl = over.length;
            let underl = under.length;
            let isover = (overl === 3 || underl === 0);
            let isunder = (underl === 3 || overl === 0);
            let split = !(isover || isunder);
            if (isover) {
                o2.appendAll([...v1, ...v2, ...v3]);
            }
            if (isunder) {
                o1.appendAll([...v1, ...v2, ...v3]);
            }
            if (split) {
                let g1, g2, oa, ua;
                if (overl === 2) {
                    g1 = o2;
                    g2 = o1;
                    oa = over;
                    ua = under;
                } else {
                    g1 = o1;
                    g2 = o2;
                    oa = under;
                    ua = over;
                }
                let [ p1, p2 ] = oa;
                let p3 = ua[0] || on[0]; // under or on
                let m1 = lerp(p1, p3);
                let m2 = lerp(p2, p3);
                if (v2 === ua[0]) {
                    // reverse when the mid point gap
                    g1.appendAll([ ...m1, ...p2, ...p1 ]);
                    g1.appendAll([ ...m1, ...m2, ...p2 ]);
                    g2.appendAll([ ...p3, ...m2, ...m1 ]);
                } else {
                    g1.appendAll([ ...p1, ...p2, ...m1 ]);
                    g1.appendAll([ ...p2, ...m2, ...m1 ]);
                    g2.appendAll([ ...m1, ...m2, ...p3 ]);
                }
            }
            on.length = over.length = under.length = 0;
        }
        let mi4 = core_matrix.clone().multiply(new Matrix4().fromArray(matrix)).invert();
        let b1 = new BufferAttribute(o1.toFloat32(), 3);
        let b2 = new BufferAttribute(o2.toFloat32(), 3);
        o1 = b1.applyMatrix4(mi4).array;
        o2 = b2.applyMatrix4(mi4).array;
        return { o1, o2 };
    },

    analyze(id) {
        let tool = analyze(id, { mapped: true });
        let { stats, mapped } = tool;
        let { cull, dups, faces } = stats;
        log(`${id} | face count=${faces} bad=${cull} dup=${dups}`);
        log(`${id} | open loops=${tool.loops.length} edges=${tool.edges.length}`);
        return { stats, mapped };
    },

    heal(data) {
        let { id, opt } = data;
        let tool = analyze(id, opt);
        log(`${id} | unrolling...`);
        return {
            vertices: tool.unrolled().toFloat32(),
        };
    },

    // given model and point, locate matching vertices, lines, and faces
    select(data) {
        let { id, x, y, z, a, b, c, matrix } = data;
        // translate point into mesh matrix space
        let v3 = new Vector3(x,y,z).applyMatrix4(
            core_matrix.clone().multiply(new Matrix4().fromArray(matrix)).invert()
        );
        x = v3.x; y = v3.y; z = v3.z;
        let arr = cache[id].geo.attributes.position.array;
        // distance tolerance for click to vertex (rough distance)
        let eps = 0.25;
        let faces = [];
        let verts = [];
        let edges = [];
        let point;
        for (let i=0, l=arr.length; i<l; ) {
            // matches here are within radius of a vertex
            // select all faces that share a matched vertex
            let vert = i/3;       // vertex index
            let face = (i/9) | 0; // face index
            let ax = arr[i++];
            let ay = arr[i++];
            let az = arr[i++];
            let dx = Math.abs(ax - x);
            let dy = Math.abs(ay - y);
            let dz = Math.abs(az - z);
            if (dx < eps && dy < eps && dz < eps) {
                faces.addOnce(face);
                verts.push(vert);
                // console.log(`match @ ${i-3} = ${face}`, ax, ay, az);
            }
        }
        // no matches and we look at the line segments from the provided face
        // to see if x,y,z point was on or near that line. then select the
        // two faces shared by that line
        if (faces.length === 0) {
            // todo or not todo
        }
        // if no lines match, select the provided face (from min vertex index)
        if (faces.length === 0) {
            faces.push(Math.min(a,b,c) / 3);
        }
        return { faces, edges, verts, point };
    }
};

let group = {
    add(data) {
        let { id, model } = data;
    },

    remove(data) {
        let { id, model } = data;
    }
};

let object = {
    create(data) {
        let { id, type } = data;
        cache[id] = { id, type };
    },

    destroy(data) {
        delete cache[data.id];
    }
};

let file = {
    export(data, send) {
        let header = `# Generated By Mesh:Tool @ https://grid.space/mesh (units = millimeters)`;
        let { format, recs } = data;
        let vtot = 0;
        for (let rec of recs) {
            let { id, matrix, file } = rec;
            let vs = rec.varr = Array.from(translate_encode(id, matrix)).map(v => v.round(5));
            vtot += (vs.length / 3);
        }
        switch (format) {
            case "obj":
                let p = 1;
                let obj = [header];
                for (let rec of recs) {
                    let { id, matrix, file, varr } = rec;
                    obj.push(`g ${file}`);
                    for (let i=0; i<varr.length; p += 3) {
                        obj.push(`v ${varr[i++]} ${varr[i++]} ${varr[i++]}`);
                        obj.push(`v ${varr[i++]} ${varr[i++]} ${varr[i++]}`);
                        obj.push(`v ${varr[i++]} ${varr[i++]} ${varr[i++]}`);
                        obj.push(`f ${p} ${p+1} ${p+2}`);
                    }
                }
                return obj.join('\n');
            case "stl":
                let stl = new Uint8Array(80 + 4 + vtot/3 * 50);
                let dat = new DataView(stl.buffer);
                let pos = 84;
                header.split('').forEach((c,i) => {
                    dat.setUint8(i, c.charCodeAt(0));
                });
                // todo put Kiri:Moto info in header
                dat.setInt32(80, vtot/3, true);
                for (let rec of recs) {
                    let { id, matrix, file, varr } = rec;
                    for (let i=0, l=varr.length; i<l;) {
                        let p0 = new Vector3(varr[i++], varr[i++], varr[i++]);
                        let p1 = new Vector3(varr[i++], varr[i++], varr[i++]);
                        let p2 = new Vector3(varr[i++], varr[i++], varr[i++]);
                        let norm = computeFaceNormal(p0, p1, p2);
                        dat.setFloat32(pos +  0, norm.x, true);
                        dat.setFloat32(pos +  4, norm.y, true);
                        dat.setFloat32(pos +  8, norm.z, true);
                        dat.setFloat32(pos + 12, p0.x, true);
                        dat.setFloat32(pos + 16, p0.y, true);
                        dat.setFloat32(pos + 20, p0.z, true);
                        dat.setFloat32(pos + 24, p1.x, true);
                        dat.setFloat32(pos + 28, p1.y, true);
                        dat.setFloat32(pos + 32, p1.z, true);
                        dat.setFloat32(pos + 36, p2.x, true);
                        dat.setFloat32(pos + 40, p2.y, true);
                        dat.setFloat32(pos + 44, p2.z, true);
                        pos += 50;
                    }
                }
                return stl;
            default:
                throw `invalid format "${format}"`;
        }
    }
};

function debug() {
    console.log({work_cache: cache});
}

worker.bindObject({
    debug,
    model,
    group,
    object,
    file
});

worker.ready();

})();
