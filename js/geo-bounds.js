/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_base_bounds = exports;

(function() {

    if (!self.base) self.base = {};
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
        this.leftMost = null;
    }

    var BASE = self.base,
        UTIL = BASE.util,
        CONF = BASE.config,
        ABS = Math.abs,
        MIN = Math.min,
        MAX = Math.max,
        PRO = Bounds.prototype;

    BASE.Bounds = Bounds;
    BASE.newBounds = newBounds;

    /** ******************************************************************
     * Bounds Prototype Functions
     ******************************************************************* */

    /**
     * @returns {Bounds}
     */
    PRO.clone = function() {
        var b = new Bounds();
        b.minx = this.minx;
        b.miny = this.miny;
        b.maxx = this.maxx;
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
     * @param {Bounds} b
     */
    PRO.merge = function(b) {
        this.minx = MIN(this.minx, b.minx);
        this.maxx = MAX(this.maxx, b.maxx);
        this.miny = MIN(this.miny, b.miny);
        this.maxy = MAX(this.maxy, b.maxy);
    };

    /**
     * @param {Point} p
     */
    PRO.update = function(p) {
        this.minx = MIN(this.minx, p.x);
        this.maxx = MAX(this.maxx, p.x);
        this.miny = MIN(this.miny, p.y);
        this.maxy = MAX(this.maxy, p.y);
        if (this.minx === p.x) this.leftMost = p;
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
    PRO.isNested = function(parent) {
        return (
            this.minx >= parent.minx - CONF.precision_bounds && // min-x
            this.maxx <= parent.maxx + CONF.precision_bounds && // max-x
            this.miny >= parent.miny - CONF.precision_bounds && // min-y
            this.maxy <= parent.maxy + CONF.precision_bounds    // max-y
        );
    };

    /**
     * @param {Bounds} b
     * @param {number} precision
     * @returns {boolean}
     */
    PRO.overlaps = function(b, precision) {
        return (
            ABS(this.centerx() - b.centerx()) * 2 - precision < this.width() + b.width() &&
            ABS(this.centery() - b.centery()) * 2 - precision < this.height() + b.height()
        );
    };

    PRO.width = function() {
        return this.maxx - this.minx;
    };

    PRO.height = function() {
        return this.maxy - this.miny;
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
