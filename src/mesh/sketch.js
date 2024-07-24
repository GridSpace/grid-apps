/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.array
// dep: add.three
// dep: moto.license
// dep: moto.client
// dep: mesh.object
// use: mesh.api
// use: mesh.util
// use: mesh.group
gapp.register("mesh.sketch", [], (root, exports) => {

const { MeshBasicMaterial, LineBasicMaterial, LineSegments, DoubleSide } = THREE;
const { PlaneGeometry, EdgesGeometry, SphereGeometry, Group, Mesh } = THREE;
const { mesh, moto } = root;
const { space } = moto;

const mapp = mesh;
const worker = moto.client.fn;

const material = {
    plane: new MeshBasicMaterial({ color: 0x888888, side: DoubleSide, transparent: true, opacity: 0.25 }),
    outline: new LineBasicMaterial({ color: 0x88dddd, side: DoubleSide, transparent: true, opacity: 0.25 }),
    handle: new MeshBasicMaterial({ color: 0x88dddd, side: DoubleSide, transparent: true, opacity: 0.25 }),
    highlight: new LineBasicMaterial({ color: 0x88ffdd, side: DoubleSide, transparent: true, opacity: 0.5 }),
    selected: new MeshBasicMaterial({ color: 0x88aa88, side: DoubleSide, transparent: true, opacity: 0.25 }),
};

/** 2D plane containing open and closed polygons which can be extruded **/
mesh.sketch = class MeshSketch extends mesh.object {
    constructor(model, face, id) {
        super(id);

        const planeGeometry = new PlaneGeometry(10, 10);
        const planeMaterial = material.plane;
        const plane = this.plane = new Mesh(planeGeometry, planeMaterial);

        const outlineGeometry = new EdgesGeometry(planeGeometry);
        const outlineMaterial = material.outline;
        const outline = this.outline = new LineSegments(outlineGeometry, outlineMaterial);
        plane.add(outline);

        const handleGeometry = new SphereGeometry(0.2, 16, 16);
        const handleMaterial = material.handle;

        const handles = [];
        const corners = [ [-5, 5, 0], [5, 5, 0], [-5, -5, 0], [5, -5, 0] ];

        for (let corner of corners) {
            const handle = new Mesh(handleGeometry, handleMaterial);
            handle.position.set(...corner);
            plane.add(handle);
            handles.push(handle);
        }
    }

    get type() {
        return "sketch";
    }

    get object() {
        return this.plane;
    }

    rename(newname) {
        this.file = newname;
    }

    highlight() {
        this.outline.material = material.highlight;
    }

    unhighlight() {
        this.outline.material = material.outline;
    }

    select(bool) {
        if (bool === undefined) {
            return this.plane.material === material.selected;
        }
        if (bool.toggle) {
            return this.select(!this.select());
        }
        return this.plane.material = (bool ? material.selected : material.plane);
    }

}

});