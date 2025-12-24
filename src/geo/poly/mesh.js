/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

import { earcut as earcutLib } from '../base.js';
import { newPolygon } from '../polygon.js';
import { polygons as POLY } from '../polygons.js';

/**
 * Mesh generation utility functions for polygons.
 * These utilities convert 2D polygons into 3D meshes and geometry.
 */

/**
 * Triangulate polygon using earcut library.
 * Returns array of triangular polygons with preserved alignment/swap info.
 *
 * @param {Polygon} poly - polygon to triangulate
 * @returns {Polygon[]} array of triangular polygons
 */
export function earcut(poly) {
    // gather all points into a single array including inner polys
    // keeping track of array offset indices for inners
    let out = [];
    let holes = [];

    // flatten points into array for earcut()
    poly.points.forEach(p => {
        out.push(p.x, p.y, p.z);
    });

    // add hole offsets for inner polygons
    if (poly.inner) {
        poly.inner.forEach(p => {
            holes.push(out.length / 3);
            p.points.forEach(p => {
                out.push(p.x, p.y, p.z);
            })
        });
    }

    // perform earcut()
    let cut = earcutLib(out, holes, 3);
    let ret = [];

    // preserve swaps in new polys
    for (let i = 0; i < cut.length; i += 3) {
        let p = new (poly.constructor)();
        p._aligned = poly._aligned;
        p._swapped = poly._swapped;
        for (let j = 0; j < 3; j++) {
            let n = cut[i + j] * 3;
            p.add(out[n], out[n + 1], out[n + 2]);
        }
        ret.push(p);
    }

    return ret;
}

/**
 * Turn 2D polygon into a 2.5D ribbon extruded in Z.
 * Returns flat array of vertices for mesh rendering.
 *
 * @param {Polygon} poly - polygon to extrude as ribbon
 * @param {number} z - Z height (default 1)
 * @param {number} zadd - Z offset (default 0)
 * @param {boolean} rev - reverse winding (default false)
 * @returns {number[]} flat array of triangle vertices
 */
export function ribbonZ(poly, z = 1, zadd = 0, rev) {
    let clone = poly.clone().setClockwise();
    let faces = [];
    let points = clone.points;
    let length = points.length;
    if (rev) {
        points = points.slice().reverse();
    }
    for (let i=0; i<length; i++) {
        let p0 = points[i];
        let p1 = points[(i + 1) % length];
        faces.push(p0.x, p0.y, p0.z + zadd);
        faces.push(p1.x, p1.y, p1.z + z + zadd);
        faces.push(p1.x, p1.y, p0.z + zadd);
        faces.push(p0.x, p0.y, p0.z + zadd);
        faces.push(p0.x, p0.y, p0.z + z + zadd);
        faces.push(p1.x, p1.y, p1.z + z + zadd);
    }
    return faces;
}

/**
 * For turning a poly with an inner offset into a 3D mesh.
 * Requires inner has same circularity and <= num points.
 * Primarily used to make chamfers in mesh:tool.
 *
 * @param {Polygon} poly - polygon with exactly one inner
 * @param {boolean} swap - swap winding for normals
 * @returns {number[]|undefined} flat array of triangle vertices or undefined if invalid
 */
export function ribbonMesh(poly, swap) {
    if (!(poly.inner && poly.inner.length === 1)) {
        return undefined;
    }
    let outer = poly.clone().setClockwise();
    let inner = poly.inner[0].clone().setClockwise();
    let c0 = outer.circularity();
    let c1 = inner.circularity();
    let n0 = outer.points.length;
    let n1 = inner.points.length;
    let p0 = outer.points.slice();
    let p1 = inner.points.slice();
    let min = { d: Infinity, i:0, j:0 };
    // find the closests two points inner/outer
    for (let i=0; i<p0.length; i++) {
        for (let j=0; j<p1.length; j++) {
            let d = p0[i].distTo2D(p1[j]);
            if (d < min.d) {
                min = { d, i, j };
            }
        }
    }
    // slide the arrays until the closest points are aligned at index = 0
    p0 = p0.slice(min.i).concat(p0.slice(0, min.i)); p0.push(p0[0]);
    p1 = p1.slice(min.j).concat(p1.slice(0, min.j)); p1.push(p1[0]);
    // walk both arrays moving to the next poly + point that forms
    // the shortest line segment between the two points (inner / outer)
    let faces = [];
    let pi0 = 0;
    let pi1 = 0;
    let pp0 = p0[pi0];
    let pp1 = p1[pi1];
    for (;;) {
        let pn0 = p0[pi0 + 1];
        let pn1 = p1[pi1 + 1];
        if ((!pn0 && pn1) || (pn1 && pp0.distTo2D(pn1) < pp1.distTo2D(pn0))) {
            // emit and increment bottom
            faces.push(pp0.x, pp0.y, pp0.z);
            if (swap) {
                faces.push(pp1.x, pp1.y, pp1.z);
                faces.push(pn1.x, pn1.y, pn1.z);
            } else {
                faces.push(pn1.x, pn1.y, pn1.z);
                faces.push(pp1.x, pp1.y, pp1.z);
            }
            pi1++;
            pp1 = p1[pi1];
        } else if (pn0) {
            // emit and increment top
            faces.push(pp0.x, pp0.y, pp0.z);
            if (swap) {
                faces.push(pp1.x, pp1.y, pp1.z);
                faces.push(pn0.x, pn0.y, pn0.z);
            } else {
                faces.push(pn0.x, pn0.y, pn0.z);
                faces.push(pp1.x, pp1.y, pp1.z);
            }
            pi0++;
            pp0 = p0[pi0];
        } else {
            break;
        }
    }
    return faces;
}

/**
 * Extrude polygon (with inner voids) into 3D mesh.
 * Supports chamfers on top and/or bottom edges.
 *
 * @param {Polygon} poly - polygon to extrude
 * @param {number} z - Z height (default 1)
 * @param {Object} opt - options
 * @param {number} opt.zadd - Z offset for bottom (default 0)
 * @param {number} opt.chamfer - chamfer size for both top and bottom (default 0)
 * @param {number} opt.chamfer_top - chamfer size for top (overrides chamfer)
 * @param {number} opt.chamfer_bottom - chamfer size for bottom (overrides chamfer)
 * @returns {number[]} flat array of triangle vertices
 */
export function extrude(poly, z = 1, opt = {}) {
    let earcutFaces = earcut(poly); // array of 3-point polygons

    // return just the 2D face when no Z depth specified
    // used primarily by mesh.sketch render()
    if (z === 0) {
        return earcutFaces.map(face => face.points.map(p => [ p.x, p.y, p.z ])).flat().flat();
    }

    let inv = z < 0;

    if (inv) {
        z = -z;
    }

    let chamfer = opt.chamfer || 0;
    let chamfer_top = opt.chamfer_top || chamfer;
    let chamfer_bottom = opt.chamfer_bottom || chamfer;

    if (inv) {
        let tmp = chamfer_top;
        chamfer_top = chamfer_bottom;
        chamfer_bottom = tmp;
    }

    let zadd = (typeof opt === 'number' ? opt : opt.zadd || 0); // z bottom
    let obj = []; // flat output vertex array (float-x,float-y,float-z,...)
    let top_face = earcutFaces;
    let bottom_face = earcutFaces;
    let z_top = z + zadd;
    let z_bottom = zadd;
    let z_side_top = z;
    let z_side_bottom = z_bottom;

    // chamfer bottom only on negative chamfer
    if (chamfer < 0) {
        chamfer_top = 0;
        chamfer_bottom = -chamfer;
    }

    // create chamfers (when defined)
    if (chamfer_top) {
        let inset = poly.offset(chamfer_top);
        if (inset.length === 1) {
            inset[0].setZ(z_top);
            top_face = earcut(inset[0]);
            z_side_top -= chamfer_top;
            let renest = POLY.renest([poly.clone(true).setZ(z_side_top), inset[0]]);
            for (let rnpoly of renest) {
                obj.appendAll(ribbonMesh(rnpoly, true));
            }
        }
    }

    if (chamfer_bottom) {
        let inset = poly.offset(chamfer_bottom);
        if (inset.length === 1) {
            inset[0].setZ(0);
            bottom_face = earcut(inset[0]);
            z_side_top -= chamfer_top || chamfer_bottom;
            z_side_bottom += chamfer_bottom;
            let renest = POLY.renest([poly.clone(true).setZ(z_side_bottom), inset[0]]);
            for (let rnpoly of renest) {
                obj.appendAll(ribbonMesh(rnpoly, false));
            }
        }
    }

    for (let p of top_face) {
        for (let point of p.points) {
            obj.push(point.x, point.y, z_top);
        }
    }

    // bottom face (reversed to reverse normals)
    for (let p of bottom_face) {
        for (let point of p.points.reverse()) {
            obj.push(point.x, point.y, z_bottom);
        }
    }

    // outside wall
    let rib = z - chamfer_top - chamfer_bottom;
    obj.appendAll(ribbonZ(poly, rib, z_side_bottom));
    for (let inner of poly.inner || []) {
        // inside wall(s)
        obj.appendAll(ribbonZ(inner, rib, z_side_bottom, true));
    }

    if (inv) {
        for (let i=2; i<obj.length; i+=3) {
            obj[i] -= z;
        }
    }

    return obj;
}
