/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    class Stack {
        constructor(view, freeMem) {
            this._view = view;
            this.view = view.newGroup();
            this.slices = [];
            this.meshes = [];
            this.freeMem = freeMem;
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
            this.view.position.y += -set.dy;
            this.view.position.z += -set.dz;
        }

        destroy() {
            this._view.remove(this.view);
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
                const points = poly.points, len = points.length;
                for (let i=1; i<len; i++) {
                    const p1 = points[i-1], p2 = points[i];
                    vertices.push(new THREE.Vector3(p1.x, p1.y, p1.z));
                    vertices.push(new THREE.Vector3(p2.x, p2.y, p2.z));
                }
                if (!poly.open) {
                    const p1 = points[len - 1], p2 = points[0];
                    vertices.push(new THREE.Vector3(p1.x, p1.y, p1.z));
                    vertices.push(new THREE.Vector3(p2.x, p2.y, p2.z));
                }
            }

            const { polys, lines, faces, cface, paths, cpath, color, off } = layer;
            const meshes = [];
            const defstate = !off;
            const mats = [];
            mats.state = defstate;

            if (polys.length || lines.length) {
                const vert = []; // vertexes
                const mat = []; // materials
                const grp = []; // material groups
                const geo = new THREE.BufferGeometry();
                // map all the poly and line colors for re-use
                const cmap = {}
                let cidx = 0;
                let last = undefined;
                for (let i=0, il=polys.length; i<il; i++) {
                    const vl = vert.length;
                    const poly = polys[i];
                    addPoly(vert, poly);
                    const pc = poly.color !== undefined ? { line: poly.color, opacity: color.opacity } : color;
                    const pk = pc.line;
                    const cc = cmap[pk] = cmap[pk] || { idx: cidx++, mat: createLineMaterial(pc, mat) };
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
                for (let i=0, il=lines.length; i<il; i++) {
                    const p = lines[i];
                    vert.push(new THREE.Vector3(p.x, p.y, p.z));
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
                geo.setFromPoints(vert);
                const segs = new THREE.LineSegments(geo, mat);
                meshes.push(segs);
                group.add(segs);
                mats.appendAll(mat);
            }
            if (faces.length) {
                const mat = [];
                if (cface) {
                    cface.forEach(c => { mat.push(newMat(c)) });
                } else {
                    mat.push(newMat(color));
                }
                mat.forEach(m => m.visible = defstate);
                const geo = new THREE.BufferGeometry();
                if (faces.toFloat32) {
                    geo.setAttribute('position', new THREE.BufferAttribute(faces.toFloat32(), 3));
                } else {
                    geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
                }
                geo.computeFaceNormals();
                geo.computeVertexNormals();
                if (cface) {
                    cface.forEach((c, i) => geo.addGroup(c.start, c.count, i));
                } else {
                    geo.addGroup(0, Infinity, 0);
                }
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                meshes.push(mesh);
                group.add(mesh);
                mats.appendAll(mat);
            }
            if (paths.length) {
                const mat = [];
                if (cpath) {
                    cpath.forEach(c => { mat.push(newMat(c)) });
                } else {
                    mat.push(newMat(color));
                }
                mat.forEach(m => m.visible = defstate);
                // const mat = newMat(data);
                paths.forEach((path, i) => {
                    const { index, faces, z, colors } = path;
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
                    geo.setIndex(index);
                    geo.computeFaceNormals();
                    geo.computeVertexNormals();
                    if (cpath) {
                        cpath.forEach((c, i) => geo.addGroup(c.start, c.count, i));
                    } else {
                        geo.addGroup(0, Infinity, 0);
                    }
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.z = z;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    meshes.push(mesh);
                    group.add(mesh);
                });
                mats.appendAll(mat);
            }

            this.new_meshes = meshes;
            this.meshes.appendAll(meshes);
            mats.forEach(mat => mat.visible = defstate);
            return mats;
        }
    }

    self.kiri.Stack = Stack;

    let shininess = 15,
        specular = 0x444444,
        emissive = 0x101010,
        metalness = 0,
        roughness = 0.3,
        newMat = createPhongMaterial;

    function createLineMaterial(color, array) {
        const opacity = color.opacity || 1;
        const mat = new THREE.LineBasicMaterial({
            transparent: true,
            opacity: opacity,
            color: color.line
        });
        if (array) {
            array.push(mat);
        }
        return mat;
    }

    function createStandardMaterial(color) {
        return new THREE.MeshStandardMaterial({
            emissive,
            roughness,
            metalness,
            transparent: color.opacity != 1,
            opacity: color.opacity || 1,
            color: color.face,
            side: THREE.DoubleSide
        });
    }

    function createPhongMaterial(color) {
        return new THREE.MeshPhongMaterial({
            shininess,
            specular,
            transparent: color.opacity != 1,
            opacity: color.opacity || 1,
            color: color.face,
            side: THREE.DoubleSide
        });
    }

})();
