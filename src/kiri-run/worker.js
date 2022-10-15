/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.polygons
// dep: geo.wasm
// dep: kiri.codec
// dep: kiri.slice
// dep: moto.license
// use: load.png
// use: ext.jszip
// use: kiri.render
// use: kiri-mode.cam.animate
// use: kiri-mode.cam.slice
// use: kiri-mode.cam.prepare
// use: kiri-mode.cam.export
// use: kiri-mode.cam.tool
// use: kiri-mode.fdm.slice
// use: kiri-mode.fdm.prepare
// use: kiri-mode.fdm.export
// use: kiri-mode.sla.slice
// use: kiri-mode.sla.export
// use: kiri-mode.fdm.slice
// use: kiri-mode.fdm.prepare
// use: kiri-mode.fdm.export
// use: kiri-mode.laser.driver
gapp.register("kiri-run.worker", [], (root, exports) => {

const { base, kiri } = root;
const { util, polygons, wasm_ctrl } = base;
const { codec } = kiri;
const { time } = util;
const POLY = polygons;

let debug = self.debug === true,
    ccvalue = this.navigator ? navigator.hardwareConcurrency || 0 : 0,
    concurrent = self.Worker && ccvalue > 3 ? ccvalue - 1 : 0,
    current = self.worker = {
        print: null,
        snap: null
    },
    wgroup = {},
    wcache = {},
    minions = [],
    minionq = [],
    minifns = {},
    miniseq = 0;

kiri.version = gapp.version;

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};

function minhandler(msg) {
    let data = msg.data;
    let seq = data.seq;
    let fn = minifns[seq];
    if (!fn) {
        throw `missing dispatch ${seq}`;
    }
    delete minifns[seq];
    fn(data);
}

// for concurrent operations
const minwork =
kiri.minions = {
    concurrent,

    start() {
        if (minions.length || !concurrent) {
            return;
        }
        for (let i=0; i < concurrent; i++) {
            let _ = debug ? '_' : '';
            let minion = new Worker(`/code/kiri_pool.js?${_}${self.kiri.version}`);
            minion.onmessage = minhandler;
            minion.postMessage({ cmd: "label", name: `#${i}` });
            minions.push(minion);
        }
        console.log(`kiri | init pool | ${gapp.version || "rogue"} | ${concurrent + 1}`);
    },

    stop() {
        for (let minion of minions) {
            minion.terminate();
        }
        minions.length = 0;
    },

    union(polys, minarea) {
        return new Promise((resolve, reject) => {
            if (concurrent < 2 || polys.length < concurrent * 2 || POLY.points(polys) < concurrent * 50) {
                resolve(POLY.union(polys, minarea, true));
                return;
            }
            let polyper = Math.ceil(polys.length / concurrent);
            let running = 0;
            let union = [];
            let receiver = function(data) {
                let polys = codec.decode(data.union);
                union.appendAll(polys);
                if (--running === 0) {
                    resolve(POLY.union(union, minarea, true));
                }
            };
            for (let i=0; i<polys.length; i += polyper) {
                running++;
                minwork.queue({
                    cmd: "union",
                    minarea,
                    polys: codec.encode(polys.slice(i, i + polyper))
                }, receiver);
            }
        });
    },

    fill(polys, angle, spacing, output, minLen, maxLen) {
        return new Promise((resolve, reject) => {
            if (concurrent < 2) {
                resolve(POLY.fillArea(polys, angle, spacing, [], minLen, maxLen));
                return;
            }
            minwork.queue({
                cmd: "fill",
                polys: codec.encode(polys),
                angle, spacing, minLen, maxLen
            }, data => {
                let arr = data.fill;
                let fill = [];
                for (let i=0; i<arr.length; ) {
                    let pt = base.newPoint(arr[i++], arr[i++], arr[i++]);
                    pt.index = arr[i++];
                    fill.push(pt);
                }
                output.appendAll(fill);
                resolve(fill);
            });
        });
    },

    clip(slice, polys, lines) {
        return new Promise((resolve, reject) => {
            if (concurrent < 2) {
                reject("concurrent clip unavailable");
            }
            minwork.queue({
                cmd: "clip",
                polys: POLY.toClipper(polys),
                lines: lines.map(a => a.map(p => p.toClipper())),
                z: slice.z
            }, data => {
                let polys = codec.decode(data.clips);
                for (let top of slice.tops) {
                    for (let poly of polys) {
                        if (poly.isInside(top.poly)) {
                            top.fill_sparse.push(poly);
                        }
                    }
                }
                resolve(polys);
            });
        });
    },

    sliceZ(z, points, options) {
        return new Promise((resolve, reject) => {
            if (concurrent < 2) {
                reject("concurrent slice unavaiable");
            }
            let { each } = options;
            let i = 0, floatP = new Float32Array(points.length * 3);
            for (let p of points) {
                floatP[i++] = p.x;
                floatP[i++] = p.y;
                floatP[i++] = p.z;
            }
            minwork.queue({
                cmd: "sliceZ",
                z,
                points: floatP,
                options: codec.toCodable(options)
            }, data => {
                let recs = codec.decode(data.output);
                if (each) {
                    for (let rec of recs) {
                        each(rec);
                    }
                }
                resolve(recs);
            }, [ floatP.buffer ]);
        });
    },

    queue(work, ondone, direct) {
        minionq.push({work, ondone, direct});
        minwork.kick();
    },

    kick() {
        if (minions.length && minionq.length) {
            let qrec = minionq.shift();
            let minion = minions.shift();
            let seq = miniseq++;
            qrec.work.seq = seq;
            minifns[seq] = (data) => {
                qrec.ondone(data);
                minions.push(minion);
                minwork.kick();
            };
            minion.postMessage(qrec.work, qrec.direct);
        }
    },

    wasm(enable) {
        for (let minion of minions) {
            minion.postMessage({
                cmd: "wasm",
                enable
            });
        }
    }
};

console.log(`kiri | init work | ${gapp.version || "rogue"}`);

// code is running in the worker / server context
const dispatch =
kiri.server =
kiri.worker = {
    pool_start(data, send) {
        minwork.start();
        send.done({});
    },

    pool_stop(data, send) {
        minwork.stop();
        send.done({});
    },

    group: wgroup,

    cache: wcache,

    decimate(data, send) {
        let { vertices, options } = data;
        vertices = new Float32Array(vertices),
        vertices = base.pointsToVertices(base.verticesToPoints(vertices, options));
        send.done(vertices);
    },

    heal(data, send) {
        let { vertices, refresh } = data;
        let mesh = new base.Mesh({vertices}).heal();
        if (mesh.newFaces || refresh) {
            vertices = mesh.unrolled().toFloat32();
            send.done({vertices}, [vertices]);
        } else {
            send.done({});
        }
    },

    snap(data, send) {
        current.snap = data;
        send.done();
    },

    png(data, send) {
        if (current.snap) {
            let sws = current.snap.url;
            let b64 = atob(sws.substring(sws.indexOf(',') + 1));
            let bin = Uint8Array.from(b64, c => c.charCodeAt(0));
            let img = new png.PNG();
            img.parse(bin, (err, data) => {
                send.done({png: bin}, [ bin ]);
            });
        } else {
            send.done({error: "missing snapshot"});
        }
    },

    clear(data, send) {
        // current.snap = null;
        current.print = null;
        dispatch.group = wgroup = {};
        dispatch.cache = wcache = {};
        kiri.Widget.Groups.clear();
        send.done({ clear: true });
    },

    // widget sync
    sync(data, send) {
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
            widget = kiri.newWidget(data.id, group).loadVertices(vertices).setInWorker();

        // do it here so cancel can work
        wcache[data.id] = widget;
        // stored for possible future rotations
        widget.vertices = vertices;
        // restore meta
        widget.meta = data.meta;
        // restore tracking object
        widget.track = data.track;
        send.done(data.id);
    },

    rotate(data, send) {
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
                // if (z < 0.01) {
                    miny = Math.min(miny, y);
                    maxy = Math.max(maxy, y);
                // }
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
            let proc = settings.process;
            // move to accomodate anchor
            ypos += (proc.beltAnchor || proc.firstLayerBeltLead || 0);
            for (let w of group) {
                w.moveMesh(0, miny, 0);
            }
            widget.rotateRaw(rotation,0,0,true);
            let minr = gmin(group);
            widget.belt = { xpos, ypos, yadd: minr.maxy - minr.miny, dy: -miny, dz: 0 };
            for (let others of group.slice(1)) {
                others.belt = widget.belt;
            }

            send.data({group: group.id, belt: widget.belt});
        }
        send.done({});
    },

    unrotate(data, send) {
        let { settings } = data;
        if (!settings.device.bedBelt) {
            return send.done({});
        }
        let rotation = (Math.PI / 180) * 45;
        for (let group of Object.values(wgroup)) {
            let widget = group[0];
            let { xpos, ypos } = widget.belt;
            let { dy, dz } = widget.belt;
            let proc = settings.process;
            // move to accomodate anchor
            dy -= (proc.beltAnchor || proc.firstLayerBeltLead || 0) ;
            widget.rotinfo = { angle: 45, dy, dz, xpos, ypos };
            for (let others of group.slice(1)) {
                others.rotinfo = widget.rotinfo;
            }
            send.data({group: group.id, rotinfo: widget.rotinfo});
        }
        send.done({});
    },

    slice(data, send) {
        send.data({update:0.001, updateStatus:"slicing"});

        current.print = null;

        let settings = data.settings,
            widget = wcache[data.id],
            last = time(),
            now;

        widget.anno = data.anno || widget.anno;

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
                slices.forEach((slice,index) => {
                    const state = { zeros: [] };
                    send.data({index: index, slice: slice.encode(state)}, state.zeros);
                })
                send.data({send_end: time()});
            }
            send.done({done: true});
        }, function(update, msg, alert) {
            now = time();
            // on alert
            if (alert) send.data({ alert });
            // on update
            if (now - last < 10 && update < 0.99) return;
            if (update || msg) send.data({update: (0.05 + update * 0.95), updateStatus: msg});
            last = now;
        });
    },

    sliceAll(data, send) {
        const { settings } = data;
        const { mode } = settings;
        const driver = kiri.driver[mode];

        if (driver.sliceAll) {
            driver.sliceAll(settings, send.data);
        }

        send.done({done: true});
    },

    prepare(data, send) {
        // create widget array from id:widget cache
        const widgets = Object.values(wcache);

        // let client know we've started
        send.data({update:0.05, updateStatus:"preview"});

        const { settings } = data;
        const { mode } = settings;
        const driver = kiri.driver[mode];

        if (!(driver && driver.prepare)) {
            return console.log({invalid_print_driver: mode, driver});
        }

        const layers = driver.prepare(widgets, settings, (progress, message, layer) => {
            const state = { zeros: [] };
            const emit = { progress, message, layer: (layer ? layer.encode(state) : undefined) };
            send.data(emit, state.zeros);
        });

        const unitScale = settings.controller.units === 'in' ? (1 / 25.4) : 1;
        const print = current.print || {};
        const minSpeed = (print.minSpeed || 0) * unitScale;
        const maxSpeed = (print.maxSpeed || 0) * unitScale;

        send.data({ progress: 1, message: "transfer" });
        send.done({ done: true, minSpeed, maxSpeed });
    },

    export(data, send) {
        const mode = data.settings.mode;
        const driver = kiri.driver[mode];

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
        }, function(debug) {
            send.data({debug});
        });
        const {
            bounds, time, lines, bytes, distance,
            settings, segments, purges
        } = current.print;

        send.done({
            done: true,
            output: output ? output : {
                bounds, time, lines, bytes, distance,
                settings, segments, purges
            }
        });
    },

    colors(data, send) {
        const { colors, max } = data;
        const colorMap = {};
        colors.forEach(color => {
            colorMap[color] = kiri.render.rate_to_color(color, max);
        });
        send.done(colorMap);
    },

    parse(args, send) {
        const { settings, code, type } = args;
        const origin = settings.origin;
        const offset = {
            x: origin.x,
            y: -origin.y,
            z: origin.z
        };
        const device = settings.device;
        const print = current.print = kiri.newPrint(settings, Object.values(wcache));
        const tools = device.extruders;
        const mode = settings.mode;
        const thin = settings.controller.lineType === 'line' || mode !== 'FDM';
        const flat = settings.controller.lineType === 'flat' && mode === 'FDM';
        const parsed = print.parseGCode(code, offset, progress => {
            send.data({ progress: progress * 0.25 });
        }, done => {
            const minSpeed = print.minSpeed;
            const maxSpeed = print.maxSpeed;
            const layers = kiri.render.path(done.output, progress => {
                send.data({ progress: 0.25 + progress * 0.75 });
            }, { thin: thin || print.belt, flat, tools });
            send.done({parsed: codec.encode(layers), maxSpeed, minSpeed});
        }, {
            fdm: mode === 'FDM',
            belt: device.bedBelt
        });
    },

    parse_svg(parsed, send) {
        parsed.forEach(layer => {
            layer.forEach(out => {
                const { x, y, z } = out.point;
                out.point = base.newPoint(x,y,z || 0);
            });
        });
        const print = current.print = kiri.newPrint(null, Object.values(wcache));
        const layers = kiri.render.path(parsed, progress => {
            send.data({ progress });
        }, { thin:  true });
        send.done({parsed: codec.encode(layers)});
    },

    config(data, send) {
        const update = {};
        if (data.base) {
            update.base = data.base;
            Object.assign(base.config, data.base);
        } else {
            console.log({invalid:data});
        }
        for (let minion of minions) {
            minion.postMessage({
                cmd: "config",
                base: data.base
            });
        }
        send.done({config: update});
    },

    image2mesh(info, send) {
        let { device } = info.settings;
        load.PNG.parse(info.png, {
            outWidth: device.bedDepth,
            outHeight: device.bedWidth,
            inv_image: info.inv_image,
            inv_alpha: info.inv_alpha,
            border: info.border,
            blur: info.blur,
            base: info.base,
            progress(progress) { send.data({ progress }) },
            done(vertices) { send.done({ vertices }, [ vertices.buffer ])}
        });
    },

    zip(data, send) {
        let { files } = data;
        let zip = new JSZip();
        for (let file of files) {
            zip.file(file.name, file.data);
        }
        zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
            streamFiles: true
        }, progress => {
            send.data(progress);
        }).then(output => {
            send.done(output);
        });
    },

    wasm(data, send) {
        if (data.enable) {
            wasm_ctrl.enable();
        } else {
            wasm_ctrl.disable();
        }
        minwork.wasm(data.enable);
        send.done({ wasm: data });
    }
};

dispatch.send = (msg, direct) => {
    self.postMessage(msg, direct);
};

dispatch.onmessage = self.onmessage = function(e) {
    let time_recv = time(),
        msg = e.data || {},
        run = dispatch[msg.task],
        send = {
            data : function(data,direct) {
                // if (direct && direct.length) {
                //     console.log( direct.map(z => z.byteLength).reduce((a,v) => a+v) );
                // }
                dispatch.send({
                    seq: msg.seq,
                    task: msg.task,
                    done: false,
                    data: data
                }, direct);
                // if (direct && direct.length) {
                //     console.log( direct.map(z => z.byteLength).reduce((a,v) => a+v) );
                // }
            },
            done : function(data,direct) {
                dispatch.send({
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

            if (output) dispatch.send({
                seq: msg.seq,
                task: msg.task,
                time_send: time_xfer,
                time_proc: time_proc,
                // replaced on reply side
                time_recv: time(),
                data: output
            });
        } catch (wrkerr) {
            console.trace(wrkerr.stack);
            send.done({error: wrkerr.toString()});
        }
    } else {
        console.log({worker_unhandled: e, msg, fn: dispatch[msg.task]});
    }
};

});

// load kiri modules
// kiri.load_exec(dispatch);
