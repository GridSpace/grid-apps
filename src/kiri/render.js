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
            // const lines = this.current.lines;
            // const points = poly.points;
            // const len = points.length;
            // for (let i=1; i<len; i++) {
            //     lines.push(points[i-1], points[i]);
            // }
            // if (!poly.open) {
            //     lines.push(points[len - 1], points[0]);
            // }
            return this;
        }

        addPolys(arr) {
            for (let i=0; i<arr.length; i++) {
                this.addPoly(arr[i]);
            }
            return this;
        }

        addFlat(polys, options) {
            let opts = options || {};
            let offset = opts.offset || 1;
            if (Array.isArray(polys)) {
                polys = POLY.flatten(polys, [], true);
            } else {
                polys = POLY.flatten([polys], [], true);
            }
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
        }
    }

    self.kiri.Render = Render;
})();
