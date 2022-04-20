/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// dep: geo.base
// jscad dep injected in app so it comes before everything else
gapp.register("geo.csg", [], (root, exports) => {

const { base } = root;
const debug = false;

const CSG = {

    union() {
        if (debug) {
            console.log(JSON.stringify([ ...arguments ]));
        }
        let union = jscadModeling.booleans.union(...arguments);
        if (debug) {
            console.log(JSON.stringify(union));
        }
        return union;
    },

    subtract() {
        return jscadModeling.booleans.subtract(...arguments);
    },

    intersect() {
        return jscadModeling.booleans.intersect(...arguments);
    },

    toPositionArray(geom) {
        if (!geom || geom.length === 0) {
            return [].toFloat32();
        }
        const out = [];
        const poly = jscadModeling.geometries.geom3
            .toPolygons(geom)
            .map(p => p.vertices);
        for (let p of poly) {
            let p0 = p[0];
            for (let i = 0; i<p.length - 2; i++) {
                out.push(p0, p[i+1], p[i+2]);
            }
        }
        return out.flat().toFloat32();
        // return geom.polygons
        //     .map(p => p.vertices.flat())
        //     .map(a => base.util.triangulate(a, undefined, 3))
        //     .flat().toFloat32();
    },

    // Construct a CSG from a THREE Geometry BufferAttribute array (or similar)
    fromPositionArray(array) {
        const polys = [];
        if (debug) {
            array = [...array].map(v => v.round(3));
        }
        for (let i=0, l=array.length; i<l; ) {
            polys.push([ [
                array[i++],
                array[i++],
                array[i++],
            ],[
                array[i++],
                array[i++],
                array[i++],
            ],[
                array[i++],
                array[i++],
                array[i++],
            ] ]);
        }
        return jscadModeling.geometries.geom3.fromPoints(polys);
    }

};

gapp.overlay(base, {
    CSG
});

});
