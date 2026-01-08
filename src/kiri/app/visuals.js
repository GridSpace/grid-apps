/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { base } from '../../geo/base.js';
import { consts } from '../core/consts.js';
import { colorSchemeRegistry } from './color/schemes.js';
import { settings } from './conf/manager.js';
import { space } from '../../moto/space.js';

import STACKS from './stacks.js';

const { VIEWS } = consts;

/**
 * Get current color scheme
 */
function getColorScheme() {
    const mode = api.mode.get_id();
    const theme = api.space.is_dark() ? 'dark' : 'light';
    return colorSchemeRegistry.getScheme(mode, theme);
}

/**
 * Constrain value to min/max bounds.
 * @param {number} v - Value to constrain
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Constrained value
 */
function bound(v,min,max) {
    return Math.max(min,Math.min(max,v));
}

/**
 * Get unit scale factor for coordinate conversion.
 * Returns 25.4 for CAM mode with inches, 1.0 otherwise (mm).
 * @returns {number} Unit scale factor
 */
function unitScale() {
    return api.mode.is_cam() && settings.ctrl().units === 'in' ? 25.4 : 1;
}

/**
 * Update speed color legend for preview mode.
 * Shows color-coded speed visualization in preview mode for FDM.
 * Generates 20 color swatches from worker and displays in UI.
 * Only visible in PREVIEW mode for FDM (not SLA/LASER) when enabled.
 * Emits 'preview.speeds' event with min/max speeds.
 * @param {number} [maxSpeed] - Maximum speed value
 * @param {number} [minSpeed] - Minimum speed value
 */
function updateSpeeds(maxSpeed, minSpeed) {
    const { ui } = api;
    const viewMode = api.view.get();
    ui.speeds.style.display =
        maxSpeed &&
        settings.mode !== 'SLA' &&
        settings.mode !== 'LASER' &&
        viewMode === VIEWS.PREVIEW &&
        ui.showSpeeds.checked ? 'block' : '';
    if (maxSpeed) {
        const colors = [];
        for (let i = 0; i <= maxSpeed; i += maxSpeed / 20) {
            colors.push(Math.round(Math.max(i, 1)));
        }
        api.client.colors(colors, maxSpeed, speedColors => {
            const list = [];
            Object.keys(speedColors).map(v => parseInt(v)).sort((a, b) => b - a).forEach(speed => {
                const color = speedColors[speed];
                const hex = color.toString(16).padStart(6, 0);
                const r = (color >> 16) & 0xff;
                const g = (color >> 8) & 0xff;
                const b = (color >> 0) & 0xff;
                const style = `background-color:#${hex}`;
                list.push(`<label style="${style}">${speed}</label>`);
            });
            ui.speedbar.innerHTML = list.join('');
        });
        api.event.emit('preview.speeds', {
            min: minSpeed,
            max: maxSpeed
        });
    }
}

/**
 * Update slider visual position and sync settings.
 * Updates slider thumb positions based on current range.
 * Synchronizes configuration fields from range values.
 */
function updateSlider() {
    const { lo, hi, max } = api.slider.getRange();
    if (max > 0) {
        api.slider.updatePosition(lo / max, hi / max);
    }
    api.conf.update_fields_from_range();
}

/**
 * Set visible layer range and update visualization.
 * Bounds values to valid range and updates slider.
 * Triggers slice visualization update.
 * @param {number} [h] - High layer (defaults to current hi)
 * @param {number} [l] - Low layer (defaults to current lo)
 */
function setVisibleLayer(h, l) {
    const { lo, hi, max } = api.slider.getRange();
    h = h >= 0 ? h : hi;
    l = l >= 0 ? l : lo;
    const newHi = bound(h, 0, max);
    const newLo = bound(l, 0, newHi);
    api.slider.setRange(newLo, newHi); // Notify callbacks (STACKS, scene updates)
    api.slider.showLabels();
    showSlices();
}

/**
 * Set wireframe rendering mode for all widgets.
 * Updates 3D scene after applying to all widgets.
 * Persists state to local storage.
 * @param {boolean|object} bool - Enable/disable wireframe, or {toggle: true} to toggle
 * @param {number} [color] - Optional wireframe color
 * @param {number} [opacity] - Optional wireframe opacity
 */
function setWireframe(bool, color, opacity) {
    if (bool && bool.toggle) {
        api.local.toggle('model.wireframe');
    } else if (typeof bool === 'boolean') {
        api.local.set('model.wireframe', bool);
        // Persist color and opacity when explicitly setting wireframe
        if (color !== undefined) {
            api.local.set('model.wireframe.color', color);
        }
        if (opacity !== undefined) {
            api.local.set('model.wireframe.opacity', opacity);
        }
    }
    bool = api.local.getBoolean('model.wireframe');
    // Retrieve saved color/opacity if not provided
    if (color === undefined) {
        color = api.local.getInt('model.wireframe.color') || 0;
    }
    if (opacity === undefined) {
        const saved = api.local.getFloat('model.wireframe.opacity');
        opacity = saved !== null ? saved : (api.space.is_dark() ? 0.25 : 0.5);
    }
    api.widgets.each((w) => { w.setWireframe(bool, color, opacity) });
    space.update();
}

/**
 * Toggle or set edge rendering for all widgets.
 * If bool.toggle is truthy, toggles the current state.
 * Otherwise sets edge visibility to bool value.
 * Persists state to local storage and updates scene.
 * @param {boolean|object} bool - Enable/disable edges, or {toggle: true} to toggle
 */
function setEdges(bool) {
    if (bool && bool.toggle) {
        api.local.toggle('model.edges');
    } else {
        api.local.set('model.edges', bool);
    }
    bool = api.local.getBoolean('model.edges');
    api.widgets.each(w => w.setEdges(bool));
    space.update();
}

/**
 * Update slider maximum from stack height.
 * Sets slider max to tallest stack layer - 1.
 * If set=true or current hi exceeds new max, resets range to show top layer.
 * @param {boolean} [set] - Force reset range to max
 */
function updateSliderMax(set) {
    let max = STACKS.getRange().tallest - 1;
    api.slider.setMax(max);
    const { hi } = api.slider.getRange();
    if (set || max < hi) {
        api.slider.setRange(0, max);
        api.slider.showLabels();
    }
}

/**
 * Hide slice visualization and restore widget rendering.
 * Clears stack display, restores saved wireframe/opacity state.
 */
function hideSlices() {
    STACKS.clear();
    // Restore saved wireframe state instead of forcing wireframe off
    const wireframe = api.local.getBoolean('model.wireframe');
    const color = api.local.getInt('model.wireframe.color') || 0;
    const saved = api.local.getFloat('model.wireframe.opacity');
    const scheme = getColorScheme();
    const opacity = saved !== null ? saved : (scheme.views.ARRANGE?.model_opacity ?? 1.0);

    if (wireframe) {
        api.widgets.each(widget => widget.setWireframe(wireframe, color, opacity));
    } else {
        api.widgets.setOpacity(opacity);
        api.widgets.each(widget => widget.setWireframe(false));
    }
}

/**
 * Show or hide all widgets in 3D scene.
 * @param {boolean} bool - True to show, false to hide
 */
function setWidgetVisibility(bool) {
    api.widgets.each(w => {
        if (bool) {
            w.show();
        } else {
            w.hide();
        }
    });
}

/**
 * Show slice layer visualization.
 * Only works in SLICE/PREVIEW/ANIMATE views (not ARRANGE).
 * Updates slider range to show specified layer(s).
 * If no layer specified, shows current hi layer.
 * Expands range downward if needed (newLo = min(layer, lo)).
 * Updates slider position and triggers stack visualization.
 * @param {number|string} [layer] - Layer to show (defaults to current hi)
 */
function showSlices(layer) {
    const viewMode = api.view.get();
    if (viewMode === VIEWS.ARRANGE) {
        return;
    }

    showSlider();

    const { lo, hi, max } = api.slider.getRange();

    if (typeof(layer) === 'string' || typeof(layer) === 'number') {
        layer = parseInt(layer);
    } else {
        layer = hi;
    }

    layer = bound(layer, 0, max);
    const newLo = layer < lo ? layer : lo;
    api.slider.setRange(newLo, layer);
    api.slider.showLabels();

    updateSlider();
    // STACKS.setRange is called by slider callback

    space.update();
}

/**
 * Show layer slider UI element.
 */
function showSlider() {
    api.slider.show();
}

/**
 * Hide layer slider and speed legend UI elements.
 */
function hideSlider() {
    api.slider.hide();
    api.ui.speeds.style.display = 'none';
}

/**
 * Synchronize stack label visibility with saved preferences.
 * Reads visibility state from settings.labels for current mode/view combination.
 * Applies visibility to all stack labels.
 */
function updateStackLabelState() {
    const settings = api.conf.get();
    // match label checkboxes to preference
    for (let label of api.stacks.getLabels()) {
        let check = `${settings.mode}-${api.view.get()}-${label}`;
        api.stacks.setVisible(label, settings.labels[check] !== false);
    }
}

/**
 * Apply saved visual state to a widget.
 * Restores edges and wireframe settings from local storage.
 * Only applies in ARRANGE view mode.
 * @param {Widget} widget - Widget to apply visual state to
 */
function applyVisualState(widget) {
    const viewMode = api.view.get();
    // Only apply visual state in ARRANGE mode
    if (viewMode !== VIEWS.ARRANGE) {
        return;
    }
    const edges = api.local.getBoolean('model.edges');
    const wireframe = api.local.getBoolean('model.wireframe');

    // Always apply edges setting
    if (edges) {
        widget.setEdges(edges);
    }

    // Apply wireframe and its associated opacity
    const color = api.local.getInt('model.wireframe.color') || 0;
    const saved = api.local.getFloat('model.wireframe.opacity');
    const opacity = saved !== null ? saved : 1;

    if (wireframe) {
        widget.setWireframe(wireframe, color, opacity);
    } else if (saved !== null) {
        // Even if wireframe is off, restore the saved opacity
        widget.setOpacity(opacity);
    }
}

/**
 * Update progress bar display.
 * In debug mode, also shows progress status message.
 * @param {number} [value=0] - Progress value (0.0 to 1.0)
 * @param {string} [msg] - Optional status message to display
 */
function setProgress(value = 0, msg) {
    value = (value * 100).round(4);
    api.ui.progress.width = value+'%';
    if (self.debug) {
        // console.log(msg, value.round(2));
        api.ui.prostatus.style.display = 'flex';
        if (msg) {
            api.ui.prostatus.innerHTML = msg;
        } else {
            api.ui.prostatus.innerHTML = '';
        }
    }
}

let statsTimer;
let statsAdd;

function updateStats(add) {
    statsAdd = add ? { ...add, 'hr': 1 } : {};
    clearTimeout(statsTimer);
    let { div, fps, rms, rnfo } = api.ui.stats;
    if (api.devel.enabled === false) {
        fps.innerText = '';
        rms.innerText = '';
        rnfo.innerHTML = '';
        return;
    }
    div.style.display = 'flex';
    statsTimer = setInterval(() => {
        const nrms = space.view.getRMS().toFixed(1);
        const nfps = space.view.getFPS().toFixed(1);
        const rend = space.renderInfo();
        const { memory, render } = rend;
        if (nfps !== fps.innerText) {
            fps.innerText = nfps;
        }
        if (nrms !== rms.innerText) {
            rms.innerText = nrms;
        }
        if (rnfo.offsetParent !== null) {
            rnfo.innerHTML = Object.entries({
                ...statsAdd,
                ...memory,
                ...render,
                render_ms: nrms,
                frames_sec: nfps
            }).map(row => {
                return row[0] === 'hr' ?
                    '<hr><hr>' :
                    `<div>${row[0]}</div><label>${base.util.comma(row[1])}</label>` ;
            }).join('');
        }
    }, 100);
}

export const visuals = {
    apply_visual_state: applyVisualState,
    hide_slices: hideSlices,
    hide_slider: hideSlider,
    set_edges: setEdges,
    set_progress: setProgress,
    set_visible_layer: setVisibleLayer,
    set_widget_visibility: setWidgetVisibility,
    set_wireframe: setWireframe,
    show_slices: showSlices,
    show_slider: showSlider,
    unit_scale: unitScale,
    update_slider_max: updateSliderMax,
    update_slider: updateSlider,
    update_speeds: updateSpeeds,
    update_stack_labels: updateStackLabelState,
    update_stats: updateStats
};
