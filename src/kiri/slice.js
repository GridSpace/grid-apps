/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.kiri.Slice) return;

    const KIRI = self.kiri,
        PRO = Slice.prototype,
        BASE = self.base,
        UTIL = BASE.util,
        POLY = BASE.polygons,
        NOKEY = BASE.key.NONE;

    KIRI.Top = Top;
    KIRI.newTop = newTop;
    KIRI.Slice = Slice;
    KIRI.newSlice = newSlice;

    /**
     * Object encapsulates a z-slice from an object.  This code is shared by the
     * client and the worker thread.  As such, the view layers are ignored in the
     * worker code paths.
     *
     * @param {number} z offset from ground
     * @param {THREE.Group} [view] optional view parent object for layers
     * @constructor
     */
    function Slice(z, view) {
        this.z = z; // z-index
        this.index = 0; // slice index
        this.lines = null; // slice raw
        this.groups = null; // grouped lines
        this.up = null; // slice above (linked list)
        this.down = null; // slice below (linked list)
        this.tops = []; // array of Top objects
        this.view = view; // for rendering this slice
        this.finger = null; // cached fingerprint
        this.render = null; // will replace most of the layer output data
    }

    /**
     * Represents a top-level (outer) polygon in a slice.  Slices may contain
     * multiple tops each with nested structures.  Top objects contain cached
     * and computed objects for quick access for rendering and dependent computations.
     *
     * @param {Polygon} polygon
     * @constructor
     */
    function Top(polygon) {
        this.poly = polygon; // outline poly
    }

    Top.prototype.clone = function(deep) {
        let top = new Top(this.poly.clone(deep));
        return top;
    };

    /**
     * return innermost traces under a given top. for FDM, this represents
     * the outline shell that the fill touches. used by Print, Laser
     */
    Top.prototype.innerTraces = function() {
        let traces = this.traces,
            array = [];
        if (traces) traces.forEach(function(p) {
            if (p.inner) array.appendAll(p.inner);
        });
        return array;
    };

    /**
     * Appends all outermost trace polygons into a given array
     * and returns it. used by Print
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    Top.prototype.gatherOuter = function(out) {
        this.traces.forEach(function(trace) {
            if (trace.depth === 0) out.append(trace);
        });
        return out;
    };

    /** ******************************************************************
     * Slice Prototype Functions
     ******************************************************************* */

    /**
     * return Render object for this slice. creates it if necessary.
     */
    PRO.output = function() {
        if (this.render) return this.render;
        return this.render = new KIRI.Render();
    };

    /**
     * returns a cloned slice the option of a deep clone on the top polys
     */
    PRO.clone = function(deep) {
        const from = this, slice = newSlice(from.z, from.view);
        from.tops.forEach(function(top) {
            slice.addTop(top.poly.clone(deep));
        });
        return slice;
    };

    PRO.topPolys = function() {
        return this.tops.map(top => top.poly);
    };

    // CAM only
    PRO.topPolyInners = function() {
        return this.tops.map(top => top.poly.inner).flat().filter(poly => poly);
    };

    // FDM / SLA only
    PRO.topInners = function() {
        return this.tops.map(top => top.last).flat().filter(poly => poly);
    };

    // FDM / SLA only
    PRO.topFillOff = function() {
        return this.tops.map(top => top.fill_off).flat().filter(poly => poly);
    };

    // FDM only
    PRO.topFill = function() {
        return this.tops.map(top => top.fill_lines).flat().filter(poly => poly);
    };

    // FDM only
    PRO.topShells = function() {
        return this.tops.map(top => top.shells).flat().filter(poly => poly);
    };

    /**
     * produces a fingerprint for a slice that should be the same for
     * layers that are identical. this happens in parts with unchanging
     * vertical wall regions. this allows us to eliminate expensive diffs
     * and infill computation when we detect the layers are the same.
     */
    PRO.fingerprint = function() {
        if (this.finger) {
            return this.finger;
        }
        return this.finger = POLY.fingerprint(this.topPolys());
    };

    /**
     * returns true if the layers' fingerprints are the same
     */
    PRO.fingerprintSame = function(slice) {
        return slice ? POLY.fingerprintCompare(this.fingerprint(), slice.fingerprint()) : false;
    };

    /**
     * Add a polygon to a slice creating a new top when necessary.
     *
     * @param {Polygon} poly to merge into a top
     */
    // PRO.mergeTop = function(poly) {
    //     let slice = this,
    //         tops = slice.tops,
    //         union, i;
    //     for (i=0; i<tops.length; i++) {
    //         if (union = poly.union(tops[i].poly)) {
    //             tops[i].poly = union;
    //             return tops[i];
    //         }
    //     }
    //     return slice.addTop(poly);
    // };

    PRO.addTops = function(polys) {
        polys.forEach(p => {
            this.addTop(p);
        });
        return this;
    }

    /**
     * Create a new top object given a polygon
     *
     * @param {Polygon} poly to add
     */
    PRO.addTop = function(poly) {
        let top = new Top(poly);
        this.tops.push(top);
        return top;
    };

    /**
     * Returns all top polygons as an array
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    // PRO.gatherTopPolys = function(out) {
    //     this.tops.forEach(function(top) {
    //         out.push(top.poly);
    //     });
    //     return out;
    // };

    /**
     * Appends all inner trace inner polygons (holes)
     * into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    // PRO.gatherTopPolyInners = function(out) {
    //     this.tops.forEach(function(top) {
    //         if (top.poly.inner) out.appendAll(top.poly.inner);
    //     });
    //     return out;
    // };

    /**
     * Appends all trace polygons into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    // PRO.gatherTraces = function(out) {
    //     this.tops.forEach(function(top) {
    //         out.appendAll(top.traces);
    //     });
    //     return out;
    // };

    /**
     * Appends all innermost trace polygons into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    // PRO.gatherInner = function(out) {
    //     this.tops.forEach(function(top) {
    //         out.appendAll(top.inner);
    //     });
    //     return out;
    // };

    /**
     * Appends all solid area polygons into a given array and returns it
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    // PRO.gatherSolids = function(out) {
    //     this.tops.forEach(function(top) {
    //         out.appendAll(top.solids);
    //     });
    //     return out;
    // };

    /**
     * return all fill lines. includes points for solid layers,
     * solid polygon regions and support line polygons.
     *
     * @param {Point[]} [lines] array to append to
     */
    // PRO.gatherFillLines = function(lines) {
    //     this.tops.forEach(function(top) {
    //         if (top.fill_lines) lines.appendAll(top.fill_lines);
    //     });
    //     return lines;
    // };

    function newTop(poly) {
        return new Top(poly);
    }

    /**
     * @param {number} z
     * @param {THREE.Group} view
     * @returns {Slice}
     */
    function newSlice(z, view) {
        return new Slice(z, view);
    }

})();
