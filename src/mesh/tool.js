/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: ext.earcut
// dep: mesh.geom
gapp.register("mesh.tool", [], (root, exports) => {

const { mesh } = root;
const { geom } = mesh;
const { Vector3 } = THREE;
const empty = 0xffffffff;

/**
 * tool for identiying defects and healing them
 * copied from base/mesh which is used by KM. the
 * two need to be merged. earcut needs to be migrated
 * to base.util.triagulate
 */
mesh.tool = class MeshTool {
    constructor(params = {}) {
        this.precision = Math.pow(10, params.precision || 6);
    }

    checkVertices(vertices, mod) {
        if (!vertices) {
            throw "missing vertices";
        }
        if (mod && vertices.length % mod !== 0) {
            throw "invalid vertices";
        }
        return vertices;
    }

    getIndex() {
        if (!this.indexed) {
            throw "missing index";
        }
        return this.indexed;
    }

    listZ() {
        let verts = this.checkVertices(this.uvert).group(3);
        let zs = new Set();
        for (let vert of verts) {
            zs.add(vert[2]);
        }
        return Array.from(zs).sort((a,b) => a - b);
    }

    flattenZ(faceIdxs) {
        let { uvert, faces } = this;
        let zsum = 0;
        let zunq = [];
        for (let faceIdx of faceIdxs) {
            let fv1 = faces[faceIdx * 3 + 0];
            let fv2 = faces[faceIdx * 3 + 1];
            let fv3 = faces[faceIdx * 3 + 2];
            let z1 = uvert[fv1 + 2];
            let z2 = uvert[fv2 + 2];
            let z3 = uvert[fv3 + 2];
            zunq.push(z1,z2,z3);
            zsum = zsum + z1 + z2 + z3;
        }
        let zavg = ((( zsum / (faceIdxs.length * 3) ) * 10000 ) | 0) / 10000;
        for (let faceIdx of faceIdxs) {
            let fv1 = faces[faceIdx * 3 + 0];
            let fv2 = faces[faceIdx * 3 + 1];
            let fv3 = faces[faceIdx * 3 + 2];
            uvert[fv1 + 2] = zavg;
            uvert[fv2 + 2] = zavg;
            uvert[fv3 + 2] = zavg;
        }
        return { unique: zunq.sort().uniq(), average: zavg };
    }

    /**
     * @param {number[]} vertices non-indexed
     */
    generateFaces(vertices, opt = {}) {
        this.checkVertices(vertices, 3);
        let doClean = opt.clean !== false;
        let doDedup = opt.dedup !== false;
        let round = Math.pow(10, opt.round || 0);
        let faces = [];
        let fcac = {}; // seen face hash
        let fnew = []; // accumulate vertex triplets
        let nuvt = []; // new vertex list
        let hash = {}; // find vertex matches
        let prec = this.precision;
        let dups = 0;
        let cull = 0;
        if (round > 1) {
            for (let i=0, l=vertices.length; i<l; i++) {
                vertices[i] = ((vertices[i] * round) | 0) / round;
            }
        }
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
                // add new vertex x,y,z and hash entry with index
                hash[key] = vpos = nuvt.length;
                nuvt.push(x);
                nuvt.push(y);
                nuvt.push(z);
            }
            if (doClean) {
                // add vertex position to face accumulator
                fnew.push(vpos);
                if (fnew.length === 3) {
                    // check and emit face if it's unique
                    // cull invalid faces (has 2 or more shared vertices)
                    if (fnew[0] === fnew[1] || fnew[0] === fnew[2] || fnew[1] === fnew[2]) {
                        fnew = [];
                        cull++;
                        continue;
                    }
                    if (doDedup) {
                        let key = fnew.slice().sort().join('-');
                        // drop duplicate faces (sort handles reverse order)
                        if (!fcac[key]) {
                            faces.appendAll(fnew);
                            fcac[key] = key;
                        } else {
                            dups++;
                        }
                    } else {
                        faces.appendAll(fnew);
                    }
                    fnew = [];
                }
            } else {
                faces.push(vpos);
            }
        }
        this.stats = {cull, dups, faces: faces.length/3};
        // unique vertex array
        this.uvert = nuvt;
        // unique face array. elements are offset into vertices
        this.faces = faces;
        return this;
    }

    // todo: supercede generatedFaces() for patch()
    // face record: vi1, vi2, vi3, nx, ny, nz
    // vi = vertex index
    // n = normal
    // af = adjacent face index
    index(vertices) {
        this.vertices = this.checkVertices(vertices, 3);
        const prec = this.precision;
        const vcount = vertices.length / 3;
        const fcount = vcount / 3;
        const vround = vertices.map(v => (v * prec) | 0);
        // side records [ vi0, vi1, fn1, fn2 ]
        const sides = new Uint32Array(fcount * 4 * 3).fill(empty);
        // map of side index to face count
        const srecs = {};
        // side extended records when face count exceeds 2 (bad mesh)
        const sideExt = {};
        // face record array [ nx, ny, nz, sn0, sn1, sn2 ]
        const faces = new Float32Array(fcount * 6);
        // vertex key to vertex index
        const vimap = {};
        // normal key to normal index
        const nimap = {};
        // side key to side index
        const simap = {};
        // tmp face vertex indices
        const vinds = [ 0, 0, 0 ];
        // tmp face raw vertex offset
        const viraw = [ 0, 0, 0 ];
        // tmp vector array
        const vects = [ new Vector3(), new Vector3(), new Vector3() ];
        // i=vround index, fi=faces record index
        // vi=vinds index % 3, x,y,z = tmp vars
        // fn=next face index, vn=next vertex index, sn=next side index
        for (let i=0, l=vround.length, fn=0, vn=0, sn=0, fi=0, vi=0, x, y, z; i<l; ) {
            const vroot = i;
            // create unique vertex map
            vects[vi].set(x = vround[i++], y = vround[i++], z = vround[i++]);
            let key = x + ',' + y + ',' + z;
            // vertex index
            let vid = vimap[key];
            if (vid === undefined) {
                vid = vimap[key] = vn++;
            }
            viraw[vi] = vroot;
            vinds[vi++] = vid;
            // completed record for a face
            if (vi === 3) {
                // create indexed unique normal map
                const cfn = THREE.computeFaceNormal(...vects);
                const [ v0, v1, v2 ] = vinds;
                // create consistent side order for index key
                const s0 = (v0 < v1 ? v0 + "," + v1 : v1 + ","  +v0);
                const s1 = (v1 < v2 ? v1 + "," + v2 : v2 + ","  +v1);
                const s2 = (v2 < v0 ? v2 + "," + v0 : v0 + ","  +v2);
                // for storing raw vertex offset in side record
                const [ vr0, vr1, vr2 ] = viraw;
                // store face indexes into sdrec array for each side
                const smap = [ s0, s1, s2 ].map((key,ki) => {
                    let sid = simap[key], sdoff, sdcnt;
                    if (sid === undefined) {
                        sid = simap[key] = sn++;
                        sdcnt = srecs[sid] = 1;
                        sdoff = sid * 4;
                        sides[sdoff] = viraw[ki];
                        sides[sdoff + 1] = viraw[(ki + 1) % 3];
                    } else {
                        sdoff = sid * 4;
                        sdcnt = ++srecs[sid];
                    }
                    if (sdcnt > 2) {
                        (sideExt[sid] = sideExt[sid] ||
                            [ sides[sdoff], sides[sdoff + 1], sides[sdoff + 2], sides[sdoff + 3] ]
                        ).push(fn);
                    } else {
                        sides[sdoff + sdcnt + 1] = fn;
                    }
                    return sid;
                });
                faces[fi++] = cfn.x;
                faces[fi++] = cfn.y;
                faces[fi++] = cfn.z;
                faces[fi++] = smap[0];
                faces[fi++] = smap[1];
                faces[fi++] = smap[2];
                vi = 0;
                fn++;
            }
        }
        this.indexed = {
            faces, sides, sideExt
        };
    }

    getAdjacentFaces(face) {
        const { faces, sides } = this.getIndex();
        const foff = face * 6;
        const s0 = faces[foff + 3];
        const s1 = faces[foff + 4];
        const s2 = faces[foff + 5];
        const farr = [
            sides[s0 * 4 + 2],
            sides[s0 * 4 + 3],
            sides[s1 * 4 + 2],
            sides[s1 * 4 + 3],
            sides[s2 * 4 + 2],
            sides[s2 * 4 + 3]
        ].filter(f => f !== empty && f !== face);
        if (!farr.length) {
            console.log(`no adjacent faces to ${face}`);
            return [];
        }
        return farr;
    }

    // depends on index() being run first
    findConnectedSurface(faces, radians, filterZ, found = {}) {
        const norms = this.getIndex().faces;
        if (filterZ !== undefined) {
            // optional filter to z normal >= value
            faces = faces.filter(f => norms[f * 6 + 2] >= filterZ);
        }
        const checked = {};
        const check = faces.slice();
        for (let face of faces) {
            found[face] = 1;
        }
        while (check.length) {
            const face = check.shift();
            const froot = face * 6;
            if (filterZ !== undefined && norms[froot + 2] < filterZ) {
                continue;
            }
            const fadj = this.getAdjacentFaces(face);
            for (let f of fadj) {
                if (found[f] || checked[f]) {
                    continue;
                }
                const aroot = f * 6;
                let sum = 0;
                for (let i=0; i<3; i++) {
                    sum += Math.pow(norms[froot + i] - norms[aroot + i], 2);
                }
                const fn = Math.sqrt(sum);
                if (fn <= radians) {
                    faces.push(f);
                    check.push(f)
                    checked[f] = 1;
                    found[f] = 1;
                }
            }
        }
        return faces;
    }

    // given a list of faces (indices), return an array of closed
    // polylines that represent the outlines of each discrete island
    generateOutlines(list) {
        const { faces, sides } = this.getIndex();
        const prec = this.precision;
        const verts = this.vertices;
        const lines = {};
        const point = {};
        const pindx = {};
        let pnext = 0;
        function vert2point(v) {
            const x = verts[v];
            const y = verts[v + 1];
            const z = verts[v + 2];
            const key = ((x * prec) | 0) + ',' + ((y * prec) | 0) + ',' + ((z * prec) | 0);
            const rec = point[key];
            if (rec === undefined) {
                pindx[pnext] = { x, y, z, to: [] };
                return point[key] = pnext++;
            } else {
                return rec;
            }
        }
        function addLine(s) {
            if (s === empty) return;
            const v0 = vert2point(sides[s * 4]);
            const v1 = vert2point(sides[s * 4 + 1]);
            const key = v0 < v1 ? v0 + ',' + v1 : v1 +',' + v0;
            const rec = lines[key];
            if (rec) {
                rec.del = true;
            } else {
                lines[key] = { v0, v1 };
            }
        }
        for (let face of list) {
            const foff = face * 6;
            addLine(faces[foff + 3]);
            addLine(faces[foff + 4]);
            addLine(faces[foff + 5]);
        }
        const pairs = Object.values(lines).filter(l => !l.del);
        for (let line of pairs) {
            const { v0, v1 } = line;
            const p0 = pindx[v0];
            const p1 = pindx[v1];
            p0.to.push(v1);
            p1.to.push(v0);
        }
        let curr;
        let outs = [ ];
        for (let prec of Object.values(pindx)) {
            if (prec.used || prec.to.length === 0) continue;
            outs.push(curr = []);
            while (prec) {
                let { to, x, y, z } = prec;
                if (to.length < 2) {
                    throw `invalid to ${to.length} @ ${x},${y},${z}`;
                }
                prec.used = true;
                curr.push({ x, y, z });
                const t0 = pindx[to[0]];
                const t1 = pindx[to[1]];
                if (!t0.used) {
                    prec = t0;
                } else if (!t1.used) {
                    prec = t1;
                } else {
                    prec = undefined;
                }
            }
        }
        // console.log({lines, pairs, pindx, outs});
        return outs;
    }

    // depends on index() being run first
    isolateBodies() {
        const verts = this.checkVertices(this.vertices);
        const bodies = [];
        const used = {};
        for (let i=0, l=verts.length / 9; i<l; i++) {
            if (used[i]) {
                continue;
            }
            const body = this.findConnectedSurface([i], Infinity, undefined, used);
            if (body.length) {
                // todo: pre-allocate known length
                // then copy array regions from verts to bverts
                const bverts = [];
                for (let f of body) {
                    bverts.push(...verts.slice(f*9, f*9+9));
                }
                bodies.push(bverts);
            }
        }
        return bodies;
    }

    /**
     * finds edge lines which are line segments on a single face.
     * construct ordered line maps with array of connected edges.
     * connect lines into polys. earcut polys into new faces.
     * requires generateFaces() be run first
     */
    patch(opt = { merge: true }) {
        let vertices = this.checkVertices(this.uvert);
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
                } else if (false) {
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

        // array of unique line segment records with vertices
        // and a list of faces. one = edge, two = inside
        // all lines should be inside or object is not manifold
        // but does not preclude self-intersecting geometries
        this.lines = lines;

        // lines belonging to only one face are on the edge of a hole
        let edges = this.edges = lines.filter(l => l.faces.length === 1);

        // arrays of connected edges that form a closed loop
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
                        // console.log('chirality mismatch fixed');
                    }
                    line = adjacent[0];
                } else if (adjacent.length === 2) {
                    // follow edges according to chirality
                    line = adjacent[0].v1 === line.v2 ?
                        adjacent[0] :
                        adjacent[1]
                } else {
                    // console.log('error adjacent', line, adjacent, loops.length, loop.length);
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
        // console.log({edges, loops, shorts: this.shorts});

        // filter out null and short loops
        this.loops = loops = loops.filter(l => l && l.length > 2);
        // console.log({loops_filtered: loops});

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
                // swap x or y for z axes
                for (let point of points) {
                    let tmpz = point[2];
                    point[2] = point[swap];
                    point[swap] = tmpz;
                }
            }

            return  { index: pindex, points: points.flat(), swap };
        }

        // given a loop with holes, emit faces
        function emitFaces(loop) {
            let { index, points } = loop;
            let ec = earcut(points, undefined, 3);
            // map earcut point indexes back to vertex indexes
            return ec.map(p => index[p]);
        }

        function emitTop(rec) {
            let points = rec.loop.points.slice();
            let index = rec.loop.index.slice();
            let holes = [];
            for (let inner of rec.inner) {
                holes.push(points.length / 3);
                points.appendAll(inner.loop.points);
                index.appendAll(inner.loop.index);
            }
            let ec = earcut(points, holes, 3);
            return ec.map(p => index[p]);
        }

        // new patch areas
        let areas = this.areas = [];

        if (opt.compound) {
            // group loops by normal (using swap as crude proxy for now)
            // then attempt to nest them (find holes)
            let polys = loops.map(loop => {
                return emitLoop(loop);
            });

            // return nested mapping
            let nested = geom.nest(polys.map(p => p.points));
            // recover and map loops from point arrays
            for (let rec of nested) {
                rec.loop = polys.filter(loop => loop.points === rec.points)[0];
            }

            // extract tops which have nesting depth mod 2 === 0
            let tops = nested.filter(rec => rec.depth % 2 === 0);
            for (let top of tops) {
                areas.push(emitTop(top));
            }
        } else {
            // create area faces covering loops
            for (let loop of loops) {
                let l2 = emitLoop(loop);
                let fs = emitFaces(l2);
                areas.push(fs);
            }
        }

        // auto-merge newly found enclosed areas
        if (opt.merge) {
            this.merge();
        }

        // de-reference loops and edges
        if (opt.mapped) {
            this.mapped = {
                edges: this.expandLoop(this.edges),
                areas: this.areas.map(a => this.expandArray(a))
            };
        }

        return this;
    }

    // add vertex data from given index into array
    appendVertex(index, array = []) {
        let vertx = this.uvert;
        array.push(vertx[index++]);
        array.push(vertx[index++]);
        array.push(vertx[index]);
        return array;
    }

    // add vertices from a vertex index list to an array
    expandArray(indices, array = []) {
        for (let i of indices) {
            this.appendVertex(i, array);
        }
        return array;
    }

    // turn loop into XYZ vertex array
    expandLoop(loop, array = []) {
        for (let line of loop) {
            this.appendVertex(line.v1, array);
            this.appendVertex(line.v2, array);
        }
        return array;
    }

    // merge generated poly areas into faces
    merge() {
        for (let area of this.areas || []) {
            this.faces.appendAll(area);
        }
    }

    // return non-indexed vertex list (for compatibility)
    unrolled() {
        let out = [];
        for (let face of this.faces) {
            this.appendVertex(face, out);
        }
        return out;
    }

    // returns points array for a polygon
    // extrusion and twist is handled in work.js
    generateGear(numTeeth, module, pressureAngle, offset) {
        // Adapted from: Public Domain Parametric Involute Spur Gear by Leemon Baird, 2011, Leemon@Leemon.com http://www.thingiverse.com/thing:5505
        // see also http://grabcad.com/questions/tutorial-how-to-model-involute-gears-in-solidworks-and-show-design-intent

        // const pitch_radius = (numTeeth * module) / 2;
        const pi = Math.PI;

        // degrees to radians
        function degrees_to_radians(theta) { return theta / 180 * pi; }

        // polar to cartesian
        function polar(r, theta) { return [r * Math.sin(theta), r * Math.cos(theta)]; }

        // point on involute curve
        function q6(b, s, t, d) { return polar(d, s * (iang(b, d) + t)); }

        // unwind this many degrees to go from r1 to r2
        function iang(r1, r2) { return Math.sqrt((r2 / r1) * (r2 / r1) - 1) - Math.acos(r1 / r2); }

        // radius a fraction f up the curved side of the tooth
        function q7(f, r, b, r2, t, s) { return q6(b, s, t, (1 - f) * Math.max(b, r) + f * r2); }

        // lerp q7 0..1 with a given # steps
        function qf(steps, r, b, r2, t, s) {
            let res = [];
            let step = 1/steps;
            for (let f=0; f <= 1; f += step) {
                res.push(q7(f, r, b, r2, t, s));
            }
            return res;
        }

        // rotate an array of 2d points
        function rotate(points_array, angle) {
            let answer = [];
            for (let i = 0; i < points_array.length; i++) {
                let x = points_array[i][0];
                let y = points_array[i][1];
                let xr = x * Math.cos(angle) - y * Math.sin(angle);
                let yr = y * Math.cos(angle) + x * Math.sin(angle);
                answer.push([xr, yr]);
            }
            return answer;
        }

        // gear parameter setup
        let mm_per_tooth = module * pi; // mm size of one gear tooth
        let clearance = offset/2 || 0; // freedom between two gear centers
        let backlash = offset || 0; // freedom between two gear contact points
        let pressure_angle = degrees_to_radians(pressureAngle);
        let gear = [];
        let pitch;

        // involute gear maker
        {
            let p = mm_per_tooth * numTeeth / pi / 2;         // radius of pitch circle
            let c = p + mm_per_tooth / pi - clearance;        // radius of outer circle
            let b = p * Math.cos(pressure_angle);             // radius of base circle
            let r = p - (c - p) - clearance;                  // radius of root circle
            let t = mm_per_tooth / 2 - backlash / 2;          // tooth thickness at pitch circle
            let k = -iang(b, p) - t / 2 / p;                  // angle where involute meets base circle on side of tooth
            let f = 10 + ((p/5) | 0);                         // increase number of tooth curve points on larger gears
            let points = [                                    // [x,y] points for a single gear tooth
                polar(r, -pi / numTeeth),
                polar(r, r < b ? k : -pi / numTeeth),
                ...qf(f, r, b, c, k, 1),
                ...qf(f, r, b, c, k, -1).reverse(),
                polar(r, r < b ? -k : pi / numTeeth),
                // polar(r, 3.142 / numTeeth)                 // omit b/c overlaps start when rotated
            ];

            // create all gear teeth by rotating the first tooth
            for (var i = 0; i < numTeeth; i++) {
                gear.appendAll(rotate(points, -i * 2 * pi / numTeeth));
            }

            pitch = p.round(3);
            mesh.log(`gear pitch radius: ${pitch}`);
        }

        return { gear, pitch };
    }

    generateThreads(height, radius, turns, depth, steps, taper) {
        let verts = [];
        let zstep = height / turns;
        let rstep = (Math.PI * 2) / steps;
        let z2step = zstep / steps;
        let points = []
        let iter = 0;
        let iter_max = turns * steps + steps;
        let mute_min = Math.round(steps * 2.5);
        let mute_max = iter_max - mute_min;
        for (let turn=0; turn<turns; turn++) {
            for (let step=0; step<steps; step++) {
                iter++;
                let itern = iter + steps;
                let rm = radius - depth;
                let rx = true &&
                    taper && iter < mute_min ? rm + (iter / mute_min) * depth :
                    taper && iter > mute_max ? rm + ((iter_max - iter) / mute_min) * depth :
                    radius;
                let rxt = true &&
                    taper && itern < mute_min ? rm + (itern / mute_min) * depth :
                    taper && itern > mute_max ? rm + ((iter_max - itern) / mute_min) * depth :
                    radius;
                let angle0 = rstep * step - Math.PI/2;
                let z0 = (zstep * turn) + (z2step * step);
                let x0 = Math.cos(angle0) * (rm);
                let y0 = Math.sin(angle0) * (rm);
                let x1 = Math.cos(angle0) * (rx);
                let y1 = Math.sin(angle0) * (rx);
                let x1t = Math.cos(angle0) * (rxt);
                let y1t = Math.sin(angle0) * (rxt);
                let p0 = [ x1t, y1t, z0 + zstep/2 ];
                let p1 = [ x0, y0, z0 ];
                let p2 = [ x1, y1, z0 - zstep/2 ];
                let [ pp0, pp1, pp2 ] = points;
                if (pp0 && pp1 && pp2) {
                    verts.push(...pp0, ...pp1, ...p0);
                    verts.push(...p0, ...pp1, ...p1);
                    verts.push(...pp1, ...pp2, ...p1);
                    verts.push(...p1, ...pp2, ...p2);
                }
                points = [ p0, p1, p2 ];
            }
        }
        return verts;
    }

};

});
