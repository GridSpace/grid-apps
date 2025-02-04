const { Client } = require('@gridspace/basic-ftp');
const { Readable } = require('stream');
const { FrameStream } = require('./frames');

module.exports = async (server) => {

    const { api, env, util } = server;
    const confdir = util.confdir();
    const mqtt = require("mqtt");
    const mcache = {};
    const wsopen = [];
    const found = {};
    const debug = false;

    class MQTT {
        #timer;
        #timer2;
        #client;
        #serial;
        #frames;
        #topic_report;
        #topic_request;
        #options = {
            protocol: 'mqtts',
            port: 8883,
            username: 'bblp',
            // ca: fs.readFileSync('ca.crt'),
            // key: fs.readFileSync('client.key'),
            // cert: fs.readFileSync('client.crt'),
            rejectUnauthorized: false
        }

        constructor(host, code, serial, onready, onerror, onmessage) {
            this.#options.host = host;
            this.#options.password = code;
            this.#serial = serial;
            let client = this.#client = mqtt.connect(this.#options);

            client.on("connect", () => {
                let report = this.#topic_report = `device/${serial}/report`;
                let request = this.#topic_request = `device/${serial}/request`;
                // util.log({ report, request });
                client.subscribe(report, (err) => {
                    debug && util.log('mqtt sub', this.#serial, err || "ok");
                    onready(this);
                    this.keepalive();
                    // this.keepconn();
                });
            });

            client.on("message", (topic, message) => {
                message = JSON.parse(message.toString());
                if (onmessage) {
                    onmessage(message);
                } else {
                    debug && util.log('mqtt_recv', this.#serial, message);
                }
            });

            client.on("error", error => onerror(error));
        }

        set_frames(bool) {
            if (this.#frames && !bool) {
                this.#frames.end();
                this.#frames = undefined;
            } else if (!this.#frames && bool) {
                this.#frames = new FrameStream(this.#options.host, this.#options.password)
                    .on("frame", jpg => {
                        wsend({ serial: this.#serial, frame: jpg.toString('base64') });
                    })
            }
        }

        keepalive() {
            clearTimeout(this.#timer);
            this.#timer = setTimeout(() => { this.end() }, 30000);
        }

        keepconn() {
            clearTimeout(this.#timer2);
            this.#timer2 = setTimeout(() => { this.keepconn() }, 120000);
            if_mqtt(this.#serial, {
                print: {
                    sequence_id: "0",
                    command: "push_status",
                    msg: 1
                }
            });
        }

        async send(msg) {
            if (this.#client) {
                debug && util.log('mqtt send', this.#serial, msg);
                this.#client.publish(this.#topic_request, JSON.stringify(msg));
                this.keepalive();
                return true;
            } else {
                return false;
            }
        }

        end() {
            if (this.#client) {
                debug && util.log('mqtt end', this.#serial);
                this.#client.end();
                this.#client = undefined;
            }
            this.#topic_report = undefined;
            this.#topic_request = undefined;
            delete mcache[this.#serial];
        }
    }

    function if_mqtt(serial, msg) {
        mcache[serial]?.send(msg);
    }

    function get_mqtt(host, code, serial, onmsg, onconn) {
        const fns = {};
        const promise = new Promise((resolve, reject) => {
            Object.assign(fns, { resolve, reject });
        });

        let mqtt = mcache[serial];
        if (mqtt) {
            fns.resolve(mqtt);
        } else {
            mqtt = new MQTT(host, code, serial, obj => {
                mcache[serial] = obj;
                fns.resolve(obj);
                if (onconn) {
                    onconn(mqtt);
                }
            }, error => fns.reject(error), onmsg);
        }

        return promise;
    }

    async function ftp_open(args = {}) {
        const client = new Client();
        const port = parseInt(args.port || 990);
        const host = args.host || "localhost";
        const user = args.user || "bblp";
        const password = args.password || args.code || '';
        // client.ftp.verbose = true;
        try {
            await client.access({
                port,
                host,
                user,
                password,
                secure: "implicit",
                secureOptions: { rejectUnauthorized: false }
            });
        } catch (error) {
            util.log({ ftp_error: error });
            throw error;
        }
        return client;
    }

    async function ftp_send(args = {}) {
        const client = await ftp_open(args);
        const filename = args.filename || "test.3mf";
        const data = args.data || undefined;
        try {
            const readableStream = new Readable();
            readableStream._read = () => {};
            readableStream.push(data);
            readableStream.push(null);
            await client.uploadFrom(readableStream, filename);
        } finally {
            client.close();
        }
    }

    async function ftp_list(args = {}) {
        const client = await ftp_open(args);
        const list = [];
        try {
            let files = await client.list();
            files.forEach(file => file.root = "");
            list.push(...files);
         } catch (e) { }
        try {
            let files = await client.list("/cache");
            files.forEach(file => file.root = "cache/");
            list.push(...files);
        } catch (e) { }
        client.close();
        return list;
    }

    async function ftp_delete(args = {}) {
        const client = await ftp_open(args);
        try {
            await client.remove(args.path);
        } catch (error) {
            util.log({ ftp_delete_error: error });
        }
        client.close();
    }

    function file_print(opts = {}) {
        const { host, code, serial, filename, amsmap } = opts;
        debug && util.log({ file_print: opts });
        const cmd = {
            print: {
                command: "project_file",
                url: `file:///sdcard/${filename}`,
                param: "Metadata/plate_1.gcode",
                subtask_id: "0",
                use_ams: amsmap ? true : false,
                timelapse: false,
                flow_cali: false,
                bed_leveling: false,
                layer_inspect: false,
                vibration_cali: false
            }
        };
        if (amsmap) {
            cmd.print.ams_mapping = amsmap;
        }
        get_mqtt(host, code, serial, message => {
            debug && util.log('mqtt_recv', message);
            wsend({ serial, message });
        })
            .then(mqtt => mqtt.send(cmd))
            .catch(err => {
                util.log({ mqtt_err: err });
            });
    }

    function decode_post(req, res, next) {
        if (req.method === 'POST') {
            let chunks = [];
            req
                .on('data', data => chunks.push(data) )
                .on('end', () => {
                    req.app.post = Buffer.concat(chunks);
                    next();
                });
        } else {
            next();
        }
    }

    // insert script before all others in kiri client
    server.inject("kiri", "bambu.js");

    function o2s(obj) {
        return JSON.stringify(obj);
    }

    function wsend(msg) {
        wsopen.forEach(ws => ws.send(JSON.stringify(msg)));
    }

    if (!(env.debug || env.electron)) {
        util.log('not a valid context for bambu');
        return;
    }

    // start SSDP listener for local Bambu printer broadcasts
    {
        const dgram = require("dgram");
        const SSDP_ADDRESS = "239.255.255.250";
        const SSDP_PORT = 1990;
        const socket = dgram.createSocket("udp4");

        socket.on("message", msg => {
            msg = msg.toString();
            if (msg.indexOf('.bambu.com') > 0) {
                let rec = {};
                map = msg.split('\n')
                    .filter(l => l.indexOf(': ') > 0)
                    .map(l => l.trim().replace('.bambu.com','').split(': '));
                map.forEach(line => rec[line[0]] = line[1]);
                // console.log({ ssdp: rec, map })
                if (rec.DevName && rec.Location) {
                    let nurec = {
                        host: rec.Location,
                        name: rec.DevName,
                        type: rec.DevModel,
                        firm: rec.DevVersion,
                        srno: rec.USN
                    }
                    if (!found[rec.DevName]) {
                        found[rec.DevName] = nurec;
                        util.log(`found Bambu ${nurec.name} ${nurec.srno} @ ${nurec.host}`);
                    }
                    wsend({ found });
                }
            }
        });

        socket.bind(SSDP_PORT, () => {
            socket.addMembership(SSDP_ADDRESS);
        });
    }

    api.bambu_send = (req, res, next) => {
        const { app, url, headers } = req;
        const { host } = headers;
        const { query } = app;
        server.handler.addCORS(req, res);
        decode_post(req, res, async () => {
            res.setHeader("Content-Type", "application/octet-stream");
            res.setHeader('Cache-Control', 'no-cache, no-store, private');
            const data = req.app.post;
            const { host, code, filename, serial, ams, start } = query;
            const amsmap = ams ? ams.split(',').map(v => parseInt(v)) : undefined;
            ftp_send({ host, code, filename, data })
                .then(() => {
                    if (serial && start ==='true') {
                        file_print({ host, code, serial, filename, amsmap });
                    }
                    res.end(o2s({ sent: true }));
                })
                .catch(error => {
                    util.log({ ftp_send_error: error });
                    res.end(o2s({ sent: false, error }));
                });
        });
    };

    server.ws.register("/bambu", function(ws, req) {
        wsopen.push(ws);
        debug && util.log('ws open', req.url, wsopen.length);
        wsend({ found });
        ws.on('message', msg => {
            msg = JSON.parse(msg);
            let { cmd, host, code, serial, path, amsmap, direct, frames } = msg;
            switch (cmd) {
                case "monitor":
                    get_mqtt(host, code, serial, message => {
                        // util.log({ mqtt_msg: serial });
                        wsend({ serial, message });
                    }, mqtt => {
                        // on open only
                    }).then(mqtt => {
                        // util.log({ mqtt_mon: mqtt });
                        // request all printer state info
                        mqtt.send({
                            pushing: {
                                sequence_id: "0",
                                command: "pushall"
                            }
                        });
                        // request system info
                        false && mqtt.send({
                            info: {
                                command: "get_version"
                            }
                        });
                        // announce all current monitor hosts
                        wsend({ monitoring: Object.keys(mcache) });
                    }).catch(error => {
                        util.log({ mqtt_err: error });
                        wsend({ serial, error: error.message || error.toString() });
                    });
                    break;
                case "files":
                    ftp_list({ host, code }).then(files => {
                        debug && util.log({ ftp_files: files.length });
                        // console.log(JSON.stringify(files,undefined,4));
                        files = files
                            .filter(file => file.name.toLowerCase().endsWith(".3mf"))
                            .map(file => {
                                return {
                                    root: file.root,
                                    name: file.name,
                                    path: file.root + file.name,
                                    size: file.size,
                                    date: file.rawModifiedAt
                                };
                            });
                        wsend({ serial, files });
                    }).catch(error => {
                        util.log({ ftp_error: error });
                        wsend({ serial, error: error.message || error.toString() });
                    });
                    break;
                case "file-delete":
                    ftp_delete({ host, code, path }).then(() => {
                        util.log({ ftp_delete: path });
                        wsend({ serial, deleted: path });
                    });
                    break;
                case "file-print":
                    file_print({ host, code, serial, filename: path, amsmap });
                    break;
                case "pause":
                    if_mqtt(serial, { print: { command: "pause", sequence_id: "0" } });
                    break;
                case "resume":
                    if_mqtt(serial, { print: { command: "resume", sequence_id: "0" } });
                    break;
                case "cancel":
                    if_mqtt(serial, { print: { command: "stop", sequence_id: "0", param: "" } });
                    break;
                case "direct":
                    if_mqtt(serial, direct);
                    break;
                case "frames":
                    util.log('request frames', serial, frames);
                    mcache[serial]?.set_frames(frames);
                    break;
                case "keepalive":
                    // util.log({ keepalive: serial });
                    mcache[serial]?.keepalive();
                    break;
            }
        });
        ws.on('close', () => {
            let io = wsopen.indexOf(ws);
            if (io >= 0) wsopen.splice(io, 1);
            debug && util.log('ws close', wsopen.length);
        });
    });
};
