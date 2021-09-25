'use strict';

(function() {

    if (!self.moto) self.moto = {};
    if (self.moto.OBJ) return;

    self.moto.TMF = {
        parseAsync
    };

    function query(node, path, fn) {
        let collect = false;
        let match = path[0];
        if (match[0] === '+') {
            match = match.slice(1);
            collect = true;
        }
        for (let child of [...node.childNodes]) {
            if (child.tagName === match) {
                if (collect) {
                    fn(match, child);
                }
                if (path.length > 1) {
                    query(child, path.slice(1), fn);
                }
            }
        }
    }

    function loadModel(doc) {
        let models = [];
        function emitModel(model, faces) {
            if (faces && faces.length) {
                models.push({name: model, faces});
            }
        }

        return new Promise((resolve, reject) => {
            let model;
            let faces;
            let units;
            let scale = 1;
            let scaleMap = {
                "inch": (1 / 25.4),
                "foot": (1 / 304.8),
                "micron": (1 / 1000),
                "meter": 1000,
                "millimeter": 1,
                "centimeter": (1 / 10)
            };

            query(doc, ["+model","resources","+object","+mesh"], (type, node) => {
                switch (type) {
                    case "model":
                        units = node.getAttribute("unit");
                        if (units) {
                            scale = scaleMap[units] || 1;
                        }
                        break;
                    case "object":
                        emitModel(model, faces);
                        faces = [];
                        model = node.getAttribute("name") || undefined;
                        break;
                    case "mesh":
                        let vertices = [];
                        query(node, ["vertices","+vertex"], (type, vertex) => {
                            vertices.push([
                                parseFloat(vertex.getAttribute("x")) * scale,
                                parseFloat(vertex.getAttribute("y")) * scale,
                                parseFloat(vertex.getAttribute("z")) * scale
                            ]);
                        });
                        query(node, ["triangles","+triangle"], (type, triangle) => {
                            let v1 = parseInt(triangle.getAttribute("v1"));
                            let v2 = parseInt(triangle.getAttribute("v2"));
                            let v3 = parseInt(triangle.getAttribute("v3"));
                            faces.appendAll(vertices[v1]);
                            faces.appendAll(vertices[v2]);
                            faces.appendAll(vertices[v3]);
                        });
                        break;
                }
            });

            emitModel(model, faces);
            resolve(models);
        });
    }

    /**
     * @param {Object} data binary file
     * @returns {Array} vertex face array
     */
    function parseAsync(data) {
        return new Promise((resolve, reject) => {
            JSZip.loadAsync(data).then(zip => {
                for (let [key,value] of Object.entries(zip.files)) {
                    if (key.indexOf(".model") > 0) {
                        value.async("string").then(xml => {
                            resolve(loadModel(new DOMParser().parseFromString(xml, "text/xml")));
                        });
                    }
                }
            });
        });
    }

})();
