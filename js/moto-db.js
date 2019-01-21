/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_moto_db = exports;

(function() {

    if (!self.moto) self.moto = {};
    if (self.moto.Storage) return;

    self.moto.Storage = Storage;

    // https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

    var IDB = self.indexedDB || self.mozIndexedDB || self.webkitIndexedDB || self.msIndexedDB,
        IRR = self.IDBKeyRange,
        local = null;

    /**
     * @param {String} dbname
     * @param {number} [version]
     * @constructor
     */
    function Storage(dbname, version) {
        this.db = null;
        this.name = dbname;
        this.version = version || 1;
        this.queue = [];
        this.initCalled = false;
    }

    Storage.delete = function(dbname) {
        IDB.deleteDatabase(dbname);
    };

    var SP = Storage.prototype;

    /** ******************************************************************
     * indexedDB implementation
     ******************************************************************* */

    SP.keys = function(callback, lower, upper) {
        var out = [];
        this.iterate(function(k,v) {
            if (k) out.push(k);
        }, lower, upper, true);
        callback(out);
    };

    SP.iterate = function(callback, lower, upper, nullterm) {
        if (!this.db) {
            this.init();
            return this.queue.push(["iterate", callback, lower, upper]);
        }
        var range = lower && upper ? IRR.bound(lower,upper) :
                    lower ? IRR.lowerBound(lower) :
                    upper ? IRR.upperBound(upper) : undefined;
        // iterate over all db values for debugging
        this.db.transaction(this.name).objectStore(this.name).openCursor(range).onsuccess = function(event) {
            var cursor = event.target.result;
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

    SP.init = function(deleteOS) {
        if (this.initCalled) return;

        var storage = this,
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
                if (deleteOS) {
                    storage.db.deleteObjectStore(name);
                    return;
                }
                storage.db = request.result;
                storage.store = storage.db.createObjectStore(name);
                setTimeout(function() { storage.runQueue() });
            };

            request.onsuccess = function(event) {
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
            var i = 0, q = this.queue, e;
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
            var req = this.db.transaction(this.name, "readwrite").objectStore(this.name).put(value, key);
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
            var req = this.db.transaction(this.name).objectStore(this.name).get(key);
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
            var req = this.db.transaction(this.name, "readwrite").objectStore(this.name).delete(key);
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
        this.db.transaction(this.name, "readwrite").objectStore(this.name).clear();
    };

})();
