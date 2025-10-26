/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { tool as MeshTool } from '../mesh/tool.js';

const { Vector3 } = THREE;

/**
 * Convert STL triangles to STEP file format
 *
 * @param {Array} triangles - Array of triangle objects with vertices: [{v1, v2, v3}, ...]
 *                           where v1, v2, v3 are {x, y, z} objects or Vector3 instances
 * @param {Object} options - Optional parameters
 * @param {string} options.productName - Name for the STEP product (default: 'mesh')
 * @param {string} options.units - Units: 'mm', 'cm', 'm', 'inch' (default: 'mm')
 * @returns {string} STEP file content as a string
 */
export function meshToSTEP(triangles, options = {}) {
    const productName = options.productName || 'mesh';
    const units = options.units || 'mm';

    // Build vertex and triangle topology
    const vertices = [];
    const vertexMap = new Map(); // Map vertex coords to index
    const faces = [];

    // Helper to find or add vertex
    function getOrAddVertex(v) {
        const vec = v instanceof Vector3 ? v : new Vector3(v.x, v.y, v.z);

        // Check if vertex already exists
        for (let i = 0; i < vertices.length; i++) {
            if (vertices[i].equals(vec)) {
                return i;
            }
        }

        // Add new vertex
        vertices.push(vec);
        return vertices.length - 1;
    }

    // Process triangles
    for (const tri of triangles) {
        const idx0 = getOrAddVertex(tri.v1 || tri.vertices[0]);
        const idx1 = getOrAddVertex(tri.v2 || tri.vertices[1]);
        const idx2 = getOrAddVertex(tri.v3 || tri.vertices[2]);

        faces.push([idx0, idx1, idx2]);
    }

    // Generate STEP file
    let step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('STL to STEP Conversion'),'2;1');
FILE_NAME('${productName}.step','${new Date().toISOString()}',(''),(''),'stl-to-step','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
`;

    let id = 1;

    // Units mapping
    const unitMultiplier = {
        'mm': '.MILLI.',
        'cm': '.CENTI.',
        'm': '',
        'inch': '.INCH.'
    };
    const unitPrefix = unitMultiplier[units] || '.MILLI.';

    // Units and context
    const lengthUnit = id++;
    const planeAngleUnit = id++;
    const solidAngleUnit = id++;

    step += `#${lengthUnit}=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(${unitPrefix},.METRE.));\n`;
    step += `#${planeAngleUnit}=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));\n`;
    step += `#${solidAngleUnit}=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());\n`;

    const uncertainty = id++;
    step += `#${uncertainty}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${lengthUnit},'distance_accuracy_value','confusion accuracy');\n`;

    // Geometric representation context
    const geomContextId = id++;
    step += `#${geomContextId}=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnit},#${planeAngleUnit},#${solidAngleUnit}))REPRESENTATION_CONTEXT('ID1','3D'));\n`;

    // Application context
    const appContext = id++;
    step += `#${appContext}=APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies');\n`;

    const appProtocol = id++;
    step += `#${appProtocol}=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',1998,#${appContext});\n`;

    // Product definition
    const productId = id++;
    step += `#${productId}=PRODUCT('${productName}','${productName}','',(#${appContext}));\n`;

    const productDefFormId = id++;
    step += `#${productDefFormId}=PRODUCT_DEFINITION_FORMATION('','',#${productId});\n`;

    const productDefCtx = id++;
    step += `#${productDefCtx}=PRODUCT_DEFINITION_CONTEXT('part definition',#${appContext},'design');\n`;

    const productDefId = id++;
    step += `#${productDefId}=PRODUCT_DEFINITION('design','',#${productDefFormId},#${productDefCtx});\n`;

    // Shape representation - reserve ID
    const shapeRepId = id++;

    // Create cartesian points for all vertices
    const vertexIds = [];
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const pointId = id++;
        step += `#${pointId}=CARTESIAN_POINT('',(${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}));\n`;
        vertexIds.push(pointId);
    }

    // Create vertex points
    const vertexPointIds = [];
    for (let i = 0; i < vertices.length; i++) {
        const vpId = id++;
        step += `#${vpId}=VERTEX_POINT('',#${vertexIds[i]});\n`;
        vertexPointIds.push(vpId);
    }

    // Advanced B-rep shape representation
    const manifoldId = id++;
    const closedShellId = id++;

    step += `#${shapeRepId}=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${manifoldId}),#${geomContextId});\n`;
    step += `#${manifoldId}=MANIFOLD_SOLID_BREP('',#${closedShellId});\n`;

    const faceIds = [];
    for (let i = 0; i < faces.length; i++) {
        faceIds.push(id++);
    }

    step += `#${closedShellId}=CLOSED_SHELL('',(${faceIds.map(fid => `#${fid}`).join(',')}));\n`;

    // Create each triangular face
    for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
        const faceVertices = faces[faceIdx];
        const faceId = faceIds[faceIdx];

        const faceOuterBoundId = id++;
        const edgeLoopId = id++;

        // Create edges for this triangular face
        const orientedEdgeIds = [];

        for (let i = 0; i < 3; i++) {
            const v1Idx = faceVertices[i];
            const v2Idx = faceVertices[(i + 1) % 3];

            const orientedEdgeId = id++;
            const edgeCurveId = id++;
            const lineId = id++;
            const vectorId = id++;
            const directionId = id++;

            orientedEdgeIds.push(orientedEdgeId);

            // Direction vector
            const v1 = vertices[v1Idx];
            const v2 = vertices[v2Idx];
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const dz = v2.z - v1.z;
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (len < 1e-10) {
                console.warn(`Warning: Degenerate edge in face ${faceIdx}`);
                continue;
            }

            step += `#${directionId}=DIRECTION('',(${(dx / len).toFixed(6)},${(dy / len).toFixed(6)},${(dz / len).toFixed(6)}));\n`;
            step += `#${vectorId}=VECTOR('',#${directionId},${len.toFixed(6)});\n`;
            step += `#${lineId}=LINE('',#${vertexIds[v1Idx]},#${vectorId});\n`;
            step += `#${edgeCurveId}=EDGE_CURVE('',#${vertexPointIds[v1Idx]},#${vertexPointIds[v2Idx]},#${lineId},.T.);\n`;
            step += `#${orientedEdgeId}=ORIENTED_EDGE('',*,*,#${edgeCurveId},.T.);\n`;
        }

        step += `#${edgeLoopId}=EDGE_LOOP('',(${orientedEdgeIds.map(eid => `#${eid}`).join(',')}));\n`;
        step += `#${faceOuterBoundId}=FACE_OUTER_BOUND('',#${edgeLoopId},.T.);\n`;

        // Create plane for face
        const planeId = id++;
        const axisPlacementId = id++;
        const normalDirId = id++;
        const refDirId = id++;

        // Calculate face normal and reference direction
        const v0 = vertices[faceVertices[0]];
        const v1 = vertices[faceVertices[1]];
        const v2 = vertices[faceVertices[2]];

        const edge1 = v1.clone().sub(v0);
        const edge2 = v2.clone().sub(v0);
        const normal = edge1.clone().cross(edge2).normalize();

        // Calculate face center for plane origin
        const centerX = (v0.x + v1.x + v2.x) / 3;
        const centerY = (v0.y + v1.y + v2.y) / 3;
        const centerZ = (v0.z + v1.z + v2.z) / 3;

        const centerPointId = id++;
        step += `#${centerPointId}=CARTESIAN_POINT('',(${centerX.toFixed(6)},${centerY.toFixed(6)},${centerZ.toFixed(6)}));\n`;

        step += `#${normalDirId}=DIRECTION('',(${normal.x.toFixed(6)},${normal.y.toFixed(6)},${normal.z.toFixed(6)}));\n`;
        const refDir = edge1.normalize();
        step += `#${refDirId}=DIRECTION('',(${refDir.x.toFixed(6)},${refDir.y.toFixed(6)},${refDir.z.toFixed(6)}));\n`;
        step += `#${axisPlacementId}=AXIS2_PLACEMENT_3D('',#${centerPointId},#${normalDirId},#${refDirId});\n`;
        step += `#${planeId}=PLANE('',#${axisPlacementId});\n`;

        step += `#${faceId}=ADVANCED_FACE('',(#${faceOuterBoundId}),#${planeId},.T.);\n`;
    }

    // Product definition shape
    const prodDefShapeId = id++;
    step += `#${prodDefShapeId}=PRODUCT_DEFINITION_SHAPE('','',#${productDefId});\n`;
    step += `#${id++}=SHAPE_DEFINITION_REPRESENTATION(#${prodDefShapeId},#${shapeRepId});\n`;

    step += `ENDSEC;\nEND-ISO-10303-21;\n`;

    return step;
}

/**
 * Convert STL triangles to STEP file format with face merging
 * Groups co-planar connected triangles into larger faces
 *
 * @param {Array} triangles - Array of triangle objects with vertices: [{v1, v2, v3}, ...]
 *                           where v1, v2, v3 are {x, y, z} objects or Vector3 instances
 * @param {Object} options - Optional parameters
 * @param {string} options.productName - Name for the STEP product (default: 'mesh')
 * @param {string} options.units - Units: 'mm', 'cm', 'm', 'inch' (default: 'mm')
 * @param {number} options.angleTolerance - Angle tolerance in degrees for co-planarity (default: 1)
 * @returns {string} STEP file content as a string
 */
export function meshToSTEPWithFaces(triangles, options = {}) {
    const productName = options.productName || 'mesh';
    const units = options.units || 'mm';
    const angleTolerance = options.angleTolerance || 1;
    const radianTolerance = angleTolerance * (Math.PI / 180);

    // Convert triangles to flat vertex array for MeshTool
    const vertices = [];
    for (const tri of triangles) {
        const v1 = tri.v1 || tri.vertices[0];
        const v2 = tri.v2 || tri.vertices[1];
        const v3 = tri.v3 || tri.vertices[2];

        vertices.push(
            v1.x, v1.y, v1.z,
            v2.x, v2.y, v2.z,
            v3.x, v3.y, v3.z
        );
    }

    // Use MeshTool to index faces and find adjacency
    const tool = new MeshTool();
    tool.index(vertices);

    const totalFaces = triangles.length;
    const processed = {};
    const surfaces = [];

    // Find all connected surfaces
    for (let i = 0; i < totalFaces; i++) {
        if (processed[i]) continue;

        // Find all connected co-planar faces starting from this face
        const connectedFaces = tool.findConnectedSurface([i], radianTolerance, undefined, processed);

        if (connectedFaces.length > 0) {
            // Generate outline(s) for this surface
            const outlines = tool.generateOutlines(connectedFaces);

            if (outlines.length > 1) {
                console.log(`Surface with ${connectedFaces.length} faces has ${outlines.length} outlines:`);
                outlines.forEach((outline, idx) => {
                    console.log(`  Outline ${idx}: ${outline.length} vertices`);
                });
            }

            // Sort outlines by area (largest first = outer boundary)
            // Use shoelace formula to calculate signed area
            const outlinesWithArea = outlines.map(outline => {
                let area = 0;
                for (let i = 0; i < outline.length; i++) {
                    const p1 = outline[i];
                    const p2 = outline[(i + 1) % outline.length];
                    area += (p1.x * p2.y - p2.x * p1.y);
                }
                return { outline, area: Math.abs(area) };
            });

            // Sort by area descending (largest = outer boundary)
            outlinesWithArea.sort((a, b) => b.area - a.area);
            const sortedOutlines = outlinesWithArea.map(o => o.outline);

            surfaces.push({ faces: connectedFaces, outlines: sortedOutlines });
        }
    }

    console.log(`Merged ${totalFaces} triangles into ${surfaces.length} faces`);

    // Generate STEP file
    let step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('STL to STEP Conversion with Face Merging'),'2;1');
FILE_NAME('${productName}.step','${new Date().toISOString()}',(''),(''),'stl-to-step','','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
`;

    let id = 1;

    // Units mapping
    const unitMultiplier = {
        'mm': '.MILLI.',
        'cm': '.CENTI.',
        'm': '',
        'inch': '.INCH.'
    };
    const unitPrefix = unitMultiplier[units] || '.MILLI.';

    // Units and context
    const lengthUnit = id++;
    const planeAngleUnit = id++;
    const solidAngleUnit = id++;

    step += `#${lengthUnit}=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(${unitPrefix},.METRE.));\n`;
    step += `#${planeAngleUnit}=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));\n`;
    step += `#${solidAngleUnit}=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());\n`;

    const uncertainty = id++;
    step += `#${uncertainty}=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${lengthUnit},'distance_accuracy_value','confusion accuracy');\n`;

    // Geometric representation context
    const geomContextId = id++;
    step += `#${geomContextId}=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${uncertainty}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnit},#${planeAngleUnit},#${solidAngleUnit}))REPRESENTATION_CONTEXT('ID1','3D'));\n`;

    // Application context
    const appContext = id++;
    step += `#${appContext}=APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies');\n`;

    const appProtocol = id++;
    step += `#${appProtocol}=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',1998,#${appContext});\n`;

    // Product definition
    const productId = id++;
    step += `#${productId}=PRODUCT('${productName}','${productName}','',(#${appContext}));\n`;

    const productDefFormId = id++;
    step += `#${productDefFormId}=PRODUCT_DEFINITION_FORMATION('','',#${productId});\n`;

    const productDefCtx = id++;
    step += `#${productDefCtx}=PRODUCT_DEFINITION_CONTEXT('part definition',#${appContext},'design');\n`;

    const productDefId = id++;
    step += `#${productDefId}=PRODUCT_DEFINITION('design','',#${productDefFormId},#${productDefCtx});\n`;

    // Shape representation - reserve ID
    const shapeRepId = id++;

    // Build vertex map and IDs
    const vertexMap = new Map();
    const cartesianPointIds = new Map();
    const vertexPointIds = new Map();

    function getOrCreateVertex(x, y, z) {
        const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

        if (!vertexMap.has(key)) {
            // Create cartesian point
            const pointId = id++;
            step += `#${pointId}=CARTESIAN_POINT('',(${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}));\n`;
            cartesianPointIds.set(key, pointId);

            // Create vertex point
            const vpId = id++;
            step += `#${vpId}=VERTEX_POINT('',#${pointId});\n`;
            vertexPointIds.set(key, vpId);

            vertexMap.set(key, { pointId, vpId, x, y, z });
        }

        return vertexMap.get(key);
    }

    // Advanced B-rep shape representation
    const manifoldId = id++;
    const closedShellId = id++;

    step += `#${shapeRepId}=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${manifoldId}),#${geomContextId});\n`;
    step += `#${manifoldId}=MANIFOLD_SOLID_BREP('',#${closedShellId});\n`;

    // We'll write the CLOSED_SHELL after creating faces
    // Track which face IDs are actually created
    const createdFaceIds = [];

    // Helper function to merge co-linear edges in an outline
    function mergeColinearEdges(outline) {
        if (outline.length < 3) return outline;

        const tolerance = 1e-6;

        // Helper to check if three points are co-linear
        function areColinear(p1, p2, p3) {
            const v1 = new Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
            const v2 = new Vector3(p3.x - p2.x, p3.y - p2.y, p3.z - p2.z);

            const len1 = v1.length();
            const len2 = v2.length();

            if (len1 < tolerance || len2 < tolerance) return true;

            v1.normalize();
            v2.normalize();

            // Check if vectors are parallel (dot product close to 1 or -1)
            const dot = Math.abs(v1.dot(v2));
            return dot > 1 - tolerance;
        }

        // Mark vertices to keep
        const keep = new Array(outline.length).fill(true);

        // Check each vertex to see if it's on a straight line
        for (let i = 0; i < outline.length; i++) {
            const prev = outline[(i - 1 + outline.length) % outline.length];
            const curr = outline[i];
            const next = outline[(i + 1) % outline.length];

            if (areColinear(prev, curr, next)) {
                keep[i] = false;
            }
        }

        // Build merged array with only kept vertices
        const merged = [];
        for (let i = 0; i < outline.length; i++) {
            if (keep[i]) {
                merged.push(outline[i]);
            }
        }

        return merged.length >= 3 ? merged : outline;
    }

    // Buffer to collect face geometry before writing CLOSED_SHELL
    let faceStepData = '';

    // Create each merged face
    for (let surfaceIdx = 0; surfaceIdx < surfaces.length; surfaceIdx++) {
        const surface = surfaces[surfaceIdx];

        if (!surface.outlines || surface.outlines.length === 0) {
            console.warn(`Skipping invalid surface ${surfaceIdx} with no outlines`);
            continue;
        }

        // Allocate face ID now (only for valid surfaces)
        const faceId = id++;
        createdFaceIds.push(faceId);

        // Process all outlines: first is outer boundary, rest are holes
        const boundIds = [];
        let allVertices = [];

        for (let outlineIdx = 0; outlineIdx < surface.outlines.length; outlineIdx++) {
            let outline = surface.outlines[outlineIdx];

            if (!outline || outline.length < 3) {
                console.warn(`Skipping invalid outline ${outlineIdx} in surface ${surfaceIdx}`);
                continue;
            }

            // Merge co-linear edges
            const originalLength = outline.length;
            outline = mergeColinearEdges(outline);

            if (originalLength !== outline.length) {
                console.log(`  Merged outline ${outlineIdx}: ${originalLength} -> ${outline.length} vertices`);
            }

            if (outline.length < 3) {
                console.warn(`Outline ${outlineIdx} in surface ${surfaceIdx} has < 3 vertices after merging`);
                continue;
            }

            const boundId = id++;
            const edgeLoopId = id++;

            // Create edges for this outline
            const orientedEdgeIds = [];
            const vertices = [];

            // Get vertices and create vertex records
            for (let i = 0; i < outline.length; i++) {
                const pt = outline[i];
                const vertex = getOrCreateVertex(pt.x, pt.y, pt.z);
                vertices.push(vertex);
            }

            // Store vertices from first outline for normal calculation
            if (outlineIdx === 0) {
                allVertices = vertices;
            }

            // For holes, reverse the vertex order to get opposite winding
            const orderedVertices = outlineIdx === 0 ? vertices : vertices.slice().reverse();

            // Create edges
            for (let i = 0; i < orderedVertices.length; i++) {
                const v1 = orderedVertices[i];
                const v2 = orderedVertices[(i + 1) % orderedVertices.length];

                const dx = v2.x - v1.x;
                const dy = v2.y - v1.y;
                const dz = v2.z - v1.z;
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

                if (len < 1e-10) {
                    console.warn(`Warning: Degenerate edge in surface ${surfaceIdx}, outline ${outlineIdx}`);
                    continue;
                }

                const orientedEdgeId = id++;
                const edgeCurveId = id++;
                const lineId = id++;
                const vectorId = id++;
                const directionId = id++;

                orientedEdgeIds.push(orientedEdgeId);

                faceStepData += `#${directionId}=DIRECTION('',(${(dx / len).toFixed(6)},${(dy / len).toFixed(6)},${(dz / len).toFixed(6)}));\n`;
                faceStepData += `#${vectorId}=VECTOR('',#${directionId},${len.toFixed(6)});\n`;
                faceStepData += `#${lineId}=LINE('',#${v1.pointId},#${vectorId});\n`;
                faceStepData += `#${edgeCurveId}=EDGE_CURVE('',#${v1.vpId},#${v2.vpId},#${lineId},.T.);\n`;
                faceStepData += `#${orientedEdgeId}=ORIENTED_EDGE('',*,*,#${edgeCurveId},.T.);\n`;
            }

            if (orientedEdgeIds.length === 0) {
                console.warn(`No valid edges in outline ${outlineIdx} of surface ${surfaceIdx}`);
                continue;
            }

            faceStepData += `#${edgeLoopId}=EDGE_LOOP('',(${orientedEdgeIds.map(eid => `#${eid}`).join(',')}));\n`;

            // First outline is FACE_OUTER_BOUND, subsequent ones are holes (FACE_BOUND)
            if (outlineIdx === 0) {
                faceStepData += `#${boundId}=FACE_OUTER_BOUND('',#${edgeLoopId},.T.);\n`;
            } else {
                faceStepData += `#${boundId}=FACE_BOUND('',#${edgeLoopId},.T.);\n`;
            }

            boundIds.push(boundId);
        }

        if (boundIds.length === 0 || allVertices.length < 3) {
            console.warn(`Skipping surface ${surfaceIdx} - no valid bounds`);
            // Remove the face ID we allocated since we're not creating this face
            createdFaceIds.pop();
            continue;
        }

        // Calculate face normal from first three vertices of outer boundary
        const v0 = new Vector3(allVertices[0].x, allVertices[0].y, allVertices[0].z);
        const v1 = new Vector3(allVertices[1].x, allVertices[1].y, allVertices[1].z);
        const v2 = new Vector3(allVertices[2].x, allVertices[2].y, allVertices[2].z);

        const edge1 = v1.clone().sub(v0);
        const edge2 = v2.clone().sub(v0);
        const normal = edge1.clone().cross(edge2).normalize();

        // Calculate face center for plane origin
        let centerX = 0, centerY = 0, centerZ = 0;
        for (let vertex of allVertices) {
            centerX += vertex.x;
            centerY += vertex.y;
            centerZ += vertex.z;
        }
        centerX /= allVertices.length;
        centerY /= allVertices.length;
        centerZ /= allVertices.length;

        const centerPointId = id++;
        faceStepData += `#${centerPointId}=CARTESIAN_POINT('',(${centerX.toFixed(6)},${centerY.toFixed(6)},${centerZ.toFixed(6)}));\n`;

        const planeId = id++;
        const axisPlacementId = id++;
        const normalDirId = id++;
        const refDirId = id++;

        faceStepData += `#${normalDirId}=DIRECTION('',(${normal.x.toFixed(6)},${normal.y.toFixed(6)},${normal.z.toFixed(6)}));\n`;
        const refDir = edge1.normalize();
        faceStepData += `#${refDirId}=DIRECTION('',(${refDir.x.toFixed(6)},${refDir.y.toFixed(6)},${refDir.z.toFixed(6)}));\n`;
        faceStepData += `#${axisPlacementId}=AXIS2_PLACEMENT_3D('',#${centerPointId},#${normalDirId},#${refDirId});\n`;
        faceStepData += `#${planeId}=PLANE('',#${axisPlacementId});\n`;

        // Create ADVANCED_FACE with all bounds (outer + holes)
        faceStepData += `#${faceId}=ADVANCED_FACE('',(${boundIds.map(bid => `#${bid}`).join(',')}),#${planeId},.T.);\n`;
    }

    // Now write CLOSED_SHELL with only the faces that were actually created
    step += `#${closedShellId}=CLOSED_SHELL('',(${createdFaceIds.map(fid => `#${fid}`).join(',')}));\n`;

    // Append all the face geometry
    step += faceStepData;

    // Product definition shape
    const prodDefShapeId = id++;
    step += `#${prodDefShapeId}=PRODUCT_DEFINITION_SHAPE('','',#${productDefId});\n`;
    step += `#${id++}=SHAPE_DEFINITION_REPRESENTATION(#${prodDefShapeId},#${shapeRepId});\n`;

    step += `ENDSEC;\nEND-ISO-10303-21;\n`;

    return step;
}
