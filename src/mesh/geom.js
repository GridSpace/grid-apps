/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: moto.license
// dep: add.array
// dep: add.three
gapp.register("mesh.geom", [], (root, exports) => {

const { Matrix4, Matrix3, Vector3, Box3 } = THREE;

// geometry helper functions
const geom = exports({

    // given a closed polyline as an expanded point array
    // return enclosed area with sign indicating winding order
    areaSigned(points, axes = 3) {
        let area = 0;
        let len = points.length;
        for (let p1, p2, pi = 0; pi < len; ) {
            p1 = points.slice(pi, pi + axes);
            pi += axes;
            p2 = pi < len - axes ?
                points.slice(pi, pi + axes) :
                points.slice(0, axes);
            area += (p2[0] - p1[0]) * (p2[1] + p1[1]);
        }
        return area / 2;
    },

    // returns an unsigned area generally more useful for comparison
    area(points) {
        return Math.abs(geom.areaSigned(points));
    },

    // given an expanded point array, return bounds
    bounds(points, axes = 3) {
        let box = new Box3();
        let p3 = new Vector3();
        for (let p, pi = 0, len = points.length; pi < len; pi += axes) {
            box.expandByPoint(p3.fromArray(points, pi));
        }
        return box;
    },

    // given two nest loop records, determine if
    // inner is completely inside outer without overlap
    isInside(outer, inner) {
        return outer.bounds.containsBox(inner.bounds);
    },

    // given an array of closed polyline arrays, determine parentage
    nest(loops) {
        // create record per loop
        let recs = loops.map(points => {
            return {
                points,
                area: 0,
                depth: 0,
                inner: [],
                bounds: geom.bounds(points)
            }
        });

        // sort loops by area ascending and cache loop area
        recs = recs.sort((a,b) => {
            a.area = a.area || geom.areaSigned(a.points);
            b.area = b.area || geom.areaSigned(b.points);
            return Math.abs(a.area) - Math.abs(b.area);
        });

        // deep nesting
        let count = recs.length;
        outer: for (let i = 0; i < count - 1; i++) {
            let child = recs[i];
            for (let j = i + 1; j < count; j++) {
                let parent = recs[j];
                if (geom.isInside(parent, child)) {
                    child.parent = parent;
                    parent.inner.push(child);
                    break outer;
                }
            }
        }

        // calculate inner depth (steps from topmost)
        // let inners = recs.filter(r => r.parent);
        for (let rec of recs) {
            for (let p = rec.parent, d = 0; p ; p = p.parent) {
                rec.depth++;
            }
        }

        return recs;
    }
});

});
