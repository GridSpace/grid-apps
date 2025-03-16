/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: ext.md5
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
        info.weight = (
            (Math.PI * util.sqr(
                info.settings.device.extruders[0].extFilament / 2
            )) *
            info.distance *
            (parseFloat(density.value) || 1.25) /
            1000
        ).round(2);
        $('print-weight').value = info.weight.toFixed(2);
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
        $('print-filament').style.display = fdm ? '' : 'none';
        $('print-filename').value = filename;
        $('print-filesize').value = util.comma(info.bytes);
        $('print-filament').value = Math.round(info.distance);
        if (set.controller.devel) {
            $('code-preview-textarea').style.height = "30em";
        }
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
            gen3mf(zip => api.util.download(zip, `${$('print-filename').value}.3mf`));
        };

        // present bambu print options when selected device is bambu
        if (api.bambu) {
            api.bambu.prep_export(gen3mf, gcode, info, settings);
        }

        // let wids = api.widgets.all();
        // let bnds = settings.bounds;
        // console.log({ wids, bnds });

        function gen3mf(then, ptype = 'unknown', ams = [0]) {
            let now = new Date();
            let ymd = [
                now.getFullYear(),
                (now.getMonth() + 1).toString().padStart(2,0),
                now.getDate().toString().padStart(2,0),
            ].join('-');
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
                    ` <metadata name="CreationDate">${ymd}</metadata>`,
                    ' <metadata name="Description"></metadata>',
                    ' <metadata name="Designer"></metadata>',
                    ' <metadata name="DesignerCover"></metadata>',
                    ' <metadata name="License"></metadata>',
                    ` <metadata name="ModificationDate">${ymd}</metadata>`,
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
            // },{
            //     name: `Metadata/plate_1.json`,
            //     data: JSON.stringify({
            //         "bbox_all": [ 100, 100, 200, 200 ],
            //         "bbox_objects": (info.labels || []).map(label => {
            //             return {
            //                 area: 600,
            //                 bbox: [ 100, 100, 200, 200 ],
            //                 id: label,
            //                 layer_height: 0.2,
            //                 name: "Object"
            //             }
            //         }),
            //         "bed_type": "textured_plate",
            //         "filament_colors": ["#FFFFFF"],
            //         "filament_ids": ams,
            //         "first_extruder": ams[0],
            //         "is_seq_print": false,
            //         "nozzle_diameter": 0.6,
            //         "version": 2
            //     })
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
                    // setting this value allows for the printer to error out if
                    // the gcode / 3mf was intended for a different target type.
                    // leaving it blank bypasses the check
                    // `    <metadata key="printer_model_id" value="${ptype}"/>`,
                    `    <metadata key="nozzle_diameters" value="${nozzle0}"/>`,
                    '    <metadata key="timelapse_type" value="0"/>',
                    `    <metadata key="prediction" value="${Math.round(info.time)}"/>`,
                    `    <metadata key="weight" value="${info.weight}"/>`,
                    '    <metadata key="outside" value="false"/>',
                    '    <metadata key="support_used" value="false"/>',
                    '    <metadata key="label_object_enabled" value="false"/>',
                    // (info.labels || []).map(label =>
                    // `    <object identify_id="${label}" name="Object" skipped="false" />`),
                    // '    <filament id="1" tray_info_idx="GFL96" type="PLA" color="#FFFFFF" used_m="0.17" used_g="0.50" />',
                    // '    <warning msg="bed_temperature_too_high_than_filament" level="1" error_code ="1000C001"  />',
                    '  </plate>',
                    '</config>'
                ].filter(v => v).flat().join('\n')
            },{
                name: `Metadata/project_settings.config`,
                data: JSON.stringify({},undefined,4)
            },{
                name: `Metadata/plate_1.gcode`,
                data: gcode
            },{
                name: `Metadata/plate_1.gcode.md5`,
                data: ext.md5.hash(gcode)
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
                then(output);
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
