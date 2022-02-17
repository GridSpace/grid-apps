/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

const base = self.base;
if (base.paths) return;

const { util, config, newPoint } = base;
const { sqr, numOrDefault } = util;

const DEG2RAD = Math.PI / 180;

/**
 * emit each element in an array based on
 * the next closest endpoint.
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

base.paths = {
    poly2polyEmit,
    tip2tipEmit
};

})();
