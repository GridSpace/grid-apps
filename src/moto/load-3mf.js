'use strict';

(function() {

    if (!self.moto) self.moto = {};
    if (self.moto.OBJ) return;

    self.moto.TMF = {
        parse : parse
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
            models.push({model, faces});
        }

        return new Promise((resolve, reject) => {
            let model;
            let faces;

            query(doc, ["+model","resources","object","+mesh"], (type, node) => {
                console.log({type, node});
                switch (type) {
                    case "model":
                        if (model) {
                            emitModel(mode, faces);
                        }
                        model = node;
                        faces = [];
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

            if (model) {
                emitModel(model, faces);
            }

            resolve(models);
        });
    }

    /**
     * @param {Object} data binary file
     * @returns {Array} vertex face array
     */
    function parse(data) {
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
