// provides a device export to local disk option
self.kiri.load(api => {
    api.event.on('load-done', () => {
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
});
