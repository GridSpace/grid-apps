/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.array
// dep: add.three
// dep: geo.polygon
// dep: moto.license
// dep: moto.client
// dep: mesh.object
// dep: mesh.api
// use: mesh.util
// use: mesh.group
gapp.register("mesh.sketch", [], (root, exports) => {

const { BufferGeometry, BufferAttribute } = THREE;
const { MeshBasicMaterial, LineBasicMaterial, LineSegments, DoubleSide } = THREE;
const { PlaneGeometry, EdgesGeometry, SphereGeometry, Vector3, Mesh, Group } = THREE;
const { base, mesh, moto } = root;
const { space } = moto;
const { api, util } = mesh;
const { newPolygon } = base;

const mapp = mesh;
const worker = moto.client.fn;

const material = {
    normal:    new MeshBasicMaterial({ color: 0x888888, side: DoubleSide, transparent: true, opacity: 0.25 }),
    selected:  new MeshBasicMaterial({ color: 0x889988, side: DoubleSide, transparent: true, opacity: 0.25 }),
    highlight: new LineBasicMaterial({ color: 0x88ff88, side: DoubleSide, transparent: true, opacity: 0.50 }),
};

function log() {
    mesh.api.log.emit(...arguments);
}

/** 2D plane containing open and closed polygons which can be extruded **/
mesh.sketch = class MeshSketch extends mesh.object {
    constructor(opt = {}) {
        super(opt.id);

        this.file = opt.file || this.id;
        this.scale = opt.scale || { x: 10, y: 10, z: 0 };
        this.center = opt.center || { x: 0, y: 0, z: 0 };
        this.normal = opt.normal || { x: 0, y: 0, z: 1 };
        this.items = opt.items || [];

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
            handle.sketch = this;
            handles.push(handle);
        }

        group.add(...handles, outline, plane);

        util.defer(() => this.render());
    }

    update() {
        const { group, plane, outline, center, handles, corners, normal, scale } = this;

        plane.scale.set(scale.x, scale.y, 1);
        outline.scale.set(scale.x, scale.y, 1);
        group.position.set(center.x, center.y, center.z);

        for (let i=0; i<4; i++) {
            const handle = handles[i];
            const corner = corners[i];
            handle.position.set(
                (corner[0] * scale.x),
                (corner[1] * scale.y),
                (corner[2] * scale.z)
            );
        }

        const { position } = group;
        group.lookAt(new Vector3(
            normal.x + position.x,
            normal.z + position.z,
            normal.y - position.y
        ));

        this.#db_save();
    }

    lookat(x,y,z) {
        this.group.lookAt(new Vector3(x,y,z));
        moto.space.update();
    }

    #db_save() {
        const { center, normal, scale, type, file, items } = this;
        mapp.db.space.put(this.id, { center, normal, scale, type, file, items });
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
        const { group, center, scale, plane, handles, dragging } = this;
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
            this.center = {x, y, z};
            this.update();
        }
}

    drag(opt = {}) {
        const { plane, handles, dragging } = this;
        if (opt.start) {
            this.dragging = opt.start;
        } else if (opt.end) {
            this.dragging = undefined;
        } else {
            console.log({ invalid_sketch_drag: opt });
        }
    }

    add_circle(opt = {}) {
        log(this.file || this.id, '| add circle');
        Object.assign(opt, { center: {x:0, y:0, z:0}, radius:5 }, opt);
        this.items.push({ type: "circle", ...opt });
        this.render();
    }

    add_rectangle(opt = {}) {
        log(this.file || this.id, '| add rectangle');
        Object.assign(opt, { center: {x:0, y:0, z:0}, width:15, height:10 }, opt);
        this.items.push({ type: "rectangle", ...opt });
        this.render();
    }

    // render items unto the group object
    render() {
        let { group } = this;
        // remove previous item/poly-based children of group
        group.children.filter(c => c.poly).forEach(c => group.remove(c));
        // mapy items into polys into meshes to add to group
        this.items.map(item => {
            let { type, center, width, height, radius, spacing, poly } = item;
            if (type === 'circle') {
                let circumference = 2 * Math.PI * radius;
                let points = Math.floor(circumference / (spacing || 1));
                poly = newPolygon().centerCircle(center, radius, points).annotate({ item } );
            } else if (type === 'rectangle') {
                poly = newPolygon().centerRectangle(center, width, height).annotate({ item });
            }
            return poly;
        }).filter(o => o).forEach(poly => {
            let vrt = poly.extrude(0).toFloat32();
            let geo = new BufferGeometry();
            geo.setAttribute('position', new BufferAttribute(vrt, 3));
            let meh = new Mesh(geo, mesh.material.normal);
            meh.poly = poly;
            group.add(meh);
        });
        this.update();
    }

    extrude(opt = {}) {
        let { z } = opt;
        let models = [];
        for (let item of this.group.children.filter(c => c.poly)) {
            let vert = item.poly.extrude(z || 10);
            let nmdl = new mesh.model({ file: "poly", mesh: vert.toFloat32() });
            models.push(nmdl);
        }
        if (models.length) {
            log('extrude', this.file || this.id, 'into', models.length, 'solid(s)');
            let ngrp = api.group.new(models);
            ngrp.floor();
        }
    }
}

});