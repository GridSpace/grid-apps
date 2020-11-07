/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        CAM = KIRI.driver.CAM,
        PRO = CAM.process;

    CAM.init = function(kiri, api) {
        api.event.on("mode.set", (mode) => {
            let isCAM = mode === 'CAM';
            $('set-tools').style.display = isCAM ? '' : 'none';
            kiri.space.platform.setColor(isCAM ? 0xeeeeee : 0xcccccc);
        });
        api.event.on("settings.saved", (settings) => {
            let proc = settings.process;
            api.ui.camTabs.marker.style.display = proc.camTabsOn ? 'flex' : 'none';
            api.ui.camRough.marker.style.display = proc.camRoughOn ? 'flex' : 'none';
            api.ui.camDrill.marker.style.display =
                proc.camDrillingOn || proc.camDrillReg !== 'none' ? 'flex' : 'none';
            api.ui.camOutline.marker.style.display = proc.camOutlineOn ? 'flex' : 'none';
            api.ui.camContour.marker.style.display =
                proc.camContourXOn || proc.camContourYOn ? 'flex' : 'none';
        });
    }

    CAM.renderSlice = function(slice) {
        let group = new THREE.Group();
        let render = slice.render;
        let view = slice.view;

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

        for (const [layer, data] of Object.entries(render.layers)) {
            const { polys, lines, faces } = data;
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
            }
            if (faces.length) {
                const mat = new THREE.MeshPhongMaterial({
                    transparent: true,
                    shininess: 100,
                    specular: 0x181818,
                    opacity: 1,
                    color: data.color.face,
                    side: THREE.DoubleSide
                });
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(faces, 3));
                geo.computeFaceNormals();
                geo.computeVertexNormals();
                const mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
            }
        }

        slice.view.add(group);
    };

    CAM.sliceRender = function(widget) {
        let slices = widget.slices;
        if (!slices) return;

        slices.forEach(function(slice) {
            if (slice.render) return CAM.renderSlice(slice);

            let tops = slice.tops,
                layers = slice.layers,
                outline = layers.outline,
                open = (slice.camMode === PRO.CONTOUR_X || slice.camMode === PRO.CONTOUR_Y);

            layers.outline.clear(); // slice raw edges
            layers.trace.clear();   // roughing
            layers.solid.clear();   // outline
            layers.bridge.clear();  // outline x
            layers.flat.clear();    // outline y
            layers.fill.clear();    // facing

            tops.forEach(function(top) {
                outline.poly(top.poly, 0x999900, true, open);
                // if (top.inner) outline.poly(top.inner, 0xdddddd, true);
                if (top.inner) outline.poly(top.inner, 0xff0000, true);
            });

            // various outlining
            let layer;
            slice.tops.forEach(function(top) {
                switch (slice.camMode) {
                    case PRO.OUTLINE:
                        layer = layers.solid;
                        break;
                    case PRO.CONTOUR_X:
                        layer = layers.bridge;
                        break;
                    case PRO.CONTOUR_Y:
                        layer = layers.flat;
                        break;
                    default: // roughing
                        layer = layers.trace;
                        break;
                }
                if (top.traces) {
                    layer.poly(top.traces, 0x010101, true, null);
                }
            });

            // facing (previously separate. now part of roughing)
            layer = slice.layers.fill;
            slice.tops.forEach(function(top) {
                if (top.fill_lines) {
                    layer.lines(top.fill_lines, fill_color);
                }
            });

            outline.render();
            layers.trace.render();
            layers.solid.render();
            layers.bridge.render();
            layers.flat.render();
            layers.fill.render();
        });
    }

    CAM.printRender = function(print) {
        return KIRI.driver.FDM.printRender(print, {
            aslines: true,
            color: 0x010101,
            move_color: 0xcc3333
        });
    }

})();
