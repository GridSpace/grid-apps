/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { api } from '../../app/api.js';

let LANG = api.language.current;
let { FDM } = api.const.MODES,
    { $ } = api.web,
    { uc, ui } = api,
    { bound, toInt, toFloat } = uc,
    { newBlank, newButton, newBoolean, newGroup, newInput, newSelect, newRow } = uc,
    driven = true,
    hideable = true,
    separator = true,
    trigger = true
    ;

function onBooleanClick(el) {
    api.event.emit('click.boolean', el);
}

function onButtonClick(el) {
    api.event.emit('click.button', el);
}

function thinWallSave() {
    let opt = ui.sliceDetectThin;
    let level = opt.options[opt.selectedIndex];
    if (level) {
        api.conf.get().process.sliceDetectThin = level.value;
        api.conf.save();
    }
}

function isMultiHead() {
    let dev = api.conf.get().device;
    return isNotBelt() && dev.extruders && dev.extruders.length > 1;
}

function optSelected(sel) {
    let opt = sel.options[sel.selectedIndex];
    return opt ? opt.value : undefined;
}

function manualSupport() {
    return api.conf.proc().sliceSupportType === 'manual';
}

function hasInfill() {
    return optSelected(ui.sliceFillType) !== 'none'
}

function fillIsLinear() {
    return hasInfill() && optSelected(ui.sliceFillType) === 'linear';
}

function zIntShow() {
    return api.conf.get().controller.devel;
}

function isBelt() {
    return api.device.isBelt();
}

function isNotBelt() {
    return !isBelt();
}

function isTree() {
    return api.conf.proc().sliceSupportTree;
}

function notFwRetract() {
    return !api.conf.get().device.fwRetract;
}

export function menu() {

    return {

    /** Left Side Menu */

    _____:               newGroup(LANG.sl_menu, $('fdm-layers'), { modes:FDM, driven, hideable, separator, group:"fdm-layers" }),
    sliceHeight:         newInput(LANG.sl_lahi_s, { title:LANG.sl_lahi_l, convert:toFloat }),
    sliceMinHeight:      newInput(LANG.ad_minl_s, { title:LANG.ad_minl_l, convert:toFloat, bound:bound(0,3.0), show:() => ui.sliceAdaptive.checked }),
    sliceTopLayers:      newInput(LANG.sl_ltop_s, { title:LANG.sl_ltop_l, convert:toInt }),
    sliceBottomLayers:   newInput(LANG.sl_lbot_s, { title:LANG.sl_lbot_l, convert:toInt }),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceAdaptive:       newBoolean(LANG.ad_adap_s, onBooleanClick, { title: LANG.ad_adap_l }),
    outputLayerRetract:  newBoolean(LANG.ad_lret_s, onBooleanClick, {title:LANG.ad_lret_l}),
    sliceLayerStart:     newSelect(LANG.sl_strt_s, {title:LANG.sl_strt_l}, "start"),
    _____:               newGroup(LANG.sw_menu, $('fdm-walls'), { modes:FDM, driven, hideable, separator, group:"fdm-walls" }),
    sliceShells:         newInput(LANG.sl_shel_s, { title:LANG.sl_shel_l, convert:toFloat }),
    sliceLineWidth:      newInput(LANG.sl_line_s, { title:LANG.sl_line_l, convert:toFloat, bound:bound(0,5) }),
    sliceFillOverlap:    newInput(LANG.fi_over_s, {title:LANG.fi_over_l, convert:toFloat, bound:bound(0.0,1.0)}),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceShellOrder:     newSelect(LANG.sl_ordr_s, { title:LANG.sl_ordr_l}, "shell"),
    sliceDetectThin:     newSelect(LANG.ad_thin_s, { title: LANG.ad_thin_l, action: thinWallSave }, "thin"),
    outputAlternating:   newBoolean(LANG.ad_altr_s, onBooleanClick, {title:LANG.ad_altr_l}),
    sliceZInterleave:    newBoolean(LANG.ad_zint_s, onBooleanClick, {title:LANG.ad_zint_l, show:() => zIntShow() }),
    _____:               newGroup(LANG.fs_menu, $('fdm-solid'), { modes:FDM, driven, hideable, separator, group:"fdm-solid" }),
    sliceFillAngle:      newInput(LANG.fi_angl_s, {title:LANG.fi_angl_l, convert:toFloat}),
    sliceFillGrow:       newInput(LANG.fi_grow_s, {title:LANG.fi_grow_l, convert:toFloat}),
    sliceSolidMinArea:   newInput(LANG.ad_msol_s, {title:LANG.ad_msol_l, convert:toFloat}),
    _____:               newGroup(LANG.fi_menu, $('fdm-fill'), { modes:FDM, driven, hideable, separator, group:"fdm-fill" }),
    sliceFillType:       newSelect(LANG.fi_type, {trigger}, "infill"),
    sliceFillSparse:     newInput(LANG.fi_pcnt_s, {title:LANG.fi_pcnt_l, convert:toFloat, bound:bound(0.0,1.0), show:hasInfill}),
    sliceFillRepeat:     newInput(LANG.fi_rept_s, {title:LANG.fi_rept_l, convert:toInt,   bound:bound(1,10),    show:fillIsLinear}),
    _____:               newGroup(LANG.fh_menu, $('fdm-heat'), { modes:FDM, driven, hideable, separator, group:"fdm-heat" }),
    outputTemp:          newInput(LANG.ou_nozl_s, {title:LANG.ou_nozl_l, convert:toInt}),
    outputBedTemp:       newInput(LANG.ou_bedd_s, {title:LANG.ou_bedd_l, convert:toInt}),
    separator:           newBlank({ class:"set-sep", driven }),
    outputDraftShield:   newBoolean(LANG.fr_draf_s, onBooleanClick, {title:LANG.fr_draf_l, trigger, show:() => isNotBelt()}),
    _____:               newGroup(LANG.fc_menu, $('fdm-cool'), { modes:FDM, driven, hideable, separator, group:"fdm-cool" }),
    outputFanLayer:      newInput(LANG.ou_fanl_s, { title:LANG.ou_fanl_l, convert:toInt,   bound:bound(0,255) }),
    outputFanSpeed:      newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:toInt, bound:bound(0,255)}),
    outputMinLayerTime:  newInput(LANG.ou_layt_s, { title:LANG.ou_layt_l, convert:toInt,   bound:bound(0,200) }),
    _____:               newGroup(LANG.sp_menu, $('fdm-support'), { modes:FDM, driven, hideable, separator, group:"fdm-supp" }),
    sliceSupportType:    newSelect(LANG.sp_type_s, {title:LANG.sp_type_l, trigger}, "support"),
    sliceSupportNozzle:  newSelect(LANG.sp_nozl_s, {title:LANG.sp_nozl_l, show:isMultiHead}, "extruders"),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceSupportAngle:   newInput(LANG.sp_angl_s, {title:LANG.sp_angl_l, convert:toFloat, bound:bound(0.0,90.0)}),
    sliceSupportDensity: newInput(LANG.sp_dens_s, {title:LANG.sp_dens_l, convert:toFloat, bound:bound(0.0,1.0)}),
    sliceSupportGap:     newInput(LANG.sp_gaps_s, {title:LANG.sp_gaps_l, convert:toInt,   bound:bound(0,5)}),
    sliceSupportOffset:  newInput(LANG.sp_offs_s, {title:LANG.sp_offs_l, convert:toFloat, bound:bound(0.0,200.0)}),
    sliceSupportExtra:   newInput(LANG.sp_xpnd_s, {title:LANG.sp_xpnd_l, convert:toFloat, bound:bound(0.0,10.0)}),
    sliceSupportSpan:    newInput(LANG.sp_span_s, {title:LANG.sp_span_l, convert:toFloat, bound:bound(0.0,200.0), show:() => ui.sliceSupportEnable.checked }),
    separator:           newBlank({ class:"set-sep", driven }),
    sliceSupportOutline: newBoolean(LANG.sp_outl_s, onBooleanClick, {title:LANG.sp_outl_l, xshow: () => !isTree() }),
    separator:           newBlank({ class:"set-sep", driven, show:manualSupport }),
    sliceSupportManual: newRow([
        (ui.ssmAdd = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-plus"></i>'})),
        (ui.ssmDun = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-check"></i>'})),
        (ui.ssmClr = newButton(undefined, onButtonClick, {icon:'<i class="fas fa-trash-alt"></i>'}))
    ], {class:"ext-buttons f-row", show:manualSupport}),
    _____:               newGroup(LANG.fl_menu, $('fdm-base'), { modes:FDM, driven, hideable, separator, group:"fdm-base" }),
    firstSliceHeight:    newInput(LANG.fl_lahi_s, {title:LANG.fl_lahi_l, convert:toFloat, show:isNotBelt}),
    firstLayerNozzleTemp:newInput(LANG.fl_nozl_s, {title:LANG.fl_nozl_l, convert:toInt,   show:isNotBelt}),
    firstLayerBedTemp:   newInput(LANG.fl_bedd_s, {title:LANG.fl_bedd_l, convert:toInt,   show:isNotBelt}),
    separator:           newBlank({ class:"set-sep", driven }),
    firstLayerFanSpeed:  newInput(LANG.ou_fans_s, {title:LANG.ou_fans_l, convert:toInt,   bound:bound(0,255), show:isBelt}),
    firstLayerYOffset:   newInput(LANG.fl_zoff_s, {title:LANG.fl_zoff_l, convert:toFloat, show:isBelt}),
    firstLayerFlatten:   newInput(LANG.fl_flat_s, {title:LANG.fl_flat_l, convert:toFloat, show:isBelt}),
    firstLayerBeltFact:  newInput(LANG.fl_mult_s, {title:LANG.fl_mult_l, convert:toFloat, bound:bound(0, 2), show:isBelt}),
    firstLayerRate:      newInput(LANG.fl_rate_s, {title:LANG.fl_rate_l, convert:toFloat}),
    firstLayerFillRate:  newInput(LANG.fl_frat_s, {title:LANG.fl_frat_l, convert:toFloat, show:isNotBelt}),
    separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
    firstLayerBrim:      newInput(LANG.fl_brim_s, {title:LANG.fl_brim_l, convert:toInt,   show:isBelt}),
    firstLayerBrimIn:    newInput(LANG.fl_brin_s, {title:LANG.fl_brin_l, convert:toInt,   show:isBelt}),
    firstLayerBrimTrig:  newInput(LANG.fl_brmn_s, {title:LANG.fl_brmn_l, convert:toInt,   show:isBelt}),
    firstLayerBrimGap:   newInput(LANG.fl_brgp_s, {title:LANG.fl_brgp_l, convert:toFloat, show:isBelt}),
    separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
    firstLayerBeltLead:  newInput(LANG.fl_bled_s, {title:LANG.fl_bled_l, convert:toFloat, show:isBelt}),
    firstLayerBeltBump:  newInput(LANG.fl_blmp_s, {title:LANG.fl_blmp_l, convert:toFloat, bound:bound(0, 10), show:isBelt}),
    separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
    outputBrimCount:     newInput(LANG.fl_skrt_s, {title:LANG.fl_skrt_l, convert:toInt,   show:isNotBelt}),
    outputBrimOffset:    newInput(LANG.fl_skro_s, {title:LANG.fl_skro_l, convert:toFloat, show:isNotBelt}),
    outputRaftSpacing:   newInput(LANG.fr_spac_s, {title:LANG.fr_spac_l, convert:toFloat, bound:bound(0.0,3.0), show:() => ui.outputRaft.checked && isNotBelt() }),
    separator:           newBlank({ class:"set-sep", driven, show:isNotBelt }),
    outputRaft:          newBoolean(LANG.fr_nabl_s, onBooleanClick, {title:LANG.fr_nabl_l, trigger, show:() => isNotBelt()}),
    _____:               newGroup(LANG.ou_menu, $('fdm-output'), { modes:FDM, driven, hideable, separator, group:"fdm-out" }),
    outputFeedrate:      newInput(LANG.ou_feed_s, {title:LANG.ou_feed_l, convert:toInt}),
    outputFinishrate:    newInput(LANG.ou_fini_s, {title:LANG.ou_fini_l, convert:toInt}),
    outputSeekrate:      newInput(LANG.ou_move_s, {title:LANG.ou_move_l, convert:toInt}),
    separator:           newBlank({ class:"set-sep", driven }),
    outputShellMult:     newInput(LANG.ou_shml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
    outputFillMult:      newInput(LANG.ou_flml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
    outputSparseMult:    newInput(LANG.ou_spml_s, {title:LANG.ou_exml_l, convert:toFloat, bound:bound(0.0,2.0)}),
    separator:           newBlank({ class:"set-sep", driven }),
    outputRetractDist:   newInput(LANG.ad_rdst_s, {title:LANG.ad_rdst_l, convert:toFloat, show:notFwRetract}),
    outputRetractSpeed:  newInput(LANG.ad_rrat_s, {title:LANG.ad_rrat_l, convert:toInt,   show:notFwRetract}),
    outputRetractWipe:   newInput(LANG.ad_wpln_s, {title:LANG.ad_wpln_l, convert:toFloat, bound:bound(0.0,10)}),
    separator:           newBlank({ class:"set-sep", driven }),
    fdmArcEnabled:       newBoolean(LANG.cx_arce_s, onBooleanClick, { title:LANG.cx_arce_l }),
    fdmArcTolerance:     newInput(LANG.cx_arct_s, {title:LANG.cx_arct_l, convert:toFloat, bound:bound(0,100), trigger, show:() => ui.fdmArcEnabled.checked}),
    fdmArcResolution:    newInput(LANG.cx_arcr_s, {title:LANG.cx_arcr_l, convert:toFloat, bound:bound(0,180), trigger, show:() => ui.fdmArcEnabled.checked}),
    separator:           newBlank({ class:"set-sep", driven, show:() => ui.fdmArcEnabled.checked}),
    outputAvoidGaps:     newBoolean(LANG.ad_agap_s, onBooleanClick, {title:LANG.ad_agap_l}),
    sliceSolidify:       newBoolean(LANG.ad_sold_s, onBooleanClick, {title:LANG.ad_sold_l}),
    separator:           newBlank({ class:"set-sep", driven, show:isBelt }),
    outputBeltFirst:     newBoolean(LANG.ad_lbir_s, onBooleanClick, {title:LANG.ad_lbir_l, show:isBelt}),
    _____:               newGroup(LANG.ad_menu, $('fdm-expert'), { modes:FDM, driven, hideable, separator, group:"fdm-xprt" }),
    sliceAngle:          newInput(LANG.sl_angl_s, {title:LANG.sl_angl_l, convert:toFloat, show:isBelt}),
    antiBacklash:        newInput(LANG.ad_abkl_s, {title:LANG.ad_abkl_l, convert:toFloat, bound:bound(0,3)}),
    outputRetractDwell:  newInput(LANG.ad_rdwl_s, {title:LANG.ad_rdwl_l, convert:toInt}),
    outputMinSpeed:      newInput(LANG.ad_mins_s, {title:LANG.ad_mins_l, convert:toFloat, bound:bound(1,200)}),
    outputMaxFlowrate:   newInput(LANG.ad_maxf_s, {title:LANG.ad_maxf_l, convert:toFloat, bound:bound(1,200)}),
    outputPurgeTower:    newInput(LANG.ad_purg_s, {title:LANG.ad_purg_l, convert:toInt,   bound:bound(0,1000)}),
    outputScarfLength:   newInput(LANG.ad_scar_s, {title:LANG.ad_scar_l, convert:toFloat, bound:bound(0,1000)}),
    outputShortPoly:     newInput(LANG.ad_spol_s, {title:LANG.ad_spol_l, convert:toFloat, bound:bound(0,10000)}),
    outputCoastDist:     newInput(LANG.ad_scst_s, {title:LANG.ad_scst_l, convert:toFloat, bound:bound(0.0,10)}),
    sliceCompInner:      newInput(LANG.sl_ofin_s, {title:LANG.sl_ofin_l, convert:toFloat, bound:bound(-10.0,10.0)}),
    sliceCompOuter:      newInput(LANG.sl_ofot_s, {title:LANG.sl_ofot_l, convert:toFloat, bound:bound(-10.0,10.0)}),
    zHopDistance:        newInput(LANG.ad_zhop_s, {title:LANG.ad_zhop_l, convert:toFloat, bound:bound(0,3.0)}),
    outputLoops:         newInput(LANG.ag_loop_s, {title:LANG.ag_loop_l, convert:toInt,   bound:bound(-1,1000), show:isBelt}),

    fdmRanges:    $('fdm-ranges'),

    };
}
