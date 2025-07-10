
import { api } from '../../core/api.js';
import { originReset, originSelect } from './cl-origin.js';

let LANG = api.language.current;
let { CAM } = api.const.MODES,
    { $ } = api.web,
    { uc, ui } = api,
    { bound, toInt, toFloat } = uc,
    { newBlank, newButton, newBoolean, newGroup, newInput } = uc,
    { newSelect, newLabel, newValue, newRow, newGCode, newDiv } = uc,
    driven = true,
    separator = true,
    trigger = true,
    units = true
    ;

function onBooleanClick(el) {
    api.event.emit('click.boolean', el);
}

function onButtonClick(el) {
    api.event.emit('click.button', el);
}

function zAnchorSave() {
    api.conf.update();
    api.platform.update_top_z();
}

export function menu() {
    return {

    _____:               newGroup(LANG.ct_menu, $('cam-tabs'), { modes:CAM, marker:true, driven, separator }),
    camTabsWidth:        newInput(LANG.ct_wdth_s, {title:LANG.ct_wdth_l, convert:toFloat, bound:bound(0.005,100), units}),
    camTabsHeight:       newInput(LANG.ct_hght_s, {title:LANG.ct_hght_l, convert:toFloat, bound:bound(0.005,100), units}),
    camTabsDepth:        newInput(LANG.ct_dpth_s, {title:LANG.ct_dpth_l, convert:toFloat, bound:bound(0.005,100), units}),
    separator:           newBlank({ class:"set-sep", driven }),
    camTabsMidline:      newBoolean(LANG.ct_midl_s, onBooleanClick, {title:LANG.ct_midl_l}),
    separator:           newBlank({ class:"set-sep", driven }),
    camTabsManual: newRow([
        (ui.tabAdd = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
        (ui.tabDun = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
        (ui.tabClr = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
    ], {class:"ext-buttons f-row"}),
    _____:               newGroup(LANG.cs_menu, $('cam-stock'), { modes:CAM, driven, separator }),
    camStockX:           newInput(LANG.cs_wdth_s, {title:LANG.cs_wdth_l, convert:toFloat, bound:bound(0,9999), units}),
    camStockY:           newInput(LANG.cs_dpth_s, {title:LANG.cs_dpth_l, convert:toFloat, bound:bound(0,9999), units}),
    camStockZ:           newInput(LANG.cs_hght_s, {title:LANG.cs_hght_l, convert:toFloat, bound:bound(0,9999), units}),
    separator:           newBlank({ class:"set-sep", driven }),
    camStockOffset:      newBoolean(LANG.cs_offs_s, onBooleanClick, {title:LANG.cs_offs_l}),
    camStockClipTo:      newBoolean(LANG.cs_clip_s, onBooleanClick, {title:LANG.cs_clip_l}),
    camStockIndexed:     newBoolean(LANG.cs_indx_s, onBooleanClick, {title:LANG.cs_indx_l}),
    camStockIndexGrid:   newBoolean(LANG.cs_ishg_s, onBooleanClick, {title:LANG.cs_ishg_l, show:() => ui.camStockIndexed.checked}),
    _____:               newGroup(LANG.cc_menu, $('cam-limits'), { modes:CAM, driven, separator }),
    camZAnchor:          newSelect(LANG.ou_zanc_s, {title: LANG.ou_zanc_l, action:zAnchorSave, show:() => !ui.camStockIndexed.checked}, "zanchor"),
    camZOffset:          newInput(LANG.ou_ztof_s, {title:LANG.ou_ztof_l, convert:toFloat, units}),
    camZTop:             newInput(LANG.ou_ztop_s, {title:LANG.ou_ztop_l, convert:toFloat, units, trigger}),
    camZBottom:          newInput(LANG.ou_zbot_s, {title:LANG.ou_zbot_l, convert:toFloat, units, trigger}),
    camZThru:            newInput(LANG.ou_ztru_s, {title:LANG.ou_ztru_l, convert:toFloat, bound:bound(0.0,100), units }),
    camZClearance:       newInput(LANG.ou_zclr_s, {title:LANG.ou_zclr_l, convert:toFloat, bound:bound(0.01,100), units }),
    camFastFeedZ:        newInput(LANG.cc_rzpd_s, {title:LANG.cc_rzpd_l, convert:toFloat, units}),
    camFastFeed:         newInput(LANG.cc_rapd_s, {title:LANG.cc_rapd_l, convert:toFloat, units}),
    _____:               newGroup(LANG.ou_menu, $('cam-output'), { modes:CAM, driven, separator, group:"cam-output" }),
    camConventional:     newBoolean(LANG.ou_conv_s, onBooleanClick, {title:LANG.ou_conv_l}),
    camEaseDown:         newBoolean(LANG.cr_ease_s, onBooleanClick, {title:LANG.cr_ease_l}),
    camDepthFirst:       newBoolean(LANG.ou_depf_s, onBooleanClick, {title:LANG.ou_depf_l}),
    camToolInit:         newBoolean(LANG.ou_toin_s, onBooleanClick, {title:LANG.ou_toin_l}),
    separator:           newBlank({ class:"set-sep", driven }),
    camFirstZMax:        newBoolean(LANG.ou_z1st_s, onBooleanClick, {title:LANG.ou_z1st_l}),
    camForceZMax:        newBoolean(LANG.ou_forz_s, onBooleanClick, {title:LANG.ou_forz_l}),
    separator:           newBlank({ class:"set-sep", driven }),
    camEaseAngle:        newInput(LANG.ou_eang_s, {title:LANG.ou_eang_l, convert:toFloat, bound:bound(0.1,85), show:() => ui.camEaseDown.checked}),
    camFullEngage:       newInput(LANG.ou_feng_s, {title:LANG.ou_feng_l, convert:toFloat, bound:bound(0.1,1.0)}),
    _____:               newGroup(LANG.co_menu, $('cam-origin'), { modes:CAM, driven, separator }),
    camOriginTop:        newBoolean(LANG.or_topp_s, onBooleanClick, {title:LANG.or_topp_l}),
    camOriginCenter:     newBoolean(LANG.or_cntr_s, onBooleanClick, {title:LANG.or_cntr_l}),
    separator:           newBlank({ class:"set-sep", driven }),
    camOriginOffX:       newInput(LANG.co_offx_s, {title:LANG.co_offx_l, convert:toFloat, units}),
    camOriginOffY:       newInput(LANG.co_offy_s, {title:LANG.co_offy_l, convert:toFloat, units}),
    camOriginOffZ:       newInput(LANG.co_offz_s, {title:LANG.co_offz_l, convert:toFloat, units}),
    separator:           newBlank({ class:"set-sep", driven }),
    camOriginSelect:     newRow([
        newButton("select", originSelect),
        newButton("reset", originReset),
    ], { class: "ext-buttons f-row" }),
    _____:               newGroup(LANG.op_xprt_s, $('cam-expert'), { group:"cam_expert", modes:CAM, marker: false, driven, separator }),
    camExpertFast:       newBoolean(LANG.cx_fast_s, onBooleanClick, {title:LANG.cx_fast_l, show: () => !ui.camTrueShadow.checked }),
    camTrueShadow:       newBoolean(LANG.cx_true_s, onBooleanClick, {title:LANG.cx_true_l, show: () => !ui.camExpertFast.checked }),
    separator:           newBlank({ class:"set-sep", driven }),
    camArcTolerance:     newInput(LANG.cx_arct_s, {title:LANG.cx_arct_l, convert:toFloat, units, bound:bound(0,100)}),
    camArcResolution:    newInput(LANG.cx_arcr_s, {title:LANG.cx_arcr_l, convert:toFloat, bound:bound(0,180), show:() => ui.camArcTolerance.value > 0}),

    };
};
