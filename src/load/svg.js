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

function parse(text, opt = { soup: true }) {
    const fromSoup = opt.soup || false;
    const objs = [];
    const data = new THREE.SVGLoader().parse(text);
    const paths = data.paths;
    const xmlat = data.xml.attributes;
    const polys = fromSoup ? [] : undefined;
    const depth = opt.depth || xmlat['data-km-extrude']
        || xmlat['extrude']
        || {value: 5};

    for (let i = 0; i < paths.length; i++) {
        let path = paths[i];
        let shapes = path.toShapes(true);
        if (fromSoup) {
            for (let node of shapes) {
                let { shape, holes } = node.extractPoints();
                for (let path of [ shape, ...holes ]) {
                    polys.push(base.newPolygon().addPoints(path.map(p => base.newPoint(p.x, p.y, 0))));
                }
            }
            continue;
        }
        let geom = new THREE.ExtrudeGeometry(shapes, {
            steps: 1,
            depth: parseFloat(depth.value),
            bevelEnabled: false
        });
        let array = geom.attributes.position.array;
        // invert y
        for (let i=0; i<array.length; i+=3) {
            array[i+1] = -array[i+1];
        }
        // invert vertex order to compensate for inverted y
        for (let i=0; i<array.length; i+=9) {
            let tmp = array.slice(i,i+3);
            for (let j=0; j<3; j++) {
                array[i+j] = array[i+j+3];
                array[i+j+3] = tmp[j];
            }
        }
        objs.push([ ...array ]);
    }

    if (fromSoup) {
        const nest = base.polygons.nest(polys.filter(p => {
            // filter duplicates
            for (let pc of polys) {
                if (pc === p) {
                    return true;
                } else {
                    return !pc.isEquivalent(p);
                }
            }
        }));

        let z = parseFloat(depth.value);
        for (let poly of nest) {
            let obj = poly.extrude(z);
            objs.push(obj);
            // invert y
            for (let i=1, l=obj.length; i<l; i += 3) {
                obj[i] = -obj[i];
            }
        }
    }

    return objs;
}

});
