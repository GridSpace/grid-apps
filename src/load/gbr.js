/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// use: geo.bounds
// use: geo.polygon
// use: geo.polygons
// use: ext.gerber
gapp.register("load.gbr", (root, exports) => {

const { load } = root;

load.GBR = {
    parse,
    toMesh
};

function toMesh(text, opt = { z: 3 }) {
    const { open, closed, circs, rects } =  parse(text);
    const nest = base.polygons.nest([...closed, ...circs, ...rects], true);
    console.log({ nest });
    const obj = [];
    for (let poly of nest) {
        obj.appendAll(poly.extrude(opt.z || 3));
    }
    return obj;
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
    const { minx, maxx, miny, maxy } = bounds;
    for (let poly of [...polys, ...circs, ...rects]) {
        poly.move({
            x: -((maxx-minx)/2 + minx),
            y: -((maxy-miny)/2 + miny),
            z: 0
        });
    }
    const open = [];
    const closed = [];
    for (let poly of polys) {
        if (poly.appearsClosed()) {
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
