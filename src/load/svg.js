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

function parse(text, opt = {}) {
    let objs = [];
    let data = new THREE.SVGLoader().parse(text);
    let paths = data.paths;
    let xmlat = data.xml.attributes;
    let depth = opt.depth || xmlat['data-km-extrude']
        || xmlat['extrude']
        || {value: 5};

    for (let i = 0; i < paths.length; i++) {
        let path = paths[i];
        let shapes = path.toShapes(true);
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

    return objs;
}

});
