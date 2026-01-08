/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $, h } from '../../moto/webui.js';
import { ajax, js2o } from '../core/utils.js';
import { api } from './api.js';
import { MODES } from '../core/consts.js';
import { colorSchemeRegistry } from './color/schemes.js';
import { load as file_load } from '../../load/file.js';
import { newBounds } from '../../geo/bounds.js';
import { Packer } from './pack.js';
import { space } from '../../moto/space.js';
import { THREE } from '../../ext/three.js';
import { Widget, newWidget } from './widget.js';

const V0 = new THREE.Vector3(0,0,0);

/**
 * Get current color scheme
 */
function getColorScheme() {
    const mode = api.mode.get_id();
    const theme = api.space.is_dark() ? 'dark' : 'light';
    return colorSchemeRegistry.getScheme(mode, theme);
}

/** Bounds update callback */
let setbounds = undefined;

/** Flag indicating if grouping operation is in progress */
let grouping = false;

/** Maximum Z height of all widgets on platform */
let topZ = 0;

/**
 * Get current settings object.
 * @returns {object} Current configuration
 */
function current() {
    return api.conf.get();
}

/**
 * Get current mode ID constant.
 * @returns {number} Mode ID
 */
function get_mode() {
    return api.mode.get_id();
}

/**
 * Update platform origin position and rulers.
 * Calculates origin based on mode, device, and process settings:
 * - FDM: Corner or center based on device.originCenter/bedRound
 * - CAM: Relative to stock, with optional top origin
 * - 2D modes (LASER, DRAG, WJET, WEDM): Corner, center, or bounds-based
 * - Belt: Special Y offset handling
 * Applies mode-specific origin offsets and updates visual rulers.
 *
 * @param {boolean} [update_bounds=true] - Whether to recalculate bounds first
 */
function update_origin(update_bounds = true) {
    if (update_bounds) {
        platform.update_bounds();
    }

    const settings = current();
    const { device, process, controller, stock, bounds } = settings;
    const { FDM, CAM, SLA, LASER, DRAG, WJET, WEDM } = MODES;
    const TWOD = [ LASER, DRAG, WJET, WEDM ];
    const MODE = get_mode();

    let ruler = controller.showRulers;
    let stockCenter = stock.center || { x: 0, y: 0, z: 0 };
    let isIndexed = process.camStockIndexed;
    let isBelt = device.bedBelt;
    let origin = settings.origin = { x: 0, y: 0, z: 0 };
    let center = MODE === MODES.FDM ? device.originCenter || device.bedRound :
       MODE === MODES.SLA ? false :
       MODE === MODES.CAM ? process.camOriginCenter :
       device.originCenter || process.ctOriginCenter;

    if (MODE === MODES.CAM && process.camOriginTop) {
        origin.z = stock.z + 0.01;
    }

    if (!center) {
        if (MODE === MODES.CAM) {
            origin.x = (-stock.x / 2) + stockCenter.x;
            origin.y = (stock.y / 2) - stockCenter.y;
        } else {
            if (TWOD.contains(MODE) && process.ctOriginBounds) {
                let b = bounds;
                origin.x = b.min.x,
                origin.y = -b.min.y
            } else {
                origin.x = -device.bedWidth / 2;
                origin.y = device.bedDepth / 2;
            }
        }
    } else if (MODE === MODES.CAM) {
        origin.x = stockCenter.x;
        origin.y = -stockCenter.y;
    } else if (TWOD.contains(MODE) && process.ctOriginBounds ) {
        let b = bounds,
            mx = bounds.min.x,
            my = bounds.min.y,
            xd = b.max.x - mx,
            yd = b.max.y - my;
        origin.x += (mx + xd / 2);
        origin.y -= (my + yd / 2);
    } else if (isBelt) {
        origin.y = device.bedDepth / 2;
    }

    // CNC origin offsets
    if (MODE === MODES.CAM) {
        origin.x += process.camOriginOffX;
        origin.y -= process.camOriginOffY;
        origin.z += process.camOriginOffZ;
        if (isIndexed) {
            origin.y = 0;
        }
    }

    //  WireEDM origin offsets
    if (MODE === MODES.WEDM && process.ctOriginBounds) {
        origin.x -= process.ctOriginOffX;
        origin.y += process.ctOriginOffY;
    }
    space.platform.setRulers(ruler, ruler, 1 / api.view.unit_scale(), 'X', isBelt ? 'Z' : 'Y');

    let { x, y, z } = origin;
    let oz = process.camStockIndexed ? z / 2 : z;
    if (controller.showOrigin && MODE !== MODES.SLA) {
        space.platform.setOrigin(x, y, oz, true);
    } else {
        space.platform.setOrigin(x, y, oz, false);
    }
}

/**
 * Update platform size and visual appearance.
 * Sets platform dimensions from device settings, updates grid/rulers,
 * and applies dark mode styling if enabled.
 *
 * @param {boolean} [updateDark=true] - Whether to update dark mode styling
 */
function update_size(updateDark = true) {
    const { process, device, controller } = current();
    const { showRulers, units } = controller;

    space.platform.setRound(device.bedRound);
    space.platform.setSize(
       parseInt(device.bedWidth || 300),
       parseInt(device.bedDepth || 300),
       parseFloat(device.bedHeight || 5),
       parseFloat(device.maxHeight || 100)
    );

    const ruler = showRulers,
        unitMM = units === 'mm',
        gridMajor = unitMM ? 25 : 25.4,
        gridMinor = unitMM ? 5 : 25.4 / 10;

    if (updateDark) {
       const scheme = getColorScheme();
       if (controller.dark) {
           space.platform.set({ light: 0.08 });
           space.platform.setFont({rulerColor:'#888888'});
           space.platform.setGrid(gridMajor, gridMinor, scheme.grid.major, scheme.grid.minor);
           space.platform.opacity(0.05);
           space.sky.set({ color: 0, ambient: { intensity: 0.6 } });
           document.body.classList.add('dark');
       } else {
           space.platform.set({ light: 0.08 });
           space.platform.setFont({rulerColor:'#333333'});
           space.platform.setGrid(gridMajor, gridMinor, scheme.grid.major, scheme.grid.minor);
           space.platform.opacity(0.2);
           space.sky.set({ color: 0xffffff, ambient: { intensity: 1.1 } });
           document.body.classList.remove('dark');
       }
       space.platform.setSize();
    }

    space.platform.setRulers(ruler, ruler, 1 / api.view.unit_scale(), 'X', device.bedBelt ? 'Z' : 'Y');
    platform.update_origin();
}

/**
 * Update topZ to track maximum Z height of all widgets.
 * Used for belt mode and other Z-dependent calculations.
 */
function platformUpdateMidZ() {
    topZ = 0;
    api.widgets.each(widget => {
        topZ = Math.max(topZ, widget.mesh.getBoundingBox().max.z);
    });
    space.platform.setMaxZ(topZ);
}

/**
 * Update widget Z positioning based on CAM anchoring settings.
 * In CAM mode, anchors widgets to top/middle/bottom of stock with offset.
 * In other modes, resets topZ to 0.
 */
function update_top_z() {
    const { process, stock } = current();
    const MODE = get_mode();
    api.widgets.each(widget => {
        if (MODE === MODES.CAM) {
            const bounds = widget.getBoundingBox();
            const wzmax = bounds.max.z;
            const zdelta = process.camZOffset || 0;
            switch (process.camZAnchor) {
                case 'top':
                    widget.setTopZ(stock.z - zdelta, true);
                    break;
                case 'middle':
                    if (widget.isIndexed) {
                        widget.setTopZ(zdelta, true);
                    } else {
                        widget.setTopZ(stock.z - (stock.z - wzmax) / 2 + zdelta, true);
                    }
                    break;
                case 'bottom':
                    widget.setTopZ(wzmax + zdelta, true);
                    break;
            }
        } else {
            widget.setTopZ(0);
        }
    });
}

/**
 * Calculate and update stock dimensions for CAM mode.
 * Stock dimensions can be absolute or relative (offset from bounds).
 * Falls back to offset mode if any stock dimension is 0.
 * Calculates stock center point for origin calculations.
 * In non-CAM modes, clears stock object.
 */
function platformUpdateStock() {
    const settings = current();
    const { bounds, process, mode } = settings;
    const { camStockX, camStockY, camStockZ, camStockOffset, camStockIndexed } = process;
    if (mode === 'CAM') {
        let stock = settings.stock = {
            x: camStockX,
            y: camStockY,
            z: camStockZ
        };
        // drop back to offset mode if any stock dimension is 0
        if (camStockOffset || (stock.x * stock.y * stock.z === 0)) {
            stock.x += bounds.max.x - bounds.min.x;
            stock.y += bounds.max.y - bounds.min.y;
            stock.z += bounds.max.z - bounds.min.z;
        }
        stock.center = {
            x: (bounds.max.x + bounds.min.x) / 2,
            y: (bounds.max.y + bounds.min.y) / 2,
            z: camStockIndexed ? 0 : stock.z / 2
        };
    } else {
       settings.stock = {};
    }
}

/**
 * Set explicit platform bounds and trigger update.
 * @param {THREE.Box3} bounds - Bounding box to set
 * @returns {THREE.Box3} Updated bounds
 */
function set_bounds(bounds) {
    setbounds = bounds;
    return update_bounds();
}

/**
 * Calculate platform bounds from all widgets or use explicit bounds.
 * Unions all widget bounding boxes translated by their positions.
 * Updates stock, top Z, midZ, and origin after calculation.
 * @returns {THREE.Box3} Calculated or explicit bounds
 */
function update_bounds() {
    const bounds = setbounds || new THREE.Box3();
    if (!setbounds)
    api.widgets.each(widget => {
        let wp = widget.track.pos;
        let wb = widget.getBoundingBox().clone();
        wb.min.x += wp.x;
        wb.max.x += wp.x;
        wb.min.y += wp.y;
        wb.max.y += wp.y;
        bounds.union(wb);
    });
    if (bounds.isEmpty()) {
        bounds.set(V0, V0);
    }
    current().bounds = bounds;
    platformUpdateStock();
    update_top_z();
    platformUpdateMidZ();
    update_origin(false);
    return bounds;
}

/**
 * Get count of selected widgets in arrange view.
 * @returns {number} Selection count (0 if not in arrange view)
 */
function selected_count() {
    return api.view.is_arrange() ? api.selection.count() : 0;
}

/**
 * Update visual appearance of selected widgets.
 * Sets selected color and highlights extruder buttons for FDM multi-extruder devices.
 * Saves widget state after selection.
 */
function update_selected() {
    const settings = current();

    const { device } = settings;
    const { extruders } = device;
    const { selection, ui } = api;

    if (extruders) {
        for (let i = 0; i < extruders.length; i++) {
            let b = $(`sel-ext-${i}`);
            if (b) b.classList.remove('pop-sel');
        }
        const scheme = getColorScheme();
        selection.for_widgets(w => {
            w.setColor(scheme.widget.selected);
            let ext = api.widgets.annotate(w.id).extruder || 0;
            let b = $(`sel-ext-${ext}`);
            if (b) b.classList.add('pop-sel');
            w.saveState();
        }, true);
    } else {
        const scheme = getColorScheme();
        selection.for_widgets(w => {
            w.setColor(scheme.widget.selected);
        }, true);
    }
}

/**
 * Select a widget on the platform.
 * Only works in arrange view. Handles group selection recursively.
 * With shift key, toggles selection. Without shift, replaces selection.
 * Emits 'widget.select' event and updates UI.
 * @param {Widget} widget - Widget to select
 * @param {boolean} shift - Whether shift key is pressed (multi-select)
 * @param {boolean} [recurse=true] - Whether to recursively select group members
 */
function select(widget, shift, recurse = true) {
    const { event, selection, view } = api;

    if (!view.is_arrange()) {
        return;
    }

    // apply select to entire group
    if (recurse && widget && widget.group.length > 1) {
        for (let w of widget.group) {
            select(w, true, false);
        }
        return;
    }

    if (selection.contains(widget)) {
        if (shift) {
            platform.deselect(widget, recurse)
        } else if (selection.count() > 1) {
            platform.deselect(undefined, recurse);
            platform.select(widget, false, recurse);
        }
    } else {
        // prevent selection in slice view
        if (!widget.isVisible()) {
            return;
        }
        if (!shift) {
            platform.deselect(undefined, recurse);
        }
        selection.add(widget);
        event.emit('widget.select', widget);
        const scheme = getColorScheme();
        widget.setColor(scheme.widget.selected);
        $(`ws-${widget.id}`)?.classList.add('selected');
        selection.update_info();
    }

    platform.update_selected();
    space.update();
}

/**
 * Deselect widget(s) on the platform.
 * Only works in arrange view. Handles group deselection recursively.
 * If no widget provided, deselects all widgets.
 * Emits 'widget.deselect' event and updates UI.
 * @param {Widget} [widget] - Widget to deselect, or undefined to deselect all
 * @param {boolean} [recurse=true] - Whether to recursively deselect group members
 */
function deselect(widget, recurse = true) {
    const { selection, view } = api;

    if (!view.is_arrange()) {
        // don't de-select and re-color widgets in,
        // for example, sliced or preview modes
        return;
    }

    // apply deselect to entire group
    if (recurse && widget && widget.group.length > 1) {
        for (let w of widget.group) {
            deselect(w, false);
        }
        return;
    }

    if (!widget) {
        api.widgets.each(function(widget) {
            platform.deselect(widget);
        });
        return;
    }

    if (selection.remove(widget)) {
        api.event.emit('widget.deselect', widget);
    }

    $(`ws-${widget.id}`)?.classList.remove('selected');
    const scheme = getColorScheme();
    widget.setColor(scheme.widget.deselected);
    platform.update_selected();
    selection.update_info();
    space.update();
}

/**
 * Load mesh from URL (.stl or raw vertex data).
 * Detects file type and delegates to load_stl or ajax loader.
 * @param {string} url - URL to load from
 * @param {Function} [onload] - Callback(vertices, widget) on load complete
 */
function load(url, onload) {
    if (url.toLowerCase().indexOf(".stl") > 0) {
        platform.load_stl(url, onload);
    } else {
        ajax(url, vertices => {
            vertices = js2o(vertices).toFloat32();
            let widget = newWidget().loadVertices(vertices);
            widget.meta.url = url;
            platform.add(widget);
            if (onload) onload(vertices, widget);
        });
    }
}

/**
 * Load STL file from URL and add to platform.
 * @param {string} url - URL to STL file
 * @param {Function} [onload] - Callback(vertices, widget) on load complete
 * @param {FormData} [formdata] - Optional form data for POST request
 * @param {boolean} [credentials] - Include credentials in request
 * @param {object} [headers] - Additional HTTP headers
 */
function load_stl(url, onload, formdata, credentials, headers) {
    new file_load.STL().load(url, (vertices, filename) => {
        if (vertices) {
            let widget = newWidget().loadVertices(vertices);
            widget.meta.file = filename;
            platform.add(widget);
            if (onload) {
                onload(vertices, widget);
            }
        }
    }, formdata, 1 / api.view.unit_scale(), credentials, headers);
}

/**
 * Load mesh(es) from URL via file loader.
 * Supports multiple file formats. Groups loading to prevent intermediate layouts.
 * Emits 'load.url' event with loaded widgets.
 * @param {string} url - URL to load from
 * @param {object} [options={}] - Load options including optional group array
 */
function load_url(url, options = {}) {
    platform.group();
    file_load.URL.load(url, options).then(objects => {
        let widgets = [];
        for (let object of objects) {
            let widget = newWidget(undefined, options.group).loadVertices(object.mesh);
            widget.meta.file = object.file;
            platform.add(widget);
            widgets.push(widget);
        }
        platform.group_done();
        api.event.emit("load.url", {
            url,
            options,
            widgets
        });
    }).catch(error => {
        api.show.alert(error);
    });
}

/**
 * Begin group loading mode.
 * Defers layout and group position updates until group_done() is called.
 */
function group() {
    grouping = true;
}

/**
 * Complete group loading and finalize widget positions.
 * Called after all widgets in a group are loaded.
 * Triggers layout if drop_layout feature is enabled.
 * @param {boolean} [skipLayout] - Whether to skip auto-layout
 */
function group_done(skipLayout) {
    grouping = false;
    Widget.Groups.loadDone();
    if (api.feature.drop_layout && !skipLayout) {
        platform.layout();
    }
}

/** Deferred widget additions pending batch processing */
let deferred = [];

/** Timeout handle for deferred widget batch processing */
let deferTimeout;

/**
 * Add widget to platform and 3D scene.
 * Can defer addition for batch processing to improve performance.
 * Initializes widget annotation (extruder assignment).
 * Updates bounds, triggers save, and positions widget if autoLayout is disabled.
 * Emits 'widget.add' event.
 * @param {Widget} widget - Widget to add
 * @param {boolean} shift - Whether to multi-select (shift key pressed)
 * @param {boolean} nolayout - Skip layout/positioning
 * @param {boolean} defer - Batch multiple adds for better performance
 */
function add(widget, shift, nolayout, defer) {
    api.widgets.add(widget);
    space.world.add(widget.mesh);
    widget.anno = widget.anno || {};
    widget.anno.extruder = widget.anno.extruder || 0;
    if (defer) {
        deferred.push({widget, shift, nolayout});
        clearTimeout(deferTimeout);
        deferTimeout = setTimeout(platformAddDeferred, 150);
    } else {
        platform.select(widget, shift);
        platform.update_bounds();
        api.space.auto_save();
        changed();
        api.event.emit('widget.add', widget);
        // Apply saved visual state AFTER selection/color to avoid being overwritten
        api.visuals.apply_visual_state(widget);
        if (nolayout) {
            return;
        }
        if (!grouping) {
            group_done(nolayout);
            if (!current().controller.autoLayout) {
                positionNewWidget(widget);
            }
        }
    }
}

/**
 * Process batch of deferred widget additions.
 * Called after 150ms timeout to batch multiple rapid additions.
 * Positions widgets if autoLayout is disabled, then completes grouping.
 * @private
 */
function platformAddDeferred() {
    let skiplayout = false;
    for (let rec of deferred) {
        let { widget, shift, nolayout } = rec;
        skiplayout |= nolayout;
        // platform.select(widget, shift);
        if (!nolayout && !current().controller.autoLayout) {
            positionNewWidget(widget);
        }
    }
    if (!grouping) {
        group_done(skiplayout);
    }
    api.event.emit('widget.add', deferred.map(r => r.widget));
    // Apply visual state to all deferred widgets after they're positioned
    for (let rec of deferred) {
        api.visuals.apply_visual_state(rec.widget);
    }
    platform.update_bounds();
    api.space.auto_save();
    changed();
    deferred = [];
}

/**
 * Find non-colliding position for newly added widget.
 * Uses spiral search pattern radiating from center (0,0).
 * Tests 360 positions at each radius (10, 20, 30...200mm).
 * Skips if this is the first widget on platform.
 * @param {Widget} widget - Widget to position
 * @private
 */
function positionNewWidget(widget) {
    if (api.widgets.count() <= 1) {
        return;
    }
    const settings = current();
    const { device } = settings;
    const { bedWidth, bedDepth } = device;
    const wbb = widget.getBoundingBox();
    const dim = {
        x: wbb.max.x - wbb.min.x,
        y: wbb.max.y - wbb.min.y
    };
    const hdim = {
        x: dim.x / 2,
        y: dim.y / 2
    };
    const bounds = newBounds();
    const target = newBounds();
    const DEG2RAD = Math.PI / 180;
    const WIDGETS = api.widgets.all();
    // look for best position for new widget that doesn't collide
    outer: for (let rad = 10; rad < 200; rad += 10) {
        inner: for (let d = 0; d < 360; d += 1) {
            let dx = Math.cos(d * DEG2RAD) * rad;
            let dy = Math.sin(d * DEG2RAD) * rad;
            bounds.set(dx - hdim.x, dx + hdim.x, dy - hdim.y, dy + hdim.y);
            for (let w = 0, wl = WIDGETS.length; w < wl; w++) {
                let wt = WIDGETS[w];
                if (wt === widget) {
                    continue;
                }
                let tpo = wt.track.pos;
                let tbb = wt.getBoundingBox();
                let dim = {
                    x: (tbb.max.x - tbb.min.x) / 2,
                    y: (tbb.max.y - tbb.min.y) / 2
                };
                target.set(tpo.x - dim.x, tpo.x + dim.x, tpo.y - dim.y, tpo.y + dim.y);
                if (target.overlaps(bounds, 5)) {
                    continue inner;
                }
            }
            widget._move(dx, dy, widget.track.pos.z, true);
            break outer;
        }
    }
}

/**
 * Delete widget(s) from platform.
 * Handles single widget, array of widgets, or widget records.
 * Removes from API widget collection, selection, groups, and 3D scene.
 * Can defer post-processing for batch deletions.
 * Emits 'widget.delete' event.
 * @param {Widget|Array<Widget>} widget - Widget(s) to delete
 * @param {boolean} [defer] - Skip post-processing (for batch operations)
 */
function platformDelete(widget, defer) {
    if (!widget) {
        return;
    }
    if (Array.isArray(widget)) {
        const mc = widget.slice();
        for (let i = 0; i < mc.length; i++) {
            platform.delete(mc[i].widget || mc[i], true);
        }
        delete_post();
        api.event.emit('widget.delete', widget);
        return;
    }
    api.client.clear(widget);
    api.widgets.remove(widget);
    api.selection.remove(widget);
    Widget.Groups.remove(widget);
    space.world.remove(widget.mesh);
    if (!defer) {
        delete_post();
        api.event.emit('widget.delete', widget);
    }
}

/**
 * Post-deletion cleanup and updates.
 * Updates slider, bounds, layout, selection, triggers save.
 * @private
 */
function delete_post() {
    api.view.update_slider_max();
    platform.update_bounds();
    if (get_mode() !== MODES.FDM) {
        platform.layout();
    }
    space.update();
    platform.update_selected();
    if (api.feature.drop_layout) {
        platform.layout();
    }
    api.space.auto_save();
    changed();
}

/**
 * Render widget list UI with action buttons.
 * Creates interactive widget cards with save/rename/replace/disable/delete buttons.
 * Highlights widgets on hover. Updates when widgets are added/removed/modified.
 */
function changed() {
    h.bind($('ws-widgets'), api.widgets.all().map(w => {
        let color;
        let file = w.meta.file || 'no name';
        let fsho = file.length > 25 ? file.slice(0,20) + '..' + file.slice(-2) : file;
        return [
            h.div({
                onmouseenter() {
                    color = w.getColor();
                    w.setColor(0x0088ff, null, false);
                },
                onmouseleave() {
                    w.setColor(color, null, false);
                },
            },[
                h.div({ class: "widpop" }, [
                    h.div({ class: "widopt" }, [
                        h.button(
                            {
                                title: "save",
                                onclick() { w.saveToCatalog(null,true) }
                            },
                            [ h.i({ class:"fas fa-save" }) ]
                        ),
                        h.button(
                            {
                                title: "rename",
                                onclick() { api.widgets.rename(w) }
                            },
                            [ h.i({ class:"fas fa-pen-to-square" }) ]
                        ),
                        h.button(
                            {
                                title: "replace",
                                onclick() { api.widgets.replace(null,w) }
                            },
                            [ h.i({ class:"fas fa-rotate" }) ]
                        ),
                        h.button(
                            {
                                id: `w-en-${w.id}`,
                                title: "toggle disabled",
                                class: w.meta.disabled ? "disabled" : "",
                                onclick() {
                                    let dis = w.meta.disabled = !w.meta.disabled;
                                    let sel = api.selection.contains(w);
                                    const scheme = getColorScheme();
                                    api.uc.setClass($(`w-en-${w.id}`), "disabled", dis);
                                    w.setColor(sel ? scheme.widget.selected : scheme.widget.deselected, null, false);
                                }
                            },
                            [ h.i({ class:"fas fa-ban" }) ]
                        ),
                        h.button(
                            {
                                title: "delete",
                                onclick() { platformDelete(w) }
                            },
                            [ h.i({ class:"fas fa-trash" }), ]
                        )
                    ]),
                    h.button([
                        h.i({ class: "fa-solid fa-caret-left" })
                    ])
                ]),
                h.button({
                    _: fsho,
                    id: `ws-${w.id}`,
                    class: "grow name",
                    title: file,
                    // onmouseenter() {
                    //     color = w.getColor();
                    //     w.setColor(0x0088ff, null, false);
                    // },
                    // onmouseleave() {
                    //     w.setColor(color, null, false);
                    // },
                    onclick() {
                        select(w, true, false);
                        color = w.getColor();
                    }
                })
            ])
        ]
    }));
}

/**
 * Select all widgets on platform.
 * Adds each widget to selection without recursing into groups.
 */
function select_all() {
    api.widgets.each(widget => {
        platform.select(widget, true, false)
    });
}

/**
 * Arrange widgets on platform using automatic layout.
 * Behavior varies by mode:
 * - FDM: 2D bin packing with support spacing. Belt mode uses linear Y layout with optional X randomization.
 * - SLA: 2D bin packing with support spacing
 * - CAM/LASER: 2D bin packing with configurable tile spacing
 *
 * Belt mode special handling:
 * - Positions widgets linearly along Y axis
 * - Adds belt lead spacing
 * - Optional X randomization for better adhesion
 * - Auto-expands bed depth if needed
 *
 * Standard mode:
 * - Uses 2D bin packing algorithm (Packer class)
 * - Grows packing area by 10% if widgets don't fit
 * - Centers packed layout on platform
 *
 * Emits 'platform.layout' event when complete.
 */
function layout() {
    const MODE = get_mode();
    const settings = current();
    const { process, device, controller } = settings;
    const { ui } = api;

    const auto = ui.autoLayout.checked,
        isBelt = device.bedBelt,
        isArrange = api.view.is_arrange(),
        layout = isArrange && auto;

    let gap = controller.spaceLayout;

    switch (MODE) {
        case MODES.SLA:
            gap = gap || (process.slaSupportLayers && process.slaSupportDensity ? 2 : 1);
            break;
        case MODES.CAM:
        case MODES.LASER:
            gap = gap || process.ctOutTileSpacing || 1;
            break;
        case MODES.FDM:
            gap = gap || ((process.sliceSupportExtra || 0) * 2) + 1;
            // auto resize device to support a larger object
            if (isBelt) {
                fit();
            }
            break;
    }

    api.view.set_arrange();
    api.view.hide_slices();
    api.space.auto_save();

    if (!isArrange) {
        // skip auto-layout when not in arrange mode
        api.event.emit('platform.layout');
        return space.update();
    }

    // do not layout when switching back from slice view
    if (!auto || (!space && !layout)) {
        api.event.emit('platform.layout');
        return space.update();
    }

    // TODO: in CNC mode with >1 widget, force layout min spacing @ largest tool diameter

    // space parts to account for anchor in belt mode
    if (isBelt) {
        gap += process.firstLayerBeltLead || 0;
        const WIDGETS = api.widgets.all();
        let bounds = update_bounds(),
            movey = -(device.bedDepth / 2);
        for (let widget of WIDGETS) {
            let ylen = widget.track.box.h;
            // only move the root widget in the group
            if (widget.id === widget.group.id) {
                widget.move(0, movey + ylen/2, 0, true);
                movey += ylen + gap;
            }
        }
        if (controller.spaceLayout === 0) {
            let sum = 0;
            let sorted = WIDGETS.sort((a, b) => a.track.pos.y - b.track.pos.y);
            sorted.forEach(w => {
                w.move(0, sum, 0);
                sum += w.track.box.d + 1 + gap;
            });
        }
        if (controller.spaceRandoX) {
            for (let w of WIDGETS) {
                w.move(
                    (0.5 - Math.random()) * (device.bedWidth - w.track.box.w - process.firstLayerBrim),
                    0, 0);
            }
        }
    } else {
        let i, m, sz = space.platform.size(),
            mp = [sz.x, sz.y],
            ms = [mp[0] / 2, mp[1] / 2],
            c = Widget.Groups.blocks().sort(),
            p = new Packer(ms[0], ms[1], gap).fit(c);

        while (!p.packed) {
            ms[0] *= 1.1;
            ms[1] *= 1.1;
            p = new Packer(ms[0], ms[1], gap).fit(c);
        }

        for (i = 0; i < c.length; i++) {
            m = c[i];
            m.fit.x += m.w / 2;
            m.fit.y += m.h / 2;
            m.move(p.max.w / 2 - m.fit.x, p.max.h / 2 - m.fit.y, 0, true);
        }
    }

    platform.update_origin();
    space.update();
    api.event.emit('platform.layout');
}

/**
 * Create widget from vertex data and add to platform.
 * Optionally saves to catalog and adds to group.
 * @param {Array} [group] - Optional group array for grouping multiple widgets
 * @param {Float32Array|Array} vertices - Vertex data (converted to Float32Array if needed)
 * @param {string} [filename] - Optional filename for metadata and catalog
 * @returns {Widget} Created widget
 */
function load_verts(group, vertices, filename) {
    const widget = newWidget(undefined, group).loadVertices(vertices.toFloat32(), true);
    widget.meta.file = filename;
    if (filename) widget.saveToCatalog(filename);
    add(widget);
    return widget;
}

/**
 * Load multiple files from File objects.
 * Supports: STL, OBJ, 3MF, SVG, PNG, JPG, KMZ, Gerber (.gbr), gcode, raw vertex data.
 * Also handles settings import (.b64, .km, .ini files).
 * Groups loading to prevent intermediate layouts.
 * Prompts user for grouping when multiple objects detected.
 * @param {Array<File>} files - Array of File objects from file input or drag/drop
 * @param {Array} [group] - Optional group array for grouping loaded widgets
 */
function load_files(files, group) {
    platform.group();
    let loading = files.length;
    for (let file of files) {
        const name = file.name,
            reader = new FileReader(),
            lower = name.toLowerCase(),
            isstl = lower.endsWith(".stl"),
            isobj = lower.endsWith(".obj"),
            is3mf = lower.endsWith(".3mf"),
            issvg = lower.endsWith(".svg"),
            ispng = lower.endsWith(".png"),
            isjpg = lower.endsWith(".jpg"),
            iskmz = lower.endsWith(".kmz"),
            isini = lower.endsWith(".ini"),
            isgbr = lower.endsWith(".gbr"),
            israw = lower.endsWith(".raw") || lower.indexOf('.') < 0,
            isset = lower.endsWith(".b64") || lower.endsWith(".km"),
            isgcode = lower.endsWith(".gcode") || lower.endsWith(".nc");
        reader.file = file;
        reader.onloadend = function(e) {
            const data = e.target.result;
            function load_dec() {
                if (--loading === 0) {
                    platform.group_done(isgcode);
                }
            }
            if (israw) {
                load_verts(group, JSON.parse(data));
                load_dec();
            } else if (api.feature.on_load && (isstl || isobj || is3mf)) {
                api.feature.on_load(data, file);
                load_dec();
            } else if (api.feature.on_add_stl && isstl) {
                api.feature.on_add_stl(data, file);
                load_dec();
            } else if (isstl) {
                const stl = new file_load.STL().parse(data, api.view.unit_scale());
                load_verts(group, stl, name);
                load_dec();
            } else if (isobj) {
                const objs = file_load.OBJ.parse(data.textDecode('utf-8'));
                const ondn = function() {
                    for (let obj of objs) {
                        load_verts(group, obj, obj.name ? `${obj.name}-${name}` : name);
                    }
                    load_dec();
                };
                if (objs.length > 1 && !group) {
                    api.uc.confirm('group objects?').then(ok => {
                        group = ok ? [] : group;
                        ondn();
                    });
                } else {
                    ondn();
                }
            } else if (isgbr) {
                let text = data.textDecode('utf-8');
                if (api.conf.get().controller.devel) {
                    api.event.emit('cam.parse.gerber', { data: text });
                } else {
                    api.client.gerber2mesh(text, progress => {
                        api.show.progress(progress, "converting");
                    }, vertices => {
                        api.show.progress(0);
                        let wid = load_verts(group, vertices, name);
                        if (api.mode.is_cam()) {
                            // attach raw illustration
                            // api.event.emit('cam.parse.gerber', { data: text, mesh: wid.mesh });
                        }
                    });
            }
            } else if (is3mf) {
                let odon = function(models) {
                    let msg = api.show.alert('Adding Objects');
                    for (let model of models) {
                        load_verts(group, model.faces, model.name ? `${model.name}-${name}` : name);
                    }
                    load_dec();
                    api.hide.alert(msg);
                }
                let msg = api.show.alert('Decoding 3MF');
                file_load.TMF.parseAsync(data).then(models => {
                    api.hide.alert(msg);
                    if (models.length > 1 && !group) {
                        api.uc.confirm(`group ${models.length} objects?`).then(ok => {
                            if (ok) {
                                group = [];
                            }
                            odon(models);
                        });
                    } else {
                        odon(models);
                    }
                });
            } else if (isgcode) {
                api.function.parse(data.textDecode('utf-8'), 'gcode');
                load_dec();
            } else if (issvg) {
                loadSVGDialog(opt => { 
                    group = group || [];
                    let svg = file_load.SVG.parse(data.textDecode('utf-8'), opt);
                    let ind = 0;
                    if (svg.length === 0) {
                        api.show.alert(`SVG contains no polylines`, 10);
                        api.show.alert(`Fonts must be converted to paths`, 10);
                    }
                    for (let v of svg) {
                        load_verts(group, svg[ind++], ind ? `${name}-${ind}` : name);
                    }
                    load_dec();
                });
            }
            else if (iskmz) api.settings.import_zip(data, true);
            else if (isset) api.settings.import(data.textDecode('utf-8'), true);
            else if (ispng) api.image.dialog(data, name);
            else if (isjpg) api.image.convert(data, name);
            else if (isini) api.settings.import_prusa(data.textDecode('utf-8'));
            else api.show.alert(`Unsupported file: ${reader.file.name}`);
        };
        reader.readAsArrayBuffer(reader.file);
    }
}

/**
 * Show dialog to configure SVG import settings.
 * Prompts for extrusion depth, arc resolution, DPI, and nesting.
 * @param {Function} doit - Callback with options: {soup, resolution, segmin, depth, dpi}
 * @private
 */
function loadSVGDialog(doit) {
    const opt = {pre: [
        "<div class='f-col a-center'>",
        "  <h3>Import SVG</h3>",
        "  <p class='t-just' style='width:300px;line-height:1.5em'>",
        "  Extrude a 3D model from a 2D SVG.",
        "  Fonts must be converted to paths in an SVG editor.",
        "  </p>",
        "  <div class='f-row t-right'><table>",
        "  <tr><th>z height in mm</th><td><input id='svg-depth' value='5' size='3'></td></tr>",
        "  <tr><th title='higher values results in more points. floating point values like 0.5 are accepted'>arc segments / mm</th><td><input id='svg-arcs' value='1' size='3'></td></tr>",
        "  <tr><th title='minimum number of segments in an arc. helps better represent small arcs'>minimum arc segments</th><td><input id='svg-marc' value='10' size='3'></td></tr>",
        "  <tr><th title='interpret dimensions as pixels using dpi'>pixel dpi (optional)</th><td><input id='svg-dpi' value='0' size='3'></td></tr>",
        "  <tr><th>nest shapes</th><td><input id='svg-nest' value='1' type='checkbox' checked></td></tr>",
        "  </table></div>",
        "</div>"
    ]};
    api.uc.confirm(undefined, {convert:true, cancel:false}, undefined, opt).then((ok) => {
        let depth = Math.max(0.1, parseFloat($('svg-depth').value));
        let arcs = Math.max(0.01, parseFloat($('svg-arcs').value));
        let marc = Math.max(1, parseInt($('svg-marc').value));
        let sdpi = Math.max(0, parseInt($('svg-dpi').value));
        let soup = $('svg-nest').checked;
        ok && doit({ soup, resolution: arcs, segmin: marc, depth, dpi: sdpi });
    });
}

/**
 * Expand platform bed depth to fit widgets (belt mode only).
 * Finds maximum Y dimension of all widgets and expands bed if needed.
 * Adds 10mm padding. Saves original bed depth.
 * @returns {boolean} True if bed was expanded
 */
function fit() {
    let maxy = 0;
    api.widgets.each(widget => {
        let wb = widget.mesh.getBoundingBox().clone();
        maxy = Math.max(maxy, wb.max.y - wb.min.y);
    });
    const { device } = current();
    if (maxy > device.bedDepth) {
        device.bedDepthSave = device.bedDepth;
        device.bedDepth = maxy + 10;
        space.platform.setSize(
            parseInt(device.bedWidth),
            parseInt(device.bedDepth),
            parseFloat(device.bedHeight),
            parseFloat(device.maxHeight)
        );
        space.platform.update();
        return true;
    }
}

// extend API (api.platform)
export const platform = {
    fit,
    add,
    changed,
    delete: platformDelete,
    layout: layout,
    group,
    group_done,
    load,
    load_stl,
    load_url,
    load_files,
    load_verts,
    deselect,
    select,
    select_all,
    selected_count,
    set_bounds,
    update_origin,
    update_bounds,
    update_size,
    update_top_z,
    update_selected,
    update: space.platform.update,
    set_font: space.platform.setFont,
    show_axes: space.platform.showAxes,
    show_volume: space.platform.showVolume,
    top_z() { return topZ },
    clear() { api.space.clear(); api.space.save(true)  }
};
