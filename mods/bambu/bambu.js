self.kiri.load(api => {

    if (api.electron || api.const.LOCAL) {
        console.log('BAMBU MODULE RUNNING');
    } else {
        return;
    }

    const { kiri, moto } = self;
    const { ui } = api;
    const h = moto.webui;
    const defhost = ";; DEFINE BAMBU-HOST ";
    const defams = ";; DEFINE BAMBU-AMS ";

    let init = false;
    let bound, device, select;
    let btn = { add:0, del: 0 }
    let host, password, serial, amsmap;

    function printer_add() {
        console.log('printer add');
    }

    function printer_del() {
        console.log('printer del');
    }

    api.event.on("init-done", function() {
        if (init) {
            return;
        }
        init = true;
        bound = h.bind($('device-save'), h.button({
            _: 'Manage', id: "bblman", onclick() {
                api.modal.show('bambu');
            }
        }), { before: true });
        let modal = h.bind($('mod-help'), h.div({
            id: "mod-bambu",
            class: "mdialog fcol gap3"
        }, [
            h.button('bambu printer manager'),
            h.div({ class: "frow gap3" }, [
                h.div({ class: "t-body t-inset fcol gap3" }, [
                    h.select({ id: "bbl_sel", style: "height: auto", size: 5 }, []),
                    h.div({ class: "grid gap3", style: "grid-template-columns: 1fr 1fr" }, [
                        h.button({
                            _: '+',
                            id: 'bbl_padd',
                            title: "add printer",
                            class: "grid",
                            onclick: printer_add
                        }),
                        h.button({
                            _: '-',
                            id: 'bbl_pdel',
                            title: "remove printer",
                            class: "grid",
                            onclick: printer_del
                        })
                    ])
                ]),
                h.div({ class: "t-body t-inset grow" }, [

                ])
            ])
        ]), { before: true });
        btn.add = modal.bbl_padd;
        btn.del = modal.bbl_pdel;
        select = modal.bbl_sel;
        api.ui.modals['bambu'] = modal['mod-bambu'];
        select.onchange = (ev) => {
            console.log({ select_change: ev });
        };
    });

    api.event.on("modal.show", which => {
        if (which !== 'bambu' || !device) {
            return;
        }
    });

    api.event.on("device.selected", devsel => {
        if (!bound) {
            return;
        }
        if (devsel.extras?.bbl) {
            device = devsel;
            bound.bblman.classList.remove('hide');
        } else {
            device = undefined;
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
