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
    wgroup = {},
    wcache = {};

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
    group: wgroup,

    cache: wcache,

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

    clear: function(data, send) {
        current.snap = null;
        current.print = null;
        dispatch.group = wgroup = {};
        dispatch.cache = wcache = {};
        send.done({ clear: true });
    },

    // widget sync
    sync: function(data, send) {
        if (data.valid) {
            // remove widgets not present in valid list
            for (let key in wcache) {
                if (data.valid.indexOf(key) < 0) {
                    delete wcache[key];
                    for (let [id,group] of Object.entries(wgroup)) {
                        wgroup[id] = group = group.filter(v => v.id !== key);
                        group.id = id;
                    }
                }
            }
            send.done(data.id);
            return;
        }

        let group = wgroup[data.group];
        if (!group) {
            group = [];
            group.id = data.group;
            wgroup[data.group] = group;
        }
        let vertices = new Float32Array(data.vertices),
            widget = KIRI.newWidget(data.id, group).loadVertices(vertices);

        // do it here so cancel can work
        wcache[data.id] = widget;
        // stored for possible future rotations
        widget.vertices = vertices;
        // restore tracking object
        widget.track = data.track;
        send.done(data.id);
    },

    rotate: function(data, send) {
        let { settings } = data;
        if (!settings.device.bedBelt) {
            return send.done({});
        }

        function mins(vert, last = {}) {
            let miny = last.miny || Infinity,
                maxy = last.maxy || -Infinity;
            for (let i=0, l=vert.length; i<l; ) {
                let x = vert[i++];
                let y = vert[i++];
                let z = vert[i++];
                if (z < 0.01) {
                    miny = Math.min(miny, y);
                    maxy = Math.max(maxy, y);
                }
            }
            return { miny, maxy };
        }

        function gmin(group) {
            let minv = {};
            for (let w of group) {
                minv = mins(w.vertices, minv);
            }
            return minv;
        }

        for (let group of Object.values(wgroup)) {
            let { miny, maxy } = gmin(group);

            let widget = group[0];
            let track = widget.track;
            let xpos = track.pos.x;
            let ypos = settings.device.bedDepth / 2 + track.pos.y + miny;
            let rotation = (Math.PI / 180) * 45;

            widget.rotate(rotation,0,0,true);
            let minr = gmin(group);
            widget.belt = { xpos, ypos, yadd: minr.maxy - minr.miny };
            for (let others of group.slice(1)) {
                others.belt = widget.belt;
            }

            send.data({group: group.id, belt: widget.belt});
        }
        send.done({});
    },

    unrotate: function(data, send) {
        let { settings } = data;
        if (!settings.device.bedBelt) {
            return send.done({});
        }
        let rotation = (Math.PI / 180) * 45;
        for (let group of Object.values(wgroup)) {
            let widget = group[0];
            widget.groupBounds();
            widget.rotate(-rotation,0,0,true);
            let { dy, dz } = widget.track.center;
            widget.groupBounds();
            let { xpos, ypos } = widget.belt;
            widget.rotinfo = { angle: 45, dy, dz, xpos, ypos };
            for (let others of group.slice(1)) {
                others.rotinfo = widget.rotinfo;
            }
            send.data({group: group.id, rotinfo: widget.rotinfo});
        }
        send.done({});
    },

    slice: function(data, send) {
        send.data({update:0.001, updateStatus:"slicing"});

        let settings = data.settings,
            widget = wcache[data.id],
            last = time(),
            now;

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
            }
            send.done({done: true});
        }, function(update, msg) {
            now = time();
            if (now - last < 10 && update < 0.99) return;
            // on update
            send.data({update: (0.05 + update * 0.95), updateStatus: msg});
            last = now;
        });
    },

    prepare: function(data, send) {
        // create widget array from id:widget cache
        const widgets = Object.values(wcache);

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
        const device = settings.device;
        const print = current.print = KIRI.newPrint(settings, Object.values(wcache));
        const tools = device.extruders;
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
        }, {
            fdm: mode === 'FDM',
            belt: device.bedBelt
        });
    },

    parse_svg: function(parsed, send) {
        parsed.forEach(layer => {
            layer.forEach(out => {
                const { x, y, z } = out.point;
                out.point = BASE.newPoint(x,y,z || 0);
            });
        });
        const print = current.print = KIRI.newPrint(null, Object.values(wcache));
        const layers = KIRI.driver.FDM.prepareRender(parsed, progress => {
            send.data({ progress });
        }, { thin:  true });
        send.done({parsed: KIRI.codec.encode(layers)});
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
                        faces[ii++] = p3;
                        faces[ii++] = p2;
                        faces[ii++] = p1;
                        faces[ii++] = p2;
                        faces[ii++] = p4;
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
    },

    zip: function(data, send) {
        let { files } = data;
        let zip = new JSZip();
        for (let file of files) {
            zip.file(file.name, file.data);
        }
        zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
            compressionOptions: { level: 3 },
            streamFiles: true
        }, progress => {
            send.data(progress);
        }).then(output => {
            send.done(output);
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
        try {
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
        } catch (wrkerr) {
            // console.log(wrkerr);
            console.trace(wrkerr.stack);
            send.done({error: wrkerr.toString()});
        }
    } else {
        console.log({kiri_msg:e});
    }
};

// load kiri modules
KIRI.loader.forEach(fn => {
    fn(dispatch);
});
