/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { $ } from '../../moto/webui.js';
import { api } from './api.js';
import { consts } from '../core/consts.js';
import { platform } from './platform.js';
import { selection } from './select.js';
import { settings } from './config/manager.js';
import STACKS from './stacks.js';

const { VIEWS } = consts;
const DOC = self.document;

let viewMode = VIEWS.ARRANGE;

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
            api.widgets.setOpacity(1);
            api.view.edges(api.local.getBoolean('model.edges'));
            break;
        case VIEWS.SLICE:
            $('act-slice').classList.add('selected');
            api.visuals.update_speeds();
            api.visuals.update_slider_max();
            api.visuals.set_widget_visibility(true);
            !isCAM && api.view.edges(false);
            break;
        case VIEWS.PREVIEW:
            $('act-preview').classList.add('selected');
            api.visuals.set_widget_visibility(true);
            !isCAM && api.view.edges(false);
            break;
        case VIEWS.ANIMATE:
            $('act-animate').classList.add('selected');
            !isCAM && api.view.edges(false);
            break;
        default:
            console.log("invalid view mode: "+mode);
            return;
    }
    api.event.emit('view.set', mode);
    DOC.activeElement.blur();
}

export const view = {
    get() { return viewMode },
    set() { setViewMode(...arguments) },
    set_arrange() { setViewMode(VIEWS.ARRANGE) },
    set_slice() { setViewMode(VIEWS.SLICE) },
    set_preview() { setViewMode(VIEWS.PREVIEW) },
    set_animate() { setViewMode(VIEWS.ANIMATE) },
    is_arrange() { return viewMode === VIEWS.ARRANGE },
    is_slice() { return viewMode === VIEWS.SLICE },
    is_preview() { return viewMode === VIEWS.PREVIEW },
    is_animate() { return viewMode === VIEWS.ANIMATE }
};
