/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.license
// dep: ext.clip2
// dep: add.three
// dep: add.array
// dep: moto.client
// dep: moto.worker
// dep: mesh.util
// dep: geo.base
// dep: geo.line
// dep: geo.point
// dep: geo.polygon
// dep: geo.polygons
// dep: geo.bounds
// dep: geo.slicer
// dep: geo.csg
// dep: mesh.tool
gapp.main("mesh.work", [], (root) => {

const { Triangle, Vector3, BufferGeometry, BufferAttribute, computeFaceNormal } = THREE;
const { base, mesh, moto } = root;
const { client, worker } = moto;
const { CSG, newPoint, newPolygon, sliceConnect, polygons } = base;
const cache = {};

// add scoped access to cache
mesh.work = { cache };

// start worker pool (disabled for now with *0)
client.start(`/code/mesh_pool?${gapp.version}`, client.max() * 0);

function log(msg) {
    return worker.publish("mesh.log", msg);
}

mesh.log = log;

function cacheUpdate(id, data) {
    return Object.assign(cache[id], data);
}

// translate original mesh vertices into UI world view (PI/2 rotation on X)
function translate_encode(id) {
    let rec = cache[id];
    let { pos } = rec;
    let mkey = pos.map(v => v.round(6)).join('-');
    // re-translate on missing cache or changed position
    if (!rec || !rec.trans || rec.mkey !== mkey) {
        let geo = rec.geo.clone().translate(new Vector3().fromArray(pos));
        rec.mkey = mkey;
        rec.trans = geo.attributes.position.array
    }
    return rec.trans;
}

function analyze(id, opt = {}) {
    let rec = cache[id];
    let { geo, tool } = rec;
    if (!tool) {
        tool = rec.tool = new mesh.tool(opt);
    }
    if (tool.faces) {
        log(`${id} | analysis cached`);
    } else {
        log(`${id} | analyzing...`);
        tool.generateFaces(geo.attributes.position.array, opt);
        log(`${id} | patching...`);
        tool.patch(opt);
    }
    return tool;
}

function isolateBodies(id) {
    let tool = indexFaces(id);
    log(`${id} | isolating bodies`);
    return tool.isolateBodies();
}

function indexFaces(id) {
    let rec = cache[id];
    let { geo, tool } = rec;
    if (!tool) {
        tool = rec.tool = new mesh.tool();
    }
    if (!tool.indexed) {
        log(`${id} | indexing mesh`);
        tool.index(geo.attributes.position.array);
    }
    return tool;
}

// return an array of edges on the open spaces left by the split
// to be joined into polys, earcut, and turned into patching faces
function splitFindEdges(z, o1, o1p) {
    let edges = [];
    // find unshared edges on Z plane
    o1p.forEach((face, i) => {
        face = face.filter(v => v.z === z);
        if (face.length >= 2) {
            edges.push({ p1: face[0], p2: face[1], i });
        }
        if (face.length > 2) {
            edges.push({ p1: face[1], p2: face[2], i });
            edges.push({ p1: face[2], p2: face[0], i });
        }
    });
    o1.forEach((face, i) => {
        face = face.filter(v => v.z === z);
        if (face.length >= 2) {
            edges.push({ p1: face[0], p2: face[1] });
        }
        if (face.length > 2) {
            edges.push({ p1: face[1], p2: face[2] });
            edges.push({ p1: face[2], p2: face[0] });
        }
    });
    // eliminate edges that show up twice since it means they're shared
    outer: for (let i = 0, l = edges.length; i < l; i++) {
        for (let j = i + 1; j < l; j++) {
            let e1 = edges[i];
            let e2 = edges[j];
            if (!(e1 && e2)) {
                continue;
            }
            let m1 = (e1.p1 === e2.p1 && e1.p2 === e2.p2);
            let m2 = (e1.p2 === e2.p1 && e1.p1 === e2.p2);
            if (m1 || m2) {
                edges[i] = edges[j] = undefined;
                continue outer;
            }
        }
    }
    return edges.filter(e => e);
}

function splitHeal(z, o1, edges, rev) {
    // filter and convert Vector3 to Point for sliceConnect()
    edges = edges.filter(e => e).map(e => {
        return {
            p1: newPoint().move(e.p1),
            p2: newPoint().move(e.p2),
        }
    });
    if (edges.length) {
        // heal unshared edges created along Z split
        // normals (from point array) are reversed for the bottom split
        let heal = polygons.nest(sliceConnect(edges, z, { dirty: true }));
        let ear = heal.map(poly => poly.earcut()).flat();
        let o1p = ear.map(poly => {
            return (rev ? poly.points.reverse() : poly.points).map(p => [ p.x, p.y, p.z ])
        });
        o1.appendAll(o1p.flat().flat());
        // console.log({ edges, heal, ear, o1 });
    }

    return edges;
}

let model = {
    load(data) {
        let { vertices, name, id } = data;
        let geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(vertices, 3));
        cacheUpdate(id, { name, geo, mkey: undefined, tool: undefined });
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

    union(ids) {
        let arrays = ids.map(id => translate_encode(id));
        let solids = arrays.map(a => CSG.fromPositionArray(a));
        let union = CSG.union(...solids);
        return CSG.toPositionArray(union);
    },

    difference(ids) {
        let arrays = ids.map(id => translate_encode(id));
        let solids = arrays.map(a => CSG.fromPositionArray(a));
        let diff = CSG.difference(...solids);
        return CSG.toPositionArray(diff);
    },

    intersect(ids) {
        let arrays = ids.map(id => translate_encode(id));
        let solids = arrays.map(a => CSG.fromPositionArray(a));
        let union = CSG.intersect(...solids);
        return CSG.toPositionArray(union);
    },

    subtract(recs) {
        let bases = recs.filter(rec => !rec.tool)
            .map(rec => translate_encode(rec.id))
            .map(a => CSG.fromPositionArray(a));
        let tools = recs.filter(rec => rec.tool)
            .map(rec => translate_encode(rec.id))
            .map(a => CSG.fromPositionArray(a));
        let subs = [];
        for (let obj of bases) {
            let sub = CSG.subtract(obj, ...tools);
            subs.appendAll(CSG.toPositionArray(sub));
        }
        return subs.toFloat32();
    },

    // split a model along an axis at a given point
    // return two arrays of vertices for each resulting object
    split(data) {
        let { id, z } = data;
        let scale = 100000;
        z = Math.round(z * scale) | 0;
        let pos = data.pos || translate_encode(id);
        let o1 = []; // new bottom
        let o2 = []; // new top
        let o1p = []; // o1 new split faces
        let o2p = []; // o2 new split faces
        let on = [];
        let over = [];
        let under = [];
        let cache = {}; // vertex dedup cache
        function sort(v) {
            if (v.z < z) return under.push(v);
            if (v.z > z) return over.push(v);
            on.push(v);
        }
        function lerp(v1, v2) {
            let zd = Math.abs(v1.z - v2.z);
            let z1 = Math.abs(v1.z - z);
            let v3 = v1.clone().lerp(v2, z1/zd);
            return newV(v3.x/scale, v3.y/scale, v3.z/scale);
        }
        function newV() {
            let args = [...arguments].map(v => Math.round(v * scale) | 0);
            let key = args.join(':');
            let cached = cache[key];
            if (!cached) {
                let [ x, y, z ] = args;
                cache[key] = cached = new Vector3(x,y,z);
            } else {
                // console.log('cache hit', cached, key);
            }
            return cached;
        }
        // todo put proposed faces into top or bottom arrays
        // check proposed faces that have one point shared on only two edges
        // and if they're coplanar, merge them. these points cause non-manifold
        for (let i=0, l=pos.length; i<l; ) {
            on.length = over.length = under.length = 0;
            let v1 = newV(pos[i++], pos[i++], pos[i++]);
            let v2 = newV(pos[i++], pos[i++], pos[i++]);
            let v3 = newV(pos[i++], pos[i++], pos[i++]);
            sort(v1);
            sort(v2);
            sort(v3);
            let onl = on.length;
            let overl = over.length;
            let underl = under.length;
            let isover = (onl + overl === 3);
            let isunder = (onl + underl === 3);
            if (onl === 3) {
                // co-planar
                let tri = new Triangle(...on);
                let norm = tri.getNormal(new Vector3());
                if (norm.z > 0) {
                    isover = false;
                    isunder = true;
                } else {
                    isover = true;
                    isunder = false;
                 }
            }
            if (isover) {
                // all points on or over
                o2.push([ v1, v2, v3 ]);
            } else if (isunder) {
                // all points on or under
                o1.push([ v1, v2, v3 ]);
            } else {
                let g1, g2, oa, ua;
                if (overl === 2) {
                    // two over, one under
                    g1 = o2p;
                    g2 = o1p;
                    oa = over;
                    ua = under;
                } else if (underl === 2) {
                    // two under, one over
                    g1 = o1p;
                    g2 = o2p;
                    oa = under;
                    ua = over;
                } else if (onl === 1) {
                    // one on, one over, one under
                    let p1 = over[0];
                    let p2 = on[0];
                    let p3 = under[0];
                    let p4 = lerp(p1, p3);
                    let cw = (v1 === p1 && v2 === p2)
                        || (v1 === p2 && v2 === p3)
                        || (v1 === p3 && v2 === p1);
                    // clockwise vs counter-clockwise
                    if (cw) {
                        o1p.push([ p2, p3, p4 ]);
                        o2p.push([ p1, p2, p4 ]);
                    } else {
                        o1p.push([ p3, p2, p4 ]);
                        o2p.push([ p2, p1, p4 ]);
                    }
                    continue;
                }
                let [ p1, p2 ] = oa;
                let p3 = ua[0] || on[0]; // lone point
                let m1 = lerp(p1, p3);
                let m2 = lerp(p2, p3);
                if (v2 === ua[0]) {
                    // reverse when the mid point gap
                    g1.push([ m1, p2, p1 ]);
                    g1.push([ m1, m2, p2 ]);
                    g2.push([ p3, m2, m1 ]);
                } else {
                    g1.push([ p1, p2, m1 ]);
                    g1.push([ p2, m2, m1 ]);
                    g2.push([ m1, m2, p3 ]);
                }
            }
        }
        let e1 = splitFindEdges(z, o1, o1p);
        let e2 = splitFindEdges(z, o2, o2p);
        // merge o1p and o2p into o1 and o2
        o1.appendAll(o1p.filter(e => e));
        o2.appendAll(o2p.filter(e => e));
        // flatten output points to arrays
        o1 = o1.flat().map(e => [ ...e ]).flat();
        o2 = o2.flat().map(e => [ ...e ]).flat();
        // // filter and convert Vector3 to Point for sliceConnect()
        splitHeal(z, o1, e1);
        splitHeal(z, o2, e2, true);
        return {
            o1: o1.map(v => v/scale).toFloat32(),
            o2: o2.map(v => v/scale).toFloat32()
        };
    },

    analyze(data) {
        let { id, opt } = data;
        let tool = analyze(id, { mapped: true, ...opt });
        let { stats, mapped } = tool;
        let { cull, dups, faces } = stats;
        log(`${id} | face count=${faces} cull=${cull} dup=${dups}`);
        log(`${id} | open loops=${tool.loops.length} edges=${tool.edges.length}`);
        return { stats, mapped };
    },

    heal(data) {
        let { id, opt } = data;
        let tool = analyze(id, opt);
        log(`${id} | unrolling...`);
        let zlist = tool.listZ();
        let unrolled = tool.unrolled();
        return { vertices: unrolled.toFloat32(), zlist };
    },

    flatten(data) {
        let { id, faces } = data;
        let tool = analyze(id, { });
        log(`${id} | flatten...`);
        let { unique, average } = tool.flattenZ(faces);
        log(`${id} | average=${average.round(3)} uniques=${unique.length}`);
        let unrolled = tool.unrolled();
        return { vertices: unrolled.toFloat32() };
    },

    indexFaces(data) {
        let { id, opt } = data;
        let tool = indexFaces(id);
        return { mapped: true };
    },

    isolate(data) {
        let { id } = data;
        return isolateBodies(id);
    },

    // given model and point, locate matching vertices, lines, and faces
    select(data) {
        let { id, x, y, z, a, b, c, surface } = data;
        let { radians, radius, filterZ } = surface;
        const rec = cache[id];
        const arr = rec.geo.attributes.position.array;
        // distance tolerance for click to vertex (rough distance)
        const eps = radius || 0.2;
        const faces = [];
        const verts = [];
        const edges = [];
        let point;
        if (!radians)
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
        // if the geometry has indexed faces and radians are set, find surface
        const tool = rec.tool;
        if (tool && tool.indexed && radians) {
            const match = tool.findConnectedSurface(faces, radians, filterZ);
            return { faces: match, edges, verts, point };
        }
        return { faces, edges, verts, point };
    },

    gen_gear(data, send) {
        const { teeth, module, angle, twist, shaft, offset, height, chamfer } = data;
        const { gear, pitch } = new mesh.tool().generateGear(teeth, module, angle, offset);
        const points = gear.map(v => [...v, 0]).flat();
        const poly = newPolygon().addVerts(points);
        if (shaft) {
            const nump = Math.min(30 + shaft, 150);
            const srad = shaft / 2;
            poly.addInner( newPolygon().centerCircle({ x:0, y:0, z:0 }, srad, nump) );
        }
        const zh = height || 15;
        const verts = poly.extrude(zh, { chamfer });
        if (twist) {
            const rad = base.util.toRadians(twist);
            for (let i=0; i<verts.length; i += 3) {
                let [x, y] = base.util.rotate(
                    verts[i],
                    verts[i+1],
                    rad * (verts[i+2] / zh)
                );
                verts[i] = x;
                verts[i+1] = y;
            }
        }
        send.done(verts);
    },

    gen_threads(data, send) {
        let { height, radius, turns, depth, steps, taper } = data;
        let zstep = height / turns;
        height += zstep * 2;
        turns += 2;
        let verts = new mesh.tool().generateThreads(
            height,
            radius,
            turns,
            depth,
            steps,
            taper
        );
        // return send.done(verts);
        let s0 = model.split({
            z: zstep,
            pos: verts
        })
        let s1 = model.split({
            z: height - zstep,
            pos: s0.o2
        });
        send.done(s1.o1);
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
    meta(data) {
        let { id, meta } = data;
        cacheUpdate(id, meta);
    },

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
            let { id } = rec;
            let vs = rec.varr = Array.from(translate_encode(id)).map(v => v.round(5));
            vtot += (vs.length / 3);
        }
        switch (format) {
            case "obj":
                let p = 1;
                let obj = [header];
                for (let rec of recs) {
                    let { file, varr } = rec;
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
                // todo put Mesh:Tool info in header
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

});
