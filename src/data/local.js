/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

gapp.register('data.local');

let data = self.data = self.data || {};
if (data.Local) return;

function Local() {
    this.__data__ = {};
    this.__mem__ = true;
}

var LS = Local.prototype;

LS.getItem = function(key) {
    return this[key];
};

LS.setItem = function(key, val) {
    this.__data__[key] = val;
    this[key] = val;
};

LS.removeItem = function(key) {
    delete this.__data__[key];
};

LS.clear = function() {
    this.__data__ = {};
};

try {
    let local = data.Local = self.localStorage;
    let testkey = '__test';
    local.setItem(testkey, 1);
    local.getItem(testkey);
    local.removeItem(testkey);
} catch (e) {
    data.Local = new Local();
    let msg = "in private or restricted browsing mode. local storage blocked. application may not function properly.";
    console.log(msg);
    alert(msg);
}

})();
