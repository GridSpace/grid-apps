/**
 * Utility to proxy local MQTT requests to a remote Bambu printer
 * and intercept / display communications.
 * 
 * Bambu's network plugin will not connect to this process unless
 * you use the private key and certs extracted from Bambu Connect
 * following the instructions here:
 * 
 * https://wiki.rossmanngroup.com/wiki/Reverse_engineering_Bambu_Connect
 * 
 * The private key is clearly delineated. Put the contents into the
 * server-key.pem file. But you need to concatenate all of the certs
 * after the private key into the server-cert.pem
 */

let util = require('util');
let args = process.argv.slice(2);

if (args.length !== 5) {
    console.log([
        'usage: proxy [local] [name] [host] [code] [serial-no]',
        'where:',
        '  local  = local ip to broadcast (this host)',
        '  name   = name of printer to appear in slicer',
        '  host   = host name or IP address of proxied printer',
        '  code   = LAN mode code of proxied printer',
        '  serial = proxied printer serial #'
    ].join('\n'));
    return process.exit(0);
}

function log() {
    console.log(
        new Date().toISOString().replace(/[T.]/g, ' ').split(' ').slice(1,2).join(' '),
        [...arguments]
            .map(v => util.inspect(v, {
                maxArrayLength: null,
                breakLength: this.break,
                colors: true,
                compact: true,
                depth: Infinity
            }))
            .join(' ')
    );
}

const dgram = require("dgram");
const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;
const socket = dgram.createSocket("udp4");

socket.on("error", error => log({ error }));
socket.bind(1900, () => {
    socket.addMembership(SSDP_ADDRESS);
});

const [local, name, host, code, serial] = args;

console.log([
    `Broadcasting Bambu Printer Proxy`,
    `Name: ${name}`,
    `Host: ${host}`,
    `Serial: ${serial}`,
].join('\n'));

const ssdpMessage = `
NOTIFY * HTTP/1.1
HOST: ${SSDP_ADDRESS}:${SSDP_PORT}
Server: UPnP/1.0
Location: ${local}
NT: urn:bambulab-com:device:3dprinter:1
USN: ${serial}
Cache-Control: max-age=1800
DevModel.bambu.com: C11
DevName.bambu.com: ${name}
DevSignal.bambu.com: -66
DevConnect.bambu.com: lan
DevBind.bambu.com: free
Devseclink.bambu.com: secure
DevVersion.bambu.com: 01.07.00.00
DevCap.bambu.com: 1`.trim().split('\n').join("\r\n") + "\r\n\r\n";

console.log({ ssdpMessage });

// start broadcaster
setInterval(() => {
    socket.send(
        ssdpMessage, 0,
        ssdpMessage.length, 2021,
        SSDP_ADDRESS,
        (err, data) => err && console.error("SSDP broadcast error:", err, data)
    );
}, 1000);

// const { execSync } = require('child_process');
const aedes = require('aedes')();
const tls = require('tls');
const fs = require('fs');
const mqtt = require('mqtt');
const path = require('path');

const CERT_DIR = './certs';
const CERT_KEY_PATH = path.join(CERT_DIR, 'server-key.pem');
const CERT_PATH = path.join(CERT_DIR, 'server-cert.pem');
const CA_CERT_PATH = path.join(CERT_DIR, 'ca-cert.pem');

if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR);
}

// Generate self-signed certificate if it does not exist (local cli testing only)
// if (!fs.existsSync(CERT_KEY_PATH) || !fs.existsSync(CERT_PATH)) {
//     console.log('Generating self-signed certificate...');
//     execSync(`openssl req -x509 -newkey rsa:4096 -keyout ${CERT_KEY_PATH} -out ${CERT_PATH} -days 365 -nodes -subj "/CN=localhost"`);
// }
if (!fs.existsSync(CERT_KEY_PATH) || !fs.existsSync(CERT_PATH)) {
    console.log('missing required key and cert');
    return;
}

const options = {
    key: fs.readFileSync(CERT_KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
    ca: fs.existsSync(CA_CERT_PATH) ? fs.readFileSync(CA_CERT_PATH) : undefined
};

const remoteMqttOptions = {
    host,
    port: 8883,
    username: 'bblp',
    password: code,
    protocol: 'mqtts',
    rejectUnauthorized: false
};

// Start local MQTTS broker
const server = tls.createServer(options, (socket) => {
    log(`MQTTS server connection`, socket.remoteAddress, socket.remotePort);
    aedes.handle(socket);
});

server.listen(8883, () => {
    log('MQTTS server running on port 8883');
});

// Connect to remote MQTTS broker
const remoteClient = mqtt.connect(remoteMqttOptions);

remoteClient.on('connect', () => {
    log('Connected to remote MQTTS broker');
});

aedes.preConnect = (client, packet, callback) => {
    let { id, version } = client;
    let { cmd, username, password, clientId, protocolId } = packet;
    log(`mqtts preconnect`, {
        id,
        version,
        cmd,
        username,
        password: password ? password.toString() : undefined,
        clientId,
        protocolId
    });
    callback(null, true);
};

aedes.authenticate = (client, username, password, callback) => {
    log(`mqtts auth`, { username, password: password.toString() });
    const isValid = true;
    callback(null, isValid);
};

// Proxy messages to remote broker
aedes.on('publish', (packet, client) => {
    if (client && packet.topic !== 'aedes/keepalive') {
        remoteClient.publish(packet.topic, packet.payload, { qos: packet.qos, retain: packet.retain });
        try {
            let { topic, payload } = packet;
            let json = JSON.parse(payload.toString().replace('\x00',''));
            log('send', topic, json);
        } catch (err) {
            log({ err, packet, payload: packet.payload.toString() });
        }
    }
});

// Subscribe to remote messages and forward to local clients
remoteClient.on('message', (topic, payload) => {
    aedes.publish({ topic, payload });
    try {
        let json = JSON.parse(payload.toString());
        log('recv', topic, json);
    } catch (err) {
        log({ topic, payload: payload.toString() });
    }
});

// Sync subscriptions
aedes.on('subscribe', (subscriptions, client) => {
    subscriptions.forEach(sub => {
        log({ subscribe: sub.topic });
        remoteClient.subscribe(sub.topic);
    });
});

aedes.on('unsubscribe', (subscriptions, client) => {
    subscriptions.forEach(sub => {
        log({ unsubscribe: sub.topic });
        remoteClient.unsubscribe(sub);
    });
});

// pipe the camera feed, too
const camera = tls.createServer(options, (clientSocket) => {
    log('Camera Connected', { address: clientSocket.remoteAddress });

    const hexer = require('hexer');

    const remoteSocket = tls.connect({
        host,
        port: 6000,
        rejectUnauthorized: false
    }, () => {
        // clientSocket.pipe(remoteSocket).pipe(clientSocket);
    });

    clientSocket.on('data', (data) => {
        remoteSocket.write(data);
        // console.log({ client: data, type: typeof data });
        // console.log('-- cam client --', data.length);
        // console.log(hexer(data));
    });

    remoteSocket.on('data', (data) => {
        clientSocket.write(data);
        // console.log({ remote: data, type: typeof data });
        // console.log('-- cam remote --', data.length);
        // console.log(hexer(data));
    });

    clientSocket.on('close', () => {
        remoteSocket.end();
    });

    remoteSocket.on('error', (err) => {
        console.error('Remote connection error:', err.message);
        clientSocket.destroy();
    });

    clientSocket.on('error', (err) => {
        console.error('Client connection error:', err.message);
        remoteSocket.destroy();
    });
});

camera.listen(6000, () => {
    console.log(`TLS Proxy Server listening on port 6000`);
});
