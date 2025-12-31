/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { LASER, TYPE, FUNC } from '../laser/driver.js';
import { newPoint } from '../../../geo/point.js';
import { newPolygon } from '../../../geo/polygon.js';
import { newSlopeFromAngle } from '../../../geo/slope.js';

function init(worker) {
    FUNC.generateDragKnifePath = generateDragKnifePath;
}

/**
 * Generate drag knife toolpath for a polygon.
 * The knife blade trails behind the rotation axis by knifeOffset distance.
 * This function creates compensated paths with pivot arcs at corners.
 *
 * @param {Polygon} polygon - Input polygon to cut
 * @param {number} knifeOffset - Distance from Z-axis center to blade tip
 * @param {Object} options - Configuration options
 * @param {number} [options.angleThreshold=10] - Angle (degrees) below which vertices are treated as curves
 * @param {number} [options.lookahead=3] - Number of vertices for direction smoothing on curves
 * @param {boolean} [options.overcut=false] - Add slight overcut at sharp corners
 * @param {number} [options.overcutDistance=0.1] - Distance to overcut in mm
 * @returns {Polygon} New polygon with drag knife compensation applied
 */
function generateDragKnifePath(polygon, knifeOffset, options = {}) {
    return addKnifeRadii(polygon, knifeOffset);
    const {
        angleThreshold = 10,    // degrees
        lookahead = 3,          // vertices
        overcut = false,
        overcutDistance = 0.1
    } = options;

    polygon.setClockwise();
    const points = polygon.points;
    const len = points.length;

    if (len < 2) {
        return polygon.clone();
    }

    const DEG2RAD = Math.PI / 180;
    const thresholdRad = angleThreshold * DEG2RAD;

    // Helper: Get direction vector from point i to i+1
    function getDirection(i) {
        const curr = points[i];
        const next = points[(i + 1) % len];
        const dx = next.x - curr.x;
        const dy = next.y - curr.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        return length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    }

    // Helper: Get perpendicular vector (90° counter-clockwise, to the left)
    function perpLeft(dir) {
        return { x: -dir.y, y: dir.x };
    }

    // Helper: Calculate angle change at vertex i
    function getAngleChange(i) {
        const prev = points[(i - 1 + len) % len];
        const curr = points[i];
        const next = points[(i + 1) % len];

        const v1x = curr.x - prev.x;
        const v1y = curr.y - prev.y;
        const v2x = next.x - curr.x;
        const v2y = next.y - curr.y;

        const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
        const len2 = Math.sqrt(v2x * v2x + v2y * v2y);

        if (len1 === 0 || len2 === 0) return 0;

        const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
        const cross = (v1x * v2y - v1y * v2x) / (len1 * len2);

        return Math.atan2(cross, dot);
    }

    // Helper: Get smoothed direction using lookahead window
    function getSmoothedDirection(i) {
        let sumX = 0, sumY = 0, count = 0;

        for (let j = -lookahead; j <= lookahead; j++) {
            const idx = (i + j + len) % len;
            const dir = getDirection(idx);
            sumX += dir.x;
            sumY += dir.y;
            count++;
        }

        const length = Math.sqrt(sumX * sumX + sumY * sumY);
        return length > 0 ?
            { x: sumX / length, y: sumY / length } :
            { x: 1, y: 0 };
    }

    // Classify each vertex as CURVE or CORNER
    const types = [];
    for (let i = 0; i < len; i++) {
        const angleChange = Math.abs(getAngleChange(i));
        types[i] = angleChange < thresholdRad ? 'CURVE' : 'CORNER';
    }

    // Generate compensated toolpath
    const outputPoints = [];

    for (let i = 0; i < len; i++) {
        const curr = points[i];
        const type = types[i];

        if (type === 'CURVE') {
            // Smooth curve section - use averaged direction for offset
            const smoothDir = getSmoothedDirection(i);
            const offset = perpLeft(smoothDir);
            const toolX = curr.x + offset.x * knifeOffset;
            const toolY = curr.y + offset.y * knifeOffset;
            outputPoints.push(newPoint(toolX, toolY, curr.z));

        } else {
            // Sharp corner - need pivot arc
            const angleChange = getAngleChange(i);
            const dirIn = getDirection((i - 1 + len) % len);
            const dirOut = getDirection(i);

            const offsetIn = perpLeft(dirIn);
            const offsetOut = perpLeft(dirOut);

            // Tool positions entering and exiting corner
            const toolInX = curr.x + offsetIn.x * knifeOffset;
            const toolInY = curr.y + offsetIn.y * knifeOffset;
            const toolOutX = curr.x + offsetOut.x * knifeOffset;
            const toolOutY = curr.y + offsetOut.y * knifeOffset;

            // Add entry point
            outputPoints.push(newPoint(toolInX, toolInY, curr.z));

            // For right turns (positive angle), add arc points
            if (angleChange > 0) {
                const arcSteps = Math.max(3, Math.ceil(Math.abs(angleChange) / (15 * DEG2RAD)));

                // Optional overcut
                if (overcut) {
                    const ocX = curr.x + offsetIn.x * (knifeOffset + overcutDistance);
                    const ocY = curr.y + offsetIn.y * (knifeOffset + overcutDistance);
                    outputPoints.push(newPoint(ocX, ocY, curr.z));
                }

                // Generate arc from offsetIn to offsetOut around curr point
                for (let step = 1; step <= arcSteps; step++) {
                    const t = step / arcSteps;
                    const angle = Math.atan2(offsetIn.y, offsetIn.x) + angleChange * t;
                    const arcX = curr.x + Math.cos(angle) * knifeOffset;
                    const arcY = curr.y + Math.sin(angle) * knifeOffset;
                    outputPoints.push(newPoint(arcX, arcY, curr.z));
                }
            } else {
                // Left turn - blade is on inside, simpler handling
                // Just move directly to exit position
                outputPoints.push(newPoint(toolOutX, toolOutY, curr.z));
            }
        }
    }

    // Create new polygon with compensated points
    const result = newPolygon(outputPoints);
    result.open = polygon.open;

    return result;
}

// start to the "left" of the first point
function addKnifeRadii(poly, tipoff) {
    poly.setClockwise();
    let oldpts = poly.points.slice();

    // find leftpoint and make that the first point
    let start = oldpts[0];
    let startI = 0;
    let inner = tipoff < 0;
    tipoff = Math.abs(tipoff);
    for (let i=1; i<oldpts.length; i++) {
        let pt = oldpts[i];
        if (inner && (pt.x > start.x || (pt.x == start.x && pt.y < start.y))) {
            start = pt;
            startI = i;
        } else if (!inner && (pt.x < start.x || (pt.x == start.x && pt.y > start.y))) {
            start = pt;
            startI = i;
        }
    }
    if (startI > 0) {
        oldpts = oldpts.slice(startI,oldpts.length).appendAll(oldpts.slice(0,startI));
    }

    let lastpt = oldpts[0].clone().move({x:-tipoff,y:0,z:0});
    let lastsl = lastpt.slopeTo(oldpts[0]).toUnit();
    let newpts = [ lastpt, lastpt = oldpts[0].clone() ];
    let tmp;
    for (let i=1; i<oldpts.length + 1; i++) {
        let nextpt = oldpts[i % oldpts.length];
        let nextsl = lastpt.slopeTo(nextpt).toUnit();
        if (lastsl.angleDiff(nextsl) >= 10) {
            if (tipoff && lastpt.distTo2D(nextpt) >= tipoff) {
                arc(lastpt, tipoff, lastsl, nextsl, newpts);
            } else {
                // todo handle short segments
                // newpts.push(lastpt.projectOnSlope(lastsl, tipoff) );
                // newpts.push( lastpt.projectOnSlope(nextsl, tipoff) );
            }
        }
        newpts.push(nextpt);
        lastsl = nextsl;
        lastpt = nextpt;
    }
    newpts.push( tmp = lastpt.projectOnSlope(lastsl, tipoff) );
    // newpts.push( tmp.clone().move({x:tipoff, y:0, z: 0}) );
    poly.open = true;
    poly.points = newpts;

    return poly;
}

// convert arc into line segments
function arc(center, rad, s1, s2, out) {
    let a1 = s1.angle;
    let step = 5;
    let diff = s1.angleDiff(s2, true);
    let ticks = Math.abs(Math.floor(diff / step));
    let dir = Math.sign(diff);
    let off = (diff % step) / 2;
    if (off == 0) {
        ticks++;
    } else {
        out.push( center.projectOnSlope(s1, rad) );
    }
    while (ticks-- > 0) {
        out.push( center.projectOnSlope(newSlopeFromAngle(a1 + off), rad) );
        a1 += step * dir;
    }
    out.push( center.projectOnSlope(s2, rad) );
}

export const DRAG = Object.assign({}, LASER, {
    type: TYPE.DRAG,
    name: 'DragKnife',
    init,
    generateDragKnifePath
});
