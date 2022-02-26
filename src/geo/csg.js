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
            for (let p of [ ...arguments ].map(a => a.polygons.map(p => p.vertices))) {
                console.log(JSON.stringify(p));
            }
        }
        return jscadModeling.booleans.union(...arguments);
    },

    subtract() {
        return jscadModeling.booleans.subtract(...arguments);
    },

    intersect() {
        return jscadModeling.booleans.intersect(...arguments);
    },

    toPositionArray(geom) {
        return geom.polygons
            .map(p => p.vertices.flat())
            .map(a => base.util.triangulate(a, undefined, 3))
            .flat().toFloat32();
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
