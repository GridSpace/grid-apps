// provides a device export to local disk option
self.kiri.load(api => {
    api.event.on('load-done', () => {
        let devwarn = api.sdb.kiri_dev;
        if (location.host === 'dev.grid.space' && devwarn !== api.version) {
            api.alerts.show('this is a development server', 10);
            api.alerts.show('use <a href="https://grid.space/kiri">grid.space</a> for production', 10);
            api.sdb.kiri_dev = api.version;
        }
        let deviceExport = api.device.export;
        api.device.export = (exp, name, opt = {}) => {
            const { event, record } = opt;
            if (event && event.shiftKey) {
                const { code, process, profiles } = record;
                fetch("/api/postDevice", {
                    method: "POST",
                    body: JSON.stringify({ device: code, process, profiles })
                })
                .then(r => r.text())
                .then(t => {
                    console.log({server_said: t});
                    api.show.alert('profile saved to server');
                });
            } else {
                deviceExport(exp, name);
            }
        };
    });
}, 'Developer');
