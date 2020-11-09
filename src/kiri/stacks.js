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

    function create(name, view) {
        if (stacks[name]) {
            return stacks[name];
        }
        const stack = stacks[name] = {
            layers: [ ],
            view: view.newGroup(),
            add: function(layer) {
                const nuview = stack.view.newGroup();
                stack.layers.push(nuview);
                render(layer, nuview);
                tallest = Math.max(tallest, stack.layers.length);
            },
            clear: function() {
                view.remove(stack.view);
            }
        };
        return stack;
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

    function render(render, group) {
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

            const { polys, lines, faces, paths, cpath } = data;
            if (polys.length || lines.length) {
                const mat = [];
                if (cpath) {
                    cpath.forEach(c => { mat.push(createLineMaterial({ color: c })) });
                } else {
                    mat.push(createLineMaterial(data));
                }
                mat.forEach(m => m.visible = defstate);
                const geo = new THREE.BufferGeometry();
                const vert = [];
                for (let i=0, il=polys.length; i<il; i++) {
                    addPoly(vert, polys[i]);
                }
                for (let i=0, il=lines.length; i<il; i++) {
                    const p = lines[i];
                    vert.push(new THREE.Vector3(p.x, p.y, p.z));
                }
                if (vert.length) {
                    if (cpath) {
                        cpath.forEach((c, i) => geo.addGroup(c.start, c.count, i));
                    } else {
                        geo.addGroup(0, Infinity, 0);
                    }
                    group.add(new THREE.LineSegments(geo, mat));
                }
                geo.setFromPoints(vert);
                ctrl.group.appendAll(mat);
            }
            if (faces.length) {
                const mat = newMat(data);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
                geo.computeFaceNormals();
                geo.computeVertexNormals();
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
                ctrl.group.push(mat);
                mat.visible = defstate;
            }
            if (paths.length) {
                const mat = [];
                if (cpath) {
                    cpath.forEach(c => { mat.push(newMat({ color: c })) });
                } else {
                    mat.push(newMat(data));
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
    };

    function createLineMaterial(data) {
        return new THREE.LineBasicMaterial({
            transparent: data.color.opacity != 1,
            opacity: data.color.opacity || 1,
            color: data.color.line
        });
    }

    function createStandardMaterial(data) {
        return new THREE.MeshStandardMaterial({
            emissive,
            roughness,
            metalness,
            transparent: data.color.opacity != 1,
            opacity: data.color.opacity || 1,
            color: data.color.face,
            side: THREE.DoubleSide
        });
    }

    function createPhongMaterial(data) {
        return new THREE.MeshPhongMaterial({
            shininess,
            specular,
            transparent: data.color.opacity != 1,
            opacity: data.color.opacity || 1,
            color: data.color.face,
            side: THREE.DoubleSide
        });
    }

    KIRI.stacks = {
        clear,
        create,
        getRange,
        setRange
    };

})();
