/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// use: kiri.api
gapp.register("kiri.client", [], (root, exports) => {

const { kiri } = root;

// this code runs in kiri's main loop
let loc = self.location,
    host = loc.hostname,
    port = loc.port,
    proto = loc.protocol,
    debug = self.debug === true,
    time = Date.now,
    seqid = 1,
    syncd = {},
    running = {},
    worker = null,
    restarting = false
    // occ = new Worker("/kiri/ext/occ-worker.js", {type:"module"}),
    ;

/**
 * @param {Function} fn name of function in kiri.worker
 * @param {Object} data to send to server
 * @param {Function} onreply function to call on reply messages
 * @param {Object[]} zerocopy array of objects to pass using zerocopy
 */
function send(fn, data, onreply, zerocopy) {
    let seq = seqid++;

    if (onreply) {
        // track it only when we expect and can handle a reply
        running[seq] = { fn:onreply };
    }
    let msg = {
        seq: seq,
        task: fn,
        time: time(),
        data: data
    };
    // console.log('client send', msg);
    // if (!fn) { console.trace({empty_fn: data}) };
    try {
        worker.postMessage(msg, zerocopy);
    } catch (error) {
        console.trace('work send error', {data, error});
    }
}

// code is running in the browser / client context
const client = exports({
    send: send,

    pool: {
        start() {
            send("pool_start", {}, noop);
        },

        stop() {
            send("pool_stop", {}, noop);
        }
    },

    newWorker() {
        if (self.createWorker) {
            return self.createWorker();
        } else {
            let _ = debug ? '_' : '';
            return new Worker(`/code/kiri_work.js?${_}${gapp.version}`);
        }
    },

    isBusy() {
        let current = 0;

        for (let rec of Object.values(running)) {
            if (rec.fn) current++;
        }
        return current > 0;
    },

    restart() {
        // prevent re-entry from cancel callback
        if (restarting) {
            return;
        }

        if (worker) {
            worker.terminate();
        }

        restarting = true;

        for (let key in running) {
            let rec = running[key];
            if (rec.fn) {
                rec.fn({error: "cancelled operation"});
            }
        }

        syncd = {};
        running = {};
        worker = client.newWorker();

        client.onmessage = worker.onmessage = function(e) {
            let now = time(),
                reply = e.data,
                record = running[reply.seq],
                onreply = record ? record.fn : undefined;

            // console.log('client recv', e)
            if (reply.done) {
                delete running[reply.seq];
            }

            // calculate and replace recv time
            reply.time_recv = now - reply.time_recv;

            if (onreply) {
                onreply(reply.data, reply);
            } else {
                console.log({unexpected_reply: reply});
            }
        };

        restarting = false;
    },

    decimate(vertices, options, callback) {
        let alert = kiri.api.show.alert('processing model', 1000);
        vertices = vertices.buffer.slice(0);
        send("decimate", {vertices, options}, (output) => {
            kiri.api.hide.alert(alert);
            callback(output);
        });
    },

    heal(vertices, callback, refresh) {
        send("heal", {vertices, refresh}, (output) => {
            callback(output);
        });
    },

    config(obj) {
        send("config", obj, noop);
    },

    clear() {
        syncd = {};
        send("clear", {}, noop);
    },

    snap(data) {
        send("snap", data, noop);
    },

    png(data, ondone) {
        send("png", data, ondone);
    },

    // widget sync
    sync(widgets) {
        if (!widgets) {
            widgets = kiri.api.widgets.all();
        }
        // send list of currently valid widgets
        send("sync", { valid: widgets.map(w => w.id) }, () =>  {});
        // sync any widget that has changed
        widgets.forEach(widget => {
            if (widget.modified || !syncd[widget.id]) {
                syncd[widget.id] = true;
                let vertices = widget.getGeoVertices().buffer.slice(0);
                send("sync", {
                    id: widget.id,
                    meta: widget.meta,
                    group: widget.group.id,
                    track: widget.track,
                    vertices: vertices,
                    position: widget.mesh.position,
                }, done => {
                    widget.modified = false;
                }, [vertices]);
            }
        });
    },

    rotate(settings, callback) {
        send("rotate", { settings }, reply => {
            if (reply.group) {
                for (let widget of kiri.Widget.Groups.forid(reply.group)) {
                    widget.belt = reply.belt;
                }
            } else if (callback) {
                callback();
            }
        });
    },

    unrotate(settings, callback) {
        send("unrotate", { settings }, reply => {
            if (reply.group) {
                for (let widget of kiri.Widget.Groups.forid(reply.group)) {
                    widget.rotinfo = reply.rotinfo;
                }
            } else if (callback) {
                callback();
            }
        });
    },

    slice(settings, widget, callback) {
        send("slice", {
            id: widget.id,
            anno: widget.annotations(),
            settings: settings
        }, reply => {
            callback(reply);
            if (reply.done || reply.error) {
                // in belt mode, slicing modifies a widget and requires re-sync
                if (settings.device.bedBelt) {
                    widget.modified = true;
                }
            }
        });
    },

    sliceAll(settings, callback) {
        send("sliceAll", { settings }, callback);
    },

    prepare(settings, update, done) {
        send("prepare", { settings }, reply => {
            if (reply.progress) {
                update(reply.progress, reply.message, reply.layer);
            }
            if (reply.done) {
                done(reply.output, reply.maxSpeed, reply.minSpeed);
            }
            if (reply.error) {
                done(reply);
            }
        });
    },

    export(settings, online, ondone) {
        send("export", { settings }, reply => {
            if (reply.line) {
                online(reply.line);
            }
            if (reply.done) {
                ondone(reply.output);
            }
            if (reply.error) {
                ondone(null, reply.error);
            }
            if (reply.debug) {
                kiri.api.event.emit("export.debug", reply.debug);
            }
        });
    },

    colors(colors, max, done) {
        send("colors", { colors, max }, reply => {
            done(reply);
        });
    },

    parse(args, progress, done) {
        // have to do this client side because DOMParser is not in workers
        if (args.type === 'svg') {
            const { settings, code, type } = args;
            const origin = settings.origin;
            const offset = {
                x: origin.x,
                y: -origin.y,
                z: origin.z
            };
            const output = kiri.newPrint().parseSVG(code, offset);
            send("parse_svg", output, reply => {
                if (reply.parsed) {
                    done(kiri.codec.decode(reply.parsed));
                }
            });
            return;
        }
        send("parse", args, reply => {
            if (reply.progress) {
                progress(reply.progress);
            }
            if (reply.parsed) {
                done(kiri.codec.decode(reply.parsed), reply.maxSpeed, reply.minSpeed);
            }
        });
    },

    image2mesh(data, progress, output) {
        send("image2mesh", data, reply => {
            if (reply.progress) {
                progress(reply.progress);
            }
            if (reply.done) {
                output(reply.done);
            }
        }, [ data.png ]);
    },

    zip(files, progress, output) {
        send("zip", {files}, reply => {
            if (reply.percent !== undefined) {
                progress(reply);
            } else {
                output(reply);
            }
        });
    },

    wasm(enable) {
        send("wasm", {enable}, reply => {
            // console.log({wasm_worker_said: reply});
        });
    }
});

// start worker
client.restart();

});
