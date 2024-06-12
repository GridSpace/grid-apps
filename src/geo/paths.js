/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// path & routing output utilities

// dep: geo.base
// dep: geo.point
gapp.register("geo.paths", [], (root, exports) => {

const { base } = root;
const { util, config } = base;
const { sqr, numOrDefault } = util;

const DEG2RAD = Math.PI / 180;

/**
 * emit each element in an array based on
 * the next closest endpoint. arrays contain
 * elements with { first, last } points and
 * may be open polys, unlike poly2polyEmit
 */
function tip2tipEmit(array, startPoint, emitter) {
    let mindist, dist, found, count = 0;
    for (;;) {
        found = null;
        mindist = Infinity;
        array.forEach(function(el) {
            if (el.delete) return;
            dist = startPoint.distTo2D(el.first);
            if (dist < mindist) {
                found = {el:el, first:el.first, last:el.last};
                mindist = dist;
            }
            dist = startPoint.distTo2D(el.last);
            if (dist < mindist) {
                found = {el:el, first:el.last, last:el.first};
                mindist = dist;
            }
        });
        if (found) {
            found.el.delete = true;
            startPoint = found.last;
            emitter(found.el, found.first, ++count);
        } else {
            break;
        }
    }
    return startPoint;
}

/**
 * like tip2tipEmit but accepts an array of polygons and the next closest
 * point can be anywhere in the adjacent polygon. should be re-written
 * to be more like outputOrderClosest() and have the option to account for
 * depth in determining distance
 */
function poly2polyEmit(array, startPoint, emitter, opt = {}) {
    let marker = opt.mark || 'delete';
    let mindist, dist, found, count = 0;
    for (;;) {
        found = null;
        mindist = Infinity;
        for (let poly of array) {
            if (poly[marker]) {
                continue;
            }
            if (poly.isOpen()) {
                const d2f = startPoint.distTo2D(poly.first());
                const d2l = startPoint.distTo2D(poly.last());
                if (d2f > mindist && d2l > mindist) {
                    continue;
                }
                if (d2l < mindist && d2l < d2f && opt.swapdir !== false) {
                    poly.reverse();
                    found = {poly:poly, index:0, point:poly.first()};
                    mindist = d2l;
                } else if (d2f < mindist) {
                    found = {poly:poly, index:0, point:poly.first()};
                    mindist = d2f;
                }
                continue;
            }
            let area = poly.open ? 1 : poly.area();
            poly.forEachPoint(function(point, index) {
                dist = opt.weight ?
                    startPoint.distTo3D(point) * area * area :
                    startPoint.distTo2D(point);
                if (dist < mindist) {
                    found = {poly:poly, index:index, point:point};
                    mindist = dist;
                }
            });
        }
        if (!found || opt.term) {
            break;
        }
        found.poly[marker] = true;
        startPoint = emitter(found.poly, found.index, ++count, startPoint) || found.point;
    }

    // undo delete marks
    if (opt.perm !== true) {
        array.forEach(function(poly) { poly[marker] = false });
    }

    return startPoint;
}

function calc_normal(p1, p2) {
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let len = Math.sqrt(dx * dx + dy * dy);
    let mn = (1 / len);
    dx *= mn;
    dy *= mn;
    return({ dx: dy, dy: -dx, p1, p2, len });
}

function end_vertex(n1, n2, off, start) {
    let dx, dy;
    if (start) {
        dx = n2.dx * off;
        dy = n2.dy * off;
    } else {
        dx = n1.dx * off;
        dy = n1.dy * off;
    }
    return { dx, dy, vp: n1.p2 };
}

function calc_vertex(n1, n2, off, vp) {
    let dx, dy, io, vl, q, r;
    r = 1 + (n1.dx * n2.dx + n1.dy * n2.dy);
    q = off / r;
    // handle spurs that switch back 180 degrees
    if (q === Infinity) {
        q = 0;
    }
    dx = (n1.dx + n2.dx) * q;
    dy = (n1.dy + n2.dy) * q;
    // io tells us whether we're turning left or right
    io = (n1.dx * n2.dy - n2.dx * n1.dy);
    // vertex length can be compared to the previons and next
    // segment lengths to see if we're highly acute
    vl = Math.sqrt(dx * dx + dy * dy);
    return { dx, dy, vp: vp || n1.p2, io, vl };
}

function v2pl(rec) {
    let p = rec.vp.clone();
    p.x += rec.dx;
    p.y += rec.dy;
    p.vp = rec.vp;
    return p;
}

function v2pr(rec) {
    let p = rec.vp.clone();
    p.x -= rec.dx;
    p.y -= rec.dy;
    p.vp = rec.vp;
    return p;
}

function pointsToPath(points, offset, open, miter = 1.5) {
    const absoff = Math.abs(offset);
    // calculate segment normals which are used to calculate vertex normals
    // next segment info is associated with the current point
    const nupoints = [];
    const length = points.length;
    if (length === 2 && points[0].isEqual(points[1])) {
        return { };
    }
    const dedup = (open && length > 2) || (!open && length > 3);
    for (let i=0; i<length; i++) {
        let p1 = points[i];
        let p2 = points[(i + 1) % length];
        p1.normal = calc_normal(p1, p2);
        // drop next duplicate point if segment length is 0
        // is possible there are 3 dups in a row and this is
        // not handled. could make if a while, but that could
        // end up in a loop without additional checks. ignore
        // the case when the last and first point are the same
        // which is valid when the line is an open path
        if (dedup && p1.normal.len === 0 && i !== length - 1) {
            p1.normal = calc_normal(p1, points[(i + 2) % length]);
            i++;
        }
        nupoints.push(p1);
    }
    if (nupoints.length === 1) {
        console.log({points, nupoints});
    }
    // when points are dropped, we need the new array
    points = nupoints;
    // generate left / right paths and triangle faces
    const left = [];
    const right = [];
    const faces = [];
    const normals = [];
    const zn = -1;
    // calculate vertex normals from segments normals
    // vertex info is associated with the origin point
    let fl, fr;
    for (let i=0, l=points.length; i<l; i++) {
        let n1 = points[(i+l-1)%l].normal;
        let n2 = points[(i+l)%l].normal;
        let vn = open && (i === 0 || i === l-1) ?
            end_vertex(n1, n2, offset, i === 0) :
            calc_vertex(n1, n2, offset);
        let { p1, p2 } = n2;
        let { io, vl } = vn;
        if (offset < 0) {
            io = -io;
        }
        let split_left = false, split_right = false;
        if (io > 0) { // right
            split_left = vl > absoff * miter;
            split_right = vl > Math.min(n1.len, n2.len) + absoff;
        } else { // left
            split_right = vl > absoff * miter;
            split_left = vl > Math.min(n1.len, n2.len) + absoff;
        }
        let l0 = left.peek(1);
        let r0 = right.peek(1);
        if (split_left || split_right) {
            // shorten each leg and insert new point
            let delta = 0.1;
            let np1 = p1.clone().move({ x: n1.dy * delta, y: -n1.dx * delta, z: 0 });
            let np2 = p1.clone().move({ x:-n2.dy * delta, y:  n2.dx * delta, z: 0 });
            let sn1 = np1.normal = calc_normal(np1, np2);
            let sn2 = np2.normal = p1.normal;
            let nv1 = calc_vertex(n1.p1.normal, sn1, offset, np1);
            let nv2 = calc_vertex(sn1, sn2, offset, np2);
            if (split_right) {
                right.push(v2pr(nv1), v2pr(nv2));
            } else {
                right.push(v2pr(vn));
            }
            if (split_left) {
                left.push(v2pl(nv1), v2pl(nv2));
            } else {
                left.push(v2pl(vn));
            }
            if (faces) {
                let l1 = left.peek(1);
                let r1 = right.peek(1);
                let l2 = left.peek(2);
                let r2 = right.peek(2);
                let ln = l1.vp.normal;
                let rn = r1.vp.normal;
                if (split_left && split_right) {
                    faces.push(l1, l2, r1);
                    faces.push(r2, r1, l2);
                    fl = fl || l2;
                    fr = fr || r2;
                    normals.push(ln.dx, ln.dy, zn);
                    normals.push(ln.dx, ln.dy, zn);
                    normals.push(-rn.dx, -rn.dy, zn);
                    normals.push(-rn.dx, -rn.dy, zn);
                    normals.push(-rn.dx, -rn.dy, zn);
                    normals.push(ln.dx, ln.dy, zn);
                } else if (split_left) {
                    faces.push(l1, l2, r1);
                    fl = fl || l2;
                    fr = fr || r1;
                    normals.push(ln.dx, ln.dy, zn);
                    normals.push(ln.dx, ln.dy, zn);
                    normals.push(-rn.dx, -rn.dy, zn);
                } else { // split right
                    faces.push(r2, r1, l1);
                    fl = fl || l1;
                    fr = fr || r2;
                    normals.push(-rn.dx, -rn.dy, zn);
                    normals.push(-rn.dx, -rn.dy, zn);
                    normals.push(ln.dx, ln.dy, zn);
                }
            }
        } else {
            left.push(v2pl(vn));
            right.push(v2pr(vn));
            fl = fl || left.peek(1);
            fr = fr || right.peek(1);
        }
        if (faces && l0 && r0) {
            let l1 = left.peek(split_left ? 2 : 1);
            let r1 = right.peek(split_right ? 2 : 1);
            faces.push(l1, l0, r1);
            faces.push(r0, r1, l0);
            let ln = l0.vp.normal;
            let rn = r0.vp.normal;
            normals.push(ln.dx, ln.dy, zn);
            normals.push(ln.dx, ln.dy, zn);
            normals.push(-rn.dx, -rn.dy, zn);
            normals.push(-rn.dx, -rn.dy, zn);
            normals.push(-rn.dx, -rn.dy, zn);
            normals.push(ln.dx, ln.dy, zn);
        }
    }
    if (open) {
        // move open ends by offset length
        const p0 = points[0].normal;
        const l0 = left[0];
        const r0 = right[0];
        // improve visuals of open but 90 degree overlapping ends
        const move = offset * 0.99;
        l0.x += p0.dy * move;
        l0.y -= p0.dx * move;
        r0.x += p0.dy * move;
        r0.y -= p0.dx * move;
        const pn = points.peek(2).normal;
        const ln = left.peek();
        const rn = right.peek();
        ln.x -= pn.dy * move;
        ln.y += pn.dx * move;
        rn.x -= pn.dy * move;
        rn.y += pn.dx * move;
    }
    if (!open && faces) {
        let l1 = left.peek(1);
        let r1 = right.peek(1);
        let ln = l1.vp.normal;
        let rn = r1.vp.normal;
        faces.push(fl, l1, fr);
        faces.push(r1, fr, l1);
        normals.push(ln.dx, ln.dy, zn);
        normals.push(ln.dx, ln.dy, zn);
        normals.push(-rn.dx, -rn.dy, zn);
        normals.push(-rn.dx, -rn.dy, zn);
        normals.push(-rn.dx, -rn.dy, zn);
        normals.push(ln.dx, ln.dy, zn);
    }

    return { left, right, faces, normals, open };
}

function pathTo3D(path, height, z) {
    const { faces, normals, left, right, open } = path;
    const out = [];
    const nrm = [];
    if (!(faces && left && right)) {
        return [];
    }
    if (z !== undefined) {
        for (let p of faces) {
            p.z = z;
        }
    }
    for (let p of faces) {
        out.push(p.x, p.y, p.z - height);
    }
    for (let p of faces.slice().reverse()) {
        out.push(p.x, p.y, p.z + height);
    }
    nrm.appendAll(normals);
    // reverse normals to match faces, but underside so reverse Z as well
    for (let i=normals.length-1; i>0; i-=3) {
        nrm.push(normals[i-2]);
        nrm.push(normals[i-1]);
        nrm.push(-normals[i-0]);
    }
    for (let i=0, l=left.length, tl = open ? l-1 : l; i<tl; i++) {
        let p0 = left[i];
        let p1 = left[(i+1)%l];
        out.push(p0.x, p0.y, p0.z + height);
        out.push(p0.x, p0.y, p0.z - height);
        out.push(p1.x, p1.y, p1.z - height);
        out.push(p1.x, p1.y, p1.z - height);
        out.push(p1.x, p1.y, p1.z + height);
        out.push(p0.x, p0.y, p0.z + height);
        let ln = p0.vp.normal;
        nrm.push(ln.dx, ln.dy, -1);
        nrm.push(ln.dx, ln.dy,  1);
        nrm.push(ln.dx, ln.dy,  1);
        nrm.push(ln.dx, ln.dy,  1);
        nrm.push(ln.dx, ln.dy, -1);
        nrm.push(ln.dx, ln.dy, -1);
    }
    for (let i=0, l=right.length, tl = open ? l-1 : l; i<tl; i++) {
        let p0 = right[i];
        let p1 = right[(i+1)%l];
        out.push(p0.x, p0.y, p0.z + height);
        out.push(p1.x, p1.y, p1.z - height);
        out.push(p0.x, p0.y, p0.z - height);
        out.push(p1.x, p1.y, p1.z - height);
        out.push(p0.x, p0.y, p0.z + height);
        out.push(p1.x, p1.y, p1.z + height);
        let rn = p0.vp.normal;
        nrm.push(-rn.dy, rn.dx,  1);
        nrm.push(-rn.dy, rn.dx, -1);
        nrm.push(-rn.dy, rn.dx, -1);
        nrm.push(-rn.dy, rn.dx, -1);
        nrm.push(-rn.dy, rn.dx,  1);
        nrm.push(-rn.dy, rn.dx,  1);
    }
    if (open) {
        // begin cap
        let l0 = left[0];
        let r0 = right[0];
        out.push(l0.x, l0.y, l0.z + height);
        out.push(r0.x, r0.y, r0.z - height);
        out.push(l0.x, l0.y, l0.z - height);
        out.push(r0.x, r0.y, r0.z + height);
        out.push(r0.x, r0.y, r0.z - height);
        out.push(l0.x, l0.y, l0.z + height);
        let ln = l0.vp.normal;
        nrm.push(-ln.dy, ln.dx,  1);
        nrm.push(-ln.dy, ln.dx, -1);
        nrm.push(-ln.dy, ln.dx, -1);
        nrm.push(-ln.dy, ln.dx,  1);
        nrm.push(-ln.dy, ln.dx, -1);
        nrm.push(-ln.dy, ln.dx,  1);
        // end cap
        let le = left.peek();
        let re = right.peek();
        out.push(le.x, le.y, le.z + height);
        out.push(le.x, le.y, le.z - height);
        out.push(re.x, re.y, re.z - height);
        out.push(re.x, re.y, re.z + height);
        out.push(le.x, le.y, le.z + height);
        out.push(re.x, re.y, re.z - height);
        ln = re.vp.normal;
        nrm.push(-ln.dy, ln.dx,  1);
        nrm.push(-ln.dy, ln.dx, -1);
        nrm.push(-ln.dy, ln.dx, -1);
        nrm.push(-ln.dy, ln.dx,  1);
        nrm.push(-ln.dy, ln.dx,  1);
        nrm.push(-ln.dy, ln.dx, -1);
    }
    return { faces: out, normals: nrm };
}

// produces indexed geometry which isn't ideal for rendering because
// the default threejs generated vertex normals aren't accurate
function shapeToPath(shape, points, closed) {
    closed = closed !== undefined ? closed : true;

    const profileGeometry = new THREE.ShapeGeometry(shape);
    profileGeometry.rotateX(Math.PI * .5);

    const profile = profileGeometry.attributes.position;
    const faces = new Float32Array(profile.count * points.length * 3);

    for (let i = 0; i < points.length; i++) {
        const v1 = new THREE.Vector2().subVectors(points[i - 1 < 0 ? points.length - 1 : i - 1], points[i]);
        const v2 = new THREE.Vector2().subVectors(points[i + 1 == points.length ? 0 : i + 1], points[i]);
        const angle = v2.angle() - v1.angle();
        const halfAngle = angle * .5;
        let hA = halfAngle;
        let tA = v2.angle() + Math.PI * .5;

        if (!closed){
            if (i == 0 || i == points.length - 1) {hA = Math.PI * .5;}
            if (i == points.length - 1) {tA = v1.angle() - Math.PI * .5;}
        }

        const shift = Math.tan(hA - Math.PI * .5);
        const shiftMatrix = new THREE.Matrix4().set(
            1, 0, 0, 0,
            -shift, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );

        const tempAngle = tA;
        const rotationMatrix = new THREE.Matrix4().set(
            Math.cos(tempAngle), -Math.sin(tempAngle), 0, 0,
            Math.sin(tempAngle), Math.cos(tempAngle), 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        );

        const translationMatrix = new THREE.Matrix4().set(
            1, 0, 0, points[i].x,
            0, 1, 0, points[i].y,
            0, 0, 1, 0,
            0, 0, 0, 1,
        );

        const cloneProfile = profile.clone();
        cloneProfile.applyMatrix4(shiftMatrix);
        cloneProfile.applyMatrix4(rotationMatrix);
        cloneProfile.applyMatrix4(translationMatrix);

        faces.set(cloneProfile.array, cloneProfile.count * i * 3);
    }

    const index = [];
    const lastCorner = closed == false ? points.length - 1: points.length;

    for (let i = 0; i < lastCorner; i++) {
        for (let j = 0; j < profile.count; j++) {
            const currCorner = i;
            const nextCorner = i + 1 == points.length ? 0 : i + 1;
            const currPoint = j;
            const nextPoint = j + 1 == profile.count ? 0 : j + 1;

            const a = nextPoint + profile.count * currCorner;
            const b = currPoint + profile.count * currCorner;
            const c = currPoint + profile.count * nextCorner;
            const d = nextPoint + profile.count * nextCorner;

            index.push(a, b, d);
            index.push(b, c, d);
        }
    }

    if (!closed) {
        // cheating because we know the profile length is 4 (for now)
        const p1 = 0 + profile.count * 0;
        const p2 = 1 + profile.count * 0;
        const p3 = 2 + profile.count * 0;
        const p4 = 3 + profile.count * 0;
        index.push(p1, p2, p3);
        index.push(p1, p3, p4);
        const lc = lastCorner;
        const p5 = 0 + profile.count * lc;
        const p6 = 1 + profile.count * lc;
        const p7 = 2 + profile.count * lc;
        const p8 = 3 + profile.count * lc;
        index.push(p7, p6, p5);
        index.push(p8, p7, p5);
    }

    return {index, faces};
}

class FloatPacker {
    constructor(size, factor) {
        this.size = size;
        this.factor = Math.min(factor || 1.2, 1.1);
        this.array = new Float32Array(size);
        this.pos = 0;
    }

    push() {
        const array = this.array;
        const size = this.size;
        const args = arguments.length;
        if (this.pos + args >= size) {
            let nusize = ((size * this.factor) | 0) + args;
            let nuarray = new Float32Array(nusize);
            nuarray.set(array);
            this.array = nuarray;
            this.size = nusize;
        }
        for (let i=0; i<args; i++) {
            array[this.pos++] = arguments[i];
        }
    }

    finalize() {
        if (this.pos / this.size >= 0.9) {
            return this.array.subarray(0, this.pos);
        } else {
            return this.array.slice(0, this.pos);
        }
    }
}

base.paths = {
    poly2polyEmit,
    tip2tipEmit,
    shapeToPath,
    pointsToPath,
    pathTo3D,
    vertexNormal: calc_vertex,
    segmentNormal: calc_normal
};

});
