"use strict";

var gs_base_line = {
    copyright:"stewart allen <stewart@neuron.com> -- all rights reserved"
};

(function() {

    if (!self.base) self.base = {};
    if (self.base.Line) return;

    /**
     *
     * @param {Point} p1
     * @param {Point} p2
     * @param {String} [key]
     * @constructor
     */
    function Line(p1, p2, key) {
        if (!key) key = [p1.key, p2.key].join('-');
        this.p1 = p1;
        this.p2 = p2;
        this.key = key;
        this.coplanar = false;
        this.edge = false;
        this.del = false;
    }

    var    BASE = self.base,
        LiP = Line.prototype;

    BASE.Line = Line;
    BASE.newLine = newLine;
    BASE.newOrderedLine = newOrderedLine;

    /** ******************************************************************
     * Line Prototype Functions
     ******************************************************************* */

    /**
     * @returns {number}
     */
    LiP.length = function() {
        return Math.sqrt(this.length2());
    };

    /**
     * @returns {number} square of length
     */
    LiP.length2 = function() {
        return this.p1.distToSq2D(this.p2);
    };

    /**
     * @returns {Slope}
     */
    LiP.slope = function() {
        return BASE.newSlope(this.p1.slopeTo(this.p2));
    };

    /**
     * @returns {Line}
     */
    LiP.reverse = function() {
        var t = this.p1;
        this.p1 = this.p2;
        this.p2 = t;
        return this;
    };

    /**
     * @returns {Point}
     */
    LiP.midpoint = function() {
        return this.p1.midPointTo(this.p2);
    };

    /**
     * @param {Line} line
     * @returns {boolean}
     */
    LiP.isCollinear = function(line) {
        var p1 = this.p1,
            p2 = this.p2,
            p3 = line.p1,
            p4 = line.p2,
            d1x = (p2.x - p1.x),
            d1y = (p2.y - p1.y),
            d2x = (p4.x - p3.x),
            d2y = (p4.y - p3.y);

        return Math.abs( (d2y * d1x) - (d2x * d1y) ) < 0.000001;
    };

    /** ******************************************************************
     * Connect to base and Helpers
     ******************************************************************* */

    /**
     *
     * @param {Point} p1
     * @param {Point} p2
     * @param {String} [key]
     * @returns {Line}
     */
    function newLine(p1, p2, key) {
        return new Line(p1, p2, key);
    }

    function newOrderedLine(p1, p2, key) {
        return p1.key < p2.key ? newLine(p1,p2,key) : newLine(p2,p1,key);
    }

})();
