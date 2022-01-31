// ## License
//
// Copyright (c) 2011 Evan Wallace (http://madebyevan.com/), under the MIT license.
// Modified for GridApps by Stewart Allen (sa@grid.space)

(function() {

// dep: geo.base
let base = self.base;
if (base.CSG) return;

base.CSG = {

    union() {
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
        let polys = [];
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

})();
