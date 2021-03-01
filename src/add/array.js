/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

(function() {
    var AP = Array.prototype;

    /** ******************************************************************
     * Array prototype helpers
     ******************************************************************* */

     if (!AP.flat) {
         AP.flat = function() {
             return [].concat.apply([], this);
         };
     }

     AP.equals = function(arr) {
         if (!arr) return false;
         if (arr.length !== this.length) return false;
         for (let i=0; i<this.length; i++) {
             if (arr[i] !== this[i]) return false;
         }
         return true;
     };

     AP.peek = function() {
        return this[this.length-1];
     };

    /**
     * allow chaining of push() calls
     *
     * @param v
     * @returns {Array}
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
     *
     * @param {Array} arr
     * @returns {Array}
     */
    AP.appendAll = function(arr) {
        if (arr && arr.length > 0) {
            // avoid hitting stack limits
            if (arr.length > 10000) {
                for (let i=0, il=arr.length; i<il; i++) {
                    this.push(arr[i]);
                }
            } else {
                // this.push.apply(this,arr); (slower?)
                this.push(...arr);
            }
        }
        return this;
    };

    /**
     * shallow cloning with clone(arg) call on each new element
     *
     * @param {Array} [arg]
     * @returns {Array}
     */
    AP.clone = function(arg) {
        var na = this.slice(),
            ln = na.length,
            i = 0;
        while (i < ln) na[i] = na[i++].clone(arg);
        return na;
    };

    AP.xray = function(arg) {
        const na = [], ln = this.length;
        for (let i=0; i<ln; i++) {
            na.push(this[i].xray(arg));
        }
        return na;
    };

    AP.xout = function(label, inset) {
        if (label) console.log(`${label} [${this.length}]`);
        if (!inset) inset = '  ';
        this.forEach((el,i) => {
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
     *
     * @param val
     * @returns {*}
     */
    AP.remove = function(val) {
        var idx = this.indexOf(val);
        if (idx >= 0) return this.splice(idx,1);
        return null;
    };

    AP.removeAll = function(array) {
        for (let i=0, il=array.length; i<il; i++) {
            this.remove(array[i]);
        }
    };

    /**
     * return last array element if array length > 0
     *
     * @returns {*}
     */
    AP.last = function() {
        if (this.length === 0) return null;
        return this[this.length-1];
    };

    AP.contains = function(val) {
        return this.indexOf(val) >= 0;
    };

    AP.toFloat32 = function() {
        var i = 0, f32 = new Float32Array(this.length);
        while (i < this.length) {
            f32[i] = this[i++];
        }
        return f32;
    };

    AP.forEachPair = function(fn, incr) {
        var scope = this,
            idx = 0,
            inc = incr || 2,
            len = scope.length;
        while (idx < len) {
            fn(scope[idx], scope[(idx+1)%len], idx);
            idx += inc;
        }
    };

    AP.show = function(fn,f) {
        f = f || function(v) { console.log(v) };
        this.forEach(function(av) {
            f(av[fn]());
        })
    };

    AP.uniq = function() {
        return this.slice().sort().filter((x, i, a) => !i || x != a[i-1]);
    };

    /** ******************************************************************
     * String prototype helpers
     ******************************************************************* */

    String.prototype.reverse = function() {
        return this.split('').reverse().join('');
    };

    /** ******************************************************************
     * Object static helpers
     ******************************************************************* */

    Object.clone = function(o) {
        return o ? JSON.parse(JSON.stringify(o)) : o;
    };

    Math.bound = function(val,min,max) {
        return Math.max(min,Math.min(max,val));
    };

    /** ******************************************************************
     * Number static helpers
     ******************************************************************* */

    Number.prototype.round = function(digits) {
        const pow = Math.pow(10,digits || 3);
        return Math.round(this.valueOf() * pow) / pow;
    };

})();
