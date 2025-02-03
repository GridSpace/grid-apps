self.kiri.load(api => {

    if (api.electron || api.const.LOCAL) {
        console.log('BAMBU MODULE RUNNING');
    } else {
        return;
    }

    const { kiri, moto } = self;
    const { ui } = kiri;
    const h = moto.webui;
    const defams = ";; DEFINE BAMBU-AMS ";
    const readonly = true;

    let init = false;
    let status = {};
    let bound, device, printers, select, selected, conn_alert;
    let btn_del, in_host, in_code, in_serial, filelist;
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
                socket.ws = undefined;
            };
            ws.onmessage = msg => {
                let data = JSON.parse(msg.data);
                let { serial, message, files, deleted, error } = data;
                if (error) {
                    console.log({ serial, error });
                    api.alerts.show(`Bambu Error: ${error}`, 3);
                    // printer_status(`error: ${error}`);
                } else if (deleted) {
                    console.log('file deleted', deleted);
                    file_list();
                } else if (serial) {
                    let rec = status[serial] = deepMerge(status[serial] || {}, message);
                    if (files) {
                        rec.files = files;
                    }
                    if (selected?.rec.serial === serial) {
                        selected.status = rec;
                        printer_render(rec);
                    }
                } else {
                    console.log('ignored', serial, data);
                }
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

    function deepMerge(target, source) {
        // console.log({ target, source });
        if (!source) {
            return target;
        }
        const result = structuredClone(target);
        Object.keys(source).forEach((key) => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        });
        return result;
    }

    function deepSortObject(obj) {
        if (Array.isArray(obj)) {
            obj = obj.map(v => deepSortObject(v));
        } else if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          return Object.keys(obj)
            .sort()
            .reduce((sorted, key) => {
              sorted[key] = deepSortObject(obj[key]);
              return sorted;
            }, {});
        }
        return obj;
      }

    function printer_add() {
        ui.prompt('printer name', "new printer").then(name => printer_add_named(name));
    }

    function printer_add_named(name) {
        printers[name] = printers[name] || {
            host:'', code:'', serial:''
        };
        render_list();
        select.value = name;
        printer_select(name);
    }

    function printer_del() {
        if (!selected?.name) {
            return;
        }
        delete printers[selected.name];
        render_list();
        select.value = '';
        printer_select();
    }

    function printer_update() {
        Object.assign(selected.rec, {
            host: in_host.value,
            code: in_code.value,
            serial: in_serial.value,
            modified: true
        });
    }

    function printer_select(name = '') {
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
        printer_render();
        file_list();
        $('bbl_name').innerText = name;
    }

    function printer_render(rec = {}) {
        let { info, print, files } = rec;
        let {
            ams,
            ams_status,
            bed_target_temper,
            bed_temper,
            big_fan1_speed,
            big_fan2_speed,
            chamber_temper,
            cooling_fan_speed,
            fan_gear,
            gcode_file,
            gcode_state, // PREPARE, PAUSE, RUNNING, FAILED
            heatbreak_fan_speed,
            home_flag,
            layer_num,
            lights_report,
            mc_percent,
            mc_remaining_time,
            nozzle_diameter,
            nozzle_target_temper,
            nozzle_temper,
            print_error,
            print_type,
            sdcard,
            spd_lvl, // 1,2,3,4 (2 = default)
            total_layer_num,
            upload
        } = print || {};
        let state = (gcode_state || 'unknown').toLowerCase();
        $('bbl_noz').value = nozzle_diameter || '';
        $('bbl_noz_temp').value = nozzle_temper?.toFixed(1) ?? '';
        $('bbl_noz_target').value = nozzle_target_temper?.toFixed(1) ?? '';
        $('bbl_noz_on').checked = nozzle_target_temper > 0;
        $('bbl_bed_temp').value = bed_temper?.toFixed(1) ?? '';
        $('bbl_bed_target').value = bed_target_temper?.toFixed(1) ?? '';
        $('bbl_bed_on').checked = bed_target_temper > 0;
        $('bbl_pause').disabled = (gcode_state !== 'RUNNING');
        $('bbl_resume').disabled = (gcode_state !== 'PAUSE' || gcode_state === 'FAILED');
        $('bbl_fan_part').value = cooling_fan_speed || 0;
        $('bbl_fan_part_on').checked = cooling_fan_speed > 0 ? true : false;
        $('bbl_fan_1').value = big_fan1_speed || 0;
        $('bbl_fan_1_on').checked = big_fan1_speed > 0 ? true : false;
        $('bbl_fan_2').value = big_fan2_speed || 0;
        $('bbl_fan_2_on').checked = big_fan2_speed > 0 ? true : false;
        $('bbl_fan_heatbreak').value = heatbreak_fan_speed || 0;
        $('bbl_file_active').value = gcode_file || '';
        if (files && filelist.selectedIndex === -1) {
            h.bind(filelist, files.map(file => {
                let name = file.name
                    .toLowerCase()
                    .replace('.gcode','')
                    .replace('.3mf','');
                return h.option({
                    _: name,
                    style: "max-width: 20em"
                });
            }));
            filelist.selectedIndex = 0;
            filelist.onchange();
        }
        (lights_report || []).forEach(rec => {
            if (rec.node === 'chamber_light') {
                $('bbl_chamber_light').checked = (rec.mode === 'on');
            }
        });
        ui.setVisible($('bbl_ams'), ams?.version ? true : false);
        $('bbl_ams_spool').checked = ((home_flag ?? 0) & 0x400) ? true : false;
        $('bbl_step_recover').checked = ((home_flag ?? 0) & 0x10) ? true : false;
        // provide only the print info from the serial recorld
        $('bbl_rec').value = JSON.stringify(deepSortObject({
            ...rec.print
            // info: rec.info,
            // print: rec.print,
        }), undefined, 2);
        $('bbl_accel').selectedIndex = (spd_lvl ?? 2) - 1;
        if (print_error) {
            bbl_status.value = `print error ${print_error}`
        } else if (mc_remaining_time && gcode_state !== 'FAILED') {
            bbl_status.value = `layer ${layer_num} of ${total_layer_num} | ${mc_percent}% complete | ${mc_remaining_time} minutes left | ${state}`
        } else {
            bbl_status.value = `printer ${print_type || ""} | ${state}`;
        }
        if (gcode_state && conn_alert) {
            api.alerts.hide(conn_alert);
        }
    }

    function render_list(to) {
        let list = Object.keys(printers).map(name => {
            return selected?.name === name ?
                h.option({ _: name, value: name, selected: true }) :
                h.option({ _: name, value: name });
        });
        list = [
            h.option({ _: '', value: '' }),
            ...list
        ]
        h.bind(to || select, list);
    }

    function monitor_start(rec) {
        let { host, code, serial } = rec;
        if (!(host && code && serial)) {
            // monitor_stop();
        } else {
            socket.send({ cmd: "monitor", ...rec });
        }
    }

    function monitor_keepalive() {
        // console.log({ keepalive: selected });
        // if (monitoring()) {
        //     socket.send({ cmd: "keepalive", serial: selected.rec.serial });
        // }
        cmd_if("keepalive");
    }

    function monitor_stop() {
        socket.stop();
    }

    function monitoring() {
        let active = selected?.rec?.serial ? true : false;
        ui.setVisible($('bbl_connect'), !active && select.value !== '');
        return active;
    }

    function cmd_if(cmd, obj = {}) {
        if (monitoring()) {
            socket.send({ ...obj, cmd, serial: selected.rec.serial });
        }
    }

    function cmd_direct(obj = {}) {
        cmd_if("direct", { direct: obj });
    }

    function cmd_gcode(code) {
        cmd_direct({ print: {
            command: "gcode_line",
            param: `${code} \n`
        } });
    }

    function file_list() {
        if (selected?.rec?.host) {
            filelist.selectedIndex = -1;
            $('bbl_file_size').value =
            $('bbl_file_date').value = '';
            $('bbl_file_delete').disabled =
            $('bbl_file_print').disabled = true;
            socket.send({ cmd: "files", ...selected.rec });
        }
    }

    function file_delete(path) {
        if (selected?.rec?.host && path) {
            let { host, code } = selected.rec
            socket.send({ cmd: "file-delete", path, host, code });
        }
    }

    function file_print(path) {
        if (selected?.rec?.host && path) {
            let { host, code, serial } = selected.rec;
            socket.send({ cmd: "file-print", path, host, code, serial, amsmap });
        }
    }

    api.event.on("init-done", function() {
        console.log({ init_done: init });
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
            class: "mdialog f-col gap4"
        }, [
            h.div({ class: "f-row a-center gap4" }, [
                h.label({ class: "set-header dev-sel" }, [ h.a('bambu manager') ]),
                h.select({ id: "bbl_sel", class: "dev-list" }, []),
                h.button({ _: "connect", class: "hide", id: "bbl_connect", onclick() {
                    conn_alert = api.alerts.show(`connecting to ${select.value}`);
                    printer_select(select.value);
                } }),
                h.div({ class: "grow gap3 j-end" }, [
                    h.button({
                        id: "bbl_hide",
                        _: '<i class="fa-solid fa-eye"></i>',
                        class: "a-center",
                    onclick(ev) {
                        if (ev.target.hide === true) {
                            ev.target.hide = false;
                            $('bbl_code').type = 'text';
                            $('bbl_serial').type = 'text';
                            $('bbl_hide').innerHTML = '<i class="fa-solid fa-eye"></i>';
                        } else {
                            ev.target.hide = true;
                            $('bbl_code').type = 'password';
                            $('bbl_serial').type = 'password';
                            $('bbl_hide').innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
                        }
                    }}),
                    h.button({
                        _: 'new',
                        title: "add printer",
                        class: "grid",
                        onclick: printer_add
                    }),
                    h.button({
                        _: 'rename',
                        title: "rename printer",
                        class: "grid",
                        onclick: printer_add
                    }),
                    h.button({
                        _: 'delete',
                        id: 'bbl_pdel',
                        title: "remove printer",
                        class: "grid",
                        onclick: printer_del
                    })
                ])
            ]),
            h.div({ class: "set-sep "}),
            h.div({ class: "frow gap4" }, [
                h.div({ class: "f-col gap3" }, [
                    h.div({ class: "t-body t-inset f-col" }, [
                        h.label({ class: "set-header dev-sel" }, [
                            h.a({ _: 'printer', id: "bbl_name" })
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('host'),
                            h.input({ id: "bbl_host", size: 12 }),
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('code'),
                            h.input({ id: "bbl_code", size: 12 }),
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('serial'),
                            h.input({ id: "bbl_serial", size: 17, class: "font-smol" }),
                        ])
                    ]),
                    h.div({ class: "t-body t-inset f-col" }, [
                        h.label({ class: "set-header dev-sel" }, [
                            h.a('nozzle')
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('diameter'),
                            h.input({ id: "bbl_noz", size: 5, readonly })
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('temp'),
                            h.input({ id: "bbl_noz_temp", size: 5, readonly })
                        ]),
                        h.div({ class: "var-row", ondblclick() {
                            ui.prompt('new nozzle temp', $('bbl_noz_target').value).then(value => {
                                cmd_gcode(`M104 S${value}`);
                                api.alerts.show(`set nozzle temp ${value}`,2);
                            })
                        } }, [
                            h.label('target'),
                            h.input({ id: "bbl_noz_on", type: "checkbox", onclick() {
                                let value = $('bbl_noz_on').checked ? '220' : '0';
                                cmd_gcode(`M104 S${value}`)
                                api.alerts.show(`set nozzle temp ${value}`,2);
                            } }),
                            h.input({ id: "bbl_noz_target", size: 5, readonly })
                        ])
                    ]),
                    h.div({ class: "t-body t-inset f-col" }, [
                        h.label({ class: "set-header dev-sel" }, [
                            h.a('bed')
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('temp'),
                            h.input({ id: "bbl_bed_temp", size: 5, readonly })
                        ]),
                        h.div({ class: "var-row", ondblclick() {
                            ui.prompt('new bed temp', $('bbl_bed_target').value).then(value => {
                                cmd_gcode(`M140 S${value}`)
                                api.alerts.show(`set bed temp ${value}`,2);
                            })
                        } }, [
                            h.label('target'),
                            h.input({ id: "bbl_bed_on", type: "checkbox", onclick() {
                                let value = $('bbl_bed_on').checked ? '60' : '0';
                                cmd_gcode(`M140 S${value}`);
                                api.alerts.show(`set bed temp ${value}`,2);
                            } }),
                            h.input({ id: "bbl_bed_target", size: 5, readonly })
                        ])
                    ]),
                    h.div({ class: "t-body t-inset f-col" }, [
                        h.label({ class: "set-header dev-sel" }, [
                            h.a('chamber')
                        ]),
                        h.div({ class: "var-row", ondblclick() {
                            ui.prompt('new part fan value', $('bbl_fan_part').value).then(value => {
                                cmd_gcode(`M106 P1 S${value}`);
                                api.alerts.show(`set part fan ${value}`,2);
                            })
                        } }, [
                            h.label('part fan'),
                            h.input({ id: "bbl_fan_part_on", type: "checkbox", onclick() {
                                let value = $('bbl_fan_part_on').checked ? '255' : '0';
                                cmd_gcode(`M106 P1 S${value}`)
                                api.alerts.show(`set part fan ${value}`,2);
                            } }),
                            h.input({ id: "bbl_fan_part", size: 5, readonly })
                        ]),
                        h.div({ class: "var-row", ondblclick() {
                            ui.prompt('new aux fan value', $('bbl_fan_1').value).then(value => {
                                cmd_gcode(`M106 P2 S${value}`);
                                api.alerts.show(`set aux fan ${value}`,2);
                            })
                        } }, [
                            h.label('aux fan'),
                            h.input({ id: "bbl_fan_1_on", type: "checkbox", onclick() {
                                let value = $('bbl_fan_1_on').checked ? '255' : '0';
                                cmd_gcode(`M106 P2 S${value}`)
                                api.alerts.show(`set aux fan ${value}`,2);
                            } }),
                            h.input({ id: "bbl_fan_1", size: 5, readonly })
                        ]),
                        h.div({ class: "var-row", ondblclick() {
                            ui.prompt('new chamber fan value', $('bbl_fan_2').value).then(value => {
                                cmd_gcode(`M106 P3 S${value}`);
                                api.alerts.show(`set chamber fan ${value}`,2);
                            })
                        } }, [
                            h.label('chamber fan'),
                            h.input({ id: "bbl_fan_2_on", type: "checkbox", onclick() {
                                let value = $('bbl_fan_2_on').checked ? '255' : '0';
                                cmd_gcode(`M106 P3 S${value}`)
                                api.alerts.show(`set chamber fan ${value}`,2);
                            } }),
                            h.input({ id: "bbl_fan_2", size: 5, readonly })
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('heatbreak fan'),
                            h.input({ id: "bbl_fan_heatbreak", size: 5, readonly })
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('light'),
                            h.input({ id: "bbl_chamber_light", type: "checkbox", onclick() {
                                cmd_direct({
                                    system: {
                                        command: "ledctrl",
                                        led_node: "chamber_light",
                                        led_mode: $('bbl_chamber_light').checked ? "on" : "off"
                                    }
                                })
                                api.alerts.show(`set chamber light`,2);
                            } })
                        ]),
                    ])
                ]),
                h.div({ class: "f-col gap4 grow" }, [
                    h.textarea({
                        id: "bbl_rec",
                        style: "width: 100%; height: 100%; resize: none; box-sizing: border-box",
                        wrap: "off",
                        spellcheck: "false",
                        rows: 15, cols: 65
                    })
                ]),
                h.div({ class: "f-col gap3" }, [
                    h.div({ id: "bbl_ams", class: "hide t-body t-inset f-col gap3 pad4" }, [
                        h.label({ class: "set-header dev-sel" }, [
                            h.a('ams')
                        ]),
                        // { print: { auto_recovery: true, command: 'print_option', option: 1, reason: 'success', result: 'success', sequence_id: '20005' } }
                        h.div({ class: "var-row" }, [
                            // home_flag bit 11 (0x400)
                            h.label('auto spool advance'),
                            h.input({ id: "bbl_ams_spool", type: "checkbox", onclick() {
                                api.alerts.show(`changing auto spool`,2);
                                cmd_direct({
                                    print: {
                                        auto_switch_filament: $('bbl_ams_spool').checked,
                                        command: 'print_option',
                                        sequence_id: '123',
                                        option: $('bbl_ams_spool').checked ? 1 : 0
                                    }
                                })
                            } })
                        ]),
                    ]),
                    h.div({ class: "t-body t-inset f-col gap3 pad4 grow" }, [
                        h.label({ class: "set-header dev-sel" }, [
                            h.a('print options')
                        ]),
                        h.div({ class: "var-row" }, [
                            // home_flag bit 5 (0x10)
                            h.label('auto step recovery'),
                            h.input({ id: "bbl_step_recover", type: "checkbox", onclick() {
                                api.alerts.show(`changing step recovery`,2);
                                cmd_direct({
                                    print: {
                                        auto_recovery: $('bbl_step_recover').checked,
                                        command: 'print_option',
                                        sequence_id: '124',
                                        option: $('bbl_step_recover').checked ? 1 : 0
                                    }
                                })
                            } })
                        ]),

                        h.div({ class: "var-row" }, [
                            h.label('acceleration'),
                            h.select({ id: "bbl_accel", onchange() {
                                api.alerts.show(`changing acceleration`,2);
                                cmd_direct({ print: {
                                    command: 'print_speed',
                                    param: ($('bbl_accel').selectedIndex + 1).toString()
                                } })
                            } }, [
                                h.option({ _: "silent", value: 1 }),
                                h.option({ _: "normal", value: 2, selected: true }),
                                h.option({ _: "sport", value: 3 }),
                                h.option({ _: "insane", value: 4 }),
                            ])
                        ]),

                    ]),
                // ]),
                // h.div({ class: "f-col gap3" }, [
                    h.div({ class: "t-body t-inset f-col gap3 pad4 grow" }, [
                        h.div({ class: "set-header", onclick() {
                            file_list();
                        } }, h.a({ class: "flex f-row grow" }, [
                            h.label('file'),
                            h.span({ class: "fat5 grow" }),
                            h.i({ class: "fa-solid fa-rotate" })
                        ])),
                        h.select({ id: "bbl_files" }, []),
                        h.div({ class: "var-row" }, [
                            h.label('size'),
                            h.input({ id: "bbl_file_size", size: 12, readonly })
                        ]),
                        h.div({ class: "var-row" }, [
                            h.label('date'),
                            h.input({ id: "bbl_file_date", size: 12, readonly })
                        ]),
                        h.div({ class: "grow" }),
                        h.button({
                            _: 'delete',
                            id: "bbl_file_delete",
                            class: "f-col a-center t-center",
                            disabled: true,
                        onclick() {
                            console.log({ deleting: selected.file.path });
                            file_delete(selected.file.path);
                        }}),
                        h.button({
                            _: 'print',
                            id: "bbl_file_print",
                            class: "f-col a-center t-center",
                            disabled: true,
                        onclick() {
                            console.log({ printing: selected.file.path });
                            file_print(selected.file.path);
                        }}),
                    ]),
                    h.div({ class: "t-body t-inset f-col gap3 pad4" }, [
                        h.label({ class: "set-header dev-sel" }, [
                            h.a('active file')
                        ]),
                        h.div({ class: "var-row" }, [
                            h.input({ id: "bbl_file_active", class: "t-left", readonly })
                        ]),
                        h.div([
                            h.button({ _: "pause", id: "bbl_pause", class: "a-center", onclick() { cmd_if("pause") } }),
                            h.button({ _: "resume", id: "bbl_resume", class: "a-center", onclick() { cmd_if("resume") } }),
                            h.button({ _: "stop", class: "a-center", onclick() { cmd_if("cancel") } }),
                        ])
                    ])
                ])
            ]),
            h.div({ class: "set-sep "}),
            h.div({ class: "gap4" }, [
                h.label({ class: "set-header dev-sel" }, [ h.a('status') ]),
                h.input({ id: "bbl_status", class: "t-left mono grow" }),
            ])
        ]), { before: true });
        select = modal.bbl_sel;
        filelist = modal.bbl_files;
        btn_del = modal.bbl_pdel;
        in_host = modal.bbl_host;
        in_code = modal.bbl_code;
        in_serial = modal.bbl_serial;
        api.ui.modals['bambu'] = modal['mod-bambu'];
        btn_del.disabled = true;
        select.onchange = (ev => printer_select(select.value));
        filelist.onchange = (ev => {
            let file = selected.file = selected.status.files[filelist.selectedIndex];
            $('bbl_file_size').value = file.size;
            $('bbl_file_date').value = file.date;
            $('bbl_file_delete').disabled =
            $('bbl_file_print').disabled = false;
        });
    });

    api.event.on("modal.show", which => {
        if (which !== 'bambu' || !device) {
            return;
        }
        render_list();
        get_ams_map(api.conf.get());
    });

    api.event.on("modal.hide", which => {
        if (selected?.rec.modified) {
            api.conf.save();
        }
        selected = undefined;
        status = {};
    });

    api.event.on("device.selected", devsel => {
        if (!bound) {
            return;
        }
        if (devsel.extras?.bbl && !api.ui.deviceSave.disabled) {
            device = devsel;
            printers = devsel.extras.bbl;
            bound.bblman.classList.remove('hide');
        } else {
            device = undefined;
            printers = undefined;
            bound.bblman.classList.add('hide');
        }
    });

    function get_ams_map(settings) {
        const ams = settings.device?.gcodePre.filter(line => line.indexOf(defams) === 0)[0];
        if (ams) {
            try {
                amsmap = ams.substring(defams.length).trim().replaceAll(' ','');
            } catch (e) {
                console.log({ invalid_ams_map: ams });
            }
        }
    }

    function prep_export(gen3mf, gcode, info, settings) {
        if (!settings.device.extras?.bbl || api.ui.deviceSave.disabled) {
            $('bambu-output').style.display = 'none';
            return;
        }
        printers = settings.device.extras.bbl;
        let devlist = $('print-bambu-device');
        render_list(devlist);
        $('bambu-output').style.display = 'flex';
        $('print-bambu-1').onclick = function() {
            gen3mf(zip => send(`${$('print-filename').value}.3mf`, zip, false));
        }
        $('print-bambu-2').onclick = function() {
            gen3mf(zip => send(`${$('print-filename').value}.3mf`, zip, true));
            api.modal.show('bambu');
        }
        devlist.onchange = () => {
            let info = printers[devlist.value];
            console.log({ selected: devlist.value, info });
            host = info.host;
            serial = info.serial;
            password = info.code;
            $('print-bambu-1').disabled =
            $('print-bambu-2').disabled =
                (host && serial && password) ? false : true;
            get_ams_map(settings);
            console.log({ bambu: host, serial, amsmap });
        };
    }

    function send(filename, gcode, start) {
        const baseUrl = '/api/bambu_send';
        const url = new URL(baseUrl, window.location.origin);
        url.searchParams.append('host', host);
        url.searchParams.append('code', password);
        url.searchParams.append('filename', filename);
        url.searchParams.append('serial', serial);
        url.searchParams.append('ams', amsmap);
        url.searchParams.append('start', start ?? false);

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

    setInterval(monitor_keepalive, 5000);

    api.bambu = { send, prep_export };
});
