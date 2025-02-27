/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

// extend Array, String, Number, Math
gapp.register("add.array", [], (root, exports) => {

let AP = {};

if (!AP.flat) {
    AP.flat = function() {
        try {
            return [].concat.apply([], this);
        } catch (e) {
            // console.log({flat_error: e});
            let out = [];
            for (let e of this.slice()) {
                out.push(...e);
            }
            return out;
        }
    };
}

AP.findWith = function(fn) {
    for (let i=0, l=this.length; i<l; i++) {
        if (fn(this[i])) {
            return i;
        }
    }
    return -1;
};

AP.equals = function(arr) {
    if (!arr) return false;
    if (arr.length !== this.length) return false;
    for (let i = 0; i < this.length; i++) {
        if (arr[i] !== this[i]) return false;
    }
    return true;
};

AP.peek = function(val = 1) {
    return this[this.length - val];
};

AP.drop = function(pre = 0, post = 0) {
    while (pre-- > 0) this.shift();
    while (post-- > 0) this.pop();
    return this;
};

/**
 * allow chaining of push() calls
 */
AP.append = function(v, flat) {
    if (flat) {
        return this.appendAll(v);
    } else {
        this.push(v);
        return this;
    }
};

/**
 * append all array elements to this array
 */
AP.appendAll = function(arr) {
    if (arr && arr.length > 0) {
        // avoid hitting stack limits
        if (arr.length > 10000) {
            for (let i = 0, il = arr.length; i < il; i++) {
                this.push(arr[i]);
            }
        } else {
            // this.push.apply(this,arr); (slower?)
            this.push(...arr);
        }
    }
    return this;
};

AP.addOnce = function(val) {
    if (!this.contains(val)) {
        this.push(val);
    }
    return this;
};

/**
 * shallow cloning with clone(arg) call on each new element
 */
AP.clone = function() {
    return this.map(v => v.clone(...arguments));
};

AP.xray = function(arg) {
    const na = [],
        ln = this.length;
    for (let i = 0; i < ln; i++) {
        na.push(this[i].xray(arg));
    }
    return na;
};

AP.xout = function(label, inset) {
    if (label) console.log(`${label} [${this.length}]`);
    if (!inset) inset = '  ';
    this.forEach((el, i) => {
        if (el.xout) {
            el.xout(null, inset + i + inset);
        } else if (el.xray) {
            const info = el.xray();
            console.log(inset, info);
            Object.values(info).forEach(val => {
                if (val.xout) {
                    val.xout(null, inset + inset);
                }
            });
        }
    });
};

/**
 * remove and return element from array, if present
 */
AP.remove = function(val) {
    let idx = this.indexOf(val);
    if (idx >= 0) return this.splice(idx, 1);
    return null;
};

AP.removeAll = function(array) {
    for (let i = 0, il = array.length; i < il; i++) {
        this.remove(array[i]);
    }
};

/**
 * return last array element if array length > 0
 */
AP.last = function() {
    if (this.length === 0) return null;
    return this[this.length - 1];
};

AP.contains = function(val) {
    return this.indexOf(val) >= 0;
};

AP.toFloat32 = function() {
    return new Float32Array(this);
};

AP.toUint32 = function() {
    return Uint32Array.from(this);
};

AP.forEachPair = function(fn, incr) {
    let scope = this,
        idx = 0,
        inc = incr || 2,
        len = scope.length;
    while (idx < len) {
        fn(scope[idx], scope[(idx + 1) % len], idx);
        idx += inc;
    }
};

AP.show = function(fn, f) {
    f = f || function(v) {
        console.log(v)
    };
    this.forEach(function(av) {
        f(av[fn]());
    })
};

AP.uniq = function() {
    return this.slice().sort().filter((x, i, a) => !i || x != a[i - 1]);
};

AP.hasNaN = function() {
    return this.filter(v => isNaN(v)).length > 0;
};

// turn array into arrays of specified size
AP.group = function(size) {
    let na = new Array(Math.ceil(this.length / size));
    let nai = 0;
    for (let i = 0; i < this.length; i += size) {
        let grp = new Array(size);
        for (let j = 0; j < size; j++) {
            grp[j] = this[i + j];
        }
        na[nai++] = grp;
    }
    return na;
};

// wrap a function and unroll the first parameter into
// successive function calls if it is an array
Array.handle = function(fn) {
    return function() {
        let args = [...arguments];
        let val = args.shift();
        if (Array.isArray(val)) {
            let rv = [];
            for (let v of val.slice()) {
                rv.push(fn(v, ...args));
            }
            return rv;
        } else {
            return fn(val, ...args);
        }
    }
};

for (let i in AP) {
    Object.defineProperty(Array.prototype, i, {
        value: AP[i],
        enumerable: false
    });
}

Float32Array.prototype.toShared = function() {
    const newvert = new Float32Array(new SharedArrayBuffer(this.buffer.byteLength));
    newvert.set(this);
    return newvert;
};

Float32Array.prototype.toFloat32 = function() { return this };

ArrayBuffer.prototype.textDecode = function(encoding = 'utf-8') {
    return new TextDecoder(encoding).decode(this);
};

String.prototype.reverse = function() {
    return this.split('').reverse().join('');
};

Object.clone = function(o) {
    // not using structuredClone because failes with some objects
    // this method "cleans" out non clonables
    return o ? JSON.parse(JSON.stringify(o)) : o;
};

Object.toArray = function(o) {
    let ret = [];
    for (let [key, value] of Object.entries(o)) {
        ret.push({
            key,
            value
        });
    }
    return ret;
};

Math.bound = function(val, min, max) {
    return Math.max(min, Math.min(max, val));
};

Number.prototype.round = function(digits) {
    if (digits === 0) return this.valueOf() | 0;
    const pow = Math.pow(10, digits || 3);
    return Math.round(this.valueOf() * pow) / pow;
};

});
