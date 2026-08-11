/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { newPolygon } from '../geo/polygon.js';
import { newPoint } from '../geo/point.js';
import { polygons } from '../geo/polygons.js';

export function parseAsync(text, opt) {
    return new Promise((resolve, reject) => {
        try {
            resolve(parse(text, opt));
        } catch (e) {
            reject(e);
        }
    });
}

export function parse(text, opt = { }) {
    const justPoly = opt.flat || false;
    const fromSoup = opt.soup !== false || justPoly;
    const depth = parseFloat(opt.depth || 5);
    const segmentSize = parseFloat(opt.segmentSize || 1); // default 1mm segments
    const minSegments = parseInt(opt.minSegments || 4); // minimum segments for very small arcs
    const objs = [];
    const polys = [];

    // Parse DXF file - normalize line endings and split
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').map(l => l.trim());

    // Parse header for units (can be overridden by user)
    const fileUnits = extractUnits(lines);
    // Use file units if "auto" or not specified, otherwise use user's choice
    const inputUnits = (!opt.units || opt.units === 'auto') ? fileUnits : opt.units;
    const scale = getScaleToMM(inputUnits); // convert to mm (Kiri:Moto's internal unit)

    const entities = extractEntities(lines);

    // Scale all entities to mm BEFORE stitching
    scaleEntities(entities, scale);

    // Stitch together open paths that share endpoints (tolerance in mm now)
    const tolerance = Math.max(0.001, segmentSize * 0.001); // 0.1% of segment size, min 0.001mm
    const stitchedEntities = stitchPaths(entities, tolerance);

    // Convert entities to polygons (no scaling needed, already in mm)
    for (let entity of stitchedEntities) {
        if (entity.type === 'STITCHED') {
            // Convert stitched path parts into a single polyline
            const points = [];
            for (const part of entity.parts) {
                const partPoints = convertEntityToPoints(part, segmentSize, minSegments);
                if (partPoints.length > 0) {
                    if (points.length === 0) {
                        points.push(...partPoints);
                    } else {
                        // Skip first point if it's the same as our last point (avoid duplicates)
                        points.push(...partPoints.slice(1));
                    }
                }
            }

            if (points.length < 2) continue;

            let poly = newPolygon().addPoints(
                points.map(p => newPoint(p.x, p.y, p.z || 0))
            ).clean();

            if (entity.closed && poly.appearsClosed()) {
                poly.points.pop();
            } else if (!entity.closed) {
                poly.setOpen(true);
            }

            polys.push(poly);
        } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
            if (entity.points.length < 2) {
                continue;
            }

            let poly = newPolygon().addPoints(
                entity.points.map(p => newPoint(p.x, p.y, p.z || 0))
            ).clean();

            // Check if closed
            if (entity.closed && poly.appearsClosed()) {
                poly.points.pop();
            } else if (!entity.closed) {
                poly.setOpen(true);
            }

            polys.push(poly);
        } else if (entity.type === 'LINE') {
            // Convert line to polyline
            let poly = newPolygon().addPoints([
                newPoint(entity.start.x, entity.start.y, entity.start.z || 0),
                newPoint(entity.end.x, entity.end.y, entity.end.z || 0)
            ]);
            poly.setOpen(true);
            polys.push(poly);
        } else if (entity.type === 'CIRCLE') {
            // Convert circle to polygon with points
            // Calculate segments based on circumference and desired segment size (already in mm)
            const circumference = 2 * Math.PI * entity.radius;
            const segments = Math.max(minSegments, Math.ceil(circumference / segmentSize));
            let points = [];
            for (let i = 0; i < segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                points.push(newPoint(
                    entity.center.x + Math.cos(angle) * entity.radius,
                    entity.center.y + Math.sin(angle) * entity.radius,
                    entity.center.z || 0
                ));
            }
            let poly = newPolygon().addPoints(points).clean();
            polys.push(poly);
        } else if (entity.type === 'ARC') {
            // Convert arc to polyline
            // DXF arcs always go counterclockwise. Handle angle wrapping.
            let startAngle = entity.startAngle;
            let endAngle = entity.endAngle;
            let angleDiff = endAngle - startAngle;

            // If endAngle < startAngle, arc wraps through 0/360
            if (angleDiff < 0) {
                angleDiff += Math.PI * 2;
            }

            const arcLength = angleDiff * entity.radius;
            const segments = Math.max(minSegments, Math.ceil(arcLength / segmentSize));
            let points = [];

            if (entity.reversed) {
                // Sample backwards from end to start
                for (let i = 0; i <= segments; i++) {
                    const angle = endAngle - (i / segments) * angleDiff;
                    points.push(newPoint(
                        entity.center.x + Math.cos(angle) * entity.radius,
                        entity.center.y + Math.sin(angle) * entity.radius,
                        entity.center.z || 0
                    ));
                }
            } else {
                // Sample forward from start to end
                for (let i = 0; i <= segments; i++) {
                    const angle = startAngle + (i / segments) * angleDiff;
                    points.push(newPoint(
                        entity.center.x + Math.cos(angle) * entity.radius,
                        entity.center.y + Math.sin(angle) * entity.radius,
                        entity.center.z || 0
                    ));
                }
            }

            let poly = newPolygon().addPoints(points);
            poly.setOpen(true);
            polys.push(poly);
        } else if (entity.type === 'SPLINE') {
            // Convert NURBS spline to polyline by sampling (already in mm)
            if (entity.controlPoints.length < 2) {
                continue;
            }

            const points = evaluateSpline(entity, segmentSize, minSegments);
            if (points.length < 2) {
                continue;
            }

            let poly = newPolygon().addPoints(points);
            if (entity.closed) {
                // Remove duplicate end point if closed
                if (poly.appearsClosed()) {
                    poly.points.pop();
                }
            } else {
                poly.setOpen(true);
            }
            polys.push(poly);
        }
    }

    // Nest polygons to identify holes vs outlines
    const sub = fromSoup ? polygons.nest(polys) : polys;
    const nest = sub.filter(p => {
        for (let pc of polys) {
            if (pc === p) {
                return true;
            } else {
                return !pc.isEquivalent(p);
            }
        }
    });

    if (justPoly) {
        return nest;
    }

    // Extrude polygons to 3D
    for (let poly of nest) {
        let obj = poly.extrude(depth * scale);
        objs.push(obj);
    }

    return objs;
}

function extractEntities(lines) {
    const entities = [];
    let inEntities = false;
    let i = 0;

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        // Check if we're in the ENTITIES section
        if (code === '0' && value === 'SECTION') {
            if (i + 3 < lines.length && lines[i + 2] === '2' && lines[i + 3] === 'ENTITIES') {
                inEntities = true;
                i += 4;
                continue;
            }
        }

        if (code === '0' && value === 'ENDSEC' && inEntities) {
            break;
        }

        if (inEntities && code === '0') {
            if (value === 'POLYLINE') {
                const entity = parsePolyline(lines, i);
                if (entity) {
                    entities.push(entity);
                    i = entity.endIndex;
                    continue;
                }
            } else if (value === 'LWPOLYLINE') {
                const entity = parseLWPolyline(lines, i);
                if (entity) {
                    entities.push(entity);
                    i = entity.endIndex;
                    continue;
                }
            } else if (value === 'LINE') {
                const entity = parseLine(lines, i);
                if (entity) {
                    entities.push(entity);
                    i = entity.endIndex;
                    continue;
                }
            } else if (value === 'CIRCLE') {
                const entity = parseCircle(lines, i);
                if (entity) {
                    entities.push(entity);
                    i = entity.endIndex;
                    continue;
                }
            } else if (value === 'ARC') {
                const entity = parseArc(lines, i);
                if (entity) {
                    entities.push(entity);
                    i = entity.endIndex;
                    continue;
                }
            } else if (value === 'SPLINE') {
                const entity = parseSpline(lines, i);
                if (entity) {
                    entities.push(entity);
                    i = entity.endIndex;
                    continue;
                }
            }
        }

        i += 2;
    }

    return entities;
}

function parsePolyline(lines, start) {
    let i = start + 2;
    let closed = false;
    const points = [];

    // Read polyline flags
    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '70') {
            // Polyline flag: 1 = closed
            closed = (parseInt(value) & 1) === 1;
        }

        if (code === '0' && value === 'VERTEX') {
            const vertex = parseVertex(lines, i);
            if (vertex) {
                points.push(vertex.point);
                i = vertex.endIndex;
                continue;
            }
        }

        if (code === '0' && value === 'SEQEND') {
            return { type: 'POLYLINE', points, closed, endIndex: i + 2 };
        }

        i += 2;
    }

    return null;
}

function parseVertex(lines, start) {
    let i = start + 2;
    const point = { x: 0, y: 0, z: 0 };

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '10') point.x = parseFloat(value);
        if (code === '20') point.y = parseFloat(value);
        if (code === '30') point.z = parseFloat(value);

        if (code === '0') {
            return { point, endIndex: i };
        }

        i += 2;
    }

    return { point, endIndex: i };
}

function parseLWPolyline(lines, start) {
    let i = start + 2;
    let closed = false;
    const points = [];
    let currentPoint = null;

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '70') {
            closed = (parseInt(value) & 1) === 1;
        }

        if (code === '10') {
            if (currentPoint) {
                points.push(currentPoint);
            }
            currentPoint = { x: parseFloat(value), y: 0, z: 0 };
        }

        if (code === '20' && currentPoint) {
            currentPoint.y = parseFloat(value);
        }

        if (code === '0') {
            if (currentPoint) {
                points.push(currentPoint);
            }
            return { type: 'LWPOLYLINE', points, closed, endIndex: i };
        }

        i += 2;
    }

    if (currentPoint) {
        points.push(currentPoint);
    }

    return { type: 'LWPOLYLINE', points, closed, endIndex: i };
}

function parseLine(lines, start) {
    let i = start + 2;
    const start_point = { x: 0, y: 0, z: 0 };
    const end_point = { x: 0, y: 0, z: 0 };

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '10') start_point.x = parseFloat(value);
        if (code === '20') start_point.y = parseFloat(value);
        if (code === '30') start_point.z = parseFloat(value);
        if (code === '11') end_point.x = parseFloat(value);
        if (code === '21') end_point.y = parseFloat(value);
        if (code === '31') end_point.z = parseFloat(value);

        if (code === '0') {
            return { type: 'LINE', start: start_point, end: end_point, endIndex: i };
        }

        i += 2;
    }

    return { type: 'LINE', start: start_point, end: end_point, endIndex: i };
}

function parseCircle(lines, start) {
    let i = start + 2;
    const center = { x: 0, y: 0, z: 0 };
    let radius = 0;

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '10') center.x = parseFloat(value);
        if (code === '20') center.y = parseFloat(value);
        if (code === '30') center.z = parseFloat(value);
        if (code === '40') radius = parseFloat(value);

        if (code === '0') {
            return { type: 'CIRCLE', center, radius, endIndex: i };
        }

        i += 2;
    }

    return { type: 'CIRCLE', center, radius, endIndex: i };
}

function parseArc(lines, start) {
    let i = start + 2;
    const center = { x: 0, y: 0, z: 0 };
    let radius = 0;
    let startAngle = 0;
    let endAngle = 0;

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '10') center.x = parseFloat(value);
        if (code === '20') center.y = parseFloat(value);
        if (code === '30') center.z = parseFloat(value);
        if (code === '40') radius = parseFloat(value);
        if (code === '50') startAngle = parseFloat(value) * Math.PI / 180; // Convert to radians
        if (code === '51') endAngle = parseFloat(value) * Math.PI / 180; // Convert to radians

        if (code === '0') {
            return { type: 'ARC', center, radius, startAngle, endAngle, endIndex: i };
        }

        i += 2;
    }

    return { type: 'ARC', center, radius, startAngle, endAngle, endIndex: i };
}

function parseSpline(lines, start) {
    let i = start + 2;
    let degree = 3; // default cubic
    let closed = false;
    const controlPoints = [];
    const knots = [];
    let numKnots = 0;
    let numControlPoints = 0;

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '70') {
            // Spline flag: bit 0 (1) = closed
            closed = (parseInt(value) & 1) === 1;
        }
        if (code === '71') degree = parseInt(value);
        if (code === '72') numKnots = parseInt(value);
        if (code === '73') numControlPoints = parseInt(value);
        if (code === '40') {
            // Knot value
            knots.push(parseFloat(value));
        }
        if (code === '10') {
            // Control point X - start new point
            controlPoints.push({ x: parseFloat(value), y: 0, z: 0 });
        }
        if (code === '20' && controlPoints.length > 0) {
            // Control point Y
            controlPoints[controlPoints.length - 1].y = parseFloat(value);
        }
        if (code === '30' && controlPoints.length > 0) {
            // Control point Z
            controlPoints[controlPoints.length - 1].z = parseFloat(value);
        }

        if (code === '0') {
            return { type: 'SPLINE', degree, closed, knots, controlPoints, endIndex: i };
        }

        i += 2;
    }

    return { type: 'SPLINE', degree, closed, knots, controlPoints, endIndex: i };
}

// Evaluate NURBS B-spline curve to generate sample points (entities already scaled to mm)
function evaluateSpline(entity, segmentSize, minSegments) {
    const { degree, controlPoints, knots, closed } = entity;

    if (controlPoints.length < degree + 1 || knots.length === 0) {
        // Degenerate spline, just return control points
        return controlPoints.map(p => newPoint(p.x, p.y, p.z));
    }

    // Estimate curve length by summing control point distances (rough approximation)
    let estimatedLength = 0;
    for (let i = 1; i < controlPoints.length; i++) {
        const dx = controlPoints[i].x - controlPoints[i-1].x;
        const dy = controlPoints[i].y - controlPoints[i-1].y;
        estimatedLength += Math.sqrt(dx * dx + dy * dy);
    }

    // Calculate number of samples
    const numSamples = Math.max(minSegments, Math.ceil(estimatedLength / segmentSize));
    const points = [];

    // Find parameter range (first and last non-repeated knot values)
    const knotStart = knots[degree];
    const knotEnd = knots[knots.length - degree - 1];

    if (knotStart >= knotEnd) {
        // Invalid knot vector, return control points
        return controlPoints.map(p => newPoint(p.x, p.y, p.z));
    }

    // Sample the curve
    for (let i = 0; i <= numSamples; i++) {
        const t = knotStart + (i / numSamples) * (knotEnd - knotStart);
        const point = evaluateNURBS(t, degree, controlPoints, knots);
        points.push(newPoint(point.x, point.y, point.z));
    }

    return points;
}

// Evaluate a single point on a NURBS curve using De Boor's algorithm
function evaluateNURBS(t, degree, controlPoints, knots) {
    const n = controlPoints.length - 1;

    // Clamp t to valid range
    t = Math.max(knots[degree], Math.min(knots[n + 1], t));

    // Find knot span (which segment t falls into)
    let span = degree;
    while (span <= n && knots[span + 1] <= t) {
        span++;
    }
    if (span > n) span = n;

    // Compute basis functions using Cox-de Boor recursion
    const N = [];
    for (let i = 0; i <= n; i++) {
        N[i] = [];
    }

    // Initialize degree 0 basis functions
    for (let i = 0; i <= n; i++) {
        if (t >= knots[i] && t < knots[i + 1]) {
            N[i][0] = 1.0;
        } else {
            N[i][0] = 0.0;
        }
    }
    // Special case for last knot
    if (t === knots[n + 1]) {
        N[n][0] = 1.0;
    }

    // Compute higher degree basis functions
    for (let k = 1; k <= degree; k++) {
        for (let i = 0; i <= n; i++) {
            let c1 = 0, c2 = 0;

            if (N[i][k - 1] !== 0) {
                if (knots[i + k] !== knots[i]) {
                    c1 = ((t - knots[i]) / (knots[i + k] - knots[i])) * N[i][k - 1];
                }
            }

            if (i + 1 <= n && N[i + 1][k - 1] !== 0) {
                if (knots[i + k + 1] !== knots[i + 1]) {
                    c2 = ((knots[i + k + 1] - t) / (knots[i + k + 1] - knots[i + 1])) * N[i + 1][k - 1];
                }
            }

            N[i][k] = c1 + c2;
        }
    }

    // Compute curve point as weighted sum of control points
    let x = 0, y = 0, z = 0;
    for (let i = 0; i <= n; i++) {
        const weight = N[i][degree] || 0;
        x += controlPoints[i].x * weight;
        y += controlPoints[i].y * weight;
        z += controlPoints[i].z * weight;
    }

    return { x, y, z };
}

// Scale all entity coordinates to millimeters
function scaleEntities(entities, scale) {
    if (scale === 1) return; // no scaling needed

    for (let entity of entities) {
        if (entity.type === 'LINE') {
            entity.start.x *= scale;
            entity.start.y *= scale;
            entity.start.z = (entity.start.z || 0) * scale;
            entity.end.x *= scale;
            entity.end.y *= scale;
            entity.end.z = (entity.end.z || 0) * scale;
        } else if (entity.type === 'CIRCLE') {
            entity.center.x *= scale;
            entity.center.y *= scale;
            entity.center.z = (entity.center.z || 0) * scale;
            entity.radius *= scale;
        } else if (entity.type === 'ARC') {
            entity.center.x *= scale;
            entity.center.y *= scale;
            entity.center.z = (entity.center.z || 0) * scale;
            entity.radius *= scale;
        } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
            for (let point of entity.points) {
                point.x *= scale;
                point.y *= scale;
                point.z = (point.z || 0) * scale;
            }
        } else if (entity.type === 'SPLINE') {
            for (let point of entity.controlPoints) {
                point.x *= scale;
                point.y *= scale;
                point.z = (point.z || 0) * scale;
            }
        }
    }
}

// Extract units from DXF header
function extractUnits(lines) {
    let i = 0;
    let inHeader = false;

    while (i < lines.length - 1) {
        const code = lines[i];
        const value = lines[i + 1];

        if (code === '0' && value === 'SECTION') {
            if (i + 3 < lines.length && lines[i + 2] === '2' && lines[i + 3] === 'HEADER') {
                inHeader = true;
                i += 4;
                continue;
            }
        }

        if (code === '0' && value === 'ENDSEC' && inHeader) {
            break;
        }

        if (inHeader && code === '9' && value === '$INSUNITS') {
            // Next line should be 70, followed by the unit code
            if (i + 3 < lines.length && lines[i + 2] === '70') {
                const unitCode = parseInt(lines[i + 3]);
                // DXF INSUNITS codes: 0=unitless, 1=inches, 2=feet, 4=mm, 5=cm, 6=meters
                switch (unitCode) {
                    case 1: return 'inch';
                    case 2: return 'foot';
                    case 4: return 'mm';
                    case 5: return 'cm';
                    case 6: return 'meter';
                    default: return 'mm'; // default to mm for unitless
                }
            }
        }

        i += 2;
    }

    return 'mm'; // default to millimeters
}

// Get scale factor to convert from input units to millimeters
function getScaleToMM(inputUnits) {
    // Scale factors to convert to mm (Kiri:Moto's internal unit)
    const toMM = {
        'mm': 1,
        'cm': 10,
        'meter': 1000,
        'inch': 25.4,
        'foot': 304.8
    };

    return toMM[inputUnits] || 1;
}

// Stitch together open paths that share endpoints
function stitchPaths(entities, tolerance = 0.01) {
    const stitched = [];
    const used = new Set();

    // Helper to check if two points are within tolerance
    const pointsMatch = (p1, p2) => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = (p1.z || 0) - (p2.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz) < tolerance;
    };

    // Helper to get endpoints of an entity
    const getEndpoints = (entity) => {
        if (entity.type === 'LINE') {
            return { start: entity.start, end: entity.end };
        } else if (entity.type === 'ARC') {
            // Calculate actual arc endpoints
            const startX = entity.center.x + Math.cos(entity.startAngle) * entity.radius;
            const startY = entity.center.y + Math.sin(entity.startAngle) * entity.radius;
            const endX = entity.center.x + Math.cos(entity.endAngle) * entity.radius;
            const endY = entity.center.y + Math.sin(entity.endAngle) * entity.radius;
            const start = { x: startX, y: startY, z: entity.center.z || 0 };
            const end = { x: endX, y: endY, z: entity.center.z || 0 };
            // If arc is reversed, swap the endpoints
            if (entity.reversed) {
                return { start: end, end: start };
            }
            return { start, end };
        } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
            if (entity.closed || entity.points.length < 2) return null;
            return {
                start: entity.points[0],
                end: entity.points[entity.points.length - 1]
            };
        }
        return null;
    };

    // Helper to convert entity to points
    const entityToPoints = (entity) => {
        if (entity.type === 'LINE') {
            return [entity.start, entity.end];
        } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
            return [...entity.points];
        }
        // For ARC and other types, return null (will be converted later in main loop)
        return null;
    };

    // First, identify stitchable entities (LINE, ARC, open POLYLINE)
    const stitchable = [];
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (entity.type === 'LINE' || entity.type === 'ARC' ||
            ((entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') && !entity.closed)) {
            stitchable.push({ entity, index: i });
        }
    }

    // Try to stitch paths together
    for (let i = 0; i < stitchable.length; i++) {
        if (used.has(i)) continue;

        const { entity, index } = stitchable[i];
        const endpoints = getEndpoints(entity);
        if (!endpoints) {
            stitched.push(entity);
            used.add(i);
            continue;
        }

        // Start a new path
        const path = [entity];
        used.add(i);
        let currentEnd = endpoints.end;
        let currentStart = endpoints.start;
        let foundMatch = true;

        // Keep extending the path
        while (foundMatch) {
            foundMatch = false;

            for (let j = 0; j < stitchable.length; j++) {
                if (used.has(j)) continue;

                const nextEndpoints = getEndpoints(stitchable[j].entity);
                if (!nextEndpoints) continue;

                // Check if this entity connects to current end
                if (pointsMatch(currentEnd, nextEndpoints.start)) {
                    path.push(stitchable[j].entity);
                    currentEnd = nextEndpoints.end;
                    used.add(j);
                    foundMatch = true;
                    break;
                } else if (pointsMatch(currentEnd, nextEndpoints.end)) {
                    // Need to reverse this entity
                    const reversed = reverseEntity(stitchable[j].entity);
                    path.push(reversed);
                    // After reversing, the start becomes the new end
                    const reversedEndpoints = getEndpoints(reversed);
                    currentEnd = reversedEndpoints.end;
                    used.add(j);
                    foundMatch = true;
                    break;
                }
                // Check if this entity connects to current start (prepend)
                else if (pointsMatch(currentStart, nextEndpoints.end)) {
                    path.unshift(stitchable[j].entity);
                    currentStart = nextEndpoints.start;
                    used.add(j);
                    foundMatch = true;
                    break;
                } else if (pointsMatch(currentStart, nextEndpoints.start)) {
                    // Need to reverse and prepend
                    const reversed = reverseEntity(stitchable[j].entity);
                    path.unshift(reversed);
                    // After reversing, the end becomes the new start
                    const reversedEndpoints = getEndpoints(reversed);
                    currentStart = reversedEndpoints.start;
                    used.add(j);
                    foundMatch = true;
                    break;
                }
            }
        }

        // Convert path to a single stitched entity
        if (path.length === 1) {
            stitched.push(path[0]);
        } else {
            // Combine into stitched polyline - mark for later conversion
            const stitchedEntity = {
                type: 'STITCHED',
                parts: path,
                closed: pointsMatch(currentStart, currentEnd)
            };
            stitched.push(stitchedEntity);
        }
    }

    // Add non-stitchable entities (CIRCLE, SPLINE, closed POLYLINE)
    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (entity.type === 'CIRCLE' || entity.type === 'SPLINE' ||
            ((entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') && entity.closed)) {
            stitched.push(entity);
        }
    }

    return stitched;
}

// Reverse an entity's direction
function reverseEntity(entity) {
    if (entity.type === 'LINE') {
        return {
            type: 'LINE',
            start: entity.end,
            end: entity.start
        };
    } else if (entity.type === 'ARC') {
        // Mark the arc as reversed so it gets sampled in reverse
        return {
            type: 'ARC',
            center: entity.center,
            radius: entity.radius,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle,
            reversed: true
        };
    } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
        return {
            type: entity.type,
            points: [...entity.points].reverse(),
            closed: entity.closed
        };
    }
    return entity;
}

// Convert entity to array of points (entities already scaled to mm)
function convertEntityToPoints(entity, segmentSize, minSegments) {
    if (entity.type === 'LINE') {
        return [entity.start, entity.end];
    } else if (entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
        return [...entity.points];
    } else if (entity.type === 'ARC') {
        // DXF arcs always go counterclockwise. Handle angle wrapping.
        let startAngle = entity.startAngle;
        let endAngle = entity.endAngle;
        let angleDiff = endAngle - startAngle;

        // If endAngle < startAngle, arc wraps through 0/360
        if (angleDiff < 0) {
            angleDiff += Math.PI * 2;
        }

        const arcLength = angleDiff * entity.radius;
        const segments = Math.max(minSegments, Math.ceil(arcLength / segmentSize));
        const points = [];

        if (entity.reversed) {
            // Sample backwards from end to start
            for (let i = 0; i <= segments; i++) {
                const angle = endAngle - (i / segments) * angleDiff;
                points.push({
                    x: entity.center.x + Math.cos(angle) * entity.radius,
                    y: entity.center.y + Math.sin(angle) * entity.radius,
                    z: entity.center.z || 0
                });
            }
        } else {
            // Sample forward from start to end
            for (let i = 0; i <= segments; i++) {
                const angle = startAngle + (i / segments) * angleDiff;
                points.push({
                    x: entity.center.x + Math.cos(angle) * entity.radius,
                    y: entity.center.y + Math.sin(angle) * entity.radius,
                    z: entity.center.z || 0
                });
            }
        }

        return points;
    }
    return [];
}
