/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { client } from './workers.js';
import { local } from '../../data/local.js';
import { util } from '../../geo/base.js';
import { MODES } from '../core/consts.js';
import { LASER as laser_driver } from '../mode/laser/driver.js';
import { SLA as sla_client } from '../mode/sla/init-ui.js';
import { hash } from '../../ext/md5.js';

/**
 * Sequential print counter for generating unique export filenames.
 * Increments with each export and persists in local storage.
 */
let printSeq = parseInt(local['kiri-print-seq'] || local['print-seq'] || "0") + 1;

function localGet(key) {
    return api.local.get(key);
}

function localSet(key, val) {
    return api.local.set(key, val);
}

/**
 * Main export entry point. Dispatches to mode-specific export handlers.
 * Extracts widget filenames to use for export filename suggestions.
 * @param {object} options - Export options (mode-specific)
 * @returns {*} Result from mode-specific export handler
 */
export function exportFile(options) {
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

/**
 * Export gcode for FDM or CAM modes.
 * Calls worker to generate gcode, then presents dialog or invokes callback.
 * @param {function} callback - Optional callback(gcode_string, output_info)
 * @param {string} mode - Current mode ('FDM' or 'CAM')
 * @param {string[]} names - Widget filenames for export naming
 */
function callExport(callback, mode, names) {
    let alert = api.feature.work_alerts ? api.show.alert("Exporting") : null;
    let gcode = [];
    let section = [];
    let sections = { };
    client.export(api.conf.get(), (line) => {
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

/**
 * Export laser/waterjet/drag knife toolpaths.
 * Worker generates output, then presents export dialog with SVG/DXF/STL/GCode options.
 * @param {object} options - Export options
 * @param {string[]} names - Widget filenames for export naming
 */
function callExportLaser(options, names) {
    client.export(api.conf.get(), (line) => {
        // engine export uses lines
        // console.log({unexpected_line: line});
    }, (output, error) => {
        // UI export uses output
        if (error) {
            api.show.alert(error, 5);
        } else {
            exportLaserDialog(output, names);
        }
    });
}

/**
 * Export SLA print data.
 * Worker generates layer images, then delegates to SLA client for download.
 * @param {object} options - Export options
 * @param {string[]} names - Widget filenames for export naming
 */
function callExportSLA(options, names) {
    client.export(api.conf.get(), (line) => {
        api.show.progress(line.progress, "exporting");
    }, (output, error) => {
        api.show.progress(0);
        if (error) {
            api.show.alert(error, 5);
        } else {
            sla_client.printDownload(output, api, names);
        }
    });
}

/**
 * Present laser export dialog with format options (SVG, DXF, STL, GCode).
 * Sets up UI handlers for downloading in each supported format.
 * @param {Array} data - Layer data from export worker
 * @param {string[]} names - Widget filenames for naming suggestion
 */
function exportLaserDialog(data, names) {
    localSet('kiri-print-seq', printSeq++);

    const fileroot = names[0] || "laser";
    const filename = `${fileroot}-${(printSeq.toString().padStart(3,"0"))}`;
    const settings = api.conf.get();
    const driver = laser_driver;
    const { process } = settings;
    if (process.ctOutStack) {
        $('print-obj').classList.remove('hide');
    } else {
        $('print-obj').classList.add('hide');
    }

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

    function download_obj() {
        api.util.download(
            driver.exportOBJ(settings, data),
            $('print-filename-laser').value + ".obj"
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
    $('print-obj').onclick = download_obj;
    $('print-lg').onclick = download_gcode;
}

/**
 * Bind an input field to persist its value to local storage on blur.
 * @param {string} field - Element ID of the input field
 * @param {string} varname - Local storage key to save value under
 */
function bindField(field, varname) {
    $(field).onblur = function() {
        console.log('save', field, 'to', varname);
        localSet(varname, $(field).value.trim());
    };
}

/**
 * Present gcode export dialog with download/send options.
 * Complex UI setup that handles:
 * - Local download of gcode, zip (CAM operations), or 3MF (FDM)
 * - OctoPrint integration for remote printing
 * - Bambu printer integration (via api.bambu)
 * - Print statistics (time, filament, weight)
 * - Gcode preview
 * @param {string[]} gcode - Array of gcode lines
 * @param {object} [sections] - CAM operation sections for zip export
 * @param {object} info - Export metadata (time, distance, bytes, etc.)
 * @param {string[]} names - Widget filenames for naming suggestion
 */
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
                api.stats.add(`ua_${api.mode.get_lower()}_print_octo_${status}`);
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
        let cam = MODE === MODES.CAM;
        let octo = set.controller.exportOcto && !cam;
        let preview = set.controller.exportPreview;
        $('code-preview-head').style.display = preview ? '' : 'none';
        $('code-preview').style.display = preview ? '' : 'none';
        $('print-download').onclick = download;
        $('print-filament').style.display = fdm ? '' : 'none';
        $('print-filename').value = filename;
        $('print-filesize').value = util.comma(info.bytes);
        $('print-length').value = Math.round(info.distance);
        if ((fdm || cam) && preview && set.controller.devel) {
            document.body.classList.add('devel');
        }
        calcTime();
        if (fdm) {
            calcWeight();
        }

        // persist fields when changed
        bindField('octo-host', 'octo-host');
        bindField('octo-apik', 'octo-apik');

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
            client.zip(files, progress => {
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

        /**
         * Generate 3MF file for Bambu/BambuStudio printers.
         * Creates ZIP archive with gcode, thumbnails, and metadata.
         * @param {function} then - Callback to receive generated 3MF blob
         * @param {string} [ptype='unknown'] - Printer type identifier
         * @param {number[]} [ams=[0]] - AMS (filament) slot assignments
         */
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
                data: hash(gcode)
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
            client.zip(files, progress => {
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
            }
            octo_host.value = localGet('octo-host') || '';
            octo_apik.value = localGet('octo-apik') || '';
        } catch (e) { console.log(e) }

        // preview of the generated GCODE (first 64k max)
        if (preview && gcode) $('code-preview-textarea').value = gcode.substring(0,65535);
}
