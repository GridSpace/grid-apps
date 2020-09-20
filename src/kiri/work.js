/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

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
    // console.log('send', data);
    worker.postMessage({
        seq: seq,
        task: fn,
        time: time(),
        data: data
    }, zerocopy);
}

KIRI.work = {
    newWorker: function() {
        if (self.createWorker) {
            return self.createWorker();
        } else {
            return new Worker(`/code/worker.js?${self.kiri.version}`);
        }
    },

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
        worker = KIRI.work.newWorker();

        worker.onmessage = function(e) {
            let now = time(),
                reply = e.data,
                record = running[reply.seq],
                onreply = record.fn;

            // console.log('recv', reply.data)
            if (reply.done) {
                delete running[reply.seq];
            }

            // calculate and replace recv time
            reply.time_recv = now - reply.time_recv;

            onreply(reply.data, reply);
        };
    },

    decimate : function(vertices, callback) {
        let alert = KIRI.api.show.alert('decimating imported model', 1000);
        vertices = vertices.buffer.slice(0);
        send("decimate", vertices, function(output) {
            KIRI.api.hide.alert(alert);
            callback(output);
        });
    },

    config : function(obj) {
        send("config", obj, function(reply) {
            // console.log({config:reply});
        });
    },

    clear : function(widget) {
        send("clear", widget ? {id:widget.id} : {}, function(reply) {
            // console.log({clear:reply});
        });
    },

    snap : function(data) {
        send("snap", data, function(reply) {
            // console.log({snap:reply})
        });
    },

    slice : function(settings, widget, callback) {
        let rotation = (Math.PI/180) * (settings.process.sliceRotation || 0);
        let centerz;
        let movez;
        if (rotation) {
            let bbox1 = widget.getBoundingBox(true);
            widget._rotate(0,rotation,0,true);
            widget.center();
            let bbox2 = widget.getBoundingBox(true);
            centerz = (bbox2.max.z - bbox2.min.z)/2;
            movez = centerz - (bbox1.max.z - bbox1.min.z)/2;
        }
        let vertices = widget.getGeoVertices().buffer.slice(0);
            // snapshot = KIRI.api.view.snapshot;
        if (rotation) {
            widget._rotate(0,-rotation,0,true);
            widget.center();
        }
        slicing[widget.id] = callback;
        send("slice", {
            id: widget.id,
            settings: settings,
            vertices: vertices,
            position: widget.mesh.position,
            tracking: widget.track,
            // snapshot: snapshot,
            // for rotation / unrotation
            state: {
                rotation: rotation,
                centerz: centerz,
                movez: movez
            }
        }, function(reply) {
            if (reply.done || reply.error) delete slicing[widget.id];
            callback(reply);
        }, null, [vertices]);
    },

    printSetup : function(settings, callback) {
        send("printSetup", {settings:settings}, function(reply) {
            callback(reply);
        }, undefined);
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
