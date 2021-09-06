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
                }
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
            let edges = lines.filter(l => l.faces.length === 1);
            console.log({edges});

            let loops = [];

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
                    let adjacent = vmap[line.v1].concat(vmap[line.v2]).filter(l => l !== line && !l.used && l.faces.length === 1);
                    if (adjacent.length === 0) {
                        break;
                    }
                    if (adjacent.length > 2) {
                        console.log('error adjacent', adjacent);
                        break;
                    }
                    line = adjacent[0];
                    loop.push(line);
                    line.used = true;
                }
                console.log({loop});
                // drop co-linear points because they can't be connected into valid faces
                // fixup remaining line by dropping common point and using dropped line's point
                for (let j=0, jl=loop.length; j<jl-1; j++) {
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
                    }
                }
                loops.push(loop);
            }

            console.log({loops});

            return this;
        }
    };

})();
