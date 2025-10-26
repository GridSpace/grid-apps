/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

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
