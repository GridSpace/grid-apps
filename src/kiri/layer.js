/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.Layer) return;

    const KIRI = self.kiri,
        POLY = self.base.polygons,
        LP = Layer.prototype,
        mcache = {};

    KIRI.Layer = Layer;
    KIRI.newLayer = function(view) { return new Layer(view) };

    // from https://jsfiddle.net/qcm6g290/22/
    // https://discourse.threejs.org/t/simple-rectangular-geometry-extrusion-anyone/743/6
    function ProfiledContourGeometry(profileShape, contour, contourClosed) {

        contourClosed = contourClosed !== undefined ? contourClosed : true;

        let profileGeometry = new THREE.ShapeBufferGeometry(profileShape);
        profileGeometry.rotateX(Math.PI * .5);

        let profile = profileGeometry.attributes.position;
        let profilePoints = new Float32Array(profile.count * contour.length * 3);

        for (let i = 0; i < contour.length; i++) {
            let v1 = new THREE.Vector2().subVectors(contour[i - 1 < 0 ? contour.length - 1 : i - 1], contour[i]);
            let v2 = new THREE.Vector2().subVectors(contour[i + 1 == contour.length ? 0 : i + 1], contour[i]);
            let angle = v2.angle() - v1.angle();
            let halfAngle = angle * .5;
            let hA = halfAngle;
            let tA = v2.angle() + Math.PI * .5;

            if (!contourClosed){
                if (i == 0 || i == contour.length - 1) {hA = Math.PI * .5;}
                if (i == contour.length - 1) {tA = v1.angle() - Math.PI * .5;}
            }

            let shift = Math.tan(hA - Math.PI * .5);
            let shiftMatrix = new THREE.Matrix4().set(
                1, 0, 0, 0,
                -shift, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            );

            let tempAngle = tA;
            let rotationMatrix = new THREE.Matrix4().set(
                Math.cos(tempAngle), -Math.sin(tempAngle), 0, 0,
                Math.sin(tempAngle), Math.cos(tempAngle), 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1
            );

            let translationMatrix = new THREE.Matrix4().set(
                1, 0, 0, contour[i].x,
                0, 1, 0, contour[i].y,
                0, 0, 1, 0,
                0, 0, 0, 1,
            );

            let cloneProfile = profile.clone();
            cloneProfile.applyMatrix4(shiftMatrix);
            cloneProfile.applyMatrix4(rotationMatrix);
            cloneProfile.applyMatrix4(translationMatrix);

            profilePoints.set(cloneProfile.array, cloneProfile.count * i * 3);
        }

        let fullProfileGeometry = new THREE.BufferGeometry();
        fullProfileGeometry.setAttribute("position", new THREE.BufferAttribute(profilePoints, 3));

        let index = [];
        let lastCorner = contourClosed == false ? contour.length - 1: contour.length;

        for (let i = 0; i < lastCorner; i++) {
            for (let j = 0; j < profile.count; j++) {
                let currCorner = i;
                let nextCorner = i + 1 == contour.length ? 0 : i + 1;
                let currPoint = j;
                let nextPoint = j + 1 == profile.count ? 0 : j + 1;

                let a = nextPoint + profile.count * currCorner;
                let b = currPoint + profile.count * currCorner;
                let c = currPoint + profile.count * nextCorner;
                let d = nextPoint + profile.count * nextCorner;

                index.push(a, b, d);
                index.push(b, c, d);
            }
        }

        fullProfileGeometry.setIndex(index);
        fullProfileGeometry.computeVertexNormals();

        return fullProfileGeometry;
    }

    function materialFor(layer, color, mesh, linewidth) {
        let m = mcache[color];
        if (!m) {
            m = mcache[color] = mesh ? new THREE.MeshPhongMaterial({
                transparent: layer.transparent,
                shininess: layer.shininess,
                specular: layer.specular,
                opacity: layer.opacity,
                color: color,
                side: THREE.DoubleSide
            }) : new THREE.LineBasicMaterial({
                fog: false,
                color: color,
                linewidth: 1
            });
        }
        return m;
    }

    function toVector(p) {
        return new THREE.Vector3(p.x, p.y, p.z);
    }

    function addPoly(arr, poly, deep, open) {
        let points = poly.points,
            len = points.length;

        if (len < 2) return;

        let doOpen = (open === undefined || open === null) ? poly.isOpen() : open,
            end = doOpen ? len - 1 : len,
            last = toVector(points[0]),
            i = 0;

        while (i < end) {
            arr.push(last);
            arr.push(last = toVector(points[(++i) % len]));
        }

        if (deep && poly.inner) {
            poly.inner.forEach(function(p) {
                addPoly(arr, p, false, open);
            })
        }
    }

    function addSolid(arr, poly) {
        let faces = poly.earcut();
        faces.forEach(p => {
            p.forEachPoint(p => {
                arr.push(p.x, p.y, p.z);
            });
        });
    }

    /**
     * @param {THREE.Group} view
     */
    function Layer(view) {
        this.changed = false;
        this.group = null;
        this.solids = null;
        this.view = view;
        this.bycolor = {};
        this.opacity = 0.15,
        this.specular = 0x181818;
        this.shininess = 100;
        this.transparent = true;
    };

    LP.setOpacity = function(v) {
        this.opacity = v;
        return this;
    };

    LP.setSpecular = function(v) {
        this.specular = v;
        return this;
    };

    LP.setShininess = function(v) {
        this.shininess = v;
        return this;
    };

    LP.setTransparent = function(b) {
        this.transparent = b;
        return this;
    };

    LP.setVisible = function(vis) {
        if (this.group) this.group.visible = vis;
        if (this.solids) this.solids.visible = vis;
        return this;
    };

    LP.clear = function() {
        this.changed = true;
        this.bycolor = {};
    };

    LP.add = function(color, obj) {
        let ca = this.bycolor[color];
        if (!ca) ca = this.bycolor[color] = [];
        ca.push(obj);
        return this;
    };

    LP.poly = function(poly, color, deep, open) {
        let layer = this;
        if (Array.isArray(poly)) {
            poly.forEach(function(p) { layer.poly(p, color, deep, open) });
        } else {
            this.add(color, {poly:poly, deep:deep, open:open});
            this.changed = true;
        }
        return this;
    };

    LP.solid = function(poly, color) {
        this.add(color, {solid: poly});
        this.changed = true;
        return this;
    };

    LP.noodle = function(poly, offset, color, traceColor, open) {
        if (!poly) return;

        // if (!Array.isArray(poly)) {
        //     poly = [ poly ];
        // }
        // poly.forEach(p => {
        //     this.add(color, {path: p, offset});
        // });
        // return;

        if (Array.isArray(poly)) {
            poly = POLY.flatten(poly, [], true);
        } else {
            poly = POLY.flatten([poly], [], true);
        }
        if (!poly.length) return;
        let z = poly[0].getZ();
        poly.forEach(p => {
            let exp = [];
            POLY.expand([p],  offset, z-0.01, exp, 1);
            POLY.expand([p], -offset, z-0.01, exp, 1);
            POLY.nest(exp).forEach((p,i) => {
                this.add(color, {solid: p});
                this.add(traceColor, {poly: p.clone(true).setZ(z + 0.01), deep: true, open});
            });
        })
        this.changed = true;
        return this;
    };

    LP.noodle_open = function(poly, offset, color, traceColor, z) {
        poly = POLY.expand_lines(poly, offset, z);
        poly.forEach(p => {
            this.add(color, {solid: p});
            this.add(traceColor, {poly: p.clone().setZ(z + 0.01), deep: false, open: false});
        })
        this.changed = true;
        return this;
    };

    LP.noodle_lines = function(points, offset, color, traceColor, z) {
        if (!(points && points.length)) return;
        for (let i=0; i<points.length; i += 2) {
            let p1 = points[i];
            let p2 = points[i+1];
            let l1 = p1.offsetLineTo(p2, offset);
            let l2 = p2.offsetLineTo(p1, offset);
            let poly = base.newPolygon().addPoints([
                l1.p1, l1.p2, l2.p1, l2.p2
            ]);
            this.add(color, {solid: poly});
            this.add(traceColor, {poly: poly.clone().setZ(z + 0.01), deep: false, open: false});
        }
        this.changed = true;
        return this;
    };

    LP.points = function(points, color, size, opacity) {
        let layer = this,
            sz = size/2;
        points.forEach(function(p) {
            layer.lines([
                toVector({x:p.x+sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z+sz}),

                toVector({x:p.x+sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z-sz}),

                toVector({x:p.x+sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z-sz}),
            ], color);
        });
        return this;
    };

    LP.lines = function(points, color) {
        this.add(color, {lines:points});
        this.changed = true;
        return this;
    };

    LP.renderAll = function() {
        this.renderSolid();
        this.render();
    };

    LP.renderSolid = function() {
        if (!(this.view)) return;
        if (this.solids) this.view.remove(this.solids);
        this.solids = this.view.newGroup();

        let bycolor = this.bycolor;

        for (let key in bycolor) {
            if (!bycolor.hasOwnProperty(key)) continue;

            let sarr = [], mat = materialFor(this, parseInt(key), true);
            let parr = [];

            bycolor[key].forEach(function(obj) {
                if (obj.solid) {
                    addSolid(sarr, obj.solid);
                }
                if (obj.path) {
                    parr.append(obj);
                }
            });

            if (parr.length > 0) {
                parr.forEach(obj => {
                    let poly = obj.path;
                    let offx = obj.offset;
                    let offy = 0.1;

                    let profile = new THREE.Shape();
                    profile.moveTo(-offx, -offy);
                    profile.lineTo(-offx,  offy);
                    profile.lineTo( offx,  offy);
                    profile.lineTo( offx, -offy);

                    let contour = [];
                    poly.points.forEach(p => {
                        contour.push(new THREE.Vector2(p.x, p.y));
                    });
                    // contour.push(contour[0]);

                    let geo = ProfiledContourGeometry(profile, contour, true);
                    let mesh = new THREE.Mesh(geo, mat);
                    mesh.position.z = poly.points[0].z;
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    this.solids.add(mesh);
                });
            }

            if (sarr.length > 0) {
                let geo = new THREE.BufferGeometry();

                geo.setAttribute('position', new THREE.BufferAttribute(sarr.toFloat32(), 3));
                geo.computeFaceNormals();
                geo.computeVertexNormals();

                let mesh = new THREE.Mesh(geo, mat);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.solids.add(mesh);
            }
        }
    };

    LP.render = function() {
        if (!(this.view && this.changed)) return;
        if (this.group) this.view.remove(this.group);
        this.group = this.view.newGroup();

        let bycolor = this.bycolor,
            key, added;

        for (key in bycolor) {
            if (!bycolor.hasOwnProperty(key)) continue;

            let geo = new THREE.Geometry(),
                arr = geo.vertices,
                mat = materialFor(this, parseInt(key));

            added = bycolor[key];

            added.forEach(function(obj) {
                if (obj.poly) {
                    addPoly(arr, obj.poly, obj.deep, obj.open);
                } else if (obj.lines) {
                    obj.lines.forEach(function(p) {
                        arr.push(toVector(p));
                    });
                }
            });

            if (arr.length > 0) this.group.add(new THREE.LineSegments(geo, mat));
        }

        this.changed = false;
    }

})();
