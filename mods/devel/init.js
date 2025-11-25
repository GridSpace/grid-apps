// back end for device export in dev mode
module.exports = function(server) {
    server.inject("kiri", "kiri.js");
    if (!server.env.debug) {
        return;
    }
    const fs = require('fs');
    server.api.postDevice = (req, res, next) => {
        server.handler.decodePost(req, res, () => {
            // console.log({decodePost: req.app.post});
            const { device, process, profiles } = JSON.parse(req.app.post);
            if (profiles) {
                device.profiles = Object.entries(profiles).filter(v => v[0] !== 'default').map(v => v[1]);
            } else {
                device.profiles = [ process ];
            }
            const { mode } = device;
            const { deviceName } = device;
            const path = `${server.const.rootdir}/src/kiri-dev/${mode.toLowerCase()}/${deviceName.replace(/\ /g,'.')}`;
            // console.log({ mode, device, process, path });
            fs.writeFileSync(path, JSON.stringify(device, undefined, 4));
            res.end('profile saved');
        });
    };
};
