/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {
    class Render {
        constructor() {
            this.layers = {};
        }

        setLayer(layer, color) {
            let layers = this.layers;
            this.current = layers[layer] = layers[layer] || {
                lines: [],
                polys: [],
                faces: [],
                color: color || 0
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
    }

    self.kiri.Render = Render;
})();
