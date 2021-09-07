/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    const BASE = self.base = self.base || {};

    if (BASE.Mesh) {
        return;
    }

    BASE.Mesh = class Mesh {
        constructor(params = {}) {
            this.precision = params.precision || 6;
            if (params.vertices) {
                this.setData(params.vertices, params.faces);
            }
        }

        /**
         * set vertices and faces of the mesh. if only vertices are provided
         * then the data is assumed to be un-indexed and will be indexed into
         * faces. if faces are provided, they are assumed to be index references
         * into the vertex data.
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
                faces = [];
                let nuvt = []; // new vertex list
                let hash = {}; // find vertex matches
                let prec = this.precision;
                for (let i=0, l=vertices.length; i<l; i += 3) {
                    let x = vertices[i];
                    let y = vertices[i+1];
                    let z = vertices[i+2];
                    let key = [
                        x.toFixed(prec),
                        y.toFixed(prec),
                        z.toFixed(prec)
                    ].join(',');
                    let vpos = hash[key];
                    if (vpos === undefined) {
                        hash[key] = vpos = nuvt.length;
                        nuvt.push(x);
                        nuvt.push(y);
                        nuvt.push(z);
                    }
                    faces.push(vpos);
                }
                vertices = nuvt;
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

        heal() {
            // construct ordered line map with array of connected lines
            // for each point pair, create ordered line
            // for each face triple, add lines to connect line array
            let vertices = this.vertices;
            let faces = this.faces;
            let hash = {}; // key to line map
            let vmap = {}; // vertext to line map
            let lines = [];

            class Line {
                constructor(v1, v2) {
                    this.v1 = v1;
                    this.v2 = v2;
                    this.peers = [];
                    this.faces = [];
                }

                addPeers(lines, face) {
                    this.peers.appendAll(lines);
                    if (this.faces.indexOf(face) < 0) {
                        this.faces.push(face);
                    }
                    return this;
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
                    lines.push(line);
                    let lm1 = vmap[v1] = vmap[v1] || [];
                    let lm2 = vmap[v2] = vmap[v2] || [];
                    lm1.push(line);
                    lm2.push(line);
                }
                return line;
            }

            for (let i=0, l=this.faces.length; i<l; i += 3) {
                let v1 = faces[i];
                let v2 = faces[i+1];
                let v3 = faces[i+2];
                let l1 = getLine(v1, v2);
                let l2 = getLine(v2, v3);
                let l3 = getLine(v3, v1);
                l1.addPeers([l2, l3], i);
                l2.addPeers([l3, l1], i);
                l3.addPeers([l1, l2], i);
            }

            this.lines = lines;

            // lines belonging to only one face or with only 2 peers
            // are on the edge of a hole
            let edges = this.edges = lines.filter(l => l.faces.length === 1);
            let loops = this.loops = [];
            // console.log({edges});

            // connect edge lines into closed loops
            for (let i=0, l=edges.length; i<l; i++) {
                let line = edges[i];
                if (line.used) {
                    continue;
                }
                line.used = true;
                let loop = [ line ];
                // build line through adjacent lines
                while (true) {
                    let adjacent = vmap[line.v1]
                        .concat(vmap[line.v2])
                        .filter(l => l !== line && !l.used && l.faces.length === 1);
                    if (adjacent.length === 0) {
                        break;
                    }
                    if (adjacent.length > 2) {
                        console.log('error adjacent', adjacent);
                        // break;
                    }
                    if (adjacent.length === 1) {
                        if (line.v2 !== adjacent[0].v1) {
                            let tmp = adjacent[0].v1;
                            adjacent[0].v1 = adjacent[0].v2;
                            adjacent[0].v2 = tmp;
                            // console.log('chirality mismatch fixed');
                        }
                        line = adjacent[0];
                    } else {
                        // follow edges according to chirality
                        line = adjacent[0].v1 === line.v2 ?
                            adjacent[0] :
                            adjacent[1]
                    }
                    loop.push(line);
                    line.used = true;
                }
                // drop co-linear points because they can't be connected into valid faces
                // fixup remaining line by dropping common point and using dropped line's point
                // todo: disabled until faces are fixed up, too. otherwise, problems
                if (false) for (let j=0, jl=loop.length; j<jl-1; j++) {
                    let l1 = loop[j];
                    if (l1.del) {
                        continue;
                    }
                    for (let k=j+1; k<jl; k++) {
                        let l2 = loop[k];
                        if (l2.del) {
                            continue;
                        }
                        // todo
                        if (diffUnitVector(l1.unitVector(), l2.unitVector()) < 0.0001) {
                            // console.log('collinear', l1, l2);
                            l2.del = true;
                            l1.v2 = l2.v2;
                        }
                    }
                }
                loop = loop.filter(l => !l.del);
                loops.push(loop);
            }

            // console.log({loops});

            // progressive boundary run algorithm
            function emitLoop1(loop) {
                while (loop.length > 2) {
                    console.log({loop});
                    let nuloop = [];
                    // proceed through line pairs
                    for (let i=0, l=loop.length; i<l; i++) {
                        let l1 = loop[i];
                        let l2 = loop[i+1];
                        // check if two lines share a face
                        // we know edge lines belong to only one face
                        if (!l2 || l1.faces[0] === l2.faces[0]) {
                            nuloop.push(l1);
                            // console.log('end or same face', l1, l2);
                            continue;
                        }
                        // synthesize a new face reversing point order
                        let face = faces.length;
                        if (l1.v2 !== l2.v1) {
                            console.log('out of order');
                        }
                        faces.push(l1.v1);
                        faces.push(l2.v2);
                        faces.push(l2.v1);
                        // add new loop line and increment i to skip l2
                        nuloop.push(getLine(l1.v1, l2.v2).addPeers(l1, face).addPeers(l2, face));
                        i++;
                    }
                    if (nuloop.length === loop.length) {
                        console.log("no new faces created");
                        break;
                    }
                    // console.log({nuloop});
                    loop = nuloop;
                }
            }

            // rotate/flatten to Z plane and use earcut
            // then map emitted points back to original rotation plane
            function emitLoop2(loop) {
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
                // console.log({points, fpoints, ec, dx, dy, dz});

                for (let point of ec) {
                    faces.push(pindex[point]);
                }
            }

            // emit loops
            let faceCount = this.faces.length;
            for (let loop of loops) {
                emitLoop2(loop);
                // emitLoop1(loop);
            }
            this.newFaces = this.faces.length - faceCount;
            // console.log({newFaces: this.newFaces});

            return this;
        }
    };

})();
