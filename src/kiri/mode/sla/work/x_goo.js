/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { imageToRowMajor, renderRasterLayers, round } from './raster.js';
import { createLayerMetadata, createProcessMetadata, estimatePrintTime, motionFor } from './meta.js';

const FAMILY = "GOO";
const FILE_VERSION = "V3.0";
const FILE_MAGIC = [0x07, 0x00, 0x00, 0x00, 0x44, 0x4c, 0x50, 0x00];
const DELIMITER = [0x0d, 0x0a];
const LAYER_MAGIC = 0x55;
const HEADER_SIZE = 195477;
const LAYER_DEF_SIZE = 70;
const FOOTER_SIZE = 11;
const MAX_RUN = 0x0fffffff;

const FORMAT_RECORDS = {
    goo: { ext: "goo", machine: "Elegoo GOO", notes: "Elegoo GOO" },
    prz: { ext: "prz", machine: "Phrozen Sonic Mini 8K S", notes: "Phrozen PRZ GOO variant" }
};

function encode(print, progress, renderer) {
    let format = print.settings.device.slaFormat || "goo";
    let rec = FORMAT_RECORDS[format];

    if (!rec) {
        return Promise.reject(new Error(`${FAMILY} format .${format} is not implemented.`));
    }

    if (renderer) {
        return Promise.resolve(encodeGOO(print, progress, renderer, rec));
    }

    return import('./x_photon.js').then(({ photon }) =>
        encodeGOO(print, progress, photon, rec));
}

function encodeGOO(print, progress, photon, rec) {
    let layers = [];
    let previewSmall = createPreview(116, 116);
    let previewLarge = createPreview(290, 290);

    let { ctx, volume } = renderRasterLayers(print, photon, params => {
        let { index, rendered, z, ctx } = params;
        let { device, process, width, height } = ctx;
        let layerMeta = createLayerMetadata(device, process, index, z, rendered.area);
        let raster = imageToRowMajor(rendered.image, width, height, normalizePixel);

        accumulatePreview(previewSmall, rendered.image, width, height);
        accumulatePreview(previewLarge, rendered.image, width, height);

        layers.push({
            index,
            data: encodeRLE(raster),
            z: layerMeta.z,
            pausePositionZ: ctx.device.maxHeight || ctx.device.bedHeight || 0,
            exposure: layerMeta.exposure,
            lightOffDelay: layerMeta.lightOffDelay,
            waitTimeAfterCure: layerMeta.waitAfterCure,
            waitTimeAfterLift: layerMeta.waitAfterLift,
            waitTimeBeforeCure: layerMeta.waitBeforeCure,
            liftHeight: layerMeta.liftHeight,
            liftSpeed: layerMeta.liftSpeed,
            liftHeight2: 0,
            liftSpeed2: 0,
            retractHeight: layerMeta.retractHeight,
            retractSpeed: layerMeta.retractSpeed,
            retractHeight2: 0,
            retractSpeed2: 0,
            lightPWM: layerMeta.lightPWM
        });
    }, progress ? (value) => progress(value * 0.85, `${rec.ext}_encode`) : null);

    let file = writeGOO({ ctx, layers, volume, previewSmall, previewLarge, rec });
    if (progress) progress(1, `${rec.ext}_write`);

    return { file, layers: layers.length, volume };
}

function writeGOO(params) {
    let { ctx, layers, volume, previewSmall, previewLarge, rec } = params;
    let total = HEADER_SIZE + FOOTER_SIZE;

    layers.forEach(layer => {
        layer.dataLength = layer.data.length;
        total += LAYER_DEF_SIZE + layer.dataLength + DELIMITER.length;
    });

    let writer = new BinaryWriter(new ArrayBuffer(total));
    writeHeader(writer, { ctx, layers, volume, previewSmall, previewLarge, rec });
    writer.seek(HEADER_SIZE);
    layers.forEach(layer => writeLayer(writer, layer));
    writeFooter(writer);

    if (writer.pos !== total) {
        throw new Error(`GOO writer size mismatch (${writer.pos} !== ${total})`);
    }

    return writer.buffer;
}

function writeHeader(writer, params) {
    let { ctx, layers, volume, previewSmall, previewLarge, rec } = params;
    let { device, process, width, height } = ctx;
    let meta = createProcessMetadata(device, process);
    let bottomMotion = motionFor(device, process, true);
    let layerMotionValue = motionFor(device, process, false);

    writer.writeString(FILE_VERSION, 4);
    writer.writeBytes(FILE_MAGIC);
    writer.writeString("Grid.Space", 32);
    writer.writeString("1.0", 24);
    writer.writeString(formatDate(), 24);
    writer.writeString(device.slaMachineName || device.deviceName || rec.machine, 32);
    writer.writeString("DLP", 32);
    writer.writeString("Grid.Space", 32);
    writer.writeU16(process.slaAntiAlias || 1);
    writer.writeU16(1);
    writer.writeU16(0);
    writer.writeBytes(previewSmall.image);
    writer.writeBytes(DELIMITER);
    writer.writeBytes(previewLarge.image);
    writer.writeBytes(DELIMITER);
    writer.writeU32(layers.length);
    writer.writeU16(width);
    writer.writeU16(height);
    writer.writeU8(0);
    writer.writeU8(0);
    writer.writeF32(device.bedWidth);
    writer.writeF32(device.bedDepth);
    writer.writeF32(device.maxHeight || device.bedHeight || 0);
    writer.writeF32(process.slaSlice);
    writer.writeF32(meta.exposure);
    writer.writeU8(1);
    writer.writeF32(0);
    writer.writeF32(0);
    writer.writeF32(0);
    writer.writeF32(meta.bottomWaitBeforeCure);
    writer.writeF32(0);
    writer.writeF32(0);
    writer.writeF32(meta.waitBeforeCure);
    writer.writeF32(meta.bottomExposure);
    writer.writeU32(meta.bottomLayers);
    writer.writeF32(bottomMotion.liftHeight);
    writer.writeF32(bottomMotion.liftSpeed);
    writer.writeF32(layerMotionValue.liftHeight);
    writer.writeF32(layerMotionValue.liftSpeed);
    writer.writeF32(bottomMotion.retractHeight);
    writer.writeF32(bottomMotion.retractSpeed);
    writer.writeF32(layerMotionValue.retractHeight);
    writer.writeF32(layerMotionValue.retractSpeed);
    for (let i=0; i<8; i++) writer.writeF32(0);
    writer.writeU16(meta.bottomLightPWM);
    writer.writeU16(meta.lightPWM);
    writer.writeU8(0);
    writer.writeU32(estimatePrintTime(device, process, layers.length));
    writer.writeF32(round(volume));
    writer.writeF32(0);
    writer.writeF32(0);
    writer.writeString("$", 8);
    writer.writeU32(HEADER_SIZE);
    writer.writeU8(1);
    writer.writeU16(0);

    if (writer.pos !== HEADER_SIZE) {
        throw new Error(`GOO header size mismatch (${writer.pos} !== ${HEADER_SIZE})`);
    }
}

function writeLayer(writer, layer) {
    writer.writeU16(0);
    writer.writeF32(layer.pausePositionZ);
    writer.writeF32(layer.z);
    writer.writeF32(layer.exposure);
    writer.writeF32(layer.lightOffDelay);
    writer.writeF32(layer.waitTimeAfterCure);
    writer.writeF32(layer.waitTimeAfterLift);
    writer.writeF32(layer.waitTimeBeforeCure);
    writer.writeF32(layer.liftHeight);
    writer.writeF32(layer.liftSpeed);
    writer.writeF32(layer.liftHeight2);
    writer.writeF32(layer.liftSpeed2);
    writer.writeF32(layer.retractHeight);
    writer.writeF32(layer.retractSpeed);
    writer.writeF32(layer.retractHeight2);
    writer.writeF32(layer.retractSpeed2);
    writer.writeU16(layer.lightPWM);
    writer.writeBytes(DELIMITER);
    writer.writeU32(layer.dataLength);
    writer.writeBytes(layer.data);
    writer.writeBytes(DELIMITER);
}

function writeFooter(writer) {
    writer.writeU8(0);
    writer.writeU8(0);
    writer.writeU8(0);
    writer.writeBytes(FILE_MAGIC);
}

function read(input) {
    let view = toDataView(input);
    let header = readHeader(view);
    let layers = readLayers(view, header.layerDefAddress, header.layerCount);
    let footerOffset = layers.length
        ? layers[layers.length - 1].dataOffset + layers[layers.length - 1].dataLength + DELIMITER.length
        : header.layerDefAddress;
    let footer = {
        offset: footerOffset,
        magic: Array.from(new Uint8Array(view.buffer, view.byteOffset + footerOffset + 3, 8))
    };
    if (!sameBytes(footer.magic, FILE_MAGIC)) {
        throw new Error("invalid GOO footer magic");
    }

    return { header, layers, footer };
}

function readHeader(view) {
    let pos = 0;
    let header = {};

    header.version = readString(view, pos, 4); pos += 4;
    header.magic = readBytes(view, pos, 8); pos += 8;
    header.softwareName = readString(view, pos, 32); pos += 32;
    header.softwareVersion = readString(view, pos, 24); pos += 24;
    header.fileCreateTime = readString(view, pos, 24); pos += 24;
    header.machineName = readString(view, pos, 32); pos += 32;
    header.machineType = readString(view, pos, 32); pos += 32;
    header.profileName = readString(view, pos, 32); pos += 32;
    header.antiAliasingLevel = view.getUint16(pos, false); pos += 2;
    header.greyLevel = view.getUint16(pos, false); pos += 2;
    header.blurLevel = view.getUint16(pos, false); pos += 2;
    pos += 116 * 116 * 2 + 2 + 290 * 290 * 2 + 2;
    header.layerCount = view.getUint32(pos, false); pos += 4;
    header.resolutionX = view.getUint16(pos, false); pos += 2;
    header.resolutionY = view.getUint16(pos, false); pos += 2;
    header.mirrorX = view.getUint8(pos++) !== 0;
    header.mirrorY = view.getUint8(pos++) !== 0;
    header.displayWidth = view.getFloat32(pos, false); pos += 4;
    header.displayHeight = view.getFloat32(pos, false); pos += 4;
    header.machineZ = view.getFloat32(pos, false); pos += 4;
    header.layerHeight = view.getFloat32(pos, false); pos += 4;
    header.exposureTime = view.getFloat32(pos, false); pos += 4;
    header.delayMode = view.getUint8(pos++);
    header.lightOffDelay = view.getFloat32(pos, false); pos += 4;
    pos += 6 * 4;
    header.bottomExposureTime = view.getFloat32(pos, false); pos += 4;
    header.bottomLayerCount = view.getUint32(pos, false); pos += 4;
    pos += 16 * 4 + 2 + 2 + 1;
    header.printTime = view.getUint32(pos, false); pos += 4;
    header.volume = view.getFloat32(pos, false); pos += 4;
    header.materialGrams = view.getFloat32(pos, false); pos += 4;
    header.materialCost = view.getFloat32(pos, false); pos += 4;
    header.priceCurrencySymbol = readString(view, pos, 8); pos += 8;
    header.layerDefAddress = view.getUint32(pos, false); pos += 4;
    header.grayScaleLevel = view.getUint8(pos++);
    header.transitionLayerCount = view.getUint16(pos, false); pos += 2;

    if (header.version !== FILE_VERSION) {
        throw new Error(`invalid GOO version ${header.version}`);
    }
    if (!sameBytes(header.magic, FILE_MAGIC)) {
        throw new Error("invalid GOO magic");
    }

    return header;
}

function readLayers(view, offset, count) {
    let layers = [];
    let pos = offset;

    for (let index=0; index<count; index++) {
        let layer = { index };
        layer.pause = view.getUint16(pos, false); pos += 2;
        layer.pausePositionZ = view.getFloat32(pos, false); pos += 4;
        layer.z = view.getFloat32(pos, false); pos += 4;
        layer.exposure = view.getFloat32(pos, false); pos += 4;
        layer.lightOffDelay = view.getFloat32(pos, false); pos += 4;
        layer.waitTimeAfterCure = view.getFloat32(pos, false); pos += 4;
        layer.waitTimeAfterLift = view.getFloat32(pos, false); pos += 4;
        layer.waitTimeBeforeCure = view.getFloat32(pos, false); pos += 4;
        layer.liftHeight = view.getFloat32(pos, false); pos += 4;
        layer.liftSpeed = view.getFloat32(pos, false); pos += 4;
        layer.liftHeight2 = view.getFloat32(pos, false); pos += 4;
        layer.liftSpeed2 = view.getFloat32(pos, false); pos += 4;
        layer.retractHeight = view.getFloat32(pos, false); pos += 4;
        layer.retractSpeed = view.getFloat32(pos, false); pos += 4;
        layer.retractHeight2 = view.getFloat32(pos, false); pos += 4;
        layer.retractSpeed2 = view.getFloat32(pos, false); pos += 4;
        layer.lightPWM = view.getUint16(pos, false); pos += 2;
        layer.delimiter = readBytes(view, pos, 2); pos += 2;
        layer.dataLength = view.getUint32(pos, false); pos += 4;
        layer.dataOffset = pos;
        pos += layer.dataLength + DELIMITER.length;
        layers.push(layer);
    }

    return layers;
}

function decodeLayer(view, layer, pixelCount) {
    let data = new Uint8Array(
        view.buffer,
        view.byteOffset + layer.dataOffset,
        layer.dataLength
    );
    return decodeRLE(data, pixelCount);
}

function encodeRLE(input) {
    let output = [LAYER_MAGIC];
    let previous = 0;
    let current = input[0] || 0;
    let run = 0;

    for (let i=0; i<input.length; i++) {
        let value = input[i] || 0;
        if (value === current && run < MAX_RUN) {
            run++;
        } else {
            writeRun(output, current, previous, run);
            previous = current;
            current = value;
            run = 1;
        }
    }
    writeRun(output, current, previous, run);
    output.push(checksum(output));

    return Uint8Array.from(output);
}

function writeRun(output, color, previous, run) {
    while (run > 0) {
        let stride = Math.min(run, MAX_RUN);
        let diff = Math.abs(color - previous);
        if (color > 0 && color < 255 && diff <= 0x0f && stride <= 0xff) {
            let first = 0x80 | (diff & 0x0f);
            if (stride > 1) {
                first |= 0x10;
            }
            if (color < previous) {
                first |= 0x20;
            }
            output.push(first);
            if (stride > 1) {
                output.push(stride);
            }
            run -= stride;
            continue;
        }

        let lengthCode = stride <= 0x0f ? 0
            : stride <= 0x0fff ? 1
            : stride <= 0x0fffff ? 2
            : 3;
        let type = color === 0 ? 0 : color === 255 ? 3 : 1;
        let first = (type << 6) | (lengthCode << 4) | (stride & 0x0f);

        let ext = [];
        if (lengthCode >= 1) ext.unshift((stride >> 4) & 0xff);
        if (lengthCode >= 2) ext.unshift((stride >> 12) & 0xff);
        if (lengthCode >= 3) ext.unshift((stride >> 20) & 0xff);

        output.push(first);
        if (type === 1) {
            output.push(color);
        }
        output.push(...ext);
        run -= stride;
    }
}

function normalizePixel(value) {
    value = value || 0;
    if (value === 0 || value === 255) {
        return value;
    }

    // The JS fallback rasterizer paints red at 200, so rescale that range to
    // retain binary cure strength while preserving antialiased edge values.
    return Math.min(255, Math.round(value * 255 / 200));
}

function decodeRLE(input, pixelCount) {
    let rle = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (rle[0] !== LAYER_MAGIC) {
        throw new Error(`invalid GOO RLE layer magic ${rle[0]}`);
    }
    if (rle[rle.length - 1] !== checksum(rle.subarray(0, rle.length - 1))) {
        throw new Error("invalid GOO RLE checksum");
    }

    let output = new Uint8Array(pixelCount);
    let pixel = 0;
    let color = 0;
    let last = rle.length - 1;

    for (let i=1; i<last; i++) {
        let chunkType = rle[i] >> 6;
        let stride = 0;
        let strideIndex0 = i;
        let strideIndex1 = i + 1;
        let strideIndex2 = i + 2;
        let strideIndex3 = i + 3;

        if (chunkType === 0) {
            color = 0;
        } else if (chunkType === 1) {
            color = rle[++i];
            strideIndex1++;
            strideIndex2++;
            strideIndex3++;
        } else if (chunkType === 2) {
            let diffType = (rle[i] >> 4) & 0x03;
            let diffValue = rle[i] & 0x0f;
            if (diffType === 0) {
                color += diffValue;
                stride = 1;
            } else if (diffType === 1) {
                color += diffValue;
                stride = rle[++i];
            } else if (diffType === 2) {
                color -= diffValue;
                stride = 1;
            } else {
                color -= diffValue;
                stride = rle[++i];
            }
            color &= 0xff;
        } else {
            color = 255;
        }

        if (chunkType !== 2) {
            let chunkLength = (rle[strideIndex0] >> 4) & 0x03;
            if (chunkLength === 0) {
                stride = rle[strideIndex0] & 0x0f;
            } else if (chunkLength === 1) {
                stride = (rle[strideIndex1] << 4) + (rle[strideIndex0] & 0x0f);
                i += 1;
            } else if (chunkLength === 2) {
                stride = (rle[strideIndex1] << 12) + (rle[strideIndex2] << 4) + (rle[strideIndex0] & 0x0f);
                i += 2;
            } else {
                stride = (rle[strideIndex1] << 20) + (rle[strideIndex2] << 12) + (rle[strideIndex3] << 4) + (rle[strideIndex0] & 0x0f);
                i += 3;
            }
        }

        output.fill(color, pixel, pixel + stride);
        pixel += stride;
    }

    if (pixel !== pixelCount) {
        throw new Error(`GOO RLE pixel count mismatch (${pixel} !== ${pixelCount})`);
    }

    return output;
}

function createPreview(width, height) {
    return {
        width,
        height,
        image: new Uint8Array(width * height * 2)
    };
}

function accumulatePreview(preview, image, width, height) {
    let xscale = width / preview.width;
    let yscale = height / preview.height;

    for (let y=0; y<preview.height; y++) {
        let sy = Math.min(height - 1, Math.floor(y * yscale));
        for (let x=0; x<preview.width; x++) {
            let sx = Math.min(width - 1, Math.floor(x * xscale));
            let pos = (y * preview.width + x) * 2;
            if (image[sx * height + sy]) {
                preview.image[pos] = 0xff;
                preview.image[pos + 1] = 0xff;
            }
        }
    }
}

function checksum(bytes) {
    let sum = 0;
    for (let i=1; i<bytes.length; i++) {
        sum = (sum + bytes[i]) & 0xff;
    }
    return (~sum) & 0xff;
}

function formatDate() {
    let date = new Date();
    let pad = value => value.toString().padStart(2, "0");
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-") + " " + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join(":");
}

function readString(view, offset, length) {
    let chars = [];
    for (let i=0; i<length; i++) {
        let value = view.getUint8(offset + i);
        if (value === 0) break;
        chars.push(String.fromCharCode(value));
    }
    return chars.join("");
}

function readBytes(view, offset, length) {
    return Array.from(new Uint8Array(view.buffer, view.byteOffset + offset, length));
}

function sameBytes(a, b) {
    if (!a || a.length !== b.length) return false;
    for (let i=0; i<a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function toDataView(input) {
    if (input instanceof DataView) return input;
    if (input instanceof ArrayBuffer) return new DataView(input);
    if (ArrayBuffer.isView(input)) return new DataView(input.buffer, input.byteOffset, input.byteLength);
    throw new Error("expected ArrayBuffer or typed array");
}

class BinaryWriter {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.pos = 0;
    }

    seek(pos) {
        this.pos = pos;
    }

    writeBytes(bytes) {
        new Uint8Array(this.buffer, this.pos, bytes.length).set(bytes);
        this.pos += bytes.length;
    }

    writeString(value, length) {
        value = value || "";
        for (let i=0; i<length; i++) {
            this.writeU8(i < value.length ? value.charCodeAt(i) : 0);
        }
    }

    writeU8(value) {
        this.view.setUint8(this.pos, Number(value || 0) & 0xff);
        this.pos += 1;
    }

    writeU16(value) {
        this.view.setUint16(this.pos, Number(value || 0) & 0xffff, false);
        this.pos += 2;
    }

    writeU32(value) {
        this.view.setUint32(this.pos, Number(value || 0) >>> 0, false);
        this.pos += 4;
    }

    writeF32(value) {
        this.view.setFloat32(this.pos, Number(value || 0), false);
        this.pos += 4;
    }
}

function supports(format) {
    return FORMAT_RECORDS[format] !== undefined;
}

export const GOO = {
    encode,
    supports,
    read,
    decodeLayer,
    encodeRLE,
    decodeRLE,
    formats: FORMAT_RECORDS
};
