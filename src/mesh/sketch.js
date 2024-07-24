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
const { PlaneGeometry, EdgesGeometry, SphereGeometry, Vector3, Mesh } = THREE;
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
    constructor(opt = {}) {
        super(opt.id);

        this.file = opt.file || this.id;
        this.scale = opt.scale || { x: 10, y: 10 };
        this.center = opt.center || { x: 0, y: 0, z: 0 };
        this.normal = opt.normal || { x: 0, y: 0, z: 1 };

        const planeGeometry = new PlaneGeometry(1, 1);
        const planeMaterial = material.plane;
        const plane = this.plane = new Mesh(planeGeometry, planeMaterial);

        const outlineGeometry = new EdgesGeometry(planeGeometry);
        const outlineMaterial = material.outline;
        const outline = this.outline = new LineSegments(outlineGeometry, outlineMaterial);
        plane.add(outline);

        const handleGeometry = new SphereGeometry(0.05, 16, 16);
        const handleMaterial = material.handle;

        const handles = [];
        const corners = [ [-0.5, 0.5, 0], [0.5, 0.5, 0], [-0.5, -0.5, 0], [0.5, -0.5, 0] ];

        for (let corner of corners) {
            const handle = new Mesh(handleGeometry, handleMaterial);
            handle.position.set(...corner);
            plane.add(handle);
            handles.push(handle);
        }

        this.update();
    }

    update() {
        const { plane, center, normal, scale, type } = this;

        plane.scale.set(scale.x, scale.y, 1);
        plane.position.set(center.x, center.y, center.z);

        const normalVector = new Vector3(normal.x, normal.y, normal.z);
        const targetPoint = new Vector3().addVectors(plane.position, normalVector);
        plane.lookAt(targetPoint);

        this.#db_save();
    }

    #db_save() {
        const { center, normal, scale, type, file } = this;
        mapp.db.space.put(this.id, { center, normal, scale, type, file });
    }

    #db_remove() {
        mapp.api.sketch.remove(this);
        mapp.db.space.remove(this.id);
    }

    get type() {
        return "sketch";
    }

    get object() {
        return this.plane;
    }

    rename(newname) {
        this.file = newname;
        this.#db_save();
    }

    remove() {
        this.#db_remove();
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