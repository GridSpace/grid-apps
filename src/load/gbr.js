/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// use: geo.bounds
// use: geo.polygon
// use: geo.polygons
// use: ext.gerber
// use: geo.csg
gapp.register("load.gbr", (root, exports) => {

const { load } = root;
const POLYS = base.polygons;
const CSG = base.CSG;

load.GBR = {
    parse,
    toMesh
};

function toMesh(text, opt = { z: 1 }) {
    // for now ignore open trace lines
    // future exports should allow a way to represent them for cnc
    const { open, closed, circs, rects } =  parse(text);

    // for the copper layer:
    // should produce one top level poly which is the board outline
    // next level down should be the remaining copper trace which we
    // subtract from the board to produce paths that can be milled
    const nest = POLYS.nest([...closed, ...circs, ...rects], true);

    const flat = [];
    for (let n of nest) n.flattenTo(flat, [], true);

    const z0 = opt.z  || opt.z0 || 1;
    const z1 = opt.z1 || 0.25;

    // board outline
    const top = [];
    for (let poly of flat.filter(p => p.depth === 0)) {
        top.push(poly.extrude(z0));
    }

    // nothing to render
    if (top.length === 0) {
        return [];
    }

    // copper traces
    const mid = [];
    for (let poly of flat.filter(p => p.depth === 1)) {
        mid.push(poly.extrude(z1, z0 - z1));
    }

    // if no traces, return board
    if (mid.length === 0) {
        return top[0];
    }

    // inner polys for traces which we will punch thru for vias
    const low = [];
    for (let poly of flat.filter(p => p.depth === 2)) {
        low.push(poly.extrude(z0));
    }

    // convert vertex arrays to csg mesh definitions
    const topMesh = CSG.fromPositionArray(top[0]);
    const midMesh = mid.map(v => CSG.fromPositionArray(v));

    // subtract mid from top
    const v0Mesh = CSG.subtract(topMesh, ...midMesh);

    if (low.length === 0) {
        return CSG.toPositionArray(v0Mesh);
    }

    // subtract low (vias) from remaining
    const lowMesh = low.map(v => CSG.fromPositionArray(v))
    const v1Mesh = CSG.subtract(v0Mesh, ...lowMesh);

    return CSG.toPositionArray(v1Mesh);
}

function parse(text) {
    let fact = 1000000;
    let tools = {};
    let tool;
    let poly;
    let polys = [];
    let circs = [];
    let rects = [];
    let last = {};
    let bounds = base.newBounds();
    let p = TracespaceParser.createParser();
    p.feed(text);
    let r = p.results();
    let c = r.children
        .filter(c => {
            switch (c.type) {
                case 'toolDefinition':
                    tools[c.code] = c.shape;
                    break;
                case 'toolChange':
                    tool = { code: c.code, shape: tools[c.code] };
                    break;
                case 'graphic':
                    c.tool = tool;
                    return true;
            }
            return false;
        })
        .map(r => {
            return {
                type: r.graphic,
                tool: r.tool,
                x: parseInt(r.coordinates.x),
                y: parseInt(r.coordinates.y)
            };
        })
        .map(r => {
            const { x, y, tool, type } = r;
            const pos = { x:x/fact, y:y/fact, z: 0};
            bounds.update(pos);
            switch (type) {
                case 'move':
                    if (true && poly && last.x === x && last.y === y && last.tool === tool) {
                        // console.log('continuation');
                    } else {
                        poly = base.newPolygon().setOpen().add(pos.x, pos.y, 0);
                        poly.tool = tool;
                        polys.push(poly);
                    }
                    break;
                case 'segment':
                    poly.add(pos.x, pos.y, 0);
                    break;
                case 'shape':
                    poly = undefined;
                    let { shape } = tool;
                    switch (shape.type) {
                        case 'obround':
                            if (shape.xSize === shape.ySize) {
                                circs.push(base.newPolygon().centerCircle(pos, shape.xSize / 2, 20));
                            } else {
                                console.log('TODO', shape);
                            }
                            break;
                        case 'circle':
                            circs.push(base.newPolygon().centerCircle(pos, shape.diameter / 2, 20));
                            break;
                        case 'rectangle':
                            rects.push(base.newPolygon().centerRectangle(pos, shape.xSize, shape.ySize));
                            break;
                        default:
                            console.log('TODO', shape);
                            break;
                    }
                    break;
            }
            last = { x, y, tool };
            return r;
        });
    // center board on origin
    const { minx, maxx, miny, maxy } = bounds;
    for (let poly of [...polys, ...circs, ...rects]) {
        poly.move({
            x: -((maxx-minx)/2 + minx),
            y: -((maxy-miny)/2 + miny),
            z: 0
        });
    }
    // separate open and closed polys (traces vs areas)
    const open = [];
    const closed = [];
    for (let poly of polys) {
        if (poly.appearsClosed()) {
            // clean up gnarly overlapping lines
            // make contiguous, simpler enclosed areas
            closed.push(...poly.simplify());
        } else {
            open.push(poly);
        }
    }
    // const nest = base.polygons.nest([...closed, ...circs, ...rects], true);
    // console.log({ nest });
    return { open, closed, circs, rects };
}

});
