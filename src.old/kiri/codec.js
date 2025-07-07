/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: main.kiri
// dep: geo.base
// dep: geo.polygon
// dep: kiri.widget
// dep: kiri.slice
// dep: kiri.layers
gapp.register("kiri.codec", [], (root, exports) => {

const { base, kiri } = root;
const decoders = {};
const freeMem = true;

const codec = exports({
    undef: undefined,
    encode: encode,
    decode: decode,
    registerDecoder: registerDecoder,
    allocFloat32Array: allocFloat32Array,
    encodePointArray,
    decodePointArray,
    encodePointArray2D,
    decodePointArray2D,
    toCodable
});

const TYPE = {
    WIDGET: 100,
    SLICE:  200,
    TOP:    300,
    POLY:   400,
    LAYERS: 500,
};

function toCodable(object) {
    switch (typeof object) {
        case 'function':
            return undefined;
        // case 'boolean':
        case 'string':
        case 'number':
            return object;
        case 'object':
            if (Array.isArray(object)) {
                return object.map(v => toCodable(v));
            }
            break;
    }
    let o = {};
    for (let [key, val] of Object.entries(object)) {
        switch (typeof val) {
            case 'function':
                break;
            case 'object':
                if (Array.isArray(val)) {
                    val = val.map(v => toCodable(v));
                } else {
                    val = toCodable(val);
                }
            default:
                o[key] = val;
                break;
        }
    }
    return o;
}

function allocFloat32Array(arg, zeros) {
    if (arg === undefined) {
        return undefined;
    }
    if (arg.length === 0) {
        return [];
    }
    let f32;
    if (arg.byteLength) {
        // already a float array
        f32 = arg;
    } else if (Array.isArray(arg)) {
        // create float array from array
        f32 = new Float32Array(arg);
    } else {
        // usually a number (size) for array
        f32 = new Float32Array(arg);
    }
    if (zeros && f32.byteLength > 0) {
        zeros.push(f32.buffer);
    }
    return f32;
}

function encode(o, state) {
    state = state || {};
    if (o === null) return null;
    if (o === undefined) return undefined;
    if (Array.isArray(o)) {
        let arr = new Array(o.length), i=0;
        while (i < o.length) arr[i] = encode(o[i++], state);
        return arr;
    }
    switch (typeof(o)) {
        case 'boolean':
        case 'string':
        case 'number':
            return o;
        case 'object':
            if (o.encode) return o.encode(state);
            return genericObjectEncode(o, state);
    }
    return null;
}

function decode(o, state) {
    state = state || {};
    if (o === null) return null;
    if (o === undefined) return undefined;
    if (Array.isArray(o)) {
        for (let i=0; i < o.length; i++) o[i] = decode(o[i],state);
        return o;
    }
    switch (typeof(o)) {
        case 'boolean':
        case 'string':
        case 'number':
            return o;
        case 'object':
            if (o.type && decoders[o.type]) return decoders[o.type](o,state);
            return genODecode(o, state);
    }
    return null;
}

function registerDecoder(type, handler) {
    decoders[type] = handler;
}

function genericObjectEncode(o, state) {
    if (o instanceof Float32Array) return o;
    let out = {};
    for (let k in o) {
        if (o.hasOwnProperty(k)) out[k] = encode(o[k], state);
    }
    return out;
}

function genODecode(o, state) {
    if (o instanceof Float32Array) return o;
    let out = {};
    for (let k in o) {
        if (o.hasOwnProperty(k)) out[k] = decode(o[k], state);
    }
    return out;
}

function encodePointArray(points, state, z) {
    if (!points) {
        return null;
    }

    const length = points.length;

    if (length === 0) {
        return points;
    }

    const zeros = state ? state.zeros : undefined;
    const array = codec.allocFloat32Array(length * 3, zeros);

    for (let i=0, pos=0, point; i<length; i++) {
        point = points[i];
        array[pos++] = point.x;
        array[pos++] = point.y;
        array[pos++] = z || point.z;
    }

    return array;
}

function encodePointArray2D(points, state) {
    if (!points) {
        return null;
    }

    const length = points.length;

    if (length === 0) {
        return points;
    }

    const zeros = state ? state.zeros : undefined;
    const array = codec.allocFloat32Array(length * 2, zeros);

    for (let i=0, pos=0, point; i<length; i++) {
        point = points[i];
        array[pos++] = point.x;
        array[pos++] = point.y;
    }

    return array;
}


function decodePointArray(array) {
    if (!array) return null;

    const length = array.length;
    const points = new Array(length / 3);

    for (let vid=0, pid=0; vid < length; ) {
        points[pid++] = base.newPoint(array[vid++], array[vid++], array[vid++]);
    }

    return points;
}

function decodePointArray2D(array, z, fn) {
    if (!array) return null;

    const length = array.length;
    const points = new Array(length / 2);

    for (let vid=0, pid=0; vid < length; ) {
        points[pid++] = fn ?
            fn(array[vid++], array[vid++]) :
            base.newPoint(array[vid++], array[vid++], z);
    }

    return points;
}

// ----- Widget Codec -----

kiri.Widget.prototype.encode = function(state) {
    const json = state._json_;
    const geo = this.getGeoVertices();
    const coded = {
        type: TYPE.WIDGET,
        id: this.id,
        ver: 1, // for better future encodings
        json: json, // safe for JSON (float32array mess)
        group: this.group.id,
        track: this.track,
        geo: json ? Array.from(geo) : geo
    };
    return coded;
};

registerDecoder(TYPE.WIDGET, function(v, state) {
    const id = v.id,
        group = v.group || id,
        track = v.track || undefined,
        widget = kiri.newWidget(id, kiri.Widget.Groups.forid(group));

    widget.loadVertices(v.json ? v.geo.toFloat32() : v.geo);
    widget.saved = Date.now();
    if (track && track.pos) {
        widget.track = track;
        widget.move(track.pos.x, track.pos.y, track.pos.z, true);
    }

    return widget;
});

// ----- Slice Codec -----

kiri.Slice.prototype.encode = function(state) {
    const rv = {
        type: TYPE.SLICE,
        z: this.z,
        index: this.index,
        layers: encode(this.layers, state)
    };
    // aggressively free memory
    if (freeMem) this.layers = undefined;
    return rv;
};

registerDecoder(TYPE.SLICE, function(v, state) {
    let slice = kiri.newSlice(v.z, state.mesh ? state.mesh.newGroup() : null);

    slice.index = v.index;
    slice.layers = decode(v.layers, state)

    return slice;
});

// ----- Slice.Top Codec -----

kiri.Top.prototype.encode = function(state) {
    let obj = {
        type: TYPE.TOP,
        poly: encode(this.poly, state)
    };

    if (state.full) {
        // obj.gaps = encode(this.gaps, state);
        obj.last = encode(this.last, state);
        obj.shells = encode(this.shells, state);
        obj.fill_off = encode(this.fill_off, state);
        obj.fill_lines = encode(this.fill_lines, state);
    }

    return obj;
};

registerDecoder(TYPE.TOP, function(v, state) {
    let top = kiri.newTop(decode(v.poly, state));
    if (state.full) {
        // top.gaps = decode(v.gaps, state);
        top.last = decode(v.last, state);
        top.shells = decode(v.shells, state);
        top.fill_off = decode(v.fill_off, state);
        top.fill_lines = decode(v.fill_lines, state);
    }
    return top;
});

// ----- Polygon Codec -----

base.Polygon.prototype.encode = function(state) {
    if (!state.poly) state.poly = {};

    let cached = state.poly[this.id];
    if (cached) {
        return { type: TYPE.POLY, ref: this.id };
    }

    state.poly[this.id] = this;

    return {
        type: TYPE.POLY,
        id: this.id,
        array: encodePointArray(this.points, state, this.z),
        inner: encode(this.inner, state),
        parent: encode(this.parent, state),
        depth: this.depth,
        color: this.color,
        open: this.open
    };
};

registerDecoder(TYPE.POLY, function(v, state) {
    if (!state.poly) state.poly = {};

    // return polygon from cached reference
    if (v.ref) {
        return state.poly[v.ref];
    }

    const array = v.array;
    const length = array.length;
    const poly = base.newPolygon();

    for (let vid = 0; vid < length; ) {
        poly.push(base.newPoint(array[vid++], array[vid++], array[vid++]));
    }

    state.poly[v.id] = poly;

    poly.id = v.id;
    poly.open = v.open;
    poly.inner = decode(v.inner, state);
    poly.parent = decode(v.parent, state);
    poly.depth = v.depth;
    poly.color = v.color;

    return poly;
});

// ----- Layers Codec -----

function encodeLayerPolys(polys, state) {
    return polys.map(poly => {
        return {
            open: poly.open,
            color: poly.color,
            points: codec.encodePointArray(poly.points, state.zeros)
        }
    });
}

kiri.Layers.prototype.encode = function(state) {
    let zeros = state.zeros;
    let enc = {
        type: TYPE.LAYERS,
        layers: Object.keys(this.layers),
        data: Object.values(this.layers).map(layer => {
            const paths = layer.paths;
            return {
                // defaults
                off: layer.off,
                color: layer.color,
                // 1D lines and polylines
                polys: encodeLayerPolys(layer.polys, state),
                lines: encodePointArray(layer.lines, state),
                // 2D lines and flat areas
                faces: codec.allocFloat32Array(layer.faces, zeros),
                norms: codec.allocFloat32Array(layer.norms, zeros),
                cface: layer.cface || codec.undef,
                // 3D lines
                paths: paths ? {
                    z: paths.z,
                    index: paths.index,
                    faces: codec.allocFloat32Array(paths.faces, zeros),
                    norms: codec.allocFloat32Array(paths.norms, zeros)
                } : undefined,
                cpath: layer.cpath || codec.undef,
                rotation: layer.rotation,
                position: layer.position
            }
        })
    };
    // aggressively free memory
    if (freeMem) this.init();
    return enc;
};

registerDecoder(TYPE.LAYERS, function(v, state) {
    const render = new kiri.Layers();
    const { layers } = v;

    for (let i=0; i<layers.length; i++) {
        const data = v.data[i];
        const paths = data.paths;
        const d = render.layers[layers[i]] = {
            off: data.off,
            color: data.color,
            polys: data.polys,
            lines: data.lines,
            faces: codec.allocFloat32Array(data.faces),
            norms: codec.allocFloat32Array(data.norms),
            cface: data.cface,
            paths: paths ? {
                z: paths.z,
                index: paths.index,
                faces: codec.allocFloat32Array(paths.faces),
                norms: codec.allocFloat32Array(paths.norms)
            } : undefined,
            cpath: data.cpath,
            rotation: data.rotation,
            position: data.position
        };
        // fixup null -> Infinity in material counts (JSON stringify sucks)
        if (d.cface) {
            d.cface.forEach(rec => {
                if (rec.count === null) {
                    rec.count = Infinity;
                }
            });
        }
        if (d.cpath) {
            d.cpath.forEach(rec => {
                if (rec.count === null) {
                    rec.count = Infinity;
                }
            });
        }
    }

    return render;
});

});
