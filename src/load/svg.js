/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

'use strict';

(function() {

let load = self.load = self.load || {};
if (load.SVG) return;

gapp.register('load.svg');

load.SVG = {
    parse,
    parseAsync
};

/**
 * @param {String} text
 * @returns {Array} vertex face array
 */

function parseAsync(text) {
    return new Promise((resolve,reject) => {
        resolve(parse(text));
    });
}

function parse(text) {

    let faces = [ ];
    let objs = [ faces ];

    let data = new THREE.SVGLoader().parse(text);
    let paths = data.paths;

    for (let i = 0; i < paths.length; i++) {
        let path = paths[i];
        let shapes = path.toShapes(true);
        let geom = new THREE.ExtrudeGeometry(shapes, {
            steps: 1,
            depth: 5,
            bevelEnabled: false
        });
        let array = geom.attributes.position.array;
        // invert y
        for (let i=0; i<array.length; i+=3) {
            array[i+1] = -array[i+1];
        }
        // objs.push(geom.attributes.position.array);
        faces.appendAll(array);
    }

    return objs;
}

})();
