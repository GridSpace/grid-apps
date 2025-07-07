/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

gapp.register("kiri.stack", [], (root, exports) => {

const { kiri } = root;

/*
 * converts `layers.js` output data structures into three.js meshes for display
 */
class Stack {
    constructor(view, freeMem, shiny) {
        this._view = view;
        this.view = view.newGroup();
        this.slices = [];
        this.meshes = [];
        this.freeMem = freeMem;
        newMat = shiny ? createPhongMaterial : createLambertMaterial;
    }

    size() {
        return this.slices.length;
    }

    hide() {
        this.view.visible = false;
    }

    show() {
        this.view.visible = true;
    }

    rotate(set) {
        this.view.rotation.x = -set.angle * (Math.PI/180);
        this.view.position.y = -set.dy;
        this.view.position.z = -set.dz;
    }

    destroy() {
        this._view.remove(this.view);
        THREE.dispose(this.view);
        this.view = this.slices = this.meshes = null;
    }

    setFreeMem(bool) {
        this.freeMem = bool;
    }

    setVisible(newMin, newMax) {
        this.show();
        for (let i=0, s=this.slices, len=s.length; i<len; i++) {
            s[i].visible = i >= newMin && i <= newMax;
            if (s[i].visible) this.lastVis = s[i];
        }
    }

    setLastFraction(frac = 1) {
        if (this.lastVis)
        for (let mesh of this.lastVis.children) {
            let geo = mesh.geometry;
            let pos = geo.attributes.position;
            let len = frac === 1 ? Infinity : Math.round(pos.count * frac);
            geo.setDrawRange(0, len);
        }
    }

    addLayers(layers) {
        // each slice gets a group so the slice can be toggled efficiently
        let group = this.view.newGroup();
        this.slices.push(group);
        let map = this.renderLayers(layers, group);
        // by default release memory after layers are rendered
        if (this.freeMem) {
            layers.init();
        }
        // return map of layers to materials (so they can be toggled on/off)
        return map;
    }

    renderLayers(layers, group) {
        const map = {}
        for (const [label, layer] of Object.entries(layers.layers)) {
            map[label] = this.renderLayer(layer, group);
        }
        return map;
    }

    renderLayer(layer, group) {
        function addPoly(vertices, poly) {
            // unroll native polys into points
            if (poly.id) {
                poly = {
                    open: poly.open,
                    points: poly.points.map(p => [p.x, p.y, p.z]).flat().toFloat32()
                };
            }
            const points = poly.points, len = points.length;
            for (let i=3; i<len; i += 3) {
                vertices.push(new THREE.Vector3(points[i-3], points[i-2], points[i-1]));
                vertices.push(new THREE.Vector3(points[i+0], points[i+1], points[i+2]));
            }
            if (!poly.open) {
                vertices.push(new THREE.Vector3(points[0], points[1], points[2]));
                vertices.push(new THREE.Vector3(points[len-3], points[len-2], points[len-1]));
            }
        }

        const { polys, lines, faces, cface, paths, cpath } = layer;
        const { color, off, norms, rotation, position } = layer;
        const { fat, order, opacity } = color;
        const meshes = [];
        const defstate = !off;
        const mats = [];
        mats.state = defstate;

        if (polys.length || lines.length) {
            const vert = []; // vertexes
            const mat = []; // materials
            const grp = []; // material groups
            const geo = fat ? new THREE.LineSegmentsGeometry() : new THREE.BufferGeometry();
            // map all the poly and line colors for re-use
            const cmap = {}
            let cidx = 0;
            let last = undefined;
            for (let i=0, il=polys.length; i<il; i++) {
                const vl = vert.length;
                const poly = polys[i];
                addPoly(vert, poly);
                const pc = poly.color !== undefined ? { line: poly.color, opacity } : color;
                const pk = pc.line;
                const cc = cmap[pk] = cmap[pk] || {
                    idx: cidx++,
                    mat: createLineMaterial(pc, mat)
                };
                if (last !== pk) {
                    if (grp.length) {
                        // rewrite counts for last group
                        const prev = grp[grp.length - 1]
                        prev[1] = vl;
                    }
                    grp.push([vl, Infinity, cc.idx]);
                    last = pk;
                }
            }
            // for now, line segments inherit the last color
            for (let i=0, il=lines.length; i<il; i += 3) {
                vert.push(new THREE.Vector3(lines[i], lines[i+1], lines[i+2]));
            }
            // ensure at least one group using the default color settings
            if (grp.length === 0) {
                grp.push([0, Infinity, 0]);
                mat.push(createLineMaterial(color));
            }
            mat.forEach(m => m.visible = defstate);
            for (let i=0; i<grp.length; i++) {
                const g = grp[i];
                geo.addGroup(g[0], g[1], g[2]);
            }
            if (fat) {
                // LineSegmentsGeometry does not support setFromPoints()
                geo.setPositions(vert.map(v => v.toArray()).flat());
            } else {
                geo.setFromPoints(vert);
            }
            // LineSegments2 does not support multiple materials
            const segs = fat ?
                new THREE.LineSegments2(geo, mat[0]) :
                new THREE.LineSegments(geo, mat);
            if (rotation) segs.rotation.set(rotation.x, rotation.y, rotation.z);
            if (position) segs.position.set(position.x, position.y, position.z);
            if (order !== undefined) segs.renderOrder = order;
            meshes.push(segs);
            group.add(segs);
            mats.appendAll(mat);
        }
        if (faces.length) {
            const mat = [];
            if (cface) {
                cface.forEach(c => { mat.push(newMat(c, true)) });
            } else {
                mat.push(newMat(color, true));
            }
            mat.forEach(m => m.visible = defstate);
            const geo = new THREE.BufferGeometry();
            if (faces.toFloat32) {
                geo.setAttribute('position', new THREE.BufferAttribute(faces.toFloat32(), 3));
            } else {
                geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
            }
            if (norms) {
                geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
            } else {
                geo.computeVertexNormals();
            }
            if (cface) {
                cface.forEach((c, i) => geo.addGroup(c.start, c.count, i));
            } else {
                geo.addGroup(0, Infinity, 0);
            }
            const mesh = new THREE.Mesh(geo, mat);
            if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
            if (position) mesh.position.set(position.x, position.y, position.z);
            meshes.push(mesh);
            group.add(mesh);
            mats.appendAll(mat);
        }
        if (paths) {
            const mat = [];
            if (cpath) {
                cpath.forEach(c => { mat.push(newMat(c)) });
            } else {
                mat.push(newMat(color));
            }
            mat.forEach(m => m.visible = defstate);
            const { index, faces, norms, z } = paths;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
            if (index && index.length) {
                geo.setIndex(index);
            }
            if (norms) {
                geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
            } else {
                geo.computeVertexNormals();
            }
            if (cpath) {
                cpath.forEach((c, i) => geo.addGroup(c.start, c.count, i));
            } else {
                geo.addGroup(0, Infinity, 0);
            }
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.z = z;
            if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
            if (position) mesh.position.set(position.x, position.y, position.z);
            meshes.push(mesh);
            group.add(mesh);
            mats.appendAll(mat);
        }

        this.new_meshes = meshes;
        this.meshes.appendAll(meshes);
        mats.forEach(mat => mat.visible = defstate);
        return mats;
    }
}

kiri.Stack = Stack;

let shininess = 15,
    specular = 0x444444,
    emissive = 0x101010,
    metalness = 0,
    roughness = 0.3,
    newMat = createPhongMaterial;

function createLineMaterial(color, array) {
    const opacity = color.lopacity || color.opacity || 1;
    const mat = color.fat ? new THREE.LineMaterial({
        // transparent: true,
        // opacity: opacity,
        color: color.line,
        linewidth: color.fat,
        alphaToCoverage: false
    }) : new THREE.LineBasicMaterial({
        transparent: true,
        opacity: opacity,
        color: color.line
    });
    if (array) {
        array.push(mat);
    }
    return mat;
}

function createStandardMaterial(color, flat) {
    return new THREE.MeshMatcapMaterial({
        transparent: color.opacity != 1,
        opacity: color.opacity || 1,
        color: color.face,
        side: flat ? THREE.DoubleSide : THREE.FrontSide
    });
}

function createPhongMaterial(color, flat) {
    return new THREE.MeshPhongMaterial({
        shininess,
        specular,
        transparent: color.opacity != 1,
        opacity: color.opacity || 1,
        color: color.face,
        side: flat ? THREE.DoubleSide : THREE.FrontSide
    });
}

function createLambertMaterial(color, flat) {
    return new THREE.MeshLambertMaterial({
        transparent: color.opacity != 1,
        opacity: color.opacity || 1,
        color: color.face,
        side: flat ? THREE.DoubleSide : THREE.FrontSide
    });
}

});
