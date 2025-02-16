/**
 * Utility to make a Bambu printer appear on the local subnet
 * so that the Bambu Network Plugin can find it. The intended
 * use case is where a printer is on another subnet but reachable
 * directly (routable) and Bambu Studio / Orca Slicer can't find
 * it because SSDP broadcasts do not cross subnets.
 * 
 * When this process is run from the command line, it should appear
 * under the slicer Devices tab when "+" is selected.
 */

let args = process.argv.slice(2);

if (args.length % 3 !== 0) {
    console.log([
        'usage: ssdp [name] [host] [serial-no]',
        'where:',
        '  name = name of printer to appear in slicer',
        '  host = host name or IP address of printer',
        '  serial = printer serial #'
    ].join('\n'));
    return process.exit(0);
}

const dgram = require("dgram");

// SSDP parameters
const SSDP_ADDRESS = "239.255.255.250";
const SSDP_PORT = 1900;

// Create a UDP socket
const socket = dgram.createSocket("udp4");

socket.on("error", error => console.log({ error }));

// Bind the socket and join the multicast group
socket.bind(1900, () => {
    socket.addMembership(SSDP_ADDRESS); // Join the SSDP multicast group
});

while (args.length) {
    const [name, host, serial] = args;
    args = args.slice(3);

    console.log([
        `Broadcasting Bambu Printer`,
        `Name: ${name}`,
        `Host: ${host}`,
        `Serial: ${serial}`,
    ].join('\n'));

    // SSDP discovery message
    const ssdpMessage = `
    NOTIFY * HTTP/1.1
    HOST: ${SSDP_ADDRESS}:${SSDP_PORT}
    Server: UPnP/1.0
    Location: ${host}
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
    DevCap.bambu.com: 1`
        .trim().split('\n').join("\r\n") + "\r\n\r\n";

    // Send the SSDP broadcast
    function send(socket, addr, port) {
        socket.send(
            ssdpMessage,
            0,
            ssdpMessage.length,
            port,
            addr,
            (err) => {
                if (err) {
                    console.error("Error sending SSDP broadcast:", err);
                } else {
                    // console.log(`>>>>>>>>>>>>>>>>> ${addr} : ${port}`);
                }
            }
        );
    }

    setInterval(() => send(socket, '239.255.255.250', 2021), 1000);
}
