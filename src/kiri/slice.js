/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.polygons
gapp.register("kiri.slice", [], (root, exports) => {

const { base, kiri } = root;
const { key, polygons } = base;
const { util } = base;

const POLY = base.polygons;
const NOKEY = key.NONE;

let tracker;

function setSliceTracker(nv) {
    return tracker = nv;
}

/**
 * Object encapsulates a z-slice from an object.  This code is shared by the
 * client and the worker thread.  As such, the view layers are ignored in the
 * worker code paths.
 */
class Slice {

    constructor (z, view) {
        this.z = z; // z-index
        this.index = 0; // slice index
        this.lines = null; // slice raw
        this.groups = null; // grouped lines
        this.up = null; // slice above (linked list)
        this.down = null; // slice below (linked list)
        this.tops = []; // array of Top objects
        this.view = view; // for rendering this slice
        this.finger = null; // cached fingerprint
        this.layers = null; // will replace most of the layer output data
    }

    /**
     * return Layers object for this slice. creates it if necessary.
     */
    output() {
        if (this.layers) return this.layers;
        let layers = this.layers = new kiri.Layers();
        if (tracker) {
            layers.setRotation(-tracker.rotation || 0);
        }
        return layers;
    };

    /**
     * returns a cloned slice the option of a deep clone on the top polys
     */
    clone(deep) {
        const from = this, slice = newSlice(from.z, from.view);
        from.tops?.forEach(function(top) {
            slice.addTop(top.poly.clone(deep));
        });
        return slice;
    };

    topPolys() {
        return this.tops.map(top => top.poly);
    };

    topSimples() {
        return this.tops.map(top => top.simple);
    };

    // FDM top intersect optimization
    topPolysFlat() {
        if (this.topFlatPolys) {
            return this.topFlatPolys;
        }
        return this.topFlatPolys = POLY.flatten(this.topPolys().clone(true), [], true);
    };

    // FDM retract path routing using first shell
    topRouteFlat() {
        if (this.topFlatRoutes) {
            return this.topFlatRoutes;
        }
        let topShells0 = this.tops.map(top => top.shells[0]).filter(p => p);
        return this.topFlatRoutes = POLY.flatten(topShells0.clone(true), [], true);
    }

    // CAM only
    topPolyInners() {
        return this.tops.map(top => top.poly.inner).flat().filter(poly => poly);
    };

    // FDM / SLA only
    topInners() {
        return this.tops.map(top => top.last).flat().filter(poly => poly);
    };

    // FDM / SLA only
    topFillOff() {
        return this.tops.map(top => top.fill_off).flat().filter(poly => poly);
    };

    // FDM only
    topFill() {
        return this.tops.map(top => top.fill_lines).flat().filter(poly => poly);
    };

    // FDM only
    topShells() {
        return this.tops.map(top => top.shells).flat().filter(poly => poly);
    };

    /**
     * produces a fingerprint for a slice that should be the same for
     * layers that are identical. this happens in parts with unchanging
     * vertical wall regions. this allows us to eliminate expensive diffs
     * and infill computation when we detect the layers are the same.
     */
    fingerprint() {
        if (this.finger) {
            return this.finger;
        }
        return this.finger = POLY.fingerprint(this.topPolys());
    };

    /**
     * returns true if the layers' fingerprints are the same
     */
    fingerprintSame(slice) {
        return slice ? POLY.fingerprintCompare(this.fingerprint(), slice.fingerprint()) : false;
    };

    addTops(polys) {
        polys.forEach(p => {
            this.addTop(p);
        });
        return this;
    }

    /**
     * @param {Object | Polygon} data
     * @returns Slice.Top
     */
    addTop(data) {
        if (data.length) {
            // standard legacy polygon
            let top = new Top(data);
            this.tops.push(top);
            top.simple = data;
            return top;
        } else {
            // create top object from object bundle passed back by slicePost()
            let top = new Top(data.poly);
            top.thin_fill = data.thin_fill ? data.thin_fill.map(p => base.newPoint(p.x,p.y,p.z)) : undefined;
            top.fill_lines = data.fill_lines;
            top.fill_sparse = data.fill_sparse;
            top.fill_off = data.fill_off;
            top.last = data.last;
            top.gaps = data.gaps;
            top.shells = data.shells;
            top.simple = data.simple;
            this.tops.push(top);
            return top;
        }
    };

    findClosestPointTo(target) {
        let min, find;

        if (this.tops && this.tops.length) {
            this.tops.forEach(function(top) {
                find = top.poly.findClosestPointTo(target);
                if (!min || find.distance < min.distance) {
                    min = find;
                }
            });
        } else if (this.supports) {
            this.supports.forEach(function(poly) {
                find = poly.findClosestPointTo(target);
                if (!min || find.distance < min.distance) {
                    min = find;
                }
            });
        }

        return min;
    };

    setFields(fields = {}) {
        Object.assign(this, fields);
        return this;
    }

    // xray(dash = 3) {
    //     // console.log('xray', this);
    //     this.output().setLayer(`xp`, 0x888800).addPolys(this.topPolys());
    //     this.lines.forEach((line, i) => {
    //         const group = i % dash;
    //         const color = [ 0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff ][group];
    //         this.output().setLayer(`xl-${group}`, color).addLine(line.p1, line.p2);
    //     });
    // }
}

/**
 * Represents a top-level (outer) polygon in a slice.  Slices may contain
 * multiple tops each with nested structures.  Top objects contain cached
 * and computed objects for quick access for rendering and dependent computations.
 */
class Top {

    constructor(polygon) {
        this.poly = polygon; // outline poly
    }

    clone(deep) {
        let top = new Top(this.poly.clone(deep));
        return top;
    }

    /**
     * return innermost traces under a given top. for FDM, this represents
     * the outline shell that the fill touches. used by Print, Laser
     */
    innerShells() {
        let shells = this.shells,
            array = [];
        if (shells) shells.forEach(function(p) {
            if (p.inner) array.appendAll(p.inner);
        });
        return array;
    }

    /**
     * Returns shell polygons of a given depth
     * used by Print (FDM)
     *
     * @param {Polygon[]} out array to populate
     * @returns {Polygon[]} array of top polygons
     */
    shellsAtDepth(depth) {
        return this.shells ? this.shells.filter(poly => poly.depth === depth) : [];
    }

}

function newTop(poly) {
    return new Top(poly);
}

function newSlice(z, view) {
    return new Slice(z, view);
}

gapp.overlay(kiri, {
    Top,
    Slice,
    newTop,
    newSlice,
    setSliceTracker
});

});
