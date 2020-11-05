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
                api.ui.act.preview.classList.add('hide');
            } else {
                api.ui.act.preview.classList.remove('hide');
            }
        });
    };

    SLA.sliceRender = function(widget) {
        // legacy debug
        return;

        widget.slices.forEach(slice => {
            let layers = slice.layers,
                outline = layers.outline,
                support = layers.support;

            if (slice.solids.unioned) {
                // console.log('solid', slice.index)
                slice.solids.unioned.forEach(poly => {
                    poly = poly.clone(true);//.move(widget.track.pos);
                    outline.poly(poly, 0x010101, true);
                    outline.solid(poly, 0x0099cc);
                });
            } else if (slice.tops) {
                // console.log('top', slice.index)
                slice.tops.forEach(top => {
                    let poly = top.poly;//.clone(true).move(widget.track.pos);
                    outline.poly(poly, 0x010101, true, false);
                    outline.solid(poly, 0xfcba03);
                });
            }

            if (slice.supports) {
                // console.log('support', slice.index)
                slice.supports.forEach(poly => {
                    //poly = poly.clone(true).move(widget.track.pos);
                    support.poly(poly, 0x010101, true, false);
                    support.solid(poly, 0xfcba03);
                });
            }

            slice.renderDiff();
            slice.renderSolidOutlines();

            outline.renderAll();
            support.renderAll();
        });
    }

    SLA.printRender = function(print) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process;

        for (let index=0; ; index++) {
            let layer = KIRI.newLayer(print.group);
            let count = 0;

            widgets.forEach(widget => {
                let slice = widget.slices[index];
                if (!slice) {
                    return;
                }
                count++;
                let polys = slice.solids.unioned;
                if (!polys) polys = slice.tops.map(t => t.poly);
                if (slice.supports) polys.appendAll(slice.supports);
                polys.forEach(poly => {
                    poly = poly.clone(true).move(widget.track.pos);
                    layer.poly(poly, 0x777777, true);
                    layer.solid(poly, 0x0099cc);
                });
            });

            layer.renderSolid();
            layer.render();

            if (count === 0) {
                // TODO fix with contract for exposing layer count
                // hack uses expected gcode output array in print object
                print.output = print.printView;
                return;
            }

            print.printView.push(layer);
        }
    }

    SLA.printDownload = function(print) {
        let { API, lines, done } = print.sla;
        let filename = `print-${new Date().getTime().toString(36)}`;

        API.ajax("/kiri/output-sla.html", html => {
            API.ui.print.innerHTML = html;

            let printset = print.settings,
                process = printset.process,
                device = printset.device,
                print_sec = (process.slaBaseLayers * process.slaBaseOn) +
                    (lines.length - process.slaBaseLayers) * process.slaLayerOn;

            // add peel lift/drop times to total print time
            for (let i=0; i<lines.length; i++) {
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
                download = $('print-photon');

            // add lift/drop time
            print_sec -= (print_min * 60);
            print_min -= (print_hrs * 60);
            print_sec = Math.round(print_sec).toString().padStart(2,'0');
            print_min = print_min.toString().padStart(2,'0');
            print_hrs = print_hrs.toString().padStart(2,'0');

            $('print-filename').value = filename;
            $('print-layers').value = lines.length;
            $('print-time').value = `${print_hrs}:${print_min}:${print_sec}`;

            switch (device.deviceName) {
                case 'Anycubic.Photon':
                    download.innerText += " .photon";
                    download.onclick = () => { saveFile(API, done.file, ".photon") };
                    break;
                case 'Anycubic.Photon.S':
                    download.innerText += " .photons";
                    download.onclick = () => { saveFile(API, done.file, ".photons") };
                    break;
            }

            let canvas = $('print-canvas');
            let ctx = canvas.getContext('2d');
            let img = ctx.createImageData(done.height, done.width);
            let imgDV = new DataView(img.data.buffer);
            let range = $('print-range');
            range.value = 0;
            range.min = 0;
            range.max = lines.length - 1;
            range.oninput = function() {
                let lineDV = new DataView(lines[range.value]);
                for (let i=0; i<lineDV.byteLength; i++) {
                    imgDV.setUint32(i*4, lineDV.getUint8(i));
                }
                ctx.putImageData(img,0,0);
                $('print-layer').innerText = range.value.padStart(4,'0');
            };

            range.oninput();
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
