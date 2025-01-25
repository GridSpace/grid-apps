const { Client } = require('basic-ftp');
const { Readable } = require('stream');

module.exports = async (server) => {

    const { api, env, util } = server;
    const confdir = util.confdir();

    let client, topic_report, topic_request, timer;

    const mqtt = require("mqtt");
    const mqtt_options = {
        protocol: 'mqtts',
        port: 8883,
        username: 'bblp',
        // ca: fs.readFileSync('ca.crt'),
        // key: fs.readFileSync('client.key'),
        // cert: fs.readFileSync('client.crt'),
        rejectUnauthorized: false
    };

    const mqtt_fn = {
        async send(msg) {
            if (client) {
                util.log('mqtt_send', msg);
                client.publish(topic_request, JSON.stringify(msg));
                clearTimeout(timer);
                timer = setTimeout(() => { mqtt_fn.end() }, 30000);
                return true;
            } else {
                return false;
            }
        },

        end() {
            if (client) {
                util.log('mqtt end');
                client.end();
                client = undefined;
            }
            topic_report = undefined;
            topic_request = undefined;
        }
    };

    function get_mqtt(serial) {
        const fns = {};
        const promise = new Promise((resolve, reject) => {
            Object.assign(fns, { resolve, reject });
        });

        if (client) {
            return mqtt_fn;
        }

        client = mqtt.connect(mqtt_options);

        client.on("connect", () => {
            topic_report = `device/${serial}/report`;
            topic_request = `device/${serial}/request`;
            util.log({ topic_report, topic_request });
            client.subscribe(topic_report, (err) => {
                util.log('mqtt_subscribed', err);
                fns.resolve(mqtt_fn);
            });
        });

        client.on("message", (topic, message) => {
            util.log('mqtt_recv', JSON.parse(message.toString()));
        });

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
            const mqtt_conn = serial ? get_mqtt(serial) : undefined;
            ftp_send({ host, password, filename, data })
                .then(() => {
                    if (serial) {
                        Object.assign(mqtt_options, { host, password });
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

};
