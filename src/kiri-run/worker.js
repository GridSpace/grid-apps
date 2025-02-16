/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: geo.polygons
// dep: geo.wasm
// dep: kiri.codec
// dep: kiri.slice
// dep: moto.license
// dep: moto.broker
// use: load.png
// use: load.gbr
// use: ext.jszip
// use: kiri.render
// use: kiri-mode.cam.animate
// use: kiri-mode.cam.animate2
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
// use: kiri-mode.drag.driver
// use: kiri-mode.wjet.driver
// use: kiri-mode.wedm.driver
gapp.register("kiri-run.worker", [], (root, exports) => {

const { base, kiri, moto } = root;
const { util, polygons, wasm_ctrl } = base;
const { codec } = kiri;
const { time } = util;
const POLY = polygons;

let debug = self.debug === true,
    ccvalue = this.navigator ? navigator.hardwareConcurrency || 0 : 0,
    concurrent = Math.min(4, self.Worker && ccvalue > 3 ? ccvalue - 1 : 0),
    current = self.worker = {
        print: null,
        snap: null,
        mode: null
    },
    wgroup = {},
    wcache = {},
    pcache = {},
    minions = [],
    minionq = [],
    minifns = {},
    miniseq = 0;

kiri.version = gapp.version;

// catch clipper alerts and convert to console messages
self.alert = function(o) {
    console.log(o);
};

self.uuid = ((Math.random() * Date.now()) | 0).toString(36);

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
    get concurrent() {
        return concurrent
    },

    get running() {
        return minions.length;
    },

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
                let state = { zeros: [] };
                running++;
                minwork.queue({
                    cmd: "union",
                    minarea,
                    polys: codec.encode(polys.slice(i, i + polyper), state)
                }, receiver, state.zeros);
            }
        });
    },

    fill(polys, angle, spacing, output, minLen, maxLen) {
        return new Promise((resolve, reject) => {
            if (concurrent < 2) {
                resolve(POLY.fillArea(polys, angle, spacing, [], minLen, maxLen));
                return;
            }
            const state = { zeros: [] };
            minwork.queue({
                cmd: "fill",
                polys: codec.encode(polys, state),
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
            }, state.zeros);
        });
    },

    clip(slice, polys, lines) {
        return new Promise((resolve, reject) => {
            if (concurrent < 2) {
                reject("concurrent clip unavailable");
            }
            const state = { zeros: [] };

            minwork.queue({
                cmd: "clip",
                polys: codec.encode(POLY.flatten(polys).map(poly => codec.encodePointArray2D(poly.points, state)), state),
                lines: codec.encode(lines.map(array => codec.encodePointArray2D(array, state)), state),
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
            }, state.zeros);
        });
    },

    sliceZ(z, points, options) {
        return new Promise((resolve, reject) => {
            if (concurrent < 2) {
                reject("concurrent slice unavaiable");
            }
            let { each } = options;
            // todo use shared array buffer?
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

    queueAsync(work, direct) {
        return new Promise(resolve => {
            minwork.queue(work, resolve, direct);
        });
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

    broadcast(cmd, data, direct) {
        for (let minion of minions) {
            minion.postMessage({
                cmd, ...data
            }, direct);
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

    // purge all sync data
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
        // ensure each widget belongs to at least one group
        let group = wgroup[data.group];
        if (!group) {
            group = [];
            group.id = data.group;
            wgroup[data.group] = group;
        }

        let vertices = data.vertices,
            widget = kiri.newWidget(data.id, group)
                .setInWorker()
                .loadVertices(vertices);

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

    // belt mode rotate widgets 45 degrees on X axis before slicing
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
                miny = Math.min(miny, y);
                maxy = Math.max(maxy, y);
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
            let proc = settings.process;
            let track = widget.track;
            let angle = proc.sliceAngle;
            let xpos = track.pos.x;
            let yoff = proc.beltAnchor || proc.firstLayerBeltLead || 0;
            let ypos = settings.device.bedDepth / 2 + track.pos.y + miny + yoff;
            let radians = Math.PI / 180;
            let rotation = radians * angle;
            for (let w of group) {
                w.moveMesh(0, miny, 0);
            }
            // rotating the root of the group rotates all widgets in the group
            widget.rotate(rotation, 0, 0, true, false);
            widget.belt = {
                angle,
                // used during prepare
                xpos,
                ypos,
                // used during slice
                dy: - miny - yoff,
                dz: 0,
                // ratio for anchor lengths, path offsets
                cosf: Math.cos(radians * angle), // Y comp
                sinf: Math.sin(radians * angle), // Z comp
                // slope for calculating z = 0 from angle bias
                slope: Math.tan(radians * (90 - angle))
            };
            for (let others of group.slice(1)) {
                others.belt = widget.belt;
            }
            send.data({group: group.id, belt: widget.belt});
        }
        send.done({});
    },

    slice(data, send) {
        send.data({update:0.001, updateStatus:"slicing"});

        let settings = data.settings,
            widget = wcache[data.id],
            last = time(),
            now;

        current.print = null;
        current.mode = settings.mode.toUpperCase();

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

        driver.prepare(widgets, settings, (progress, message, layer) => {
            const state = { zeros: [] };
            const emit = { progress, message, layer: (layer ? layer.encode(state) : undefined) };
            send.data(emit, state.zeros);
        }).then(() => {
            const unitScale = settings.controller.units === 'in' ? (1 / 25.4) : 1;
            const print = current.print || {};
            const minSpeed = (print.minSpeed || 0) * unitScale;
            const maxSpeed = (print.maxSpeed || 0) * unitScale;

            send.data({ progress: 1, message: "transfer" });
            send.done({ done: true, minSpeed, maxSpeed });
        });
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
            bounds,
            time,
            lines,
            bytes,
            distance,
            settings,
            segments,
            purges,
            labels
        } = current.print;

        send.done({
            done: true,
            output: output ? output : {
                bounds,
                time,
                lines,
                bytes,
                distance,
                settings,
                segments,
                purges,
                labels
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
            kiri.render.path(done.output, progress => {
                send.data({ progress: 0.25 + progress * 0.75 });
            }, { thin: thin || print.belt, flat, tools })
            .then(layers => {
                send.done({parsed: codec.encode(layers), maxSpeed, minSpeed});
            });
        }, {
            fdm: mode === 'FDM',
            cam: mode === 'CAM',
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
        kiri.render.path(parsed, progress => {
            send.data({ progress });
        }, { thin:  true })
        .then(layers => {
            send.done({parsed: codec.encode(layers)});
        });
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

    gerber2mesh(data, send) {
        const vertices = load.GBR.toMesh(data, { progress(pct) {
            send.data({ progress: pct/100 });
        } } );
        send.data({ vertices }, [ vertices.buffer ]);
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
        minwork.broadcast("wasm", { enable: data.enable ? true : false });
        send.done({ wasm: data });
    },

    putCache(msg, send) {
        const { key, data } = msg;
        // console.log({ worker_putCache: key, data });
        if (data) {
            pcache[key] = data;
        } else {
            delete pcache[key];
        }
        minwork.broadcast("putCache", msg);
        send.done({ ok: true });
    },

    clearCache(msg, send) {
        pcache = {};
        minwork.broadcast("clearCache", msg);
        send.done({ ok: true });
    }
};

function is_async(fn) {
    return fn.constructor.name === "AsyncFunction";
}

dispatch.send = (msg, direct) => {
    self.postMessage(msg, direct);
};

dispatch.onmessage = self.onmessage = async function(e) {
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
                output = is_async(run) ? await run(msg.data, send) : run(msg.data, send),
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

moto.broker.publish("worker.started", { dispatch, minions: minwork });

});

// load kiri modules
// kiri.load_exec(dispatch);
