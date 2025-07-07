/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
gapp.register("geo.line", [], (root, exports) => {

const { base } = root;

class Line {
    constructor(p1, p2, key) {
        if (!key) key = [p1.key, p2.key].join(';');
        this.p1 = p1;
        this.p2 = p2;
        this.key = key;
    }

    length() {
        return Math.sqrt(this.length2());
    }

    /**
     * @returns {number} square of length
     */
    length2() {
        return this.p1.distToSq2D(this.p2);
    }

    slope() {
        return base.newSlope(this.p1.slopeTo(this.p2));
    }

    reverse() {
        let t = this.p1;
        this.p1 = this.p2;
        this.p2 = t;
        return this;
    }

    midpoint() {
        return this.p1.midPointTo(this.p2);
    }

    isCollinear(line) {
        let p1 = this.p1,
            p2 = this.p2,
            p3 = line.p1,
            p4 = line.p2,
            d1x = (p2.x - p1.x),
            d1y = (p2.y - p1.y),
            d2x = (p4.x - p3.x),
            d2y = (p4.y - p3.y);
        return Math.abs( (d2y * d1x) - (d2x * d1y) ) < 0.0001;
    }
}

function newLine(p1, p2, key) {
    return new Line(p1, p2, key);
}

function newOrderedLine(p1, p2, key) {
    return p1.key < p2.key ? newLine(p1,p2,key) : newLine(p2,p1,key);
}

gapp.overlay(base, {
    Line,
    newLine,
    newOrderedLine
});

});
