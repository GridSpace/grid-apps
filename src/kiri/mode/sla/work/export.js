/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CXDLP } from './x_cxdlp.js';
import { CTB } from './x_ctb.js';
import { photon } from './x_photon.js';
import { PW } from './x_pw.js';
import { GOO } from './x_goo.js';
import { SLA } from './init-work.js';
import { RSLA } from './x_rsla.js';
import { VSLA } from './x_vsla.js';
import { getSLAFormat } from '../core/formats.js';

/**
 * DRIVER CONTRACT - runs in worker
 * @param {Object} print state object
 * @param {Function} online streaming reply
 * @param {Function} ondone last reply
 */
export function sla_export(print, online, ondone) {
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

    let format = getSLAFormat(device);

    if (format === 'vsla') {
        return VSLA.encode(print, (progress, message) => {
            online({ progress, message });
        }).then(output => {
            let { file, layers, volume } = output;
            ondone({ width, height, file, layers, volume }, [file]);
        });
    }

    if (format === 'rsla') {
        return RSLA.encode(print, (progress, message) => {
            online({ progress, message });
        }).then(output => {
            let { file, layers, volume } = output;
            ondone({ width, height, file, layers, volume }, [file]);
        });
    }

    if (format === 'ctb') {
        return CTB.encode(print, (progress, message) => {
            online({ progress, message });
        }, photon).then(output => {
            let { file, layers, volume } = output;
            ondone({ width, height, file, layers, volume }, [file]);
        });
    }

    if (PW.supports(format)) {
        return PW.encode(print, (progress, message) => {
            online({ progress, message });
        }, photon).then(output => {
            let { file, layers, volume } = output;
            ondone({ width, height, file, layers, volume }, [file]);
        });
    }

    if (GOO.supports(format)) {
        return GOO.encode(print, (progress, message) => {
            online({ progress, message });
        }, photon).then(output => {
            let { file, layers, volume } = output;
            ondone({ width, height, file, layers, volume }, [file]);
        });
    }

    if (format === 'photon' || format === 'photons') {
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
            photon: photon.generatePhoton,
            photons: photon.generatePhotons,
        }[format] || photon.generatePhoton;

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

export function generateCXDLP(print, conf, progress) {
    console.log({generateCXDLP: print, conf, progress});
}
