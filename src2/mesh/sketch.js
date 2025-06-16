/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { client as motoClient } from '../moto/client.js';
import { space as motoSpace } from '../moto/space.js';
import { broker } from '../moto/broker.js';
import { object as meshObject } from './object.js';
import { model as meshModel, materials } from './model.js';
import { util as meshUtil } from './util.js';
import { api as meshApi } from './api.js';
import { newPolygon } from '../geo/polygon.js';
import { polygons } from '../geo/polygons.js';
import { THREE } from '../ext/three.js';

const { BufferGeometry, BufferAttribute, Quaternion, MeshBasicMaterial, LineBasicMaterial, LineSegments, DoubleSide, PlaneGeometry, EdgesGeometry, SphereGeometry, Vector3, Box3, Mesh, Group } = THREE;
const worker = motoClient.fn;
const drag = {};
const hpos = [
    [-1, 1, 1],
    [ 1, 1, 1],
    [-1,-1, 1],
    [ 1,-1, 1],
];

const material = {
    normal:    new MeshBasicMaterial({ color: 0x888888, side: DoubleSide, transparent: true, opacity: 0.25 }),
    selected:  new MeshBasicMaterial({ color: 0x889988, side: DoubleSide, transparent: true, opacity: 0.25 }),
    highlight: new LineBasicMaterial({ color: 0x88ff88, side: DoubleSide, transparent: true, opacity: 0.50 }),
};

function log() {
    meshApi.log.emit(...arguments);
}

/** 2D plane containing open and closed polygons which can be extruded **/
class MeshSketch extends meshObject {
    constructor(opt = {}) {
        super(opt.id);

        this.file = opt.file || this.id;
        this.scale = opt.scale || { x: 50, y: 50, z: 0 };
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

        this.render_defer();
    }

    update() {
        let { group, plane, outline, center, handles, corners, normal, scale } = this;

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

        normal = new Vector3(normal.x, normal.y, normal.z).normalize();
        group.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal));

        this.#db_save();
    }

    lookat(x,y,z) {
        this.group.lookAt(new Vector3(x,y,z));
        motoSpace.update();
    }

    #db_save() {
        let { center, normal, scale, type, file, items } = this;
        meshApi.db.space.put(this.id, { center, normal, scale, type, file, items });
    }

    #db_remove() {
        meshApi.sketch.remove(this);
        meshApi.db.space.remove(this.id);
    }

    get type() {
        return "sketch";
    }

    get object() {
        return this.group;
    }

    get bounds() {
        const { scale, center } = this;
        return new Box3(
            new Vector3(
                center.x - scale.x/2,
                center.y - scale.y/2,
                center.z
            ),
            new Vector3(
                center.x + scale.x/2,
                center.y + scale.y/2,
                center.z
            )
        );
    }

    get meshes() {
        return this.group.children.filter(c => {
            return c.sketch || (c.sketch_item && c.sketch_item.selected) ? c : undefined
        }).reverse();
    }

    get elements() {
        return this.group.children.filter(c => c.sketch_item);
    }

    get selection() {
        let sketch = this;
        return {
            // for boolean and patterning, we need the polygon artifacts
            mesh_items() {
                return sketch.group.children.filter(c => c.sketch_item && c.sketch_item.selected);
            },

            items() {
                return sketch.selection.mesh_items().map(c => c.sketch_item);
            },

            count() {
                return sketch.items.filter(i => i.selected).length;
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
            },

            centerXY() {
                let sel = sketch.items.filter(i => i.selected);
                for (let s of sel) {
                    s.center.x = 0;
                    s.center.y = 0;
                }
                return sel.length;
            }
        }
    }

    get add() {
        let sketch = this;
        return {
            circle(opt = {}) {
                return sketch.add.item({
                    type: "circle",
                    selected: true,
                    ...Object.assign({}, { center: {x:0, y:0, z:0}, radius:5 }, opt)
                });
            },

            rectangle(opt = {}) {
                return sketch.add.polygon({
                    ...opt,
                    poly: newPolygon().centerRectangle(
                        opt.center || {x:0, y:0, z:0},
                        opt.height || 15,
                        opt.width || 10
                    )
                })
            },

            polygon(opt = {}) {
                let poly = opt.poly;
                delete opt.poly;
                let { width, miter } = poly._svg || {};
                return sketch.add.item({
                    type: "polygon",
                    width,
                    miter,
                    selected: true,
                    ...Object.assign({}, { center: { x:0, y:0, z:0 } }, opt),
                    ...poly.toObject()
                });
            },

            item(item) {
                item.group = item.group || meshUtil.uuid();
                sketch.items.push(item);
                sketch.render_defer();
                meshApi.selection.update_defer();
                return item;
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
                let union = polygons.union(polys, 0, true);
                sketch.selection.delete();
                sketch.arrange.group(union.map(poly => sketch.add.polygon({ poly })));
            },

            intersect() {
                let items = sketch.selection.mesh_items();
                if (items.length !== 2) return log('operation requires 2 items');
                let polys = items.map(i => i.sketch_item.poly);
                let trim = polygons.trimTo([polys[0]], [polys[1]]);
                sketch.selection.delete();
                for (let poly of trim) {
                    sketch.add.polygon({ poly });
                }
            },

            difference() {
                let items = sketch.selection.mesh_items();
                if (items.length !== 2) return log('operation requires 2 items');
                let polys = items.map(i => i.sketch_item.poly);
                let diff1 = polygons.diff([polys[0]], [polys[1]]);
                let diff2 = polygons.diff([polys[1]], [polys[0]]);
                sketch.selection.delete();
                for (let poly of [...diff1, ...diff2]) {
                    sketch.add.polygon({ poly });
                }
            },

            nest() {
                let items = sketch.selection.items();
                if (items.length < 2) return log('operation requires at least 2 items');
                let polys = items.map(si => si.poly.annotate({group:si.group}).clone(true, ['group']));
                let union = polygons.nest(polygons.flatten(polys, [], true));
                sketch.selection.delete();
                for (let poly of union) {
                    sketch.add.polygon({ poly, group:poly.group });
                }
            },

            evenodd() {
                let items = sketch.selection.items();
                let polys = items.map(si => si.poly.annotate({group:si.group}));
                let even = polygons.nest(polygons.flatten(polys.clone(true,['group']), [], true));
                let odd = polygons.nest(polygons.flatten(even.clone(true,['group']), [], true).filter(p => p.depth > 0));
                sketch.selection.delete();
                for (let poly of [...even, ...odd]) {
                    sketch.add.polygon({ poly, group:poly.group });
                }
            },

            flatten() {
                let items = sketch.selection.items();
                let polys = items.map(si => si.poly.annotate({group:si.group}).clone(true, ['group']));
                let flat = polygons.flatten(polys, [], true);
                sketch.selection.delete();
                for (let poly of flat) {
                    sketch.add.polygon({ poly });
                }
            }
        }
    }

    get arrange() {
        let sketch = this;
        let { items } = sketch;
        return {
            move(item, target) {
                let pos = items.indexOf(item);
                if (pos < 0 || pos >= items.length) {
                    throw new Error('index out of bounds');
                }
                if (target === 'top') {
                    let x = items.splice(pos,1);
                    return items.appendAll(x);
                } else if (target === 'bottom') {
                    let x = items.splice(pos,1);
                    return sketch.items = [...x, ...items];
                }
                let newPos = { 'down': pos - 1, 'up': pos + 1 }[target];
                if (newPos >= 0 && newPos < items.length) {
                    [items[pos], items[newPos]] = [items[newPos], items[pos]];
                }
            },

            up(item) {
                sketch.arrange.move(item, 'up');
            },

            down(item) {
                sketch.arrange.move(item, 'down');
            },

            top(item) {
                sketch.arrange.move(item, 'top');
            },

            bottom(item) {
                sketch.arrange.move(item, 'bottom');
            },

            group(items) {
                let group = Date.now().toString(36);
                items.forEach(i => i.group = group);
                sketch.render();
            },

            ungroup(items) {
                items.forEach(i => i.group = meshUtil.uuid());
                sketch.render();
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

    position() {
        const { target } = drag;
        console.log({ sk_pos: [ ...arguments ], target });
        const [ nx, ny, nz ] = [ ...arguments ];
        if (nx || ny || nz) {
            this.center = { x: nx, y: ny, z: nz };
            this.render();
        } else {
            const { x, y, z } = this.center;
            return new Vector3(x, y, z);
        }
    }

    move(x, y, z = 0, target = drag.target) {
        const { center, scale, plane, handles } = this;
        const handle = handles.indexOf(target);
        if (target === plane) {
            center.x += x;
            center.y += y;
            center.z += z;
            this.render();
        } else if (handle >= 0) {
            const sf = hpos[handle];
            center.x += x / 2;
            center.y += y / 2;
            center.z += z / 2;
            scale.x += x * sf[0];
            scale.y += y * sf[1];
            scale.z += z * sf[2];
            this.render();
        } else if (Array.isArray(target)) {
            for (let item of target) {
                let { center } = item;
                center.x += x;
                center.y += y;
                center.z += z;
            }
            this.render();
        } else {
            this.center = {x, y, z};
            this.render();
        }
    }

    centerXY() {
        if (!this.selection.centerXY()) {
            this.center.x = 0;
            this.center.y = 0;
        }
        this.render();
    }

    handle_pos(handle) {
        if (handle < 0) return;
        let { scale, center } = this;
        let v = hpos[handle];
        return {
            x: v[0] * scale.x/2 + center.x,
            y: v[1] * scale.y/2 + center.y,
            z: v[2] * scale.z/2 + center.z,
        };
    }

    drag(opt = {}) {
        let { items, center, handles } = this;
        let { start, delta, offset, end } = opt;
        if (start) {
            let selected = items.filter(i => i.selected);
            let target = start.sketch_item ? selected : start;
            let item = Array.isArray(target) ? target[0] : undefined;
            drag.handle = handles.indexOf(target);
            drag.item = item;
            drag.target = target;
            drag.start = Object.assign({}, drag.handle >= 0 ?
                this.handle_pos(drag.handle) :
                item?.center ?? center);
        } else if (offset) {
            let { start, item, handle } = drag;
            let { snap, snapon } = meshApi.prefs.map.space;
            let pos = handle >= 0 ?
                this.handle_pos(handle) :
                item?.center ?? center;
            let end = {
                x: start.x + offset.x,
                y: start.y + offset.y,
                z: start.z + offset.z
            };
            if (snap && snapon) {
                end.x = Math.round(end.x / snap) * snap;
                end.y = Math.round(end.y / snap) * snap;
            }
            delta = {
                x: end.x - pos.x,
                y: end.y - pos.y,
                z: end.z - pos.z
            };
            this.move(delta.x, delta.y, delta.z);
        } else if (delta) {
            this.move(delta.x, delta.y, delta.z);
        } else if (end) {
            drag.target = undefined;
        } else {
            console.log({ invalid_sketch_drag: opt });
        }
    }

    // render items unto the group object
    render() {
        let { group } = this;
        let group_order = {};
        let group_next = 0;
        let scale = this.scale.z;
        // remove previous item/poly-based children of group
        group.children.filter(c => c.sketch_item || c.sketch_line).forEach(c => group.remove(c));
        // map items into polys into meshes to add to group
        for (let item of this.items) {
            let order = scale ? (group_order[item.group] ?? group_next++) : group_next++;
            group_order[item.group] = order;
            let sketch_item = new SketchItem(this, item, order);
            group.add(sketch_item.mesh);
            group.add(...sketch_item.outs);
        }
        this.update();
        motoSpace.refresh();
        broker.publish('sketch_render', this);
    }

    render_defer() {
        meshUtil.defer(() => this.render());
    }

    extrude(opt = {}) {
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
            let nmdl = new meshModel({ file: "item", mesh: vert.toFloat32() });
            models.push(nmdl);
        }
        if (models.length) {
            log('extrude', this.file || this.id, 'into', models.length, 'solid(s)');
            let { center } = this;
            let ngrp = meshApi.group.new(models);
            ngrp.move(center.x, center.y, center.z);
            // align extrusion with sketch plane
            const euler = this.group.rotation;
            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(euler);
            ngrp.qrotate(quaternion);
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

    get group() {
        return this.item.group;
    }

    get selected() {
        return this.item.selected;
    }

    toggle() {
        let { sketch, item } = this;
        item.selected = !item.selected;
        if (item.group) {
            sketch.items
                .filter(i => i.group === item.group)
                .forEach(i => i.selected = item.selected);
        }
        this.update();
        sketch.render();
        broker.publish('sketch_selections');
    }

    extrude(z, opt = {}) {
        return this.poly.extrude(z, opt);
    }

    centerXY() {
        let { center } = this.item;
        center.x = 0;
        center.y = 0;
    }

    update() {
        let { item, sketch, order } = this;
        let { type, center, width, height, miter, radius, points, spacing, poly, selected } = item;
        let { open_close, open_width, open_type } = meshApi.prefs.map.sketch;
        let base = 0.025;
        let bump = sketch.scale.z || 0.0001;
        if (type === 'circle') {
            let circumference = 2 * Math.PI * radius;
            points = points || Math.floor(circumference / (spacing || 1));
            poly = newPolygon().centerCircle(center, radius, points).annotate({ item } ).rotate(item.rotation || 0);
        } else if (type === 'rectangle') {
            poly = newPolygon().centerRectangle(center, width, height).annotate({ item });
        } else if (type === 'polygon') {
            poly = newPolygon().fromObject(item);
            poly.move(center);
            if (poly.isOpen() && open_close !== true) {
                poly = poly.offset_open(width || open_width || 1, open_type, miter)[0];
            }
        } else {
            throw `invalid sketch type: ${type}`;
        }
        this.poly = poly;
        let isSelected = selected && sketch.select();
        // create solid filled area
        let mat = (isSelected ? materials.select : materials.normal).clone();
            mat.transparent = true;
            mat.opacity = 0.5;
        let vrt = poly.extrude(0).toFloat32();
        let geo = new BufferGeometry();
            geo.setAttribute('position', new BufferAttribute(vrt, 3));
        let meh = this.mesh = new Mesh(geo, mat);
            meh.renderOrder = -1;
            meh.sketch_item = this;
            // bump z to avoid z order conflict and ensure item ray intersect priority
            meh.position.z += base + (order * bump);
        // create poly outline(s)
        let outs = this.outs = [];
        for (let p of [poly, ...(poly.inner || [])]) {
            let lpt = p.points.map(p => new Vector3(p.x, p.y, p.z));
                lpt.push(lpt[0]);
            let lge = new BufferGeometry().setFromPoints(lpt);
            let out = new THREE.Line(lge, materials.wireline);
                out.renderOrder = -1;
                out.sketch_line = this;
                out.position.z += base + (order * bump);
                out.renderOrder = -10 + (bump * order);
            outs.push(out);
        }
    }
}

function target() {
    return drag.target;
}

export { MeshSketch as sketch, SketchItem, target };