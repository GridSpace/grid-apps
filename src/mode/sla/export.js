/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

"use strict";

(function() {

    let KIRI = self.kiri,
        BASE = self.base,
        UTIL = BASE.util,
        SLA = KIRI.driver.SLA;

    /**
     * DRIVER PRINT CONTRACT - runs in worker
     * @param {Object} print state object
     * @param {Function} online streaming reply
     * @param {Function} ondone last reply
     */
    SLA.export = function(print, online, ondone) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            output = print.output,
            layermax = 0,
            width = 2560,
            height = 1440,
            width2 = width/2,
            height2 = height/2,
            scaleX = width / device.bedWidth,
            scaleY = height / device.bedDepth,
            mark = Date.now(),
            layers = process.slaAntiAlias || 1,
            masks = [],
            images = [],
            slices = [],
            legacyMode = SLA.legacy || layers > 1,
            part1 = legacyMode ? 0.25 : 0.85,
            part2 = legacyMode ? 0.75 : 0.15;

        let d = 8 / layers;
        for (let i=0; i<layers; i++) {
            masks.push((1 << (8 - i * d)) - 1);
        }

        // find max layer count
        widgets.forEach(widget => {
            layermax = Math.max(widget.slices.length);
        });

        let render = legacyMode ? renderLayer : renderLayerWasm;

        // generate layer bitmaps
        // in wasm mode, rle layers generated here, too
        for (let index=0; index < layermax; index++) {
            let param = { index, width, height, widgets, scaleX, scaleY, masks };
            let {image, layers, end} = render(param);
            images.push(image);
            slices.push(layers);
            // transfer images to browser main
            image = image.buffer;
            online({
                progress: (index / layermax) * part1,
                message: "image_gen",
                data: image
            },[image]);
            if (end) break;
        }

        let exp_func;

        switch (device.deviceName) {
            case 'Anycubic.Photon':
                exp_func = generatePhoton;
                break;
            case 'Anycubic.Photon.S':
                exp_func = generatePhotons;
                break;
        }

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
        ondone({
            width: width,
            height: height,
            file: file
        },[file]);

        console.log('print.export', Date.now() - mark);
    };

    function generatePhoton(print, conf, progress) {
        let printset = print.settings,
            process = printset.process,
            device = printset.device,
            width = conf.width,
            height = conf.height,
            layerCount = conf.lines.length,
            layerBytes = width * height,
            small = conf.small,
            large = conf.large,
            slices = conf.slices,
            subcount = process.slaAntiAlias || 1,
            masks = [],
            coded;

        if (SLA.legacy || subcount > 1) {
            let d = 8 / subcount;
            for (let i=0; i<subcount; i++) {
                masks.push((1 << (8 - i * d)) - 1);
            }
            let ccl = 0;
            let tcl = conf.lines.length * subcount;
            let converted = conf.lines.map((line, index) => {
                let count = line.length;
                let lineDV = new DataView(line.buffer);
                let bits = new Uint8Array(line.length);
                let bitsDV = new DataView(bits.buffer);
                let subs = [{ data: bits, view: bitsDV }];
                for (let sl=1; sl<subcount; sl++) {
                    bits = bits.slice();
                    bitsDV = new DataView(bits.buffer);
                    subs.push({ data: bits, view: bitsDV });
                }
                // use R from RGB since that was painted on the canvas
                for (let s=0; s<subcount; s++) {
                    let view = subs[s].view;
                    let mask = masks[s];
                    for (let i = 0; i < count; i++) {
                        let dv = lineDV.getUint8(i);
                        view.setUint8(i, (dv / subcount) & mask ? 1 : 0);
                    }
                    progress((ccl++/tcl) * 0.4, `layer_convert`);
                }
                return { subs };
            });

            coded = encodeLayers(converted, "photon", (pro => {
                progress(pro * 0.4 + 0.4, "layer_encode");
            }));
        } else {
            let codedlen = slices.reduce((t,l) => {
                return t + l.reduce((t,a) => {
                    return t + a.length
                }, 0);
            }, 0);
            coded = {
                layers: slices.map(slice => { return { sublayers: slice }}),
                length: codedlen
            };
        }

        let codelen = coded.layers.length;
        let buflen = 3000 + coded.length + (codelen * subcount * 28) + small.byteLength + large.byteLength;
        let filebuf = new ArrayBuffer(buflen);
        let filedat = new self.DataWriter(new DataView(filebuf));
        let printtime = (process.slaBaseLayers * process.slaBaseOn) +
                (coded.layers.length - process.slaBaseLayers) * process.slaLayerOn;

        filedat.writeU32(0x1900fd12); // header
        filedat.writeU32(2,true); // version
        filedat.writeF32(68.04, true); // bed x
        filedat.writeF32(120.96, true); // bed y
        filedat.writeF32(150.0, true); // bed z
        filedat.skip(12); // padding
        filedat.writeF32(process.slaSlice, true); // layer height
        filedat.writeF32(process.slaLayerOn, true); // default lamp on
        filedat.writeF32(process.slaBaseOn, true); // base lamp on
        filedat.writeF32(process.slaLayerOff, true); // lamp off
        filedat.writeU32(process.slaBaseLayers, true); // base layers
        filedat.writeU32(1440, true); // device x
        filedat.writeU32(2560, true); // device y
        let hirez = filedat.skip(4); // hirez preview address filled pater
        let layerpos = filedat.skip(4); // layer data address filled later
        filedat.writeU32(codelen, true);
        let lorez = filedat.skip(4); // hirez preview address filled later
        filedat.writeU32(printtime, true); // print time seconds
        filedat.writeU32(1, true); // projection type (1=lcd, 0=cast)
        let proppos = filedat.skip(4); // print properties address filled later
        let proplen = filedat.skip(4); // print properties length filled later
        filedat.writeU32(subcount, true); // AA level (sub layers)
        filedat.writeU16(0x00ff, true); // light pwm (TODO);
        filedat.writeU16(0x00ff, true); // light pwm bottom (TODO);

        let propstart = filedat.pos;
        filedat.view.setUint32(proppos, filedat.pos, true);
        // write print properties
        filedat.writeF32(process.slaBasePeelDist, true);
        filedat.writeF32(process.slaBasePeelLiftRate * 60 , true);
        filedat.writeF32(process.slaPeelDist, true);
        filedat.writeF32(process.slaPeelLiftRate * 60 , true);
        filedat.writeF32(process.slaPeelDropRate * 60, true);
        filedat.writeF32(0, true); // volume of used
        filedat.writeF32(0, true); // weight of used
        filedat.writeF32(0, true); // cost of used
        filedat.writeF32(0, true); // bottom off delay time
        filedat.writeF32(0, true); // light off delay time
        filedat.writeU32(process.slaBaseLayers, true);
        filedat.writeF32(0, true); // p1 ?
        filedat.writeF32(0, true); // p2 ?
        filedat.writeF32(0, true); // p3 ?
        filedat.writeF32(0, true); // p4 ?
        filedat.view.setUint32(proplen, filedat.pos - propstart, true);

        filedat.view.setUint32(layerpos, filedat.pos, true);
        // write layer headers
        let layers = coded.layers;
        let layerat = [];

        for (let sc=0; sc<subcount; sc++)
        for (let l=0; l<layers.length; l++) {
            let layer = layers[l].sublayers[sc];
            filedat.writeF32(process.slaFirstOffset + process.slaSlice * l, true); // layer height
            filedat.writeF32(l < process.slaBaseLayers ? process.slaBaseOn : process.slaLayerOn, true);
            filedat.writeF32(l < process.slaBaseLayers ? process.slaBaseOff : process.slaLayerOff, true);
            layerat.push(layer.repos = filedat.skip(4)); // rewrite later
            filedat.writeU32(layer.length, true);
            filedat.skip(16); // padding
        }

        // write layer data
        let clo = 0;
        let tlo = layers.length * subcount;
        for (let sc=0; sc<subcount; sc++)
        for (let l=0; l<layers.length; l++) {
            let layer = layers[l].sublayers[sc];
            filedat.view.setUint32(layer.repos, filedat.pos, true);
            for (let j=0; j<layer.length; j++) {
                filedat.writeU8(layer[j], false);
            }
            progress(((clo++/tlo) * 0.1) + 0.9, "layer_write");
        }

        filedat.view.setUint32(hirez, filedat.pos, true);
        writePhotonImage({
            width: 400,
            height: 300,
            data: conf.large
        }, filedat);

        filedat.view.setUint32(lorez, filedat.pos, true);
        writePhotonImage({
            width: 200,
            height: 125,
            data: conf.small
        }, filedat);

        return filebuf;
    }

    function generatePhotons(print, conf, progress) {
        let printset = print.settings,
            process = printset.process,
            device = printset.device,
            width = conf.width,
            height = conf.height,
            slices = conf.slices,
            layerCount = conf.lines.length,
            layerBytes = width * height,
            coded;

        if (SLA.legacy) {
            let converted = conf.lines.map((line, index) => {
                let count = line.length / 4;
                let bits = new Uint8Array(line.length / 4);
                let bitsDV = new DataView(bits.buffer);
                let lineDV = new DataView(line.buffer);
                // reduce RGB to R = 0||1
                for (let i = 0; i < count; i++) {
                    // defeat anti-aliasing for the moment
                    bitsDV.setUint8(i, lineDV.getUint8(i * 4) > 0 ? 1 : 0);
                }
                progress(index / conf.lines.length);
                return { subs: [{
                    exposureTime: process.slaLayerOn,
                    data: bits
                }] };
            });
            coded = encodeLayers(converted, "photons");
        } else {
            let codedlen = slices.reduce((t,l) => {
                return t + l.reduce((t,a) => {
                    return t + a.length
                }, 0);
            }, 0);
            coded = {
                layers: slices.map(slice => { return { sublayers: slice }}),
                length: codedlen
            };
        }

        let filebuf = new ArrayBuffer(75366 + coded.length + 28 * layerCount);
        let filedat = new DataView(filebuf);
        let filePos = 0;

        filedat.setUint32 (0,  2,                     false);
        filedat.setUint32 (4,  3227560,               false);
        filedat.setUint32 (8,  824633720,             false);
        filedat.setUint16 (12, 10,                    false);
        filedat.setFloat64(14, process.slaSlice,      false);
        filedat.setFloat64(22, process.slaLayerOn,    false);
        filedat.setFloat64(30, process.slaLayerOff,   false);
        filedat.setFloat64(38, process.slaBaseOn,     false);
        filedat.setUint32 (46, process.slaBaseLayers, false);
        filedat.setFloat64(50, process.slaPeelDist,   false);
        filedat.setFloat64(58, process.slaPeelLift,   false);
        filedat.setFloat64(66, process.slaPeelDrop,   false);
        filedat.setFloat64(74, 69420,                 false);
        filedat.setUint32 (82, 224,                   false);
        filedat.setUint32 (86, 42,                    false);
        filedat.setUint32 (90, 168,                   false);
        filedat.setUint32 (94, 10,                    false);
        filedat.setUint32 (75362, layerCount,         false);

        filePos = 75366;
        for (let i = 0; i < layerCount; i++) {
            let layer = coded.layers[i],
                sublayer = layer.sublayers[0],
                numbytes = sublayer.length;

            filedat.setUint32 (filePos + 0,  69420,  false);
            filedat.setFloat64(filePos + 4,  0);
            filedat.setUint32 (filePos + 12, height, false);
            filedat.setUint32 (filePos + 16, width,  false);
            filedat.setUint32 (filePos + 20, numbytes * 8 + 32, false);
            filedat.setUint32 (filePos + 24, 2684702720, false);
            filePos += 28;
            for (let j = 0; j < numbytes; j++) {
                filedat.setUint8(filePos + j, sublayer[j], false);
            }
            filePos += numbytes;
            progress((i / layerCount) / 2 + 0.5);
        }

        return filebuf;
    }

    function encodeLayers(input, type, progress) {
        let layers = [], length = 0, total = 0, count = 0;
        input.forEach(layer => {
            layer.subs.forEach(sub => total++);
        });
        for (let index = 0; index < input.length; index++) {
            let subs = input[index].subs,
                sublayers = [],
                sublength = 0;
            for (let subindex = 0; subindex < subs.length; subindex++) {
                let data = subs[subindex].data;
                let encoded = rleEncode(data, type);
                sublength += encoded.length;
                sublayers.push(encoded);
                if (progress) progress(count++/total);
                if (type == "photons") break;
            }
            length += sublength;
            layers.push({
                sublength,
                sublayers
            });
        }
        return { length, layers };
    }

    function rleEncode(data, type) {
        let maxlen = (type === 'photons') ? 128 : 125,
            color = data[0],
            runlen = 1,
            output = [];
        for (let index = 1; index < data.length; index++) {
            let newColor = data[index];
            if (newColor !== color) {
                output.push(rleByte(color, runlen, type));
                color = newColor;
                runlen = 1;
            } else {
                if (runlen === maxlen) {
                    output.push(rleByte(color, runlen, type));
                    runlen = 1;
                } else {
                    runlen++;
                }
            }
        }
        if (runlen > 0) {
            output.push(rleByte(color, runlen, type));
        }
        return output;
    }

    function rleByte(color, length, type) {
        switch (type) {
            case 'photon':
                return (length & 0x7f) | ((color << 7) & 0x80);
            case 'photons':
                length--;
                return (length & 1  ? 128 : 0) |
                     (length & 2  ?  64 : 0) |
                     (length & 4  ?  32 : 0) |
                     (length & 8  ?  16 : 0) |
                     (length & 16 ?   8 : 0) |
                     (length & 32 ?   4 : 0) |
                     (length & 64 ?   2 : 0) | color;
            }
    }

    function rleDecode(data, type) {
        let bytes = [];
        if (type === 'photon') {
            for (let i = 0; i < data.length; i++) {
                let val = data[i],
                    color = val >> 7,
                    count = val & 0x7f;
                for (let j = 0; j < count; j++) {
                    bytes.push(color);
                }
            }
        } else {
            for (let i = 0; i < data.length; i++) {
                let val = data[i],
                    color = val & 1,
                    count =
                    ((val & 128 ?  1 : 0) |
                     (val &  64 ?  2 : 0) |
                     (val &  32 ?  4 : 0) |
                     (val &  16 ?  8 : 0) |
                     (val &   8 ? 16 : 0) |
                     (val &   4 ? 32 : 0) |
                     (val &   2 ? 64 : 0)) + 1;
                for (let j = 0; j < count; j++) {
                    bytes.push(color);
                }
            }
        }
        return bytes;
    }

    // write out a thumbnail image
    function writePhotonImage(preview, writer) {
        let data = new Uint8Array(preview.data), len = data.byteLength;
        writer.writeU32(preview.width, true);
        writer.writeU32(preview.height, true);
        let hpos = writer.skip(4);
        writer.writeU32(len/2, true);
        writer.view.setUint32(hpos, writer.pos, true);
        let pos = 0;
        while (pos < len) {
            let r = data[pos++],
                g = data[pos++],
                b = data[pos++],
                a = data[pos++],
                v = (((r/4)&0x1f) << 11) |
                    (((g/4)&0x1f) <<  6) |
                    (((b/4)&0x1f) <<  0) ;
            writer.writeU16(v, true);
        }
    }

    // for unbound workers
    // if (self.WASM) {
    //     let {exports} = wasmInstance;
    //     let heap = new Uint8Array(exports.memory.buffer);
    //     self.wasm = {
    //         heap,
    //         memory: exports.memory,
    //         // heap: wasmMemory,
    //         // memory: memoryBytes,
    //         render: exports.render,
    //         rle_encode: exports.rle_encode
    //     };
    // } else

    // new WebAssembly rasterizer
    function renderLayerWasm(params) {
        let { width, height, index, widgets, scaleX, scaleY, masks } = params;
        let width2 = width / 2, height2 = height / 2;
        let array = [];
        let count = 0;

        function scaleMovePoly(poly) {
            let points = poly.points;
            let bounds = poly.bounds = BASE.newBounds();
            for (let i=0, il=points.length; i<il; i++) {
                let p = points[i];
                p.y = height - (p.y * scaleY + height2);
                p.x = p.x * scaleX + width2;
                bounds.update(p);
            }
            if (poly.inner) {
                for (let i=0, ia=poly.inner, il=poly.inner.length; i<il; i++) {
                    scaleMovePoly(ia[i]);
                }
            }
        }

        // serialize poly into wasm heap memory
        function writePoly(writer, poly) {
            let pos = writer.skip(2);
            let inner = poly.inner;
            writer.writeU16(inner ? inner.length : 0, true);
            let points = poly.points;
            let bounds = poly.bounds;
            writer.writeU16(points.length, true);
            writer.writeU16(bounds.minx, true);
            writer.writeU16(bounds.maxx, true);
            writer.writeU16(bounds.miny, true);
            writer.writeU16(bounds.maxy, true);
            for (let j=0, jl=points.length; j<jl; j++) {
                let point = points[j];
                writer.writeF32(point.x, true);
                writer.writeF32(point.y, true);
            }
            if (inner && inner.length) {
                for (let i=0, il=inner.length; i<il; i++) {
                    writePoly(writer, inner[i]);
                }
            }
            // write total struct length at struct head
            writer.view.setUint16(pos, writer.pos - pos, true);
        }

        widgets.forEach(widget => {
            let slice = widget.slices[index];
            if (slice) {
                if (slice.synth) count++;
                let polys = slice.solids.unioned;
                if (!polys) polys = slice.tops.map(t => t.poly);
                if (slice.supports) polys.appendAll(slice.supports);
                array.appendAll(polys.map(poly => {
                    return poly.clone(true).move(widget.track.pos);
                }));
                count += polys.length;
            }
        });

        let wasm = SLA.wasm;
        let imagelen = width * height;
        let writer = new self.DataWriter(new DataView(wasm.memory.buffer), imagelen);
        writer.writeU16(width, true);
        writer.writeU16(height, true);
        writer.writeU16(array.length, true);

        // scale and move all polys to fit in rendered platform coordinates
        for (let i=0, il=array.length; i<il; i++) {
            let poly = array[i];
            scaleMovePoly(poly);
            writePoly(writer, poly);
        }
        wasm.render(0, imagelen, 0);
        let image = wasm.heap.slice(0, imagelen), layers = [];
        // one rle encoded bitstream for each mash (anti-alias sublayer)
        for (let l=0; l<masks.length; l++) {
            // while the image is still in wasm heap memory, rle encode it
            let rlelen = wasm.rle_encode(0, 0, imagelen, masks[l], imagelen, 0);
            layers.push(wasm.heap.slice(imagelen, imagelen + rlelen));
        }

        return { image, layers, end: count === 0 };
    }

    // legacy JS-only rasterizer uses OffscreenCanvas
    function renderLayer(params) {
        let {width, height, index, widgets, scaleX, scaleY} = params;
        let layer = new OffscreenCanvas(height,width);
        let opt = { scaleX, scaleY, width, height, width2: width/2, height2: height/2 };
        let ctx = layer.getContext('2d');
        ctx.fillStyle = 'rgb(200, 0, 0)';
        let count = 0;
        widgets.forEach(widget => {
            let slice = widget.slices[index];
            if (slice) {
                // prevent premature exit on empty synth slice
                if (slice.synth) count++;
                let polys = slice.solids.unioned;
                if (!polys) polys = slice.tops.map(t => t.poly);
                if (slice.supports) polys.appendAll(slice.supports);
                polys.forEach(poly => {
                    poly.move(widget.track.pos);
                    ctx.beginPath();
                    polyout(poly.setClockwise(), ctx, opt);
                    if (poly.inner) {
                        poly.inner.forEach(inner => {
                            polyout(inner.setCounterClockwise(), ctx, opt);
                        });
                    }
                    ctx.fill();
                    count++;
                });
            } else {
                // console.log({no_slice_at: index})
            }
        });
        let data = ctx.getImageData(0,0,height,width).data;
        // reduce RGBA to R
        let red = new Uint8ClampedArray(data.length / 4);
        for (let i=0; i<red.length; i++) {
            red[i] = data[i*4];
        }
        return { image: red, end: count === 0 };
    }

    function polyout(poly, ctx, opt) {
        let { scaleX, scaleY, width, height, width2, height2 } = opt;
        poly.forEachPoint((p,i) => {
            if (i === 0) {
                ctx.moveTo(height - (p.y * scaleY + height2), p.x * scaleX + width2);
            } else {
                ctx.lineTo(height - (p.y * scaleY + height2), p.x * scaleX + width2);
            }
        }, true);
        ctx.closePath();
    }

})();
