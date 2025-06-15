/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// Create global data object if it doesn't exist
if (!self.data) {
    self.data = {};
}

const { data } = self;

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
    // deprecate 'Local' at some point
    let local = data.local = self.localStorage;
    let testkey = '__test';
    local.setItem(testkey, 1);
    local.getItem(testkey);
    local.removeItem(testkey);
} catch (e) {
    data.local = new Local();
    let msg = "localStorage disabled: application may not function properly";
    console.log(msg);
    // alert(msg);
}

// Export for ES modules
export const local = data.local;
