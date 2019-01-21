/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_base_debug = exports;

(function() {

    if (!self.base) self.base = {};
    if (self.base.debug) return;

    var base = self.base,
        enabled = false,
        flags = {},
        stash = [],
        size = 20,
        next_debug_color = 0,
        debug_colors = [0xff0000, 0x00ff00, 0x0000ff, 0x00ffff, 0xff00ff, 0xffff00];

    /** ******************************************************************
     * Debug Functions
     ******************************************************************* */

    function log(o) {
        console.log(o);
        if (enabled) {
            stash.push(o);
            while (stash.length > size) stash.shift();
        }
    }

    function enable(history) {
        enabled = true;
        if (history) size = Math.abs(history);
    }

    function disable() {
        enabled = false;
    }

    function on() {
        return enabled;
    }

    function history() {
        return stash;
    }

    function last() {
        return stash[stash.length-1];
    }

    function trace(msg) {
        if (msg && typeof msg != 'string') msg = JSON.stringify(msg);
        log(new Error(msg).stack);
    }

    function view() {
        return base.debug.view;
    }

    function setView(view) {
        base.debug.view = view;
    }

    function get(f) {
        return flags[f];
    }

    function set(f, value) {
        if (Array.isArray(f)) {
            for (var i=0; i<f.length; i++) flags[f[i]] = (value || 1);
        } else {
            flags[f] = (value || 1);
        }
    }

    function clear(f) {
        if (Array.isArray(f)) {
            for (var i = 0; i < f.length; i++) delete flags[f[i]];
        } else {
            delete flags[f];
        }
    }

    function test(isSet, isNotSet) {
        var i;
        if (isNotSet) {
            if (Array.isArray(isNotSet)) {
                for (i=0; i<isNotSet.length; i++) {
                    if (flags[isNotSet[i]]) return null;
                }
            } else {
                if (flags[isNotSet]) return null;
            }
        }
        if (isSet) {
            if (Array.isArray(isSet)) {
                for (i=0; i<isSet.length; i++) {
                    if (!flags[isSet[i]]) return null;
                }
            } else {
                if (!flags[isSet]) return null;
            }
        }
        return view() || true;
    }

    function nextDebugColor() {
        return debug_colors[next_debug_color++ % debug_colors.length];
    }

    /**
     * render point array as discrete points
     *
     * @param {Point[]} points
     * @param {number} [color]
     * @param {number} [opacity]
     * @param {number} [size]
     * @returns {THREE.PointCloud}
     */
    function points(points, color, opacity, size) {
        view().points(points, color, size);
    }

    /**
     *
     * @param {Point[]} points
     * @param {number} color
     * @returns {THREE.Line}
     */
    function lines(points, color) {
        view().lines(points, color);
    }

    /**
     *
     * @param {Polygon} poly
     * @param {number} color
     * @param {boolean} [recurse]
     * @returns {THREE.Object}
     */
    function polygon(poly, color, recurse) {
        return poly.render(view(), color, recurse);
    }

    /**
     * debug polygon
     *
     * @param {Polygon} poly
     * @param {number} [z]
     * @param {Layer} [v]
     * @param {boolean} [deep]
     * @param {boolean} [creep]
     */
    function xray(poly, z, v, deep, creep) {
        var colors = [
                0xaa0000,
                0x0,
                0xaaaa00,
                0x444444,
                0x00ff00,
                0x888888,
                0x00aaaa,
                0x0,
                0x0000aa,
                0x444444,
                0xaa00aa,
                0x888888
            ],
            cidx = 0,
            point,
            next,
            layer = v || view();
        if (typeof(z) === 'number') poly.setZ(z);
        poly.forEachPoint(function(next) {
            if (!point) return next = point;
            if (creep) next.z = (z = z + 0.1);
            layer.lines([point.clone(), next.clone()], colors[cidx++ % colors.length]);
            point = next;
        });
        layer.lines([poly.last().clone(), poly.first().clone()], 0xffffff);
        layer.points(poly.points,  0x000000, 0.1);
        layer.points([poly.first()], 0xffffff, 0.4);
        layer.points([poly.last()],  0x555555, 0.45);
        if (deep && poly.inner) {
            poly.inner.forEach(function(p) { xray(p, z, v, false, creep) });
        }
    }

    /** ******************************************************************
     * Connect to base
     ******************************************************************* */

    base.debug = {
        on : on,
        enable : enable,
        disable : disable,
        history : history,
        last : last,

        get : get,
        set : set,
        clear : clear,

        log : log,
        trace : trace,
        test : test,
        view : null,
        setView : setView,
        color : nextDebugColor,

        xray : xray,
        points : points,
        lines : lines,
        polygon : polygon,

        slice : null, // todo temp
    };

})();
