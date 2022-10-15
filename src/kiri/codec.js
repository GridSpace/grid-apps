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
const handlers = {};
const freeMem = true;
const zeroOut = true;

const codec = exports({
    undef: undefined,
    encode: encode,
    decode: decode,
    registerDecoder: registerDecoder,
    allocFloat32Array: allocFloat32Array,
    encodePointArray,
    decodePointArray,
    toCodable
});

function toCodable(object) {
    switch (typeof object) {
        case 'function':
            return undefined;
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
    if (zeroOut && zeros && f32.byteLength > 0) {
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
        for (let i=0; i < o.length; i++) o[i] = decode(o[i],state);
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

/** ******************************************************************
 * Object Class CODEC Functions
 ******************************************************************* */

 kiri.Widget.prototype.encode = function(state) {
     const json = state._json_;
     const geo = this.getGeoVertices();
     const coded = {
         type: 'widget',
         id: this.id,
         ver: 1, // for better future encodings
         json: json, // safe for JSON (float32array mess)
         group: this.group.id,
         track: this.track,
         geo: json ? Array.from(geo) : geo
     };
     return coded;
 };

 registerDecoder('widget', function(v, state) {
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

kiri.Slice.prototype.encode = function(state) {
    const rv = {
        type: 'slice',
        z: this.z,
        index: this.index,
        layers: encode(this.layers, state)
    };
    // aggressively free memory
    if (freeMem) this.layers = undefined;
    return rv;
};

registerDecoder('slice', function(v, state) {
    let slice = kiri.newSlice(v.z, state.mesh ? state.mesh.newGroup() : null);

    slice.index = v.index;
    slice.layers = decode(v.layers, state)

    return slice;
});

kiri.Layers.prototype.encode = function(state) {
    let zeros = state.zeros;
    let enc = {
        type: 'layers',
        layers: Object.keys(this.layers),
        data: Object.values(this.layers).map(layer => {
            const e = {
                polys: encode(layer.polys, state),
                lines: encodePointArray(layer.lines, state),
                faces: codec.allocFloat32Array(layer.faces, zeros),
                norms: codec.allocFloat32Array(layer.norms, zeros),
                cface: layer.cface || codec.undef,
                color: layer.color,
                paths: layer.paths.map(lp => {
                    const pe = {
                        z: lp.z,
                        index: lp.index,
                        faces: codec.allocFloat32Array(lp.faces, zeros),
                        norms: codec.allocFloat32Array(lp.norms, zeros)
                    };
                    return pe;
                }),
                cpath: layer.cpath || codec.undef,
                off: layer.off
            };
            // console.log('-->',layer,e,zeros.length);
            return e;
        })
    };
    // aggressively free memory
    if (freeMem) this.init();
    return enc;
};

registerDecoder('layers', function(v, state) {
    let render = new kiri.Layers();
    for (let i=0; i<v.layers.length; i++) {
        const data = v.data[i];
        const d = render.layers[v.layers[i]] = {
            polys: decode(data.polys, state),
            cpoly: data.cpoly,
            lines: decodePointArray(data.lines),
            faces: codec.allocFloat32Array(data.faces),
            norms: data.norms ? codec.allocFloat32Array(data.norms) : undefined,
            cface: data.cface,
            color: data.color,
            paths: data.paths.map(lp => {
                return {
                    z: lp.z,
                    index: lp.index,
                    faces: codec.allocFloat32Array(lp.faces),
                    norms: lp.norms ? codec.allocFloat32Array(lp.norms) : undefined
                };
            }),
            cpath: data.cpath,
            off: data.off
        };
        // fixup null -> Infinity in material counts (JSON stringify sucks)
        if (d.cface) {
            d.cface.forEach(rec => {
                if (rec.count === null) {
                    rec.count = Infinity;
                }
            });
        }
        if (d.cpoly) {
            d.cpoly.forEach(rec => {
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
        // console.log('<--',d);
    }
    return render;
});

kiri.Top.prototype.encode = function(state) {
    let obj = {
        type: 'top',
        poly: encode(this.poly, state)
    };
    if (state.full) {
        obj.last = encode(this.last, state);
        obj.shells = encode(this.shells, state);
        obj.fill_off = encode(this.fill_off, state);
        obj.fill_lines = encode(this.fill_lines, state);
    }
    return obj;
};

registerDecoder('top', function(v, state) {
    let top = kiri.newTop(decode(v.poly, state));
    if (state.full) {
        top.last = decode(v.last, state);
        top.shells = decode(v.shells, state);
        top.fill_off = decode(v.fill_off, state);
        top.fill_lines = decode(v.fill_lines, state);
    }
    return top;
});

function encodePointArray(points, state, z) {
    if (!points) {
        return null;
    }
    if (points.length === 0) {
        return points;
    }

    let array = codec.allocFloat32Array(points.length * 3, state.zeros),
        pos = 0;

    points.forEach(function(point) {
        if (state.rotate) {
            if (state.centerz) {
                point.z -= state.centerz;
            }
            let v = new THREE.Vector3(point.x, point.y, point.z);
            v.applyMatrix4(state.rotate);
            point = {x: v.x, y: v.y, z: v.z};
            if (state.centerz) {
                point.z += state.centerz;
            }
            if (state.movez) {
                point.z -= state.movez;
            }
        }
        array[pos++] = point.x;
        array[pos++] = point.y;
        array[pos++] = z !== undefined ? z : point.z;
    });

    return array;
}

function decodePointArray(array) {
    if (!array) return null;

    let vid = 0,
        pid = 0,
        points = new Array(array.length/3);

    while (vid < array.length) {
        points[pid++] = base.newPoint(array[vid++], array[vid++], array[vid++]);
    }

    return points;
}

base.Polygon.prototype.encode = function(state) {
    if (!state.poly) state.poly = {};

    let cached = state.poly[this.id];

    if (cached) {
        return { type: 'poly', ref: this.id };
    }

    state.poly[this.id] = this;
    return {
        type: 'poly',
        id: this.id,
        array: encodePointArray(this.points, state, this.z),
        inner: encode(this.inner, state),
        parent: encode(this.parent, state),
        depth: this.depth,
        color: this.color,
        open: this.open
    };
};

registerDecoder('poly', function(v, state) {
    if (!state.poly) state.poly = {};

    if (v.ref) return state.poly[v.ref];

    let poly = base.newPolygon(),
        vid = 0;

    // if passed a normal array, convert to float32
    if (v.array.toFloat32) {
        v.array = v.array.toFloat32();
    }

    while (vid < v.array.length) {
        poly.push(base.newPoint(v.array[vid++], v.array[vid++], v.array[vid++]));
    }

    poly.id = v.id;
    poly.open = v.open;

    state.poly[v.id] = poly;

    poly.inner = decode(v.inner, state);
    poly.parent = decode(v.parent, state);
    poly.depth = v.depth;
    poly.color = v.color;

    return poly;
});

});
