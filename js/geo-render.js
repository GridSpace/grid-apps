/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_base_render = exports;

(function() {

    if (!self.base) self.base = {};
    if (self.base.render) return;

    var BASE = self.base,
        line_width = 1,
        materialCache = {};

    BASE.render = {
        wireframe : wireframe
    };

    /** ******************************************************************
     * Render Functions
     ******************************************************************* */

    /**
     * render triangle array as line segments. use of {@link newOrderedLine}
     * allows lines to be cached by normalizing key order.
     *
     * @param {THREE.Group} group
     * @param {Point[]} points
     * @param {number} color
     * @returns {THREE.Line}
     */
    function wireframe(group, points, color) {
        if (points.length % 3 != 0) throw "invalid line : "+points.length;
        var lines = new THREE.Geometry(),
            hash = {},
            added = 0;
        for (var i = 0; i < points.length; i += 3) {
            var p1 = points[i],
                p2 = points[i + 1],
                p3 = points[i + 2],
                l1 = newOrderedLine(p1, p2),
                l2 = newOrderedLine(p2, p3),
                l3 = newOrderedLine(p3, p1);
            if (!hash[l1.key]) {
                lines.vertices.push(new THREE.Vector3(p1.x, p1.y, p1.z));
                lines.vertices.push(new THREE.Vector3(p2.x, p2.y, p2.z));
                hash[l1.key] = ++added;
            }
            if (!hash[l2.key]) {
                lines.vertices.push(new THREE.Vector3(p2.x, p2.y, p2.z));
                lines.vertices.push(new THREE.Vector3(p3.x, p3.y, p3.z));
                hash[l2.key] = ++added;
            }
            if (!hash[l3.key]) {
                lines.vertices.push(new THREE.Vector3(p3.x, p3.y, p3.z));
                lines.vertices.push(new THREE.Vector3(p1.x, p1.y, p1.z));
                hash[l3.key] = ++added;
            }
        }
        lines.verticesNeedUpdate = true;
        var mesh = new THREE.LineSegments(lines, getMaterial(color));
        group.add(mesh);
        return mesh;
    }

    /** ******************************************************************
     * Connect to base and Helpers
     ******************************************************************* */

    /**
     * @param {number} color
     * @returns {THREE.LineBasicMaterial}
     */
    function getMaterial(color) {
        var material = materialCache[color];
        if (!material) {
            material = new THREE.LineBasicMaterial({
                fog:false,
                color: color,
                linewidth: line_width
            });
            materialCache[color] = material;
        }
        return material;
    }

    /**
     * required for line caching in {@link base.render.wireframe}
     *
     * @param {Point} p1
     * @param {Point} p2
     * @returns {Line}
     */
    function newOrderedLine(p1, p2) {
        return p1.key < p2.key ? BASE.newLine(p1, p2) : BASE.newLine(p2, p1);
    }

})();
