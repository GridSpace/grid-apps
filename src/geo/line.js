/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Represents a line segment defined by two points
 * @class
 */
export class Line {
    /**
     * Create a line segment between two points
     * @param {Point} p1 - First endpoint
     * @param {Point} p2 - Second endpoint
     * @param {string} [key] - Optional unique identifier (auto-generated from point keys if not provided)
     */
    constructor(p1, p2, key) {
        if (!key) key = [p1.key, p2.key].join(';');
        this.p1 = p1;
        this.p2 = p2;
        this.key = key;
    }

    /**
     * Calculate length of line segment in 2D
     * @returns {number} Euclidean distance between endpoints
     */
    length() {
        return Math.sqrt(this.length2());
    }

    /**
     * Calculate squared length of line segment
     * Faster than length() - use when only comparing lengths
     * @returns {number} Squared distance between endpoints
     */
    length2() {
        return this.p1.distToSq2D(this.p2);
    }

    /**
     * Calculate slope of line segment
     * @returns {Slope} Slope object representing direction from p1 to p2
     */
    slope() {
        return base.newSlope(this.p1.slopeTo(this.p2));
    }

    /**
     * Reverse direction of line by swapping endpoints (mutates in place)
     * @returns {Line} This line (for chaining)
     */
    reverse() {
        let t = this.p1;
        this.p1 = this.p2;
        this.p2 = t;
        return this;
    }

    /**
     * Calculate midpoint of line segment
     * @returns {Point} Point at center of line
     */
    midpoint() {
        return this.p1.midPointTo(this.p2);
    }

    /**
     * Check if this line is collinear with another line
     * Uses cross product to test if slopes are parallel within tolerance
     * @param {Line} line - Line to test against
     * @returns {boolean} True if lines are collinear (parallel with same or opposite direction)
     */
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

/**
 * Create a new Line instance
 * @param {Point} p1 - First endpoint
 * @param {Point} p2 - Second endpoint
 * @param {string} [key] - Optional unique identifier
 * @returns {Line} New line segment
 */
export function newLine(p1, p2, key) {
    return new Line(p1, p2, key);
}

/**
 * Create a line with endpoints ordered by their keys (lexicographic)
 * Ensures consistent line representation regardless of point order
 * @param {Point} p1 - First point
 * @param {Point} p2 - Second point
 * @param {string} [key] - Optional unique identifier
 * @returns {Line} New line with points ordered by key
 */
export function newOrderedLine(p1, p2, key) {
    return p1.key < p2.key ? newLine(p1,p2,key) : newLine(p2,p1,key);
}
