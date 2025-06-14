/* FileSaver.js
 * A saveAs() FileSaver implementation.
 * 1.1.20151003
 *
 * By Eli Grey, http://eligrey.com
 * License: MIT
 *   See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
 */

/*global self */
/*jslint bitwise: true, indent: 4, laxbreak: true, laxcomma: true, smarttabs: true, plusplus: true */

/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */

"use strict";
// IE <10 is explicitly unsupported
if (typeof navigator !== "undefined" && /MSIE [1-9]\./.test(navigator.userAgent)) {
    return;
}

const doc = self.document;
// only get URL when necessary in case Blob.js hasn't overridden it yet
const get_URL = function() {
    return self.URL || self.webkitURL || self;
};

const save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a");
const can_use_save_link = "download" in save_link;

const click = function(node) {
    const event = new MouseEvent("click");
    node.dispatchEvent(event);
};

const is_safari = /Version\/[\d\.]+.*Safari/.test(navigator.userAgent);
const webkit_req_fs = self.webkitRequestFileSystem;
const req_fs = self.requestFileSystem || webkit_req_fs || self.mozRequestFileSystem;

const throw_outside = function(ex) {
    (self.setImmediate || self.setTimeout)(function() {
        throw ex;
    }, 0);
};

const force_saveable_type = "application/octet-stream";
const fs_min_size = 0;

// See https://code.google.com/p/chromium/issues/detail?id=375297#c7 and
// https://github.com/eligrey/FileSaver.js/commit/485930a#commitcomment-8768047
// for the reasoning behind the timeout and revocation flow
const arbitrary_revoke_timeout = 500; // in ms

const revoke = function(file) {
    const revoker = function() {
        if (typeof file === "string") { // file is an object URL
            get_URL().revokeObjectURL(file);
        } else { // file is a File
            file.remove();
        }
    };
    if (self.chrome) {
        revoker();
    } else {
        setTimeout(revoker, arbitrary_revoke_timeout);
    }
};

const dispatch = function(filesaver, event_types, event) {
    event_types = [].concat(event_types);
    let i = event_types.length;
    while (i--) {
        const listener = filesaver["on" + event_types[i]];
        if (typeof listener === "function") {
            try {
                listener.call(filesaver, event || filesaver);
            } catch (ex) {
                throw_outside(ex);
            }
        }
    }
};

const auto_bom = function(blob) {
    // prepend BOM for UTF-8 XML and text/* types (including HTML)
    if (/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
        return new Blob(["\ufeff", blob], {type: blob.type});
    }
    return blob;
};

class FileSaver {
    constructor(blob, name, no_auto_bom) {
        if (!no_auto_bom) {
            blob = auto_bom(blob);
        }
        // First try a.download, then web filesystem, then object URLs
        const filesaver = this;
        const type = blob.type;
        let blob_changed = false;
        let object_url;
        let target_view;
        const dispatch_all = function() {
            dispatch(filesaver, "writestart progress write writeend".split(" "));
        };
        // on any filesys errors revert to saving with object URLs
        const fs_error = function() {
            if (target_view && is_safari && typeof FileReader !== "undefined") {
                // Safari doesn't allow downloading of blob urls
                const reader = new FileReader();
                reader.onloadend = function() {
                    const base64Data = reader.result;
                    target_view.location.href = "data:attachment/file" + base64Data.slice(base64Data.search(/[,;]/));
                    filesaver.readyState = filesaver.DONE;
                    dispatch_all();
                };
                reader.readAsDataURL(blob);
                filesaver.readyState = filesaver.INIT;
                return;
            }
            // don't create more object URLs than needed
            if (blob_changed || !object_url) {
                object_url = get_URL().createObjectURL(blob);
            }
            if (target_view) {
                target_view.location.href = object_url;
            } else {
                const new_tab = self.open(object_url, "_blank");
                if (new_tab == undefined && is_safari) {
                    //Apple do not allow window.open, see http://bit.ly/1kZffRI
                    self.location.href = object_url;
                }
            }
            filesaver.readyState = filesaver.DONE;
            dispatch_all();
            revoke(object_url);
        };
        const abortable = function(func) {
            return function() {
                if (filesaver.readyState !== filesaver.DONE) {
                    return func.apply(this, arguments);
                }
            };
        };
        const create_if_not_found = {create: true, exclusive: false};
        let slice;

        filesaver.readyState = filesaver.INIT;

        if (!name) {
            name = "download";
        }

        if (can_use_save_link) {
            object_url = get_URL().createObjectURL(blob);
            setTimeout(function() {
                save_link.href = object_url;
                save_link.download = name;
                click(save_link);
                dispatch_all();
                revoke(object_url);
                filesaver.readyState = filesaver.DONE;
            });
            return;
        }

        // Object and web filesystem URLs have a problem saving in Google Chrome when
        // viewed in a tab, so I force save with application/octet-stream
        // http://code.google.com/p/chromium/issues/detail?id=91158
        // Update: Google errantly closed 91158, I submitted it again:
        // https://code.google.com/p/chromium/issues/detail?id=389642
        if (self.chrome && type && type !== force_saveable_type) {
            slice = blob.slice || blob.webkitSlice;
            blob = slice.call(blob, 0, blob.size, force_saveable_type);
            blob_changed = true;
        }

        // Since I can't be sure that the guessed media type will trigger a download
        // in WebKit, I append .download to the filename.
        // https://bugs.webkit.org/show_bug.cgi?id=65440
        if (webkit_req_fs && name !== "download") {
            name += ".download";
        }

        if (type === force_saveable_type || webkit_req_fs) {
            target_view = self;
        }

        if (!req_fs) {
            fs_error();
            return;
        }

        fs_min_size += blob.size;
        req_fs(self.TEMPORARY, fs_min_size, abortable(function(fs) {
            fs.root.getDirectory("saved", create_if_not_found, abortable(function(dir) {
                const save = function() {
                    dir.getFile(name, create_if_not_found, abortable(function(file) {
                        file.createWriter(abortable(function(writer) {
                            writer.onwriteend = function(event) {
                                target_view.location.href = file.toURL();
                                filesaver.readyState = filesaver.DONE;
                                dispatch(filesaver, "writeend", event);
                                revoke(file);
                            };
                            writer.onerror = function() {
                                const error = writer.error;
                                if (error.code !== error.ABORT_ERR) {
                                    fs_error();
                                }
                            };
                            "writestart progress write abort".split(" ").forEach(function(event) {
                                writer["on" + event] = filesaver["on" + event];
                            });
                            writer.write(blob);
                            filesaver.abort = function() {
                                writer.abort();
                                filesaver.readyState = filesaver.DONE;
                            };
                            filesaver.readyState = filesaver.WRITING;
                        }), fs_error);
                    }), fs_error);
                };
                dir.getFile(name, {create: false}, abortable(function(file) {
                    // delete file if it already exists
                    file.remove();
                    save();
                }), abortable(function(ex) {
                    if (ex.code === ex.NOT_FOUND_ERR) {
                        save();
                    } else {
                        fs_error();
                    }
                }));
            }), fs_error);
        }), fs_error);
    }

    static get DONE() { return 2; }
    static get INIT() { return 0; }
    static get WRITING() { return 1; }
}

export function saveAs(blob, name, no_auto_bom) {
    return new FileSaver(blob, name, no_auto_bom);
}

export { FileSaver };
