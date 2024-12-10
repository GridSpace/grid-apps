/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: data.local
// dep: kiri.consts
// dep: kiri.api
// dep: kiri.main
gapp.register("kiri.export", [], (root, exports) => {

const { base, data, kiri } = root;
const { api, consts } = kiri;
const { local } = data;
const { util } = base;
const { stats, ui } = api;
const { MODES } = consts;

kiri.export = exportFile;

let printSeq = parseInt(local['kiri-print-seq'] || local['print-seq'] || "0") + 1;

function localGet(key) {
    return api.local.get(key);
}

function localSet(key, val) {
    return api.local.set(key, val);
}

function exportFile(options) {
    let mode = api.mode.get();
    let names = api.widgets.all().map(w => w.meta ? w.meta.file : undefined)
        .filter(v => v)
        .map(v => v.replace(/ /g,'-'))
        .map(v => v.substring(0,20))
        .map(v => v.split('.')[0]);
    api.event.emit('export', mode);
    switch (mode) {
        case 'WEDM':
        case 'WJET':
        case 'DRAG':
        case 'LASER': return callExportLaser(options, names);
        case 'FDM': return callExport(options, mode, names);
        case 'CAM': return callExport(options, mode, names);
        case 'SLA': return callExportSLA(options, names);
    }
}

function callExport(callback, mode, names) {
    let alert = api.feature.work_alerts ? api.show.alert("Exporting") : null;
    let gcode = [];
    let section = [];
    let sections = { };
    kiri.client.export(api.conf.get(), (line) => {
        if (typeof line !== 'string') {
            if (line.section) {
                sections[line.section] = section = [];
            }
            return;
        }
        gcode.push(line);
        section.push(line);
    }, (output, error) => {
        api.hide.alert(alert);
        if (error) {
            api.show.alert(error, 5);
        } else if (callback) {
            callback(gcode.join('\r\n'), output);
        } else {
            exportGCodeDialog(gcode, mode === 'CAM' ? sections : undefined, output, names);
        }
    });
}

function callExportLaser(options, names) {
    kiri.client.export(api.conf.get(), (line) => {
        console.log({unexpected_line: line});
    }, (output, error) => {
        if (error) {
            api.show.alert(error, 5);
        } else {
            exportLaserDialog(output, names);
        }
    });
}

function callExportSLA(options, names) {
    kiri.client.export(api.conf.get(), (line) => {
        api.show.progress(line.progress, "exporting");
    }, (output, error) => {
        api.show.progress(0);
        if (error) {
            api.show.alert(error, 5);
        } else {
            kiri.driver.SLA.printDownload(output, api, names);
        }
    });
}

function exportLaserDialog(data, names) {
    localSet('kiri-print-seq', printSeq++);

    const fileroot = names[0] || "laser";
    const filename = `${fileroot}-${(printSeq.toString().padStart(3,"0"))}`;
    const settings = api.conf.get();
    const driver = kiri.driver.LASER;

    function download_svg() {
        api.util.download(
            driver.exportSVG(settings, data),
            $('print-filename-laser').value + ".svg"
        );
    }

    function download_dxf() {
        api.util.download(
            driver.exportDXF(settings, data),
            $('print-filename-laser').value + ".dxf"
        );
    }

    function download_gcode() {
        api.util.download(
            driver.exportGCode(settings, data),
            $('print-filename-laser').value + ".gcode"
        );
    }

    api.modal.show('xlaser');

    let segments = 0;
    data.forEach(layer => { segments += layer.length });

    $('print-filename-laser').value = filename;
    $('print-lines').value = util.comma(segments);
    $('print-svg').onclick = download_svg;
    $('print-dxf').onclick = download_dxf;
    $('print-lg').onclick = download_gcode;

    console.log('laser export', { fileroot, filename });
}

function bindField(field, varname) {
    $(field).onblur = function() {
        console.log('save', field, 'to', varname);
        localSet(varname, $(field).value.trim());
    };
}

function exportGCodeDialog(gcode, sections, info, names) {
    localSet('kiri-print-seq', printSeq++);

    let settings = api.conf.get(),
        MODE = api.mode.get_id(),
        name = names[0] || (MODE === MODES.CAM ? "cnc" : "print"),
        pre = `${name}-${(printSeq.toString().padStart(3,"0"))}`,
        filename = pre,// + (new Date().getTime().toString(36)),
        fileext = settings.device.gcodeFExt || "gcode",
        codeproc = settings.device.gcodeProc,
        octo_host,
        octo_apik,
        grid_host,
        grid_apik,
        grid_target,
        grid_targets = {},
        grid_local,
        grid_uuid;

    // join gcode array into a string
    gcode = gcode.join('\r\n') + '\r\n';

    // run gcode post processor function (when supplied and valid)
    if (codeproc && self[codeproc]) {
        gcode = self[codeproc](gcode);
    }

    function getBlob() {
        return new Blob(
            [gcode],
            {type:"application/octet-stream"});
    }

    function sendto_octoprint() {
        if (!(octo_host && octo_apik)) return;

        let form = new FormData(),
            ajax = new XMLHttpRequest(),
            host = octo_host.value.toLowerCase(),
            apik = octo_apik.value;

        if (host.indexOf("http") !== 0) {
            api.show.alert("host missing protocol (http:// or https://)");
            return;
        }
        if (api.const.SECURE && !api.util.isSecure(host)) {
            api.show.alert("host must begin with 'https' on a secure site");
            return;
        }

        localSet('octo-host', host.trim());
        localSet('octo-apik', apik.trim());

        filename = $('print-filename').value;
        form.append("file", getBlob(), filename+"."+fileext);
        ajax.onreadystatechange = function() {
            if (ajax.readyState === 4) {
                let status = ajax.status;
                stats.add(`ua_${api.mode.get_lower()}_print_octo_${status}`);
                if (status >= 200 && status < 300) {
                    api.modal.hide();
                } else {
                    api.show.alert("octoprint error\nstatus: "+status+"\nmessage: "+ajax.responseText);
                }
                api.show.progress(0);
            }
            api.show.progress(0);
        };
        ajax.upload.addEventListener('progress', function(evt) {
            api.show.progress(evt.loaded/evt.total, "sending");
        });
        ajax.open("POST", host+"/api/files/local");
        if (apik) {
            ajax.setRequestHeader("X-Api-Key", apik);
        }
        ajax.send(form);
    }

    function gridhost_tracker(host,key) {
        ajax(host+"/api/check?key="+key, function(data) {
            data = js2o(data);
            console.log(data);
            if (!(data.done || data.error)) {
                setTimeout(function() { gridhost_tracker(host,key) }, 1000);
            }
        });
    }

    function gridlocal_probe(ev, devs) {
        if (ev && ev.code !== 'Enter') return;

        if (!devs && api.probe.local(gridlocal_probe)) return;

        grid_local = devs;

        let gdev = localGet('grid-local');
        let gloc = $('grid-local');
        let html = [];
        for (let uuid in devs) {
            gdev = gdev || uuid;
            let dev = devs[uuid];
            let sel = uuid === gdev ? ' selected' : '';
            html.push(`<option id="gl-${uuid}" value="${uuid}" ${sel}>${dev.stat.device.name}</option>`);
        }

        if (html.length) {
            gloc.innerHTML = html.join('\n');
            gloc.onchange = (ev) => {
                localSet('grid-local', gloc.options[gloc.selectedIndex].value);
            };
            $('send-to-gridhead').style.display = 'flex';
            $('send-to-gridspool').style.display = 'flex';
        } else {
            $('send-to-gridhead').style.display = '';
            $('send-to-gridspool').style.display = '';
        }
    }

    function sendto_gridlocal() {
        let uuid = $('grid-local').value;
        let dev = grid_local[uuid];
        if (dev) {
            let file = $('print-filename').value;
            fetch(
                `${api.probe.live}/api/grid_send?uuid=${uuid}&file=${encodeURIComponent(file + "." + fileext)}`,
                {method: "POST", body: gcode}
            )
            .then(t => t.text())
            .then(t => {
                stats.add(`ua_${api.mode.get_lower()}_print_local_ok`);
                console.log({grid_spool_said: t});
            })
            .catch(e => {
                stats.add(`ua_${api.mode.get_lower()}_print_local_err`);
                console.log({grid_local_spool_error: e});
            })
            .finally(() => {
                api.modal.hide();
            });
        }
    }

    function admin_gridlocal() {
        let dev = grid_local[$('grid-local').value];
        if (dev && dev.stat && dev.stat.device) {
            let dsd = dev.stat.device;
            window.open(`http://${dsd.addr[0]}:${dsd.port || 4080}`, "_grid_admin");
        }
    }

    function gridhost_probe(ev, set_host) {
        if (ev && ev.code !== 'Enter') return;
        if (!(grid_host && grid_apik)) return;

        if (set_host) grid_host.value = set_host;

        let xhtr = new XMLHttpRequest(),
            host = grid_host.value,
            apik = grid_apik.value,
            target = grid_target.value;

        if (!apik) $('gpapik').style.display = 'none';

        if (!host && api.probe.grid(gridhost_probe)) return;

        if (!host) return;

        xhtr.onreadystatechange = function() {
            if (xhtr.readyState === 4) {
                if (xhtr.status >= 200 && xhtr.status < 300) {
                    localSet('grid-host', host);
                    localSet('grid-apik', apik);
                    let res = JSON.parse(xhtr.responseText);
                    let sel = false;
                    let match = false;
                    let first = null;
                    let html = [];
                    grid_targets = {};
                    for (let key in res) {
                        first = first || key;
                        if (!localGet('grid-target')) {
                            localSet('grid-target', key);
                            sel = true;
                        } else {
                            sel = localGet('grid-target') === key;
                        }
                        match = match || sel;
                        grid_targets[html.length] = key;
                        html.push(
                            "<option id='gpo-'" + key + " value='" +key + "'" +
                            (sel ? " selected" : "") +
                            ">" +
                            (res[key].comment || key) +
                            "</option>"
                        );
                    }
                    if (!match) {
                        localSet('grid-target', first);
                    }
                    grid_target.innerHTML = html.join('\n');
                } else if (xhtr.status === 401) {
                    $('gpapik').style.display = '';
                } else {
                    local.removeItem('grid-host');
                    local.removeItem('grid-apik');
                    console.log("invalid grid:host url");
                }
            }
        };

        xhtr.open("GET", host + "/api/active?key=" + apik);
        xhtr.send();
    }

    function sendto_gridhost() {
        if (!(grid_host && grid_apik)) return;

        let xhtr = new XMLHttpRequest(),
            host = grid_host.value,
            apik = grid_apik.value,
            target = localGet('grid-target') || '';

        if (target === '') {
            api.show.alert('invalid or missing target');
            return;
        }
        if (host.indexOf("http") !== 0) {
            api.show.alert("host missing protocol (http:// or https://)");
            return;
        }
        if (host.indexOf("://") < 0) {
            api.show.alert("host:port malformed");
            return;
        }
        if (api.const.SECURE && !api.util.isSecure(host)) {
            api.show.alert("host must begin with 'https' on a secure site");
            return;
        }

        localSet('grid-host', host.trim());
        localSet('grid-apik', apik.trim());

        xhtr.onreadystatechange = function() {
            if (xhtr.readyState === 4) {
                let status = xhtr.status;
                stats.add(`ua_${api.mode.get_lower()}_print_grid_${status}`);
                if (status >= 200 && status < 300) {
                    let json = js2o(xhtr.responseText);
                    gridhost_tracker(host,json.key);
                    api.ajax(host+"/api/wait?key="+json.key, function(data) {
                        data = js2o(data);
                        console.log(data);
                        api.show.alert("print to "+target+": "+data.status, 600);
                    });
                } else {
                    api.show.alert("grid:host error\nstatus: "+status+"\nmessage: "+xhtr.responseText, 10000);
                }
                api.show.progress(0);
            }
        };
        xhtr.upload.addEventListener('progress', function(evt) {
            api.show.progress(evt.loaded/evt.total, "sending");
        });
        filename = $('print-filename').value;
        xhtr.open("POST",
            host + "/api/print?" +
            "filename=" + filename +
            "&target=" + target +
            "&key=" + apik +
            "&time=" + Math.round(info.time) +
            "&length=" + Math.round(info.distance) +
            "&image=" + filename
        );
        xhtr.setRequestHeader("Content-Type", "text/plain");
        let snapshot = api.view.snapshot;
        xhtr.send(snapshot ? [gcode,snapshot].join("\0") : gcode);
        api.modal.hide();
    }

    function download() {
        filename = $('print-filename').value;
        api.util.download(gcode, filename + "." + fileext);
        // saveAs(getBlob(), filename + "." + fileext);
    }

    function pad(v) {
        v = v.toString();
        return v.length < 2 ? '0' + v : v;
    }

    function calcWeight() {
        try {
        let density = $('print-density');
        $('print-weight').value = (
            (Math.PI * util.sqr(
                info.settings.device.extruders[0].extFilament / 2
            )) *
            info.distance *
            (parseFloat(density.value) || 1.25) /
            1000
        ).toFixed(2);
        density.onkeyup = (ev) => {
            if (ev.key === 'Enter') calcWeight();
        };
        } catch (e) { }
    }

    function calcTime() {
        let floor = Math.floor,
            time = floor(info.time),
            hours = floor(time / 3600),
            newtime = time - hours * 3600,
            mins = floor(newtime / 60),
            secs = newtime - mins * 60;

        $('output-time').value = [pad(hours),pad(mins),pad(secs)].join(':');
    }

    api.modal.show('xany');
        let set = api.conf.get();
        let fdm = MODE === MODES.FDM;
        let octo = set.controller.exportOcto && MODE !== MODES.CAM;
        let ghost = set.controller.exportGhost;
        let local = set.controller.exportLocal;
        let preview = set.controller.exportPreview;
        $('code-preview-head').style.display = preview ? '' : 'none';
        $('code-preview').style.display = preview ? '' : 'none';
        $('print-download').onclick = download;
        $('print-filament-head').style.display = fdm ? '' : 'none';
        $('print-filament-info').style.display = fdm ? '' : 'none';
        $('print-filename').value = filename;
        $('print-filesize').value = util.comma(info.bytes);
        $('print-filament').value = Math.round(info.distance);
        calcTime();
        if (fdm) {
            calcWeight();
        }

        // persist fields when changed
        bindField('octo-host', 'octo-host');
        bindField('octo-apik', 'octo-apik');
        bindField('grid-host', 'grid-host');
        bindField('grid-apik', 'grid-apik');

        // in cam mode, show zip file option
        let downloadZip = $('print-zip');
        downloadZip.style.display = sections ? 'flex' : 'none';
        downloadZip.onclick = function() {
            let files = [];
            for (let [ name, data ] of Object.entries(sections)) {
                if (name.indexOf('op-') === 0) {
                    let head = sections.header || [];
                    let foot = sections.footer || [];
                    files.push({
                        name: `${name}.${fileext}`,
                        data: [ ...head, ...data, ...foot ].join('\r\n')
                    })
                }
            }
            kiri.client.zip(files, progress => {
                api.show.progress(progress.percent/100, "generating zip files");
            }, output => {
                api.show.progress(0);
                api.util.download(output, `${$('print-filename').value}.zip`);
            })
        };

        // in fdm mode, show 3mf file option
        let nozzle0 = set.device?.extruders?.[0]?.extNozzle || 0.4;
        let download3MF = $('print-3mf');
        download3MF.style.display = fdm ? 'flex' : 'none';
        download3MF.onclick = function() {
            let files = [{
                name: `[Content_Types].xml`,
                data: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
                    ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
                    ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
                    ' <Default Extension="gcode" ContentType="application/octet-stream"/>',
                    '</Types>'
                ].join('\n')
            },{
                name: `_rels/.rels`,
                data: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                    ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
                    '</Relationships>'
                ].join('\n')
            },{
                name: `3D/3dmodel.model`,
                data: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">',
                    ' <metadata name="Application">Kiri:Moto</metadata>',
                    ' <metadata name="Copyright"></metadata>',
                    ' <metadata name="CreationDate">2024-12-06</metadata>',
                    ' <metadata name="Description"></metadata>',
                    ' <metadata name="Designer"></metadata>',
                    ' <metadata name="DesignerCover"></metadata>',
                    ' <metadata name="License"></metadata>',
                    ' <metadata name="ModificationDate">2024-12-06</metadata>',
                    ' <metadata name="Origin"></metadata>',
                    ' <metadata name="Title"></metadata>',
                    ' <resources>',
                    ' </resources>',
                    ' <build/>',
                    '</model>'
                ].join('\n')
            },{
                name: `Metadata/_rels/model_settings.config.rels`,
                data: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                    ' <Relationship Target="/Metadata/plate_1.gcode" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/gcode"/>',
                    '</Relationships>'
                ].join('\n')
            },{
                name: `Metadata/model_settings.config`,
                data: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<config>',
                    '  <plate>',
                    '    <metadata key="plater_id" value="1"/>',
                    '    <metadata key="plater_name" value=""/>',
                    '    <metadata key="locked" value="false"/>',
                    '    <metadata key="gcode_file" value="Metadata/plate_1.gcode"/>',
                    '    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>',
                    '    <metadata key="thumbnail_no_light_file" value="Metadata/plate_no_light_1.png"/>',
                    '    <metadata key="top_file" value="Metadata/top_1.png"/>',
                    '    <metadata key="pick_file" value="Metadata/pick_1.png"/>',
                    '  </plate>',
                    '</config>'
                ].join('\n')
            },{
                name: `Metadata/slice_info.config`,
                data: [
                    '<?xml version="1.0" encoding="UTF-8"?>',
                    '<config>',
                    '  <header>',
                    '    <header_item key="X-BBL-Client-Type" value="slicer"/>',
                    '    <header_item key="X-BBL-Client-Version" value="01.10.01.50"/>',
                    '  </header>',
                    '  <plate>',
                    '    <metadata key="index" value="1"/>',
                    '    <metadata key="printer_model_id" value="C11"/>',
                    `    <metadata key="nozzle_diameters" value="${nozzle0}"/>`,
                    '    <metadata key="timelapse_type" value="0"/>',
                    `    <metadata key="prediction" value="${Math.round(info.time)}"/>`,
                    '    <metadata key="weight" value="0.50"/>',
                    '    <metadata key="outside" value="false"/>',
                    '    <metadata key="support_used" value="false"/>',
                    '    <metadata key="label_object_enabled" value="false"/>',
                    '    <object identify_id="560" name="Cube" skipped="false" />',
                    '    <filament id="1" tray_info_idx="GFL96" type="PLA" color="#FFFFFF" used_m="0.17" used_g="0.50" />',
                    '    <warning msg="bed_temperature_too_high_than_filament" level="1" error_code ="1000C001"  />',
                    '  </plate>',
                    '</config>'
                ].join('\n')
            },{
                name: `Metadata/project_settings.config`,
                data: JSON.stringify({
                    "accel_to_decel_enable": "0",
                    "accel_to_decel_factor": "50%",
                    "activate_air_filtration": [
                        "0"
                    ],
                    "additional_cooling_fan_speed": [
                        "70"
                    ],
                    "auxiliary_fan": "0",
                    "bed_custom_model": "",
                    "bed_custom_texture": "",
                    "bed_exclude_area": [
                        "0x0",
                        "18x0",
                        "18x28",
                        "0x28"
                    ],
                    "before_layer_change_gcode": "",
                    "best_object_pos": "0.5,0.5",
                    "bottom_shell_layers": "0",
                    "bottom_shell_thickness": "0",
                    "bottom_surface_pattern": "monotonic",
                    "bridge_angle": "0",
                    "bridge_flow": "1",
                    "bridge_no_support": "0",
                    "bridge_speed": "30",
                    "brim_object_gap": "0.1",
                    "brim_type": "auto_brim",
                    "brim_width": "5",
                    "chamber_temperatures": [
                        "0"
                    ],
                    // "change_filament_gcode": "M620 S[next_extruder]A\nM204 S9000\n{if toolchange_count > 1 && (z_hop_types[current_extruder] == 0 || z_hop_types[current_extruder] == 3)}\nG17\nG2 Z{z_after_toolchange + 0.4} I0.86 J0.86 P1 F10000 ; spiral lift a little from second lift\n{endif}\nG1 Z{max_layer_z + 3.0} F1200\n\nG1 X70 F21000\nG1 Y245\nG1 Y265 F3000\nM400\nM106 P1 S0\nM106 P2 S0\n{if old_filament_temp > 142 && next_extruder < 255}\nM104 S[old_filament_temp]\n{endif}\n{if long_retractions_when_cut[previous_extruder]}\nM620.11 S1 I[previous_extruder] E-{retraction_distances_when_cut[previous_extruder]} F{old_filament_e_feedrate}\n{else}\nM620.11 S0\n{endif}\nM400\nG1 X90 F3000\nG1 Y255 F4000\nG1 X100 F5000\nG1 X120 F15000\nG1 X20 Y50 F21000\nG1 Y-3\n{if toolchange_count == 2}\n; get travel path for change filament\nM620.1 X[travel_point_1_x] Y[travel_point_1_y] F21000 P0\nM620.1 X[travel_point_2_x] Y[travel_point_2_y] F21000 P1\nM620.1 X[travel_point_3_x] Y[travel_point_3_y] F21000 P2\n{endif}\nM620.1 E F[old_filament_e_feedrate] T{nozzle_temperature_range_high[previous_extruder]}\nT[next_extruder]\nM620.1 E F[new_filament_e_feedrate] T{nozzle_temperature_range_high[next_extruder]}\n\n{if next_extruder < 255}\n{if long_retractions_when_cut[previous_extruder]}\nM620.11 S1 I[previous_extruder] E{retraction_distances_when_cut[previous_extruder]} F{old_filament_e_feedrate}\nM628 S1\nG92 E0\nG1 E{retraction_distances_when_cut[previous_extruder]} F[old_filament_e_feedrate]\nM400\nM629 S1\n{else}\nM620.11 S0\n{endif}\nG92 E0\n{if flush_length_1 > 1}\nM83\n; FLUSH_START\n; always use highest temperature to flush\nM400\n{if filament_type[next_extruder] == \"PETG\"}\nM109 S260\n{elsif filament_type[next_extruder] == \"PVA\"}\nM109 S210\n{else}\nM109 S[nozzle_temperature_range_high]\n{endif}\n{if flush_length_1 > 23.7}\nG1 E23.7 F{old_filament_e_feedrate} ; do not need pulsatile flushing for start part\nG1 E{(flush_length_1 - 23.7) * 0.02} F50\nG1 E{(flush_length_1 - 23.7) * 0.23} F{old_filament_e_feedrate}\nG1 E{(flush_length_1 - 23.7) * 0.02} F50\nG1 E{(flush_length_1 - 23.7) * 0.23} F{new_filament_e_feedrate}\nG1 E{(flush_length_1 - 23.7) * 0.02} F50\nG1 E{(flush_length_1 - 23.7) * 0.23} F{new_filament_e_feedrate}\nG1 E{(flush_length_1 - 23.7) * 0.02} F50\nG1 E{(flush_length_1 - 23.7) * 0.23} F{new_filament_e_feedrate}\n{else}\nG1 E{flush_length_1} F{old_filament_e_feedrate}\n{endif}\n; FLUSH_END\nG1 E-[old_retract_length_toolchange] F1800\nG1 E[old_retract_length_toolchange] F300\n{endif}\n\n{if flush_length_2 > 1}\n\nG91\nG1 X3 F12000; move aside to extrude\nG90\nM83\n\n; FLUSH_START\nG1 E{flush_length_2 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_2 * 0.02} F50\nG1 E{flush_length_2 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_2 * 0.02} F50\nG1 E{flush_length_2 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_2 * 0.02} F50\nG1 E{flush_length_2 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_2 * 0.02} F50\nG1 E{flush_length_2 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_2 * 0.02} F50\n; FLUSH_END\nG1 E-[new_retract_length_toolchange] F1800\nG1 E[new_retract_length_toolchange] F300\n{endif}\n\n{if flush_length_3 > 1}\n\nG91\nG1 X3 F12000; move aside to extrude\nG90\nM83\n\n; FLUSH_START\nG1 E{flush_length_3 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_3 * 0.02} F50\nG1 E{flush_length_3 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_3 * 0.02} F50\nG1 E{flush_length_3 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_3 * 0.02} F50\nG1 E{flush_length_3 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_3 * 0.02} F50\nG1 E{flush_length_3 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_3 * 0.02} F50\n; FLUSH_END\nG1 E-[new_retract_length_toolchange] F1800\nG1 E[new_retract_length_toolchange] F300\n{endif}\n\n{if flush_length_4 > 1}\n\nG91\nG1 X3 F12000; move aside to extrude\nG90\nM83\n\n; FLUSH_START\nG1 E{flush_length_4 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_4 * 0.02} F50\nG1 E{flush_length_4 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_4 * 0.02} F50\nG1 E{flush_length_4 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_4 * 0.02} F50\nG1 E{flush_length_4 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_4 * 0.02} F50\nG1 E{flush_length_4 * 0.18} F{new_filament_e_feedrate}\nG1 E{flush_length_4 * 0.02} F50\n; FLUSH_END\n{endif}\n; FLUSH_START\nM400\nM109 S[new_filament_temp]\nG1 E2 F{new_filament_e_feedrate} ;Compensate for filament spillage during waiting temperature\n; FLUSH_END\nM400\nG92 E0\nG1 E-[new_retract_length_toolchange] F1800\nM106 P1 S255\nM400 S3\n\nG1 X70 F5000\nG1 X90 F3000\nG1 Y255 F4000\nG1 X105 F5000\nG1 Y265 F5000\nG1 X70 F10000\nG1 X100 F5000\nG1 X70 F10000\nG1 X100 F5000\n\nG1 X70 F10000\nG1 X80 F15000\nG1 X60\nG1 X80\nG1 X60\nG1 X80 ; shake to put down garbage\nG1 X100 F5000\nG1 X165 F15000; wipe and shake\nG1 Y256 ; move Y to aside, prevent collision\nM400\nG1 Z{max_layer_z + 3.0} F3000\n{if layer_z <= (initial_layer_print_height + 0.001)}\nM204 S[initial_layer_acceleration]\n{else}\nM204 S[default_acceleration]\n{endif}\n{else}\nG1 X[x_after_toolchange] Y[y_after_toolchange] Z[z_after_toolchange] F12000\n{endif}\nM621 S[next_extruder]A\n",
                    "close_fan_the_first_x_layers": [
                        "1"
                    ],
                    "complete_print_exhaust_fan_speed": [
                        "70"
                    ],
                    "cool_plate_temp": [
                        "35"
                    ],
                    "cool_plate_temp_initial_layer": [
                        "35"
                    ],
                    "curr_bed_type": "Textured PEI Plate",
                    "default_acceleration": "10000",
                    "default_filament_colour": [
                        ""
                    ],
                    "default_filament_profile": [
                        // "Bambu PLA Basic @BBL X1"
                        "Bambu PLA Basic"
                    ],
                    "default_jerk": "0",
                    "default_print_profile": "0.30mm Standard P1P 0.6 nozzle",
                    // "default_print_profile": "0.30mm Standard @BBL P1P 0.6 nozzle",
                    "deretraction_speed": [
                        "30"
                    ],
                    "detect_narrow_internal_solid_infill": "1",
                    "detect_overhang_wall": "1",
                    "detect_thin_wall": "0",
                    "different_settings_to_system": [
                        "bottom_shell_layers;sparse_infill_density;top_shell_layers;wall_loops",
                        "",
                        ""
                    ],
                    "draft_shield": "disabled",
                    "during_print_exhaust_fan_speed": [
                        "70"
                    ],
                    "elefant_foot_compensation": "0.15",
                    "enable_arc_fitting": "1",
                    "enable_long_retraction_when_cut": "2",
                    "enable_overhang_bridge_fan": [
                        "1"
                    ],
                    "enable_overhang_speed": "1",
                    "enable_pressure_advance": [
                        "0"
                    ],
                    "enable_prime_tower": "1",
                    "enable_support": "0",
                    "enforce_support_layers": "0",
                    "eng_plate_temp": [
                        "0"
                    ],
                    "eng_plate_temp_initial_layer": [
                        "0"
                    ],
                    "ensure_vertical_shell_thickness": "1",
                    "exclude_object": "1",
                    "extruder_clearance_dist_to_rod": "33",
                    "extruder_clearance_height_to_lid": "90",
                    "extruder_clearance_height_to_rod": "34",
                    "extruder_clearance_max_radius": "68",
                    "extruder_colour": [
                        "#018001"
                    ],
                    "extruder_offset": [
                        "0x2"
                    ],
                    "extruder_type": [
                        "DirectDrive"
                    ],
                    "fan_cooling_layer_time": [
                        "100"
                    ],
                    "fan_max_speed": [
                        "100"
                    ],
                    "fan_min_speed": [
                        "100"
                    ],
                    "filament_colour": [
                        "#FFFFFF"
                    ],
                    "filament_cost": [
                        "20"
                    ],
                    "filament_density": [
                        "1.24"
                    ],
                    "filament_deretraction_speed": [
                        "nil"
                    ],
                    "filament_diameter": [
                        "1.75"
                    ],
                    "filament_end_gcode": [
                        "; filament end gcode \nM106 P3 S0\n"
                    ],
                    "filament_flow_ratio": [
                        "0.98"
                    ],
                    "filament_ids": [
                        "GFL96"
                    ],
                    "filament_is_support": [
                        "0"
                    ],
                    "filament_long_retractions_when_cut": [
                        "nil"
                    ],
                    "filament_max_volumetric_speed": [
                        "7.5"
                    ],
                    "filament_minimal_purge_on_wipe_tower": [
                        "15"
                    ],
                    "filament_notes": "",
                    "filament_retract_before_wipe": [
                        "nil"
                    ],
                    "filament_retract_restart_extra": [
                        "nil"
                    ],
                    "filament_retract_when_changing_layer": [
                        "nil"
                    ],
                    "filament_retraction_distances_when_cut": [
                        "nil"
                    ],
                    "filament_retraction_length": [
                        "0.5"
                    ],
                    "filament_retraction_minimum_travel": [
                        "nil"
                    ],
                    "filament_retraction_speed": [
                        "nil"
                    ],
                    "filament_scarf_gap": [
                        "15%"
                    ],
                    "filament_scarf_height": [
                        "10%"
                    ],
                    "filament_scarf_length": [
                        "10"
                    ],
                    "filament_scarf_seam_type": [
                        "none"
                    ],
                    "filament_settings_id": [
                        "Generic PLA Silk @BBL P1P"
                    ],
                    "filament_shrink": [
                        "100%"
                    ],
                    "filament_soluble": [
                        "0"
                    ],
                    "filament_start_gcode": [
                        // "; filament start gcode\n{if  (bed_temperature[current_extruder] >45)||(bed_temperature_initial_layer[current_extruder] >45)}M106 P3 S255\n{elsif(bed_temperature[current_extruder] >35)||(bed_temperature_initial_layer[current_extruder] >35)}M106 P3 S180\n{endif};Prevent PLA from jamming\n\n{if activate_air_filtration[current_extruder] && support_air_filtration}\nM106 P3 S{during_print_exhaust_fan_speed_num[current_extruder]} \n{endif}"
                    ],
                    "filament_type": [
                        "PLA"
                    ],
                    "filament_vendor": [
                        "Generic"
                    ],
                    "filament_wipe": [
                        "nil"
                    ],
                    "filament_wipe_distance": [
                        "nil"
                    ],
                    "filament_z_hop": [
                        "nil"
                    ],
                    "filament_z_hop_types": [
                        "nil"
                    ],
                    "filename_format": "{input_filename_base}_{filament_type[0]}_{print_time}.gcode",
                    "filter_out_gap_fill": "0",
                    "first_layer_print_sequence": [
                        "0"
                    ],
                    "flush_into_infill": "0",
                    "flush_into_objects": "0",
                    "flush_into_support": "1",
                    "flush_multiplier": "1",
                    "flush_volumes_matrix": [
                        "0"
                    ],
                    "flush_volumes_vector": [
                        "140",
                        "140"
                    ],
                    "from": "project",
                    "full_fan_speed_layer": [
                        "0"
                    ],
                    "fuzzy_skin": "none",
                    "fuzzy_skin_point_distance": "0.8",
                    "fuzzy_skin_thickness": "0.3",
                    "gap_infill_speed": "50",
                    "gcode_add_line_number": "0",
                    "gcode_flavor": "marlin",
                    "has_scarf_joint_seam": "0",
                    "head_wrap_detect_zone": [],
                    "host_type": "octoprint",
                    "hot_plate_temp": [
                        "55"
                    ],
                    "hot_plate_temp_initial_layer": [
                        "55"
                    ],
                    "independent_support_layer_height": "1",
                    "infill_combination": "0",
                    "infill_direction": "45",
                    "infill_jerk": "9",
                    "infill_wall_overlap": "15%",
                    "initial_layer_acceleration": "500",
                    "initial_layer_flow_ratio": "1",
                    "initial_layer_infill_speed": "55",
                    "initial_layer_jerk": "9",
                    "initial_layer_line_width": "0.62",
                    "initial_layer_print_height": "0.3",
                    "initial_layer_speed": "35",
                    "inner_wall_acceleration": "0",
                    "inner_wall_jerk": "9",
                    "inner_wall_line_width": "0.62",
                    "inner_wall_speed": "150",
                    "interface_shells": "0",
                    "internal_bridge_support_thickness": "0.8",
                    "internal_solid_infill_line_width": "0.62",
                    "internal_solid_infill_pattern": "zig-zag",
                    "internal_solid_infill_speed": "150",
                    "ironing_direction": "45",
                    "ironing_flow": "10%",
                    "ironing_inset": "0.31",
                    "ironing_pattern": "zig-zag",
                    "ironing_spacing": "0.15",
                    "ironing_speed": "30",
                    "ironing_type": "no ironing",
                    "is_infill_first": "0",
                    // "layer_change_gcode": "; layer num/total_layer_count: {layer_num+1}/[total_layer_count]\nM622.1 S1 ; for prev firware, default turned on\nM1002 judge_flag timelapse_record_flag\nM622 J1\n{if timelapse_type == 0} ; timelapse without wipe tower\nM971 S11 C10 O0\n{elsif timelapse_type == 1} ; timelapse with wipe tower\nG92 E0\nG1 E-[retraction_length] F1800\nG17\nG2 Z{layer_z + 0.4} I0.86 J0.86 P1 F20000 ; spiral lift a little\nG1 X65 Y245 F20000 ; move to safe pos\nG17\nG2 Z{layer_z} I0.86 J0.86 P1 F20000\nG1 Y265 F3000\nM400 P300\nM971 S11 C11 O0\nG92 E0\nG1 E[retraction_length] F300\nG1 X100 F5000\nG1 Y255 F20000\n{endif}\nM623\n; update layer progress\nM73 L{layer_num+1}\nM991 S0 P{layer_num} ;notify layer change",
                    "layer_height": "0.3",
                    "line_width": "0.62",
                    "long_retractions_when_cut": [
                        "0"
                    ],
                    // "machine_end_gcode": ";===== date: 20230428 =====================\nM400 ; wait for buffer to clear\nG92 E0 ; zero the extruder\nG1 E-0.8 F1800 ; retract\nG1 Z{max_layer_z + 0.5} F900 ; lower z a little\nG1 X65 Y245 F12000 ; move to safe pos \nG1 Y265 F3000\n\nG1 X65 Y245 F12000\nG1 Y265 F3000\nM140 S0 ; turn off bed\nM106 S0 ; turn off fan\nM106 P2 S0 ; turn off remote part cooling fan\nM106 P3 S0 ; turn off chamber cooling fan\n\nG1 X100 F12000 ; wipe\n; pull back filament to AMS\nM620 S255\nG1 X20 Y50 F12000\nG1 Y-3\nT255\nG1 X65 F12000\nG1 Y265\nG1 X100 F12000 ; wipe\nM621 S255\nM104 S0 ; turn off hotend\n\nM622.1 S1 ; for prev firware, default turned on\nM1002 judge_flag timelapse_record_flag\nM622 J1\n    M400 ; wait all motion done\n    M991 S0 P-1 ;end smooth timelapse at safe pos\n    M400 S3 ;wait for last picture to be taken\nM623; end of \"timelapse_record_flag\"\n\nM400 ; wait all motion done\nM17 S\nM17 Z0.4 ; lower z motor current to reduce impact if there is something in the bottom\n{if (max_layer_z + 100.0) < 250}\n    G1 Z{max_layer_z + 100.0} F600\n    G1 Z{max_layer_z +98.0}\n{else}\n    G1 Z250 F600\n    G1 Z248\n{endif}\nM400 P100\nM17 R ; restore z current\n\nM220 S100  ; Reset feedrate magnitude\nM201.2 K1.0 ; Reset acc magnitude\nM73.2   R1.0 ;Reset left time magnitude\nM1002 set_gcode_claim_speed_level : 0\n\nM17 X0.8 Y0.8 Z0.5 ; lower motor current to 45% power\n",
                    "machine_load_filament_time": "29",
                    "machine_max_acceleration_e": [
                        "5000",
                        "5000"
                    ],
                    "machine_max_acceleration_extruding": [
                        "20000",
                        "20000"
                    ],
                    "machine_max_acceleration_retracting": [
                        "5000",
                        "5000"
                    ],
                    "machine_max_acceleration_travel": [
                        "9000",
                        "9000"
                    ],
                    "machine_max_acceleration_x": [
                        "20000",
                        "20000"
                    ],
                    "machine_max_acceleration_y": [
                        "20000",
                        "20000"
                    ],
                    "machine_max_acceleration_z": [
                        "500",
                        "200"
                    ],
                    "machine_max_jerk_e": [
                        "2.5",
                        "2.5"
                    ],
                    "machine_max_jerk_x": [
                        "9",
                        "9"
                    ],
                    "machine_max_jerk_y": [
                        "9",
                        "9"
                    ],
                    "machine_max_jerk_z": [
                        "3",
                        "3"
                    ],
                    "machine_max_speed_e": [
                        "30",
                        "30"
                    ],
                    "machine_max_speed_x": [
                        "500",
                        "200"
                    ],
                    "machine_max_speed_y": [
                        "500",
                        "200"
                    ],
                    "machine_max_speed_z": [
                        "20",
                        "20"
                    ],
                    "machine_min_extruding_rate": [
                        "0",
                        "0"
                    ],
                    "machine_min_travel_rate": [
                        "0",
                        "0"
                    ],
                    "machine_pause_gcode": "M400 U1",
                    // "machine_start_gcode": ";===== machine: P1S ========================\n;===== date: 20231107 =====================\n;===== turn on the HB fan & MC board fan =================\nM104 S75 ;set extruder temp to turn on the HB fan and prevent filament oozing from nozzle\nM710 A1 S255 ;turn on MC fan by default(P1S)\n;===== reset machine status =================\nM290 X40 Y40 Z2.6666666\nG91\nM17 Z0.4 ; lower the z-motor current\nG380 S2 Z30 F300 ; G380 is same as G38; lower the hotbed , to prevent the nozzle is below the hotbed\nG380 S2 Z-25 F300 ;\nG1 Z5 F300;\nG90\nM17 X1.2 Y1.2 Z0.75 ; reset motor current to default\nM960 S5 P1 ; turn on logo lamp\nG90\nM220 S100 ;Reset Feedrate\nM221 S100 ;Reset Flowrate\nM73.2   R1.0 ;Reset left time magnitude\nM1002 set_gcode_claim_speed_level : 5\nM221 X0 Y0 Z0 ; turn off soft endstop to prevent protential logic problem\nG29.1 Z{+0.0} ; clear z-trim value first\nM204 S10000 ; init ACC set to 10m/s^2\n\n;===== heatbed preheat ====================\nM1002 gcode_claim_action : 2\nM140 S[bed_temperature_initial_layer_single] ;set bed temp\nM190 S[bed_temperature_initial_layer_single] ;wait for bed temp\n\n\n;=============turn on fans to prevent PLA jamming=================\n{if filament_type[initial_extruder]==\"PLA\"}\n    {if (bed_temperature[initial_extruder] >45)||(bed_temperature_initial_layer[initial_extruder] >45)}\n    M106 P3 S180\n    {endif};Prevent PLA from jamming\n{endif}\nM106 P2 S100 ; turn on big fan ,to cool down toolhead\n\n;===== prepare print temperature and material ==========\nM104 S[nozzle_temperature_initial_layer] ;set extruder temp\nG91\nG0 Z10 F1200\nG90\nG28 X\nM975 S1 ; turn on\nG1 X60 F12000\nG1 Y245\nG1 Y265 F3000\nM620 M\nM620 S[initial_extruder]A   ; switch material if AMS exist\n    M109 S[nozzle_temperature_initial_layer]\n    G1 X120 F12000\n\n    G1 X20 Y50 F12000\n    G1 Y-3\n    T[initial_extruder]\n    G1 X54 F12000\n    G1 Y265\n    M400\nM621 S[initial_extruder]A\nM620.1 E F{filament_max_volumetric_speed[initial_extruder]/2.4053*60} T{nozzle_temperature_range_high[initial_extruder]}\n\n\nM412 S1 ; ===turn on filament runout detection===\n\nM109 S250 ;set nozzle to common flush temp\nM106 P1 S0\nG92 E0\nG1 E50 F200\nM400\nM104 S[nozzle_temperature_initial_layer]\nG92 E0\nG1 E50 F200\nM400\nM106 P1 S255\nG92 E0\nG1 E5 F300\nM109 S{nozzle_temperature_initial_layer[initial_extruder]-20} ; drop nozzle temp, make filament shink a bit\nG92 E0\nG1 E-0.5 F300\n\nG1 X70 F9000\nG1 X76 F15000\nG1 X65 F15000\nG1 X76 F15000\nG1 X65 F15000; shake to put down garbage\nG1 X80 F6000\nG1 X95 F15000\nG1 X80 F15000\nG1 X165 F15000; wipe and shake\nM400\nM106 P1 S0\n;===== prepare print temperature and material end =====\n\n\n;===== wipe nozzle ===============================\nM1002 gcode_claim_action : 14\nM975 S1\nM106 S255\nG1 X65 Y230 F18000\nG1 Y264 F6000\nM109 S{nozzle_temperature_initial_layer[initial_extruder]-20}\nG1 X100 F18000 ; first wipe mouth\n\nG0 X135 Y253 F20000  ; move to exposed steel surface edge\nG28 Z P0 T300; home z with low precision,permit 300deg temperature\nG29.2 S0 ; turn off ABL\nG0 Z5 F20000\n\nG1 X60 Y265\nG92 E0\nG1 E-0.5 F300 ; retrack more\nG1 X100 F5000; second wipe mouth\nG1 X70 F15000\nG1 X100 F5000\nG1 X70 F15000\nG1 X100 F5000\nG1 X70 F15000\nG1 X100 F5000\nG1 X70 F15000\nG1 X90 F5000\nG0 X128 Y261 Z-1.5 F20000  ; move to exposed steel surface and stop the nozzle\nM104 S140 ; set temp down to heatbed acceptable\nM106 S255 ; turn on fan (G28 has turn off fan)\n\nM221 S; push soft endstop status\nM221 Z0 ;turn off Z axis endstop\nG0 Z0.5 F20000\nG0 X125 Y259.5 Z-1.01\nG0 X131 F211\nG0 X124\nG0 Z0.5 F20000\nG0 X125 Y262.5\nG0 Z-1.01\nG0 X131 F211\nG0 X124\nG0 Z0.5 F20000\nG0 X125 Y260.0\nG0 Z-1.01\nG0 X131 F211\nG0 X124\nG0 Z0.5 F20000\nG0 X125 Y262.0\nG0 Z-1.01\nG0 X131 F211\nG0 X124\nG0 Z0.5 F20000\nG0 X125 Y260.5\nG0 Z-1.01\nG0 X131 F211\nG0 X124\nG0 Z0.5 F20000\nG0 X125 Y261.5\nG0 Z-1.01\nG0 X131 F211\nG0 X124\nG0 Z0.5 F20000\nG0 X125 Y261.0\nG0 Z-1.01\nG0 X131 F211\nG0 X124\nG0 X128\nG2 I0.5 J0 F300\nG2 I0.5 J0 F300\nG2 I0.5 J0 F300\nG2 I0.5 J0 F300\n\nM109 S140 ; wait nozzle temp down to heatbed acceptable\nG2 I0.5 J0 F3000\nG2 I0.5 J0 F3000\nG2 I0.5 J0 F3000\nG2 I0.5 J0 F3000\n\nM221 R; pop softend status\nG1 Z10 F1200\nM400\nG1 Z10\nG1 F30000\nG1 X230 Y15\nG29.2 S1 ; turn on ABL\n;G28 ; home again after hard wipe mouth\nM106 S0 ; turn off fan , too noisy\n;===== wipe nozzle end ================================\n\n\n;===== bed leveling ==================================\nM1002 judge_flag g29_before_print_flag\nM622 J1\n\n    M1002 gcode_claim_action : 1\n    G29 A X{first_layer_print_min[0]} Y{first_layer_print_min[1]} I{first_layer_print_size[0]} J{first_layer_print_size[1]}\n    M400\n    M500 ; save cali data\n\nM623\n;===== bed leveling end ================================\n\n;===== home after wipe mouth============================\nM1002 judge_flag g29_before_print_flag\nM622 J0\n\n    M1002 gcode_claim_action : 13\n    G28\n\nM623\n;===== home after wipe mouth end =======================\n\nM975 S1 ; turn on vibration supression\n\n\n;=============turn on fans to prevent PLA jamming=================\n{if filament_type[initial_extruder]==\"PLA\"}\n    {if (bed_temperature[initial_extruder] >45)||(bed_temperature_initial_layer[initial_extruder] >45)}\n    M106 P3 S180\n    {endif};Prevent PLA from jamming\n{endif}\nM106 P2 S100 ; turn on big fan ,to cool down toolhead\n\n\nM104 S{nozzle_temperature_initial_layer[initial_extruder]} ; set extrude temp earlier, to reduce wait time\n\n;===== mech mode fast check============================\nG1 X128 Y128 Z10 F20000\nM400 P200\nM970.3 Q1 A7 B30 C80  H15 K0\nM974 Q1 S2 P0\n\nG1 X128 Y128 Z10 F20000\nM400 P200\nM970.3 Q0 A7 B30 C90 Q0 H15 K0\nM974 Q0 S2 P0\n\nM975 S1\nG1 F30000\nG1 X230 Y15\nG28 X ; re-home XY\n;===== fmech mode fast check============================\n\n\n;===== nozzle load line ===============================\nM975 S1\nG90\nM83\nT1000\nG1 X18.0 Y1.0 Z0.8 F18000;Move to start position\nM109 S{nozzle_temperature_initial_layer[initial_extruder]}\nG1 Z0.2\nG0 E2 F300\nG0 X240 E25 F{outer_wall_volumetric_speed/(0.3*0.5)     * 60}\nG0 Y15 E1.166 F{outer_wall_volumetric_speed/(0.3*0.5)/ 4 * 60}\nG0 X239.5\nG0 E0.2\nG0 Y1.5 E1.166\nG0 X18 E25 F{outer_wall_volumetric_speed/(0.3*0.5)     * 60}\nM400\n\n;===== for Textured PEI Plate , lower the nozzle as the nozzle was touching topmost of the texture when homing ==\n;curr_bed_type={curr_bed_type}\n{if curr_bed_type==\"Textured PEI Plate\"}\nG29.1 Z{-0.04} ; for Textured PEI Plate\n{endif}\n;========turn off light and wait extrude temperature =============\nM1002 gcode_claim_action : 0\nM106 S0 ; turn off fan\nM106 P2 S0 ; turn off big fan\nM106 P3 S0 ; turn off chamber fan\n\nM975 S1 ; turn on mech mode supression\n",
                    "machine_unload_filament_time": "28",
                    "max_bridge_length": "0",
                    "max_layer_height": [
                        "0.42"
                    ],
                    "max_travel_detour_distance": "0",
                    "min_bead_width": "85%",
                    "min_feature_size": "25%",
                    "min_layer_height": [
                        "0.12"
                    ],
                    "minimum_sparse_infill_area": "15",
                    "mmu_segmented_region_interlocking_depth": "0",
                    "mmu_segmented_region_max_width": "0",
                    "name": "project_settings",
                    "nozzle_diameter": [
                        "0.6"
                    ],
                    "nozzle_height": "4.2",
                    "nozzle_temperature": [
                        "220"
                    ],
                    "nozzle_temperature_initial_layer": [
                        "220"
                    ],
                    "nozzle_temperature_range_high": [
                        "240"
                    ],
                    "nozzle_temperature_range_low": [
                        "190"
                    ],
                    "nozzle_type": "hardened_steel",
                    "nozzle_volume": "107",
                    "only_one_wall_first_layer": "0",
                    "ooze_prevention": "0",
                    "other_layers_print_sequence": [
                        "0"
                    ],
                    "other_layers_print_sequence_nums": "0",
                    "outer_wall_acceleration": "5000",
                    "outer_wall_jerk": "9",
                    "outer_wall_line_width": "0.62",
                    "outer_wall_speed": "120",
                    "overhang_1_4_speed": "0",
                    "overhang_2_4_speed": "50",
                    "overhang_3_4_speed": "15",
                    "overhang_4_4_speed": "10",
                    "overhang_fan_speed": [
                        "100"
                    ],
                    "overhang_fan_threshold": [
                        "50%"
                    ],
                    "overhang_threshold_participating_cooling": [
                        "95%"
                    ],
                    "overhang_totally_speed": "19",
                    "post_process": [],
                    "precise_z_height": "0",
                    "pressure_advance": [
                        "0.02"
                    ],
                    "prime_tower_brim_width": "3",
                    "prime_tower_width": "35",
                    "prime_volume": "45",
                    "print_compatible_printers": [
                        "Bambu Lab P1P 0.6 nozzle"
                    ],
                    "print_flow_ratio": "1",
                    "print_sequence": "by layer",
                    "print_settings_id": "0.30mm Standard P1P 0.6 nozzle",
                    // "print_settings_id": "0.30mm Standard @BBL P1P 0.6 nozzle",
                    "printable_area": [
                        "0x0",
                        "256x0",
                        "256x256",
                        "0x256"
                    ],
                    "printable_height": "250",
                    "printer_model": "Bambu Lab P1P",
                    "printer_notes": "",
                    "printer_settings_id": "Bambu Lab P1P 0.6 nozzle",
                    "printer_structure": "corexy",
                    "printer_technology": "FFF",
                    "printer_variant": "0.6",
                    "printhost_authorization_type": "key",
                    "printhost_ssl_ignore_revoke": "0",
                    "printing_by_object_gcode": "",
                    "process_notes": "",
                    "raft_contact_distance": "0.1",
                    "raft_expansion": "1.5",
                    "raft_first_layer_density": "90%",
                    "raft_first_layer_expansion": "2",
                    "raft_layers": "0",
                    "reduce_crossing_wall": "0",
                    "reduce_fan_stop_start_freq": [
                        "1"
                    ],
                    "reduce_infill_retraction": "1",
                    "required_nozzle_HRC": [
                        "3"
                    ],
                    "resolution": "0.012",
                    "retract_before_wipe": [
                        "0%"
                    ],
                    "retract_length_toolchange": [
                        "2"
                    ],
                    "retract_lift_above": [
                        "0"
                    ],
                    "retract_lift_below": [
                        "249"
                    ],
                    "retract_restart_extra": [
                        "0"
                    ],
                    "retract_restart_extra_toolchange": [
                        "0"
                    ],
                    "retract_when_changing_layer": [
                        "1"
                    ],
                    "retraction_distances_when_cut": [
                        "18"
                    ],
                    "retraction_length": [
                        "1.4"
                    ],
                    "retraction_minimum_travel": [
                        "3"
                    ],
                    "retraction_speed": [
                        "30"
                    ],
                    "role_base_wipe_speed": "1",
                    "scan_first_layer": "0",
                    "scarf_angle_threshold": "155",
                    "seam_gap": "15%",
                    "seam_position": "aligned",
                    "seam_slope_conditional": "1",
                    "seam_slope_entire_loop": "0",
                    "seam_slope_inner_walls": "1",
                    "seam_slope_steps": "10",
                    "silent_mode": "0",
                    "single_extruder_multi_material": "1",
                    "skirt_distance": "2",
                    "skirt_height": "1",
                    "skirt_loops": "0",
                    "slice_closing_radius": "0.049",
                    "slicing_mode": "regular",
                    "slow_down_for_layer_cooling": [
                        "1"
                    ],
                    "slow_down_layer_time": [
                        "8"
                    ],
                    "slow_down_min_speed": [
                        "20"
                    ],
                    "small_perimeter_speed": "50%",
                    "small_perimeter_threshold": "0",
                    "smooth_coefficient": "80",
                    "smooth_speed_discontinuity_area": "1",
                    "solid_infill_filament": "1",
                    "sparse_infill_acceleration": "100%",
                    "sparse_infill_anchor": "400%",
                    "sparse_infill_anchor_max": "20",
                    "sparse_infill_density": "0%",
                    "sparse_infill_filament": "1",
                    "sparse_infill_line_width": "0.62",
                    "sparse_infill_pattern": "grid",
                    "sparse_infill_speed": "100",
                    "spiral_mode": "0",
                    "spiral_mode_max_xy_smoothing": "200%",
                    "spiral_mode_smooth": "0",
                    "standby_temperature_delta": "-5",
                    "start_end_points": [
                        "30x-3",
                        "54x245"
                    ],
                    "supertack_plate_temp": [
                        "35"
                    ],
                    "supertack_plate_temp_initial_layer": [
                        "35"
                    ],
                    "support_air_filtration": "0",
                    "support_angle": "0",
                    "support_base_pattern": "default",
                    "support_base_pattern_spacing": "2.5",
                    "support_bottom_interface_spacing": "0.5",
                    "support_bottom_z_distance": "0.2",
                    "support_chamber_temp_control": "0",
                    "support_critical_regions_only": "0",
                    "support_expansion": "0",
                    "support_filament": "0",
                    "support_interface_bottom_layers": "2",
                    "support_interface_filament": "0",
                    "support_interface_loop_pattern": "0",
                    "support_interface_not_for_body": "1",
                    "support_interface_pattern": "auto",
                    "support_interface_spacing": "0.5",
                    "support_interface_speed": "80",
                    "support_interface_top_layers": "2",
                    "support_line_width": "0.62",
                    "support_object_first_layer_gap": "0.2",
                    "support_object_xy_distance": "0.35",
                    "support_on_build_plate_only": "0",
                    "support_remove_small_overhang": "1",
                    "support_speed": "150",
                    "support_style": "default",
                    "support_threshold_angle": "30",
                    "support_top_z_distance": "0.2",
                    "support_type": "normal(auto)",
                    "temperature_vitrification": [
                        "45"
                    ],
                    "template_custom_gcode": "",
                    "textured_plate_temp": [
                        "55"
                    ],
                    "textured_plate_temp_initial_layer": [
                        "55"
                    ],
                    "thick_bridges": "0",
                    "thumbnail_size": [
                        "50x50"
                    ],
                    "time_lapse_gcode": "",
                    "timelapse_type": "0",
                    "top_area_threshold": "100%",
                    "top_one_wall_type": "all top",
                    "top_shell_layers": "0",
                    "top_shell_thickness": "0.8",
                    "top_solid_infill_flow_ratio": "1",
                    "top_surface_acceleration": "2000",
                    "top_surface_jerk": "9",
                    "top_surface_line_width": "0.62",
                    "top_surface_pattern": "monotonicline",
                    "top_surface_speed": "150",
                    "travel_jerk": "9",
                    "travel_speed": "500",
                    "travel_speed_z": "0",
                    "tree_support_branch_angle": "45",
                    "tree_support_branch_diameter": "2",
                    "tree_support_branch_diameter_angle": "5",
                    "tree_support_branch_distance": "5",
                    "tree_support_wall_count": "0",
                    "upward_compatible_machine": [
                        "Bambu Lab P1S 0.6 nozzle",
                        "Bambu Lab X1 0.6 nozzle",
                        "Bambu Lab X1 Carbon 0.6 nozzle",
                        "Bambu Lab X1E 0.6 nozzle",
                        "Bambu Lab A1 0.6 nozzle"
                    ],
                    "use_firmware_retraction": "0",
                    "use_relative_e_distances": "1",
                    "version": "01.10.01.50",
                    "wall_distribution_count": "1",
                    "wall_filament": "1",
                    "wall_generator": "classic",
                    "wall_loops": "1",
                    "wall_sequence": "inner wall/outer wall",
                    "wall_transition_angle": "10",
                    "wall_transition_filter_deviation": "25%",
                    "wall_transition_length": "100%",
                    "wipe": [
                        "1"
                    ],
                    "wipe_distance": [
                        "2"
                    ],
                    "wipe_speed": "80%",
                    "wipe_tower_no_sparse_layers": "0",
                    "wipe_tower_rotation_angle": "0",
                    "wipe_tower_x": [
                        "165"
                    ],
                    "wipe_tower_y": [
                        "221"
                    ],
                    "xy_contour_compensation": "0",
                    "xy_hole_compensation": "0",
                    "z_hop": [
                        "0.4"
                    ],
                    "z_hop_types": [
                        "Auto Lift"
                    ]
                },undefined,4)
            },{
                name: `Metadata/plate_1.gcode`,
                data: gcode
            },{
                name: `Metadata/plate_1_small.png`,
                data: api.view.bambu.s128.png
            },{
                name: `Metadata/plate_no_light_1.png`,
                data: api.view.bambu.s512.png
            },{
                name: `Metadata/plate_1.png`,
                data: api.view.bambu.s512.png
            },{
                name: `Metadata/pick_1.png`,
                data: api.view.bambu.s512.png
            },{
                name: `Metadata/top_1.png`,
                data: api.view.bambu.s512.png
            }];
            kiri.client.zip(files, progress => {
                api.show.progress(progress.percent/100, "generating 3mf");
            }, output => {
                api.show.progress(0);
                if (api.bambu) {
                    api.bambu.send(`${$('print-filename').value}.3mf`, output);
                } else {
                    api.util.download(output, `${$('print-filename').value}.3mf`);
                }
            })
        };

        // octoprint setup
        $('send-to-octohead').style.display = octo ? '' : 'none';
        $('send-to-octoprint').style.display = octo ? '' : 'none';
        if (octo) try {
            $('print-octoprint').onclick = sendto_octoprint;
            octo_host = $('octo-host');
            octo_apik = $('octo-apik');
            if (MODE === MODES.CAM) {
                $('send-to-octohead').style.display = 'none';
                $('send-to-octoprint').style.display = 'none';
            } else {
                $('send-to-octohead').style.display = '';
                $('send-to-octoprint').style.display = '';
            }
            // hide octoprint when hard-coded in the url
            if (api.const.OCTO) {
                $('ophost').style.display = 'none';
                $('opapik').style.display = 'none';
                $('oph1nt').style.display = 'none';
                $('send-to-gridhost').style.display = 'none';
            }
            octo_host.value = localGet('octo-host') || '';
            octo_apik.value = localGet('octo-apik') || '';
        } catch (e) { console.log(e) }

        // grid:host setup
        $('send-to-hosthead').style.display = ghost ? '' : 'none';
        $('send-to-gridhost').style.display = ghost ? '' : 'none';
        if (ghost) try {
            $('print-gridhost').onclick = sendto_gridhost;
            $('grid-host').onkeyup = gridhost_probe;
            $('grid-apik').onkeyup = gridhost_probe;
            grid_host = $('grid-host');
            grid_apik = $('grid-apik');
            grid_target = $('grid-target');
            grid_target.onchange = function(ev) {
                localSet('grid-target', grid_targets[grid_target.selectedIndex]);
            };
            grid_host.value = localGet('grid-host') || '';
            grid_apik.value = localGet('grid-apik') || '';
            gridhost_probe();
        } catch (e) { console.log(e) }

        // grid:local setup
        if (local) try {
            gridlocal_probe();
            $('print-gridlocal').onclick = sendto_gridlocal;
            $('admin-gridlocal').onclick = admin_gridlocal;
        } catch (e) { console.log(e) }

        // preview of the generated GCODE (first 64k max)
        if (preview && gcode) $('code-preview-textarea').value = gcode.substring(0,65535);
}

});
