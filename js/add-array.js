/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

(function() {
    var AP = Array.prototype;

    /** ******************************************************************
     * array prototype helpers
     ******************************************************************* */

     AP.peek = function() {
        return this[this.length-1];
     };

    /**
     * allow chaining of push() calls
     *
     * @param v
     * @returns {Array}
     */
    AP.append = function(v) {
        this.push(v);
        return this;
    };

    /**
     * append all array elements to this array
     *
     * @param {Array} arr
     * @returns {Array}
     */
    AP.appendAll = function(arr) {
        if (arr && arr.length > 0) this.push.apply(this,arr);
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

    /** ******************************************************************
     * string prototype helpers
     ******************************************************************* */

    String.prototype.reverse = function() {
        return this.split('').reverse().join('');
    };

})();
