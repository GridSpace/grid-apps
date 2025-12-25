/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from './api.js';
import { consts } from '../core/consts.js';
import { settings } from './conf/manager.js';
import { space as SPACE } from '../../moto/space.js';
import STACKS from './stacks.js';

const { COLOR, VIEWS } = consts;

// Note: viewMode is imported dynamically via api.view.get()
function bound(v,min,max) {
    return Math.max(min,Math.min(max,v));
}

function unitScale() {
    return api.mode.is_cam() && settings.ctrl().units === 'in' ? 25.4 : 1;
}

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

function updateSlider() {
    const { lo, hi, max } = api.slider.getRange();
    if (max > 0) {
        api.slider.updatePosition(lo / max, hi / max);
    }
    api.conf.update_fields_from_range();
}

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

function setWireframe(bool, color, opacity) {
    api.widgets.each(function(w) { w.setWireframe(bool, color, opacity) });
    SPACE.update();
}

function setEdges(bool) {
    if (bool && bool.toggle) {
        api.local.toggle('model.edges');
    } else {
        api.local.set('model.edges', bool);
    }
    bool = api.local.getBoolean('model.edges');
    api.widgets.each(w => w.setEdges(bool));
    SPACE.update();
}

function updateSliderMax(set) {
    let max = STACKS.getRange().tallest - 1;
    api.slider.setMax(max);
    const { hi } = api.slider.getRange();
    if (set || max < hi) {
        api.slider.setRange(max, max);
        api.slider.showLabels();
    }
}

function hideSlices() {
    STACKS.clear();
    api.widgets.setOpacity(COLOR.model_opacity);
    api.widgets.each(function(widget) {
        widget.setWireframe(false);
    });
}

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
 * hide or show slice-layers and their sub-elements
 *
 * @param {number} [layer]
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

    SPACE.update();
}

function showSlider() {
    api.slider.show();
}

function hideSlider() {
    api.slider.hide();
    api.ui.speeds.style.display = 'none';
}

function updateStackLabelState() {
    const settings = api.conf.get();
    // match label checkboxes to preference
    for (let label of api.stacks.getLabels()) {
        let check = `${settings.mode}-${api.view.get()}-${label}`;
        api.stacks.setVisible(label, settings.labels[check] !== false);
    }
}

export const visuals = {
    wireframe: setWireframe,
    edges: setEdges,
    unit_scale: unitScale,
    update_speeds: updateSpeeds,
    update_slider: updateSlider,
    update_slider_max: updateSliderMax,
    update_stack_labels: updateStackLabelState,
    show_slices: showSlices,
    hide_slices: hideSlices,
    show_slider: showSlider,
    hide_slider: hideSlider,
    set_visible_layer: setVisibleLayer,
    set_widget_visibility: setWidgetVisibility
};
