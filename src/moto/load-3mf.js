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

            query(doc, ["+model","resources","+object","+mesh"], (type, node) => {
                switch (type) {
                    case "model":
                        units = node.getAttribute("unit");
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
                                parseFloat(vertex.getAttribute("x")),
                                parseFloat(vertex.getAttribute("y")),
                                parseFloat(vertex.getAttribute("z"))
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
