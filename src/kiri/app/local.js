/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

// Lazily access api to avoid circular dependency at module load time
let _api;

function getAPI() {
    if (!_api) {
        _api = self.kiri_api;
    }
    return _api;
}

function localGet(key) {
    const api = getAPI();
    let sloc = api.conf.get().local;
    return sloc[key] || api.sdb[key];
}

function localSet(key, val) {
    const api = getAPI();
    let sloc = api.conf.get().local;
    sloc[key] = api.sdb[key] = val;
    return val;
}

function localRemove(key) {
    const api = getAPI();
    let sloc = api.conf.get().local;
    return delete sloc[key];
}

function localGetBoolean(key, def = true) {
    let val = localGet(key);
    return val === true || val === 'true' || val === def;
}

export const local = {
    get: (key) => localGet(key),
    getItem: (key) => localGet(key),
    getInt: (key) => parseInt(localGet(key)),
    getFloat: (key) => parseFloat(localGet(key)),
    getBoolean: localGetBoolean,
    toggle: (key, val, def) => {
        return localSet(key, val ?? !localGetBoolean(key, def));
    },
    put: (key, val) => localSet(key, val),
    set: (key, val) => localSet(key, val),
    setItem: (key, val) => localSet(key, val),
    removeItem: (key) => localRemove(key)
};
