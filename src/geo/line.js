/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.base.Line) return;

    const BASE = self.base, PRO = Line.prototype;

    BASE.Line = Line;
    BASE.newLine = newLine;
    BASE.newOrderedLine = newOrderedLine;

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

    /** ******************************************************************
     * Line Prototype Functions
     ******************************************************************* */

    /**
     * @returns {number}
     */
    PRO.length = function() {
        return Math.sqrt(this.length2());
    };

    /**
     * @returns {number} square of length
     */
    PRO.length2 = function() {
        return this.p1.distToSq2D(this.p2);
    };

    /**
     * @returns {Slope}
     */
    PRO.slope = function() {
        return BASE.newSlope(this.p1.slopeTo(this.p2));
    };

    /**
     * @returns {Line}
     */
    PRO.reverse = function() {
        let t = this.p1;
        this.p1 = this.p2;
        this.p2 = t;
        return this;
    };

    /**
     * @returns {Point}
     */
    PRO.midpoint = function() {
        return this.p1.midPointTo(this.p2);
    };

    /**
     * faulty when line doubles back at 180?
     * @param {Line} line
     * @returns {boolean}
     */
    PRO.isCollinear = function(line) {
        let p1 = this.p1,
            p2 = this.p2,
            p3 = line.p1,
            p4 = line.p2,
            d1x = (p2.x - p1.x),
            d1y = (p2.y - p1.y),
            d2x = (p4.x - p3.x),
            d2y = (p4.y - p3.y);

        return Math.abs( (d2y * d1x) - (d2x * d1y) ) < 0.0001;
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
