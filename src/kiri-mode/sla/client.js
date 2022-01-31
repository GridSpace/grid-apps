/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        SLA = KIRI.driver.SLA;

    SLA.init = function(kiri, api) {
        api.event.on("mode.set", (mode) => {
            if (mode === 'SLA') {
                api.ui.func.preview.classList.add('hide');
            } else {
                api.ui.func.preview.classList.remove('hide');
            }
        });
    };

    SLA.printDownload = function(output, API, names) {
        const { file, width, height, layers, volume } = output;
        const fileroot = names[0] || "print";
        const filename = `${fileroot}-${new Date().getTime().toString(36)}`;

        API.ajax("/kiri/output-sla.html", html => {
            API.ui.print.innerHTML = html;

            let settings = API.conf.get(),
                process = settings.process,
                device = settings.device,
                print_sec = (process.slaBaseLayers * process.slaBaseOn) +
                    (layers - process.slaBaseLayers) * process.slaLayerOn;

            // add peel lift/drop times to total print time
            for (let i=0; i<layers; i++) {
                let dist = process.slaPeelDist,
                    lift = process.slaPeelLiftRate,
                    drop = process.slaPeelDropRate,
                    off = process.slaLayerOff;
                if (i < process.slaBaseLayers) {
                    dist = process.slaBasePeelDist;
                    lift = process.slaBasePeelLiftRate;
                    off = process.slaBaseOff;
                }
                print_sec += (dist * lift) / 60;
                print_sec += (dist * drop) / 60;
                print_sec += off;
            }

            let print_min = Math.floor(print_sec/60),
                print_hrs = Math.floor(print_min/60),
                download = $('print-sla');

            // add lift/drop time
            print_sec -= (print_min * 60);
            print_min -= (print_hrs * 60);
            print_sec = Math.round(print_sec).toString().padStart(2,'0');
            print_min = print_min.toString().padStart(2,'0');
            print_hrs = print_hrs.toString().padStart(2,'0');

            $('print-filename').value = filename;
            $('print-volume').value = (volume/1000).round(2);
            $('print-layers').value = layers;
            $('print-time').value = `${print_hrs}:${print_min}:${print_sec}`;

            switch (device.deviceName) {
                case 'Anycubic.Photon':
                    download.innerText += " .photon";
                    download.onclick = () => { saveFile(API, file, ".photon") };
                    break;
                case 'Anycubic.Photon.S':
                    download.innerText += " .photons";
                    download.onclick = () => { saveFile(API, file, ".photons") };
                    break;
                case 'Creality.Halot.Sky':
                default:
                    download.innerText += " .cxdlp";
                    download.onclick = () => { saveFile(API, file, ".cxdlp") };
                    break;
            }

            API.modal.show('print');
        });
    }

    function saveFile(API, file, ext) {
        saveAs(
            new Blob([file], { type: "application/octet-stream" }),
            $('print-filename').value + ext);
        API.modal.hide();
    }

})();
