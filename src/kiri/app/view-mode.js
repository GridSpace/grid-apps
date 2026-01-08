/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { consts } from './consts.js';
import { platform } from './platform.js';
import { selection } from './selected.js';
import { settings } from './conf/manager.js';
import STACKS from './stacks.js';

const { VIEWS } = consts;
const DOC = self.document;

/** Current view mode (ARRANGE, SLICE, PREVIEW, or ANIMATE) */
let viewMode = VIEWS.ARRANGE;

/**
 * Set application view mode and update UI accordingly.
 * Modes:
 * - ARRANGE: Widget positioning and arrangement
 * - SLICE: Sliced layer visualization
 * - PREVIEW: Toolpath/gcode preview
 * - ANIMATE: Animated toolpath playback
 *
 * Each mode:
 * - Updates UI button states
 * - Clears selections and bounds
 * - Shows/hides relevant tools and sliders
 * - Configures widget visibility and rendering
 * - Emits 'view.set' event
 *
 * @param {number} mode - View mode constant from VIEWS
 */
function setViewMode(mode) {
    const isCAM = settings.mode() === 'CAM';
    viewMode = mode;
    platform.deselect();
    selection.update_info();
    // clear any bounds forced by, for example, WireEDM previews
    api.platform.set_bounds();
    // disable clear in non-arrange modes
    ['view-arrange','act-slice','act-preview','act-animate'].forEach(el => {
        $(el).classList.remove('selected')
    });
    $('render-tools').classList.add('hide');
    switch (mode) {
        case VIEWS.ARRANGE:
            $('view-arrange').classList.add('selected');
            $('render-tools').classList.remove('hide');
            api.function.clear_progress();
            api.client.clear();
            STACKS.clear();
            api.visuals.hide_slider();
            api.visuals.update_speeds();
            api.visuals.set_visible_layer();
            api.visuals.set_widget_visibility(true);
            api.view.set_edges(api.local.getBoolean('model.edges'));
            api.view.set_wireframe(api.local.getBoolean('model.wireframe'));
            // Only set opacity to 1 if wireframe is disabled
            if (!api.local.getBoolean('model.wireframe')) {
                api.widgets.setOpacity(1);
            }
            break;
        case VIEWS.SLICE:
            $('act-slice').classList.add('selected');
            api.visuals.update_speeds();
            api.visuals.update_slider_max();
            api.visuals.set_widget_visibility(true);
            !isCAM && api.view.set_edges(false);
            break;
        case VIEWS.PREVIEW:
            $('act-preview').classList.add('selected');
            api.visuals.set_widget_visibility(true);
            !isCAM && api.view.set_edges(false);
            break;
        case VIEWS.ANIMATE:
            $('act-animate').classList.add('selected');
            !isCAM && api.view.set_edges(false);
            break;
        default:
            console.log("invalid view mode: "+mode);
            return;
    }
    api.event.emit('view.set', mode);
    DOC.activeElement.blur();
}

/**
 * View mode management API.
 * Provides getters/setters and mode checking utilities.
 */
export const view = {
    /** Get current view mode */
    get() { return viewMode },
    /** Set view mode */
    set() { setViewMode(...arguments) },
    /** Switch to arrange mode */
    set_arrange() { setViewMode(VIEWS.ARRANGE) },
    /** Switch to slice mode */
    set_slice() { setViewMode(VIEWS.SLICE) },
    /** Switch to preview mode */
    set_preview() { setViewMode(VIEWS.PREVIEW) },
    /** Switch to animate mode */
    set_animate() { setViewMode(VIEWS.ANIMATE) },
    /** Check if in arrange mode */
    is_arrange() { return viewMode === VIEWS.ARRANGE },
    /** Check if in slice mode */
    is_slice() { return viewMode === VIEWS.SLICE },
    /** Check if in preview mode */
    is_preview() { return viewMode === VIEWS.PREVIEW },
    /** Check if in animate mode */
    is_animate() { return viewMode === VIEWS.ANIMATE }
};
