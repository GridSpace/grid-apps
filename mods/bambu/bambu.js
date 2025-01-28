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
    let bound, device, printers, select, selected;
    let btn_del, in_host, in_code, in_serial;
    let host, password, serial, amsmap, socket = {
        open: false,
        q: [],
        start() {
            if (socket.ws) {
                return;
            }
            let ws = socket.ws = new WebSocket("/bambu");
            ws.onopen = () => {
                socket.open = true;
                socket.drain();
            };
            ws.onclose = () => {
                socket.open = false;
            };
            ws.onmessage = msg => {
                console.log({ msg: msg.data });
            };
        },
        stop() {
            if (socket.ws) {
                socket.ws.close();
            }
        },
        drain() {
            while (socket.open && socket.q.length) {
                socket.ws.send(JSON.stringify(socket.q.shift()));
            }
        },
        send(msg) {
            socket.start();
            socket.q.push(msg);
            socket.drain();
        }
    };

    function printer_add() {
        let name = prompt('printer name');
        if (!name) {
            return;
        }
        printers[name] = printers[name] || {
            host:'', code:'', serial:''
        };
        render_list();
    }

    function printer_del() {
        if (!selected.name) {
            return;
        }
        delete printers[selected.name];
        printer_select();
        render_list();
    }

    function printer_update() {
        Object.assign(selected.rec, {
            host: in_host.value,
            code: in_code.value,
            serial: in_serial.value,
            modified: true
        });
    }

    function printer_select(name) {
        btn_del.disabled = false;
        let rec = printers[name] || {};
        selected = { name, rec };
        in_host.value = rec.host || '';
        in_code.value = rec.code || '';
        in_serial.value = rec.serial || '';
        in_host.onkeypress = in_host.onblur = printer_update;
        in_code.onkeypress = in_code.onblur = printer_update;
        in_serial.onkeypress = in_serial.onblur = printer_update;
        monitor_start(rec);
    }

    function render_list() {
        h.bind(select, Object.keys(printers).map(name => {
            return h.option({
                _: name,
                value: name,
                onclick() { printer_select(name) }
            })
        }));
    }

    function monitor_start(rec) {
        socket.send({ cmd: "monitor", ...rec });
    }

    function monitor_stop() {
        socket.stop();
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
                h.div({ class: "t-body t-inset fcol gap3 pad4" }, [
                    h.select({ id: "bbl_sel", style: "height: auto", size: 5 }, []),
                    h.div({ class: "grid gap3", style: "grid-template-columns: 1fr 1fr" }, [
                        h.button({
                            _: '+',
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
                h.div({ class: "grow fcol gap3" }, [
                    h.div({ class: "t-body t-inset frow gap4 pad4 a-center" }, [
                        h.label('host'),
                        h.input({ id: "bbl_host", size: 15, class: "t-left" }),
                        h.label('code'),
                        h.input({ id: "bbl_code", size: 10, class: "t-left" }),
                        h.label('sn#'),
                        h.input({ id: "bbl_serial", size: 20, class: "t-left" })
                    ]),
                    h.div({ class: "t-body t-inset frow gap4 pad4 grow" }, [

                    ])
                ])
            ])
        ]), { before: true });
        select = modal.bbl_sel;
        btn_del = modal.bbl_pdel;
        in_host = modal.bbl_host;
        in_code = modal.bbl_code;
        in_serial = modal.bbl_serial;
        api.ui.modals['bambu'] = modal['mod-bambu'];
        btn_del.disabled = true;
    });

    api.event.on("modal.show", which => {
        if (which !== 'bambu' || !device) {
            return;
        }
        render_list();
    });

    api.event.on("modal.hide", which => {
        if (selected?.rec.modified) {
            api.conf.save();
            selected = undefined;
        }
    });

    api.event.on("device.selected", devsel => {
        if (!bound) {
            return;
        }
        if (devsel.extras?.bbl) {
            device = devsel;
            printers = devsel.extras.bbl;
            bound.bblman.classList.remove('hide');
        } else {
            device = undefined;
            printers = undefined;
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
