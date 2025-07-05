/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

class Local {
    __data__ = {};
    __mem__ = true;

    getItem(key) {
        return this[key];
    }

    setItem(key, val) {
        this.__data__[key] = val;
        this[key] = val;
    }

    removeItem(key) {
        delete this.__data__[key];
    }

    clear() {
        this.__data__ = {};
    }
}

let setLocal;

try {
    // deprecate 'Local' at some point
    setLocal = self.localStorage;
    let testkey = '__test';
    setLocal.setItem(testkey, 1);
    setLocal.getItem(testkey);
    setLocal.removeItem(testkey);
} catch (e) {
    setLocal = new Local();
    let msg = "localStorage disabled: application may not function properly";
    console.log(msg);
    // alert(msg);
}

export const local = setLocal;
