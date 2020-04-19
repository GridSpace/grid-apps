/** Copyright 2014-2019 Stewart Allen -- All Rights Reserved */

"use strict";

let gs_kiri_sla = exports;

(function() {

    if (!self.kiri) self.kiri = { };
    if (!self.kiri.driver) self.kiri.driver = { };
    if (self.kiri.driver.SLA) return;

    let KIRI = self.kiri,
        BASE = self.base,
        DBUG = BASE.debug,
        UTIL = BASE.util,
        CONF = BASE.config,
        POLY = BASE.polygons,
        SLA = KIRI.driver.SLA = {
            slice,
            printSetup,
            printExport,
            printDownload,
            printRender
        },
        SLICER = KIRI.slicer,
        newPoint = BASE.newPoint,
        preview,
        previewSmall,
        previewLarge,
        fill_cache;

    /**
     * DRIVER SLICE CONTRACT - runs in worker
     *
     * @param {Object} settings
     * @param {Widget} Widget
     * @param {Function} onupdate (called with % complete and optional message)
     * @param {Function} ondone (called when complete with an array of Slice objects)
     */
    function slice(settings, widget, onupdate, ondone) {
        let process = settings.process,
            device = settings.device;

        if (!self.OffscreenCanvas) {
            return ondone("browser lacks support for OffscreenCanvas",true);
        }

        // calculate % complete and call onupdate()
        function doupdate(slices, index, from, to, msg) {
            onupdate(0.25 + (from + ((index / slices.length) * (to - from))) * 0.75, msg);
        }

        // for each slice, perform a function and call doupdate()
        function forSlices(slices, from, to, fn, msg) {
            slices.forEach(function(slice,index) {
                fn(slice,index);
                doupdate(slices, slice.index, from, to, msg)
            });
        }

        let b64 = atob(currentSnap);
        let bin = Uint8Array.from(b64, c => c.charCodeAt(0));
        let img = new png.PNG().parse(bin, (err, data) => {
            preview = img;
            previewSmall = samplePNG(img, 200, 125);
            previewLarge = samplePNG(img, 400, 300);
        });

        SLICER.sliceWidget(widget, {
            height: process.slaSlice || 0.05,
            add: !process.slaOpenTop
        }, function(slices) {
            widget.slices = slices.filter(slice => slice.tops.length);
            if (process.slaOpenTop) {
                // with closed top, filter out any empty above slices
                // that will generate a diff producing a solid projection
                slices = widget.slices;
            }
            // reset for solids and support projections
            slices.forEach(function(slice) {
                slice.invalidateFill();
                slice.invalidateSolids();
                slice.invalidateSupports();
                slice.isSolidFill = false;
            });
            let solidLayers = Math.round(process.slaShell / process.slaSlice);
            forSlices(slices, 0.05, 0.1, (slice,index) => {
                if (process.slaShell) {
                    slice.doShells(2, 0, process.slaShell);
                } else {
                    slice.doShells(1, 0);
                }
            }, "slice");
            forSlices(slices, 0.1, 0.2, (slice) => {
                slice.doDiff(0.00001, 0.005, !process.slaOpenBase);
            }, "delta");
            if (solidLayers) {
                forSlices(slices, 0.2, 0.3, (slice) => {
                    slice.projectFlats(solidLayers);
                    slice.projectBridges(solidLayers);
                }, "project");
                forSlices(slices, 0.3, 0.4, (slice) => {
                    slice.doSolidsFill(undefined, undefined, 0.001);
                    let traces = POLY.nest(POLY.flatten(slice.gatherTraces([])));
                    let trims = slice.solids.trimmed || [];
                    traces.appendAll(trims);
                    let union = POLY.union(traces);
                    slice.solids.unioned = union;
                }, "solid");
            } else {
                forSlices(slices, 0.2, 0.4, (slice) => {
                    slice.solids.unioned = slice.gatherTopPolys([]);
                }, "solid");
            }
            if (process.slaFillDensity && process.slaShell) {
                fill_cache = [];
                forSlices(slices, 0.4, 1.0, (slice) => {
                    fillPolys(slice, settings);
                }, "infill");
            }
            ondone();
        }, function(update) {
            return onupdate(0.0 + update * 0.25);
        });
    };

    function fillPolys(slice, settings) {
        let process = settings.process,
            device = settings.device,
            polys = slice.solids.unioned,
            bounds = settings.bounds,
            width = bounds.max.x - bounds.min.x,
            depth = bounds.max.y - bounds.min.y,
            max = Math.max(width,depth),
            seq = Math.round(process.slaFillLine / process.slaSlice),
            linew = process.slaFillLine,
            units_w = (width / linew) * process.slaFillDensity,
            units_d = (depth / linew) * process.slaFillDensity,
            step_x = width / units_w,
            step_y = depth / units_d,
            start_x = -(width / 2),
            start_y = -(depth / 2),
            end_x = width / 2,
            end_y = depth / 2,
            fill = [];

        let seq_i = Math.floor(slice.index / seq),
            seq_c = seq_i % 4,
            cached = fill_cache[seq_c];

        if (!cached && seq_c !== 1)
        for (let x=start_x; x<end_x; x += step_x) {
            fill.push(
                BASE.newPolygon().centerRectangle({
                    x: x + step_x/2,
                    y: 0,
                    z: slice.z
                }, linew, depth)
            );
        }

        if (!cached && seq_c !== 3)
        for (let y=start_y; y<end_y; y += step_y) {
            fill.push(
                BASE.newPolygon().centerRectangle({
                    x: 0,
                    y: y + step_y/2,
                    z: slice.z
                }, width, linew)
            );
        }

        if (!cached) {
            fill = POLY.union(fill);
            fill_cache[seq_c] = fill;
        } else {
            fill = cached.slice().map(p => p.clone(true).setZ(slice.z));
        }

        fill = POLY.trimTo(fill, slice.tops.map(t => t.poly));
        fill = POLY.union(slice.solids.unioned.appendAll(fill));

        slice.solids.unioned = fill;
    }

    /**
     * DRIVER PRINT CONTRACT - runs in worker
     * @param {Object} print state object
     * @param {Function} update incremental callback
     */
    function printSetup(print, update) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            output = print.images = [],
            layermax = 0,
            width = 2560,
            height = 1440,
            width2 = width/2,
            height2 = height/2,
            scaleX = width / device.bedWidth,
            scaleY = height / device.bedDepth;

        let mark = Date.now();

        widgets.forEach(widget => {
            layermax = Math.max(widget.slices.length);
        });

        function polyout(poly, ctx) {
            poly.forEachPoint((p,i) => {
                if (i === 0) {
                    ctx.moveTo(height - (p.y * scaleY + height2), p.x * scaleX + width2);
                } else {
                    ctx.lineTo(height - (p.y * scaleY + height2), p.x * scaleX + width2);
                }
            }, true);
            ctx.closePath();
        }

        for (let index=0; index < layermax; index++) {
            let layer = new OffscreenCanvas(height,width);
            let ctx = layer.getContext('2d');
            ctx.fillStyle = 'rgb(200, 0, 0)';
            let count = 0;
            widgets.forEach(widget => {
                let slice = widget.slices[index];
                if (slice) {
                    let traces = POLY.flatten(slice.gatherTraces([]));
                    let polys = slice.solids.unioned;
                    polys.forEach(poly => {
                        ctx.beginPath();
                        polyout(poly.setClockwise(), ctx);
                        if (poly.inner) {
                            poly.inner.forEach(inner => {
                                polyout(inner.setCounterClockwise(), ctx);
                            });
                        }
                        ctx.fill();
                        count++;
                    });
                } else {
                    console.log({no_slice_at: index})
                }
            });
            let data = ctx.getImageData(0,0,height,width).data;
            let red = new Uint8ClampedArray(data.length / 4);
            for (let i=0; i<red.length; i++) {
                red[i] = data[i*4];
            }
            output.push(red);
            update(index / layermax);
            if (count === 0) break;
        }

        update(1);

        console.log('print.setup', Date.now() - mark);
    };

    /**
     * DRIVER PRINT CONTRACT - runs in worker
     * @param {Object} print state object
     * @param {Function} online streaming reply
     * @param {Function} ondone last reply
     */
    function printExport(print, online, ondone) {
        let widgets = print.widgets,
            settings = print.settings,
            device = settings.device,
            process = settings.process,
            output = print.output,
            mark = Date.now();

        print.images.forEach((image,index) => {
            online({
                progress: (index / print.images.length) * 0.25,
                message: "image_xfer",
                data: image
            });
        });

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
            width: 2560,
            height: 1440,
            lines: print.images,
            small: previewSmall.data,
            large: previewLarge.data
        }, (progress, message) => {
            online({progress: progress * 0.75 + 0.25, message});
        });

        ondone({
            width: 2560,
            height: 1440,
            file: file
        },[file]);

        // release memory
        print.images = null;
        console.log('print.export', Date.now() - mark);
    };

    // runs in browser main
    function printRender(print) {
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
                let polys = slice.solids.unioned;
                polys.forEach(poly => {
                    layer.poly(poly, 0x010101, true);
                    layer.solid(poly, 0x00bbee);
                    count++;
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

    // runs in browser main
    function printDownload(print) {
        let { API, lines, done } = print.sla;
        let filename = `print-${new Date().getTime().toString(36)}`;

        API.ajax("/kiri/output-sla.html", html => {
            API.ui.print.innerHTML = html;

            let printset = print.settings,
                process = printset.process,
                device = printset.device,
                print_sec = (process.slaBaseLayers * process.slaBaseOn) +
                    (lines.length - process.slaBaseLayers) * process.slaLayerOn,
                print_min = Math.floor(print_sec/60),
                print_hrs = Math.floor(print_min/60),
                download = $('print-photon');

            print_sec -= (print_min * 60);
            print_min -= (print_hrs * 60);
            print_sec = print_sec.toString().padStart(2,'0');
            print_min = print_min.toString().padStart(2,'0');
            print_hrs = print_hrs.toString().padStart(2,'0');

            $('print-filename').value = filename;
            $('print-layers').value = lines.length;
            $('print-time').value = `${print_hrs}:${print_min}:${print_sec}`;
            $('print-close').onclick = API.modal.hide;

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
                let lineDV = new DataView(lines[range.value].buffer);
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
            subcount = process.slaAntiAlias || 1,
            masks = [];

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

        let coded = encodeLayers(converted, "photon", (pro => {
            progress(pro * 0.4 + 0.4, "layer_encode");
        }));
        let buflen = 3000 + coded.length + (layerCount * subcount * 28) + small.byteLength + large.byteLength;
        let filebuf = new ArrayBuffer(buflen);
        let filedat = new DataWriter(new DataView(filebuf));
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
        filedat.writeU32(layerCount, true);
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
            layerCount = conf.lines.length,
            layerBytes = width * height;

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

        let coded = encodeLayers(converted, "photons");
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

    function pixAt(png,x,y) {
        let idx = (x + png.width * y) * 4;
        let dat = png.data;
        return [
            dat[idx++],
            dat[idx++],
            dat[idx++],
            dat[idx++]
        ];
    }

    function averageBlock(png,x1,y1,x2,y2) {
        let val = [0, 0, 0, 0], count = 0, x, y, z, v2;
        for (x=x1; x<x2; x++) {
            for (y=y1; y<y2; y++) {
                v2 = pixAt(png,x,y);
                for (z=0; z<4; z++) {
                    val[z] += v2[z];
                }
                count++;
            }
        }
        for (z=0; z<4; z++) {
            val[z] = Math.abs(val[z] / count);
        }
        return val;
    };

    function samplePNG(png, width, height) {
        let th = width, tw = height,
            ratio = png.width / png.height,
            buf = new Uint8Array(th * tw * 4),
            div, xoff, yoff, dx, ex, dy, ey, bidx, pixval;

        if (ratio > 4/3) {
            div = png.height / tw;
            xoff = Math.round((png.width - (th * div)) / 2);
            yoff = 0;
        } else {
            div = png.width / th;
            xoff = 0;
            yoff = Math.round((png.height - (tw * div)) / 2);
        }

        for (let y=0; y<tw; y++) {
            dy = Math.round(y * div + yoff);
            if (dy < 0 || dy > png.height) continue;
            ey = Math.round((y+1) * div + yoff);
            for (let x=0; x<th; x++) {
                dx = Math.round(x * div + xoff);
                if (dx < 0 || dx > png.width) continue;
                ex = Math.round((x+1) * div + xoff);
                bidx = (y * th + x) * 4;
                pixval = averageBlock(png,dx,dy,ex,ey);
                buf[bidx+0] = pixval[0];
                buf[bidx+1] = pixval[1];
                buf[bidx+2] = pixval[2];
                buf[bidx+3] = pixval[3];
            }
        }

        return {width, height, data:buf, png};
    }

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

})();

class DataWriter {
    constructor(view) {
        this.view = view;
        this.pos = 0;
    }

    skip(v) {
        let p = this.pos;
        this.pos += v;
        return p;
    }

    writeU8(v) {
        try {
            this.view.setUint8(this.pos, v);
            return this.skip(1);
        } catch (err) {
            console.log({pos:this.pos, err})
            throw err;
        }
    }

    writeU16(v,le) {
        this.view.setUint16(this.pos, v, le);
        return this.skip(2);
    }

    writeU32(v,le) {
        this.view.setUint32(this.pos, v, le);
        return this.skip(4);
    }

    writeF32(v,le) {
        this.view.setFloat32(this.pos, v, le);
        return this.skip(4);
    }

    writeF64(v,le) {
        this.view.setFloat64(this.pos, v, le);
        return this.skip(8);
    }
}
