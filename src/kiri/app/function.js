/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { client } from './workers.js';
import { codec } from '../core/codec.js';
import { space } from '../../moto/space.js';
import { COLOR, PMODES } from '../core/consts.js';
import { exportFile } from './export.js';

/**
 * Tracks completion state of operations to prevent redundant work.
 * Properties: slice, preview, export
 */
let complete = {};
let order;

/**
 * Prepare and execute slicing for all widgets on the platform.
 * Main slicing function that:
 * - Takes screenshots for export/preview
 * - Handles belt mode layout
 * - Slices each widget sequentially via worker
 * - Tracks progress across all widgets
 * - Renders sliced layers to stacks
 * - Emits slice.begin, slice, slice.end, slice.error events
 *
 * @param {function} [callback] - Called when slicing completes
 * @param {number} [scale=1] - Progress bar scale factor (for chaining operations)
 * @param {number} [offset=0] - Progress bar offset (for chaining operations)
 */
function prepareSlices(callback, scale = 1, offset = 0) {
    const { conf, event, feature, hide, mode, view, platform, show, stacks } = api;

    if (view.is_arrange()) {
        // in arrange mode, create a screenshot at the start slicing
        // this can be used later by exports and rendered on some devices
        let snap = space.screenshot();
        view.snapshot = snap.substring(snap.indexOf(",") + 1);
        client.snap(space.screenshot2({ width: 640 }));
        let bambu = view.bambu = { };
        space.screenshot3({ width: 512, out(png) { bambu.s512 = png } });
        space.screenshot3({ width: 128, out(png) { bambu.s128 = png } });
    }

    if (mode.is_sla() && !callback) {
        // in SLA mode, slice and preview are the same thing
        callback = preparePreview;
    }

    order = api.selection.count() ?
        Object.assign({}, ...api.selection.widgets().map((w,i) => ({[w.id]:i}))) :
        undefined;

    const widgets = api.widgets.all();
    const settings = conf.get();
    const { device, process, controller } = settings;
    const isBelt = device.bedBelt || false;
    const mark = Date.now();

    // force layout in belt mode when widget exceeds bed length
    // which has the side-effect (intended) of increasing the bed size
    if (widgets.length && isBelt) {
        let doLayout = false;
        for (let w of widgets) {
            let bb = w.getBoundingBox();
            let yspan = bb.max.y - bb.min.y;
            if (yspan > device.bedDepth) {
                doLayout = true;
            }
        }
        if (doLayout) {
            platform.layout();
        }
    }

    functions.clear_progress();
    platform.deselect();
    hide.slider();
    view.set_slice();
    conf.save();

    // allow client.js to generate support widgets
    event.emit('slice.begin', settings.mode);

    // refresh widget list because 'slice.begin' may generate support widgets
    const slicing = api.widgets.all()
        .filter(w => !w.track.ignore && !w.meta.disabled);

    if (slicing.length === 0) {
        return api.show.alert('nothing to slice');
    }

    const totalv = slicing.map(w => w.getVertices().count).reduce((a,v) => a + v);
    const defvert = totalv / slicing.length;
    const track = {};

    let totalProgress;

    api.widgets.setOpacity(COLOR.slicing_opacity);

    let segtimes = {},
        segNumber = 0,
        errored = false,
        startTime = Date.now(),
        toSlice = slicing.slice(),
        camOrLaser = mode.is_cam() || mode.is_laser(),
        extruders = {},
        lastMsg;

    for (let widget of toSlice) {
        widget.belt = null;
        widget.stats.progress = 0;
        widget.setColor(COLOR.slicing);
        let { extruder } = widget.anno;
        if (extruder >= 0) {
            extruders[extruder] = extruder;
        }
    }

    // in multi-material belt mode, the anchor needs to be extended
    // to allow room for the purge tower to be built. calculate here
    extruders = Object.values(extruders);
    if (isBelt && extruders.length > 1 && process.outputPurgeTower) {
        process.beltAnchor = Math.max(
            process.firstLayerBeltLead,
            Math.sqrt(process.outputPurgeTower) * extruders.length * (1/Math.sqrt(2)));
    } else if (isBelt) {
        process.beltAnchor = process.firstLayerBeltLead;
    }

    stacks.clear(); // clear rendered stacks
    client.clear(); // clear worker cache
    client.sync(); // send fresh widget data to worker

    if (isBelt) {
        // belt op required to rotate meshes for slicing
        client.rotate(settings);
    }

    function sliceSetup() {
        client.slicePre(settings, sliceNext);
    }

    function sliceNext() {
        if (toSlice.length) {
            // while more widgets to slice
            sliceWidget(toSlice.shift())
        } else {
            // once all slicing done, run sliceAll() once for all widgets
            client.sliceAll(settings, sliceDone);
        }
    }

    function sliceWidget(widget) {

        function onupdate(update, msg, alert) {
            if (alert) {
                api.show.alert(alert);
            }
            if (msg && msg !== lastMsg) {
                let mark = Date.now();
                if (lastMsg) {
                    let key = slicing.length > 1 ?
                        `${widget.id} ${segNumber++} ${lastMsg}` :
                        `${segNumber++} ${lastMsg}`
                    segtimes[key] = mark - startTime;
                }
                lastMsg = msg;
                startTime = mark;
            }
            // on update
            if (update >= 0) {
                track[widget.id] = (update || 0) * factor;
                totalProgress = 0;
                for (let w of slicing) {
                    totalProgress += (track[w.id] || 0);
                }
                show.progress(offset + (totalProgress / slicing.length) * scale, msg);
            }
        }

        function ondone(sliced, error) {
            let mark = Date.now();
            // update UI info
            if (sliced) {
                // update segment time
                if (lastMsg) {
                    let key = slicing.length > 1 ?
                        `${widget.id} ${segNumber++} ${lastMsg}` :
                        `${segNumber++} ${lastMsg}`
                    segtimes[`${key}`] = mark - startTime;
                }
                event.emit('slice', settings.mode);
            }
            // handle slicing errors
            if (error && !errored) {
                errored = true;
                view.set_arrange();
                show.alert(error, 5);
                show.progress(0);
                client.restart();
                event.emit('slice.error', error);
                setTimeout(view.set_arrange, 1);
            }
            if (errored) {
                // terminate slicing
                sliceDone();
            } else {
                // start next widget slice
                sliceNext();
            }
        }

        // weight each widget progress % by their # vertices
        let factor = (widget.getVertices().count / defvert);

        widget.settings = settings;
        widget.clearSlices();
 
        onupdate(0.0001, "slicing");

        // store slicing visuals
        widget.stack = api.stacks.create(widget.id, widget.mesh);

        // compensate for zcut (widget moved through floor)
        widget.stack.obj.view.position.z = widget.track.zcut || 0;

        // in case result of slice is nothing, do not preserve previous
        widget.slices = []

        // executed from kiri.js
        client.slice(settings, widget, (reply) => {
            if (reply.alert) {
                onupdate(null, null, reply.alert);
            }
            if (reply.update) {
                onupdate(reply.update, reply.updateStatus);
            }
            if (reply.send_start) {
                widget.xfer = {start: reply.send_start};
            }
            if (reply.stats) {
                widget.stats = reply.stats;
            }
            if (reply.send_end) {
                widget.stats.load_time = widget.xfer.start - reply.send_end;
            }
            if (reply.slice) {
                widget.slices.push(codec.decode(reply.slice, {mesh:widget.mesh}));
            }
            if (reply.done) {
                ondone(true);
            }
            if (reply.error) {
                ondone(false, reply.error);
            }
        });

        // discard point cache
        widget.points = undefined;
    }

    function sliceDone() {
        let alert = null;
        if (scale === 1 && feature.work_alerts && slicing.length) {
            alert = show.alert("Rendering");
        };
        for (let widget of slicing) {
            // on done
            let key = slicing.length > 1 ?
                `${widget.id}_${segNumber++} draw` :
                `${segNumber++} draw`
            segtimes[`${key}`] = widget.render(widget.stack);
            // rotate stack for belt beds
            if (widget.belt) {
                widget.stack.obj.rotate(widget.belt);
            }
            if (scale === 1) {
                // clear wireframe
                widget.setWireframe(false, COLOR.wireframe, COLOR.wireframe_opacity);
                widget.setOpacity(camOrLaser ? COLOR.cam_sliced_opacity : COLOR.sliced_opacity);
                widget.setColor(COLOR.deselected);
                api.hide.alert(alert);
            }
        }
        view.update_slider_max(true);
        show.layer(-1, 0);
        if (scale === 1) {
            view.update_stack_labels();
        }
        // if (!isBelt && controller.lineType === 'line' && !process.xray && !controller.devel) {
        //     $('render-ghost').onclick();
        // }
        if (scale === 1) {
            show.progress(0);
        }
        // mark slicing complete for prep/preview
        complete.slice = true;
        event.emit('slice.end', settings.mode);
        // print stats
        segtimes.total = Date.now() - mark;
        console.log(segtimes);
        api.visuals.update_stats(segtimes);
        if (callback && typeof callback === 'function') {
            callback();
        }
        if (isBelt) {
            // required to render supports properly (in belt mode)
            // because this updates widget top z which is affected by rotation
            api.platform.update_top_z();
        }
        // refresh / repaint workspace
        space.refresh();
    }

    // do any global setup / state management
    // then kick off slicing chain
    sliceSetup();
}

/**
 * Prepare preview/print visualization.
 * Generates toolpaths and renders them as 3D lines.
 * Handles multiple preview modes (speed, filament, layer) via feature.pmode.
 * Auto-runs slicing first if not already complete.
 * Emits preview.begin, print, preview.end, preview.error events.
 *
 * @param {function} [callback] - Called when preview completes
 * @param {number} [scale=1] - Progress bar scale factor (for chaining operations)
 * @param {number} [offset=0] - Progress bar offset (for chaining operations)
 */
function preparePreview(callback, scale = 1, offset = 0) {
    const { conf, event, feature, hide, mode, view, platform, show, stacks } = api;
    const widgets = api.widgets.all();
    const settings = conf.get();
    const { device, process, controller } = settings;

    if (complete.preview === feature.pmode) {
        if (device.extruders && device.extruders.length > 1) {
            if (++feature.pmode > 2) {
                feature.pmode = 1;
            }
        } else {
            if (callback) {
                callback();
            }
            return;
        }
    }

    if (!complete.slice) {
        settings.render = false;
        prepareSlices(() => { preparePreview(callback, 0.25, 0.75) }, 0.75);
        return;
    }

    hide.slider(true);

    const isCam = mode.is_cam(), pMode = settings.mode;
    const isDark = api.space.is_dark();
    const isBelt = device.bedBelt || false;

    view.set_preview();
    conf.save();
    event.emit('preview.begin', pMode);

    if (isCam) {
        api.widgets.setOpacity(isDark ? COLOR.cam_preview_opacity_dark : COLOR.cam_preview_opacity);
        api.widgets.setColor(isDark ? COLOR.cam_preview_dark : COLOR.cam_preview);
    } else if (offset === 0) {
        api.widgets.setOpacity(COLOR.preview_opacity);
    }

    let mark = Date.now(),
        segNumber = 0,
        segtimes = {},
        startTime,
        lastMsg,
        output = [];

    // pass preview mode to worker
    settings.pmode = feature.pmode;
    settings.render = true;
    settings.order = order;

    client.prepare(settings, (progress, message, layer) => {
        if (layer) {
            output.push(codec.decode(layer));
        }
        if (message && message !== lastMsg) {
            const mark = Date.now();
            if (lastMsg) {
                segtimes[`${segNumber++} ${lastMsg}`] = mark - startTime;
            }
            lastMsg = message;
            startTime = mark;
        }
        show.progress(offset + progress * scale, message);
    }, (reply, maxSpeed, minSpeed) => {
        // handle worker errors
        if (reply && reply.error) {
            show.alert(reply.error, 5);
            view.set_arrange();
            show.progress(0);
            space.update();
            event.emit('preview.error', reply.error);
            return;
        }

        if (lastMsg) {
            segtimes[`${segNumber++} ${lastMsg}`] = Date.now() - startTime;
        }

        show.progress(0);
        if (!isCam) {
            api.widgets.setOpacity(0);
        }

        if (output.length) {
            let alert = feature.work_alerts ? show.alert("Rendering") : null;
            startTime = Date.now();
            stacks.clear();
            const stack = stacks.create('print', space.world)
            const view = stack.obj.view;
            output.forEach(layer => {
                stack.add(layer);
            });
            event.emit('preview.view', view);
            // rotate stack for belt beds
            if (isBelt && widgets[0].belt) {
                let ri = widgets[0].belt;
                ri.dz = 0;
                ri.dy = settings.device.bedDepth / 2;
                stack.obj.rotate(widgets[0].belt);
            }
            api.hide.alert(alert);
            segtimes[`${segNumber} draw`] = Date.now() - startTime;
        }

        // print stats
        segtimes.total = Date.now() - mark;
        console.log(segtimes);
        api.visuals.update_stats(segtimes);

        event.emit('print', pMode);
        event.emit('preview.end', pMode);

        space.update();
        view.update_slider_max(true);
        show.layer(-1, 0);
        if (feature.pmode === PMODES.SPEED) {
            view.update_speeds(maxSpeed, minSpeed);
        } else {
            view.update_speeds();
        }
        view.update_stack_labels();

        let { controller, process } = settings;
        // if (!isBelt && controller.lineType === 'line' && !process.xray && !controller.devel) {
        //     $('render-ghost').onclick();
        // }

        // mark preview complete for export
        complete.preview = feature.pmode;

        if (typeof(callback) === 'function') {
            callback();
        }
    });
}

/**
 * Prepare animation (requires SharedArrayBuffer support).
 * Checks for browser support and emits function.animate event.
 */
function prepareAnimation() {
    if (!window.SharedArrayBuffer) {
        api.alerts.show("The security context of this");
        api.alerts.show("window prevents animations.");
        api.alerts.show("Try a Chromium-based browser");
        return;
    }
    api.event.emit("function.animate", {mode: api.conf.get().mode});
}

/**
 * Prepare and trigger export.
 * Auto-runs preview first if not already complete.
 * Delegates to exportFile() for mode-specific export.
 * @param {...*} args - Arguments passed through to exportFile()
 */
function prepareExport() {
    const settings = api.conf.get();
    const argsave = arguments;
    if (!complete.preview) {
        preparePreview(() => { prepareExport(...argsave) });
        return;
    }
    api.event.emit("function.export", {mode: settings.mode});
    complete.export = true;
    exportFile(...argsave);
}

/**
 * Cancel running worker operation by restarting the worker.
 */
function cancelWorker() {
    if (client.isBusy()) {
        client.restart();
    }
}

/**
 * Parse and visualize gcode or other toolpath code.
 * Sends code to worker for parsing, renders result as 3D preview.
 * Emits code.load and code.loaded events.
 *
 * @param {string} code - Gcode or toolpath text
 * @param {string} type - Code type identifier (gcode, etc.)
 */
function parseCode(code, type) {
    const { conf, event, show, stacks, widgets, view } = api;
    const settings = conf.get();

    event.emit("code.load", {code, type});
    view.set_preview();
    widgets.setOpacity(0);

    client.parse({code, type, settings}, progress => {
        show.progress(progress, "parsing");
    }, (layers, maxSpeed, minSpeed) => {
        show.progress(0);
        stacks.clear();
        const stack = stacks.create('parse', space.world);
        layers.forEach(layer => stack.add(layer));
        view.update_slider_max(true);
        view.update_speeds(maxSpeed, minSpeed);
        show.slices();
        view.update_stack_labels();
        space.update();
        event.emit("code.loaded", {code, type});
    });
}

/**
 * Clear operation completion tracking.
 * Resets complete state so operations can run again.
 */
function clear_progress() {
    complete = {};
}

// extend API (api.function)
export const functions = {
    slice: prepareSlices,
    print: preparePreview,
    prepare: preparePreview,
    animate: prepareAnimation,
    export: prepareExport,
    cancel: cancelWorker,
    parse: parseCode,
    clear: client.clear,
    clear_progress,
};

export {
    prepareSlices as slice,
    preparePreview as print,
    preparePreview as prepare,
    prepareAnimation as animate,
    prepareExport as export,
    cancelWorker as cancel,
    parseCode as parse,
    clear_progress,
};
