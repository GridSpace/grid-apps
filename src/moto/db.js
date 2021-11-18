/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    if (!self.moto) self.moto = {};
    if (self.moto.Storage) return;

    self.moto.Storage = Storage;

    // https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

    let IDB, IRR, local = null;

    try {
        IDB = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB;
        IRR = self.IDBKeyRange;
    } catch (e) {
        console.log("in private or restricted browsing mode. database storage blocked. application may not function.");
    }

    /**
     * @param {String} dbname
     * @param {number} [version]
     * @constructor
     */
    function Storage(dbname, options = {}) {
        this.db = null;
        this.name = dbname;
        this.stores = options.stores || [ dbname ];
        this.version = options.version || 1;
        this.queue = [];
        this.idle = [];
        this.initCalled = false;
    }

    Storage.delete = function(dbname) {
        IDB.deleteDatabase(dbname);
    };

    let SP = Storage.prototype;

    /** ******************************************************************
     * indexedDB implementation
     ******************************************************************* */

    SP.onIdle = function(fn) {
        if (this.queue.length) {
            this.idle.push(fn);
        } else {
            fn();
        }
        return this;
    };

    SP.promise = function() {
        let db =  this;
        return {
            keys: (lower, upper) => new Promise(function(resolve, reject) {
                db.keys(resolve,lower,upper);
            }),

            iterate: (lower, upper, nullterm) => new Promise(function(resolve, reject) {
                db.iterate(resolve, lower, upper, nullterm);
            }),

            get: (key) => new Promise(function(resolve, reject) {
                db.get(key, resolve);
            }),

            put: (key, value) => new Promise(function(resolve, reject) {
                db.put(key, value, resolve);
            }),

            remove: (key) => new Promise(function(resolve, reject) {
                db.remove(key, resolve);
            })
        };
    }

    SP.keys = function(callback, lower, upper) {
        let out = [];
        this.iterate(function(k,v) {
            if (k === null) {
                callback(out);
            } else {
                out.push(k);
            }
        }, lower, upper, true);
    };

    SP.iterate = function(callback, lower, upper, nullterm) {
        if (!this.db) {
            this.init();
            return this.queue.push(["iterate", callback, lower, upper]);
        }
        let range = lower && upper ? IRR.bound(lower,upper) :
                    lower ? IRR.lowerBound(lower) :
                    upper ? IRR.upperBound(upper) : undefined;
        // iterate over all db values for debugging
        this.db
            .transaction(this.name)
            .objectStore(this.current)
            .openCursor(range).onsuccess = function(event) {
                let cursor = event.target.result;
                if (cursor) {
                    callback(cursor.key,cursor.value);
                    cursor.continue();
                } else if (nullterm) {
                    callback(null);
                }
            };
    };

    SP.deleteStore = function() {
        if (this.initCalled) throw "cannot delete ObjectStore after init() called";
        this.version = Number.MAX_SAFE_INTEGER || Number.MAX_VALUE;
        return this.init(true);
    };

    SP.use = function(store) {
        this.current = store;
        return this;
    }

    SP.init = function(options = {}) {
        if (this.initCalled) return;

        let storage = this,
            name = this.name,
            request = null;

        function fallback() {
            console.log("in private browsing mode or browser lacks support for IndexedDB. unable to setup storage for '" + name + "'.");
            local = {};
            storage.runQueue();
        }

        try {
            request = IDB.open(name, this.version);

            request.onupgradeneeded = function(event) {
                if (options.delete === true) {
                    storage.db.deleteObjectStore(name);
                    return;
                }
                let db = storage.db = request.result;
                for (let store of storage.stores) {
                    storage.store = db.createObjectStore(store);
                    storage.current = store;
                }
                event.target.transaction.oncomplete = function(event) {
                    storage.runQueue();
                };
            };

            request.onsuccess = function(event) {
                storage.current = storage.stores[0];
                storage.db = request.result;
                storage.runQueue();
            };

            request.onerror = function(event) {
                console.log({error:event});
                fallback();
            };
        } catch (e) {
            fallback();
            return;
        }

        this.initCalled = true;
        return this;
    };

    SP.runQueue = function() {
        if (this.queue.length > 0) {
            let i = 0, q = this.queue, e;
            while (i < q.length) {
                e = q[i++];
                switch (e[0]) {
                    case 'iterate': this.iterate(e[1], e[2], e[3]); break;
                    case 'put': this.put(e[1], e[2], e[3]); break;
                    case 'get': this.get(e[1], e[2]); break;
                    case 'remove': this.remove(e[1], e[2]); break;
                    case 'clear': this.clear();
                }
            }
            this.queue = [];
        }
        while (this.idle.length) {
            this.idle.shift()();
        }
    };

    SP.put = function(key, value, callback) {
        if (local) {
            local[key] = value;
            if (callback) callback(true);
            return;
        }
        if (!this.db) {
            this.init();
            return this.queue.push(['put', key, value, callback]);
        }
        try {
            let req = this.db
                .transaction(this.name, "readwrite")
                .objectStore(this.current).put(value, key);
            if (callback) {
                req.onsuccess = function(event) { callback(true) };
                req.onerror = function(event) { callback(false) };
            }
        } catch (e) {
            console.log(e);
            if (callback) callback(false);
        }
    };

    SP.get = function(key, callback) {
        if (local) {
            if (callback) callback(local[key]);
            return;
        }
        if (!this.db) {
            this.init();
            return this.queue.push(['get', key, callback]);
        }
        try {
            let req = this.db
                .transaction(this.name)
                .objectStore(this.current).get(key);
            if (callback) {
                req.onsuccess = function(event) { callback(req.result) };
                req.onerror = function(event) { callback(null) };
            }
        } catch (e) {
            console.log(e);
            if (callback) callback(null);
        }
    };

    SP.remove = function(key, callback) {
        if (local) {
            delete local[key];
            if (callback) callback(true);
            return;
        }
        if (!this.db) {
            this.init();
            return this.queue.push(['remove', key, callback]);
        }
        try {
            let req = this.db
                .transaction(this.name, "readwrite")
                .objectStore(this.current).delete(key);
            if (callback) {
                req.onsuccess = function(event) { callback(true) };
                req.onerror = function(event) { callback(false) };
            }
        } catch (e) {
            console.log(e);
            if (callback) callback(false);
        }
    };

    SP.clear = function(key) {
        if (!this.db) {
            this.init();
            return this.queue.push(['clear']);
        }
        this.db
            .transaction(this.name, "readwrite")
            .objectStore(this.current).clear();
    };

})();
