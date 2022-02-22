/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

// dep: geo.base
// dep: kiri-mode.sla.driver
// dep: kiri-mode.sla.x_cxdlp
// dep: kiri-mode.sla.x_photon
gapp.register("kiri-mode.sla.export", [], (root, exports) => {

const { base, kiri } = root
const { driver } = kiri;
const { util } = base;
const { SLA } = driver;

/**
 * DRIVER CONTRACT - runs in worker
 * @param {Object} print state object
 * @param {Function} online streaming reply
 * @param {Function} ondone last reply
 */
SLA.export = function(print, online, ondone) {
    let widgets = print.widgets,
        settings = print.settings,
        device = settings.device,
        process = settings.process,
        width = device.resolutionX,
        height = device.resolutionY,
        scaleX = width / device.bedWidth,
        scaleY = height / device.bedDepth,
        layerZ = process.slaSlice,
        alias = process.slaAntiAlias || 1,
        mark = Date.now(),
        layermax = 0,
        volume = 0;

    // filter ignored widgets
    widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);

    // find max layer count
    widgets.forEach(widget => {
        layermax = Math.max(widget.slices.length);
    });

    let isPhoton = false;

    switch (device.deviceName) {
        case 'Anycubic.Photon':
        case 'Anycubic.Photon.S':
            isPhoton = true;
            break;
    }

    if (isPhoton) {
        let legacyMode = SLA.legacy || alias > 1,
            part1 = legacyMode ? 0.25 : 0.85,
            part2 = (1 - part1),
            images = [],
            slices = [];

        // generate layer bitmaps
        // in wasm mode, rle layers generated here, too
        let d = 8 / alias;
        let masks = [];
        for (let i=0; i<alias; i++) {
            masks.push((1 << (8 - i * d)) - 1);
        }

        let render = legacyMode ? photon.renderLayer : photon.renderLayerWasm;

        for (let index=0; index < layermax; index++) {
            let param = { index, width, height, widgets, scaleX, scaleY, masks };
            let { image, layers, end, area } = render(param);
            volume += (area * layerZ);
            images.push(image);
            slices.push(layers);
            online({
                progress: (index / layermax) * part1,
                message: "image_gen",
            });
            if (end) break;
        }

        let exp_func = {
            'Anycubic.Photon': photon.generatePhoton,
            'Anycubic.Photon.S': photon.generatePhotons,
        }[device.deviceName] || photon.generatePhoton;

        let file = exp_func(print, {
            width: width,
            height: height,
            small: SLA.previewSmall.data,
            large: SLA.previewLarge.data,
            lines: images,
            slices: slices
        }, (progress, message) => {
            online({progress: progress * part2 + part1, message});
        });
        ondone({ width, height, file, layers: images.length, volume }, [file]);
    } else {
        let part1 = 0.95;
        let part2 = 1 - part1;
        let slices = [];

        for (let index=0; index < layermax; index++) {
            let param = { index, width, height, widgets, scaleX, scaleY };
            let { lines, area } = CXDLP.render(param);
            volume += (area * layerZ);
            slices.push(lines);
            online({
                progress: (index / layermax) * part1,
                message: "image_gen"
            });
            // bail on an empty layer
            if (lines.length === 0) {
                break;
            }
        }

        // generate thumb, preview1, preview2
        let thumb = [];
        let tdata = SLA.previewSmall.data;
        for (let x=0; x<116; x++) {
            for (let y=0; y<116; y++) {
                let p = (x * 116 + y) * 4;
                let r = (tdata[p + 0] >> 3) << 11;
                let g = (tdata[p + 1] >> 2) << 5;
                let b = (tdata[p + 2] >> 3);
                let v = (r | g | b) & 0xffff;
                thumb.push((v >> 8) & 0xff);
                thumb.push(v & 0xff);
            }
        }
        let preview1 = [];
        let pdata = SLA.previewLarge.data;
        for (let x=0; x<290; x++) {
            for (let y=0; y<290; y++) {
                let p = (x * 290 + y) * 4;
                let r = (pdata[p + 0] >> 3) << 11;
                let g = (pdata[p + 1] >> 2) << 5;
                let b = (pdata[p + 2] >> 3);
                let v = (r | g | b) & 0xffff;
                preview1.push((v >> 8) & 0xff);
                preview1.push(v & 0xff);
            }
        }
        let preview2 = preview1;

        let file = CXDLP.export({
            settings,
            width,
            height,
            slices,
            thumb,
            preview1,
            preview2
        });
        ondone({
            width: width,
            height: height,
            file: file,
            layers: slices.length,
            volume
        }, [file]);
    }

    console.log('print.export', Date.now() - mark);
};

function generateCXDLP(print, conf, progress) {
    console.log({generateCXDLP: print, conf, progress});
}

});
