/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { JSZip } from '../../../../ext/jszip-esm.js';
import { PNG } from '../../../../ext/pngjs.esm.js';
import { imageToRowMajor, renderRasterLayers, round } from './raster.js';
import { ctbLayerCrypt } from './x_ctb_crypto.js';

const CTB_V3_MAGIC = 0x12fd0086;
const HEADER_SIZE = 0x70;
const LAYER_TABLE_RECORD_SIZE = 36;
const LAYER_FULL_RECORD_SIZE = 84;
const PRINT_PARAMS_SIZE = 60;
const MACHINE_INFO_SIZE = 76;
const RSLA_MIME = "application/vnd.gridspace.rsla+zip";

function encode(print, progress, renderer) {
    if (renderer) {
        return Promise.resolve(encodeWithPhoton(print, progress, renderer));
    }
    return import('./x_photon.js').then(({ photon }) =>
        encodeWithPhoton(print, progress, photon));
}

function encodeWithPhoton(print, progress, photon) {
    let layers = [];
    let seed = makeSeed(print);
    let previews = [
        createPreview(400, 300),
        createPreview(200, 125)
    ];

    let { ctx, volume } = renderRasterLayers(print, photon, params => {
        let { index, rendered, bottom, z, ctx } = params;
        let { process, width, height } = ctx;

        let pixels = renderToCTBPixels(rendered.image, width, height);
        let encoded = encipher(seed, index, encodeRLE(pixels));
        previews.forEach(preview => accumulatePreview(preview, rendered.image, width, height));

        layers.push({
            index,
            z,
            exposure: bottom ? process.slaBaseOn : process.slaLayerOn,
            lightOffDelay: bottom ? process.slaBaseOff : process.slaLayerOff,
            liftDistance: bottom ? process.slaBasePeelDist : process.slaPeelDist,
            liftSpeed: (bottom ? process.slaBasePeelLiftRate : process.slaPeelLiftRate) * 60,
            data: encoded
        });
    }, progress ? (value) => progress(value * 0.85, "ctb_encode") : null);

    let { device, process } = ctx;
    let file = writeCTB({ device, process, layers, volume, seed, previews });
    if (progress) progress(1, "ctb_write");

    return { file, layers: layers.length, volume };
}

function read(input) {
    let view = input instanceof DataView
        ? input
        : new DataView(input.buffer || input, input.byteOffset || 0, input.byteLength);

    let header = readHeader(view);
    let layers = readLayerTable(view, header);

    return {
        header,
        print: readPrintParams(view, header),
        machine: readMachineName(view, header),
        previews: readPreviews(view, header),
        layers,
        layout: inferLayout(header, layers)
    };
}

function toRSLA(input, progress) {
    let view = toDataView(input);
    let ctb = read(view);
    let { header, layers } = ctb;
    let zip = new JSZip();
    let rslaLayers = [];

    layers.forEach((layer, index) => {
        let pixels = decodeLayer(view, header, layer);
        let file = `layers/${index.toString().padStart(6, "0")}.png`;
        zip.file(file, imageToPNG(pixels, header.resolutionX, header.resolutionY));
        rslaLayers.push({
            index,
            z: round(layer.z),
            exposure: round(layer.exposure),
            lightOffDelay: round(layer.lightOffDelay),
            source: {
                offset: layer.imageOffset,
                length: layer.imageLength
            },
            file
        });
        if (progress) progress((index / layers.length) * 0.85, "ctb_decode");
    });

    zip.file("manifest.json", JSON.stringify(createRSLAManifest(ctb, rslaLayers), null, 2));

    return zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
        streamFiles: true,
        mimeType: RSLA_MIME
    }, meta => {
        if (progress) progress(0.85 + (meta.percent / 100) * 0.15, "zip_gen");
    });
}

function decodeLayer(view, header, layer) {
    let data = new Uint8Array(
        view.buffer,
        view.byteOffset + layer.imageOffset,
        layer.imageLength
    );
    let decoded = decodeRLE(decipher(header.encryptionSeed, layer.index, data),
        header.resolutionX * header.resolutionY);
    return decoded;
}

function writeCTB(params) {
    let { device, process, layers, volume, seed, previews } = params;
    let machine = device.deviceName || "Generic CTB";
    let machineBytes = new TextEncoder().encode(machine);
    let previewData = previews.map(encodePreview);
    let printTime = Math.round((process.slaBaseLayers * process.slaBaseOn) +
        Math.max(0, layers.length - process.slaBaseLayers) * process.slaLayerOn);
    let previewLargeOffset = HEADER_SIZE;
    let previewLargeDataOffset = previewLargeOffset + 32;
    let previewSmallOffset = previewLargeDataOffset + previewData[0].length;
    let previewSmallDataOffset = previewSmallOffset + 32;
    let printParamsOffset = previewSmallDataOffset + previewData[1].length;
    let machineInfoOffset = printParamsOffset + PRINT_PARAMS_SIZE;
    let nameOffset = machineInfoOffset + MACHINE_INFO_SIZE;
    let layerTableOffset = nameOffset + machineBytes.length;
    let imageOffset = layerTableOffset + layers.length * LAYER_TABLE_RECORD_SIZE;

    layers.forEach(layer => {
        layer.fullOffset = imageOffset;
        layer.imageOffset = imageOffset + LAYER_FULL_RECORD_SIZE;
        layer.imageLength = layer.data.length;
        layer.blockLength = LAYER_FULL_RECORD_SIZE + layer.imageLength;
        imageOffset = layer.imageOffset + layer.imageLength;
    });

    let buffer = new ArrayBuffer(imageOffset);
    let writer = new BinaryWriter(buffer);

    writeHeader(writer, {
        device,
        process,
        layers,
        seed,
        printTime,
        previewLargeOffset,
        previewSmallOffset,
        printParamsOffset,
        machineInfoOffset,
        layerTableOffset
    });
    writer.seek(previewLargeOffset);
    writePreviewRecord(writer, previews[0], previewLargeDataOffset, previewData[0]);
    writer.seek(previewLargeDataOffset);
    writer.writeBytes(previewData[0]);
    writer.seek(previewSmallOffset);
    writePreviewRecord(writer, previews[1], previewSmallDataOffset, previewData[1]);
    writer.seek(previewSmallDataOffset);
    writer.writeBytes(previewData[1]);
    writer.seek(printParamsOffset);
    writePrintParams(writer, { process, volume });
    writer.seek(machineInfoOffset);
    writeMachineInfo(writer, { machineBytes, nameOffset });
    writer.seek(nameOffset);
    writer.writeBytes(machineBytes);
    writer.seek(layerTableOffset);
    layers.forEach(layer => writeLayerRecord(writer, layer));
    layers.forEach(layer => {
        writer.seek(layer.fullOffset);
        writeFullLayerRecord(writer, layer);
        writer.writeBytes(layer.data);
    });

    return buffer;
}

function writeHeader(writer, params) {
    let {
        device, process, layers, seed, printTime,
        previewLargeOffset, previewSmallOffset,
        printParamsOffset, machineInfoOffset, layerTableOffset
    } = params;

    writer.writeU32(CTB_V3_MAGIC);
    writer.writeU32(3);
    writer.writeF32(device.bedWidth);
    writer.writeF32(device.bedDepth);
    writer.writeF32(device.maxHeight || device.bedHeight);
    writer.skip(12);
    writer.writeF32(process.slaSlice);
    writer.writeF32(process.slaLayerOn);
    writer.writeF32(process.slaBaseOn);
    writer.writeF32(process.slaLayerOff);
    writer.writeU32(process.slaBaseLayers);
    writer.writeU32(device.resolutionX);
    writer.writeU32(device.resolutionY);
    writer.writeU32(previewLargeOffset);
    writer.writeU32(layerTableOffset);
    writer.writeU32(layers.length);
    writer.writeU32(previewSmallOffset);
    writer.writeU32(printTime);
    writer.writeU32(1);
    writer.writeU32(printParamsOffset);
    writer.writeU32(PRINT_PARAMS_SIZE);
    writer.writeU32(process.slaAntiAlias || 1);
    writer.writeU16(0x00ff);
    writer.writeU16(0x00ff);
    writer.writeU32(seed);
    writer.writeU32(machineInfoOffset);
    writer.writeU32(MACHINE_INFO_SIZE);
}

function writePreviewRecord(writer, preview, dataOffset, data) {
    writer.writeU32(preview.width);
    writer.writeU32(preview.height);
    writer.writeU32(dataOffset);
    writer.writeU32(data.length);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
}

function writePrintParams(writer, params) {
    let { process, volume } = params;

    writer.writeF32(process.slaBasePeelDist);
    writer.writeF32(process.slaBasePeelLiftRate * 60);
    writer.writeF32(process.slaPeelDist);
    writer.writeF32(process.slaPeelLiftRate * 60);
    writer.writeF32(process.slaPeelDropRate * 60);
    writer.writeF32(volume);
    writer.writeF32(0);
    writer.writeF32(0);
    writer.writeF32(process.slaBaseOff);
    writer.writeF32(process.slaLayerOff);
    writer.writeU32(process.slaBaseLayers);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
}

function writeMachineInfo(writer, params) {
    let { machineBytes, nameOffset } = params;

    writer.skip(0x1c);
    writer.writeU32(nameOffset);
    writer.writeU32(machineBytes.length);
    writer.writeU32(machineBytes.length);
    writer.writeU32(0x2000000f);
    writer.writeU32(0x01c45dd1);
    writer.writeU32(8);
    writer.writeU32(0x01080000);
    writer.writeF32(6.8);
    writer.writeU32(0);
    writer.writeU32(10);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
}

function writeLayerRecord(writer, layer) {
    writer.writeF32(layer.z);
    writer.writeF32(layer.exposure);
    writer.writeF32(layer.lightOffDelay);
    writer.writeU32(layer.imageOffset);
    writer.writeU32(layer.imageLength);
    writer.writeU32(0);
    writer.writeU32(LAYER_FULL_RECORD_SIZE);
    writer.writeU32(0);
    writer.writeU32(0);
}

function writeFullLayerRecord(writer, layer) {
    writeLayerRecord(writer, layer);
    writer.writeU32(layer.blockLength);
    writer.writeF32(layer.liftDistance);
    writer.writeF32(layer.liftSpeed);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeU32(0);
    writer.writeF32(0);
    writer.writeF32(0x00ff);
}

function readHeader(view) {
    let magic = view.getUint32(0, true);
    let version = view.getUint32(4, true);
    if (magic !== CTB_V3_MAGIC) {
        throw new Error(`invalid CTB magic 0x${magic.toString(16)}`);
    }
    if (version !== 3) {
        throw new Error(`unsupported CTB version ${version}`);
    }

    return {
        magic,
        version,
        bedWidth: view.getFloat32(0x08, true),
        bedDepth: view.getFloat32(0x0c, true),
        bedHeight: view.getFloat32(0x10, true),
        layerHeight: view.getFloat32(0x20, true),
        exposure: view.getFloat32(0x24, true),
        bottomExposure: view.getFloat32(0x28, true),
        lightOffDelay: view.getFloat32(0x2c, true),
        bottomLayers: view.getUint32(0x30, true),
        resolutionX: view.getUint32(0x34, true),
        resolutionY: view.getUint32(0x38, true),
        previewOffset: view.getUint32(0x3c, true),
        previewLargeOffset: view.getUint32(0x3c, true),
        layerTableOffset: view.getUint32(0x40, true),
        layerCount: view.getUint32(0x44, true),
        previewSmallOffset: view.getUint32(0x48, true),
        printParamsOffset: view.getUint32(0x54, true),
        printParamsLength: view.getUint32(0x58, true),
        antiAliasLevel: view.getUint32(0x5c, true),
        lightPWM: view.getUint16(0x60, true),
        bottomLightPWM: view.getUint16(0x62, true),
        encryptionSeed: view.getUint32(0x64, true),
        machineInfoOffset: view.getUint32(0x68, true),
        machineInfoLength: view.getUint32(0x6c, true)
    };
}

function readPreviews(view, header) {
    return [header.previewLargeOffset, header.previewSmallOffset]
        .filter(offset => offset > 0)
        .map((offset, index) => readPreviewRecord(view, offset, index));
}

function readPreviewRecord(view, offset, index) {
    return {
        index,
        offset,
        width: view.getUint32(offset + 0, true),
        height: view.getUint32(offset + 4, true),
        imageOffset: view.getUint32(offset + 8, true),
        imageLength: view.getUint32(offset + 12, true),
        unknown16: view.getUint32(offset + 16, true),
        unknown20: view.getUint32(offset + 20, true),
        unknown24: view.getUint32(offset + 24, true),
        unknown28: view.getUint32(offset + 28, true)
    };
}

function readLayerTable(view, header) {
    let layers = [];
    let offset = header.layerTableOffset;

    for (let index=0; index<header.layerCount; index++) {
        layers.push(readLayerRecord(view, header, offset, index));
        offset += LAYER_TABLE_RECORD_SIZE;
    }

    return layers;
}

function readLayerRecord(view, header, offset, index) {
    let record = {
        index,
        tableOffset: offset,
        z: view.getFloat32(offset + 0, true),
        exposure: view.getFloat32(offset + 4, true),
        lightOffDelay: view.getFloat32(offset + 8, true),
        imageOffset: view.getUint32(offset + 12, true),
        imageLength: view.getUint32(offset + 16, true),
        unknown20: view.getUint32(offset + 20, true),
        fullRecordLength: view.getUint32(offset + 24, true),
        unknown28: view.getUint32(offset + 28, true),
        unknown32: view.getUint32(offset + 32, true)
    };
    let fullOffset = record.imageOffset - LAYER_FULL_RECORD_SIZE;
    if (fullOffset >= header.layerTableOffset) {
        record.full = readFullLayerRecord(view, fullOffset);
    }
    return record;
}

function readFullLayerRecord(view, offset) {
    return {
        offset,
        z: view.getFloat32(offset + 0, true),
        exposure: view.getFloat32(offset + 4, true),
        lightOffDelay: view.getFloat32(offset + 8, true),
        imageOffset: view.getUint32(offset + 12, true),
        imageLength: view.getUint32(offset + 16, true),
        unknown20: view.getUint32(offset + 20, true),
        fullRecordLength: view.getUint32(offset + 24, true),
        unknown28: view.getUint32(offset + 28, true),
        unknown32: view.getUint32(offset + 32, true),
        blockLength: view.getUint32(offset + 36, true),
        liftDistance: view.getFloat32(offset + 40, true),
        liftSpeed: view.getFloat32(offset + 44, true),
        unknown48: view.getUint32(offset + 48, true),
        unknown52: view.getUint32(offset + 52, true),
        unknown56: view.getUint32(offset + 56, true),
        unknown60: view.getUint32(offset + 60, true),
        unknown64: view.getUint32(offset + 64, true),
        unknown68: view.getUint32(offset + 68, true),
        unknown72: view.getUint32(offset + 72, true),
        unknown76: view.getFloat32(offset + 76, true),
        lightPWM: view.getFloat32(offset + 80, true)
    };
}

function readPrintParams(view, header) {
    let offset = header.printParamsOffset;
    if (!offset || header.printParamsLength < 60) return {};

    return {
        bottomLiftDistance: view.getFloat32(offset + 0, true),
        bottomLiftSpeed: view.getFloat32(offset + 4, true),
        liftDistance: view.getFloat32(offset + 8, true),
        liftSpeed: view.getFloat32(offset + 12, true),
        retractSpeed: view.getFloat32(offset + 16, true),
        volume: view.getFloat32(offset + 20, true),
        weight: view.getFloat32(offset + 24, true),
        cost: view.getFloat32(offset + 28, true),
        bottomLightOffDelay: view.getFloat32(offset + 32, true),
        lightOffDelay: view.getFloat32(offset + 36, true),
        bottomLayers: view.getUint32(offset + 40, true),
        unknown44: view.getUint32(offset + 44, true),
        unknown48: view.getUint32(offset + 48, true),
        unknown52: view.getUint32(offset + 52, true),
        unknown56: view.getUint32(offset + 56, true)
    };
}

function readMachineName(view, header) {
    if (!header.machineInfoOffset || !header.machineInfoLength) return "";

    let nameOffset = view.getUint32(header.machineInfoOffset + 0x1c, true);
    let nameLength = view.getUint32(header.machineInfoOffset + 0x20, true);
    if (!nameOffset || !nameLength) return "";

    let chars = [];
    for (let i=0; i<nameLength; i++) {
        let c = view.getUint8(nameOffset + i);
        if (c === 0) break;
        chars.push(String.fromCharCode(c));
    }
    return chars.join("");
}

function inferLayout(header, layers) {
    let tableEnd = header.layerTableOffset + header.layerCount * LAYER_TABLE_RECORD_SIZE;
    let firstLayer = layers[0];
    let firstFullRecordOffset = firstLayer ? firstLayer.imageOffset - LAYER_FULL_RECORD_SIZE : 0;

    return {
        headerSize: HEADER_SIZE,
        layerTableRecordSize: LAYER_TABLE_RECORD_SIZE,
        layerFullRecordSize: LAYER_FULL_RECORD_SIZE,
        tableEnd,
        firstFullRecordOffset,
        hasFullRecordsBeforeImages: firstFullRecordOffset === tableEnd
    };
}

function createRSLAManifest(ctb, layers) {
    let { header, print, machine } = ctb;

    return {
        format: "rsla",
        version: 1,
        units: "mm",
        coordinateSystem: {
            layerImage: "top-left",
            model: "bed-center",
            x: "right",
            y: "back",
            z: "up"
        },
        source: {
            format: "ctb",
            version: header.version,
            machine
        },
        bed: {
            width: round(header.bedWidth),
            depth: round(header.bedDepth),
            height: round(header.bedHeight)
        },
        resolution: {
            x: header.resolutionX,
            y: header.resolutionY
        },
        layerHeight: round(header.layerHeight),
        layerCount: layers.length,
        raster: {
            encoding: "png",
            color: "grayscale",
            cure: "nonzero",
            white: "cure",
            black: "off"
        },
        process: {
            bottomLayers: print.bottomLayers ?? header.bottomLayers,
            exposure: round(header.exposure),
            bottomExposure: round(header.bottomExposure),
            lightOffDelay: round(print.lightOffDelay ?? header.lightOffDelay),
            bottomLightOffDelay: round(print.bottomLightOffDelay),
            liftHeight: round(print.liftDistance),
            bottomLiftHeight: round(print.bottomLiftDistance),
            liftSpeed: round(print.liftSpeed),
            bottomLiftSpeed: round(print.bottomLiftSpeed),
            retractSpeed: round(print.retractSpeed),
            antiAlias: header.antiAliasLevel,
            lightPWM: header.lightPWM,
            bottomLightPWM: header.bottomLightPWM
        },
        layers
    };
}

function createPreview(width, height) {
    return {
        width,
        height,
        image: new Uint8Array(width * height)
    };
}

function accumulatePreview(preview, image, width, height) {
    let { image: target } = preview;
    let xscale = width / preview.width;
    let yscale = height / preview.height;

    for (let y=0; y<preview.height; y++) {
        let sy = Math.min(height - 1, Math.floor(y * yscale));
        for (let x=0; x<preview.width; x++) {
            let sx = Math.min(width - 1, Math.floor(x * xscale));
            if (image[sx * height + sy]) {
                target[y * preview.width + x] = 255;
            }
        }
    }
}

function encodePreview(preview) {
    let output = [];
    let data = preview.image;
    let color = previewColor(data[0]);
    let run = 1;

    for (let i=1; i<data.length; i++) {
        let next = previewColor(data[i]);
        if (next === color && run < 0xfff) {
            run++;
            continue;
        }
        writePreviewRun(output, color, run);
        color = next;
        run = 1;
    }

    writePreviewRun(output, color, run);
    return new Uint8Array(output);
}

function writePreviewRun(output, color, length) {
    if (length === 1) {
        writePreviewU16(output, color);
        return;
    }

    writePreviewU16(output, color | 0x0020);
    writePreviewU16(output, 0x3000 | (length - 1));
}

function previewColor(value) {
    return value ? 0xffdf : 0x0000;
}

function writePreviewU16(output, value) {
    output.push(value & 0xff, (value >> 8) & 0xff);
}

function renderToCTBPixels(image, width, height) {
    return imageToRowMajor(image, width, height);
}

function encodeRLE(input) {
    let output = [];
    let color = quantize(input[0]);
    let run = 1;

    for (let offset=1; offset<input.length; offset++) {
        let next = quantize(input[offset]);
        if (next === color) {
            run++;
            continue;
        }
        writeRun(output, color, run);
        color = next;
        run = 1;
    }

    writeRun(output, color, run);
    return new Uint8Array(output);
}

function writeRun(output, color, length) {
    if (length === 1) {
        output.push(color);
        return;
    }

    output.push(color | 0x80);
    if (length < 0x80) {
        output.push(length);
    } else if (length < 0x4000) {
        output.push(0x80 | (length >> 8), length & 0xff);
    } else if (length < 0x200000) {
        output.push(0xc0 | (length >> 16), (length >> 8) & 0xff, length & 0xff);
    } else if (length < 0x10000000) {
        output.push(
            0xe0 | (length >> 24),
            (length >> 16) & 0xff,
            (length >> 8) & 0xff,
            length & 0xff
        );
    } else {
        throw new Error(`CTB RLE run too long (${length})`);
    }
}

function quantize(value) {
    return value ? Math.max(1, Math.min(0x7f, Math.round(value / 2))) : 0;
}

function decodeRLE(input, pixelCount) {
    let output = new Uint8Array(pixelCount);
    let offset = 0;
    let out = 0;

    while (offset < input.length && out < pixelCount) {
        let code = input[offset++];
        let repeat = (code & 0x80) !== 0;
        code &= 0x7f;

        let stride = repeat ? readRunLength(input, offset) : 1;
        if (repeat) offset += stride.bytes;

        let value = code === 0 ? 0 : (code << 1) | 1;
        let end = out + (repeat ? stride.length : stride);
        if (end > pixelCount) {
            throw new Error(`CTB RLE overrun in decoded layer (${end} > ${pixelCount})`);
        }
        output.fill(value, out, end);
        out = end;
    }

    if (out !== pixelCount) {
        throw new Error(`CTB RLE underrun in decoded layer (${out} < ${pixelCount})`);
    }

    return output;
}

function readRunLength(input, offset) {
    let slen = input[offset];
    if (slen === undefined) throw new Error("truncated CTB RLE run length");

    if ((slen & 0x80) === 0) {
        return { length: slen, bytes: 1 };
    }
    if ((slen & 0xc0) === 0x80) {
        requireBytes(input, offset, 2);
        return {
            length: ((slen & 0x3f) << 8) | input[offset + 1],
            bytes: 2
        };
    }
    if ((slen & 0xe0) === 0xc0) {
        requireBytes(input, offset, 3);
        return {
            length: ((slen & 0x1f) << 16) | (input[offset + 1] << 8) | input[offset + 2],
            bytes: 3
        };
    }
    if ((slen & 0xf0) === 0xe0) {
        requireBytes(input, offset, 4);
        return {
            length: (((slen & 0x0f) << 24) | (input[offset + 1] << 16) |
                (input[offset + 2] << 8) | input[offset + 3]) >>> 0,
            bytes: 4
        };
    }

    throw new Error(`unsupported CTB RLE run length prefix 0x${slen.toString(16)}`);
}

function requireBytes(input, offset, length) {
    if (offset + length > input.length) {
        throw new Error("truncated CTB RLE run length");
    }
}

function decipher(seed, layerIndex, input) {
    return ctbLayerCrypt(seed, layerIndex, input);
}

function encipher(seed, layerIndex, input) {
    return ctbLayerCrypt(seed, layerIndex, input);
}

function imageToPNG(image, width, height) {
    return PNG.sync.write({ width, height, data: image }, {
        colorType: 0,
        inputColorType: 0,
        inputHasAlpha: false
    });
}

function toDataView(input) {
    return input instanceof DataView
        ? input
        : new DataView(input.buffer || input, input.byteOffset || 0, input.byteLength);
}

function makeSeed(print) {
    let { device, process } = print.settings;
    let hash = 0x811c9dc5;
    let text = [
        device.deviceName,
        device.resolutionX,
        device.resolutionY,
        device.bedWidth,
        device.bedDepth,
        process.slaSlice,
        process.slaLayerOn,
        process.slaBaseOn
    ].join("|");

    for (let i=0; i<text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    return hash || 0x5eed1234;
}

class BinaryWriter {
    constructor(buffer) {
        this.view = new DataView(buffer);
        this.pos = 0;
    }

    seek(pos) {
        this.pos = pos;
    }

    skip(length) {
        this.pos += length;
    }

    writeBytes(bytes) {
        new Uint8Array(this.view.buffer, this.pos, bytes.length).set(bytes);
        this.pos += bytes.length;
    }

    writeU8(value) {
        this.view.setUint8(this.pos, value);
        this.pos += 1;
    }

    writeU16(value) {
        this.view.setUint16(this.pos, value, true);
        this.pos += 2;
    }

    writeU32(value) {
        this.view.setUint32(this.pos, value >>> 0, true);
        this.pos += 4;
    }

    writeF32(value) {
        this.view.setFloat32(this.pos, Number(value || 0), true);
        this.pos += 4;
    }
}

export const CTB = {
    encode,
    read,
    toRSLA,
    decodeLayer,
    encodeRLE
};
