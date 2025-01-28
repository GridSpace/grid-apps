const { Client } = require('basic-ftp');
const { Readable } = require('stream');

module.exports = async (server) => {

    const { api, env, util } = server;
    const confdir = util.confdir();
    const mqtt = require("mqtt");
    const mcache = {};

    class MQTT {
        #timer;
        #client;
        #serial;
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

        constructor(host, code, serial, onready) {
            this.#options.host = host;
            this.#options.password = code;
            this.#serial = serial;
            let client = this.#client = mqtt.connect(this.#options);

            client.on("connect", () => {
                let report = this.#topic_report = `device/${serial}/report`;
                let request = this.#topic_request = `device/${serial}/request`;
                util.log({ report, request });
                client.subscribe(report, (err) => {
                    util.log('mqtt_subd', err);
                    onready(this);
                    this.#uptime();
                });
            });

            client.on("message", (topic, message) => {
                util.log('mqtt_recv', JSON.parse(message.toString()));
            });
        }

        #uptime() {
            clearTimeout(this.#timer);
            this.#timer = setTimeout(() => { this.end() }, 30000);
        }

        async send(msg) {
            if (this.#client) {
                util.log('mqtt_send', msg);
                this.#client.publish(this.#topic_request, JSON.stringify(msg));
                this.#uptime();
                return true;
            } else {
                return false;
            }
        }

        end() {
            if (this.#client) {
                util.log('mqtt end');
                this.#client.end();
                this.#client = undefined;
            }
            this.#topic_report = undefined;
            this.#topic_request = undefined;
            delete mcache[this.#serial];
        }
    }

    function get_mqtt(host, code, serial) {
        const fns = {};
        const promise = new Promise((resolve, reject) => {
            Object.assign(fns, { resolve, reject });
        });

        let mqtt = mcache[serial];
        if (mqtt) {
            return fns.resolve(mqtt);
        } else {
            mqtt = new MQTT(host, code, serial, obj => {
                mcache[serial] = obj;
                fns.resolve(obj);
            })
        }

        return promise;
    }

    async function ftp_send(args = {}) {
        const client = new Client();
        const port = parseInt(args.port || 990);
        const host = args.host || "localhost";
        const user = args.user || "bblp";
        const password = args.password || '';
        const filename = args.filename || "test.3mf";
        const data = args.data || undefined;
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
            const readableStream = new Readable();
            readableStream._read = () => {};
            readableStream.push(data);
            readableStream.push(null);
            await client.uploadFrom(readableStream, filename);
        } finally {
            client.close();
        }
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

    if (!(env.debug || env.electron)) {
        util.log('no valid context for bambu');
        return;
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
            const { host, password, filename, serial, ams } = query;
            const ams_mapping = ams ? ams.split(',').map(v => parseInt(v)) : undefined;
            const mqtt_conn = serial ? get_mqtt(host, password, serial) : undefined;
            ftp_send({ host, password, filename, data })
                .then(() => {
                    if (serial) {
                        const cmd = {
                            print: {
                                command: "project_file",
                                url: `file:///sdcard/${filename}`,
                                param: "Metadata/plate_1.gcode",
                                subtask_id: "0",
                                use_ams: ams_mapping ? true : false,
                                timelapse: false,
                                flow_cali: false,
                                bed_leveling: false,
                                layer_inspect: false,
                                vibration_cali: false
                            }
                        };
                        if (ams_mapping) {
                            cmd.print.ams_mapping = ams_mapping;
                        }
                        mqtt_conn
                            .then(mqtt => mqtt.send(cmd))
                            .catch(err => {
                                util.log({ mqtt_err: err });
                            });
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
        console.log('ws open', req.url);
        ws.on('message', msg => {
            msg = JSON.parse(msg);
            console.log(msg);
            switch (msg.cmd) {
                case "monitor":
                    get_mqtt(msg.host, msg.code, msg.serial).then(mqtt => {
                        console.log({ monitor: mqtt });
                    });
                    break;
            }
        });
        ws.on('close', () => {
            console.log('WS CLOSE');
        });
    });
};
