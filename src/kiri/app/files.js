/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

/**
 * Manages file storage in IndexedDB for 3D model vertices.
 * Supports file operations (put, get, delete, rename), listener notifications,
 * and deferred loading for externally-stored files.
 */
class Files {
    /**
     * Create a new Files store
     * @param {object} indexdb - IndexedDB wrapper instance
     */
    constructor(indexdb) {
        let store = this;
        this.db = indexdb;
        this.files = {};
        this.listeners = [];
        this.deferredHandler = null;
        this.concurrent = 0;
        this.refresh();
    }

    get index() {
        return this.db;
    }

    refresh() {
        let store = this;
        store.db.get('files', function(files) {
            if (files) {
                store.files = files;
                notifyFileListeners(store);
            }
        });
    };

    wipe() {
        let key, files = this.files;
        for (key in files) {
            if (files.hasOwnProperty(key)) this.deleteFile(key);
        }
    };

    fileList() {
        return this.files;
    };

    addFileListener(listener) {
        if (!this.listeners.contains(listener)) {
            this.listeners.push(listener);
            listener(this.files);
        }
    };

    removeFileListener(listener) {
        this.listeners.remove(listener);
    };

    /**
     * Set handler for deferred file loading.
     * Deferred files are not stored locally but fetched on-demand.
     * @param {function} handler - Function(mark, name, callback) to load deferred file
     */
    setDeferredHandler(handler) {
        this.deferredHandler = handler;
    };

    /**
     * Register a deferred file placeholder.
     * File data is not stored locally; the mark is used by the deferred handler to fetch it later.
     * @param {string} name - Filename
     * @param {*} mark - Identifier for deferred handler to fetch file (e.g., URL, storage key)
     */
    putDeferred(name, mark) {
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
    putFile(name, vertices, callback) {
        console.log({ putFile: name, vertices });

        let mark = Date.now();
        let store = this;
        let pdb = store.db.promise();
        store.concurrent++;

        function ondone(error) {
            if (callback) callback(error);
            if (--store.concurrent === 0) {
                notifyFileListeners(store);
            }
        }

        pdb.put(`file-${name}`, vertices)
            .then(() => {
                store.files[name] = {
                    vertices: vertices.length / 3,
                    updated: new Date().getTime()
                };
                return pdb.put('files', store.files);
            })
            .then(ondone)
            .catch(ondone);
    };

    /**
     * Rename a file in the catalog.
     * Copies vertex data to new key, updates file list, and removes old key.
     * @param {string} name - Current filename
     * @param {string} newname - New filename
     * @param {function} callback - Function({error}) called when complete
     */
    rename(name, newname, callback) {
        if (!this.files[name]) return callback({error: 'no such file'});
        if (!newname || newname == name) return callback({error: 'invalid new name'});
        let done = 0;
        let error = [];
        let store = this;
        function complete(ok, err) {
            if (err) error.push(err);
            if (++done === 1) {
                store.files[newname] = store.files[name];
                delete store.files[name];
                saveFileList(store);
                store.db.remove(`file-${name}`);
                callback(error.length ? {error} : {});
            }
        }
        store.db.get(`file-${name}`, (vertices) => {
            if (!vertices) return complete(false, 'no raw file');
            store.db.put(`file-${newname}`, vertices, complete);
        });
    };

    /**
     * @param {String} name
     * @param {Function} callback
     */
    getFile(name, callback) {
        let store = this,
            rec = store.files[name];
        if (rec && rec.deferred) {
            if (store.deferredHandler) return store.deferredHandler(rec.deferred, name, callback);
            return callback();
        }
        this.db.get('file-'+name, function(vertices) {
            callback(vertices);
        });
    };

    /**
     * @param {String} name
     * @param {Function} callback
     */
    deleteFile(name, callback) {
        let store = this;
        if (store.files[name]) {
            delete store.files[name];
            store.db.remove('file-'+name, function(ok) {
                saveFileList(store);
                if (callback) callback(ok);
            });
            return;
        }
        if (callback) callback(false);
    };

    /**
     * Delete files matching a filter function.
     * @param {function} fn - Filter function(key) returning true to delete
     * @param {*} [from] - Optional start key for range query
     * @param {*} [to] - Optional end key for range query
     */
    deleteFilter(fn, from, to) {
        this.db.keys(keys => {
            for (let key of keys) {
                if (fn(key)) {
                    this.db.remove(key);
                }
            }
        }, from, to);
    }
}

/**
 * Save file list to IndexedDB and notify listeners.
 * @param {Files} store - Files instance
 */
function saveFileList(store) {
    store.db.put('files', store.files);
    notifyFileListeners(store);
}

/**
 * Notify all registered listeners of file list changes.
 * @param {Files} store - Files instance
 */
function notifyFileListeners(store) {
    for (let i=0; i<store.listeners.length; i++) {
        store.listeners[i](store.files);
    }
}

/**
 * Factory function to create a new Files instance.
 * @param {object} indexdb - IndexedDB wrapper instance
 * @returns {Files} New Files store
 */
export const openFiles = function(indexdb) {
    return new Files(indexdb);
};

export { saveFileList, notifyFileListeners };
