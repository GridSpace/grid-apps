/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_codec = exports;

(function() {

    if (!self.kiri) self.kiri = {};
    if (self.kiri.codec) return;

    var base = self.base,
        kiri = self.kiri,
        handlers = {};

    kiri.codec = {
        encode: encode,
        decode: decode,
        registerDecoder: registerDecoder
    };

    function encode(o, state) {
        state = state || {};
        if (o === null) return null;
        if (o === undefined) return undefined;
        if (Array.isArray(o)) {
            var arr = new Array(o.length), i=0;
            while (i < o.length) arr[i] = encode(o[i++], state);
            return arr;
        }
        switch (typeof(o)) {
            case 'string':
            case 'number':
                return o;
            case 'object':
                if (o.encode) return o.encode(state);
                return genOEncode(o, state);
        }
        return null;
    }

    function decode(o, state) {
        state = state || {};
        if (o === null) return null;
        if (o === undefined) return undefined;
        if (Array.isArray(o)) {
            for (var i=0; i < o.length; i++) o[i] = decode(o[i],state);
            return o;
        }
        switch (typeof(o)) {
            case 'string':
            case 'number':
                return o;
            case 'object':
                if (o.type && handlers[o.type]) return handlers[o.type](o,state);
                return genODecode(o, state);
        }
        return null;
    }

    function registerDecoder(type, handler) {
        handlers[type] = handler;
    }

    function genOEncode(o, state) {
        if (o instanceof Float32Array) return o;
        var out = {};
        for (var k in o) {
            if (o.hasOwnProperty(k)) out[k] = encode(o[k], state);
        }
        return out;
    }

    function genODecode(o, state) {
        if (o instanceof Float32Array) return o;
        var out = {};
        for (var k in o) {
            if (o.hasOwnProperty(k)) out[k] = decode(o[k], state);
        }
        return out;
    }

    /** ******************************************************************
     * Object CODEC Functions
     ******************************************************************* */

    kiri.Slice.prototype.encode = function(state) {
        return {
            type: 'slice',
            z: this.z,
            index: this.index,
            camMode: this.camMode,
            tops: encode(this.tops, state),
            bridges: encode(this.bridges, state),
            flats: encode(this.flats, state),
            solids: encode(this.solids, state),
            supports: encode(this.supports, state)
            //groups: encode(this.groups, state)
        };
    };

    registerDecoder('slice', function(v, state) {
        var slice = kiri.newSlice(v.z, state.mesh ? state.mesh.newGroup() : null);

        slice.index = v.index;
        slice.camMode = v.camMode;
        slice.tops = decode(v.tops, state);
        slice.bridges = decode(v.bridges, state);
        slice.flats = decode(v.flats, state);
        slice.solids = decode(v.solids, state);
        slice.supports = decode(v.supports, state);
        //slice.groups = decode(v.groups, state);

        return slice;
    });

    kiri.Top.prototype.encode = function(state) {
        return {
            type: 'top',
            poly: encode(this.poly, state),
            traces: encode(this.traces, state),
            inner: encode(this.inner, state),
            // thinner: encode(this.thinner, state),
            solids: encode(this.solids, state),
            fill_lines: encodePointArray(this.fill_lines),
            fill_sparse: encode(this.fill_sparse, state)
        };
    };

    registerDecoder('top', function(v, state) {
        var top = kiri.newTop(decode(v.poly, state));

        top.traces = decode(v.traces, state);
        top.inner = decode(v.inner, state);
        // top.thinner = decode(v.thinner, state);
        top.solids = decode(v.solids, state);
        top.fill_lines = decodePointArray(v.fill_lines,state);
        top.fill_sparse = decode(v.fill_sparse, state);

        return top;
    });

    function encodePointArray(points) {
        if (!points) return null;

        var array = new Float32Array(points.length * 3),
            pos = 0;

        points.forEach(function(point) {
            array[pos++] = point.x;
            array[pos++] = point.y;
            array[pos++] = point.z;
        });

        return array;
    }

    function decodePointArray(array) {
        if (!array) return null;

        var vid = 0,
            pid = 0,
            points = new Array(array.length/3);

        while (vid < array.length) {
            points[pid++] = base.newPoint(array[vid++], array[vid++], array[vid++]);
        }

        return points;
    }

    base.Polygon.prototype.encode = function(state) {
        if (!state.poly) state.poly = {};

        var cached = state.poly[this.id];

        if (cached) {
            return {
                type: 'poly',
                ref: this.id
            };
        }

        state.poly[this.id] = this;

        return {
            type: 'poly',
            id: this.id,
            array: encodePointArray(this.points),
            open: this.isOpen(),
            inner: encode(this.inner, state),
            parent: encode(this.parent, state),
            fills: encodePointArray(this.fills),
            depth: this.depth
        };
    };

    registerDecoder('poly', function(v, state) {
        if (!state.poly) state.poly = {};

        if (v.ref) return state.poly[v.ref];

        var poly = base.newPolygon(),
            vid = 0;

        while (vid < v.array.length) {
            poly.push(base.newPoint(v.array[vid++], v.array[vid++], v.array[vid++]));
        }

        poly.id = v.id;
        poly.open = v.open;
        // if (v.open) poly.setOpen(); else poly.setClosed();

        state.poly[v.id] = poly;

        poly.inner = decode(v.inner, state);
        poly.parent = decode(v.parent, state);
        poly.fills = decodePointArray(v.fills);
        poly.depth = v.depth;

        return poly;
    });


})();
