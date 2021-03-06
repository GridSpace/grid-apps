/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (self.base.Slope) return;

    const BASE = self.base,
        CONF = BASE.config,
        ABS = Math.abs,
        PRO = Slope.prototype,
        DEG2RAD = Math.PI / 180,
        RAD2DEG = 180 / Math.PI;

    BASE.Slope = Slope;
    BASE.newSlope = newSlope;
    BASE.newSlopeFromAngle = function(angle) {
        return newSlope(0,0,
            Math.cos(angle * DEG2RAD),
            Math.sin(angle * DEG2RAD)
        );
    };

    /**
     *
     * @param p1
     * @param p2
     * @param dx
     * @param dy
     * @constructor
     */
    function Slope(p1, p2, dx, dy) {
        this.dx = p1 && p2 ? p2.x - p1.x : dx;
        this.dy = p1 && p2 ? p2.y - p1.y : dy;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
    }

    /** ******************************************************************
     * Slope Prototype Functions
     ******************************************************************* */

    PRO.toString = function() {
        return [this.dx, this.dy, this.angle].join(',');
    };

    PRO.clone = function() {
        return new Slope(null, null, this.dx, this.dy);
    };

    /**
     * @param {Slope} s
     * @returns {boolean}
     */
    PRO.isSame = function(s) {
        // if very close to vertical or horizontal, they're the same
        if (ABS(this.dx) <= CONF.precision_merge && ABS(s.dx) <= CONF.precision_merge) return true;
        if (ABS(this.dy) <= CONF.precision_merge && ABS(s.dy) <= CONF.precision_merge) return true;
        // check angle within a range
        let prec = Math.min(1/Math.sqrt(this.dx * this.dx + this.dy * this.dy), CONF.precision_slope_merge);
        return angleWithinDelta(this.angle, s.angle, prec || CONF.precision_slope);
    };

    /**
     * turn slope 90 degrees
     *
     * @returns {Slope}
     */
    PRO.normal = function() {
        let t = this.dx;
        this.dx = -this.dy;
        this.dy = t;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
        return this;
    };

    PRO.invert = function() {
        this.dx = -this.dx;
        this.dy = -this.dy;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
        return this;
    }

    PRO.toUnit = function() {
        let max = Math.max(ABS(this.dx), ABS(this.dy));
        this.dx = this.dx / max;
        this.dy = this.dy / max;
        return this;
    };

    PRO.factor = function(f) {
        this.dx *= f;
        this.dy *= f;
        return this;
    };

    /**
     * reverse (180 degree) slope
     *
     * @returns {Slope}
     */
    PRO.invert = function() {
        this.dx = -this.dx;
        this.dy = -this.dy;
        this.angle = 180 - this.angle;
        return this;
    };

    PRO.angleDiff = function(s2,sign) {
        const n1 = this.angle;
        const n2 = s2.angle;
        let diff = n2 - n1;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;
        return sign ? diff : Math.abs(diff);
    };

    /** ******************************************************************
     * Connect to base and Helpers
     ******************************************************************* */

    /**
     * returns true if the difference between a & b is less than v
     *
     * @param {number} a
     * @param {number} b
     * @param {number} v
     * @returns {boolean}
     */
    function minDeltaABS(a,b,v) {
        return ABS(a-b) < v;
    }

    function angleWithinDelta(a1, a2, delta) {
        return (ABS(a1-a2) <= delta || 360-ABS(a1-a2) <= delta);
    }

    /**
     *
     * @param p1
     * @param p2
     * @param dx
     * @param dy
     * @returns {Slope}
     */
    function newSlope(p1, p2, dx, dy) {
        return new Slope(p1, p2, dx, dy);
    }

})();
