const [ host, pass, sn ] = process.argv.slice(2);
const util = require('util');
const mqtt = require("mqtt");
const readline = require('readline');
const reportTopic = `device/${sn}/report`;
const requestTopic = `device/${sn}/request`;

console.log({ host, pass, sn, reportTopic, requestTopic });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
});

function erasePrompt() {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
}

let amsmap = [];

rl.prompt();

rl.on('line', (line) => {
    line = line.trim();
    switch (line) {
        case 'quit':
        case 'exit':
            log('Exiting...');
            rl.close();
            break;
        default:
            if (line.startsWith('M') || line.startsWith('G') || line.startsWith('T')) {
                line = line.split(';').map(l => l.trim()).join('\n');
                sendGcode(line);
            } else if (line.startsWith('ams ')) {
                amsmap = JSON.parse(line.substring(4));
                log({ amsmap });
            } else if (line.startsWith('print ')) {
                printStart(line.slice(6));
            } else if (line === 'stop') {
                printStop();
            } else if (line === 'pause') {
                printPause();
            } else if (line === 'resume') {
                printResume();
            } else if (line.startsWith('{')) {
                let cmd = eval('(' + line + ')');
                log('sending', cmd);
                sendRequest(cmd);
            } else if (line) {
                log('invalid command:', line);
            }
            rl.prompt();
            break;
    }
}).on('close', () => {
    process.exit(0);
});

const options = {
    protocol: 'mqtts',
    host: host,
    port: 8883,
    username: 'bblp',
    password: pass,
    // ca: fs.readFileSync('ca.crt'),
    // cert: fs.readFileSync('client.crt'),
    // key: fs.readFileSync('client.key'),
    rejectUnauthorized: false
};

function log() {
    erasePrompt();
    console.log(
        [...arguments]
            .map(v => util.inspect(v, {
                maxArrayLength: null,
                breakLength: this.break,
                colors: true,
                compact: true,
                sorted: true,
                depth: Infinity
            }))
            .join(this.join)
    );
    rl.prompt(true);
}

function sendRequest(obj) {
    client.publish(requestTopic, JSON.stringify(obj));
}

function sendGcode(gcode) {
    sendRequest({
        print: {
            command: "gcode_line",
            param: gcode,
            sequence_id: "0"
        }
    });
}

function printStart(file) {
    log('print', { file });
    sendRequest({
        print: {
            command: "project_file",
            sequence_id: "0",
            url: `file:///sdcard/${file}`,
            param: "Metadata/plate_1.gcode",
            subtask_id: "0",
            use_ams: amsmap.length ? true : false,
            timelapse: false,
            flow_cali: false,
            bed_leveling: false,
            layer_inspect: false,
            vibration_cali: false,
            ams_mapping: amsmap || []
        }
    });
}

function printStop() {
    sendRequest({
        print: {
            command: "stop",
            sequence_id: "0"
        }
    });
}

function printPause() {
    sendRequest({
        print: {
            command: "pause",
            sequence_id: "0"
        }
    });
}

function printResume() {
    sendRequest({
        print: {
            command: "resume",
            sequence_id: "0"
        }
    });
}

const client = mqtt.connect(options);

client.on("connect", () => {
    log("mqtt connected");
    client.subscribe(reportTopic, (err) => {
        if (err) {
            log('mqtt subscribe error', err);
        } else {
            log('mqtt subscribed');
        }
    });
});

client.on("message", (topic, message) => {
    log(JSON.parse(message.toString()));
});

client.on("close", () => {
    log("mqtt disconnect");
    process.exit();
});

process.on('SIGINT', () => {
    log('SIGINT. Running cleanup...');
    client.end();
    process.exit(0);
});
