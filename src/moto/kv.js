/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let moto = self.moto = self.moto = {};
    if (moto.KV) return;

    function KV() {
        this.__data__ = {};
        this.__mem__ = true;
    }

    var KP = KV.prototype;

    KP.getItem = function(key) {
        return this[key];
    };

    KP.setItem = function(key, val) {
        this.__data__[key] = val;
        this[key] = val;
    };

    KP.removeItem = function(key) {
        delete this.__data__[key];
    };

    KP.clear = function() {
        this.__data__ = {};
    };

    try {
        let KV = moto.KV = self.localStorage,
            testkey = '__test';
        KV.setItem(testkey, 1);
        KV.getItem(testkey);
        KV.removeItem(testkey);
    } catch (e) {
        moto.KV = new KV();
        let msg = "in private or restricted browsing mode. local storage blocked. application may not function properly.";
        console.log(msg);
        alert(msg);
    }

})();
