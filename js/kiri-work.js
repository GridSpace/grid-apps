/** Copyright Stewart Allen -- All Rights Reserved */
"use strict";

// this code runs in kiri's main loop
if (!self.kiri) self.kiri = {};

let loc = self.location,
    host = loc.hostname,
    port = loc.port,
    proto = loc.protocol,
    time = function() { return new Date().getTime() },
    KIRI = self.kiri,
    BASE = self.base,
    seqid = 1,
    running = {},
    slicing = {},
    worker = null;

function send(fn, data, onreply, async, zerocopy) {
    let seq = seqid++;

    running[seq] = {fn:onreply, async:async||false};

    worker.postMessage({
        seq: seq,
        task: fn,
        time: time(),
        data: data
    }, zerocopy);
}

KIRI.work = {
    isSlicing : function() {
        let current = 0;
        for (let key in slicing) {
            current++;
        }
        return current > 0;
    },

    restart : function() {
        if (worker) {
            worker.terminate();
        }

        for (let key in slicing) {
            slicing[key]({error: "cancelled slicing"});
        }

        slicing = {};
        running = {};
        worker = new Worker(`/code/worker.js?${exports.VERSION}`);

        worker.onmessage = function(e) {
            let now = time(),
                reply = e.data,
                record = running[reply.seq],
                onreply = record.fn;

            if (reply.done) {
                delete running[reply.seq];
            }

            // calculate and replace recv time
            reply.time_recv = now - reply.time_recv;

            onreply(reply.data, reply);
        };
    },

    decimate : function(vertices, callback) {
        vertices = vertices.buffer.slice(0);
        send("decimate", vertices, function(output) {
            callback(output);
        });
    },

    clear : function(widget) {
        send("clear", widget ? {id:widget.id} : {}, function(reply) {
            // console.log({clear:reply});
        });
    },

    slice : function(settings, widget, callback) {
        let vertices = widget.getGeoVertices().buffer.slice(0);
        slicing[widget.id] = callback;
        send("slice", {
            id: widget.id,
            settings: settings,
            vertices: vertices,
            position: widget.mesh.position
        }, function(reply) {
            if (reply.done || reply.error) delete slicing[widget.id];
            callback(reply);
        }, null, [vertices]);
    },

    printSetup : function(settings, callback) {
        send("printSetup", {settings:settings}, function(reply) {
            callback(reply);
        });
    },

    printExport : function(settings, online, ondone) {
        let lines = [];
        send("printExport", {settings:settings}, function(reply) {
            if (reply.line) {
                online(reply.line);
            }
            if (reply.done) {
                ondone(reply.done);
            }
        });
    },

    printGCode : function(callback) {
        let gcode = [];
        let start = BASE.util.time();
        send("printGCode", {}, function(reply) {
            if (reply.line) {
                gcode.push(reply.line);
            } else {
                if (!reply.gcode) reply.gcode = gcode.join("\n");
                // console.log({printGCode:(BASE.util.time() - start)});
                callback(reply);
            }
        });
    },

    sliceToGCode : function(settings, vertices, callback) {
        vertices = widget.getGeoVertices().buffer.slice(0);
        let wid = new Date().toString(36);
        send("slice", {settings:settings, id:wiwd, vertices:vertices, position:{x:0,y:0,z:0}}, function(reply) {
            send("printSetup", {settings:settings}, function(reply) {
                send("printGCode", {}, function(reply) {
                    callback(reply);
                });
            }, null, [vertices]);
            callback(reply);
        });
    }
};

// start worker
KIRI.work.restart();
