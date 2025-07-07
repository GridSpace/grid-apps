/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// use: geo.line
// use: geo.point
gapp.register("geo.slope", [], (root, exports) => {

const { base } = root;
const { config } = base;

const ABS = Math.abs,
    DEG2RAD = Math.PI / 180,
    RAD2DEG = 180 / Math.PI;

class Slope {
    constructor(p1, p2, dx, dy) {
        this.dx = p1 && p2 ? p2.x - p1.x : dx;
        this.dy = p1 && p2 ? p2.y - p1.y : dy;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
    }

    toString() {
        return [this.dx, this.dy, this.angle].join(',');
    }

    clone() {
        return new Slope(null, null, this.dx, this.dy);
    }

    isSame(s) {
        // if very close to vertical or horizontal, they're the same
        if (ABS(this.dx) <= config.precision_merge && ABS(s.dx) <= config.precision_merge) return true;
        if (ABS(this.dy) <= config.precision_merge && ABS(s.dy) <= config.precision_merge) return true;
        // check angle within a range
        let prec = Math.min(1/Math.sqrt(this.dx * this.dx + this.dy * this.dy), config.precision_slope_merge);
        return angleWithinDelta(this.angle, s.angle, prec || config.precision_slope);
    }

    normal() {
        let t = this.dx;
        this.dx = -this.dy;
        this.dy = t;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
        return this;
    }

    invert() {
        this.dx = -this.dx;
        this.dy = -this.dy;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
        return this;
    }

    toUnit() {
        let max = Math.max(ABS(this.dx), ABS(this.dy));
        this.dx = this.dx / max;
        this.dy = this.dy / max;
        return this;
    }

    factor(f) {
        this.dx *= f;
        this.dy *= f;
        return this;
    }

    invert() {
        this.dx = -this.dx;
        this.dy = -this.dy;
        this.angle = 180 - this.angle;
        return this;
    }

    angleDiff(s2,sign) {
        const n1 = this.angle;
        const n2 = s2.angle;
        let diff = n2 - n1;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;
        return sign ? diff : Math.abs(diff);
    }
}

/**
 * returns true if the difference between a & b is less than v
 */
function minDeltaABS(a,b,v) {
    return ABS(a-b) < v;
}

function angleWithinDelta(a1, a2, delta) {
    return (ABS(a1-a2) <= delta || 360-ABS(a1-a2) <= delta);
}

function newSlope(p1, p2, dx, dy) {
    return new Slope(p1, p2, dx, dy);
}

function newSlopeFromAngle(angle) {
    return newSlope(0,0,
        Math.cos(angle * DEG2RAD),
        Math.sin(angle * DEG2RAD)
    );
}

gapp.overlay(base, {
    Slope,
    newSlope,
    newSlopeFromAngle
});

});
