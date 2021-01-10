/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

let BASE = self.base,
    KIRI = self.kiri,
    UTIL = BASE.util,
    time = UTIL.time,
    current = self.worker = {
        print: null,
        snap: null
    },
    cache = {};

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};

console.log(`kiri | init work | ${KIRI.version || "rogue"}`);
BASE.debug.disable();

// code is running in the worker / server context
const dispatch =
KIRI.server =
KIRI.worker = {
    cache: cache,

    decimate: function(data, send) {
        let { vertices, options } = data;
        vertices = new Float32Array(vertices),
        vertices = BASE.pointsToVertices(BASE.verticesToPoints(vertices, options));
        send.done(vertices);
    },

    snap: function(data, send) {
        current.snap = data;
        send.done();
    },

    // widget sync
    sync: function(data, send) {
        let vertices = new Float32Array(data.vertices),
            points = BASE.verticesToPoints(vertices, { maxpass: 0 }),
            widget = KIRI.newWidget(data.id).setPoints(points);

        // do it here so cancel can work
        cache[data.id] = widget;
        // stored for possible future rotations
        widget.vertices = vertices;

        // fake mesh object to satisfy printing
        widget.track = data.tracking;
        widget.mesh = {
            widget: widget,
            position: data.position
        };

        send.done(data.id);
    },

    slice: function(data, send) {
        let { id, settings } = data;

        send.data({update:0.05, updateStatus:"slicing"});

        let widget = cache[data.id],
            last = time(),
            xpos,
            ypos,
            now;

        try {

        let rotation = (Math.PI/180) * (settings.device.bedBelt ? 45 : 0);
        if (rotation) {
            let bounds = widget.getBoundingBox(true);
            let track = widget.track;
            // console.log(widget.id, '\n', track.pos, '\n', track.box, '\n', '\n---\n')
            xpos = track.pos.x;
            ypos = track.pos.y + settings.device.bedDepth / 2 - track.box.h / 2;
            widget.mesh = null;
            widget.points = null;
            widget.loadVertices(widget.vertices);
            widget._rotate(rotation,0,0,true);
            widget.center(false, true);
            widget.getBoundingBox(true);
            widget.belt = { xpos, ypos };
        }

        widget.slice(settings, function(error) {
            if (error) {
                send.data({error: error});
            } else {
                const slices = widget.slices || [];
                send.data({send_start: time()});
                send.data({
                    stats: widget.stats,
                    slices: slices.length,
                });
                slices.forEach(function(slice,index) {
                    const state = { zeros: [] };
                    send.data({index: index, slice: slice.encode(state)}, state.zeros);
                })
                send.data({send_end: time()});
                // unrotate and send delta coordinates
                if (rotation) {
                    widget.setPoints(null);
                    widget._rotate(-rotation,0,0,true);
                    let wbb = widget.getBoundingBox(true);
                    widget.center(false, true);
                    let dy = (wbb.max.y + wbb.min.y)/2;
                    let dz = wbb.min.z;
                    widget.rotinfo = { angle: 45, dy, dz, xpos, ypos };
                    // console.log(widget.id, '\n', widget.belt, '\n', widget.rotinfo, '\n===\n')
                    send.data({ rotinfo: widget.rotinfo });
                }
            }

            send.done({done: true});
        }, function(update, msg) {
            now = time();
            if (now - last < 10 && update < 0.99) return;
            // on update
            send.data({update: (0.05 + update * 0.95), updateStatus: msg});
            last = now;
        });

        } catch (error) {
            send.data({error: error.toString()});
            console.log(error);
        }
    },

    prepare: function(data, send) {
        // create widget array from id:widget cache
        const widgets = Object.values(cache);

        // let client know we've started
        send.data({update:0.05, updateStatus:"preview"});

        const drivers = KIRI.driver;
        const settings = data.settings;
        const mode = settings.mode;
        const driver = drivers[mode];

        if (!(driver && driver.prepare)) {
            return console.log({invalid_print_driver: mode, driver});
        }

        const layers = driver.prepare(widgets, settings, (progress, message, layer) => {
            const state = { zeros: [] };
            const emit = { progress, message };
            if (layer) {
                emit.layer = KIRI.codec.encode(layer, state)
            }
            send.data(emit);
        });

        const unitScale = settings.controller.units === 'in' ? (1 / 25.4) : 1;
        const print = current.print || {};
        const maxSpeed = (print.maxSpeed || 0) * unitScale;
        const state = { zeros: [] };

        send.data({ progress: 1, message: "transfer" });

        send.done({
            done: true,
            // output: KIRI.codec.encode(layers, state),
            maxSpeed
        }, state.zeros);
    },

    export: function(data, send) {
        const mode = data.settings.mode;
        const driver = KIRI.driver[mode];

        if (!(driver && driver.export)) {
            console.log({missing_export_driver: mode});
            return send.done()
        }

        let output;
        driver.export(current.print, function(line, direct) {
            send.data({line}, direct);
        }, function(done) {
            // SLA workaround
            output = done;
        });
        const { bounds, time, lines, bytes, distance, settings } = current.print;

        send.done({
            done: true,
            output: output ? output : { bounds, time, lines, bytes, distance, settings }
        });
    },

    colors: function(data, send) {
        const { colors, max } = data;
        const colorMap = {};
        colors.forEach(color => {
            colorMap[color] = KIRI.driver.FDM.rateToColor(color, max);
        });
        send.done(colorMap);
    },

    parse: function(args, send) {
        const { settings, code, type } = args;
        const origin = settings.origin;
        const offset = {
            x: origin.x,
            y: -origin.y,
            z: origin.z
        };
        const print = current.print = KIRI.newPrint(settings, Object.values(cache));
        const tools = settings.device.extruders;
        const mode = settings.mode;
        const thin = settings.controller.lineType === 'line' || mode !== 'FDM';
        const flat = settings.controller.lineType === 'flat' && mode === 'FDM';
        const parsed = print.parseGCode(code, offset, progress => {
            send.data({ progress: progress * 0.25 });
        }, done => {
            const maxSpeed = print.maxSpeed;
            const layers = KIRI.driver.FDM.prepareRender(done.output, progress => {
                send.data({ progress: 0.25 + progress * 0.75 });
            }, { thin: thin || print.belt, flat, tools });
            send.done({parsed: KIRI.codec.encode(layers), maxSpeed});
        }, { fdm : mode === 'FDM' });
    },

    parse_svg: function(parsed, send) {
        parsed.forEach(layer => {
            layer.forEach(out => {
                const { x, y, z } = out.point;
                out.point = BASE.newPoint(x,y,z || 0);
            });
        });
        const print = current.print = KIRI.newPrint(null, Object.values(cache));
        const layers = KIRI.driver.FDM.prepareRender(parsed, progress => {
            send.data({ progress });
        }, { thin:  true });
        send.done({parsed: KIRI.codec.encode(layers)});
    },

    clear: function(data, send) {
        current.snap = null;
        current.print = null;
        if (!data.id) {
            cache = {};
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

    config: function(data, send) {
        const update = {};
        if (data.base) {
            update.base = data.base;
            Object.assign(BASE.config, data.base);
        } else {
            console.log({invalid:data});
        }
        send.done({config: update});
    },

    image2mesh: function(info, send) {
        let img = new png.PNG();
        img.parse(info.png, (err, output) => {
            let { width, height, data } = output;
            let { bedDepth, bedWidth } = info.settings.device;
            let imageAspect = height / width;
            let deviceAspect = bedDepth / bedWidth;
            let div = 1;
            if (imageAspect < deviceAspect) {
                div = width / bedWidth;
            } else {
                div = height / bedDepth;
            }
            let points =
                width * height + // grid
                height * 2 + 0 + // left/right
                width * 2 + 0;   // top/bottom
            let flats =
                ((height-1) * (width-1)) + // surface
                ((height-1) * 2) +         // left/right
                ((width-1) * 2) +          // top/bottom
                1;                         // base
            // convert png to grayscale
            let gray = new Uint8Array(width * height);
            let alpha = new Uint8Array(width * height);
            let gi = 0;
            let invi = info.inv_image ? true : false;
            let inva = info.inv_alpha ? true : false;
            let border = info.border || 0;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let di = (x + width * y) * 4;
                    let r = data[di];
                    let g = data[di+1];
                    let b = data[di+2];
                    let a = data[di+3];
                    let v = ((r + g + b) / 3);
                    if (inva) a = 255 - a;
                    if (invi) v = 255 - v;
                    if (border) {
                        if (x < border || y < border || x > width-border-1 || y > height-border-1) {
                            v = 255;
                        }
                    }
                    alpha[gi] = a;
                    gray[gi++] = v * (a / 255);
                }
            }
            let blur = parseInt(info.blur || 0);
            while (blur-- > 0) {
                let blur = new Uint8Array(width * height);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        let xl = Math.max(x-1,0);
                        let xr = Math.min(x+1,width-1);
                        let yu = Math.max(y-1,0);
                        let yd = Math.min(y+1,height-1);
                        let id = x + width * y;
                        blur[id] = ((
                            gray[xl + (width * yu)] +
                            gray[x  + (width * yu)] +
                            gray[xr + (width * yu)] +
                            gray[xl + (width *  y)] +
                            gray[x  + (width *  y)] * 8 + // self
                            gray[xr + (width *  y)] +
                            gray[xl + (width * yd)] +
                            gray[x  + (width * yd)] +
                            gray[xr + (width * yd)]
                        ) / 16);
                    }
                }
                gray = blur;
            }
            // create indexed mesh output
            let base = parseInt(info.base || 0);
            let verts = new Float32Array(points * 3);
            let faces = new Uint32Array(flats * 6);
            let w2 = width / 2;
            let h2 = height / 2;
            let vi = 0;
            let ii = 0;
            let VI = 0;
            let VB = 0;
            // create surface vertices & faces
            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    let id = x + width * y;
                    let v = gray[id];
                    // create vertex @ x,y
                    verts[vi++] = (-w2 + x) / div;
                    verts[vi++] = (h2 - y) / div;
                    verts[vi++] = (v / 50) + (base * alpha[id] / 255);
                    VI++;
                    // create two surface faces on the rect between x-1,y-1 and x,y
                    if (x > 0 && y > 0) {
                        let p1 = (x - 1) * height + (y - 0);
                        let p2 = (x - 0) * height + (y - 1);
                        let p3 = (x - 0) * height + (y - 0);
                        let p4 = (x - 1) * height + (y - 1);
                        faces[ii++] = p1;
                        faces[ii++] = p2;
                        faces[ii++] = p3;
                        faces[ii++] = p1;
                        faces[ii++] = p4;
                        faces[ii++] = p2;
                    }
                }
                send.data({progress: x / width});
            }
            // create top vertices & faces
            VB = VI;
            let TL = VI;
            for (let x = 0; x < width; x++) {
                let y = 0;
                verts[vi++] = (-w2 + x) / div;
                verts[vi++] = (h2 - y) / div;
                verts[vi++] = 0;
                VI++;
                // create two top faces on the rect x-1,0, x,z
                if (x > 0) {
                    let p1 = VB + (x - 1);
                    let p2 = VB + (x - 0);
                    let p3 = (x * height);
                    let p4 = (x - 1) * height;
                    faces[ii++] = p1;
                    faces[ii++] = p3;
                    faces[ii++] = p2;
                    faces[ii++] = p1;
                    faces[ii++] = p4;
                    faces[ii++] = p3;
                }
            }
            // create bottom vertices & faces
            VB = VI;
            let BL = VI;
            for (let x = 0; x < width; x++) {
                let y = height - 1;
                verts[vi++] = (-w2 + x) / div;
                verts[vi++] = (h2 - y) / div;
                verts[vi++] = 0;
                VI++;
                // create two top faces on the rect x-1,0, x,z
                if (x > 0) {
                    let p1 = VB + (x - 1);
                    let p2 = VB + (x - 0);
                    let p3 = (x * height) + y;
                    let p4 = (x - 1) * height + y;
                    faces[ii++] = p1;
                    faces[ii++] = p2;
                    faces[ii++] = p3;
                    faces[ii++] = p1;
                    faces[ii++] = p3;
                    faces[ii++] = p4;
                }
            }
            // create left vertices & faces
            VB = VI;
            for (let y=0; y < height; y++) {
                let x = 0;
                verts[vi++] = (-w2 + x) / div;
                verts[vi++] = (h2 - y) / div;
                verts[vi++] = 0;
                VI++;
                // create two left faces on the rect y-1,0, y,z
                if (y > 0) {
                    let p1 = VB + (y + 0);
                    let p2 = VB + (y - 1);
                    let p3 = 0 + (y - 1);
                    let p4 = 0 + (y - 0);
                    faces[ii++] = p1;
                    faces[ii++] = p3;
                    faces[ii++] = p2;
                    faces[ii++] = p1;
                    faces[ii++] = p4;
                    faces[ii++] = p3;
                }
            }
            // create right vertices & faces
            VB = VI;
            let TR = VI;
            for (let y=0; y < height; y++) {
                let x = width - 1;
                verts[vi++] = (-w2 + x) / div;
                verts[vi++] = (h2 - y) / div;
                verts[vi++] = 0;
                VI++;
                // create two right faces on the rect y-1,0, y,z
                if (y > 0) {
                    let p1 = VB + (y + 0);
                    let p2 = VB + (y - 1);
                    let p3 = (x * height) + (y - 1);
                    let p4 = (x * height) + (y - 0);
                    faces[ii++] = p1;
                    faces[ii++] = p2;
                    faces[ii++] = p3;
                    faces[ii++] = p1;
                    faces[ii++] = p3;
                    faces[ii++] = p4;
                }
            }
            let BR = VI-1;
            // create base two faces
            faces[ii++] = TL;
            faces[ii++] = TR;
            faces[ii++] = BR;
            faces[ii++] = TL;
            faces[ii++] = BR;
            faces[ii++] = BL;
            // flatten for now until we support indexed mesh
            // throughout KM (widget, storage, decimation)
            let bigv = new Float32Array(ii * 3);
            let bgi = 0;
            for (let i=0; i<ii; i++) {
                let iv = faces[i] * 3;
                bigv[bgi++] = verts[iv];
                bigv[bgi++] = verts[iv+1];
                bigv[bgi++] = verts[iv+2];
            }
            // send.done({done: {verts, faces, bigv, vi, ii}}, [ bigv.buffer ]);
            send.done({done: {bigv}}, [ bigv.buffer ]);
        });
    }
};

self.onmessage = function(e) {
    let time_recv = time(),
        msg = e.data,
        run = dispatch[msg.task],
        send = {
            data : function(data,direct) {
                // if (direct && direct.length) {
                //     console.log({
                //         zeros: direct.length,
                //         sz:direct.map(z => z.byteLength).reduce((a,v) => a+v)
                //     });
                // }
                self.postMessage({
                    seq: msg.seq,
                    task: msg.task,
                    done: false,
                    data: data
                }, direct);
            },
            done : function(data,direct) {
                // if (direct && direct.length) {
                //     console.log({
                //         zeros: direct.length,
                //         sz:direct.map(z => z.byteLength).reduce((a,v) => a+v)
                //     });
                // }
                self.postMessage({
                    seq: msg.seq,
                    task: msg.task,
                    done: true,
                    data: data
                }, direct);
            }
        };

    if (run) {
        let time_xfer = (time_recv - msg.time),
            output = run(msg.data, send),
            time_send = time(),
            time_proc = time_send - time_recv;

        if (output) self.postMessage({
            seq: msg.seq,
            task: msg.task,
            time_send: time_xfer,
            time_proc: time_proc,
            // replaced on reply side
            time_recv: time(),
            data: output
        });
    } else {
        console.log({kiri_msg:e});
    }
};

// load kiri modules
KIRI.loader.forEach(fn => {
    fn(dispatch);
});
