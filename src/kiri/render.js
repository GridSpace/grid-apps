/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {
    const KIRI = self.kiri, BASE = self.base, POLY = BASE.polygons, newPolygon = BASE.newPolygon;

    class Render {
        constructor() {
            this.layers = {};
            this.profiles = {};
            this.stats = {
                contour: 0,
                flat_line: 0,
                flat_poly: 0,
                line_poly: 0,
                line: 0
            };
        }

        setLayer(layer, colors, off) {
            let layers = this.layers;
            if (typeof(colors) === 'number') {
                colors = {
                    line: colors,
                    face: colors,
                    opacity: 1
                };
            }
            this.current = layers[layer] = layers[layer] || {
                off: off === true,
                lines: [],
                polys: [],
                faces: [],
                paths: [],
                color: colors || {
                    line: 0,
                    face: 0,
                    opacity: 1
                },
            };
            return this;
        }

        addLine(p1, p2) {
            this.current.lines.push(p1, p2);
            return this;
        }

        addLines(lines, options) {
            if (options) {
                options.open = true;
                const polys = [];
                for (let i=0; i<lines.length-1; i += 2) {
                    polys.push(new BASE.Polygon()
                        .append(lines[i])
                        .append(lines[i+1])
                        .setOpen());
                }
                return this.addPolys(polys, options);
            }
            for (let i=0; i<lines.length-1; i += 2) {
                this.addLine(lines[i], lines[i+1]);
                this.stats.line++;
            }
            return this;
        }

        addPoly(poly, options) {
            return this.addPolys([poly], options);
        }

        addPolys(polys, options) {
            if (options && options.flat) {
                return this.addFlats(polys, options);
            }
            if (options && !options.thin) {
                return this.addPaths(polys, options);
            }
            polys = flat(polys);
            if (options) {
                polys.forEach(p => {
                    if (options.z !== undefined) p.setZ(options.z);
                    if (options.color) p.color = options.color;
                });
                // if (options.color) console.log({polys, options})
            }
            this.current.polys.appendAll(polys);
            this.stats.line_poly += polys.length;
            return this;
        }

        // z planar closed polygonal areas
        addAreas(polys, options) {
            const faces = this.current.faces;
            polys = Array.isArray(polys) ? polys : [ polys ];
            polys.forEach(poly => {
                poly.earcut().forEach(ep => {
                    ep.forEachPoint(p => { faces.push(p.x, p.y, p.z) });
                });
            });
            if (options && options.outline) {
                this.addPolys(polys.clone(true));
            }
        }

        // misleading name. these are flat offset paths (old style rendering)
        addFlats(polys, options) {
            const opts = options || {};
            const offset = opts.offset || 1;
            polys = flat(polys);
            if (!polys.length) {
                return;
            }
            const z = polys[0].getZ(), faces = this.current.faces;
            const open = opts.open || false;
            const off_opt = {
                z,
                flat: true,
                type: open ? ClipperLib.EndType.etOpenSquare : undefined,
            };
            polys.forEach(poly => {
                let exp = off_opt.outs = [];
                if (open) {
                    exp.appendAll(POLY.expand_lines(poly, offset * 0.9, z));
                    this.stats.flat_line = 0;
                } else if (offset) {
                    POLY.offset([poly],  offset * 0.9, off_opt);
                    POLY.offset([poly], -offset * 0.9, off_opt);
                    this.stats.flat_poly = 0;
                }
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
            const height = opts.height || 1;
            const offset = opts.offset || 1;
            polys = flat(polys);
            if (!polys.length) {
                return;
            }

            const profiles = this.profiles;
            const prokey = `${offset}x${height}`;
            if (!profiles[prokey]) {
                const profile = new THREE.Shape();
                profile.moveTo(-offset, -height);
                profile.lineTo(-offset,  height);
                profile.lineTo( offset,  height);
                profile.lineTo( offset, -height);
                profiles[prokey] = profile;
            }
            const profile = profiles[prokey].clone();

            polys.forEach(poly => {
                const contour = [];
                poly = poly.clean().miter();
                // if (poly.debug) {
                //     const save = this.current;
                //     this.setLayer('debug.acute', 0xff0000).addPoly(poly, {thin:true});
                //     this.setLayer('debug.start', 0x00ff00).addPoly(newPolygon().centerRectangle(poly.first(),1,1), {thin:true});
                //     this.setLayer('debug.end', 0x0000ff).addPoly(newPolygon().centerRectangle(poly.last(),0.8,0.8), {thin:true});
                //     this.current = save;
                // }
                poly.points.forEach(p => {
                    contour.push(new THREE.Vector2(p.x, p.y));
                });
                const {index, faces} = ProfiledContourGeometry(profile, contour, poly.isClosed());
                const cur = this.current;
                const one = cur.paths[0];
                if (one) {
                    // merge all contour geometry for massive speed gain
                    const add = one.faces.length / 3;
                    for (let i=0; i<index.length; i++) {
                        index[i] += add;
                    }
                    const feces = new Float32Array(one.faces.length + faces.length);
                    const indln = one.index.length;
                    feces.set(one.faces);
                    feces.set(faces, one.faces.length);
                    one.faces = feces;
                    one.index.appendAll(index);
                    // allow changing colors
                    if (opts.color) {
                        if (!cur.cpath) {
                            cur.cpath = [ Object.assign({ start: 0, count: indln - 1 }, cur.color) ];
                        }
                        // rewrite last color count if color or opacity have changed
                        const pc = cur.cpath[cur.cpath.length - 1];
                        if (pc.face !== opts.color.face || pc.opacity !== opts.color.opacity) {
                            pc.count = indln - 1;
                            cur.cpath.push(Object.assign({ start: indln, count: Infinity }, opts.color));
                        }
                    }
                } else {
                    cur.paths.push({ index, faces, z: poly.getZ() });
                    if (opts.color) {
                        cur.cpath = [ Object.assign({ start: 0, count: Infinity }, opts.color) ];
                    }
                }
                this.stats.contour++;
            });
            return this;
        }
    }

    function flat(polys) {
        if (Array.isArray(polys)) {
            return POLY.flatten(polys.clone(true), [], true);
        } else {
            return POLY.flatten([polys.clone(true)], [], true);
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
