/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.Layer) return;

    const KIRI = self.kiri,
        POLY = self.base.polygons,
        shininess = 15,
        specular = 0x444444,
        emissive = 0x101010,
        metalness = 0,
        roughness = 0.3,
        newMesh = createPhongMesh;

    KIRI.Layer = Layer;
    KIRI.newLayer = function() { return new Layer() };

    function Layer(view) { }

    Layer.renderSetup = function() {
        const API = KIRI.api, UC = API.uc, UI = API.ui;
        const dyn = UI.dyn = {};
        const layers = $("layers");
        UC.setGroup(layers);
        layers.innerHTML = '';
        return Layer;
    };

    Layer.renderSlices = function(slices) {
        if (slices && slices.length) {
            slices.forEach(slice => Layer.renderSlice(slice));
        }
        return Layer;
    };

    Layer.renderSlice = function(slice) {
        let group = new THREE.Group();
        let render = slice.render;
        let view = slice.view;

        if (!render) return;

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

        const API = KIRI.api, UC = API.uc, UI = API.ui, DYN = UI.dyn;;

        for (const [layer, data] of Object.entries(render.layers)) {
            if (!DYN[layer]) {
                DYN[layer] = {
                    group: [],
                    toggle: UC.newBoolean(layer, (abc) => {
                        ctrl.group.forEach(mat => {
                            mat.visible = ctrl.toggle.checked;
                        });
                    })
                };
            }
            const ctrl = DYN[layer];
            ctrl.toggle.checked = true;

            const { polys, lines, faces, paths } = data;
            if (polys.length || lines.length) {
                const mat = new THREE.LineBasicMaterial({ color: data.color.line });
                const geo = new THREE.Geometry(), vert = geo.vertices;
                for (let i=0, il=polys.length; i<il; i++) {
                    addPoly(vert, polys[i]);
                }
                for (let i=0, il=lines.length; i<il; i++) {
                    const p = lines[i];
                    vert.push(new THREE.Vector3(p.x, p.y, p.z));
                }
                if (vert.length) {
                    group.add(new THREE.LineSegments(geo, mat));
                }
                ctrl.group.push(mat);
            }
            if (faces.length) {
                const mat = newMesh(data);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
                geo.computeFaceNormals();
                geo.computeVertexNormals();
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
                ctrl.group.push(mat);
            }
            if (paths.length) {
                const mat = newMesh(data);
                paths.forEach((path, i) => {
                    const { index, faces, z } = path;
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
                    geo.setIndex(index);
                    geo.computeFaceNormals();
                    geo.computeVertexNormals();
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.position.z = z;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    group.add(mesh);
                });
                ctrl.group.push(mat);
            }
        }

        slice.view.add(group);
    };

    function createStandardMesh(data) {
        return new THREE.MeshStandardMaterial({
            emissive,
            roughness,
            metalness,
            transparent: data.color.opacity != 1,
            opacity: data.color.opacity,
            color: data.color.face,
            side: THREE.DoubleSide
        });
    }

    function createPhongMesh(data) {
        return new THREE.MeshPhongMaterial({
            shininess,
            specular,
            transparent: data.color.opacity != 1,
            opacity: data.color.opacity,
            color: data.color.face,
            side: THREE.DoubleSide
        });
    }
})();
