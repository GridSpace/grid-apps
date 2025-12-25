/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../ui/api.js';

let LANG = api.language.current;
let { LASER, DRAG, WJET, WEDM } = api.const.MODES,
    TWOD    = [ LASER, DRAG, WJET, WEDM ],
    TWONED  = [ LASER, DRAG, WJET ],
    { $ } = api.web,
    { uc, ui } = api,
    { bound, toInt, toFloat } = uc,
    { newBlank, newButton, newBoolean, newGroup, newInput, newRow } = uc,
    driven = true,
    separator = true,
    trigger = true
    ;

function onBooleanClick(el) {
    api.event.emit('click.boolean', el);
}

function onButtonClick(el) {
    api.event.emit('click.button', el);
}

export function menu() {

    return {

    /** Left Side Menu */

    _____:               newGroup(LANG.sl_menu, $('lzr-slice'), { modes:TWOD, driven, separator }),
    ctSliceKerf:         newInput(LANG.ls_offs_s, {title:LANG.ls_offs_l, convert:toFloat}),
    ctSliceHeight:       newInput(LANG.ls_lahi_s, {title:LANG.ls_lahi_l, convert:toFloat, trigger}),
    ctSliceHeightMin:    newInput(LANG.ls_lahm_s, {title:LANG.ls_lahm_l, convert:toFloat, show:() => ui.ctSliceHeight.value == 0 && !ui.ctSliceSingle.checked }),
    separator:           newBlank({ class:"set-sep", driven }),
    ctSliceSingle:       newBoolean(LANG.ls_sngl_s, onBooleanClick, {title:LANG.ls_sngl_l}),
    ctOmitInner:         newBoolean(LANG.we_omit_s, onBooleanClick, {title:LANG.we_omit_l}),
    _____:               newGroup('surfaces', $('lzr-surface'), { modes:[-1], driven, separator }),
    ctSurfaces: newRow([
        (ui.faceAdd = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
        (ui.faceDun = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
        (ui.faceClr = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
    ], {class:"ext-buttons f-row", modes:WEDM}),
    _____:               newGroup(LANG.dk_menu, $('lzr-knife'), { modes:DRAG, marker:true, driven, separator }),
    ctOutKnifeDepth:     newInput(LANG.dk_dpth_s, { title:LANG.dk_dpth_l, convert:toFloat, bound:bound(0.0,5.0) }),
    ctOutKnifePasses:    newInput(LANG.dk_pass_s, { title:LANG.dk_pass_l, convert:toInt,   bound:bound(0,5) }),
    ctOutKnifeTip:       newInput(LANG.dk_offs_s, { title:LANG.dk_offs_l, convert:toFloat, bound:bound(0.0,10.0) }),
    _____:               newGroup(LANG.lo_menu, $('lzr-layout'), { modes:TWOD, driven, separator }),
    ctOutTileSpacing:    newInput(LANG.ou_spac_s, { title:LANG.ou_spac_l, convert:toInt }),
    ctOutMerged:         newBoolean(LANG.ou_mrgd_s, onBooleanClick, {title:LANG.ou_mrgd_l, modes:TWONED, show:() => !ui.ctOutStack.checked }),
    ctOutGroup:          newBoolean(LANG.ou_grpd_s, onBooleanClick, {title:LANG.ou_grpd_l, show:() => !(ui.ctOutMark.checked || ui.ctOutStack.checked) }),
    _____:               newGroup(LANG.ou_menu, $('lzr-output'), { modes:TWOD, driven, separator, group:"lzr-output" }),
    ctOutPower:          newInput(LANG.ou_powr_s, {title:LANG.ou_powr_l, convert:toInt, bound:bound(1,100), modes:TWONED }),
    ctOutSpeed:          newInput(LANG.ou_sped_s, {title:LANG.ou_sped_l, convert:toInt }),
    ctAdaptive:          newBoolean('adaptive speed', onBooleanClick, {modes:WEDM, title:'controller determines best cutting speed based on material feedback at runtime'}),
    separator:           newBlank({ class:"set-sep", driven }),
    ctOriginBounds:      newBoolean(LANG.or_bnds_s, onBooleanClick, { title:LANG.or_bnds_l, show:() => !ui.ctOriginCenter.checked }),
    ctOriginCenter:      newBoolean(LANG.or_cntr_s, onBooleanClick, { title:LANG.or_cntr_l, show:() => !ui.ctOriginBounds.checked }),
    separator:           newBlank({ class:"set-sep", driven, modes:WEDM, show:() => ui.ctOriginBounds.checked }),
    ctOriginOffX:        newInput(LANG.or_offx_s, { title:LANG.or_offx_l, convert:toFloat, modes:WEDM, show:() => ui.ctOriginBounds.checked }),
    ctOriginOffY:        newInput(LANG.or_offy_s, { title:LANG.or_offy_l, convert:toFloat, modes:WEDM, show:() => ui.ctOriginBounds.checked }),
    separator:           newBlank({ class:"set-sep", driven, modes:TWONED }),
    ctOutZColor:         newBoolean(LANG.ou_layo_s, onBooleanClick, { title:LANG.ou_layo_l, modes:TWONED, show:() => !ui.ctOutMerged.checked }),
    ctOutLayer:          newBoolean(LANG.ou_layr_s, onBooleanClick, { title:LANG.ou_layr_l, modes:TWONED, show:() => !ui.ctOutStack.checked }),
    ctOutMark:           newBoolean(LANG.ou_lays_s, onBooleanClick, { title:LANG.ou_lays_l, modes:TWONED, show:() => !ui.ctOutStack.checked }),
    separator:           newBlank({ class:"set-sep", driven, modes:LASER }),
    ctOutInches:         newBoolean(LANG.ou_inch_s, onBooleanClick, { title:LANG.ou_inch_l, modes:LASER }),
    ctOutStack:          newBoolean(LANG.ou_stak_s, onBooleanClick, { title:LANG.ou_stak_l, modes:LASER }),
    ctOutShaper:         newBoolean(LANG.ou_shap_s, onBooleanClick, { title:LANG.ou_shap_l, modes:LASER, show:() => ui.ctOutStack.checked }),
    separator:           newBlank({ class:"set-sep", driven, modes:LASER, show: () => ui.ctOutStack.checked }),
    ctOutClean:          newBoolean('clean', onBooleanClick, { title:'clean', modes:LASER, show:() => ui.ctOutStack.checked }),
    ctOutFilter:         newInput('filter', { title:'filter', modes:LASER, convert:toFloat, show:() => ui.ctOutStack.checked }),
    ctOutSmooth:         newInput('smooth', { title:'smooth', modes:LASER, convert:toFloat, show:() => ui.ctOutStack.checked }),

    };

}
