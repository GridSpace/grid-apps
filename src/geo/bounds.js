/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

(function() {

    if (self.base.Bounds) return;

    /**
     *
     * @constructor
     */
    function Bounds() {
        this.minx = 10e7;
        this.miny = 10e7;
        this.maxx = -10e7;
        this.maxy = -10e7;
    }

    const BASE = self.base,
        UTIL = BASE.util,
        CONF = BASE.config,
        PRO = Bounds.prototype;

    BASE.Bounds = Bounds;
    BASE.newBounds = newBounds;

    /** ******************************************************************
     * Bounds Prototype Functions
     ******************************************************************* */

     PRO.set = function(minx, maxx, miny, maxy) {
         this.minx = minx;
         this.miny = miny;
         this.maxx = maxx;
         this.maxy = maxy;
         return this;
     };

    /**
     * @returns {Bounds}
     */
    PRO.clone = function() {
        let b = new Bounds();
        b.minx = this.minx;
        b.miny = this.miny;
        b.maxx = this.maxx;
        b.maxy = this.maxy;
        b.maxy = this.maxy;
        return b;
    };

    PRO.equals = function(bounds, margin) {
        if (!margin) margin = BASE.config.precision_offset;
        return UTIL.isCloseTo(this.minx, bounds.minx, margin) &&
            UTIL.isCloseTo(this.miny, bounds.miny, margin) &&
            UTIL.isCloseTo(this.maxx, bounds.maxx, margin) &&
            UTIL.isCloseTo(this.maxy, bounds.maxy, margin);
    };

    /**
     * @returns {Number} absolute delta in x,y coordinate space
     */
    PRO.delta = function(bounds) {
        return 0 +
            Math.abs(this.minx - bounds.minx) +
            Math.abs(this.miny - bounds.miny) +
            Math.abs(this.maxx - bounds.maxx) +
            Math.abs(this.maxy - bounds.maxy);
    };

    /**
     * @param {Bounds} b
     */
    PRO.merge = function(b) {
        this.minx = Math.min(this.minx, b.minx);
        this.maxx = Math.max(this.maxx, b.maxx);
        this.miny = Math.min(this.miny, b.miny);
        this.maxy = Math.max(this.maxy, b.maxy);
        return this;
    };

    /**
     * @param {Point} p
     */
    PRO.update = function(p) {
        this.minx = Math.min(this.minx, p.x);
        this.maxx = Math.max(this.maxx, p.x);
        this.miny = Math.min(this.miny, p.y);
        this.maxy = Math.max(this.maxy, p.y);
        return this;
    };

    PRO.contains = function(bounds) {
        return bounds.isNested(this);
    };

    PRO.containsXY = function(x,y) {
        return x >= this.minx && x <= this.maxx && y >= this.miny && y <= this.maxy;
    };

    PRO.containsOffsetXY = function(x,y,offset) {
        return x >= this.minx-offset && x <= this.maxx+offset && y >= this.miny-offset && y <= this.maxy+offset;
    };

    /**
     * @param {Bounds} parent
     * @returns {boolean} true if fully inside parent bounds
     */
    PRO.isNested = function(parent, tolerance) {
        let grace = tolerance || CONF.precision_bounds;
        return (
            this.minx >= parent.minx - grace && // min-x
            this.maxx <= parent.maxx + grace && // max-x
            this.miny >= parent.miny - grace && // min-y
            this.maxy <= parent.maxy + grace    // max-y
        );
    };

    /**
     * @param {Bounds} b
     * @param {number} precision
     * @returns {boolean}
     */
    PRO.overlaps = function(b, precision) {
        return (
            Math.abs(this.centerx() - b.centerx()) * 2 - precision < this.width() + b.width() &&
            Math.abs(this.centery() - b.centery()) * 2 - precision < this.height() + b.height()
        );
    };

    PRO.width = function() {
        return this.maxx - this.minx;
    };

    PRO.height = function() {
        return this.maxy - this.miny;
    };

    PRO.center = function(z) {
        return BASE.newPoint(this.centerx(), this.centery(), z);
    };

    PRO.centerx = function() {
        return this.minx + this.width() / 2;
    };

    PRO.centery = function() {
        return this.miny + this.height() / 2;
    };

    /** ******************************************************************
     * Connect to base and Helpers
     ******************************************************************* */

    function newBounds() {
        return new Bounds();
    }

})();
