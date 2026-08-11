/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

export function createRasterContext(print) {
    let { settings, widgets } = print;
    let { device, process } = settings;
    let width = device.resolutionX;
    let height = device.resolutionY;
    let layermax = 0;

    widgets = widgets.filter(w => !w.track.ignore && !w.meta.disabled);
    widgets.forEach(widget => {
        layermax = Math.max(layermax, widget.slices.length);
    });

    return {
        settings,
        device,
        process,
        widgets,
        width,
        height,
        scaleX: width / device.bedWidth,
        scaleY: height / device.bedDepth,
        layermax
    };
}

export function renderRasterLayers(print, renderer, onlayer, progress) {
    let ctx = createRasterContext(print);
    let { process, widgets, width, height, scaleX, scaleY, layermax } = ctx;
    let volume = 0;
    let count = 0;
    let useWasm = renderer.renderLayerWasm !== undefined;

    for (let index=0; index<layermax; index++) {
        let params = {
            index,
            width,
            height,
            widgets,
            scaleX,
            scaleY,
            masks: []
        };
        let rendered;

        if (useWasm) {
            try {
                rendered = renderer.renderLayerWasm(params);
            } catch (error) {
                if (error.code !== "SLA_WASM_MEMORY" || !renderer.renderLayer) {
                    throw error;
                }
                useWasm = false;
                console.warn("SLA raster WASM failed; falling back to JS rasterizer", error);
            }
        }
        if (!useWasm) {
            rendered = renderer.renderLayer(params);
        }
        if (rendered.end) break;

        volume += rendered.area * process.slaSlice;
        onlayer({
            ctx,
            index,
            rendered,
            bottom: index < process.slaBaseLayers,
            z: process.slaFirstOffset + process.slaSlice * (index + 1)
        });
        count++;
        if (progress) progress(index / layermax);
    }

    return { ctx, layers: count, volume };
}

export function imageToRowMajor(image, width, height, map) {
    let data = new Uint8Array(width * height);

    for (let x=0; x<width; x++) {
        for (let y=0; y<height; y++) {
            let value = image[x * height + y] || 0;
            data[y * width + x] = map ? map(value) : value;
        }
    }

    return data;
}

export function round(value) {
    return Number.parseFloat(Number(value || 0).toFixed(5));
}
