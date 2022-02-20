/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
gapp.register("geo.mesh", [], (root, exports) => {

const { base } = root;
const TEST = 0;

class Mesh {
    constructor(params = {}) {
        this.precision = Math.pow(10, params.precision || 6);
        if (params.vertices) {
            this.setData(params.vertices, params.faces);
        }
    }

    /**
     * set vertices and faces of the mesh. if only vertices are provided
     * then the data is assumed to be un-indexed and will be indexed into
     * faces. if faces are provided, they are assumed to be index references
     * into the vertex data. removes invalid faces.
     *
     * the end result is face data mapped to an indexed set of unique vertices.
     *
     * @param {number[]} vertices
     * @param {number[]} faces
     */
    setData(vertices, faces) {
        if (!vertices) {
            throw "missing vertices";
        }
        if (vertices.length % 3 !== 0) {
            throw "invalid vertices";
        }
        // when face/index data is missing, vertices need to be normalized
        if (!faces) {
            if (TEST) console.time('generate faces');
            faces = [];
            let fcac = {}; // seen face hash
            let fnew = []; // accumulate vertex triplets
            let nuvt = []; // new vertex list
            let hash = {}; // find vertex matches
            let prec = this.precision;
            let dups = 0;
            // let cull = 0;
            for (let i=0, l=vertices.length; i<l; i += 3) {
                let x = vertices[i];
                let y = vertices[i+1];
                let z = vertices[i+2];
                let key = [
                    (x * prec) | 0,
                    (y * prec) | 0,
                    (z * prec) | 0
                ].join('');
                let vpos = hash[key];
                if (vpos === undefined) {
                    hash[key] = vpos = nuvt.length;
                    nuvt.push(x);
                    nuvt.push(y);
                    nuvt.push(z);
                }
                fnew.push(vpos);
                if (fnew.length === 3) {
                    // cull invalid faces (shares 2 or more points)
                    // if (fnew[0] === fnew[1] || fnew[0] === fnew[2] || fnew[1] === fnew[2]) {
                    //     fnew = [];
                    //     cull++;
                    //     continue;
                    // }
                    let key = fnew.slice().sort().join('-');
                    // drop duplicate faces (sort handles reverse order)
                    if (!fcac[key]) {
                        faces.appendAll(fnew);
                    } else {
                        dups++;
                    }
                    fcac[key] = key;
                    fnew = [];
                }
            }
            vertices = nuvt;
            if (TEST) console.timeEnd('generate faces');
            if (TEST) console.log({dups, faces:faces.length/3});
        }
        this.vertices = vertices;
        this.faces = faces;
        return this;
    }

    // return non-indexed vertex list (for compatibility)
    unrolled() {
        let out = [];
        let vertices = this.vertices;
        for (let face of this.faces) {
            out.push(vertices[face]);
            out.push(vertices[face+1]);
            out.push(vertices[face+2]);
        }
        return out;
    }

    /**
     * finds edge lines which are line segments on a single face.
     * construct ordered line maps with array of connected edges.
     * connect lines into polys. earcut polys into new faces.
     */
    heal() {
        if (TEST) console.time('heal');

        let vertices = this.vertices;
        let faces = this.faces;
        let hash = {}; // key to line map
        let vmap = {}; // vertext to line map
        let lines = [];

        class Line {
            constructor(v1, v2) {
                this.v1 = v1;
                this.v2 = v2;
                this.faces = [];
            }

            addFace(face) {
                if (this.faces.indexOf(face) < 0) {
                    this.faces.push(face);
                } else if (TEST) {
                    console.log('adding face to line twice', this, face);
                }
                return this;
            }

            adjacentUnused() {
                return vmap[this.v1]
                    .concat(vmap[this.v2])
                    .filter(l => l !== this && !l.used && l.faces.length === 1);
            }

            adjacentUsed() {
                return vmap[this.v1]
                    .concat(vmap[this.v2])
                    .filter(l => l !== this && l.used && l.faces.length === 1);
            }

            touches(line) {
                return this.v1 === line.v1 ||
                    this.v1 === line.v2 ||
                    this.v2 === line.v1 ||
                    this.v2 === line.v2;
            }

            unitVector() {
                if (this.unit !== undefined) {
                    return this.unit;
                }
                let v1 = this.v1;
                let v2 = this.v2;
                let d = [
                    vertices[v1] - vertices[v2],
                    vertices[v1 + 1] - vertices[v2 + 1],
                    vertices[v1 + 2] - vertices[v2 + 2],
                ];
                let max = Math.max(...d.map(v => Math.abs(v)));
                // console.log({d, max});
                return this.unit = d.map(v => v / max);
            }
        }

        function diffUnitVector(uv1, uv2) {
            let diff = 0;
            for (let i=0; i<3; i++) {
                diff += Math.abs(uv1[i] - uv2[i]);
            }
            return diff;
        }

        function getLine(v1, v2) {
            let s1 = vertices[v1] + vertices[v1+1]*1000 + vertices[v1+2]*100000;
            let s2 = vertices[v2] + vertices[v2+1]*1000 + vertices[v2+2]*100000;
            let key = s1 <= s2 ? [v1,v2].join('-') : [v2,v1].join('-');
            let line = hash[key];
            if (!line) {
                // point order will be swapped for reconstructed faces
                // to preserve chirality (assuming face normals are correct)
                line = hash[key] = new Line(v1, v2);
                line.key = key;
                lines.push(line);
                let lm1 = vmap[v1] = vmap[v1] || [];
                let lm2 = vmap[v2] = vmap[v2] || [];
                lm1.push(line);
                lm2.push(line);
            }
            return line;
        }

        function getXYZ(v) {
            return {x: vertices[v], y: vertices[v+1], z: vertices[v+2]};
        }

        for (let i=0, l=this.faces.length; i<l; i += 3) {
            let v1 = faces[i];
            let v2 = faces[i+1];
            let v3 = faces[i+2];
            let l1 = getLine(v1, v2).addFace(i);
            let l2 = getLine(v2, v3).addFace(i);
            let l3 = getLine(v3, v1).addFace(i);
        }

        this.lines = lines;

        // lines belonging to only one face are on the edge of a hole
        let edges = this.edges = lines.filter(l => l.faces.length === 1);
        let loops = this.loops = [];

        // connect edge lines into closed loops
        for (let i=0, l=edges.length; i<l; i++) {
            let line = edges[i];
            if (line.used) {
                continue;
            }
            // cannot start on split
            if (line.adjacentUnused().length > 2) {
                // console.log('cannot start on a split');
                continue;
            }
            // line.used = true;
            let loop = [ ];
            // build line through adjacent lines
            while (true) {
                let adjacent = line.adjacentUnused();
                if (adjacent.length === 0) {
                    let first = loop[0];
                    let last = loop.last();
                    loop.open = loop.length < 3
                        || (first.v1 !== last.v1
                        && first.v2 !== last.v2
                        && first.v1 !== last.v2
                        && first.v2 !== last.v1);
                    // console.log({term: line, adj: line.adjacentUsed(), open, loop});
                    break;
                } else if (adjacent.length === 1) {
                    if (line.v2 !== adjacent[0].v1) {
                        let tmp = adjacent[0].v1;
                        adjacent[0].v1 = adjacent[0].v2;
                        adjacent[0].v2 = tmp;
                        if (TEST > 1) console.log('chirality mismatch fixed');
                    }
                    line = adjacent[0];
                } else if (adjacent.length === 2) {
                    // follow edges according to chirality
                    line = adjacent[0].v1 === line.v2 ?
                        adjacent[0] :
                        adjacent[1]
                } else {
                    if (TEST > 1) console.log('error adjacent', line, adjacent, loops.length, loop.length);
                    line.split = adjacent;
                    line = adjacent[0];
                }
                loop.push(line);
                line.used = true;
            }
            if (loop.length) {
                loops.push(loop);
            }
        }

        // attempt to connect open loops
        if (loops.length > 1) {
            outer: for (let i=0; i<loops.length-1; i++) {
                let l1 = loops[i];
                if (!(l1 && l1.open)) {
                    continue;
                }
                for (let j=i+1; j<loops.length; j++) {
                    let l2 = loops[j];
                    if (!(l2 && l2.open)) {
                        continue;
                    }
                    let nuloop;
                    if (l1[0].touches(l2[0])) {
                        nuloop = [...l2.reverse(), ...l1];
                    } else if (l1[0].touches(l2.last())) {
                        nuloop = [...l2, ...l1];
                    } else if (l1.last().touches(l2[0])) {
                        nuloop = [...l1, ...l2];
                    } else if (l1.last().touches(l2.last())) {
                        nuloop = [...l1, ...l2.reverse()];
                    }
                    if (nuloop) {
                        nuloop.open = true;
                        loops.push(nuloop);
                        loops[i] = loops[j] = undefined;
                        continue outer;
                    }
                }

            }
        }

        // store invalid loops for display / culling
        this.shorts = loops.filter(l => l && l.length <= 2);
        if (TEST) console.log({edges, loops, shorts: this.shorts});

        // filter out null and short loops
        this.loops = loops = loops.filter(l => l && l.length > 2);
        if (TEST > 1) console.log({loops_filtered: loops});

        // rotate/flatten to Z plane and use earcut to generate faces
        // because earcut emits point indexes, no need to un-rotate
        function emitLoop(loop) {
            let lastPoint;
            let pindex = [];
            let points = [];
            let dx = 0, dy = 0, dz = 0;

            // gather points, find axis with least deviaton to swap with Z
            let loop1 = loop.slice();
            loop1.push(loop[0]);
            for (let i=0; i<loop1.length; i++) {
                let line = loop1[i];
                let nextPoint;
                if (line.v1 === lastPoint) {
                    nextPoint = line.v2;
                } else {
                    nextPoint = line.v1;
                }
                if (i < loop1.length - 1) {
                    pindex.push(nextPoint);
                    points.push([
                        vertices[nextPoint],
                        vertices[nextPoint+1],
                        vertices[nextPoint+2]
                    ]);
                }
                if (lastPoint >= 0) {
                    dx = Math.max(dx, Math.abs(vertices[lastPoint] - vertices[nextPoint]));
                    dy = Math.max(dy, Math.abs(vertices[lastPoint+1] - vertices[nextPoint+1]));
                    dz = Math.max(dz, Math.abs(vertices[lastPoint+2] - vertices[nextPoint+2]));
                }
                lastPoint = nextPoint;
            }

            // swap Z axis with least delta axis
            let swap = 2;
            if (dy < dx && dy < dz) {
                // swap y,z
                swap = 1;
            } else if (dx < dy && dx < dz) {
                // swap x,z
                swap = 0;
            }
            if (swap < 2) {
                // console.log({swap_axis: swap});
                for (let point of points) {
                    let tmpz = point[2];
                    point[2] = point[swap];
                    point[swap] = tmpz;
                }
            }

            let fpoints = points.flat();
            let ec = earcut(fpoints, undefined, 3);
            if (TEST > 2) console.log({points, fpoints, ec, dx, dy, dz});

            for (let point of ec) {
                faces.push(pindex[point]);
            }
        }

        // emit loops
        let faceCount = this.faces.length;
        for (let loop of loops) {
            emitLoop(loop);
        }

        this.newFaces = this.faces.length - faceCount;
        if (TEST) console.log({newFaces: this.newFaces});

        if (TEST) console.timeEnd('heal');
        return this;
    }
};

gapp.overlay(base, { Mesh });

});
