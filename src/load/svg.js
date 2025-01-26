/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// use: add.three
gapp.register("load.svg", (root, exports) => {

const { load } = root;

load.SVG = {
    parse,
    parseAsync
};

function parseAsync(text, opt) {
    return new Promise((resolve,reject) => {
        resolve(parse(text, opt));
    });
}

function parse(text, opt = { }) {
    const justPoly = opt.flat || false;
    const fromSoup = opt.soup !== false || justPoly;
    const rez = (opt.resolution || 1);
    const dpi = (opt.dpi || 0);
    const segmin = Math.max(1, opt.segmin || 10);
    const data = new THREE.SVGLoader().parse(text);
    const paths = data.paths;
    const xmlat = data.xml.attributes;
    const objs = [];
    const polys = [];
    const isinch = xmlat.width?.value.endsWith('in');
    const scale = isinch ? 25.4 : (dpi ? 1 / (dpi / 25.4) : 1);
    const depth = parseFloat(opt.depth || xmlat['data-km-extrude']?.value
        || xmlat['extrude']?.value
        || 5);

    for (let i = 0; i < paths.length; i++) {
        let path = paths[i];
        let shapes = path.toShapes(true);
        let type = path.userData?.node?.nodeName;
        let width = path.userData?.style?.strokeWidth;
        let miter = path.userData?.style?.strokeMiterLimit;
        for (let sub of path.subPaths) {
            let points = sub.curves.map(curve => {
                let length = curve.getLength();
                let segs = curve.type === 'LineCurve' ?
                    1 : Math.max(Math.ceil(length * rez), segmin);
                return curve.getPoints(segs);
            }).flat();
            if (points.length < 3) {
                // console.log({ sub, length, points });
                continue;
            }
            let poly = base.newPolygon().addPoints(points.map(p => base.newPoint(p.x, -p.y, 0)));
            if (poly.appearsClosed()) poly.points.pop();
            if (type === 'polyline') poly.setOpen(true);
            poly._svg = { width, miter };
            polys.push(poly);
            if (scale !== 1) {
                poly.scale({ x: scale, y: scale, z: 1 });
            }
        }
    }

    const sub = fromSoup ? base.polygons.nest(polys) : polys;
    const nest = sub.filter(p => {
        // filter duplicates
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

    for (let poly of nest) {
        let obj = poly.extrude(depth);
        objs.push(obj);
    }

    return objs;
}

});
