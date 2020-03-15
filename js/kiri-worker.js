/** Copyright Stewart Allen -- All Rights Reserved */
"use strict";

// this code runs in the web worker
module = { exports: {} };

let loc = self.location,
    ver = exports.VERSION,
    time = function() { return new Date().getTime() };
    host = loc.hostname,
    debug = host === 'debug' || host === 'localhost';

console.log(`kiri | init work | ${ver}${debug ? ' | debug' : ''}`);

// when running the server in 'web' mode, the obfuscated code is served as a
// unified ball via /code/work.js -- otherwise, map "localhost" to "debug"
// to debug unobfuscated code.  if not, /js/ paths will 404.
if (debug) {
    try {
        [
            "license",
            "ext-n3d",
            "ext-clip",
            "add-array",
            "add-three",
            "geo",
            "geo-point",
            "geo-debug",
            "geo-bounds",
            "geo-line",
            "geo-slope",
            "geo-polygon",
            "geo-polygons",
            "geo-gyroid",
            "kiri-fill",
            "kiri-slice",
            "kiri-slicer",
            "kiri-driver-fdm",
            "kiri-driver-cam",
            "kiri-driver-laser",
            "kiri-widget",
            "kiri-pack",
            "kiri-print",
            "kiri-codec"
        ].forEach(function(scr) {
            importScripts(`/js/${scr}.js/${ver}`);
        })
    } catch (e) {
        console.log("unable to load worker scripts. server is in production mode.");
    }
} else {
    importScripts("/code/work.js/"+ver);
}

let base = self.base,
    moto = self.moto,
    dbug = base.debug,
    util = base.util,
    kiri = self.kiri,
    Widget = kiri.Widget,
    currentPrint,
    cache = {};

if (!debug) {
    base.debug.disable();
}

let dispatch = {
    decimate: function(vertices, send) {
        vertices = new Float32Array(vertices),
        vertices = Widget.pointsToVertices(Widget.verticesToPoints(vertices, true));
        send.done(vertices);
    },

    slice: function(data, send) {
        let settings = data.settings,
            vertices = new Float32Array(data.vertices),
            position = data.position,
            points = Widget.verticesToPoints(vertices);

        send.data({update:0.05, updateStatus:"slicing"});

        let widget = kiri.newWidget(data.id).setPoints(points),
            last = util.time(),
            now;

        // do it here so cancel can work
        cache[data.id] = widget;

        // fake mesh object to satisfy printing
        widget.mesh = {
            widget: widget,
            position: position
        };

        widget.slice(settings, function(error) {
            if (error) {
                delete cache[data.id];
                send.data({error: error});
            } else {
                let slices = widget.slices || [];
                send.data({send_start: time()});
                send.data({
                    topo: settings.synth.sendTopo ? widget.topo : null,
                    stats: widget.stats,
                    slices: slices.length
                });
                slices.forEach(function(slice,index) {
                    send.data({index: index, slice: slice.encode()});
                })
                if (debug && widget.polish) {
                    send.data({polish: kiri.codec.encode(widget.polish)});
                }
                send.data({send_end: time()});
            }
            send.done({done: true});
            // cache results for future printing
            // cache[data.id] = widget;
        }, function(update, msg) {
            now = util.time();
            if (now - last < 10 && update < 0.99) return;
            // on update
            send.data({update: (0.05 + update * 0.95), updateStatus: msg});
            last = now;
        });
    },

    printSetup: function(data, send) {
        let widgets = [], key;
        for (key in cache) {
            if (cache.hasOwnProperty(key)) widgets.push(cache[key]);
        }

        send.data({update:0.05, updateStatus:"preview"});

        currentPrint = kiri.newPrint(data.settings, widgets, data.id);
        currentPrint.setup(false, function(update, msg) {
            send.data({
                update: update,
                updateStatus: msg
            });
        }, function() {
            send.done({
                done: true,
                output: currentPrint.encodeOutput()
            });
        });
    },

    printGCode: function(data, send) {
        currentPrint.exportGCode(false, function(gcode) {
            send.done({
                gcode: gcode,
                lines: currentPrint.lines,
                bytes: currentPrint.bytes,
                bounds: currentPrint.bounds,
                distance: currentPrint.distance,
                time: currentPrint.time
            });
        }, function(line) {
            send.data({line:line});
        });
    },

    clear: function(data, send) {
        if (!data.id) {
            cache = {};
            currentPrint = null;
            send.done({ clear: true });
            return;
        }
        let had = cache[data.id] !== undefined;
        delete cache[data.id];
        send.done({
            id: data.id,
            had: had,
            has: cache[data.id] !== undefined
        });
    },
};

self.onmessage = function(e) {
    let time_recv = util.time(),
        msg = e.data,
        run = dispatch[msg.task],
        send = {
            data : function(data,direct) {
                self.postMessage({
                    seq: msg.seq,
                    task: msg.task,
                    done: false,
                    data: data
                },direct);
            },
            done : function(data,direct) {
                self.postMessage({
                    seq: msg.seq,
                    task: msg.task,
                    done: true,
                    data: data
                },direct);
            }
        };

    if (run) {
        let time_xfer = (time_recv - msg.time),
            output = run(msg.data, send),
            time_send = util.time(),
            time_proc = time_send - time_recv;

        if (output) self.postMessage({
            seq: msg.seq,
            task: msg.task,
            time_send: time_xfer,
            time_proc: time_proc,
            // replaced on reply side
            time_recv: util.time(),
            data: output
        });
    } else {
        console.log({kiri_msg:e});
    }
};

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};
