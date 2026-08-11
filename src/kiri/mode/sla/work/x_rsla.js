/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { JSZip } from '../../../../ext/jszip-esm.js';
import { PNG } from '../../../../ext/pngjs.esm.js';
import { photon } from './x_photon.js';
import { imageToRowMajor, renderRasterLayers, round } from './raster.js';
import { createLayerMetadata, createProcessMetadata } from './meta.js';

const FORMAT = "rsla";
const MIME = "application/vnd.gridspace.rsla+zip";

function encode(print, progress) {
    let layers = [];
    let zip = new JSZip();

    let { ctx, volume } = renderRasterLayers(print, photon, params => {
        let { index, rendered, ctx } = params;
        let { device, process, width, height } = ctx;
        let z = process.slaFirstOffset + process.slaSlice * index;
        let layerMeta = createLayerMetadata(device, process, index, z, rendered.area);

        let file = `layers/${index.toString().padStart(6, "0")}.png`;
        let layer = {
            index,
            z: layerMeta.z,
            area: layerMeta.area,
            file,
            process: layerMeta
        };

        layers.push(layer);
        zip.file(file, imageToPNG(rendered.image, width, height));
    }, progress ? (value) => progress(value * 0.85, "raster_gen") : null);

    let { device, process } = ctx;
    let manifest = createManifest({ device, process, layers, volume });
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    return zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
        streamFiles: true,
        mimeType: MIME
    }, meta => {
        if (progress) progress(0.85 + (meta.percent / 100) * 0.15, "zip_gen");
    }).then(file => {
        return { file, layers: layers.length, volume };
    });
}

function createManifest(params) {
    let { device, process, layers, volume } = params;

    return {
        format: FORMAT,
        version: device.slaFormatVersion || 1,
        units: "mm",
        coordinateSystem: {
            layerImage: "top-left",
            model: "bed-center",
            x: "right",
            y: "back",
            z: "up"
        },
        bed: {
            width: device.bedWidth,
            depth: device.bedDepth,
            height: device.maxHeight || device.bedHeight
        },
        resolution: {
            x: device.resolutionX,
            y: device.resolutionY
        },
        layerHeight: process.slaSlice,
        layerCount: layers.length,
        volume: round(volume),
        raster: {
            encoding: "png",
            color: "grayscale",
            cure: "nonzero",
            white: "cure",
            black: "off"
        },
        process: {
            ...createProcessMetadata(device, process)
        },
        layers
    };
}

function imageToPNG(image, width, height) {
    let data = imageToRowMajor(image, width, height, value => value ? 255 : 0);
    return PNG.sync.write({ width, height, data }, {
        colorType: 0,
        inputColorType: 0,
        inputHasAlpha: false
    });
}

export const RSLA = {
    encode
};
