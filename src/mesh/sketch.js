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
const { PlaneGeometry, EdgesGeometry, SphereGeometry, Vector3, Mesh, Group } = THREE;
const { mesh, moto } = root;
const { space } = moto;

const mapp = mesh;
const worker = moto.client.fn;

const material = {
    normal:    new MeshBasicMaterial({ color: 0x888888, side: DoubleSide, transparent: true, opacity: 0.25 }),
    selected:  new MeshBasicMaterial({ color: 0x889988, side: DoubleSide, transparent: true, opacity: 0.25 }),
    highlight: new LineBasicMaterial({ color: 0x88ffdd, side: DoubleSide, transparent: true, opacity: 0.50 }),
};

/** 2D plane containing open and closed polygons which can be extruded **/
mesh.sketch = class MeshSketch extends mesh.object {
    constructor(opt = {}) {
        super(opt.id);

        this.file = opt.file || this.id;
        this.scale = opt.scale || { x: 10, y: 10, z: 0 };
        this.center = opt.center || { x: 0, y: 0, z: 0 };
        this.normal = opt.normal || { x: 0, y: 0, z: 1 };

        const group = this.group = new Group();
        group.sketch = this;

        const planeGeometry = new PlaneGeometry(1, 1);
        const planeMaterial = material.normal;
        const plane = this.plane = new Mesh(planeGeometry, planeMaterial);
        plane.sketch = this;

        const outlineGeometry = new EdgesGeometry(planeGeometry);
        const outlineMaterial = material.normal;
        const outline = this.outline = new LineSegments(outlineGeometry, outlineMaterial);

        const handleGeometry = new SphereGeometry(0.5, 16, 16);
        const handleMaterial = material.normal;

        const handles = this.handles = [];
        const corners = this.corners = [ [-0.5, 0.5, 0], [0.5, 0.5, 0], [-0.5, -0.5, 0], [0.5, -0.5, 0] ];

        for (let corner of corners) {
            const handle = new Mesh(handleGeometry, handleMaterial);
            handle.position.set(...corner);
            handles.push(handle);
            group.add(handle);
            handle.sketch = this;
        }

        group.add(outline);
        group.add(plane);

        this.update();
    }

    update() {
        const { plane, outline, center, handles, corners, normal, scale } = this;

        // group.rotation.x = -Math.PI/2;
        plane.scale.set(scale.x, scale.y, 1);
        plane.position.set(center.x, center.y, center.z);
        outline.scale.set(scale.x, scale.y, 1);
        outline.position.set(center.x, center.y, center.z);

        for (let i=0; i<4; i++) {
            const handle = handles[i];
            const corner = corners[i];
            handle.position.set(
                (corner[0] * scale.x) + center.x,
                (corner[1] * scale.y) + center.y,
                (corner[2] * scale.z) + center.z
            );
        }

        // const nv = new Vector3(normal.x, normal.y, normal.z);
        // const tp = new Vector3().addVectors(group.position, nv);
        // group.lookAt(tp);

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
        return this.group;
    }

    get meshes() {
        return this.group.children.filter(c => c.sketch ? c : undefined);
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
        this.outline.material = material.normal;
    }

    select(bool) {
        const { plane, handles } = this;
        if (bool === undefined) {
            return plane.material === material.selected;
        }
        if (bool.toggle) {
            return this.select(!this.select());
        }
        plane.material = (bool ? material.selected : material.normal);
        for (let handle of handles) {
            handle.material = bool ? material.highlight : plane.material;
        }
        return bool;
    }

    move(x, y, z = 0) {
        const { center, scale, plane, handles, dragging } = this;
        const handle = handles.indexOf(dragging);
        if (dragging === plane) {
            center.x += x;
            center.y += y;
            center.z += z;
            this.update();
        } else if (handle >= 0) {
            const sf = [
                [-1, 1, 1],
                [ 1, 1, 1],
                [-1,-1, 1],
                [ 1,-1, 1],
            ][handle];
            center.x += x / 2;
            center.y += y / 2;
            center.z += z / 2;
            scale.x += x * sf[0];
            scale.y += y * sf[1];
            scale.z += z * sf[2];
            this.update();
        } else {
            console.log({ sketch_move: [...arguments] });
        }
}

    drag(opt = {}) {
        const { plane, handles, dragging } = this;
        if (opt.start) {
            // console.log({ drag_start: opt.start, plane, same: opt.start === plane });
            this.dragging = opt.start;
        } else if (opt.end) {
            console.log({ drag_end: opt.end });
        } else {
            console.log({ invalid_sketch_drag: opt });
        }
    }

}

});