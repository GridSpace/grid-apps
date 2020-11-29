/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    const KIRI = self.kiri,
        shininess = 15,
        specular = 0x444444,
        emissive = 0x101010,
        metalness = 0,
        roughness = 0.3,
        newMat = createPhongMaterial;

    let stacks = {},
        freeMem = true,
        tallest = 0,
        min = 0,
        max = 0,
        labels, API, UC, UI, DYN;

    function init() {
        labels = $("layers");
        API = KIRI.api,
        UC = API.uc,
        UI = API.ui;
    }

    function setFreeMem(bool) {
        freeMem = bool;
        return this;
    }

    function clear() {
        if (!API) {
            init();
        }
        // remove stacks from their views
        for (const [stack, data] of Object.entries(stacks)) {
            data.clear();
        }
        min = max = tallest = 0;
        stacks = {};
        DYN = UI.dyn = {};

        // clear labels
        UC.setGroup(labels);
        labels.innerHTML = '';
    }

    function getStack(name) {
        return stacks[name];
    }

    function create(name, view) {
        if (stacks[name]) {
            return stacks[name];
        }
        const stack = stacks[name] = {
            layers: [ ],
            view: view.newGroup(),
            add: function(layer) {
                const lview = stack.view.newGroup();
                stack.layers.push(lview);
                render(layer, lview, name);
                tallest = Math.max(tallest, stack.layers.length);
            },
            remove: function() {
                view.remove(stack.view);
            },
            clear: function() {
                view.remove(stack.view);
            },
            button: function(label, action) {
                UC.newRow([ UC.newButton(label, action) ]);
            }
        };
        return stack;
    }

    function remove(name) {
        const stack = stacks[name];
        if (stack) {
            stack.remove();
            delete stacks[name];
        }
    }

    function getRange() {
        return {min, max, tallest};
    }

    function setRange(newMin, newMax) {
        for (const [stack, data] of Object.entries(stacks)) {
            const layers = data.layers, len = layers.length;
            for (let i=0; i<len; i++) {
                layers[i].visible = i >= newMin && i <= newMax;
            }
        }
        min = newMin;
        max = newMax;
    }

    function render(render, group, name) {
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

        for (const [label, data] of Object.entries(render.layers)) {
            if (!DYN[label]) {
                DYN[label] = {
                    group: [],
                    toggle: UC.newBoolean(label, (abc) => {
                        ctrl.group.forEach(mat => {
                            mat.visible = ctrl.toggle.checked;
                        });
                    })
                };
            }
            const defstate = !data.off;
            const ctrl = DYN[label];

            ctrl.toggle.checked = defstate;

            const { polys, lines, faces, cface, paths, cpath } = data;
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
                    const pc = poly.color !== undefined ? { line: poly.color, opacity: data.color.opacity } : data.color;
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
                    mat.push(createLineMaterial(data.color));
                }
                mat.forEach(m => m.visible = defstate);
                for (let i=0; i<grp.length; i++) {
                    const g = grp[i];
                    geo.addGroup(g[0], g[1], g[2]);
                }
                geo.setFromPoints(vert);
                const segs = new THREE.LineSegments(geo, mat);
                group.add(segs);
                ctrl.group.appendAll(mat);
            }
            if (faces.length) {
                const mat = [];
                if (cface) {
                    cface.forEach(c => { mat.push(newMat(c)) });
                } else {
                    mat.push(newMat(data.color));
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
                group.add(mesh);
                ctrl.group.appendAll(mat);
            }
            if (paths.length) {
                const mat = [];
                if (cpath) {
                    cpath.forEach(c => { mat.push(newMat(c)) });
                } else {
                    mat.push(newMat(data.color));
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
                    group.add(mesh);
                });
                ctrl.group.appendAll(mat);
            }
        }
        if (freeMem) {
            render.init();
        }
    };

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

    KIRI.stacks = {
        clear,
        create,
        remove,
        getStack,
        getRange,
        setRange,
        setFreeMem
    };

})();
