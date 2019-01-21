/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_layer = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.Layer) return;

    var KIRI = self.kiri,
        LP = Layer.prototype,
        mcache = {};

    KIRI.Layer = Layer;
    KIRI.newLayer = function(view) { return new Layer(view) };

    function materialFor(color) {
        var m = mcache[color];
        if (!m) {
            m = mcache[color] = new THREE.LineBasicMaterial({
                fog: false,
                color: color,
                linewidth: 1
            });
        }
        return m;
    }

    function toVector(p) {
        return new THREE.Vector3(p.x, p.y, p.z);
    }

    function addPoly(arr, poly, deep, open) {
        var points = poly.points,
            len = points.length;

        if (len < 2) return;

        var doOpen = (open === undefined || open === null) ? poly.isOpen() : open,
            end = doOpen ? len - 1 : len,
            last = toVector(points[0]),
            i = 0;

        while (i < end) {
            arr.push(last);
            arr.push(last = toVector(points[(++i) % len]));
        }

        if (deep && poly.inner) {
            poly.inner.forEach(function(p) {
                addPoly(arr, p, false, open);
            })
        }
    }

    /**
     * @param {THREE.Group} view
     */
    function Layer(view) {
        this.changed = false;
        this.group = null;
        this.view = view;
        this.bycolor = {};
    };

    LP.setVisible = function(vis) {
        if (this.group) this.group.visible = vis;
    };

    LP.clear = function() {
        this.changed = true;
        this.bycolor = {};
    };

    LP.add = function(color, obj) {
        var ca = this.bycolor[color];
        if (!ca) ca = this.bycolor[color] = [];
        ca.push(obj);
    };

    LP.poly = function(poly, color, deep, open) {
        var layer = this;
        if (Array.isArray(poly)) {
            poly.forEach(function(p) { layer.poly(p, color, deep, open) });
        } else {
            this.add(color, {poly:poly, deep:deep, open:open});
            this.changed = true;
        }
    };

    LP.points = function(points, color, size, opacity) {
        var layer = this,
            sz = size/2;
        points.forEach(function(p) {
            layer.lines([
                toVector({x:p.x+sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z+sz}),

                toVector({x:p.x+sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z-sz}),

                toVector({x:p.x+sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x+sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x+sz, y:p.y-sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z+sz}),
                toVector({x:p.x-sz, y:p.y+sz, z:p.z-sz}),
                toVector({x:p.x-sz, y:p.y-sz, z:p.z-sz}),
            ], color);
        });
    };

    LP.lines = function(points, color) {
        this.add(color, {lines:points});
        this.changed = true;
    };

    LP.render = function() {
        if (!(this.view && this.changed)) return;
        if (this.group) this.view.remove(this.group);
        this.group = this.view.newGroup();

        var bycolor = this.bycolor,
            key, added;

        for (key in bycolor) {
            if (!bycolor.hasOwnProperty(key)) continue;

            var geo = new THREE.Geometry(),
                arr = geo.vertices,
                mat = materialFor(parseInt(key));
            added = bycolor[key];

            added.forEach(function(obj) {
                if (obj.poly) {
                    addPoly(arr, obj.poly, obj.deep, obj.open);
                } else if (obj.lines) {
                    obj.lines.forEach(function(p) {
                        arr.push(toVector(p));
                    });
                }
            });

            if (arr.length > 0) this.group.add(new THREE.LineSegments(geo, mat));
        }

        this.changed = false;
    }

})();
