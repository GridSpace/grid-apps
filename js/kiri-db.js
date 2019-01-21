/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

var gs_kiri_db = exports;

(function() {

    if (!self.kiri) self.kiri = { };

    /**
     * @constructor
     */
    function Catalog(motodb, decimate) {
        var store = this;
        store.db = motodb;
        store.files = {};
        store.listeners = [];
        store.autodec = decimate;
        store.deferredHandler = null;
        store.refresh();
    }

    var kiri = self.kiri,
        DP = Catalog.prototype;

    kiri.openCatalog = function(motodb,decimate) {
        return new Catalog(motodb,decimate);
    };

    DP.refresh = function() {
        var store = this;
        store.db.get('files', function(files) {
            if (files) {
                store.files = files;
                notifyFileListeners(store);
            }
        });
    };

    DP.wipe = function() {
        var key, files = this.files;
        for (key in files) {
            if (files.hasOwnProperty(key)) this.deleteFile(key);
        }
    };

    DP.fileList = function() {
        return this.files;
    };

    DP.addFileListener = function(listener) {
        if (!this.listeners.contains(listener)) {
            this.listeners.push(listener);
            listener(this.files);
        }
    };

    DP.removeFileListener = function(listener) {
        this.listeners.remove(listener);
    };

    function saveFileList(store) {
        store.db.put('files', store.files);
        notifyFileListeners(store);
    }

    function notifyFileListeners(store) {
        for (var i=0; i<store.listeners.length; i++) {
            store.listeners[i](store.files);
        }
    }

    DP.decimate = function(vertices, callback) {
        if (vertices.length < 500000) return callback(vertices);
        kiri.work.decimate(vertices, function(reply) {
            callback(reply);
        });
    };

    DP.setDeferredHandler = function(handler) {
        this.deferredHandler = handler;
    };

    DP.putDeferred = function(name, mark) {
        // triggers refresh callback
        this.files[name] = {
            deferred: mark
        };
        saveFileList(this);
    };

    /**
     * @param {String} name
     * @param {Float32Array} vertices
     * @param {Function} [callback]
     */
    DP.putFile = function(name, vertices, callback) {
        var store = this;
        store.db.put('file-'+name, vertices, function(ok) {
            if (ok) {
                store.files[name] = {
                    vertices: vertices.length/3,
                    updated: new Date().getTime()
                };
                saveFileList(store);
                if (store.autodec) {
                    store.decimate(vertices, function(decimated) {
                        store.db.put('fdec-'+name, decimated);
                        if (callback) callback(decimated);
                    });
                } else if (callback) callback(ok);
            } else if (callback) callback(ok);
        });
    };

    /**
     * @param {String} name
     * @param {Function} callback
     */
    DP.getFile = function(name, callback) {
        var store = this,
            rec = store.files[name];
        if (rec && rec.deferred) {
            if (store.deferredHandler) return store.deferredHandler(rec.deferred, name, callback);
            return callback();
        }
        if (!this.autodec) {
            store.db.get('file-'+name, callback);
            return;
        }
        this.db.get('fdec-'+name, function(vertices) {
            if (vertices) {
                callback(vertices);
            } else {
                store.db.get('file-'+name, function(vertices) {
                    if (vertices) {
                        store.decimate(vertices, function(decimated) {
                            store.db.put('fdec-'+name, decimated);
                            callback(vertices);
                        });
                    } else {
                        return callback();
                    }
                });
            }
        });
    };

    /**
     * @param {String} name
     * @param {Function} callback
     */
    DP.deleteFile = function(name, callback) {
        var store = this;
        if (store.files[name]) {
            delete store.files[name];
            store.db.remove('fdec-'+name);
            store.db.remove('file-'+name, function(ok) {
                saveFileList(store);
                if (callback) callback(ok);
            });
            return;
        }
        if (callback) callback(false);
    };

})();
