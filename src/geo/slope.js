/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { config } from './base.js';

const ABS = Math.abs,
    DEG2RAD = Math.PI / 180,
    RAD2DEG = 180 / Math.PI;

/**
 * Represents a 2D directional slope (vector direction)
 * Stores both dx/dy components and computed angle in degrees
 * @class
 */
export class Slope {
    /**
     * Create slope from two points or explicit dx/dy values
     * @param {Point} [p1] - First point (if creating from points)
     * @param {Point} [p2] - Second point (if creating from points)
     * @param {number} [dx] - X component if not using points
     * @param {number} [dy] - Y component if not using points
     */
    constructor(p1, p2, dx, dy) {
        this.dx = p1 && p2 ? p2.x - p1.x : dx;
        this.dy = p1 && p2 ? p2.y - p1.y : dy;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
    }

    /**
     * Get string representation of slope
     * @returns {string} "dx,dy,angle" format
     */
    toString() {
        return [this.dx, this.dy, this.angle].join(',');
    }

    /**
     * Create deep copy of slope
     * @returns {Slope} New slope with same dx, dy
     */
    clone() {
        return new Slope(null, null, this.dx, this.dy);
    }

    /**
     * Check if slopes are equivalent within precision tolerance
     * Special handling for near-vertical and near-horizontal slopes
     * Uses adaptive precision based on slope magnitude
     * @param {Slope} s - Slope to compare
     * @returns {boolean} True if slopes are effectively the same
     */
    isSame(s) {
        // if very close to vertical or horizontal, they're the same
        if (ABS(this.dx) <= config.precision_merge && ABS(s.dx) <= config.precision_merge) return true;
        if (ABS(this.dy) <= config.precision_merge && ABS(s.dy) <= config.precision_merge) return true;
        // check angle within a range
        let prec = Math.min(1/Math.sqrt(this.dx * this.dx + this.dy * this.dy), config.precision_slope_merge);
        return angleWithinDelta(this.angle, s.angle, prec || config.precision_slope);
    }

    /**
     * Rotate slope 90 degrees counter-clockwise to get perpendicular (mutates in place)
     * Converts slope to its normal (perpendicular) direction
     * @returns {Slope} This slope (for chaining)
     */
    normal() {
        let t = this.dx;
        this.dx = -this.dy;
        this.dy = t;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
        return this;
    }

    /**
     * Reverse slope direction by 180 degrees (mutates in place)
     * Negates both dx and dy components
     * @returns {Slope} This slope (for chaining)
     */
    invert() {
        this.dx = -this.dx;
        this.dy = -this.dy;
        this.angle = Math.atan2(this.dy, this.dx) * RAD2DEG;
        return this;
    }

    /**
     * Normalize slope so largest component is 1 (mutates in place)
     * Maintains direction while scaling to unit-like form
     * @returns {Slope} This slope (for chaining)
     */
    toUnit() {
        let max = Math.max(ABS(this.dx), ABS(this.dy));
        this.dx = this.dx / max;
        this.dy = this.dy / max;
        return this;
    }

    /**
     * Scale slope by factor (mutates in place)
     * @param {number} f - Scale factor
     * @returns {Slope} This slope (for chaining)
     */
    factor(f) {
        this.dx *= f;
        this.dy *= f;
        return this;
    }

    /**
     * Calculate angular difference to another slope
     * Result normalized to [-180, 180] range
     * @param {Slope} s2 - Target slope
     * @param {boolean} [sign] - If true, return signed difference; if false, return absolute difference
     * @returns {number} Angle difference in degrees
     */
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
 * Check if difference between two values is less than threshold
 * @private
 * @param {number} a - First value
 * @param {number} b - Second value
 * @param {number} v - Threshold
 * @returns {boolean} True if |a-b| < v
 */
function minDeltaABS(a,b,v) {
    return ABS(a-b) < v;
}

/**
 * Check if two angles are within delta degrees of each other
 * Handles wraparound at 0/360 degree boundary
 * @private
 * @param {number} a1 - First angle in degrees
 * @param {number} a2 - Second angle in degrees
 * @param {number} delta - Maximum difference in degrees
 * @returns {boolean} True if angles are within delta
 */
function angleWithinDelta(a1, a2, delta) {
    return (ABS(a1-a2) <= delta || 360-ABS(a1-a2) <= delta);
}

/**
 * Create new Slope from two points or explicit dx/dy values
 * @param {Point} [p1] - First point (if creating from points)
 * @param {Point} [p2] - Second point (if creating from points)
 * @param {number} [dx] - X component if not using points
 * @param {number} [dy] - Y component if not using points
 * @returns {Slope} New slope instance
 */
export function newSlope(p1, p2, dx, dy) {
    return new Slope(p1, p2, dx, dy);
}

/**
 * Create slope from angle in degrees
 * @param {number} angle - Angle in degrees (0 = East, 90 = North, etc.)
 * @returns {Slope} New slope with direction from angle
 */
export function newSlopeFromAngle(angle) {
    return newSlope(0,0,
        Math.cos(angle * DEG2RAD),
        Math.sin(angle * DEG2RAD)
    );
}
