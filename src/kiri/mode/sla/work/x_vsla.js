/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { JSZip } from '../../../../ext/jszip-esm.js';
import { createLayerMetadata, createProcessMetadata, round } from './meta.js';

const FORMAT = "vsla";
const MIME = "application/vnd.gridspace.vsla+zip";

function encode(print, progress) {
    let { settings, widgets } = print;
    let { device, process } = settings;
    let layermax = 0;

    widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);
    widgets.forEach(widget => {
        layermax = Math.max(layermax, widget.slices.length);
    });

    let layers = [];
    let volume = 0;
    for (let index=0; index<layermax; index++) {
        let layer = collectLayer({ index, widgets, device, process });
        volume += layer.area * process.slaSlice;
        layers.push(layer);
        if (progress) progress((index / layermax) * 0.7, "vector_gen");
    }

    while (layers.length && layers.last().polygons.length === 0) {
        layers.pop();
    }

    let manifest = createManifest({ device, process, layers, volume });
    let zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    layers.forEach(layer => {
        zip.file(layer.file, createLayerSVG({ device, layer }));
    });

    return zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
        streamFiles: true,
        mimeType: MIME
    }, meta => {
        if (progress) progress(0.7 + (meta.percent / 100) * 0.3, "zip_gen");
    }).then(file => {
        return { file, layers: layers.length, volume };
    });
}

function collectLayer(params) {
    let { index, widgets, device, process } = params;
    let polygons = [];
    let area = 0;
    let z = process.slaFirstOffset + process.slaSlice * index;

    widgets.forEach(widget => {
        let slice = widget.slices[index];
        if (!slice) return;

        let polys = slice.unioned;
        if (!polys) polys = slice.tops.map(t => t.poly);
        polys = polys ? polys.slice() : [];
        if (slice.supports) polys.appendAll(slice.supports);

        polygons.appendAll(polys.map(poly => {
            let moved = poly.clone(true).move(widget.track.pos);
            area += moved.areaDeep();
            return moved;
        }));

        if (slice.z !== undefined) {
            z = slice.z;
        }
    });

    let layerMeta = createLayerMetadata(device, process, index, z, area);

    return {
        index,
        z: layerMeta.z,
        area: layerMeta.area,
        file: `layers/${index.toString().padStart(6, "0")}.svg`,
        process: layerMeta,
        polygons
    };
}

function createManifest(params) {
    let { device, process, layers, volume } = params;
    let layerList = layers.map(layer => {
        return {
            index: layer.index,
            z: layer.z,
            area: layer.area,
            file: layer.file,
            empty: layer.polygons.length === 0,
            process: layer.process
        };
    });

    return {
        format: FORMAT,
        version: device.slaFormatVersion || 1,
        units: "mm",
        coordinateSystem: {
            layerSvg: "top-left",
            model: "bed-center",
            x: "right",
            y: "back",
            z: "up"
        },
        cure: {
            geometry: "filled-svg-paths",
            fill: "#000",
            fillRule: "evenodd",
            background: "transparent"
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
        process: {
            ...createProcessMetadata(device, process)
        },
        layers: layerList
    };
}

function createLayerSVG(params) {
    let { device, layer } = params;
    let width = round(device.bedWidth);
    let depth = round(device.bedDepth);
    let body = layer.polygons.map(poly => {
        return `  <path fill="#000" fill-rule="evenodd" d="${polyToPath(poly, device)}"/>`;
    }).join("\n");

    let proc = layer.process;
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}mm" height="${depth}mm" viewBox="0 0 ${width} ${depth}" data-layer="${layer.index}" data-z="${layer.z}" data-exposure="${proc.exposure}" data-light-off-delay="${proc.lightOffDelay}" data-light-pwm="${proc.lightPWM}" data-bottom="${proc.bottom}" data-transition="${proc.transition}">`,
        body,
        `</svg>`,
        ``
    ].join("\n");
}

function polyToPath(poly, device) {
    let parts = [];
    appendPoly(parts, poly, device);
    return parts.join(" ");
}

function appendPoly(parts, poly, device) {
    appendPath(parts, poly, device);
    if (poly.inner) {
        poly.inner.forEach(inner => appendPoly(parts, inner, device));
    }
}

function appendPath(parts, poly, device) {
    let points = poly.points || [];
    if (points.length === 0) return;

    points.forEach((point, index) => {
        let x = round(point.x + device.bedWidth / 2);
        let y = round(device.bedDepth - (point.y + device.bedDepth / 2));
        parts.push(`${index === 0 ? "M" : "L"}${x},${y}`);
    });
    parts.push("Z");
}

export const VSLA = {
    encode
};
