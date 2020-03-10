/** Copyright Stewart Allen -- All Rights Reserved */

"use strict";

let gs_kiri_export = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (self.kiri.export) return;

    let KIRI = self.kiri,
        WIN = self.window,
        DOC = self.document,
        LOC = self.location,
        API = KIRI.api,
        SDB = API.sdb,
        UI = API.ui,
        UC = API.uc,
        STATS = API.stats,
        MODES = API.const.MODES,
        printSeq = parseInt(SDB['kiri-print-seq'] || SDB['print-seq'] || "0") + 1;

    KIRI.export = exportPrint;

    function exportPrint() {
        let currentPrint = API.print.get();
        if (!currentPrint) {
            API.function.print(exportPrint);
            return;
        }
        STATS.add(`ua_${API.mode.get_lower()}_export`);
        switch (API.mode.get()) {
            case 'LASER': return exportPrintLaser(currentPrint);
            case 'FDM': return exportPrintGCODE(currentPrint);
            case 'CAM': return exportPrintGCODE(currentPrint);
        }
    }

    function exportPrintGCODE(currentPrint) {
        if (!currentPrint) {
            API.function.print(exportPrint);
            return;
        }
        currentPrint.exportGCode(true, function(gcode) {
            exportGCode(gcode,currentPrint);
        });
    }

    function exportPrintLaser(currentPrint) {
        if (!currentPrint) {
            API.function.print(exportPrintLaser);
            return;
        }

        let filename = "laser-"+(new Date().getTime().toString(36));

        function download_svg() {
            saveAs(new Blob(
                [currentPrint.exportSVG($('print-color').value)],
                {type:"application/octet-stream"}),
                $('print-filename').value + ".svg");
        }

        function download_dxf() {
            saveAs(new Blob(
                [currentPrint.exportDXF()],
                {type:"application/octet-stream"}),
                $('print-filename').value + ".dxf");
        }

        function download_gcode() {
            saveAs(new Blob(
                [currentPrint.exportLaserGCode()],
                {type:"application/octet-stream"}),
                $('print-filename').value + ".gcode");
        }

        API.ajax("/kiri/output-laser.html", function(html) {
            let segments = 0;
            currentPrint.output.forEach(layer => { segments += layer.length });
            UI.print.innerHTML = html;
            $('print-filename').value = filename;
            $('print-lines').value = segments;
            $('print-close').onclick = API.modal.hide;
            $('print-svg').onclick = download_svg;
            $('print-dxf').onclick = download_dxf;
            $('print-lg').onclick = download_gcode;
            API.modal.show('print');
        });
    }

    function exportGCode(gcode, currentPrint) {
        SDB['kiri-print-seq'] = printSeq++;

        let settings = API.conf.get(),
            MODE = API.mode.get_id(),
            pre = (MODE === MODES.CAM ? "cnc-" : "print-") + (printSeq.toString().padStart(3,"0")),
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
                API.show.alert("host missing protocol (http:// or https://)");
                return;
            }
            if (SECURE && !isSecure(host)) {
                API.show.alert("host must begin with 'https' on a secure site");
                return;
            }

            SDB['octo-host'] = host.trim();
            SDB['octo-apik'] = apik.trim();

            filename = $('print-filename').value;
            form.append("file", getBlob(), filename+"."+fileext);
            ajax.onreadystatechange = function() {
                if (ajax.readyState === 4) {
                    let status = ajax.status;
                    STATS.add(`ua_${getModeLower()}_print_octo_${status}`);
                    if (status >= 200 && status < 300) {
                        API.modal.hide();
                    } else {
                        API.show.alert("octoprint error\nstatus: "+status+"\nmessage: "+ajax.responseText);
                    }
                }
            };
            ajax.upload.addEventListener('progress', function(evt) {
                setProgress(Math.ceil(evt.loaded/evt.total), "sending");
            });
            ajax.open("POST", host+"/api/files/local");
            ajax.setRequestHeader("X-Api-Key", apik);
            ajax.send(form);
        }

        function gridhost_tracker(host,key) {
            ajax(host+"/api/check?key="+key, function(data) {
                data = js2o(data);
                DBUG.log(data);
                if (!(data.done || data.error)) {
                    setTimeout(function() { gridhost_tracker(host,key) }, 1000);
                }
            });
        }

        function gridlocal_probe(ev, devs) {
            if (ev && ev.code !== 'Enter') return;

            if (!devs && API.probe.local(gridlocal_probe)) return;

            grid_local = devs;

            let html = [];
            for (let uuid in devs) {
                let dev = devs[uuid];
                html.push(`<option id="gl-${uuid}" value="${uuid}">${dev.stat.device.name}</option>`);
            }
            $('grid-local').innerHTML = html.join('\n');
        }

        function sendto_gridlocal() {
            let uuid = $('grid-local').value;
            let dev = grid_local[uuid];
            if (dev) {
                let file = $('print-filename').value;
                fetch(
                    `/api/grid_send?uuid=${uuid}&file=${encodeURIComponent(file + "." + fileext)}`,
                    {method: "POST", body: gcode}
                )
                .then(t => t.text())
                .then(t => {
                    STATS.add(`ua_${getModeLower()}_print_local_ok`);
                    console.log({grid_spool_said: t});
                })
                .catch(e => {
                    STATS.add(`ua_${getModeLower()}_print_local_err`);
                    console.log({grid_local_spool_error: e});
                })
                .finally(() => {
                    API.modal.hide();
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

            if (!host && API.probe.grid(gridhost_probe)) return;

            if (!host) return;

            xhtr.onreadystatechange = function() {
                if (xhtr.readyState === 4) {
                    if (xhtr.status >= 200 && xhtr.status < 300) {
                        SDB['grid-host'] = host;
                        SDB['grid-apik'] = apik;
                        let res = JSON.parse(xhtr.responseText);
                        let sel = false;
                        let match = false;
                        let first = null;
                        let html = [];
                        grid_targets = {};
                        for (let key in res) {
                            first = first || key;
                            if (!SDB['grid-target']) {
                                SDB['grid-target'] = key;
                                sel = true;
                            } else {
                                sel = SDB['grid-target'] === key;
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
                            SDB['grid-target'] = first;
                        }
                        grid_target.innerHTML = html.join('\n');
                    } else if (xhtr.status === 401) {
                        $('gpapik').style.display = '';
                    } else {
                        SDB.removeItem('grid-host');
                        SDB.removeItem('grid-apik');
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
                target = SDB['grid-target'] || '';

            if (target === '') {
                API.show.alert('invalid or missing target');
                return;
            }
            if (host.indexOf("http") !== 0) {
                API.show.alert("host missing protocol (http:// or https://)");
                return;
            }
            if (host.indexOf("://") < 0) {
                API.show.alert("host:port malformed");
                return;
            }
            if (SECURE && !isSecure(host)) {
                API.show.alert("host must begin with 'https' on a secure site");
                return;
            }

            SDB['grid-host'] = host.trim();
            SDB['grid-apik'] = apik.trim();

            xhtr.onreadystatechange = function() {
                if (xhtr.readyState === 4) {
                    let status = xhtr.status;
                    STATS.add(`ua_${getModeLower()}_print_grid_${status}`);
                    if (status >= 200 && status < 300) {
                        let json = js2o(xhtr.responseText);
                        gridhost_tracker(host,json.key);
                        API.ajax(host+"/api/wait?key="+json.key, function(data) {
                            data = js2o(data);
                            DBUG.log(data);
                            API.show.alert("print to "+target+": "+data.status, 600);
                        });
                    } else {
                        API.show.alert("grid:host error\nstatus: "+status+"\nmessage: "+xhtr.responseText, 10000);
                    }
                    setProgress(0);
                }
            };
            xhtr.upload.addEventListener('progress', function(evt) {
                setProgress(Math.ceil(evt.loaded/evt.total), "sending");
            });
            filename = $('print-filename').value;
            xhtr.open("POST",
                host + "/api/print?" +
                "filename=" + filename +
                "&target=" + target +
                "&key=" + apik +
                "&time=" + Math.round(currentPrint.time) +
                "&length=" + Math.round(currentPrint.distance) +
                "&image=" + filename
            );
            xhtr.setRequestHeader("Content-Type", "text/plain");
            xhtr.send(screenShot ? [gcode,screenShot].join("\0") : gcode);
            API.modal.hide();
        }

        function download() {
            filename = $('print-filename').value;
            saveAs(getBlob(), filename + "." + fileext);
        }

        function pad(v) {
            v = v.toString();
            return v.length < 2 ? '0' + v : v;
        }

        function calcWeight() {
            try {
            $('print-weight').value = (
                UTIL.round((Math.PI * UTIL.sqr(currentPrint.settings.device.filamentSize/2)) * currentPrint.distance * 1.25 / 1000, 2)
            );
            } catch (e) { }
        }

        function calcTime() {
            let floor = Math.floor,
                time = floor(currentPrint.time),
                hours = floor(time / 3600),
                newtime = time - hours * 3600,
                mins = floor(newtime / 60),
                secs = newtime - mins * 60;

            $('mill-time').value = $('print-time').value = [pad(hours),pad(mins),pad(secs)].join(':');
        }

        API.ajax("/kiri/output-gcode.html", function(html) {
            UI.print.innerHTML = html;
            $('print-close').onclick = API.modal.hide;
            $('print-download').onclick = download;
            $('print-octoprint').onclick = sendto_octoprint;
            $('print-gridhost').onclick = sendto_gridhost;
            $('print-gridlocal').onclick = sendto_gridlocal;
            $('admin-gridlocal').onclick = admin_gridlocal;
            $('print-filament-row').style.display = MODE === MODES.FDM ? '' : 'none';
            $('mill-info').style.display = MODE === MODES.CAM ? '' : 'none';
            $('print-filename').value = filename;
            $('print-filesize').value = currentPrint.bytes;
            $('print-filament').value = Math.round(currentPrint.distance);
            $('grid-host').onkeyup = gridhost_probe;
            $('grid-apik').onkeyup = gridhost_probe;
            calcTime();
            if (MODE === MODES.FDM) calcWeight();
            octo_host = $('octo-host');
            octo_apik = $('octo-apik');
            if (MODE === MODES.CAM) {
                $('send-to-octoprint').style.display = 'none';
            } else {
                $('send-to-octoprint').style.display = '';
            }
            // hide octoprint when hard-coded in the url
            if (API.const.OCTO) {
                $('ophost').style.display = 'none';
                $('opapik').style.display = 'none';
                $('ophint').style.display = 'none';
                $('send-to-gridhost').style.display = 'none';
            }
            octo_host.value = SDB['octo-host'] || '';
            octo_apik.value = SDB['octo-apik'] || '';
            grid_host = $('grid-host');
            grid_apik = $('grid-apik');
            grid_target = $('grid-target');
            grid_target.onchange = function(ev) {
                SDB['grid-target'] = grid_targets[grid_target.selectedIndex];
            };
            grid_host.value = SDB['grid-host'] || '';
            grid_apik.value = SDB['grid-apik'] || '';
            gridhost_probe();
            gridlocal_probe();
            API.modal.show('print');
        });
    }

})();
