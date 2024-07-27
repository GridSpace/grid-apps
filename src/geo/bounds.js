/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// dep: geo.base
gapp.register("geo.bounds", [], (root, exports) => {

const { base } = root;
const { config, util } = base;

class Bounds {
    constructor() {
        this.minx = 10e7;
        this.miny = 10e7;
        this.maxx = -10e7;
        this.maxy = -10e7;
    }

    set(minx, maxx, miny, maxy) {
        this.minx = minx;
        this.miny = miny;
        this.maxx = maxx;
        this.maxy = maxy;
        return this;
    }

    clone() {
        let b = new Bounds();
        b.minx = this.minx;
        b.miny = this.miny;
        b.maxx = this.maxx;
        b.maxy = this.maxy;
        b.maxy = this.maxy;
        return b;
    }

    equals(bounds, margin) {
        if (!margin) margin = config.precision_offset;
        return util.isCloseTo(this.minx, bounds.minx, margin) &&
            util.isCloseTo(this.miny, bounds.miny, margin) &&
            util.isCloseTo(this.maxx, bounds.maxx, margin) &&
            util.isCloseTo(this.maxy, bounds.maxy, margin);
    }

    /**
     * @returns {Number} absolute delta in x,y coordinate space
     */
    delta(bounds) {
        return 0 +
            Math.abs(this.minx - bounds.minx) +
            Math.abs(this.miny - bounds.miny) +
            Math.abs(this.maxx - bounds.maxx) +
            Math.abs(this.maxy - bounds.maxy);
    }

    /**
     * @param {Bounds} b
     */
    merge(b) {
        this.minx = Math.min(this.minx, b.minx);
        this.maxx = Math.max(this.maxx, b.maxx);
        this.miny = Math.min(this.miny, b.miny);
        this.maxy = Math.max(this.maxy, b.maxy);
        return this;
    }

    /**
     * @param {Point} p
     */
    update(p) {
        this.minx = Math.min(this.minx, p.x);
        this.maxx = Math.max(this.maxx, p.x);
        this.miny = Math.min(this.miny, p.y);
        this.maxy = Math.max(this.maxy, p.y);
        return this;
    }

    contains(bounds) {
        return bounds.isNested(this);
    }

    containsXY(x, y) {
        return x >= this.minx && x <= this.maxx && y >= this.miny && y <= this.maxy;
    }

    containsOffsetXY(x, y, offset) {
        return x >= this.minx - offset && x <= this.maxx + offset && y >= this.miny - offset && y <= this.maxy + offset;
    }

    /**
     * @param {Bounds} parent
     * @returns {boolean} true if fully inside parent bounds
     */
    isNested(parent, precision = config.precision_bounds) {
        return (
            this.minx >= parent.minx - precision && // min-x
            this.maxx <= parent.maxx + precision && // max-x
            this.miny >= parent.miny - precision && // min-y
            this.maxy <= parent.maxy + precision // max-y
        );
    }

    /**
     * @param {Bounds} b
     * @param {number} precision
     * @returns {boolean}
     */
    overlaps(b, precision = config.precision_bounds) {
        return (
            Math.abs(this.centerx() - b.centerx()) * 2 - precision < this.width() + b.width() &&
            Math.abs(this.centery() - b.centery()) * 2 - precision < this.height() + b.height()
        );
    }

    width() {
        return this.maxx - this.minx;
    }

    height() {
        return this.maxy - this.miny;
    }

    center(z = 0) {
        return base.newPoint(this.centerx(), this.centery(), z);
    }

    centerx() {
        return this.minx + this.width() / 2;
    }

    centery() {
        return this.miny + this.height() / 2;
    }
}

gapp.overlay(base, {
    Bounds,
    newBounds() { return new Bounds() }
});

});
