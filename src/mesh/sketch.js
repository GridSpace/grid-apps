/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: add.array
// dep: add.three
// dep: geo.polygon
// dep: geo.polygons
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
const { space, broker } = moto;
const { api, util } = mesh;
const { newPolygon } = base;

const mapp = mesh;
const worker = moto.client.fn;
const POLYS = base.polygons;

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
        return this.group.children.filter(c => {
            return c.sketch || (c.sketch_item && c.sketch_item.selected) ? c : undefined
        }).reverse();
    }

    get selection() {
        let sketch = this;
        return {
            // for boolean and patterning, we need the polygon artifacts
            mesh_items() {
                return sketch.group.children.filter(c => c.sketch_item && c.sketch_item.selected);
            },

            all() {
                sketch.items.forEach(i => i.selected = true);
                sketch.render();
                broker.publish('sketch_selections');
                return sketch.items.length;
            },

            // return true if any selections were cleared
            clear() {
                let sel = sketch.items.filter(i => i.selected);
                if (sel.length) {
                    sel.forEach(s => s.selected = false);
                    sketch.render();
                    broker.publish('sketch_selections');
                }
                return sel.length;
            },

            // return true if any selections were deleted
            delete() {
                let sel = sketch.items.filter(i => i.selected);
                if (sel.length) {
                    sketch.items = sketch.items.filter(i => !i.selected);
                    sketch.render();
                    broker.publish('sketch_selections');
                }
                return sel.length;
            }
        }
    }

    get boolean() {
        let sketch = this;
        return {
            union() {
                let items = sketch.selection.mesh_items();
                if (items.length < 2) return log('operation requires at least 2 items');
                let polys = items.map(i => i.sketch_item.poly);
                let union = POLYS.union(polys, 0, true);
                sketch.selection.delete();
                for (let poly of union) {
                    sketch.add_polygon({ poly });
                }
            },

            intersect() {
                let items = sketch.selection.mesh_items();
                if (items.length !== 2) return log('operation requires 2 items');
                let polys = items.map(i => i.sketch_item.poly);
                let trim = POLYS.trimTo([polys[0]], [polys[1]]);
                sketch.selection.delete();
                for (let poly of trim) {
                    sketch.add_polygon({ poly });
                }
            },

            difference() {
                let items = sketch.selection.mesh_items();
                if (items.length !== 2) return log('operation requires 2 items');
                let polys = items.map(i => i.sketch_item.poly);
                let diff1 = POLYS.diff([polys[0]], [polys[1]]);
                let diff2 = POLYS.diff([polys[1]], [polys[0]]);
                sketch.selection.delete();
                for (let poly of [...diff1, ...diff2]) {
                    sketch.add_polygon({ poly });
                }
            },

            nest() {
                let items = sketch.selection.mesh_items();
                if (items.length < 2) return log('operation requires at least 2 items');
                let polys = items.map(i => i.sketch_item.poly).clone(true);
                let union = POLYS.nest(POLYS.flatten(polys, [], true));
                sketch.selection.delete();
                for (let poly of union) {
                    sketch.add_polygon({ poly });
                }
            },

            flatten() {
                let items = sketch.selection.mesh_items();
                let polys = items.map(i => i.sketch_item.poly).clone(true);
                let flat = POLYS.flatten(polys, [], true);
                sketch.selection.delete();
                for (let poly of flat) {
                    sketch.add_polygon({ poly });
                }
            }
        }
    }

    get pattern() {
        return {
            circle() {
                console.log('sketch pattern circle');
            },

            grid() {
                console.log('sketch pattern grid');
            }
        }
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
        this.render();
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
        } else if (Array.isArray(dragging)) {
            for (let item of dragging) {
                let { center } = item;
                center.x += x;
                center.y += y;
                center.z += z;
            }
            this.render();
        } else {
            this.center = {x, y, z};
            this.update();
        }
}

    drag(opt = {}) {
        let { items } = this;
        if (opt.start) {
            let selected = items.filter(i => i.selected);
            this.dragging = opt.start.sketch_item ? selected : opt.start;
        } else if (opt.end) {
            this.dragging = undefined;
        } else {
            console.log({ invalid_sketch_drag: opt });
        }
    }

    add_circle(opt = {}) {
        log(this.file || this.id, '| add circle');
        this.items.push({
            type: "circle",
            ...Object.assign({}, { center: {x:0, y:0, z:0}, radius:5 }, opt)
        });
        this.render();
    }

    add_rectangle(opt = {}) {
        log(this.file || this.id, '| add rectangle');
        this.items.push({
            type: "rectangle",
            ...Object.assign({}, { center: {x:0, y:0, z:0}, width:15, height:10 }, opt)
        });
        this.render();
    }

    add_polygon(opt = {}) {
        // log(this.file || this.id, '| add polygon');
        let poly = opt.poly;
        delete opt.poly;
        this.items.push({
            type: "polygon",
            ...Object.assign({}, { center: {x:0, y:0, z:0} }, opt),
            ...poly.toObject()
        });
        this.render();
    }

    // render items unto the group object
    render() {
        let { group } = this;
        // remove previous item/poly-based children of group
        group.children.filter(c => c.sketch_item || c.sketch_line).forEach(c => group.remove(c));
        // mapy items into polys into meshes to add to group
        for (let si of this.items.map((i,o) => new SketchItem(this, i, o))) {
            group.add(si.mesh);
            group.add(...si.outs);
        }
        this.update();
    }

    extrude(opt = {}) {
        console.log({ opt });
        let { selection, height, chamfer, chamfer_top, chamfer_bottom } = opt;
        let models = [];
        let items = this.group.children
            .filter(c => c.sketch_item)
            .filter(c => !selection || c.sketch_item.selected);
        for (let item of items) {
            let vert = item.sketch_item.extrude(height, {
                chamfer,
                chamfer_top,
                chamfer_bottom
            });
            let nmdl = new mesh.model({ file: "item", mesh: vert.toFloat32() });
            models.push(nmdl);
        }
        if (models.length) {
            log('extrude', this.file || this.id, 'into', models.length, 'solid(s)');
            let { center } = this;
            let ngrp = api.group.new(models);
            ngrp.floor();
            ngrp.move(center.x, center.y, center.z);
        }
    }
}

class SketchItem {
    constructor(sketch, item, order) {
        this.sketch = sketch;
        this.item = item;
        this.order = order;
        this.update();
    }

    get type() {
        return "sketch_item";
    }

    get selected() {
        return this.item.selected;
    }

    toggle() {
        this.item.selected = !this.item.selected;
        this.update();
        this.sketch.render();
        broker.publish('sketch_selections');
    }

    extrude(z, opt = {}) {
        return this.poly.extrude(z, opt);
    }

    update() {
        let bump = 0.0025;
        let { item, sketch, order } = this;
        let { material } = mesh;
        let { type, center, width, height, radius, points, spacing, poly, selected } = item;
        if (type === 'circle') {
            let circumference = 2 * Math.PI * radius;
            points = points || Math.floor(circumference / (spacing || 1));
            poly = newPolygon().centerCircle(center, radius, points).annotate({ item } ).rotate(item.rotation || 0);
        } else if (type === 'rectangle') {
            poly = newPolygon().centerRectangle(center, width, height).annotate({ item });
        } else if (type === 'polygon') {
            poly = newPolygon().fromObject(item);
            poly.move(center);
        } else {
            throw `invalid sketch type: ${type}`;
        }
        this.poly = poly;
        let isSelected = selected && sketch.select();
        // create solid filled area
        let mat = (isSelected ? material.select : material.normal).clone();
            mat.transparent = true;
            mat.opacity = 0.5;
        let vrt = poly.extrude(0).toFloat32();
        let geo = new BufferGeometry();
            geo.setAttribute('position', new BufferAttribute(vrt, 3));
        let meh = this.mesh = new Mesh(geo, mat);
            meh.renderOrder = -1;
            meh.sketch_item = this;
            // bump z to avoid z order conflict and ensure item ray intersect priority
            meh.position.z += bump + (order * bump);
        // create poly outline(s)
        let outs = this.outs = [];
        for (let p of [poly, ...(poly.inner || [])]) {
            let lpt = p.points.map(p => new Vector3(p.x, p.y, p.z));
                lpt.push(lpt[0]);
            let lge = new BufferGeometry().setFromPoints(lpt);
            let out = new THREE.Line(lge, material.wireline);
                out.renderOrder = -1;
                out.sketch_line = this;
                out.position.z += bump + (order * bump);
            outs.push(out);
        }
    }
}

});