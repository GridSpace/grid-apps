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
            width = device.resolutionX,
            height = device.resolutionY,
            scaleX = width / device.bedWidth,
            scaleY = height / device.bedDepth,
            alias = process.slaAntiAlias || 1,
            mark = Date.now(),
            layermax = 0;

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
                let {image, layers, end} = render(param);
                images.push(image);
                slices.push(layers);
                // transfer image memory to browser main
                image = image.buffer;
                online({
                    progress: (index / layermax) * part1,
                    message: "image_gen",
                    data: image
                }, [image]);
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
            ondone({
                width: width,
                height: height,
                file: file
            },[file]);
        } else {
            let part1 = 0.25;
            let part2 = 1 - part1;
            let images = [];
            let slices = [];

            for (let index=0; index < layermax; index++) {
                let param = { index, width, height, widgets, scaleX, scaleY };
                let {image, lines} = CXDLP.render(param);
                images.push(image);
                slices.push(lines);
                // transfer image memory to browser main
                // it *should* be sampled to save memory
                image = image.buffer;
                online({
                    progress: (index / layermax) * part1,
                    message: "image_gen",
                    data: image
                }, [image]);
                // bail on an empty layer
                if (lines.length === 0) {
                    break;
                }
            }

            let file = CXDLP.export({settings, width, height, slices});
            ondone({
                width: width,
                height: height,
                file: file
            }, [file]);
        }

        console.log('print.export', Date.now() - mark);
    };

    function generateCXDLP(print, conf, progress) {
        console.log({generateCXDLP: print, conf, progress});
    }

})();
