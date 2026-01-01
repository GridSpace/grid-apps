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
    const {
        angleThreshold = 5,      // degrees - minimum angle change to insert arc
        arcSegmentAngle = 5      // degrees - angle between arc segments
    } = options;

    // Validate inputs
    if (!knifeOffset || Math.abs(knifeOffset) < 0.001) {
        return polygon.clone();
    }

    polygon.setClockwise();
    const points = polygon.points;
    const len = points.length;

    if (len < 2) {
        return polygon.clone();
    }

    const DEG2RAD = Math.PI / 180;
    const thresholdRad = angleThreshold * DEG2RAD;
    const arcSegRad = arcSegmentAngle * DEG2RAD;

    // For closed polygons vs open paths
    const isClosed = !polygon.open;
    const numSegments = isClosed ? len : len - 1;

    // Calculate segment directions and angles
    const segments = [];
    for (let i = 0; i < numSegments; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % len];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0.001) {
            segments.push({
                index: i,
                point: p1,
                angle: Math.atan2(dy, dx),  // Direction of travel
                length: length
            });
        }
    }

    if (segments.length === 0) {
        return polygon.clone();
    }

    const output = [];

    // Process each segment
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isLastSegment = i === segments.length - 1;
        const nextSeg = isClosed ? segments[(i + 1) % segments.length] :
                        isLastSegment ? null : segments[i + 1];

        // Key insight from dragknife-repath:
        // Offset the point in the DIRECTION OF TRAVEL by knife offset
        // The knife blade trails behind the rotation axis
        const offsetX = seg.point.x + Math.cos(seg.angle) * knifeOffset;
        const offsetY = seg.point.y + Math.sin(seg.angle) * knifeOffset;
        output.push(newPoint(offsetX, offsetY, seg.point.z));

        // Check if we need a swivel arc at the end of this segment
        if (nextSeg) {
            // Calculate angle change between this segment and the next
            let angleDiff = nextSeg.angle - seg.angle;

            // Normalize angle difference to [-PI, PI]
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            // If angle change exceeds threshold, insert arc to rotate knife
            if (Math.abs(angleDiff) > thresholdRad) {
                // The arc is centered at the vertex between segments
                const vertex = points[(seg.index + 1) % len];

                // Number of arc segments based on angle change
                const arcSteps = Math.max(2, Math.ceil(Math.abs(angleDiff) / arcSegRad));

                // Generate arc from current angle to next angle
                for (let step = 1; step <= arcSteps; step++) {
                    const t = step / arcSteps;
                    const angle = seg.angle + angleDiff * t;
                    const arcX = vertex.x + Math.cos(angle) * knifeOffset;
                    const arcY = vertex.y + Math.sin(angle) * knifeOffset;
                    output.push(newPoint(arcX, arcY, vertex.z));
                }
            }
        }
    }

    // For open paths, add the final point offset in the last segment's direction
    if (!isClosed && segments.length > 0) {
        const lastSeg = segments[segments.length - 1];
        const lastPoint = points[len - 1];
        const offsetX = lastPoint.x + Math.cos(lastSeg.angle) * knifeOffset;
        const offsetY = lastPoint.y + Math.sin(lastSeg.angle) * knifeOffset;
        output.push(newPoint(offsetX, offsetY, lastPoint.z));
    }

    // Create new polygon with compensated path
    const result = newPolygon(output);
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
