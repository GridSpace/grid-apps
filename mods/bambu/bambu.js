self.kiri.load(api => {

    if (api.electron || api.const.LOCAL) {
        console.log('BAMBU MODULE RUNNING');
    } else {
        return;
    }

    const { kiri, moto } = self;
    const { webui } = moto;
    const { ui } = api;
    const { local } = data;
    const defhost = ";; DEFINE BAMBU-HOST ";
    const defams = ";; DEFINE BAMBU-AMS ";

    let init = false;
    let bound, device;
    let host, password, serial, amsmap;

    api.event.on("init-done", function() {
        if (init) return;
        init = true;
        let btn = webui.button({ _: 'Manage', id: "bblman", onclick() { console.log('manage')} });
        bound = webui.bind($('device-save'), btn, { before: true });
    });

    api.event.on("device.selected", devsel => {
        device = devsel;
        if (!bound) {
            return;
        }
        if (device.extras?.bbl) {
            bound.bblman.classList.remove('hide');
        } else {
            bound.bblman.classList.add('hide');
        }
    });

    function sendok(params = {}) {
        host = password = serial = amsmap = undefined;
        const { settings } = params;
        const ams = settings.device?.gcodePre.filter(line => line.indexOf(defams) === 0)[0];
        if (ams) {
            try {
                amsmap = ams.substring(defams.length).trim().replaceAll(' ','');
            } catch (e) {
                console.log({ invalid_ams_map: ams });
            }
        }
        const feature = settings.device?.gcodePre.filter(line => line.indexOf(defhost) === 0)[0];
        if (feature) {
            [ host, password, serial ] = feature.substring(defhost.length).split(' ').map(v => v.trim());
            console.log('BAMBU', { host , password, serial });
            if (host && password) {
                return true;
            }
        }
        return false;
    }

    function send(filename, gcode) {
        const baseUrl = '/api/bambu_send';
        const url = new URL(baseUrl, window.location.origin);
        url.searchParams.append('host', host);
        url.searchParams.append('password', password);
        url.searchParams.append('filename', filename);
        url.searchParams.append('serial', serial);
        url.searchParams.append('ams', amsmap);

        const alert = api.alerts.show('Sending to Bambu Printer');

        fetch(url.toString(), {
            headers: { 'Content-Type': 'text/plain' },
            method: 'POST',
            body: gcode
        }).then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            api.alerts.hide(alert);
            return response.json();
        }).then(res => {
            console.log('Bambu Send', res);
            if (res.sent) {
                api.alerts.show('File Sent', 3);
            } else {
                api.alerts.show('File Send Error', 3);
            }
        }).catch(error => {
            console.error('Bambu Send Error', error);
            api.alerts.show('File Send Error', 3);
        });
    };

    api.bambu = { send, sendok, amsmap };
});
