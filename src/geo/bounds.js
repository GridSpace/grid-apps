/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

import { config, util } from './base.js';
import { newPoint } from './point.js';

/**
 * Represents an axis-aligned 2D bounding box
 * Used for spatial queries and geometric containment tests
 * @class
 */
export class Bounds {
    /**
     * Create new bounding box initialized to inverted extremes
     * (min values at max, max values at min) ready for point addition
     */
    constructor() {
        this.minx = 10e7;
        this.miny = 10e7;
        this.maxx = -10e7;
        this.maxy = -10e7;
    }

    /**
     * Set bounds to specific values
     * @param {number} minx - Minimum X coordinate
     * @param {number} maxx - Maximum X coordinate
     * @param {number} miny - Minimum Y coordinate
     * @param {number} maxy - Maximum Y coordinate
     * @returns {Bounds} This bounds (for chaining)
     */
    set(minx, maxx, miny, maxy) {
        this.minx = minx;
        this.miny = miny;
        this.maxx = maxx;
        this.maxy = maxy;
        return this;
    }

    /**
     * Create deep copy of bounds
     * @returns {Bounds} New bounds with same values
     */
    clone() {
        let b = new Bounds();
        b.minx = this.minx;
        b.miny = this.miny;
        b.maxx = this.maxx;
        b.maxy = this.maxy;
        b.maxy = this.maxy;
        return b;
    }

    /**
     * Check if bounds are equal within margin of error
     * @param {Bounds} bounds - Bounds to compare
     * @param {number} [margin] - Tolerance for comparison (defaults to config.precision_offset)
     * @returns {boolean} True if all bounds values are within margin
     */
    equals(bounds, margin) {
        if (!margin) margin = config.precision_offset;
        return util.isCloseTo(this.minx, bounds.minx, margin) &&
            util.isCloseTo(this.miny, bounds.miny, margin) &&
            util.isCloseTo(this.maxx, bounds.maxx, margin) &&
            util.isCloseTo(this.maxy, bounds.maxy, margin);
    }

    /**
     * Calculate total absolute difference in bounds coordinates
     * Sum of absolute differences for all four bounds values
     * @param {Bounds} bounds - Bounds to compare
     * @returns {number} Absolute delta in x,y coordinate space
     */
    delta(bounds) {
        return 0 +
            Math.abs(this.minx - bounds.minx) +
            Math.abs(this.miny - bounds.miny) +
            Math.abs(this.maxx - bounds.maxx) +
            Math.abs(this.maxy - bounds.maxy);
    }

    /**
     * Expand bounds to include another bounds (mutates in place)
     * @param {Bounds} b - Bounds to merge
     * @returns {Bounds} This bounds (for chaining)
     */
    merge(b) {
        this.minx = Math.min(this.minx, b.minx);
        this.maxx = Math.max(this.maxx, b.maxx);
        this.miny = Math.min(this.miny, b.miny);
        this.maxy = Math.max(this.maxy, b.maxy);
        return this;
    }

    /**
     * Expand bounds to include point (mutates in place)
     * @param {Point} p - Point to include
     * @returns {Bounds} This bounds (for chaining)
     */
    update(p) {
        this.minx = Math.min(this.minx, p.x);
        this.maxx = Math.max(this.maxx, p.x);
        this.miny = Math.min(this.miny, p.y);
        this.maxy = Math.max(this.maxy, p.y);
        return this;
    }

    /**
     * Check if this bounds fully contains another bounds
     * @param {Bounds} bounds - Bounds to test
     * @returns {boolean} True if bounds is fully inside this
     */
    contains(bounds) {
        return bounds.isNested(this);
    }

    /**
     * Check if point with coordinates x,y is inside bounds
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {boolean} True if point is inside bounds (inclusive)
     */
    containsXY(x, y) {
        return x >= this.minx && x <= this.maxx && y >= this.miny && y <= this.maxy;
    }

    /**
     * Check if point is inside bounds expanded by offset
     * Used for proximity tests with margin
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @param {number} offset - Expansion offset (positive = expand, negative = shrink)
     * @returns {boolean} True if point is inside expanded bounds
     */
    containsOffsetXY(x, y, offset) {
        return x >= this.minx - offset && x <= this.maxx + offset && y >= this.miny - offset && y <= this.maxy + offset;
    }

    /**
     * Check if this bounds is fully inside parent bounds
     * @param {Bounds} parent - Parent bounds to test against
     * @param {number} [precision=config.precision_bounds] - Tolerance for edge comparison
     * @returns {boolean} True if fully inside parent bounds within precision
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
     * Check if bounds overlap with another bounds
     * Uses center distance comparison for efficient overlap detection
     * @param {Bounds} b - Bounds to test
     * @param {number} [precision=config.precision_bounds] - Tolerance for overlap test
     * @returns {boolean} True if bounds overlap
     */
    overlaps(b, precision = config.precision_bounds) {
        return (
            Math.abs(this.centerx() - b.centerx()) * 2 - precision < this.width() + b.width() &&
            Math.abs(this.centery() - b.centery()) * 2 - precision < this.height() + b.height()
        );
    }

    /**
     * Calculate width of bounds
     * @returns {number} Width (maxx - minx)
     */
    width() {
        return this.maxx - this.minx;
    }

    /**
     * Calculate height of bounds
     * @returns {number} Height (maxy - miny)
     */
    height() {
        return this.maxy - this.miny;
    }

    /**
     * Get center point of bounds
     * @param {number} [z=0] - Z coordinate for center point
     * @returns {Point} Center point
     */
    center(z = 0) {
        return newPoint(this.centerx(), this.centery(), z);
    }

    /**
     * Get X coordinate of center
     * @returns {number} Center X coordinate
     */
    centerx() {
        return this.minx + this.width() / 2;
    }

    /**
     * Get Y coordinate of center
     * @returns {number} Center Y coordinate
     */
    centery() {
        return this.miny + this.height() / 2;
    }
}

/**
 * Create new Bounds instance
 * @returns {Bounds} New bounds initialized to inverted extremes
 */
export function newBounds() {
    return new Bounds();
}
