/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {
    const KIRI = self.kiri, BASE = self.base, POLY = BASE.polygons;

    class Render {
        constructor() {
            this.layers = {};
        }

        setLayer(layer, colors) {
            let layers = this.layers;
            if (typeof(colors) === 'number') {
                colors = {
                    line: color,
                    face: color
                };
            }
            this.current = layers[layer] = layers[layer] || {
                lines: [],
                polys: [],
                faces: [],
                paths: [],
                color: colors || {
                    line: 0,
                    face: 0
                }
            };
            return this;
        }

        addLine(p1, p2) {
            this.current.lines.push(p1, p2);
            return this;
        }

        addPoly(poly) {
            this.current.polys.push(poly);
            return this;
        }

        addPolys(polys) {
            polys = flat(polys);
            for (let i=0; i<polys.length; i++) {
                this.addPoly(polys[i]);
            }
            return this;
        }

        addFlats(polys, options) {
            const opts = options || {};
            const offset = opts.offset || 1;
            polys = flat(polys);
            if (!polys.length) {
                return;
            }
            const z = polys[0].getZ(), faces = this.current.faces;
            polys.forEach(poly => {
                let exp = [];
                POLY.offset([poly],  offset/2, { z, outs: exp, flat: true });
                POLY.offset([poly], -offset/2, { z, outs: exp, flat: true });
                if (opts.outline) {
                    this.addPolys(exp.clone());
                }
                POLY.nest(exp).forEach((poly,i) => {
                    poly.earcut().forEach(ep => {
                        ep.forEachPoint(p => { faces.push(p.x, p.y, p.z) });
                    });
                });
            });
            return this;
        }

        addPaths(polys, options) {
            const opts = options || {};
            const offset = opts.offset || 1;
            polys = flat(polys);
            if (!polys.length) {
                return;
            }

            const profile = new THREE.Shape();
            profile.moveTo(-offset, -offset);
            profile.lineTo(-offset,  offset);
            profile.lineTo( offset,  offset);
            profile.lineTo( offset, -offset);

            polys.forEach(poly => {
                const contour = [];
                poly.points.forEach(p => {
                    contour.push(new THREE.Vector2(p.x, p.y));
                });
                const {index, faces} = ProfiledContourGeometry(profile, contour, true);
                this.current.paths.push({ index, faces, z: poly.getZ() });
            });
            return this;
        }
    }

    function flat(polys) {
        if (Array.isArray(polys)) {
            return POLY.flatten(polys, [], true);
        } else {
            return POLY.flatten([polys], [], true);
        }
    }

    function ProfiledContourGeometry(profileShape, contour, contourClosed) {

        contourClosed = contourClosed !== undefined ? contourClosed : true;

        let profileGeometry = new THREE.ShapeBufferGeometry(profileShape);
        profileGeometry.rotateX(Math.PI * .5);

        let profile = profileGeometry.attributes.position;
        let faces = new Float32Array(profile.count * contour.length * 3);

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

            faces.set(cloneProfile.array, cloneProfile.count * i * 3);
        }

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

        return {index, faces};
    }

    self.kiri.Render = Render;
})();
