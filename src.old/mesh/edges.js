/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * facet edge selecetor. allows for creating new facets
 * when two connected edges share a single point.
 */

"use strict";


// dep: moto.space
gapp.register("mesh.edges", [], (root, exports) => {

const { Line2, LineMaterial, LineGeometry, Vector3, Group } = THREE;
const { LineSegments2, LineSegmentsGeometry } = THREE;
const { base, mesh, moto } = root;
const { space } = moto;
const { newPoint } = base;

let isActive;
let hovered;
let selected = [];

function line2(verts) {
    let geo = new LineSegmentsGeometry();
    let segs = new LineSegments2(geo, new LineMaterial({
        linewidth: 4,
        color: 0x0088ff,
        alphaToCoverage: false,
    }));
    geo.setPositions(verts);
    return segs;
}

// hovered edge object
let geo, mat, obj = new Line2(
    geo = new LineGeometry(),
    mat = new LineMaterial({
        linewidth: 6,
        color: 0x88ff00,
        alphaToCoverage: false,
    })
);

// true if values differ by less than 10e-3
function cmp(v1, v2) {
    return Math.abs(v1 - v2) < 0.001;
}

// points equal if all axis values are within tolerance of each other
function eq(p1, p2) {
    return
        cmp(p1.x, p2.x) &&
        cmp(p1.y, p2.y) &&
        cmp(p1.z, p2.z);
}

// split functions
let edges = {
    active() {
        return isActive ? true : false;
    },

    start() {
        if (isActive) {
            return;
        }

        let { api } = mesh;

        isActive = true;
        selected.length = 0;
        obj.visible = false;

        space.scene.add(obj);

        // enable temp mode
        let state = edges.state = { obj };
        let models = state.models = api.selection.models();
        let meshes = models.map(m => m.mesh);

        // find closest facet edge to hover location
        space.mouse.onHover((int, event, ints) => {
            if (!event) {
                obj.visible = false;
                return meshes;
            }
            if (event.buttons) {
                return;
            }

            obj.visible = true;

            let { point, face, object } = int;
            let side = edges.closest_edge(point, face, object);
            let { p0, p1 } = side;
            let verts = side.verts = [ p0.x, -p0.z, p0.y, p1.x, -p1.z, p1.y ];
            geo.setPositions(verts);
            hovered = { object, face, side };
        });
        isActive = true;
    },

    end() {
        if (!isActive) {
            return;
        }
        let space = moto.space;
        space.scene.remove(obj);
        space.scene.remove(edges.selected);
        space.mouse.onHover(undefined);
        isActive = edges.state = undefined;
        mesh.api.selection.update();
    },

    async add() {
        if (selected.length === 2 && selected[0].object === selected[1].object) {
            let model = selected[0].object.model;
            let pos = new Vector3().fromArray(model.meta.pos);
            let verts = selected.map(s => [ s.side.p0, s.side.p1 ]).flat();
            // translate into mesh space
            for (let v of verts) {
                v.x = (v.x - pos.x);
                v.y = (v.y - pos.z);
                v.z = (v.z + pos.y);
            }
            // sort points so dups show up next to each other
            let sort = verts.sort((a,b) => {
                if (a.x !== b.x) {
                    return a.x - b.x;
                  } else if (a.y !== b.y) {
                    return a.y - b.y;
                  } else {
                    return a.z - b.z;
                  }
            }).filter((point, index, arr) => {
                // allow first point then compare others to one before
                return index === 0 || !eq(point, arr[index - 1]);
            });
            if (sort.length === 3) {
                await model.duplicate({ append: [
                    sort[0].x, -sort[0].z, sort[0].y,
                    sort[1].x, -sort[1].z, sort[1].y,
                    sort[2].x, -sort[2].z, sort[2].y,
                ]});
                model.remove();
            } else if (verts.length === 4) {
                await model.duplicate({ append: [
                    verts[0].x, -verts[0].z, verts[0].y,
                    verts[1].x, -verts[1].z, verts[1].y,
                    verts[2].x, -verts[2].z, verts[2].y,
                    verts[2].x, -verts[2].z, verts[2].y,
                    verts[1].x, -verts[1].z, verts[1].y,
                    verts[3].x, -verts[3].z, verts[3].y,
                ]});
                model.remove();
            }
            // refresh object target cache
            edges.end();
            edges.start();
        }
    },

    clear() {
        selected.length = 0;
        space.scene.remove(edges.selected);
    },

    select() {
        space.scene.remove(edges.selected);
        if (!hovered) return;

        const { object, face, side } = hovered;
        let add = true;
        for (let i=0; i<selected.length; i++) {
            let s = selected[i];
            let { p0, p1 } = s.side;
            let sp = newPoint(
                (p0.x + p1.x) / 2,
                (p0.y + p1.y) / 2,
                (p0.z + p1.z) / 2,
            );
            let tp = newPoint(
                (side.p0.x + side.p1.x) / 2,
                (side.p0.y + side.p1.y) / 2,
                (side.p0.z + side.p1.z) / 2,
            );
            // because two faces can share edges that don't match
            // we compare midpoints of the line segments for a match
            let pd = sp.distTo3D(tp);
            if (s.object === object && Math.abs(pd) < 0.0001) {
                selected.splice(i,1);
                add = false;
                break;
            }
        }
        if (add) {
            selected.push(hovered);
        }

        const group = edges.selected = new Group();
        space.scene.add(edges.selected);
        let verts = selected.map(s => s.side.verts).flat();
        group.add(line2(verts));
    },

    closest_edge(point, face, object) {
        let { position } = object.geometry.attributes;
        let matrix = object.matrixWorld;
        point = newPoint(point.x, point.y, point.z);
        let v0 = new Vector3(position.getX(face.a), position.getY(face.a), position.getZ(face.a)).applyMatrix4(matrix);
        let v1 = new Vector3(position.getX(face.b), position.getY(face.b), position.getZ(face.b)).applyMatrix4(matrix);
        let v2 = new Vector3(position.getX(face.c), position.getY(face.c), position.getZ(face.c)).applyMatrix4(matrix);
        let l0 = { p0:v0, p1:v1, d:point.distToLine3D(v0, v1), v:[face.a,face.b].sort() };
        let l1 = { p0:v1, p1:v2, d:point.distToLine3D(v1, v2), v:[face.b,face.c].sort() };
        let l2 = { p0:v2, p1:v0, d:point.distToLine3D(v2, v0), v:[face.c,face.a].sort() };
        return [ l0, l1, l2 ].sort((a,b) => a.d - b.d)[0];
    }
}

exports(edges);

});
